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
 *
 * Safety posture: the route only reads. Git runs with prompts, hooks, optional
 * index writes and lazy fetches disabled, an argument whitelist is fixed here
 * (the caller supplies only a directory, a commit hash and a count), output is
 * byte-capped, every command has a deadline, and cross-origin browser requests
 * are refused.
 */

import { execFile } from 'node:child_process'
import { readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Required host services: the browser HTTP carrier. */
export const inject = ['webServer']

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

/** Dispatch one request under the route prefix. */
async function handle(req, res, connection) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sub = url.pathname.slice(ROUTE.length)
  const methodAllowed = sub === '/write'
    ? req.method === 'POST'
    : (req.method === 'GET' || req.method === 'HEAD')
  if (!methodAllowed) {
    send(res, 405, { error: 'method not allowed' })
    return
  }
  // Named routes sit ahead of the API carrier's own gate, so this route asks the
  // connection service for the same browser-session cookie check the page uses.
  // Profiles without a connection service (desktop shells) skip it.
  if (connection !== undefined && typeof connection.authorizeIndex === 'function') {
    if (connection.authorizeIndex(req, res) !== true) return
  }
  // Same-origin guard: a browser cross-site request carries a foreign Origin.
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== 'null') {
    let originHost = null
    try { originHost = new URL(origin).host } catch (_badOrigin) { originHost = null }
    if (originHost === null || originHost !== req.headers.host) {
      send(res, 403, { error: 'cross-origin request refused' })
      return
    }
  }
  const path = url.searchParams.get('path') ?? ''
  try {
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
    send(res, 404, { error: 'unknown endpoint' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 500, { error: message })
  }
}

/**
 * Register the panel's read-only Git route for this plugin's lifetime.
 * @param ctx - host root context carrying the browser HTTP carrier.
 */
export { locateInside, readStatusTree, receiveWrite, sendAsset, sendFileDiff, sendImage, sendStat }

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => { void handle(req, res, ctx.get('connection')) },
  }), 'code-viewer: /plugins/code-viewer route')
}
