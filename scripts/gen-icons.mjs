#!/usr/bin/env node
/**
 * Regenerate the inlined Material Icon Theme subset used by `client.js`.
 *
 * Usage:
 *   npm pack material-icon-theme@5.40.0 && tar -xzf material-icon-theme-*.tgz
 *   node scripts/gen-icons.mjs ./package > /tmp/icons-block.js
 *   # paste the block into client.js above the "panel" section
 *
 * The theme is MIT-licensed (see LICENSE-material-icon-theme); this script only
 * selects a subset and minifies it, so the panel renders without network or a
 * second host route.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (root === undefined) {
  console.error('usage: node scripts/gen-icons.mjs <material-icon-theme package dir>')
  process.exit(2)
}

const theme = JSON.parse(readFileSync(join(root, 'dist/material-icons.json'), 'utf8'))
const light = theme.light || {}
const readIcon = (key) => readFileSync(join(root, 'icons', `${key}.svg`), 'utf8')
  .replace(/>\s+</gu, '><').replace(/\s{2,}/gu, ' ').trim()

const EXTS = ('js jsx mjs cjs ts tsx mts cts json jsonc py pyi pyw sh bash zsh fish css scss sass less ' +
  'yml yaml toml ini conf env go rs java kt kts cpp cxx cc hpp hxx hh ipp tpp ino c h cs sql rb md markdown mdx ' +
  'html htm xml svg png jpg jpeg gif webp ico pdf txt log lock csproj sln gradle proto graphql gql vue svelte php ' +
  'lua dart swift zip tar gz woff woff2 ttf mp3 mp4 ipynb csv tex hs ex erl clj elm r jl vim').split(' ')
const NAMES = ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'tsconfig.json', 'jsconfig.json',
  'dockerfile', 'docker-compose.yml', 'makefile', 'cmakelists.txt', 'readme.md', 'readme', 'license', 'license.md',
  'license.txt', '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig', '.npmrc', '.prettierrc', '.eslintrc',
  '.eslintrc.json', '.babelrc', 'vite.config.ts', 'webpack.config.js', 'jest.config.js', '.env.local', 'gemfile',
  'procfile', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', '.python-version', '.nvmrc']
const FOLDERS = ['.git', '.github', 'node_modules', 'src', 'dist', 'build', 'test', 'tests', 'docs', '.vscode',
  'locales', 'assets', 'config', 'packages', 'api', 'components', 'styles', 'types', 'utils', 'scripts', 'public']

const ext = {}
for (const key of EXTS) if ((theme.fileExtensions || {})[key]) ext[key] = theme.fileExtensions[key]
const names = {}
for (const key of NAMES) if ((theme.fileNames || {})[key]) names[key] = theme.fileNames[key]
const folder = {}
const folderOpen = {}
for (const key of FOLDERS) {
  if ((theme.folderNames || {})[key]) folder[key] = theme.folderNames[key]
  if ((theme.folderNamesExpanded || {})[key]) folderOpen[key] = theme.folderNamesExpanded[key]
}

const used = new Set(['file', 'folder', 'folder-open', ...Object.values(ext), ...Object.values(names),
  ...Object.values(folder), ...Object.values(folderOpen)])
const lightVariant = {}
for (const [table, map] of [['fileExtensions', ext], ['fileNames', names], ['folderNames', folder]]) {
  for (const [key, value] of Object.entries(map)) {
    const candidate = (light[table] || {})[key]
    if (candidate !== undefined && candidate !== value) lightVariant[value] = candidate
  }
}
for (const value of Object.values(lightVariant)) used.add(value)

const svgs = {}
for (const key of [...used].sort()) svgs[key] = readIcon(key)

const lines = []
lines.push('    /* ---------------------------------------------------------- file icons')
lines.push('     * Artwork: Material Icon Theme 5.40.0 — MIT License.')
lines.push('     * Copyright (c) 2025 Material Extensions.')
lines.push('     * https://github.com/material-extensions/vscode-material-icon-theme')
lines.push('     * Vendored subset: file, folder, and default glyphs, inlined as data URLs.')
lines.push('     */')
lines.push('    const ICON_SVG = {')
for (const [key, svg] of Object.entries(svgs)) lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(svg)},`)
lines.push('    }')
lines.push(`    const EXT_ICON = ${JSON.stringify(ext)}`)
lines.push(`    const NAME_ICON = ${JSON.stringify(names)}`)
lines.push(`    const FOLDER_ICON = ${JSON.stringify(folder)}`)
lines.push(`    const FOLDER_OPEN_ICON = ${JSON.stringify(folderOpen)}`)
lines.push(`    const LIGHT_ICON = ${JSON.stringify(lightVariant)}`)
console.log(lines.join('\n'))
