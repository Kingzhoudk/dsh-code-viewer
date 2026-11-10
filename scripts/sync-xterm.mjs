#!/usr/bin/env node
/**
 * Copy the vendored xterm runtime into the plugin.
 *
 * Usage: node scripts/sync-xterm.mjs /path/to/node_modules/@xterm/xterm
 *
 * The runtime is MIT; its license travels with the copy in vendor/LICENSE-xterm.
 */
import { copyFile, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const source = process.argv[2]
if (source === undefined) {
  console.error('usage: node scripts/sync-xterm.mjs <@xterm/xterm package dir>')
  process.exit(1)
}

const packageJson = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
for (const [from, to] of [
  ['lib/xterm.mjs', 'xterm.mjs'],
  ['css/xterm.css', 'xterm.css'],
  ['LICENSE', 'LICENSE-xterm'],
]) {
  await copyFile(join(source, from), join(root, 'vendor', to))
  const info = await stat(join(root, 'vendor', to))
  console.log(`${to.padEnd(16)} ${String(info.size).padStart(8)} bytes`)
}
await writeFile(join(root, 'vendor', 'VERSION'), `@xterm/xterm ${packageJson.version}\n`)
console.log(`vendored @xterm/xterm ${packageJson.version}`)
