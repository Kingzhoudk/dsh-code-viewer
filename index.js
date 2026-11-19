/**
 * dsh-code-viewer — host half.
 *
 * Browser route for the panel: Git history, image bytes, vendored assets, and
 * conflict-checked saves. File *reads* still come from the shipped,
 * session-authorized `remote.workspaceFiles` service; everything else has no
 * shipped host face, so this plugin adds it under its own prefix route.
 *
 * Endpoints (all GET, JSON, same origin):
 *   /plugins/code-viewer/repo?path=<abs dir>              repository identity
 *   /plugins/code-viewer/log?path=<abs dir>&limit=<n>     commit graph data
 *   /plugins/code-viewer/commit?path=<abs dir>&hash=<h>   one commit's diff
 *   /plugins/code-viewer/status?path=<abs dir>            working-tree changes
 *   /plugins/code-viewer/file?path=<abs dir>&rel=<rel>    one image inside that directory
 *   /plugins/code-viewer/asset?name=<name>                vendored browser assets (xterm)
 *   /plugins/code-viewer/stat?path=<abs dir>&rel=<rel>    one file's mtime and size
 *   POST /plugins/code-viewer/write                      save one text file (conflict-checked)
 *   /plugins/code-viewer/fileDiff?path=<abs dir>&rel=<rel>  working-tree line marks vs HEAD
 *   /plugins/code-viewer/search?path=<abs dir>&q=<text>  workspace text/regex search (rg, Node fallback)
 *   /plugins/code-viewer/files?path=<abs dir>            workspace file index for quick open
 *   POST /plugins/code-viewer/replace                    replace across the workspace or one file
 *
 * Safety posture: every request passes the connection service's fence first
 * (`ctx.connection.requestRejection`: the Host/DNS-rebinding and Origin checks
 * plus browser or API credential admission that `/api` uses), before the method
 * check and any file or Git work. Git runs with prompts, hooks, optional index
 * writes and lazy fetches disabled, an argument whitelist is fixed here (the
 * caller supplies only a directory, a commit hash and a count), output is
 * byte-capped, and every command has a deadline.
 */

import { execFile, spawn } from 'node:child_process'
import { cp, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Required host services: the browser HTTP carrier and its request trust fence. */
export const inject = ['webServer', 'connection']

/** The panel's route prefix. */
const ROUTE = '/plugins/code-viewer'

/** Image types the panel renders; the route serves nothing else. */
const IMAGE_TYPES = {
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

/** Browser assets this plugin vendors; the route serves nothing else. */
const ASSETS = {
  'xterm.mjs': ['xterm.mjs', 'text/javascript; charset=utf-8'],
  'xterm.css': ['xterm.css', 'text/css; charset=utf-8'],
}

/** Refuse image reads larger than this; the browser decodes them in memory. */
const IMAGE_LIMIT = 32 * 1024 * 1024
/** Refuse save bodies larger than this. */
const WRITE_LIMIT = 8 * 1024 * 1024

/** Arguments before every subcommand: no index refresh writes, hooks, or filesystem monitor. */
const GIT_PREFIX = ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false']

/** A scrubbed Git environment: no prompts, no lazy fetches, stable C locale. */
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_LAZY_FETCH: '1',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
}

/** One Git command's deadline. */
const TIMEOUT_MS = 8000

/** Captured stdout/stderr cap for one command. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/** Patch text returned for one commit, in characters. */
const MAX_PATCH_CHARS = 400000

/** Largest accepted commit count. */
const MAX_COMMITS = 400

/** Workspace search: caps shared by the rg path and the Node fallback. */
const SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024
const SEARCH_DEFAULT_MATCHES = 2000
const SEARCH_MAX_MATCHES = 5000
const SEARCH_MAX_RESULT_FILES = 500
const SEARCH_MAX_TEXT = 400
const SEARCH_TIMEOUT_MS = 8000
const FILES_DEFAULT = 20000
const FILES_MAX = 50000
const REPLACE_MAX_FILES = 200
const REPLACE_MAX_MATCHES = 5000

/** Directories the panel hides; search and the file index skip them too. */
const WALK_IGNORED = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', '__pycache__',
  '.venv', 'venv', '.idea', '.turbo', '.cache',
])

/** rg globs for the same directories (relative to the search root). */
const SEARCH_EXCLUDES = [...WALK_IGNORED].map((name) => `!**/${name}/**`)

/** Field and record separators of the log format below. */
const FS = '\u001f'
const RS = '\u001e'

/** JSON response helper. */
function send(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/** One Git invocation in `cwd`; resolves with stdout or rejects with a diagnostic. */
function git(cwd, args) {
  return new Promise((resolvePromise, reject) => {
    execFile('git', [...GIT_PREFIX, ...args], {
      cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env: GIT_ENV, windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error === null) {
        resolvePromise(stdout)
        return
      }
      const detail = typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : error.message
      reject(new Error(detail))
    })
  })
}

/** Resolve and validate the requested working directory. */
async function requireDirectory(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error('missing path')
  if (!isAbsolute(raw)) throw new Error('path must be absolute')
  const path = resolve(raw)
  const info = await stat(path)
  if (!info.isDirectory()) throw new Error('path is not a directory')
  return path
}

/** The repository root that contains `cwd`, or a diagnostic when there is none. */
async function requireRepository(cwd) {
  try {
    const top = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (top === '') throw new Error('not a git repository')
    return top
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`not a git repository: ${reason}`)
  }
}

/** Current branch and head of one repository. */
async function readRepoInfo(root) {
  let branch = null
  let detached = false
  try {
    branch = (await git(root, ['symbolic-ref', '--short', '-q', 'HEAD'])).trim() || null
  } catch (_detached) {
    detached = true
  }
  let hash = null
  try {
    hash = (await git(root, ['rev-parse', '--short', 'HEAD'])).trim() || null
  } catch (_empty) {
    /* A repository without commits has no HEAD to name. */
  }
  if (branch === null) {
    detached = hash !== null
  }
  return { repo: root, branch, detached, head: hash }
}

/** Parse the log record stream into commit records. */
function parseLog(text) {
  const commits = []
  for (const record of text.split(RS)) {
    const trimmed = record.replace(/^\n/u, '')
    if (trimmed === '') continue
    const fields = trimmed.split(FS)
    if (fields.length < 6) continue
    const parents = fields[1] === '' ? [] : fields[1].trim().split(' ').filter(Boolean)
    const refs = fields[4].split(',').map(part => part.trim()).filter(part => part !== '')
    const date = Number.parseInt(fields[3], 10)
    commits.push({
      hash: fields[0],
      parents,
      author: fields[2],
      email: fields[5] ?? '',
      date: Number.isFinite(date) ? date : 0,
      subject: fields[6] ?? '',
      refs,
    })
  }
  return commits
}

/** One commit's metadata, numstat and patch. */
async function readCommit(root, hash) {
  const meta = (await git(root, ['show', '-s', `--format=%H${FS}%P${FS}%an${FS}%ae${FS}%at${FS}%s`, hash])).trim()
  const metaFields = meta.split(FS)
  const parents = (metaFields[1] ?? '') === '' ? [] : metaFields[1].trim().split(' ').filter(Boolean)
  let numstat = ''
  try {
    numstat = await git(root, ['show', '--numstat', '--format=', '--no-renames', hash])
  } catch (_noStat) {
    numstat = ''
  }
  if (numstat.trim() === '' && parents.length > 0) {
    try {
      numstat = await git(root, ['diff', '--numstat', '--no-renames', `${hash}^`, hash])
    } catch (_noStat) {
      numstat = ''
    }
  }
  const files = []
  for (const line of numstat.split('\n')) {
    if (line.trim() === '') continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const added = parts[0] === '-' ? null : Number.parseInt(parts[0], 10)
    const removed = parts[1] === '-' ? null : Number.parseInt(parts[1], 10)
    files.push({ path: parts[2], additions: Number.isFinite(added) ? added : null, deletions: Number.isFinite(removed) ? removed : null })
  }
  let patch = ''
  try {
    patch = await git(root, ['show', '--patch', '--format=', '--no-color', '--no-ext-diff', '--no-renames', hash])
  } catch (_noPatch) {
    patch = ''
  }
  if (patch.trim() === '' && parents.length > 0) {
    try {
      patch = await git(root, ['diff', '--patch', '--no-color', '--no-ext-diff', '--no-renames', `${hash}^`, hash])
    } catch (_noPatch) {
      patch = ''
    }
  }
  const truncated = patch.length > MAX_PATCH_CHARS
  return {
    hash: metaFields[0] ?? hash,
    parents,
    author: metaFields[2] ?? '',
    email: metaFields[3] ?? '',
    date: Number.parseInt(metaFields[4] ?? '0', 10) || 0,
    subject: metaFields[5] ?? '',
    files,
    patch: truncated ? patch.slice(0, MAX_PATCH_CHARS) : patch,
    truncated,
  }
}

/** Working-tree changes as `{ path, status }`, rename sources dropped. */
async function readStatus(root) {
  const output = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])
  const entries = output.split('\u0000')
  const files = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry === '') continue
    const status = entry.slice(0, 2)
    const path = entry.slice(3)
    if (path === '') continue
    files.push({ path, status })
    // A rename/copy entry is followed by its original path as the next record.
    if (status.startsWith('R') || status.startsWith('C')) index += 1
  }
  return files
}

/**
 * Serve one vendored browser asset by whitelisted name.
 * @param res - response for the asset.
 * @param name - exact key in {@link ASSETS}.
 */
async function sendAsset(res, name) {
  const entry = Object.prototype.hasOwnProperty.call(ASSETS, name) ? ASSETS[name] : undefined
  if (entry === undefined) { send(res, 404, { error: 'unknown asset' }); return }
  const bytes = await readFile(fileURLToPath(new URL(`./vendor/${entry[0]}`, import.meta.url)))
  res.writeHead(200, {
    'content-type': entry[1],
    'content-length': bytes.length,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  })
  res.end(bytes)
}

/**
 * Serve one image from the session directory.
 *
 * Only known image extensions are served, the resolved path must stay inside
 * `root`, and the response is marked `sandbox` so an SVG opened directly in a
 * tab cannot run script on this origin.
 * @param res - response for the image.
 * @param root - absolute directory the browser may read from.
 * @param rel - path relative to `root`.
 */
async function sendImage(res, root, rel) {
  if (typeof rel !== 'string' || rel === '') { send(res, 400, { error: 'missing rel' }); return }
  const target = resolve(root, rel)
  if (target !== root && !target.startsWith(`${root}${sep}`)) { send(res, 403, { error: 'path outside the workspace' }); return }
  const type = IMAGE_TYPES[extname(target).toLowerCase().slice(1)]
  if (type === undefined) { send(res, 415, { error: 'not an image' }); return }
  let info
  try {
    info = await stat(target)
  } catch (_missing) {
    send(res, 404, { error: 'image not found' })
    return
  }
  if (!info.isFile()) { send(res, 404, { error: 'image not found' }); return }
  if (info.size > IMAGE_LIMIT) { send(res, 413, { error: 'image too large' }); return }
  // A symlink may point outside the workspace; serve only what resolves inside it.
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${sep}`)) {
    send(res, 403, { error: 'path outside the workspace' })
    return
  }
  const bytes = await readFile(realTarget)
  res.writeHead(200, {
    'content-type': type,
    'content-length': bytes.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    'content-disposition': 'inline',
  })
  res.end(bytes)
}

/** Resolve `rel` inside `root`, refusing traversal and symlinks that leave it. */
async function locateInside(root, rel) {
  if (typeof rel !== 'string' || rel === '') return undefined
  const target = resolve(root, rel)
  if (target !== root && !target.startsWith(`${root}${sep}`)) return undefined
  let real
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
    if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${sep}`)) return undefined
    real = realTarget
  } catch (_missing) {
    return undefined
  }
  const info = await stat(real).catch(() => undefined)
  return info === undefined ? undefined : { target: real, info }
}

/** One file's change token for the editor's conflict check. */
async function sendStat(res, root, rel) {
  const found = await locateInside(root, rel)
  if (found === undefined || !found.info.isFile()) { send(res, 404, { error: 'file not found' }); return }
  send(res, 200, { mtime: found.info.mtimeMs, bytes: found.info.size })
}

/** Read a JSON body with a hard byte cap. */
async function readJsonBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('body too large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (_notJson) {
    const error = new Error('body must be JSON')
    error.status = 400
    throw error
  }
}

/**
 * Save one existing text file.
 *
 * The path must resolve inside the session directory, `.git` internals are
 * refused, and a stale `baseMtime` is answered with 409 so an external edit is
 * never overwritten silently.
 */
async function receiveWrite(res, req, root) {
  let body
  try {
    body = await readJsonBody(req, WRITE_LIMIT)
  } catch (error) {
    send(res, error.status === undefined ? 400 : error.status, { error: error instanceof Error ? error.message : String(error) })
    return
  }
  if (body === null || typeof body !== 'object') { send(res, 400, { error: 'missing body' }); return }
  if (typeof body.text !== 'string') { send(res, 400, { error: 'missing text' }); return }
  const rel = body.rel
  if (typeof rel !== 'string' || rel.split(/[\\/]+/u).includes('.git')) {
    send(res, 403, { error: 'path outside the workspace' })
    return
  }
  const found = await locateInside(root, rel)
  if (found === undefined || !found.info.isFile()) { send(res, 404, { error: 'file not found' }); return }
  const base = typeof body.baseMtime === 'number' && Number.isFinite(body.baseMtime) ? body.baseMtime : undefined
  if (base !== undefined && Math.abs(found.info.mtimeMs - base) > 1) {
    send(res, 409, { error: 'file changed on disk', mtime: found.info.mtimeMs })
    return
  }
  try {
    await writeFile(found.target, body.text, 'utf8')
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) })
    return
  }
  const after = await stat(found.target).catch(() => undefined)
  send(res, 200, {
    ok: true,
    mtime: after === undefined ? Date.now() : after.mtimeMs,
    bytes: Buffer.byteLength(body.text),
  })
}

/** Repo-relative POSIX path when `target` sits inside `root`, else null. */
function relativePath(root, target) {
  const value = relative(root, target)
  if (value === '' || value.startsWith('..') || isAbsolute(value)) return null
  return value.split(sep).join('/')
}

/** Hunk header of a zero-context diff: `@@ -a,b +c,d @@`. */
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u

/**
 * Changed line numbers of one working-tree file compared with HEAD.
 *
 * Zero context keeps the payload small: each hunk names the new-file range it
 * covers, so the editor can dot those line numbers. A file Git does not track
 * reports `untracked` and the editor marks every line.
 */
async function sendFileDiff(res, root, rel) {
  const found = await locateInside(root, rel)
  if (found === undefined || !found.info.isFile()) { send(res, 404, { error: 'file not found' }); return }
  let repo
  try {
    repo = (await git(dirname(found.target), ['rev-parse', '--show-toplevel'])).trim()
  } catch (_notRepo) {
    send(res, 200, { repo: false, tracked: false, hunks: [] })
    return
  }
  const relative = relativePath(repo, found.target)
  if (relative === null) { send(res, 200, { repo: false, tracked: false, hunks: [] }); return }
  let tracked = true
  try {
    await git(repo, ['ls-files', '--error-unmatch', '--', relative])
  } catch (_untracked) {
    tracked = false
  }
  if (!tracked) { send(res, 200, { repo: true, tracked: false, hunks: [] }); return }
  let patch = ''
  try {
    patch = await git(repo, ['diff', '--no-color', '--unified=0', '--no-ext-diff', '--no-renames', '--', relative])
  } catch (_noDiff) {
    patch = ''
  }
  const hunks = []
  for (const line of patch.split('\n')) {
    const match = HUNK.exec(line)
    if (match === null) continue
    const oldCount = match[2] === undefined ? 1 : Number(match[2])
    const newStart = Number(match[3])
    const newCount = match[4] === undefined ? 1 : Number(match[4])
    if (newCount > 0) {
      hunks.push({ start: newStart, count: newCount, kind: oldCount === 0 ? 'added' : 'modified' })
    } else {
      hunks.push({ start: Math.max(1, newStart), count: 1, kind: 'deleted' })
    }
    if (hunks.length >= 2000) break
  }
  send(res, 200, { repo: true, tracked: true, hunks })
}

/**
 * Working-tree marks for files under `dir`, with paths relative to `dir`.
 *
 * A normal workspace is inside one repository and only its subtree counts. A
 * workspace that merely *contains* repositories (monorepo-of-repos layouts)
 * gets each direct child repository's marks, prefixed by the child name.
 */
async function readStatusTree(dir) {
  try {
    const root = await requireRepository(dir)
    const relative = relativePath(root, resolve(dir))
    const files = await readStatus(root)
    if (relative === null) return files
    const prefix = relative === '' ? '' : `${relative}/`
    return files
      .filter((file) => prefix === '' || file.path.startsWith(prefix))
      .map((file) => ({ ...file, path: prefix === '' ? file.path : file.path.slice(prefix.length) }))
  } catch (_noRepo) {
    // fall through: the workspace contains repositories instead of being one
  }
  const files = []
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (_unreadable) {
    return files
  }
  let scanned = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue
    if (scanned >= 40) break
    scanned += 1
    const child = resolve(dir, entry.name)
    let childRoot
    try {
      childRoot = (await git(child, ['rev-parse', '--show-toplevel'])).trim()
    } catch (_childNoRepo) {
      continue
    }
    let childReal
    let rootReal
    try {
      childReal = await realpath(child)
      rootReal = await realpath(childRoot)
    } catch (_badPath) {
      continue
    }
    if (childReal !== rootReal) continue
    try {
      for (const file of await readStatus(childRoot)) {
        files.push({ ...file, path: `${entry.name}/${file.path}` })
      }
    } catch (_childStatus) { /* skip this repository */ }
  }
  return files
}

/** A relative path the panel refuses to touch: traversal, `.git` internals, empty segments. */
function isRefusedRel(rel) {
  if (typeof rel !== 'string' || rel === '') return true
  if (rel.startsWith('/') || rel.includes('\\') || /^[A-Za-z]:/u.test(rel)) return true
  return rel.split('/').some((segment) => segment === '' || segment === '.' || segment === '..' || segment === '.git')
}

/** Whether a not-yet-existing target's parent resolves inside the workspace. */
async function parentInside(root, target) {
  const realRoot = await realpath(root)
  const parent = await realpath(dirname(target)).catch(() => undefined)
  if (parent === undefined) return false
  return parent === realRoot || parent.startsWith(`${realRoot}${sep}`)
}

/** Map a filesystem failure onto the panel's status codes. */
function sendOperationError(res, error) {
  const code = error === null || error === undefined ? undefined : error.code
  const status = code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'ERR_FS_CP_EEXIST' ? 409
    : code === 'ENOENT' ? 404
      : code === 'EINVAL' ? 400
        : code === 'EACCES' || code === 'EPERM' ? 403
          : 500
  send(res, status, { error: error instanceof Error ? error.message : String(error) })
}

/** Create one file or directory inside the workspace. */
async function createEntry(root, rel, kind) {
  if (isRefusedRel(rel)) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  const target = resolve(root, rel)
  if (!target.startsWith(`${root}${sep}`)) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  if (!(await parentInside(root, target))) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  if (kind === 'dir') await mkdir(target)
  else await writeFile(target, '', { flag: 'wx' })
}

/** Rename one entry inside its own directory. */
async function renameEntry(root, rel, name) {
  if (isRefusedRel(rel)) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || /[\\/]/u.test(name) || name === '.git') {
    throw Object.assign(new Error('invalid name'), { code: 'EINVAL' })
  }
  const found = await locateInside(root, rel)
  if (found === undefined) throw Object.assign(new Error('file not found'), { code: 'ENOENT' })
  const dest = join(dirname(found.target), name)
  if (!(await parentInside(root, dest))) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  const clash = await stat(dest).catch(() => undefined)
  if (clash !== undefined) throw Object.assign(new Error('target exists'), { code: 'EEXIST' })
  await rename(found.target, dest)
}

/** Delete one file or directory (recursive) inside the workspace. */
async function deleteEntry(root, rel) {
  if (isRefusedRel(rel)) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  const found = await locateInside(root, rel)
  if (found === undefined) throw Object.assign(new Error('file not found'), { code: 'ENOENT' })
  if (found.target === (await realpath(root))) throw Object.assign(new Error('refusing to delete the workspace root'), { code: 'EACCES' })
  await rm(found.target, { recursive: true, force: false })
}

/** Copy or move one entry into a workspace directory. */
async function copyEntry(root, rel, toDir, move) {
  if (isRefusedRel(rel)) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  const found = await locateInside(root, rel)
  if (found === undefined) throw Object.assign(new Error('file not found'), { code: 'ENOENT' })
  const destination = typeof toDir === 'string' && toDir !== '' ? toDir : ''
  if (destination !== '' && isRefusedRel(destination)) throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  const destDir = destination === '' ? root : resolve(root, destination)
  const realRoot = await realpath(root)
  const realDest = await realpath(destDir).catch(() => undefined)
  if (realDest === undefined || (realDest !== realRoot && !realDest.startsWith(`${realRoot}${sep}`))) {
    throw Object.assign(new Error('path outside the workspace'), { code: 'EACCES' })
  }
  const destInfo = await stat(realDest)
  if (!destInfo.isDirectory()) throw Object.assign(new Error('target is not a directory'), { code: 'EINVAL' })
  const dest = join(realDest, basename(found.target))
  if (dest === found.target) throw Object.assign(new Error('source and target are the same'), { code: 'EINVAL' })
  if (found.info.isDirectory() && dest.startsWith(`${found.target}${sep}`)) {
    throw Object.assign(new Error('cannot copy a folder into itself'), { code: 'EINVAL' })
  }
  const clash = await stat(dest).catch(() => undefined)
  if (clash !== undefined) throw Object.assign(new Error('target exists'), { code: 'EEXIST' })
  if (move) { await rename(found.target, dest); return }
  await cp(found.target, dest, { recursive: true, errorOnExist: true, force: false })
}

/** Open the entry's folder in the platform file manager. */
async function revealEntry(root, rel) {
  const found = await locateInside(root, rel)
  if (found === undefined) throw Object.assign(new Error('file not found'), { code: 'ENOENT' })
  const dir = found.info.isDirectory() ? found.target : dirname(found.target)
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open'
  await new Promise((resolve, reject) => {
    const child = spawn(command, [dir], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

/** One file operation request from the panel's context menu. */
async function receiveFileOperation(res, req, root, operation) {
  let body
  try {
    body = await readJsonBody(req, 64 * 1024)
  } catch (error) {
    send(res, error.status === undefined ? 400 : error.status, { error: error instanceof Error ? error.message : String(error) })
    return
  }
  if (body === null || typeof body !== 'object') { send(res, 400, { error: 'missing body' }); return }
  try {
    if (operation === 'mkdir') await createEntry(root, body.rel, 'dir')
    else if (operation === 'touch') await createEntry(root, body.rel, 'file')
    else if (operation === 'rename') await renameEntry(root, body.rel, body.name)
    else if (operation === 'delete') await deleteEntry(root, body.rel)
    else if (operation === 'copy') await copyEntry(root, body.rel, body.toDir, body.move === true)
    else if (operation === 'reveal') await revealEntry(root, body.rel)
    else { send(res, 404, { error: 'unknown operation' }); return }
    send(res, 200, { ok: true })
  } catch (error) {
    sendOperationError(res, error)
  }
}

/* ------------------------------------------------------------------ search */

/** A caller error answered with 4xx instead of 500. */
function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

/** Parse a bounded positive integer query parameter. */
function clampInt(raw, fallback, maximum) {
  const value = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return Math.min(fallback, maximum)
  return Math.min(value, maximum)
}

/** POSIX form of one workspace-relative path. */
function normalizeRel(value) {
  return String(value).replace(/\\/gu, '/').replace(/^\.\//u, '')
}

/** Escape one literal for use inside a regular expression. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Compile the "files to include" filter into rg globs and a matcher over
 * workspace-relative paths. Up to four comma-separated globs.
 */
function parseIncludes(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { globs: [], matchers: [] }
  const parts = raw.split(',').map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length > 4) throw badRequest('at most four include globs')
  const globs = []
  const matchers = []
  for (const part of parts) {
    if (part.length > 200) throw badRequest('include glob is too long')
    if (part.startsWith('!') || isAbsolute(part) || part.split(/[\\/]+/u).includes('..')) {
      throw badRequest('include globs must be relative and positive')
    }
    const pattern = normalizeRel(part)
    globs.push(pattern)
    matchers.push(globToRegExp(pattern))
  }
  return { globs, matchers }
}

/** Minimal glob (`*`, `**`, `?`) to a matcher over workspace-relative paths. */
function globToRegExp(pattern) {
  let source = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegExp(char)
    }
  }
  const body = pattern.includes('/') ? `^${source}$` : `(?:^|/)${source}$`
  return new RegExp(body, 'u')
}

/** Build the shared query matcher; `g` so replacement and counting agree. */
function compileQuery(options) {
  let source = options.regex ? options.query : escapeRegExp(options.query)
  if (options.wholeWord) source = `\\b(?:${source})\\b`
  const flags = options.caseSensitive ? 'gu' : 'giu'
  try {
    return new RegExp(source, flags)
  } catch (_invalid) {
    throw badRequest('invalid regular expression')
  }
}

/** Count matches without letting a zero-width pattern spin forever. */
function countMatches(pattern, text) {
  let count = 0
  pattern.lastIndex = 0
  let match = pattern.exec(text)
  while (match !== null) {
    count += 1
    if (count >= SEARCH_MAX_MATCHES) break
    if (match[0] === '') pattern.lastIndex += 1
    match = pattern.exec(text)
  }
  pattern.lastIndex = 0
  return count
}

/** Decode the column of a byte offset in one line (rg reports bytes). */
function columnOf(line, byteStart) {
  try {
    const bytes = Buffer.from(line, 'utf8')
    return bytes.subarray(0, Math.max(0, Math.min(byteStart, bytes.length))).toString('utf8').length + 1
  } catch (_unreadable) {
    return byteStart + 1
  }
}

/** One line, stripped of carriage returns and ANSI and clipped for transport. */
function searchLineText(value) {
  const text = String(value).replace(/\u001b\[[0-9;]*m/gu, '').replace(/\r$/u, '')
  return text.length > SEARCH_MAX_TEXT ? `${text.slice(0, SEARCH_MAX_TEXT)}…` : text
}

/** Validate the query parameters shared by search and replace. */
function readSearchOptions(params) {
  const query = params.get('q') ?? ''
  if (query === '' || query.length > 500) throw badRequest('q must be 1..500 characters')
  if (query.includes('\n')) throw badRequest('q must be a single line')
  const { globs, matchers } = parseIncludes(params.get('include') ?? '')
  return {
    query,
    regex: params.get('regex') === '1',
    caseSensitive: params.get('case') === '1',
    wholeWord: params.get('word') === '1',
    includeGlobs: globs,
    includeMatchers: matchers,
    max: clampInt(params.get('max'), SEARCH_DEFAULT_MATCHES, SEARCH_MAX_MATCHES),
  }
}

/** Run one rg invocation with a deadline and a byte cap. */
function runRg(root, args) {
  return new Promise((resolvePromise) => {
    let child
    try {
      child = spawn('rg', args, {
        cwd: root,
        env: { ...process.env, LC_ALL: 'C' },
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
    } catch (_spawnFailed) {
      resolvePromise({ missing: true })
      return
    }
    const chunks = []
    let size = 0
    let settled = false
    let timer = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      try { child.kill('SIGKILL') } catch (_gone) { /* already exited */ }
      resolvePromise(value)
    }
    timer = setTimeout(() => finish({ ok: false, timeout: true }), SEARCH_TIMEOUT_MS)
    child.once('error', () => finish({ missing: true }))
    child.stdout.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_OUTPUT_BYTES) {
        finish({ ok: true, text: Buffer.concat(chunks).toString('utf8'), truncated: true, code: 0 })
        return
      }
      chunks.push(chunk)
    })
    child.once('close', (code) => {
      finish({ ok: true, text: Buffer.concat(chunks).toString('utf8'), truncated: false, code })
    })
  })
}

/** rg argv for one search; every caller-supplied part is validated already. */
function rgSearchArgs(options) {
  const args = ['--json', '--hidden', '--no-config', '--no-messages', '--max-filesize', '2M']
  for (const glob of SEARCH_EXCLUDES) args.push('--glob', glob)
  args.push(options.caseSensitive ? '--case-sensitive' : '--ignore-case')
  if (options.wholeWord) args.push('--word-regexp')
  if (!options.regex) args.push('--fixed-strings')
  for (const glob of options.includeGlobs) args.push('--glob', glob)
  args.push('-e', options.query, '.')
  return args
}

/** Parse `rg --json` output into the panel's grouped shape. */
function parseRgMatches(text, options) {
  const grouped = new Map()
  let totalMatches = 0
  let truncated = false
  for (const line of text.split('\n')) {
    if (line === '' || line[0] !== '{') continue
    let record
    try { record = JSON.parse(line) } catch (_partial) { continue }
    if (record === null || record.type !== 'match' || record.data === undefined) continue
    const data = record.data
    const rawPath = data.path !== undefined && data.path.text !== undefined ? data.path.text : ''
    const rel = normalizeRel(rawPath)
    if (rel === '' || rel.split('/').includes('.git')) continue
    const body = data.lines !== undefined && typeof data.lines.text === 'string' ? data.lines.text : ''
    const lineText = searchLineText(body)
    const lineNumber = Number(data.line_number)
    if (!Number.isFinite(lineNumber)) continue
    const submatches = Array.isArray(data.submatches) ? data.submatches : []
    if (submatches.length === 0) continue
    let bucket = grouped.get(rel)
    if (bucket === undefined) {
      if (grouped.size >= SEARCH_MAX_RESULT_FILES) { truncated = true; break }
      bucket = []
      grouped.set(rel, bucket)
    }
    for (const submatch of submatches) {
      if (totalMatches >= options.max) { truncated = true; break }
      bucket.push({
        line: lineNumber,
        column: columnOf(body, Number(submatch.start) || 0),
        text: lineText,
      })
      totalMatches += 1
    }
    if (totalMatches >= options.max) { truncated = true; break }
  }
  return {
    files: [...grouped].map(([path, matches]) => ({ path, matches })),
    totalMatches,
    truncated,
  }
}

/** Every non-ignored regular file under `root`, relative and POSIX-shaped. */
async function walkWorkspace(root, options) {
  const files = []
  let truncated = false
  const stack = ['']
  const maxFiles = options.maxFiles === undefined ? FILES_MAX : options.maxFiles
  while (stack.length > 0) {
    const dirRel = stack.pop()
    let entries = []
    try {
      entries = await readdir(dirRel === '' ? root : resolve(root, dirRel), { withFileTypes: true })
    } catch (_unreadable) {
      continue
    }
    for (const entry of entries) {
      const rel = dirRel === '' ? entry.name : `${dirRel}/${entry.name}`
      if (entry.isDirectory()) {
        if (WALK_IGNORED.has(entry.name)) continue
        stack.push(rel)
        continue
      }
      if (!entry.isFile() || entry.name === '.DS_Store') continue
      if (files.length >= maxFiles) { truncated = true; break }
      files.push(rel)
    }
    if (truncated) break
  }
  return { files, truncated }
}

/** Node fallback: read files line by line and match with the compiled query. */
async function searchWithNode(root, options) {
  const pattern = compileQuery(options)
  const walked = await walkWorkspace(root, { maxFiles: FILES_MAX })
  const files = []
  let totalMatches = 0
  let truncated = walked.truncated
  for (const rel of walked.files) {
    if (options.includeMatchers.length > 0 && !options.includeMatchers.some((matcher) => matcher.test(rel))) continue
    if (totalMatches >= options.max) { truncated = true; break }
    const absolute = resolve(root, rel)
    let info
    try { info = await stat(absolute) } catch (_missing) { continue }
    if (!info.isFile() || info.size > SEARCH_MAX_FILE_BYTES) continue
    let buffer
    try { buffer = await readFile(absolute) } catch (_unreadable) { continue }
    if (buffer.includes(0)) continue
    const text = buffer.toString('utf8')
    const matches = []
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].replace(/\r$/u, '')
      if (line === '') continue
      pattern.lastIndex = 0
      let match = pattern.exec(line)
      while (match !== null) {
        if (matches.length + totalMatches >= options.max) { truncated = true; break }
        matches.push({ line: index + 1, column: match.index + 1, text: searchLineText(line) })
        if (match[0] === '') pattern.lastIndex += 1
        match = pattern.exec(line)
      }
      if (truncated) break
    }
    pattern.lastIndex = 0
    if (matches.length > 0) {
      if (files.length >= SEARCH_MAX_RESULT_FILES) { truncated = true; break }
      files.push({ path: rel, matches })
      totalMatches += matches.length
    }
  }
  return { engine: 'node', files, totalMatches, truncated }
}

/**
 * Search one workspace for text or a regular expression.
 *
 * rg carries the fast path (and honours .gitignore); a cancelled or missing rg
 * falls back to a bounded Node walk. Results are grouped by file and capped.
 */
async function searchWorkspace(root, options) {
  const query = options.query
  const shared = {
    query,
    regex: options.regex === true,
    caseSensitive: options.caseSensitive === true,
    wholeWord: options.wholeWord === true,
    includeGlobs: Array.isArray(options.includeGlobs) ? options.includeGlobs : [],
    includeMatchers: Array.isArray(options.includeMatchers) ? options.includeMatchers : [],
    max: clampInt(options.max, SEARCH_DEFAULT_MATCHES, SEARCH_MAX_MATCHES),
  }
  if (shared.query === undefined || typeof shared.query !== 'string' || shared.query === '' || shared.query.length > 500) {
    throw badRequest('q must be 1..500 characters')
  }
  if (options.forceNode !== true) {
    const rg = await runRg(root, rgSearchArgs(shared))
    if (rg.missing !== true && rg.ok === true && (rg.text !== '' || rg.code === 0 || rg.code === 1)) {
      const parsed = parseRgMatches(rg.text, shared)
      return {
        engine: 'rg',
        files: parsed.files,
        totalMatches: parsed.totalMatches,
        truncated: parsed.truncated || rg.truncated === true,
      }
    }
  }
  return searchWithNode(root, shared)
}

/** Every workspace file, for the quick-open index. */
async function indexWorkspaceFiles(root, options) {
  const max = clampInt(options.max, FILES_DEFAULT, FILES_MAX)
  if (options.forceNode !== true) {
    const args = ['--files', '--hidden', '--no-config', '--no-messages']
    for (const glob of SEARCH_EXCLUDES) args.push('--glob', glob)
    const rg = await runRg(root, args)
    if (rg.missing !== true && rg.ok === true && (rg.text !== '' || rg.code === 0 || rg.code === 1)) {
      const files = []
      let truncated = rg.truncated === true
      for (const line of rg.text.split('\n')) {
        if (line === '') continue
        const rel = normalizeRel(line)
        if (rel === '' || rel.split('/').includes('.git')) continue
        if (files.length >= max) { truncated = true; break }
        files.push(rel)
      }
      files.sort()
      return { engine: 'rg', files, truncated }
    }
  }
  const walked = await walkWorkspace(root, { maxFiles: max })
  const files = walked.files.filter((rel) => !rel.split('/').includes('.git')).sort()
  return { engine: 'node', files, truncated: walked.truncated }
}

/**
 * Replace every occurrence in the workspace, or in one file.
 *
 * Candidate files come from the same search the panel just ran, so the query,
 * options and filters agree. Each file is re-read, size/binary checked, refused
 * when outside the workspace or inside `.git`, and rewritten only when the text
 * actually changes.
 */
async function replaceWorkspace(root, options) {
  const query = options.query
  if (typeof query !== 'string' || query === '' || query.length > 500) throw badRequest('q must be 1..500 characters')
  if (typeof options.replacement !== 'string' || options.replacement.length > 2000) {
    throw badRequest('replacement must be a string of at most 2000 characters')
  }
  const pattern = compileQuery({
    query,
    regex: options.regex === true,
    caseSensitive: options.caseSensitive === true,
    wholeWord: options.wholeWord === true,
  })
  const includeMatchers = Array.isArray(options.includeMatchers) ? options.includeMatchers : []
  const explicit = typeof options.file === 'string' && options.file !== '' ? normalizeRel(options.file) : null
  let candidates = []
  let truncated = false
  let engine = 'node'
  if (explicit !== null) {
    candidates = [explicit]
  } else {
    const found = await searchWorkspace(root, {
      query,
      regex: options.regex === true,
      caseSensitive: options.caseSensitive === true,
      wholeWord: options.wholeWord === true,
      includeGlobs: Array.isArray(options.includeGlobs) ? options.includeGlobs : [],
      includeMatchers,
      max: REPLACE_MAX_MATCHES,
    })
    candidates = found.files.map((file) => file.path)
    truncated = found.truncated === true
    engine = found.engine
    if (candidates.length > REPLACE_MAX_FILES) {
      candidates = candidates.slice(0, REPLACE_MAX_FILES)
      truncated = true
    }
  }
  const changed = []
  const skipped = []
  let totalReplacements = 0
  for (const rel of candidates) {
    if (totalReplacements >= REPLACE_MAX_MATCHES) { truncated = true; break }
    if (isRefusedRel(rel)) {
      skipped.push({ rel, reason: 'outside' })
      continue
    }
    if (includeMatchers.length > 0 && !includeMatchers.some((matcher) => matcher.test(rel))) {
      skipped.push({ rel, reason: 'filtered' })
      continue
    }
    const found = await locateInside(root, rel)
    if (found === undefined) { skipped.push({ rel, reason: 'not-found' }); continue }
    if (!found.info.isFile()) { skipped.push({ rel, reason: 'not-found' }); continue }
    if (found.info.size > SEARCH_MAX_FILE_BYTES) { skipped.push({ rel, reason: 'large' }); continue }
    let buffer
    try { buffer = await readFile(found.target) } catch (_unreadable) { skipped.push({ rel, reason: 'not-found' }); continue }
    if (buffer.includes(0)) { skipped.push({ rel, reason: 'binary' }); continue }
    const text = buffer.toString('utf8')
    const count = Math.min(countMatches(pattern, text), REPLACE_MAX_MATCHES - totalReplacements)
    if (count === 0) { skipped.push({ rel, reason: 'unchanged' }); continue }
    const next = text.replace(pattern, () => options.replacement)
    pattern.lastIndex = 0
    if (Buffer.byteLength(next) > WRITE_LIMIT) { skipped.push({ rel, reason: 'large' }); continue }
    try {
      await writeFile(found.target, next, 'utf8')
    } catch (error) {
      skipped.push({ rel, reason: 'error', detail: error instanceof Error ? error.message : String(error) })
      continue
    }
    changed.push({ rel, count })
    totalReplacements += count
  }
  return { engine, totalReplacements, changed, skipped, truncated }
}

/** Validate one replacement request body (everything but the path is in JSON). */
function readReplaceOptions(body) {
  if (body === null || typeof body !== 'object') throw badRequest('missing body')
  const query = typeof body.q === 'string' ? body.q : ''
  if (query === '' || query.length > 500) throw badRequest('q must be 1..500 characters')
  if (query.includes('\n')) throw badRequest('q must be a single line')
  if (typeof body.replacement !== 'string' || body.replacement.length > 2000) {
    throw badRequest('replacement must be a string of at most 2000 characters')
  }
  const { globs, matchers } = parseIncludes(typeof body.include === 'string' ? body.include : '')
  const file = typeof body.file === 'string' && body.file !== '' ? body.file : undefined
  if (file !== undefined) {
    if (file.length > 500) throw badRequest('file path is too long')
    if (isRefusedRel(normalizeRel(file))) throw badRequest('file must be inside the workspace')
  }
  return {
    query,
    replacement: body.replacement,
    regex: body.regex === true || body.regex === '1',
    caseSensitive: body.case === true || body.case === '1',
    wholeWord: body.word === true || body.word === '1',
    includeGlobs: globs,
    includeMatchers: matchers,
    max: SEARCH_MAX_MATCHES,
    file,
  }
}

/** Dispatch one request under the route prefix. */
async function handle(req, res, connection) {
  // Named routes sit ahead of the API carrier's own gate, so the fence comes
  // first: the connection service applies the Host (DNS-rebinding) and Origin
  // checks plus browser or API credential admission that every other Web route
  // gets. Without that service the route cannot be authenticated, so it refuses
  // instead of serving an unprotected surface.
  if (connection === undefined || typeof connection.requestRejection !== 'function') {
    send(res, 401, { error: 'connection service unavailable' })
    return
  }
  const refused = connection.requestRejection(req)
  if (refused !== undefined) {
    res.statusCode = refused
    res.setHeader('cache-control', 'no-store')
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sub = url.pathname.slice(ROUTE.length)
  const postEndpoints = new Set(['/write', '/mkdir', '/touch', '/rename', '/delete', '/copy', '/reveal', '/replace'])
  const methodAllowed = postEndpoints.has(sub)
    ? req.method === 'POST'
    : (req.method === 'GET' || req.method === 'HEAD')
  if (!methodAllowed) {
    send(res, 405, { error: 'method not allowed' })
    return
  }
  const path = url.searchParams.get('path') ?? ''
  try {
    if (sub === '/search') {
      const root = await requireDirectory(path)
      send(res, 200, await searchWorkspace(root, readSearchOptions(url.searchParams)))
      return
    }
    if (sub === '/files') {
      const root = await requireDirectory(path)
      send(res, 200, await indexWorkspaceFiles(root, { max: url.searchParams.get('max') }))
      return
    }
    if (sub === '/repo') {
      const root = await requireRepository(await requireDirectory(path))
      send(res, 200, await readRepoInfo(root))
      return
    }
    if (sub === '/log') {
      const root = await requireRepository(await requireDirectory(path))
      const requested = Number.parseInt(url.searchParams.get('limit') ?? '200', 10)
      const limit = Math.min(MAX_COMMITS, Math.max(1, Number.isFinite(requested) ? requested : 200))
      const info = await readRepoInfo(root)
      let commits = []
      try {
        const output = await git(root, [
          'log', '--all', '--date-order', `--max-count=${limit}`,
          `--pretty=format:%H${FS}%P${FS}%an${FS}%at${FS}%D${FS}%ae${FS}%s${RS}`,
        ])
        commits = parseLog(output)
      } catch (error) {
        // An empty repository has no commits to log; the panel shows its empty state.
        const message = error instanceof Error ? error.message : String(error)
        if (!/does not have any commits|unknown revision|ambiguous argument 'HEAD'/iu.test(message)) throw error
      }
      send(res, 200, { ...info, commits, truncated: commits.length >= limit })
      return
    }
    if (sub === '/commit') {
      const root = await requireRepository(await requireDirectory(path))
      const hash = url.searchParams.get('hash') ?? ''
      if (!/^[0-9a-f]{4,40}$/iu.test(hash)) {
        send(res, 400, { error: 'invalid commit hash' })
        return
      }
      send(res, 200, await readCommit(root, hash))
      return
    }
    if (sub === '/status') {
      const dir = await requireDirectory(path)
      let repo = dir
      try { repo = await requireRepository(dir) } catch (_noRepo) { repo = dir }
      send(res, 200, { repo, files: await readStatusTree(dir) })
      return
    }
    if (sub === '/file') {
      await sendImage(res, await requireDirectory(path), url.searchParams.get('rel') ?? '')
      return
    }
    if (sub === '/asset') {
      await sendAsset(res, url.searchParams.get('name') ?? '')
      return
    }
    if (sub === '/stat') {
      await sendStat(res, await requireDirectory(path), url.searchParams.get('rel') ?? '')
      return
    }
    if (sub === '/fileDiff') {
      await sendFileDiff(res, await requireDirectory(path), url.searchParams.get('rel') ?? '')
      return
    }
    if (sub === '/write') {
      await receiveWrite(res, req, await requireDirectory(path))
      return
    }
    if (sub === '/replace') {
      const root = await requireDirectory(path)
      let body
      try {
        body = await readJsonBody(req, 64 * 1024)
      } catch (error) {
        send(res, error.status === undefined ? 400 : error.status, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      send(res, 200, await replaceWorkspace(root, readReplaceOptions(body)))
      return
    }
    if (sub === '/mkdir' || sub === '/touch' || sub === '/rename' || sub === '/delete' || sub === '/copy' || sub === '/reveal') {
      const dir = await requireDirectory(path)
      await receiveFileOperation(res, req, dir, sub.slice(1))
      return
    }
    send(res, 404, { error: 'unknown endpoint' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, typeof error.status === 'number' ? error.status : 500, { error: message })
  }
}

/**
 * Register the panel's read-only Git route for this plugin's lifetime.
 * @param ctx - host root context carrying the browser HTTP carrier.
 */
export { handle, indexWorkspaceFiles, locateInside, readStatusTree, receiveFileOperation, receiveWrite, replaceWorkspace, searchWorkspace, sendAsset, sendFileDiff, sendImage, sendStat }

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => { void handle(req, res, ctx.get('connection')) },
  }), 'code-viewer: /plugins/code-viewer route')
}
