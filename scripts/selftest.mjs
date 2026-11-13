/**
 * Offline self-test for dsh-code-viewer.
 *
 *   node scripts/selftest.mjs
 *
 * Covers the workspace search / file-index / replace helpers and their HTTP
 * dispatch (no DSH host needed), then evaluates the browser bundle with a stub
 * module loader to prove it still parses and exports `apply`.
 *
 * No dependencies, no network, temporary fixtures only.
 */

import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

import { handle, indexWorkspaceFiles, replaceWorkspace, searchWorkspace } from '../index.js'

let failed = 0
let passed = 0

/** Run one async assertion block and keep going after a failure. */
async function test(name, body) {
  try {
    await body()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.stack : error)
  }
}

/** Build one throwaway workspace with text, binary, large and ignored files. */
async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'codeide-selftest-'))
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
  await mkdir(join(root, '.git'), { recursive: true })
  await writeFile(join(root, 'a.txt'), 'alpha beta\nalpha again\nGamma\n')
  await writeFile(join(root, 'src', 'b.js'), 'const alpha = 1\n// alpha two\nnone\n')
  await writeFile(join(root, 'docs', 'readme.md'), 'Beta alpha\n')
  await writeFile(join(root, 'node_modules', 'pkg', 'x.js'), 'alpha\n')
  await writeFile(join(root, '.git', 'config'), 'alpha\n')
  await writeFile(join(root, 'bin.dat'), Buffer.concat([Buffer.from([0x61, 0x6c, 0x70, 0x68, 0x61, 0x00]), Buffer.from('alpha')]))
  await writeFile(join(root, 'big.txt'), `${'x'.repeat(2 * 1024 * 1024 + 16)}\nalpha\n`)
  await writeFile(join(root, 'empty.txt'), '')
  return root
}

/** A minimal fake ServerResponse collecting the JSON body. */
function fakeResponse() {
  return {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers },
    end(text) { this.body = text },
  }
}

/** A minimal fake IncomingMessage; `body` is serialized as the request stream. */
function fakeRequest(url, method = 'GET', body = undefined) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    url,
    method,
    headers: { host: 'localhost' },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
}

/** Dispatch one request through the real handler and decode its JSON answer. */
async function dispatch(url, method = 'GET', body = undefined) {
  const res = fakeResponse()
  await handle(fakeRequest(url, method, body), res, undefined)
  return { status: res.statusCode, body: res.body === '' ? null : JSON.parse(res.body) }
}

/** Total matches across a search response. */
function matchCount(result) {
  return result.files.reduce((sum, file) => sum + file.matches.length, 0)
}

/** Sorted relative paths of a search response. */
function searchedPaths(result) {
  return result.files.map((file) => file.path).sort()
}

const base = await makeFixture()
const replaceRoot = await makeFixture()

try {
  await test('search: literal query finds matches and skips ignored, binary and large files', async () => {
    const result = await searchWorkspace(base, { query: 'alpha' })
    assert.equal(result.totalMatches, 5)
    assert.equal(matchCount(result), 5)
    assert.deepEqual(searchedPaths(result), ['a.txt', 'docs/readme.md', 'src/b.js'])
    assert.equal(result.truncated, false)
    for (const file of result.files) {
      for (const match of file.matches) {
        assert.ok(match.line >= 1)
        assert.ok(match.column >= 1)
        assert.ok(match.text.includes('alpha'))
      }
    }
  })

  await test('search: case sensitivity and whole-word flags', async () => {
    const insensitive = await searchWorkspace(base, { query: 'ALPHA' })
    assert.equal(insensitive.totalMatches, 5)
    const sensitive = await searchWorkspace(base, { query: 'ALPHA', caseSensitive: true })
    assert.equal(sensitive.totalMatches, 0)
    const wordMiss = await searchWorkspace(base, { query: 'alph', wholeWord: true })
    assert.equal(wordMiss.totalMatches, 0)
    const wordHit = await searchWorkspace(base, { query: 'alpha', wholeWord: true })
    assert.equal(wordHit.totalMatches, 5)
  })

  await test('search: regex mode', async () => {
    const result = await searchWorkspace(base, { query: 'alp.a', regex: true })
    assert.equal(result.totalMatches, 5)
    await assert.rejects(() => searchWorkspace(base, { query: '(', regex: true }), /invalid regular expression/u)
  })

  await test('search: include glob narrows the file set', async () => {
    const jsOnly = await searchWorkspace(base, { query: 'alpha', includeGlobs: ['src/**'], includeMatchers: [/^src\/.*$/u] })
    assert.deepEqual(searchedPaths(jsOnly), ['src/b.js'])
    assert.equal(jsOnly.totalMatches, 2)
  })

  await test('search: Node fallback returns the same answer as rg', async () => {
    const result = await searchWorkspace(base, { query: 'alpha', forceNode: true })
    assert.equal(result.engine, 'node')
    assert.equal(result.totalMatches, 5)
    assert.deepEqual(searchedPaths(result), ['a.txt', 'docs/readme.md', 'src/b.js'])
  })

  await test('search: max truncates and says so', async () => {
    const result = await searchWorkspace(base, { query: 'alpha', max: 2 })
    assert.equal(result.totalMatches, 2)
    assert.equal(result.truncated, true)
  })

  await test('files: index lists workspace files and skips ignored directories', async () => {
    const result = await indexWorkspaceFiles(base, { max: 100 })
    assert.deepEqual(result.files, ['a.txt', 'big.txt', 'bin.dat', 'docs/readme.md', 'empty.txt', 'src/b.js'])
    assert.equal(result.truncated, false)
    const node = await indexWorkspaceFiles(base, { max: 100, forceNode: true })
    assert.deepEqual(node.files, result.files)
  })

  await test('files: index truncates at max', async () => {
    const result = await indexWorkspaceFiles(base, { max: 2 })
    assert.equal(result.files.length, 2)
    assert.equal(result.truncated, true)
  })

  await test('replace: replaces every occurrence and reports counts', async () => {
    const result = await replaceWorkspace(replaceRoot, { query: 'alpha', replacement: 'ALPHA' })
    assert.equal(result.totalReplacements, 5)
    assert.deepEqual(result.changed.map((file) => file.rel).sort(), ['a.txt', 'docs/readme.md', 'src/b.js'])
    assert.ok(result.changed.every((file) => file.count > 0))
    const a = await readFile(join(replaceRoot, 'a.txt'), 'utf8')
    assert.equal(a, 'ALPHA beta\nALPHA again\nGamma\n')
    const ignored = await readFile(join(replaceRoot, 'node_modules', 'pkg', 'x.js'), 'utf8')
    assert.equal(ignored, 'alpha\n')
    const git = await readFile(join(replaceRoot, '.git', 'config'), 'utf8')
    assert.equal(git, 'alpha\n')
  })

  await test('replace: a single file is scoped correctly', async () => {
    const result = await replaceWorkspace(replaceRoot, { query: 'ALPHA', replacement: 'alpha', file: 'a.txt' })
    assert.equal(result.totalReplacements, 2)
    assert.deepEqual(result.changed, [{ rel: 'a.txt', count: 2 }])
    assert.equal(await readFile(join(replaceRoot, 'a.txt'), 'utf8'), 'alpha beta\nalpha again\nGamma\n')
  })

  await test('replace: binary, large and missing targets are skipped with reasons', async () => {
    const binary = await replaceWorkspace(replaceRoot, { query: 'alpha', replacement: 'x', file: 'bin.dat' })
    assert.deepEqual(binary.skipped, [{ rel: 'bin.dat', reason: 'binary' }])
    const large = await replaceWorkspace(replaceRoot, { query: 'alpha', replacement: 'x', file: 'big.txt' })
    assert.deepEqual(large.skipped.map((entry) => entry.reason), ['large'])
    const missing = await replaceWorkspace(replaceRoot, { query: 'alpha', replacement: 'x', file: 'nope.txt' })
    assert.deepEqual(missing.skipped.map((entry) => entry.reason), ['not-found'])
  })

  await test('dispatch: /search, /files and POST /replace answer JSON', async () => {
    const search = await dispatch(`/plugins/code-viewer/search?path=${encodeURIComponent(base)}&q=alpha`)
    assert.equal(search.status, 200)
    assert.equal(search.body.totalMatches, 5)
    const files = await dispatch(`/plugins/code-viewer/files?path=${encodeURIComponent(base)}&max=10`)
    assert.equal(files.status, 200)
    assert.ok(Array.isArray(files.body.files))
    const replaced = await dispatch(
      `/plugins/code-viewer/replace?path=${encodeURIComponent(replaceRoot)}`,
      'POST',
      { q: 'Gamma', replacement: 'delta' },
    )
    assert.equal(replaced.status, 200)
    assert.equal(replaced.body.totalReplacements, 1)
  })

  await test('dispatch: bad input is a 4xx, not a 500', async () => {
    const badRegex = await dispatch(`/plugins/code-viewer/search?path=${encodeURIComponent(base)}&q=%28&regex=1`)
    assert.equal(badRegex.status, 400)
    const missingQuery = await dispatch(`/plugins/code-viewer/search?path=${encodeURIComponent(base)}`)
    assert.equal(missingQuery.status, 400)
    const escape = await dispatch(`/plugins/code-viewer/search?path=${encodeURIComponent(base)}&q=alpha&include=${encodeURIComponent('../etc')}`)
    assert.equal(escape.status, 400)
  })

  await test('client bundle: evaluates with a stub loader and exports apply', async () => {
    const code = await readFile(new URL('../client.js', import.meta.url), 'utf8')
    const loaded = []
    const previousWindow = globalThis.window
    globalThis.window = { __ModuleLoader__: { load: (entry) => { loaded.push(entry) } } }
    try {
      vm.runInThisContext(code, { filename: 'client.js' })
      assert.equal(loaded.length, 1)
      const stub = {
        createElement: () => null,
        useCallback: (fn) => fn,
        useEffect: () => undefined,
        useMemo: (fn) => fn(),
        useRef: (value) => ({ current: value }),
        useState: (value) => [value, () => undefined],
      }
      const exported = loaded[0].factory((id) => {
        if (id === 'react') return stub
        throw new Error(`unexpected require: ${id}`)
      })
      assert.equal(typeof exported.apply, 'function')
      for (const service of ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'shortcuts', 'sessions', 'remote']) {
        assert.ok(exported.inject.includes(service), `inject is missing ${service}`)
      }
    } finally {
      globalThis.window = previousWindow
    }
  })

  await test('client panel: renders editor, search and palette states with stub hooks', async () => {
    const code = await readFile(new URL('../client.js', import.meta.url), 'utf8')
    const loaded = []
    const previousWindow = globalThis.window
    const previousDocument = globalThis.document
    let script = []
    let cursor = 0
    const stub = {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useCallback: (fn) => fn,
      useEffect: () => undefined,
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [cursor < script.length ? script[cursor++] : value, () => undefined],
    }
    globalThis.window = {
      __ModuleLoader__: { load: (entry) => { loaded.push(entry) } },
      confirm: () => true,
      addEventListener() {},
      removeEventListener() {},
    }
    globalThis.document = {
      activeElement: null,
      body: { classList: {}, style: {} },
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} },
      addEventListener() {},
      removeEventListener() {},
    }
    try {
      vm.runInThisContext(code, { filename: 'client.js' })
      let Panel = null
      const pluginCtx = {
        effect(fn) { fn() },
        locale: { register() {}, bind: () => (key) => key },
        sidebarRightTabs: { register() {} },
        slots: {
          inject: (name, fn) => fn(),
          register: (spec, component) => { Panel = component; return () => {} },
        },
        shortcuts: { platform: 'windows', register() {} },
        sidebarRight: {
          commandTarget: () => undefined,
          openTabs: { getSnapshot: () => [] },
          openTabFromTarget() {},
          isExpanded: () => true,
          toggleExpanded() {},
          focus() {},
        },
        sessions: {},
        remote: { workspaceFiles: {} },
      }
      loaded[0].factory((id) => { if (id === 'react') return stub; throw new Error(`unexpected require: ${id}`) }).apply(pluginCtx)
      assert.equal(typeof Panel, 'function')
      const props = {
        t: (key) => key,
        sessionId: 's1',
        useSessions: (selector) => selector({ byId: {} }),
        useTabInfo: () => ({ tab: { id: 'tab-1' } }),
        inputActions: {},
      }
      const tab = { id: 1, path: 'src/a.js', name: 'a.js', snapshot: {} }
      const doc = { status: 'ready', path: 'src/a.js', text: 'const a = 1\n', lines: 2, eof: true, bytes: 12 }
      const search = {
        status: 'ready', query: 'alpha', replacement: 'x', regex: false, caseSensitive: false, word: false,
        include: '', files: [{ path: 'a.txt', matches: [{ line: 1, column: 1, text: 'alpha beta' }] }],
        totalMatches: 1, truncated: false, engine: 'rg', error: null, report: null, replacing: false, ranQuery: 'alpha',
      }
      const baseStates = [
        'files', null, { '': true }, {}, { status: 'idle' }, { status: 'idle' }, { status: 'idle' },
        { status: 'idle' }, null, [], null, false, 'render', true, 0, true, 260, 200, true, null,
        false, '', null, 'idle', null, null, null, {}, false, [], null, search, null,
        { status: 'ready', cwd: '/w', files: ['a.txt', 'src/a.js'], truncated: false, error: null },
      ]
      const render = (states) => {
        script = states
        cursor = 0
        const tree = Panel(props)
        assert.equal(tree.props.className, 'dcv-root')
      }
      render(baseStates)
      const editorStates = [...baseStates]
      editorStates[1] = { path: 'src/a.js', name: 'a.js' }
      editorStates[4] = doc
      editorStates[21] = 'const a = 1\n'
      editorStates[22] = 1
      editorStates[29] = [tab]
      editorStates[30] = 1
      render(editorStates)
      const searchStates = [...baseStates]
      searchStates[0] = 'search'
      render(searchStates)
      const paletteStates = [...editorStates]
      paletteStates[32] = { mode: 'files', query: 'a', index: 0 }
      render(paletteStates)
      const previewStates = [...editorStates]
      previewStates[29] = [{ ...tab, preview: true }]
      render(previewStates)
      const tabMenuStates = [...editorStates]
      tabMenuStates[25] = { x: 12, y: 12, kind: 'tab', id: 1 }
      render(tabMenuStates)
      const commandStates = [...baseStates]
      commandStates[32] = { mode: 'commands', query: 'save', index: 0 }
      commandStates[33] = { status: 'idle', cwd: null, files: [], truncated: false, error: null }
      render(commandStates)
    } finally {
      globalThis.window = previousWindow
      globalThis.document = previousDocument
    }
  })

  // The replacement fixture must still be loadable after the tests above.
  await test('fixture: replacement did not corrupt file metadata', async () => {
    const info = await stat(join(replaceRoot, 'a.txt'))
    assert.ok(info.size > 0)
  })
} finally {
  await rm(base, { recursive: true, force: true })
  await rm(replaceRoot, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
