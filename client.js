/**
 * dsh-code-viewer — browser half.
 *
 * One right-Sidebar tab type (`code`) that draws a VS Code-shaped page:
 *
 *   +-----------------------------------------------+
 *   | header: title · branch · [Files][Git] [⇢] [↻] |
 *   +----------------+------------------------------+
 *   | workspace tree | file content | commit graph   |
 *   | (lazy folders) | (line numbers, tokens) | diff |
 *   +----------------+------------------------------+
 *
 * File reads ride the shipped, session-authorized `remote.workspaceFiles`
 * service. Git history rides this bundle's own read-only host route. One
 * shortcut opens the page when it is closed and, once it is open, inserts an
 * `@file` reference for the file on screen into the composer at the caret.
 *
 * The bundle is plain JavaScript: React comes from the browser module table,
 * styles are component-owned CSS using only `--dsw-*` theme tokens, and no
 * Harness client package is imported.
 */
window.__ModuleLoader__.load({
  id: 'dsh-code-viewer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'codeViewer'
    const KIND = 'code'
    const ID = 'dsh-code-viewer'
    const API = '/plugins/code-viewer'

    /** Folders and files hidden unless the tree's filter control is on. */
    const IGNORED = new Set([
      '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', 'target',
      '__pycache__', '.venv', 'venv', '.idea', '.DS_Store', '.turbo', '.cache',
    ])

    const EN = {
      'type.label': 'CodeIDE',
      'guide.title': 'CodeIDE',
      'guide.description': 'File tree on the left, file content on the right, plus a read-only Git graph.',
      'panel.title': 'Code',
      'tab.files': 'Files',
      'tab.graph': 'Git graph',
      'tree.workspace': 'Workspace',
      'tree.loading': 'Loading…',
      'tree.empty': 'Empty folder',
      'tree.showIgnored': 'Show ignored folders',
      'tree.hideIgnored': 'Hide ignored folders',
      'tree.error': 'Cannot read this folder',
      'action.reload': 'Reload',
      'action.reference': 'Reference this file in the composer',
      'action.referenceShort': 'Reference',
      'action.retry': 'Retry',
      'action.reloadTree': 'Reload the folder',
      'md.render': 'Rendered',
      'md.source': 'Source',
      'json.pretty': 'Pretty',
      'json.raw': 'Raw',
      'json.invalid': 'Invalid JSON; cannot format',
      'json.tooLarge': 'Too large to format',
      'empty.pickFile': 'Pick a file in the tree',
      'empty.hint': 'Press {keys} to open this panel; once it is open, the same key references the file on screen.',
      'doc.loading': 'Loading file…',
      'image.fit': 'Fit',
      'image.actual': 'Actual size',
      'image.open': 'Open original',
      'edit.begin': 'Edit',
      'edit.editing': 'Editing',
      'edit.unsaved': 'Unsaved',
      'edit.save': 'Save',
      'edit.saving': 'Saving…',
      'edit.cancel': 'Discard',
      'edit.reload': 'Reload',
      'edit.overwrite': 'Overwrite',
      'edit.conflict': 'The file changed on disk',
      'edit.failed': 'Save failed',
      'edit.discardConfirm': 'Discard unsaved changes?',
      'edit.tooLarge': 'This file is too large to edit',
      'edit.edit': 'Edit',
      'edit.preview': 'Preview',
      'edit.saved': 'Saved',
      'doc.error': 'Cannot open this file',
      'doc.lines': '{count} lines',
      'doc.truncated': 'Only the first {count} lines are shown.',
      'doc.notText': 'Not a UTF-8 text file',
      'doc.tooLarge': 'File is too large to preview',
      'doc.notFound': 'File no longer exists',
      'doc.notRegular': 'Not a regular file',
      'doc.unavailable': 'The workspace file service is unavailable',
      'git.noRepo': 'This workspace is not a Git repository',
      'git.loading': 'Reading Git history…',
      'git.error': 'Cannot read Git history',
      'git.empty': 'No commits yet',
      'git.branch': 'Current branch',
      'git.detached': 'Detached HEAD',
      'git.commits': '{count} commits · all branches',
      'git.untracked': 'Untracked',
      'git.containsChanges': 'Contains changed files',
      'git.modified': 'Modified',
      'git.added': 'Added',
      'git.deleted': 'Deleted',
      'git.renamed': 'Renamed',
      'commit.back': 'Back to the graph',
      'commit.parent': '{count} parents',
      'commit.files': 'Changed files',
      'commit.noFiles': 'No textual changes',
      'commit.truncated': 'Diff truncated',
      'commit.before': 'Before',
      'commit.after': 'After',
      'commit.noText': 'No textual changes to show',
      'commit.selectFile': 'Select a changed file to compare it',
      'notice.referenced': 'File referenced in the composer',
      'notice.noReference': 'Select a file first',
      'notice.noInput': 'The composer is not available',
      'notice.failed': 'Could not insert the reference',
      'command.open': 'CodeIDE',
      'command.reserved': 'CodeIDE (fixed keys)',
      'command.blocked': 'Open a conversation first',
      'term.title': 'Command line',
      'term.toggle': 'Show or hide the command line',
      'term.placeholder': 'Type a command and press Enter',
      'term.clear': 'Clear',
      'term.interrupt': 'Interrupt',
      'term.close': 'Hide',
      'term.openBuiltin': 'Open the built-in terminal tab',
      'term.resize': 'Drag to resize the command line',
      'tree.resize': 'Drag to resize the file tree',
      'term.phase.idle': 'starting',
      'term.phase.loading': 'loading',
      'term.phase.creating': 'starting',
      'term.phase.connecting': 'connecting',
      'term.phase.connected': 'connected',
      'term.phase.disconnected': 'disconnected',
      'term.phase.closing': 'closing',
      'term.phase.closed': 'closed',
      'term.phase.failed': 'failed',
      'term.phase.unavailable': 'terminal unavailable',
      'term.retry': 'Retry',
    }

    const ZH = {
      'type.label': 'CodeIDE',
      'guide.title': 'CodeIDE',
      'guide.description': '左侧文件树、右侧文件内容，并带一个只读 Git 图谱。',
      'panel.title': '代码',
      'tab.files': '文件',
      'tab.graph': 'Git 图谱',
      'tree.workspace': '工作区',
      'tree.loading': '加载中…',
      'tree.empty': '空目录',
      'tree.showIgnored': '显示被忽略的目录',
      'tree.hideIgnored': '隐藏被忽略的目录',
      'tree.error': '无法读取该目录',
      'action.reload': '重新加载',
      'action.reference': '把这个文件引用到对话框',
      'action.referenceShort': '引用',
      'action.retry': '重试',
      'action.reloadTree': '重新加载该目录',
      'md.render': '渲染',
      'md.source': '源码',
      'json.pretty': '格式化',
      'json.raw': '原始',
      'json.invalid': 'JSON 无法解析，不能格式化',
      'json.tooLarge': '文件过大，无法格式化',
      'empty.pickFile': '在左侧选择一个文件',
      'empty.hint': '按 {keys} 打开这个面板；打开后同一个键会把当前文件引用进对话框。',
      'doc.loading': '正在读取文件…',
      'image.fit': '适应窗口',
      'image.actual': '原始大小',
      'image.open': '打开原图',
      'edit.begin': '编辑',
      'edit.editing': '编辑中',
      'edit.unsaved': '未保存',
      'edit.save': '保存',
      'edit.saving': '保存中…',
      'edit.cancel': '放弃',
      'edit.reload': '重新加载',
      'edit.overwrite': '覆盖保存',
      'edit.conflict': '文件已被外部修改',
      'edit.failed': '保存失败',
      'edit.discardConfirm': '有未保存的修改，确定放弃？',
      'edit.tooLarge': '文件过大，暂不支持编辑',
      'edit.edit': '编辑',
      'edit.preview': '预览',
      'edit.saved': '已保存',
      'doc.error': '无法打开该文件',
      'doc.lines': '{count} 行',
      'doc.truncated': '只显示前 {count} 行。',
      'doc.notText': '不是 UTF-8 文本文件',
      'doc.tooLarge': '文件过大，无法预览',
      'doc.notFound': '文件已不存在',
      'doc.notRegular': '不是普通文件',
      'doc.unavailable': '工作区文件服务不可用',
      'git.noRepo': '这个工作区不是 Git 仓库',
      'git.loading': '正在读取 Git 历史…',
      'git.error': '无法读取 Git 历史',
      'git.empty': '还没有任何提交',
      'git.branch': '当前分支',
      'git.detached': '游离 HEAD',
      'git.commits': '{count} 次提交 · 全部分支',
      'git.untracked': '未跟踪',
      'git.containsChanges': '包含改动文件',
      'git.modified': '已修改',
      'git.added': '新增',
      'git.deleted': '已删除',
      'git.renamed': '重命名',
      'commit.back': '返回图谱',
      'commit.parent': '{count} 个父提交',
      'commit.files': '改动文件',
      'commit.noFiles': '没有文本改动',
      'commit.truncated': 'diff 已截断',
      'commit.before': '修改前',
      'commit.after': '修改后',
      'commit.noText': '没有可显示的文本改动',
      'commit.selectFile': '选择一个改动文件查看对比',
      'notice.referenced': '已把文件引用插入对话框',
      'notice.noReference': '请先选择一个文件',
      'notice.noInput': '对话框当前不可用',
      'notice.failed': '插入引用失败',
      'command.open': 'CodeIDE',
      'command.reserved': 'CodeIDE（固定键）',
      'command.blocked': '请先打开一个会话',
      'term.title': '命令行',
      'term.toggle': '显示或隐藏命令行',
      'term.placeholder': '输入命令后回车',
      'term.clear': '清空',
      'term.interrupt': '中断',
      'term.close': '收起',
      'term.openBuiltin': '在自带终端标签中打开',
      'term.resize': '拖拽调整命令行高度',
      'tree.resize': '拖拽调整文件树宽度',
      'term.phase.idle': '启动中',
      'term.phase.loading': '加载中',
      'term.phase.creating': '创建中',
      'term.phase.connecting': '连接中',
      'term.phase.connected': '已连接',
      'term.phase.disconnected': '已断开',
      'term.phase.closing': '关闭中',
      'term.phase.closed': '已关闭',
      'term.phase.failed': '连接失败',
      'term.phase.unavailable': '终端不可用',
      'term.retry': '重试',
    }

    const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

    const CSS = `
.dcv-root { position: relative; display: flex; flex-direction: column; flex: 1 1 auto; height: 100%; min-height: 0;
  overflow: hidden; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-size: 12px; line-height: 1.5; }
.dcv-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dcv-headTitle { display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--dsw-alias-label-secondary); }
.dcv-title { font-weight: 600; font-size: 12px; color: var(--dsw-alias-label-primary); white-space: nowrap; }
.dcv-chip { display: inline-flex; align-items: center; gap: 3px; max-width: 120px; padding: 1px 6px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcv-headActions { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.dcv-tab { border: none; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 11px;
  padding: 3px 8px; border-radius: 6px; cursor: pointer; }
.dcv-tab.is-on { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dcv-tool { display: inline-flex; align-items: center; gap: 4px; border: none; background: transparent;
  color: var(--dsw-alias-label-secondary); padding: 4px; border-radius: 6px; cursor: pointer; font-size: 11px; }
.dcv-tool:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dcv-tool:disabled { opacity: 0.45; cursor: default; }
.dcv-tool.is-on { color: var(--dsw-alias-brand-primary); }
.dcv-mini { padding: 2px; }
.dcv-body { display: flex; flex: 1 1 auto; min-height: 0; }
.dcv-tree { display: flex; flex-direction: column; flex: 0 0 260px; min-width: 128px; max-width: 70%;
  border-right: 1px solid var(--dsw-alias-border-l1); min-height: 0;
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base)); }
.dcv-paneHead { display: flex; align-items: center; gap: 4px; padding: 4px 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dcv-paneTitle { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dcv-treeScroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 2px 0 8px; }
.dcv-row { display: flex; align-items: center; gap: 4px; width: 100%; border: none; background: transparent;
  color: var(--dsw-alias-label-primary); text-align: left; padding: 2px 6px; font-size: 12px; line-height: 18px;
  cursor: pointer; }
.dcv-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dcv-file.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary); }
.dcv-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcv-dir.is-changed-dir .dcv-name { color: var(--dsw-alias-state-warn-primary); font-weight: 500; }
.dcv-dirDot { margin-left: auto; font-size: 9px; line-height: 1; color: var(--dsw-alias-state-warn-primary);
  opacity: 0.9; padding-right: 2px; }
.dcv-mark { margin-left: auto; font-size: 10px; padding: 0 3px; border-radius: 3px; }
.dcv-mark-modified { color: var(--dsw-alias-state-warn-primary); }
.dcv-mark-added, .dcv-mark-untracked { color: var(--dsw-alias-state-success-primary); }
.dcv-mark-deleted { color: var(--dsw-alias-state-error-primary); }
.dcv-mark-renamed { color: var(--dsw-alias-state-idle-primary); }
.dcv-file.is-changed .dcv-name { font-weight: 500; }
.dcv-file.is-modified { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 7%, transparent); }
.dcv-file.is-modified .dcv-name { color: var(--dsw-alias-state-warn-primary); }
.dcv-file.is-added, .dcv-file.is-untracked { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent); }
.dcv-file.is-added .dcv-name, .dcv-file.is-untracked .dcv-name { color: var(--dsw-alias-state-success-primary); }
.dcv-file.is-deleted { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.dcv-file.is-deleted .dcv-name { color: var(--dsw-alias-state-error-primary); text-decoration: line-through; }
.dcv-file.is-renamed { background: var(--dsw-alias-bg-layer-2); }
.dcv-file.is-renamed .dcv-name { color: var(--dsw-alias-state-idle-primary); }
.dcv-file.is-active, .dcv-file.is-active.is-changed { background: var(--dsw-alias-bg-layer-2); }
.dcv-file.is-active .dcv-name { color: var(--dsw-alias-brand-primary); text-decoration: none; font-weight: 600; }
.dcv-treeNote { padding: 4px 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dcv-treeError { padding: 3px 8px; color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.dcv-treeErrorText { line-height: 16px; }
.dcv-treeDetail { color: var(--dsw-alias-label-secondary); font-size: 10px; word-break: break-all; }
.dcv-retry { margin-top: 4px; border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-primary); border-radius: 4px; font-size: 10px; padding: 1px 6px; cursor: pointer; }
.dcv-retry:hover { background: var(--dsw-alias-bg-layer-2); }
.dcv-main { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.dcv-empty { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; color: var(--dsw-alias-label-secondary); padding: 16px; text-align: center; }
.dcv-empty p { margin: 0; }
.dcv-hint { font-size: 11px; opacity: 0.8; }
.dcv-doc { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.dcv-docHead { display: flex; align-items: center; gap: 8px; padding: 4px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); min-width: 0; }
.dcv-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;
  color: var(--dsw-alias-label-secondary); direction: ltr; }
.dcv-meta { margin-left: auto; flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-secondary); opacity: 0.8; }
.dcv-banner { padding: 3px 8px; font-size: 10px; color: var(--dsw-alias-state-warn-primary);
  border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dcv-editorDoc { display: flex; flex-direction: column; min-height: 0; }
.dcv-editor { flex: 1 1 auto; min-height: 0; display: flex; border-top: 1px solid var(--dsw-alias-border-l1); }
.dcv-editorGutter { margin: 0; padding: 6px 0; width: 38px; min-width: 38px; overflow: hidden;
  user-select: none; background: var(--dsw-alias-bg-layer-2); }
.dcv-gutterLine { display: flex; align-items: center; height: 17px; line-height: 17px;
  font-family: ${MONO}; font-size: 11.5px; color: var(--dsw-alias-label-secondary); opacity: 0.75; }
.dcv-gutterNo { flex: 1 1 auto; text-align: right; padding-right: 5px; }
.dcv-gutterDot { width: 6px; height: 6px; border-radius: 50%; margin-left: 4px; flex: 0 0 6px;
  visibility: hidden; }
.dcv-gutterDot.is-added { visibility: visible;
  background: var(--dsw-alias-file-diff-added-marker, var(--dsw-alias-state-success-primary)); }
.dcv-gutterDot.is-modified { visibility: visible;
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-button-info-fill)); }
.dcv-gutterDot.is-deleted { visibility: visible;
  background: var(--dsw-alias-file-diff-deleted-marker, var(--dsw-alias-state-error-primary)); }
.dcv-editorStack { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden; }
.dcv-editHighlight { position: absolute; inset: 0; margin: 0; padding: 6px 8px; overflow: hidden;
  pointer-events: none; font-family: ${MONO}; font-size: 11.5px; line-height: 17px; white-space: pre; }
.dcv-editorArea { flex: 1 1 auto; min-width: 0; margin: 0; padding: 6px 8px; border: none; outline: none;
  resize: none; background: transparent; color: var(--dsw-alias-label-primary); font-family: ${MONO};
  font-size: 11.5px; line-height: 17px; white-space: pre; overflow: auto; tab-size: 2; }
.dcv-editorStack .dcv-editorArea { position: absolute; inset: 0; }
.dcv-editorArea.is-overlay { color: transparent; caret-color: var(--dsw-alias-label-primary);
  background: transparent; }
.dcv-editorArea.is-overlay::selection { background: rgba(125, 150, 255, 0.35); color: transparent; }
.dcv-saveError { display: flex; align-items: center; gap: 8px; }
.dcv-imageWrap { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; align-items: flex-start;
  justify-content: center; padding: 12px; background:
    repeating-conic-gradient(var(--dsw-alias-bg-layer-2) 0% 25%, transparent 0% 50%) 50% / 16px 16px; }
.dcv-image { display: block; max-width: none; image-rendering: auto; }
.dcv-imageWrap.is-fit .dcv-image { max-width: 100%; max-height: 100%; object-fit: contain; }
.dcv-docMeta { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dcv-docActions { margin-left: auto; display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.dcv-code { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 0 10px; font-family: ${MONO};
  font-size: 12px; line-height: 19px; }
.dcv-line { display: flex; min-width: max-content; }
.dcv-ln { flex: 0 0 auto; width: 38px; padding-right: 8px; text-align: right; color: var(--dsw-alias-label-secondary);
  opacity: 0.55; user-select: none; position: sticky; left: 0; background: var(--dsw-alias-bg-base); }
.dcv-src { white-space: pre; padding-right: 12px; }
.dcv-tok-comment { color: var(--dsw-alias-label-secondary); font-style: italic; }
.dcv-tok-string { color: var(--dsw-alias-state-success-primary); }
.dcv-tok-number { color: var(--dsw-alias-brand-primary); }
.dcv-tok-keyword { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }
.dcv-tok-type { color: var(--dsw-alias-state-idle-primary); }
.dcv-tok-key { color: var(--dsw-alias-state-idle-primary); }
.dcv-tok-builtin { color: var(--dsw-alias-state-idle-primary); font-style: italic; }
.dcv-tok-decorator { color: var(--dsw-alias-brand-primary); }
.dcv-tok-meta { color: var(--dsw-alias-state-idle-primary); }
.dcv-tok-add { color: var(--dsw-alias-state-success-primary); }
.dcv-tok-del { color: var(--dsw-alias-state-error-primary); }
.dcv-modes { display: inline-flex; gap: 2px; flex: 0 0 auto; }
.dcv-materialIcon { flex: 0 0 auto; display: block; border-radius: 2px; }
.dcv-docHead .dcv-materialIcon { margin-right: 2px; }
.dcv-brandIcon { display: block; flex: 0 0 auto; border-radius: 4px; }
.dcv-mdScroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 14px 24px; }
.dcv-md { max-width: 900px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.65; }
.dcv-md-h { font-weight: 650; line-height: 1.3; margin: 14px 0 8px; color: var(--dsw-alias-label-primary); }
.dcv-md-h1 { font-size: 22px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 6px; }
.dcv-md-h2 { font-size: 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 4px; }
.dcv-md-h3 { font-size: 15px; }
.dcv-md-h4 { font-size: 13.5px; }
.dcv-md-h5, .dcv-md-h6 { font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.dcv-md-p { margin: 6px 0; white-space: pre-wrap; }
.dcv-md-list { margin: 6px 0 6px 18px; padding: 0; }
.dcv-md-list li { margin: 2px 0; }
.dcv-md-quote { margin: 8px 0; padding: 2px 10px; border-left: 3px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); }
.dcv-md-hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 14px 0; }
.dcv-md-code { padding: 1px 4px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2);
  font-family: ${MONO}; font-size: 12px; }
.dcv-md-pre { margin: 8px 0; padding: 8px 10px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); overflow: auto; font-family: ${MONO}; font-size: 12px;
  line-height: 18px; }
.dcv-md-codeLine { white-space: pre; }
.dcv-md-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.dcv-md-link:hover { text-decoration: underline; }
.dcv-git { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.dcv-gitHead { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dcv-gitList { flex: 1 1 auto; overflow: auto; min-height: 0; padding: 2px 0 10px; }
.dcv-commit { display: flex; align-items: center; gap: 6px; width: 100%; border: none; background: transparent;
  text-align: left; padding: 2px 8px 2px 4px; cursor: pointer; color: var(--dsw-alias-label-primary); font-size: 12px; }
.dcv-commit:hover { background: var(--dsw-alias-bg-layer-2); }
.dcv-lane { flex: 0 0 auto; display: block; }
.dcv-commitBody { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
.dcv-subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcv-byline { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dcv-ref { display: inline-block; margin-right: 4px; padding: 0 4px; border-radius: 3px; font-size: 10px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.dcv-ref-head { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dcv-commitView { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.dcv-commitMeta { padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dcv-commitSubject { font-weight: 600; font-size: 12px; }
.dcv-commitSub { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.dcv-files { max-height: 32%; overflow: auto; border-bottom: 1px solid var(--dsw-alias-border-l1);
  padding: 2px 0; flex: 0 0 auto; }
.dcv-fileRow { display: flex; align-items: center; gap: 6px; width: 100%; border: none;
  background: transparent; padding: 2px 8px; font-size: 11px; font-family: ${MONO};
  color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; }
.dcv-fileRow:hover { background: var(--dsw-alias-bg-layer-2); }
.dcv-fileRow.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-brand-primary); }
.dcv-fileName { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcv-add { color: var(--dsw-alias-state-success-primary); }
.dcv-del { color: var(--dsw-alias-state-error-primary); }
.dcv-splitScroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dcv-splitTable { border-collapse: collapse; min-width: 100%; font-family: ${MONO};
  font-size: 11.5px; line-height: 18px; }
.dcv-splitTable th { position: sticky; top: 0; z-index: 1; text-align: left; padding: 2px 8px;
  font-size: 10px; font-weight: 600; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dcv-splitNo { width: 38px; min-width: 38px; padding: 0 6px; text-align: right;
  color: var(--dsw-alias-label-secondary); opacity: 0.6; user-select: none; }
.dcv-splitCode { white-space: pre; padding: 0 8px; }
.dcv-splitDel { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }
.dcv-splitAdd { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.dcv-splitHunk td { white-space: pre; padding: 2px 8px; color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-2); }
.dcv-termWrap { display: flex; flex-direction: column; flex: 0 0 auto; min-height: 110px; max-height: 78%; }
.dcv-term { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
  background: var(--dsw-alias-bg-layer-1); }
.dcv-resizer { flex: 0 0 auto; background: transparent; position: relative; z-index: 3;
  transition: background-color 120ms ease; }
.dcv-resizer:hover, .dcv-resizer:active { background: var(--dsw-alias-brand-primary); opacity: 0.45; }
.dcv-resizer-v { width: 5px; margin: 0 -2px; cursor: col-resize; }
.dcv-resizer-h { height: 5px; margin: -2px 0; cursor: row-resize;
  border-top: 1px solid var(--dsw-alias-border-l1); }
.dcv-termHead { display: flex; align-items: center; gap: 6px; padding: 3px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dcv-termTitle { font-size: 11px; font-weight: 600; white-space: nowrap; }
.dcv-termPhase { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-left: auto; white-space: nowrap; }
.dcv-termError { display: flex; align-items: center; gap: 8px; padding: 4px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-state-error-primary);
  font-size: 11px; }
.dcv-termErrorMessage { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.dcv-termBody { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 8px; }
.dcv-termScreen { margin: 0; font-family: ${MONO}; font-size: 11.5px; line-height: 17px;
  white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-primary); }
.dcv-termXterm { flex: 1 1 auto; min-height: 0; padding: 2px 6px 4px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-1); }
.dcv-termXterm .xterm { height: 100%; }
.dcv-termXterm .xterm-viewport { background: transparent !important; }
.dcv-termInput { display: flex; align-items: center; gap: 6px; padding: 3px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1); }
.dcv-termPrompt { color: var(--dsw-alias-brand-primary); font-family: ${MONO}; font-size: 12px; }
.dcv-termField { flex: 1 1 auto; min-width: 0; border: none; outline: none; background: transparent;
  color: var(--dsw-alias-label-primary); font-family: ${MONO}; font-size: 12px; padding: 3px 0; }
.dcv-notice { position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 5px 8px; border-radius: 6px;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); font-size: 11px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); }
.dcv-error { color: var(--dsw-alias-state-error-primary); }
`

    /* ------------------------------------------------------------------ icons */

    function icon(children) {
      return function Icon(props) {
        const size = props && props.size ? props.size : 16
        return h('svg', {
          viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
          className: props && props.className, 'aria-hidden': true, focusable: false,
        }, children)
      }
    }

    const IconCode = icon([
      h('path', { key: 'a', d: 'M8.5 8 5 12l3.5 4' }),
      h('path', { key: 'b', d: 'M15.5 8 19 12l-3.5 4' }),
      h('path', { key: 'c', d: 'M13 6l-2 12' }),
    ])
    const IconChevronRight = icon([h('path', { key: 'a', d: 'M9 6l6 6-6 6' })])
    const IconChevronDown = icon([h('path', { key: 'a', d: 'M6 9l6 6 6-6' })])
    /** The plugin's own app icon, drawn as an image so the guide card can show it. */
    const ICON_CODEIDE_URI = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20width%3D%2264%22%20height%3D%2264%22%20role%3D%22img%22%20aria-label%3D%22CodeIDE%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22codeide-bg%22%20x1%3D%2210%22%20y1%3D%224%22%20x2%3D%2254%22%20y2%3D%2260%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%233B82F6%22%2F%3E%3Cstop%20offset%3D%220.55%22%20stop-color%3D%22%232563EB%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23101F63%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22codeide-shine%22%20x1%3D%228%22%20y1%3D%224%22%20x2%3D%2240%22%20y2%3D%2238%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23FFFFFF%22%20stop-opacity%3D%220.3%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23FFFFFF%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22codeide-slash%22%20x1%3D%2229%22%20y1%3D%2218%22%20x2%3D%2236%22%20y2%3D%2246%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%238BE9FF%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2338BDF8%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2258%22%20height%3D%2258%22%20rx%3D%2215%22%20fill%3D%22url%28%23codeide-bg%29%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2258%22%20height%3D%2258%22%20rx%3D%2215%22%20fill%3D%22url%28%23codeide-shine%29%22%2F%3E%3Crect%20x%3D%223.75%22%20y%3D%223.75%22%20width%3D%2256.5%22%20height%3D%2256.5%22%20rx%3D%2214.25%22%20fill%3D%22none%22%20stroke%3D%22%23FFFFFF%22%20stroke-opacity%3D%220.18%22%20stroke-width%3D%221.5%22%2F%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23FFFFFF%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M25%2021%2013.5%2032%2025%2043%22%2F%3E%3Cpath%20d%3D%22M39%2021l11.5%2011L39%2043%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M36.2%2017.5%2028%2046.5%22%20fill%3D%22none%22%20stroke%3D%22url%28%23codeide-slash%29%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%2F%3E%3Crect%20x%3D%2217%22%20y%3D%2251.5%22%20width%3D%2230%22%20height%3D%223.2%22%20rx%3D%221.6%22%20fill%3D%22%238BE9FF%22%20opacity%3D%220.85%22%2F%3E%3C%2Fsvg%3E'

    const IconCodeIDE = ({ size }) => h('img', {
      className: 'dcv-brandIcon',
      src: ICON_CODEIDE_URI,
      width: size === undefined ? 16 : size,
      height: size === undefined ? 16 : size,
      alt: '',
      draggable: false,
    })

    const IconTerminal = icon([
      h('rect', { key: 'a', x: 3, y: 4, width: 18, height: 16, rx: 2 }),
      h('path', { key: 'b', d: 'M7 9l3 3-3 3' }),
      h('path', { key: 'c', d: 'M13 15h4' }),
    ])
    const IconExternal = icon([
      h('path', { key: 'a', d: 'M14 4h6v6' }),
      h('path', { key: 'b', d: 'M20 4l-9 9' }),
      h('path', { key: 'c', d: 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5' }),
    ])
    const IconClose = icon([
      h('path', { key: 'a', d: 'M6 6l12 12' }),
      h('path', { key: 'b', d: 'M18 6L6 18' }),
    ])
    const IconRefresh = icon([
      h('path', { key: 'a', d: 'M20 12a8 8 0 1 1-2.34-5.66' }),
      h('path', { key: 'b', d: 'M20 4v5h-5' }),
    ])
    const IconLink = icon([
      h('path', { key: 'a', d: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1' }),
      h('path', { key: 'b', d: 'M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1' }),
    ])
    const IconBack = icon([
      h('path', { key: 'a', d: 'M19 12H5' }),
      h('path', { key: 'b', d: 'M12 19l-7-7 7-7' }),
    ])
    const IconFilter = icon([
      h('path', { key: 'a', d: 'M4 5h16l-6 7v6l-4 2v-8z' }),
    ])

    /* ---------------------------------------------------------------- helpers */

    /** Last path segment. */
    function baseName(path) {
      if (typeof path !== 'string') return ''
      const clean = path.replace(/[\\/]+$/u, '')
      const cut = clean.lastIndexOf('/')
      return cut === -1 ? clean : clean.slice(cut + 1)
    }

    /** `@path`, or `@"path with spaces"` — the composer's own mention grammar. */
    function mentionFor(path) {
      return /[\s"]/u.test(path) ? `@"${path}"` : `@${path}`
    }

    /** `@path` or `@path:12` / `@path:12-20` when an editor selection covers lines. */
    function referenceMention(path, range) {
      const base = mentionFor(path)
      if (range === null || range === undefined) return base
      const suffix = range.first === range.last ? `:${range.first}` : `:${range.first}-${range.last}`
      return base + suffix
    }

    /** Join a Session working directory with a tree-relative path. */
    function joinPath(base, relative) {
      if (typeof base !== 'string' || base === '') return relative
      if (relative === '') return base
      const cleanBase = base.replace(/[\\/]+$/u, '')
      const cleanRelative = String(relative).replace(/^[\\/]+/u, '')
      const separator = cleanBase.includes('\\') && !cleanBase.includes('/') ? '\\' : '/'
      return `${cleanBase}${separator}${cleanRelative}`
    }

    /** Resolve a Remote promise into a failure result instead of hanging the view. */
    function withTimeout(promise, milliseconds) {
      return new Promise(resolve => {
        let settled = false
        const finish = value => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(value)
        }
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          resolve({ ok: false, error: { code: 'timeout', message: `request timed out after ${milliseconds} ms` } })
        }, milliseconds)
        promise.then(finish, error => finish({
          ok: false,
          error: { code: 'exception', message: error instanceof Error ? error.message : String(error) },
        }))
      })
    }

    /** File extension to the highlighter's language key. */
    function languageOf(path) {
      const name = baseName(path).toLowerCase()
      if (name === 'dockerfile' || name === '.dockerignore') return 'docker'
      if (name === 'makefile' || name === 'gnumakefile' || name === 'makefile.am') return 'make'
      if (name === 'cmakelists.txt') return 'cmake'
      if (name === '.gitignore' || name === '.gitattributes' || name === '.gitmodules') return 'ini'
      const dot = name.lastIndexOf('.')
      if (dot === -1) {
        if (name === 'containerfile') return 'docker'
        if (name === 'vagrantfile' || name === 'gemfile' || name === 'rakefile') return 'rb'
        return 'txt'
      }
      const ext = name.slice(dot + 1)
      if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'js'
      if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return 'ts'
      if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson' || ext === 'ipynb') return 'json'
      if (ext === 'jsonc' || ext === 'json5') return 'jsonc'
      if (ext === 'py' || ext === 'pyi' || ext === 'pyw' || ext === 'pyx') return 'py'
      if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish') return 'sh'
      if (ext === 'css' || ext === 'scss' || ext === 'less') return 'css'
      if (ext === 'yml' || ext === 'yaml') return 'yaml'
      if (ext === 'toml' || ext === 'ini' || ext === 'conf' || ext === 'env' || ext === 'properties') return 'ini'
      if (ext === 'go') return 'go'
      if (ext === 'rs') return 'rs'
      if (ext === 'java' || ext === 'jsp') return 'java'
      if (ext === 'kt' || ext === 'kts') return 'kotlin'
      if (ext === 'scala' || ext === 'sc' || ext === 'sbt') return 'scala'
      if (ext === 'cs' || ext === 'csx' || ext === 'razor') return 'csharp'
      if (ext === 'swift') return 'swift'
      if (ext === 'dart') return 'dart'
      if (ext === 'php' || ext === 'phtml' || ext === 'php5') return 'php'
      if (ext === 'pl' || ext === 'pm') return 'perl'
      if (ext === 'lua') return 'lua'
      if (ext === 'r') return 'r'
      if (ext === 'jl') return 'julia'
      if (ext === 'hs' || ext === 'lhs') return 'haskell'
      if (ext === 'ex' || ext === 'exs' || ext === 'eex' || ext === 'heex') return 'elixir'
      if (ext === 'erl' || ext === 'hrl') return 'erlang'
      if (ext === 'clj' || ext === 'cljs' || ext === 'cljc' || ext === 'edn') return 'clojure'
      if (ext === 'elm') return 'elm'
      if (ext === 'fs' || ext === 'fsi' || ext === 'fsx') return 'fsharp'
      if (ext === 'ml' || ext === 'mli') return 'ocaml'
      if (ext === 'nim' || ext === 'nims') return 'nim'
      if (ext === 'zig') return 'zig'
      if (ext === 'sol') return 'solidity'
      if (ext === 'groovy' || ext === 'gvy' || ext === 'gradle') return 'groovy'
      if (ext === 'tf' || ext === 'tfvars' || ext === 'hcl' || ext === 'nomad') return 'hcl'
      if (ext === 'nix') return 'nix'
      if (ext === 'ps1' || ext === 'psm1' || ext === 'psd1') return 'powershell'
      if (ext === 'bat' || ext === 'cmd') return 'batch'
      if (ext === 'asm' || ext === 's' || ext === 'nasm') return 'asm'
      if (ext === 'vim' || ext === 'vimrc') return 'vim'
      if (ext === 'tex' || ext === 'latex' || ext === 'sty' || ext === 'cls' || ext === 'bib') return 'tex'
      if (ext === 'proto') return 'proto'
      if (ext === 'graphql' || ext === 'gql') return 'graphql'
      if (ext === 'cmake' || ext === 'cmake.in') return 'cmake'
      if (ext === 'mk' || ext === 'mak') return 'make'
      if (ext === 'dockerfile') return 'docker'
      if (ext === 'diff' || ext === 'patch') return 'diff'
      if (ext === 'html' || ext === 'htm' || ext === 'xhtml' || ext === 'xml' || ext === 'xsl'
        || ext === 'xslt' || ext === 'svg' || ext === 'vue' || ext === 'svelte' || ext === 'plist'
        || ext === 'hbs' || ext === 'ejs' || ext === 'pug' || ext === 'astro') return 'markup'
      if (ext === 'cpp' || ext === 'cxx' || ext === 'cc' || ext === 'hpp' || ext === 'hxx' || ext === 'hh'
        || ext === 'ipp' || ext === 'tpp' || ext === 'ino') return 'cpp'
      if (ext === 'h') return 'cpp'
      if (ext === 'c') return 'c'
      if (ext === 'm' || ext === 'mm') return 'c'
      if (ext === 'sql') return 'sql'
      if (ext === 'rb' || ext === 'rake' || ext === 'gemspec') return 'rb'
      if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return 'md'
      if (ext === 'csv' || ext === 'tsv' || ext === 'log' || ext === 'txt') return 'txt'
      return 'txt'
    }

    /** Extensions the panel renders as images instead of text. */
    /** Largest file the textarea editor accepts. */
    const EDIT_LIMIT = 2 * 1024 * 1024

    const IMAGE_EXT = new Set(['png', 'apng', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'tif', 'tiff'])

    /** @returns whether `path` names a renderable image. */
    function isImagePath(path) {
      const name = baseName(path).toLowerCase()
      const dot = name.lastIndexOf('.')
      return dot !== -1 && IMAGE_EXT.has(name.slice(dot + 1))
    }

    /** The same-origin URL that streams one image out of the session directory. */
    function imageUrlOf(cwd, relPath) {
      return `${API}/file?path=${encodeURIComponent(cwd)}&rel=${encodeURIComponent(relPath)}`
    }

    /** Lazily load the vendored xterm runtime and stylesheet. */
    let xtermPromise = null
    function loadXterm() {
      if (xtermPromise !== null) return xtermPromise
      xtermPromise = (async () => {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `${API}/asset?name=xterm.css`
        document.head.appendChild(link)
        return import(`${API}/asset?name=xterm.mjs`)
      })()
      return xtermPromise
    }

    const WORDS = {
      js: 'const let var function return if else for while do switch case break continue new class extends super this import from export default async await try catch finally throw typeof instanceof in of null undefined true false yield delete void static get set',
      ts: 'const let var function return if else for while do switch case break continue new class extends super this import from export default async await try catch finally throw typeof instanceof in of null undefined true false yield delete void static get set interface type enum implements readonly public private protected abstract declare namespace keyof infer satisfies as unknown never any string number boolean',
      json: 'true false null',
      py: 'def class return if elif else for while in not and or is None True False import from as try except finally raise with lambda yield global nonlocal pass break continue assert async await del',
      sh: 'if then else elif fi for while do done case esac function export local return echo cd exit set unset readonly source [[ [ ]] test',
      css: '',
      yaml: '',
      ini: '',
      go: 'func package import var const type struct interface return if else for range go defer map chan switch case break continue nil true false string int bool error',
      rs: 'fn let mut pub use mod struct enum impl trait for while loop if else match return self Self crate super where async await dyn ref move const static true false Some None Ok Err str String Vec',
      java: 'public private protected class interface extends implements static final void int long double float boolean char String if else for while do switch case return new this super import package try catch finally throw throws abstract synchronized null true false',
      c: 'int char float double void long short unsigned signed struct union enum typedef static const if else for while do switch case return sizeof goto break continue extern',
      cpp: 'alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq override final import module',
      kotlin: 'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit noinline open operator out override private protected public reified sealed suspend tailrec vararg',
      scala: 'abstract case catch class def do else extends false final finally for if implicit import lazy match new null object override package private protected return sealed super this throw trait try true type val var while with yield given using enum export then',
      csharp: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while async await var dynamic get set value yield record init',
      swift: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch false is nil super self Self throw throws true try await async actor some any',
      dart: 'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield',
      php: 'abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new null or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield true false',
      perl: 'my our local sub use require package if elsif else unless while for foreach do return last next redo die print printf say chomp chop split join map grep sort keys values each push pop shift unshift splice bless new',
      lua: 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while',
      r: 'if else repeat while function for in next break TRUE FALSE NULL NA NaN Inf library require',
      julia: 'function end if else elseif for while begin let try catch finally return break continue struct mutable abstract primitive type module using import export const global local do quote macro where in isa',
      haskell: 'case class data default deriving do else if import in infix infixl infixr instance let module newtype of then type where forall mdo family',
      elixir: 'def defp defmodule defmacro defstruct defimpl do end else rescue catch after fn if unless case cond when with for receive try raise throw import alias require use true false nil',
      erlang: 'after begin case catch cond end fun if let of query receive try when and or not xor bnot band bor bxor bsl bsr div rem',
      clojure: 'def defn fn let letfn if if-not when when-not cond case do loop recur try catch finally throw ns require import use quote var new doto some-> map filter reduce str println',
      elm: 'alias as case exposing if import in let module of port then type where',
      fsharp: 'abstract and as assert base begin class default delegate do done downcast downto elif else end exception extern false finally fixed for fun function global if in inherit inline interface internal lazy let match member module mutable namespace new not null of open or override private public rec return sig static struct then to true try type upcast use val void when while with yield',
      ocaml: 'and as assert begin class constraint do done downto else end exception external false for fun function functor if in include inherit initializer lazy let match method module mutable new object of open or private rec sig struct then to true try type val virtual when while with',
      nim: 'addr and as asm bind block break case cast concept const continue converter defer discard distinct div do elif else end enum except export finally for from func if import in include interface is isnot iterator let macro method mixin mod nil not notin object of or out proc ptr raise ref return shl shr static template try tuple type using var when while xor yield',
      zig: 'addr align allowzero and anyframe anytype asm async await break callconv catch comptime const continue defer else enum errdefer error export extern fn for if inline linksection noalias noinline nosuspend opaque or orelse packed pub resume return struct suspend switch test threadlocal try union unreachable usingnamespace var volatile while',
      solidity: 'abstract address anonymous as assembly bool break bytes calldata catch constant constructor continue contract delete do else emit enum error event external fallback false for function if immutable import indexed interface internal is library mapping memory modifier new override payable pragma private public pure receive return returns revert storage string struct true try type uint uint256 unchecked using view virtual while',
      groovy: 'as assert break case catch class const continue def default do else enum extends false finally for goto if implements import in instanceof interface new null package return super switch this throw throws trait true try while',
      hcl: 'resource data module variable output provider terraform locals for_each depends_on lifecycle dynamic',
      nix: 'let in with rec inherit assert if then else builtins import',
      powershell: 'function param if elseif else foreach for while do switch try catch finally throw return break continue begin process end filter in',
      batch: 'echo setlocal endlocal if else for goto call exit set shift rem',
      asm: 'mov add sub mul div push pop call ret jmp je jne jz jnz cmp test lea inc dec xor and or not shl shr int section global',
      vim: 'let set setlocal function endfunction if endif else elseif for endfor while endwhile return call execute autocmd syntax highlight',
      tex: 'documentclass usepackage begin end section subsection paragraph textbf textit cite ref label newcommand centering',
      proto: 'syntax package import option message enum service rpc returns repeated optional required string int32 int64 uint32 uint64 bool bytes double float map oneof reserved extend',
      graphql: 'query mutation subscription fragment on type input enum interface union scalar schema extend directive implements',
      cmake: 'cmake_minimum_required project add_executable add_library target_link_libraries set if elseif else endif foreach endforeach function endfunction include find_package option message install',
      make: 'ifeq ifneq ifdef ifndef else endif include export define endef',
      docker: 'FROM RUN CMD LABEL MAINTAINER EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL AS',
      rb: 'def end class module if elsif else unless while until for do return require attr_accessor self nil true false puts',
      sql: 'select from where group by order limit join left right inner outer on as insert into values update set delete create table alter drop index and or not null',
      md: '',
    }

    /** Words a language ships as ambient names: colored apart from user identifiers. */
    const BUILTINS = {
      py: 'self cls print len range str int float bool list dict set tuple bytes bytearray object type isinstance issubclass super open enumerate zip map filter sorted reversed sum min max abs round any all repr hash id iter next getattr setattr hasattr delattr property staticmethod classmethod Exception BaseException ValueError TypeError KeyError IndexError RuntimeError OSError __init__ __name__ __main__ __str__ __repr__ __len__ __iter__ __next__ __enter__ __exit__',
      cpp: 'std size_t ptrdiff_t nullptr_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t string vector map set unordered_map unordered_set shared_ptr unique_ptr weak_ptr optional pair tuple array deque list stack queue ostream istream ostringstream istringstream cout cerr cin endl printf malloc free memcpy memset strlen strcmp',
      c: 'printf fprintf sprintf snprintf scanf malloc calloc realloc free memcpy memset strlen strcmp strcpy strcat size_t FILE NULL',
      csharp: 'Console String StringBuilder List Dictionary HashSet IEnumerable IList Task Math Array Exception Convert Int32 Int64 Double Boolean Object',
      kotlin: 'println print listOf mutableListOf mapOf mutableMapOf setOf String Int Long Double Float Boolean Any Unit Pair Triple',
      swift: 'print String Int Double Float Bool Array Dictionary Set Optional Result',
      dart: 'print String int double bool List Map Set Future Stream Object num',
      php: 'echo print_r var_dump count strlen array_merge in_array explode implode str_replace preg_match json_encode json_decode',
      r: 'print cat paste library require data.frame c list matrix vector mean sum',
      lua: 'print pairs ipairs require tostring tonumber type table string math io os',
      perl: 'print warn die my local scalar @_ $_ @ARGV %ENV',
      go: 'fmt make len cap append copy delete panic recover string int int64 float64 bool byte rune error',
      rs: 'println vec Some None Ok Err Box Rc Arc RefCell HashMap Vec String',
      java: 'System String Integer Long Double Boolean Math List Map Set ArrayList HashMap HashSet',
      ruby: 'puts print p require attr_reader attr_writer attr_accessor new initialize',
      scala: 'println print List Map Set Seq Option Some None Future',
      haskell: 'putStrLn print show read map filter foldr foldl Maybe Just Nothing',
      elixir: 'IO.Utils IO.puts IO.inspect Enum.map Enum.filter String.length',
      erlang: 'io io:format lists maps string',
      clojure: 'println print map filter reduce str',
    }

    const LANG = {
      js: { kw: 'js', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: true },
      ts: { kw: 'ts', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: true },
      json: { kw: 'json', line: null, block: null, quote: ['"'], template: false, jsonKeys: true },
      jsonc: { kw: 'json', line: '//', block: ['/*', '*/'], quote: ['"'], template: false, jsonKeys: true },
      py: {
        kw: 'py', line: '#', block: null, quote: ['"', "'"], template: false,
        triple: ['"""', "'''"], decorator: true, prefix: true, builtins: 'py',
      },
      sh: { kw: 'sh', line: '#', block: null, quote: ['"', "'"], template: false, dollarVars: true },
      css: { kw: 'css', line: null, block: ['/*', '*/'], quote: ['"', "'"], template: false },
      yaml: { kw: 'yaml', line: '#', block: null, quote: ['"', "'"], template: false },
      ini: { kw: 'ini', line: '#', block: null, quote: ['"', "'"], template: false },
      go: { kw: 'go', line: '//', block: ['/*', '*/'], quote: ['"'], template: false, builtins: 'go' },
      rs: { kw: 'rs', line: '//', block: ['/*', '*/'], quote: ['"'], template: false, builtins: 'rs' },
      java: { kw: 'java', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false, builtins: 'java' },
      c: { kw: 'c', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false, preprocessor: true, builtins: 'c' },
      cpp: { kw: 'cpp', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false, preprocessor: true, builtins: 'cpp' },
      kotlin: {
        kw: 'kotlin', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false,
        triple: ['"""'], builtins: 'kotlin',
      },
      scala: {
        kw: 'scala', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false,
        triple: ['"""'], builtins: 'scala',
      },
      csharp: {
        kw: 'csharp', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false, builtins: 'csharp',
      },
      swift: {
        kw: 'swift', line: '//', block: ['/*', '*/'], quote: ['"'], template: false,
        triple: ['"""'], builtins: 'swift',
      },
      dart: {
        kw: 'dart', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false,
        triple: ['"""', "'''"], builtins: 'dart',
      },
      php: {
        kw: 'php', line: '//', lineAlt: '#', block: ['/*', '*/'], quote: ['"', "'"], template: false,
        dollarVars: true, builtins: 'php',
      },
      perl: { kw: 'perl', line: '#', block: null, quote: ['"', "'"], template: false, builtins: 'perl' },
      lua: {
        kw: 'lua', line: '--', block: ['--[[', ']]'], quote: ['"', "'"], template: false,
        blockCommentFirst: true, builtins: 'lua',
      },
      r: { kw: 'r', line: '#', block: null, quote: ['"', "'"], template: false, builtins: 'r' },
      julia: {
        kw: 'julia', line: '#', block: ['#=', '=#'], quote: ['"', "'"], template: false,
        triple: ['"""'], blockCommentFirst: true,
      },
      haskell: { kw: 'haskell', line: '--', block: ['{-', '-}'], quote: ['"', "'"], template: false, blockCommentFirst: true, builtins: 'haskell' },
      elixir: {
        kw: 'elixir', line: '#', block: null, quote: ['"', "'"], template: false,
        triple: ['"""'], builtins: 'elixir',
      },
      erlang: { kw: 'erlang', line: '%', block: null, quote: ['"', "'"], template: false, builtins: 'erlang' },
      clojure: { kw: 'clojure', line: ';', block: null, quote: ['"'], template: false, builtins: 'clojure' },
      elm: { kw: 'elm', line: '--', block: ['{-', '-}'], quote: ['"', "'"], template: false, blockCommentFirst: true },
      fsharp: { kw: 'fsharp', line: '//', block: ['(*', '*)'], quote: ['"', "'"], template: false, blockCommentFirst: true },
      ocaml: { kw: 'ocaml', line: null, block: ['(*', '*)'], quote: ['"', "'"], template: false },
      nim: { kw: 'nim', line: '#', block: ['#[', ']#'], quote: ['"', "'"], template: false, triple: ['"""'], blockCommentFirst: true },
      zig: { kw: 'zig', line: '//', block: null, quote: ['"'], template: false },
      solidity: { kw: 'solidity', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false },
      groovy: { kw: 'groovy', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false, triple: ['"""', "'''"] },
      hcl: { kw: 'hcl', line: '#', lineAlt: '//', block: ['/*', '*/'], quote: ['"'], template: false },
      nix: { kw: 'nix', line: '#', block: ['/*', '*/'], quote: ['"'], template: false },
      powershell: {
        kw: 'powershell', line: '#', block: ['<#', '#>'], quote: ['"', "'"], template: false,
        dollarVars: true, blockCommentFirst: true,
      },
      batch: { kw: 'batch', line: '::', block: null, quote: ['"'], template: false },
      asm: { kw: 'asm', line: ';', block: null, quote: ['"', "'"], template: false },
      vim: { kw: 'vim', line: '"', block: null, quote: ["'"], template: false },
      tex: { kw: 'tex', line: '%', block: null, quote: [], template: false, backslashCommands: true },
      proto: { kw: 'proto', line: '//', block: ['/*', '*/'], quote: ['"', "'"], template: false },
      graphql: {
        kw: 'graphql', line: '#', block: null, quote: ['"'], template: false, triple: ['"""'],
      },
      cmake: { kw: 'cmake', line: '#', block: null, quote: ['"'], template: false },
      make: { kw: 'make', line: '#', block: null, quote: ['"', "'"], template: false },
      docker: { kw: 'docker', line: '#', block: null, quote: ['"', "'"], template: false },
      sql: { kw: 'sql', line: '--', block: ['/*', '*/'], quote: ["'"], template: false, blockCommentFirst: true },
      rb: { kw: 'rb', line: '#', block: null, quote: ['"', "'"], template: false, builtins: 'ruby' },
      markup: { markup: true },
      diff: { diff: true },
      md: { kw: 'md', line: null, block: null, quote: [], template: false },
    }


    const WORDSETS = {}
    for (const key of Object.keys(WORDS)) WORDSETS[key] = new Set(WORDS[key].split(/\s+/u).filter(Boolean))
    const BUILTINSETS = {}
    for (const key of Object.keys(BUILTINS)) BUILTINSETS[key] = new Set(BUILTINS[key].split(/\s+/u).filter(Boolean))

    const IDENT_START = /[A-Za-z_$]/u
    const IDENT_PART = /[A-Za-z0-9_$]/u
    const DIGIT = /[0-9]/u

    /** Scan one string literal starting at its opening quote; returns the exclusive end and whether it closed. */
    function scanQuoted(line, start, quote) {
      let stop = start + 1
      while (stop < line.length) {
        if (line[stop] === '\\') { stop += 2; continue }
        if (line[stop] === quote) return { stop: stop + 1, closed: true }
        stop += 1
      }
      return { stop, closed: false }
    }

    /** One markup line: tags, attribute names, attribute strings, comments. */
    function scanMarkupLine(line, state) {
      const tokens = []
      let plain = ''
      let index = 0
      const flush = () => { if (plain !== '') { tokens.push({ type: 'plain', text: plain }); plain = '' } }
      const push = (type, text) => { flush(); tokens.push({ type, text }) }
      while (index < line.length) {
        if (state.markupComment === true) {
          const end = line.indexOf('-->', index)
          if (end === -1) { push('comment', line.slice(index)); index = line.length; break }
          push('comment', line.slice(index, end + 3))
          index = end + 3
          state.markupComment = false
          continue
        }
        if (line.startsWith('<!--', index)) {
          state.markupComment = true
          continue
        }
        if (line[index] === '<' && /[A-Za-z/!?]/u.test(line[index + 1] || '')) {
          flush()
          push('plain', '<')
          index += 1
          if (line[index] === '/') { push('plain', '/'); index += 1 }
          const nameStart = index
          while (index < line.length && /[A-Za-z0-9:_.-]/u.test(line[index])) index += 1
          if (index > nameStart) push('keyword', line.slice(nameStart, index))
          while (index < line.length && line[index] !== '>') {
            const char = line[index]
            if (char === '"' || char === "'") {
              const scanned = scanQuoted(line, index, char)
              push('string', line.slice(index, scanned.stop))
              index = scanned.stop
              continue
            }
            if (/[A-Za-z_@:.[-]/u.test(char)) {
              let stop = index + 1
              while (stop < line.length && /[A-Za-z0-9_:.[-]/u.test(line[stop])) stop += 1
              push('type', line.slice(index, stop))
              index = stop
              continue
            }
            push('plain', char)
            index += 1
          }
          if (index < line.length && line[index] === '>') { push('plain', '>'); index += 1 }
          continue
        }
        plain += line[index]
        index += 1
      }
      flush()
      return tokens
    }

    /** One patch line: added, removed, hunk, and file headers. */
    function scanDiffLine(line) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ')
        || line.startsWith('+++ ') || line.startsWith('new file') || line.startsWith('deleted file')) {
        return [{ type: 'meta', text: line }]
      }
      if (line.startsWith('@@')) return [{ type: 'keyword', text: line }]
      if (line.startsWith('+')) return [{ type: 'add', text: line }]
      if (line.startsWith('-')) return [{ type: 'del', text: line }]
      return [{ type: 'plain', text: line }]
    }

    /**
     * One line of tokens. `state` carries an open block comment, template
     * literal, or triple-quoted string across lines; each language opts into the
     * constructs it has (Python triples/decorators/prefixes, C preprocessor
     * lines, JSON property names).
     */
    function scanLine(line, state, lang) {
      const cfg = LANG[lang]
      if (cfg === undefined) return [{ type: 'plain', text: line }]
      if (cfg.markup === true) return scanMarkupLine(line, state)
      if (cfg.diff === true) return scanDiffLine(line)
      // Preprocessor directives own their line: `#include <x>` is one unit.
      if (cfg.preprocessor === true && /^\s*#/u.test(line)) return [{ type: 'meta', text: line }]
      const words = WORDSETS[cfg.kw] || new Set()
      const builtins = cfg.builtins === undefined ? new Set() : (BUILTINSETS[cfg.builtins] || new Set())
      const tokens = []
      let plain = ''
      let index = 0
      const flush = () => { if (plain !== '') { tokens.push({ type: 'plain', text: plain }); plain = '' } }
      const push = (type, text) => { flush(); tokens.push({ type, text }) }

      while (index < line.length) {
        if (state.triple !== null) {
          const end = line.indexOf(state.triple, index)
          if (end === -1) { push('string', line.slice(index)); index = line.length; break }
          const stop = end + state.triple.length
          push('string', line.slice(index, stop))
          index = stop
          state.triple = null
          continue
        }
        if (state.block !== null) {
          const end = line.indexOf(state.block, index)
          if (end === -1) { push('comment', line.slice(index)); index = line.length; break }
          const stop = end + state.block.length
          push('comment', line.slice(index, stop))
          index = stop
          state.block = null
          continue
        }
        if (state.template) {
          const end = line.indexOf('`', index)
          if (end === -1) { push('string', line.slice(index)); index = line.length; break }
          let stop = end
          // An even backslash run before the backtick means it is escaped.
          let slashes = 0
          while (stop - 1 - slashes >= index && line[stop - 1 - slashes] === '\\') slashes += 1
          if (slashes % 2 === 1) {
            push('string', line.slice(index, end + 1))
            index = end + 1
            continue
          }
          push('string', line.slice(index, end + 1))
          index = end + 1
          state.template = false
          continue
        }
        // Block openers first: languages such as Lua (`--[[`) and Julia (`#=`)
        // share their line-comment prefix with the block opener.
        if (cfg.block !== null && line.startsWith(cfg.block[0], index)) {
          // Do not consume the opener: the comment token below includes it.
          state.block = cfg.block[1]
          continue
        }
        if ((cfg.line !== null && line.startsWith(cfg.line, index))
          || (cfg.lineAlt !== undefined && line.startsWith(cfg.lineAlt, index))) {
          push('comment', line.slice(index))
          index = line.length
          break
        }
        if (cfg.triple !== undefined) {
          const delimiter = cfg.triple.find(candidate => line.startsWith(candidate, index))
          if (delimiter !== undefined) {
            const close = line.indexOf(delimiter, index + delimiter.length)
            if (close === -1) {
              push('string', line.slice(index))
              index = line.length
              state.triple = delimiter
              break
            }
            const stop = close + delimiter.length
            push('string', line.slice(index, stop))
            index = stop
            continue
          }
        }
        const char = line[index]
        if (cfg.decorator === true && char === '@' && IDENT_START.test(line[index + 1] || '')) {
          let stop = index + 2
          while (stop < line.length && /[A-Za-z0-9_$.]/u.test(line[stop])) stop += 1
          push('decorator', line.slice(index, stop))
          index = stop
          continue
        }
        if (cfg.quote.includes(char)) {
          const scanned = scanQuoted(line, index, char)
          let type = 'string'
          if (cfg.jsonKeys === true) {
            let look = scanned.stop
            while (look < line.length && (line[look] === ' ' || line[look] === '\t')) look += 1
            if (line[look] === ':') type = 'key'
          }
          push(type, line.slice(index, scanned.stop))
          index = scanned.stop
          continue
        }
        if (char === '`' && cfg.template) {
          const scanned = scanQuoted(line, index, '`')
          if (!scanned.closed) state.template = true
          push('string', line.slice(index, scanned.stop))
          index = scanned.stop
          continue
        }
        if (DIGIT.test(char) && !IDENT_PART.test(line[index - 1] || '')) {
          let stop = index + 1
          while (stop < line.length && /[0-9a-fA-FxX._eE+-]/u.test(line[stop])) stop += 1
          push('number', line.slice(index, stop))
          index = stop
          continue
        }
        if (cfg.dollarVars === true && char === '$' && IDENT_START.test(line[index + 1] || '')) {
          let stop = index + 2
          while (stop < line.length && IDENT_PART.test(line[stop])) stop += 1
          push('builtin', line.slice(index, stop))
          index = stop
          continue
        }
        if (cfg.backslashCommands === true && char === '\\' && /[A-Za-z]/u.test(line[index + 1] || '')) {
          let stop = index + 2
          while (stop < line.length && /[A-Za-z]/u.test(line[stop])) stop += 1
          push('keyword', line.slice(index, stop))
          index = stop
          continue
        }
        if (IDENT_START.test(char)) {
          let stop = index + 1
          while (stop < line.length && IDENT_PART.test(line[stop])) stop += 1
          const word = line.slice(index, stop)
          // Python string prefixes (`f"…"`, `rb'…'`) belong to the literal.
          if (cfg.prefix === true && /^(?:[rRbBuUfF]{1,2})$/u.test(word)
            && (line[stop] === '"' || line[stop] === "'")) {
            const quote = line[stop]
            const triple = quote.repeat(3)
            if (line.startsWith(triple, stop)) {
              const closeAt = line.indexOf(triple, stop + 3)
              if (closeAt === -1) {
                push('string', line.slice(index))
                index = line.length
                state.triple = triple
                break
              }
              push('string', line.slice(index, closeAt + 3))
              index = closeAt + 3
              continue
            }
            const scanned = scanQuoted(line, stop, quote)
            push('string', line.slice(index, scanned.stop))
            index = scanned.stop
            continue
          }
          if (words.has(word)) push('keyword', word)
          else if (builtins.has(word)) push('builtin', word)
          else if (/^[A-Z][A-Za-z0-9_$]*$/u.test(word)) push('type', word)
          else { plain += word }
          index = stop
          continue
        }
        plain += char
        index += 1
      }
      flush()
      return tokens
    }

    /** Highlight one file body into per-line token arrays. */
    function highlightLines(text, lang) {
      const state = { block: null, template: false, triple: null }
      return text.split('\n').map(line => scanLine(line, state, lang))
    }

    /** Turn patch text into per-file blocks of classified lines. */
    function parseDiff(text) {
      const blocks = []
      let current = null
      for (const line of text.split('\n')) {
        if (line.startsWith('diff --git ')) {
          const match = /^diff --git a\/(.*?) b\/(.*)$/u.exec(line)
          current = { path: match === null ? line.slice(11) : match[2], lines: [] }
          blocks.push(current)
          continue
        }
        if (current === null) continue
        if (line.startsWith('index ') || line.startsWith('new file mode') || line.startsWith('deleted file mode')
          || line.startsWith('similarity index') || line.startsWith('dissimilarity index')
          || line.startsWith('rename from') || line.startsWith('rename to')
          || line.startsWith('old mode') || line.startsWith('new mode')) continue
        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
          current.lines.push({ kind: 'meta', text: line })
          continue
        }
        if (line.startsWith('@@')) current.lines.push({ kind: 'hunk', text: line })
        else if (line.startsWith('+')) current.lines.push({ kind: 'add', text: line })
        else if (line.startsWith('-')) current.lines.push({ kind: 'del', text: line })
        else current.lines.push({ kind: 'ctx', text: line })
      }
      return blocks
    }

    /* ---------------------------------------------------------------- markdown */

    /** Remove JSONC comments outside strings so a JSONC body can be reformatted. */
    function stripJsonComments(text) {
      let out = ''
      let index = 0
      let inString = false
      while (index < text.length) {
        const char = text[index]
        if (inString) {
          out += char
          if (char === '\\') { out += text[index + 1] || ''; index += 2; continue }
          if (char === '"') inString = false
          index += 1
          continue
        }
        if (char === '"') { inString = true; out += char; index += 1; continue }
        if (char === '/' && text[index + 1] === '/') {
          while (index < text.length && text[index] !== '\n') index += 1
          continue
        }
        if (char === '/' && text[index + 1] === '*') {
          index += 2
          while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
          index += 2
          continue
        }
        out += char
        index += 1
      }
      return out
    }

    /** Fence info string to a highlighter key. */
    function fenceLanguage(info) {
      const name = String(info || '').trim().toLowerCase()
      if (name === '') return 'txt'
      if (name === 'py' || name === 'python' || name === 'python3') return 'py'
      if (name === 'c') return 'c'
      if (name === 'cpp' || name === 'c++' || name === 'cxx' || name === 'hpp') return 'cpp'
      if (name === 'json' || name === 'jsonc') return 'json'
      if (name === 'js' || name === 'javascript' || name === 'jsx' || name === 'node') return 'js'
      if (name === 'ts' || name === 'typescript' || name === 'tsx') return 'ts'
      if (name === 'sh' || name === 'bash' || name === 'shell' || name === 'zsh' || name === 'console') return 'sh'
      if (name === 'go' || name === 'golang') return 'go'
      if (name === 'rs' || name === 'rust') return 'rs'
      if (name === 'java' || name === 'kotlin' || name === 'kt') return 'java'
      if (name === 'sql') return 'sql'
      if (name === 'rb' || name === 'ruby') return 'rb'
      if (name === 'yml' || name === 'yaml') return 'yaml'
      return languageOf(`x.${name}`)
    }

    /** Inline spans of one Markdown line: code, strong, emphasis, strike, links. */
    function parseInline(text) {
      const nodes = []
      let buffer = ''
      let index = 0
      const flush = () => { if (buffer !== '') { nodes.push({ kind: 'text', text: buffer }); buffer = '' } }
      const take = (kind, start, stop, href) => {
        flush()
        nodes.push(href === undefined ? { kind, text: text.slice(start, stop) } : { kind, text: text.slice(start, stop), href })
      }
      while (index < text.length) {
        const char = text[index]
        if (char === '`') {
          const end = text.indexOf('`', index + 1)
          if (end > index + 1) { take('code', index + 1, end); index = end + 1; continue }
        }
        if (text.startsWith('**', index)) {
          const end = text.indexOf('**', index + 2)
          if (end > index + 2) { take('strong', index + 2, end); index = end + 2; continue }
        }
        if (text.startsWith('~~', index)) {
          const end = text.indexOf('~~', index + 2)
          if (end > index + 2) { take('strike', index + 2, end); index = end + 2; continue }
        }
        if (char === '*' || char === '_') {
          // `_` inside a word (snake_case) is text, not emphasis.
          const wordBefore = index > 0 && /[A-Za-z0-9]/u.test(text[index - 1])
          if (!(char === '_' && wordBefore)) {
            const end = text.indexOf(char, index + 1)
            if (end > index + 1) {
              const wordAfter = end + 1 < text.length && /[A-Za-z0-9]/u.test(text[end + 1])
              if (!(char === '_' && wordAfter)) { take('em', index + 1, end); index = end + 1; continue }
            }
          }
        }
        if (char === '[') {
          const close = text.indexOf(']', index + 1)
          if (close > index + 1 && text[close + 1] === '(') {
            const end = text.indexOf(')', close + 2)
            if (end > close + 2) {
              take('link', index + 1, close, text.slice(close + 2, end))
              index = end + 1
              continue
            }
          }
        }
        buffer += char
        index += 1
      }
      flush()
      return nodes
    }

    /** Parse a Markdown body into blocks: headings, paragraphs, fences, lists, quotes, rules. */
    function parseMarkdown(text) {
      const lines = String(text || '').split('\n')
      const blocks = []
      let paragraph = []
      let index = 0
      const flush = () => {
        if (paragraph.length > 0) { blocks.push({ kind: 'p', text: paragraph.join('\n') }); paragraph = [] }
      }
      while (index < lines.length) {
        const line = lines[index]
        const fence = /^\s*(`{3,}|~{3,})\s*([\w+#-]*)\s*$/u.exec(line)
        if (fence !== null) {
          flush()
          const marker = fence[1][0]
          const closing = new RegExp(`^\\s*${marker}{${fence[1].length},}\\s*$`, 'u')
          const body = []
          index += 1
          while (index < lines.length && !closing.test(lines[index])) { body.push(lines[index]); index += 1 }
          index += 1
          blocks.push({ kind: 'code', lang: fence[2] || '', text: body.join('\n') })
          continue
        }
        const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/u.exec(line)
        if (heading !== null) {
          flush()
          blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] })
          index += 1
          continue
        }
        if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/u.test(line)) {
          flush()
          blocks.push({ kind: 'hr' })
          index += 1
          continue
        }
        if (/^\s*>/u.test(line)) {
          flush()
          const quoted = []
          while (index < lines.length && /^\s*>/u.test(lines[index])) {
            quoted.push(lines[index].replace(/^\s*>\s?/u, ''))
            index += 1
          }
          blocks.push({ kind: 'quote', text: quoted.join('\n') })
          continue
        }
        const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/u.exec(line)
        if (item !== null) {
          flush()
          const ordered = /\d/u.test(item[2])
          const items = []
          while (index < lines.length) {
            const next = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/u.exec(lines[index])
            if (next === null || /\d/u.test(next[2]) !== ordered) break
            items.push({ indent: Math.min(4, Math.floor(next[1].length / 2)), text: next[3] })
            index += 1
          }
          blocks.push({ kind: 'list', ordered, items })
          continue
        }
        if (line.trim() === '') { flush(); index += 1; continue }
        paragraph.push(line.replace(/\s+$/u, ''))
        index += 1
      }
      flush()
      return blocks
    }

    /** Inline Markdown nodes as React spans. */
    function renderInline(text) {
      return parseInline(text).map((node, index) => {
        if (node.kind === 'code') return h('code', { key: index, className: 'dcv-md-code' }, node.text)
        if (node.kind === 'strong') return h('strong', { key: index }, node.text)
        if (node.kind === 'em') return h('em', { key: index }, node.text)
        if (node.kind === 'strike') return h('del', { key: index }, node.text)
        if (node.kind === 'link') {
          if (/^https?:\/\//iu.test(node.href)) {
            return h('a', {
              key: index, className: 'dcv-md-link', href: node.href,
              target: '_blank', rel: 'noreferrer noopener',
            }, node.text)
          }
          return h('span', { key: index, className: 'dcv-md-link', title: node.href }, node.text)
        }
        return h('span', { key: index }, node.text)
      })
    }

    /** One Markdown block as its rendered element. */
    function renderBlock(block, key) {
      if (block.kind === 'h') {
        return h('div', { key, className: `dcv-md-h dcv-md-h${block.level}` }, renderInline(block.text))
      }
      if (block.kind === 'p') return h('p', { key, className: 'dcv-md-p' }, renderInline(block.text))
      if (block.kind === 'code') {
        const lang = fenceLanguage(block.lang)
        if (lang === 'txt') return h('pre', { key, className: 'dcv-md-pre' }, block.text)
        const lines = highlightLines(block.text, lang)
        return h('pre', { key, className: 'dcv-md-pre' },
          h('code', null, lines.map((tokens, lineIndex) => h('div', { key: lineIndex, className: 'dcv-md-codeLine' },
            tokens.length === 0 ? '\u200b' : tokens.map((token, tokenIndex) => h('span', {
              key: tokenIndex, className: `dcv-tok-${token.type}`,
            }, token.text))))))
      }
      if (block.kind === 'list') {
        return h(block.ordered ? 'ol' : 'ul', { key, className: 'dcv-md-list' },
          block.items.map((item, itemIndex) => h('li', {
            key: itemIndex,
            style: item.indent > 0 ? { marginLeft: item.indent * 14 } : undefined,
          }, renderInline(item.text))))
      }
      if (block.kind === 'quote') {
        return h('blockquote', { key, className: 'dcv-md-quote' },
          block.text.split('\n').map((line, lineIndex) => h('p', { key: lineIndex, className: 'dcv-md-p' }, renderInline(line))))
      }
      if (block.kind === 'hr') return h('hr', { key, className: 'dcv-md-hr' })
      return null
    }

    /** Rendered Markdown body. */
    function MarkdownView(props) {
      const blocks = useMemo(() => parseMarkdown(props.text), [props.text])
      return h('div', { className: 'dcv-md' }, blocks.map((block, index) => renderBlock(block, index)))
    }

    /** Strip ANSI escapes and non-printing control bytes from terminal output. */
    function stripAnsiSequences(text) {
      return String(text)
        .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, '')
        .replace(/\u001b[P^_][^\u001b]*\u001b\\/gu, '')
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
        .replace(/\u001b[@-_]/gu, '')
        .replace(/[\u0000-\u0007\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    }

    /** One snapshot screen as text lines plus the cursor at the last line. */
    function splitScreen(screen) {
      const lines = stripAnsiSequences(screen).replace(/\r\n/gu, '\n').split('\n')
      const last = lines[lines.length - 1]
      return { lines, cursor: { row: lines.length - 1, column: last.length } }
    }

    /**
     * Apply one output chunk to a text buffer with a cursor, so `\r` returns to
     * column 0 (progress bars, prompt redraws) without erasing what precedes it,
     * and later characters overwrite the current line in place.
     */
    function applyTerminalOutput(lines, cursor, chunk) {
      const next = lines.length === 0 ? [''] : lines.slice()
      let row = cursor !== undefined && cursor.row < next.length ? cursor.row : next.length - 1
      let column = cursor !== undefined && cursor.row === row ? cursor.column : next[row].length
      for (const char of stripAnsiSequences(chunk)) {
        if (char === '\n') {
          row += 1
          if (row >= next.length) next.push('')
          column = 0
          continue
        }
        if (char === '\r') { column = 0; continue }
        if (char === '\b') { column = Math.max(0, column - 1); continue }
        const line = next[row]
        next[row] = line.slice(0, column) + char + line.slice(column + 1)
        column += 1
        if (next[row].length > 4000) { next[row] = next[row].slice(-4000); column = Math.min(column, next[row].length) }
      }
      return { lines: next, cursor: { row, column } }
    }

    /** Ancestor directories of changed files, so collapsed folders can show a dot. */
    function changedDirectories(paths) {
      const dirs = new Set()
      for (const path of paths) {
        let slash = path.lastIndexOf('/')
        while (slash > 0) {
          dirs.add(path.slice(0, slash))
          slash = path.lastIndexOf('/', slash - 1)
        }
      }
      return dirs
    }

    /** Fixed palette for graph lanes; lane colors are artwork, so literals are correct here. */
    const LANE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#8b5cf6']
    const LANE_W = 14
    const ROW_H = 30

    /**
     * Assign graph lanes from commit parents in log order. Each lane holds the
     * hash expected at the next row; a commit's first parent inherits its lane,
     * further parents take an existing lane or open a new one on the right.
     */
    function buildGraph(commits) {
      const lanes = []
      const rows = []
      for (const commit of commits) {
        let lane = lanes.indexOf(commit.hash)
        const newTip = lane < 0
        if (newTip) { lane = lanes.length; lanes.push(commit.hash) }
        for (let index = lane + 1; index < lanes.length; index += 1) {
          if (lanes[index] === commit.hash) lanes[index] = null
        }
        const before = lanes.slice()
        const after = lanes.slice()
        after[lane] = null
        const parentLanes = []
        for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex += 1) {
          const parent = commit.parents[parentIndex]
          let target = after.indexOf(parent)
          if (target < 0) {
            if (parentIndex === 0) { target = lane; after[lane] = parent }
            else { target = after.length; after.push(parent) }
          }
          parentLanes.push(target)
        }
        while (after.length > 0 && after[after.length - 1] === null) after.pop()
        rows.push({
          commit,
          lane,
          newTip,
          parentLanes,
          beforeActive: before.map(value => value !== null),
          afterLength: after.length,
          laneCount: Math.max(before.length, after.length, lane + 1),
        })
        lanes.length = 0
        for (const value of after) lanes.push(value)
      }
      return rows
    }

    /** Lane color for one column. */
    function laneColor(lane) {
      return LANE_COLORS[((lane % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length]
    }

    /** One commit row's lane artwork. */
    function LaneArt(props) {
      const { lane, laneCount, parentLanes, newTip, beforeActive } = props
      const width = Math.max(1, laneCount) * LANE_W + 6
      const x = index => index * LANE_W + LANE_W / 2
      const children = []
      for (let index = 0; index < laneCount; index += 1) {
        if (index === lane) continue
        if (beforeActive[index] === true) {
          children.push(h('line', {
            key: 'v' + index, x1: x(index), x2: x(index), y1: 0, y2: ROW_H,
            stroke: laneColor(index), strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.85,
          }))
        }
      }
      if (!newTip) {
        children.push(h('line', {
          key: 'in', x1: x(lane), x2: x(lane), y1: 0, y2: ROW_H / 2,
          stroke: laneColor(lane), strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.85,
        }))
      }
      for (let index = 0; index < parentLanes.length; index += 1) {
        const target = parentLanes[index]
        const from = x(lane)
        const to = x(target)
        children.push(h('path', {
          key: 'p' + index,
          d: from === to
            ? `M${from},${ROW_H / 2} L${to},${ROW_H}`
            : `M${from},${ROW_H / 2} C${from},${ROW_H * 0.8} ${to},${ROW_H * 0.8} ${to},${ROW_H}`,
          fill: 'none', stroke: laneColor(target), strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.9,
        }))
      }
      children.push(h('circle', {
        key: 'node', cx: x(lane) + 0.5, cy: ROW_H / 2, r: 3.6,
        fill: laneColor(lane), stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.2,
      }))
      return h('svg', { className: 'dcv-lane', width, height: ROW_H, viewBox: `0 0 ${width} ${ROW_H}`, 'aria-hidden': true }, children)
    }

    /** Human byte count. */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    /** Absolute date and time for one commit. */
    function formatDate(seconds) {
      if (typeof seconds !== 'number' || seconds <= 0) return ''
      try {
        return new Intl.DateTimeFormat(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        }).format(new Date(seconds * 1000))
      } catch (_format) {
        return new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')
      }
    }

    /** The localized sentence for one workspace-file failure code. */
    function failureText(t, error, fallbackKey) {
      const fallback = fallbackKey === undefined ? 'doc.error' : fallbackKey
      const code = error && typeof error.code === 'string' ? error.code : ''
      if (code === 'workspace-file/not-text') return t('doc.notText')
      if (code === 'workspace-file/too-large') return t('doc.tooLarge')
      if (code === 'workspace-file/not-found') return t('doc.notFound')
      if (code === 'workspace-file/not-regular-file') return t('doc.notRegular')
      if (code === 'workspace-file/unavailable') return t('doc.unavailable')
      const message = error && typeof error.message === 'string' ? error.message : ''
      return message === '' ? t(fallback) : message
    }

    /** Sorted directory entries: folders first, then case-insensitive names. */
    function sortEntries(entries) {
      return entries.slice().sort((left, right) => {
        const leftDir = left.type === 'directory' ? 0 : 1
        const rightDir = right.type === 'directory' ? 0 : 1
        if (leftDir !== rightDir) return leftDir - rightDir
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
      })
    }

    /** JSON GET against this bundle's host route. */
    async function apiGet(path, params) {
      const query = new URLSearchParams(params).toString()
      const response = await fetch(`${API}${path}${query === '' ? '' : '?' + query}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      let body = null
      try { body = await response.json() } catch (_notJson) { body = null }
      if (!response.ok) {
        const message = body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
        const failure = new Error(message)
        failure.code = 'http'
        failure.status = response.status
        failure.body = body
        throw failure
      }
      return body
    }

    /** JSON POST with the same error shape as {@link apiGet}. */
    async function apiPost(path, payload, params) {
      const query = params === undefined ? '' : '?' + new URLSearchParams(params).toString()
      const response = await fetch(`${API}${path}${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      })
      let body = null
      try { body = await response.json() } catch (_notJson) { body = null }
      if (!response.ok) {
        const message = body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
        const failure = new Error(message)
        failure.code = 'http'
        failure.status = response.status
        failure.body = body
        throw failure
      }
      return body
    }

    /**
     * Turn one file's unified patch block into side-by-side rows: context lines
     * on both sides, a run of removals paired with the following run of
     * additions, and hunk headers spanning the table.
     */
    function splitFileRows(block) {
      const rows = []
      let oldLine = 0
      let newLine = 0
      let removed = []
      let added = []
      const flush = () => {
        const count = Math.max(removed.length, added.length)
        for (let index = 0; index < count; index += 1) {
          const left = removed[index]
          const right = added[index]
          rows.push({
            kind: 'change',
            oldNo: left === undefined ? null : left.no,
            oldText: left === undefined ? '' : left.text,
            newNo: right === undefined ? null : right.no,
            newText: right === undefined ? '' : right.text,
          })
        }
        removed = []
        added = []
      }
      for (const line of block.lines) {
        if (line.kind === 'meta') continue
        if (line.kind === 'hunk') {
          flush()
          const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line.text)
          if (header !== null) {
            oldLine = Number.parseInt(header[1], 10)
            newLine = Number.parseInt(header[2], 10)
          }
          rows.push({ kind: 'hunk', text: line.text })
          continue
        }
        if (line.kind === 'del') {
          removed.push({ no: oldLine, text: line.text.slice(1) })
          oldLine += 1
          continue
        }
        if (line.kind === 'add') {
          added.push({ no: newLine, text: line.text.slice(1) })
          newLine += 1
          continue
        }
        flush()
        const text = line.text.startsWith(' ') ? line.text.slice(1) : line.text
        rows.push({ kind: 'same', oldNo: oldLine, oldText: text, newNo: newLine, newText: text })
        oldLine += 1
        newLine += 1
      }
      flush()
      return rows
    }

    /* ---------------------------------------------------------- file icons
     * Artwork: Material Icon Theme 5.40.0 — MIT License.
     * Copyright (c) 2025 Material Extensions.
     * https://github.com/material-extensions/vscode-material-icon-theme
     * Vendored subset: file, folder, and default glyphs, inlined as data URLs.
     */
    const ICON_SVG = {
      "arduino": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0097a7\" d=\"M2 14h10v2H2zm22-4h2v10h-2z\"/><path fill=\"#0097a7\" d=\"M20 14h10v2H20z\"/><path fill=\"none\" stroke=\"#0097a7\" stroke-width=\"2\" d=\"M2 5h4a10 10 0 0 1 10 10 10 10 0 0 0 10 10h4\"/><path fill=\"#0097a7\" d=\"M11.644 22A8.95 8.95 0 0 1 6 24H2v2h4a10.98 10.98 0 0 0 8.479-4ZM26 4a10.98 10.98 0 0 0-8.479 4h2.835A8.95 8.95 0 0 1 26 6h4V4Z\"/></svg>",
      "audio": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ef5350\" d=\"M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2m6 10h-4v8a4 4 0 1 1-4-4 3.96 3.96 0 0 1 2 .555V8h6Z\"/></svg>",
      "babel": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#fdd835\" d=\"M18.23 11.21q-.045-.24-1.32-1.65c-.02-.19.29-.45.9-.8l1.74-1.55c.39-.5.62-1.28.69-2.38l-.02-.26c-.07-.78-.63-1.4-1.69-1.89-.63-.42-1.76-.65-3.38-.68-1.35.11-3.11.59-5.28 1.43-.6.43-1.28.86-2.04 1.28l.01.14.21-.08c.08-.01.13.03.14.11l.13-.07.07-.01.01.06c0 .07-.47.44-1.76 1.35l-.06.12c-.31.02-.61.25-.91.67l.08.12.25-.09.18.24c.32-.33.66-.62 1.03-.87.19.05.29.11.44.16 1.02-.75 2.03-1.3 3.04-1.64l.01.14c-.2.27-.32.42-.38.42l.1.23c.01.19-2.55 7-6.66 14.44l.08.19c.35-.08.58-.17.75-.26l.01.13.4-.03-.67 1.76.14.06c.57-.64 1-1.29 1.3-1.88 1.67-.49 2.94-.97 3.82-1.44.88-.08 1.56-.31 2.02-.7l.92-.47c1.27-.98 2.22-1.67 2.87-2.08 1.33-.98 2.2-1.93 2.6-2.85zm-3.46 2.31L13 14.91c-1.29.85-2 1.3-2.09 1.3-2.07 1.13-3.36 1.72-3.86 1.76l-.05.01c.04-.23.96-2.12 2.75-5.67.78-.06 2.02-.43 3.71-1.1l.41-.03c.85-.08 1.49.09 1.91.49l.03.26c-.31.9-.67 1.44-1.04 1.59m1.09-5.78q-.27.33-1.5 1.11c-.27.03-1.27.42-3.01 1.18l-.28-.05-.01-.12c-.02-.25.09-.57.34-.95.13-.7.28-1.12.44-1.2l1.45-3.28c-.02-.22.29-.35.93-.46l.21-.02.01.18 1.16-.16c1.15-.1 1.75.14 1.8.7l.13-.02-.03-.32.15-.02c.35.19.52.4.54.68.02.18-.08.41-.29.68-.09.01-.14-.06-.15-.18l-.14.01-.03.4c-.58.87-1.01 1.31-1.27 1.34z\"/></svg>",
      "c": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M19.563 22A5.57 5.57 0 0 1 14 16.437v-2.873A5.57 5.57 0 0 1 19.563 8H24V2h-4.437A11.563 11.563 0 0 0 8 13.563v2.873A11.564 11.564 0 0 0 19.563 28H24v-6Z\"/></svg>",
      "clojure": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><path fill=\"#64dd17\" d=\"M123.456 129.975a507 507 0 0 0-3.54 7.846c-4.406 9.981-9.284 22.127-11.066 29.908-.64 2.77-1.037 6.205-1.03 10.013 0 1.506.081 3.09.21 4.702a58.1 58.1 0 0 0 19.98 3.559 58.2 58.2 0 0 0 18.29-2.98c-1.352-1.237-2.642-2.554-3.816-4.038-7.796-9.942-12.146-24.512-19.028-49.01m-28.784-49.39C79.782 91.08 70.039 108.387 70.002 128c.037 19.32 9.487 36.403 24.002 46.94 3.56-14.83 12.485-28.41 25.868-55.63a219 219 0 0 0-2.714-7.083c-3.708-9.3-9.059-20.102-13.834-24.993-2.435-2.555-5.389-4.763-8.652-6.648\"/><path fill=\"#7cb342\" d=\"M178.532 194.535c-7.683-.963-14.023-2.124-19.57-4.081a69.4 69.4 0 0 1-30.958 7.249c-38.491 0-69.693-31.198-69.698-69.7 0-20.891 9.203-39.62 23.764-52.392-3.895-.94-7.956-1.49-12.104-1.482-20.45.193-42.037 11.51-51.025 42.075-.84 4.45-.64 7.813-.64 11.8 0 60.591 49.12 109.715 109.705 109.715 37.104 0 69.882-18.437 89.732-46.633-10.736 2.675-21.06 3.955-29.902 3.982-3.314 0-6.425-.177-9.305-.53\"/><path fill=\"#29b6f6\" d=\"M157.922 173.271c.678.336 2.213.884 4.35 1.49 14.375-10.553 23.717-27.552 23.754-46.764h-.005c-.055-32.03-25.974-57.945-58.011-58.009a58.2 58.2 0 0 0-18.213 2.961c11.779 13.426 17.443 32.613 22.922 53.6l.01.025c.01.017 1.752 5.828 4.743 13.538 2.97 7.7 7.203 17.231 11.818 24.178 3.03 4.655 6.363 8 8.632 8.981\"/><path fill=\"#1e88e5\" d=\"M128.009 18.29c-36.746 0-69.25 18.089-89.16 45.826 10.361-6.49 20.941-8.83 30.174-8.747 12.753.037 22.779 3.991 27.589 6.696a51 51 0 0 1 3.345 2.131 69.4 69.4 0 0 1 28.049-5.894c38.496.004 69.703 31.202 69.709 69.698h-.006c0 19.409-7.938 36.957-20.736 49.594 3.142.352 6.492.571 9.912.554 12.15.006 25.284-2.675 35.13-10.956 6.42-5.408 11.798-13.327 14.78-25.199.584-4.586.92-9.247.92-13.991 0-60.588-49.116-109.715-109.705-109.715\"/></svg>",
      "cmake": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#1e88e5\" d=\"M11.94 2.984 2.928 21.017l9.875-8.47z\"/><path fill=\"#e53935\" d=\"m11.958 2.982.002.29 1.312 14.499-.002.006.023.26 7.363 2.978h.415l-.158-.31-.114-.228h-.001l-8.84-17.494z\"/><path fill=\"#7cb342\" d=\"m8.558 16.13-5.627 4.884h17.743v-.016z\"/></svg>",
      "console": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#ff7043\" d=\"M2 2a1 1 0 0 0-1 1v10c0 .554.446 1 1 1h12c.554 0 1-.446 1-1V3a1 1 0 0 0-1-1zm0 3h12v8H2zm1 2 2 2-2 2 1 1 3-3-3-3zm5 3.5V12h5v-1.5z\"/></svg>",
      "cpp": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M28 14v-4h-2v4h-6v-4h-2v4h-4v2h4v4h2v-4h6v4h2v-4h4v-2z\"/><path fill=\"#0288d1\" d=\"M13.563 22A5.57 5.57 0 0 1 8 16.437v-2.873A5.57 5.57 0 0 1 13.563 8H18V2h-4.437A11.563 11.563 0 0 0 2 13.563v2.873A11.564 11.564 0 0 0 13.563 28H18v-6Z\"/></svg>",
      "csharp": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M30 14v-2h-2V8h-2v4h-2V8h-2v4h-2v2h2v2h-2v2h2v4h2v-4h2v4h2v-4h2v-2h-2v-2Zm-4 2h-2v-2h2Zm-12.437 6A5.57 5.57 0 0 1 8 16.437v-2.873A5.57 5.57 0 0 1 13.563 8H18V2h-4.437A11.563 11.563 0 0 0 2 13.563v2.873A11.564 11.564 0 0 0 13.563 28H18v-6Z\"/></svg>",
      "css": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#7e57c2\" d=\"M20 18h-2v-2h-2v2c0 .193 0 .703 1.254 1.033A3.345 3.345 0 0 1 20 22h2v2h2v-2c0-.388-.562-.851-1.254-1.034C20.356 20.34 20 18.84 20 18m-3.254 2.966C14.356 20.34 14 18.84 14 18h-2v-2h-2v8h2v-2h4v2h2v-2c0-.388-.562-.851-1.254-1.034\"/><path fill=\"#7e57c2\" d=\"M24 4H4v20a4 4 0 0 0 4 4h16.16A3.84 3.84 0 0 0 28 24.16V8a4 4 0 0 0-4-4m2 14h-2v-2h-2v2c0 .193 0 .703 1.254 1.033A3.345 3.345 0 0 1 26 22v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1 2-2h2a2 2 0 0 1 2 2Z\"/></svg>",
      "dart": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#4fc3f7\" d=\"M16.83 2a1.3 1.3 0 0 0-.916.377l-.013.01L7.323 7.34l8.556 8.55v.005l10.283 10.277 1.96-3.529-7.068-16.96-3.299-3.297A1.3 1.3 0 0 0 16.828 2Z\"/><path fill=\"#01579b\" d=\"m7.343 7.32-4.955 8.565-.01.013a1.297 1.297 0 0 0 .004 1.835l.005.005 4.106 4.107 16.064 6.314 3.632-2.015-.098-.098-.025.002L15.995 15.97h-.012z\"/><path fill=\"#01579b\" d=\"m7.321 7.324 8.753 8.755h.013L26.16 26.156l3.835-.73L30 14.089l-4.049-3.965a6.5 6.5 0 0 0-3.618-1.612l.002-.043L7.323 7.325Z\"/><path fill=\"#64b5f6\" d=\"m7.332 7.335 8.758 8.75v.013l10.079 10.071L25.436 30H14.09l-3.967-4.048a6.5 6.5 0 0 1-1.611-3.618l-.045.004Z\"/></svg>",
      "database": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ffca28\" d=\"M16 24c-5.525 0-10-.9-10-2v4c0 1.1 4.475 2 10 2s10-.9 10-2v-4c0 1.1-4.475 2-10 2m0-8c-5.525 0-10-.9-10-2v4c0 1.1 4.475 2 10 2s10-.9 10-2v-4c0 1.1-4.475 2-10 2m0-12C10.477 4 6 4.895 6 6v4c0 1.1 4.475 2 10 2s10-.9 10-2V6c0-1.105-4.477-2-10-2\"/></svg>",
      "docker": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#0288d1\" d=\"M21.81 10.25c-.06-.04-.56-.43-1.64-.43-.28 0-.56.03-.84.08-.21-1.4-1.38-2.11-1.43-2.14l-.29-.17-.18.27c-.24.36-.43.77-.51 1.19-.2.8-.08 1.56.33 2.21-.49.28-1.29.35-1.46.35H2.62c-.34 0-.62.28-.62.63 0 1.15.18 2.3.58 3.38.45 1.19 1.13 2.07 2 2.61.98.6 2.59.94 4.42.94.79 0 1.61-.07 2.42-.22 1.12-.2 2.2-.59 3.19-1.16A8.3 8.3 0 0 0 16.78 16c1.05-1.17 1.67-2.5 2.12-3.65h.19c1.14 0 1.85-.46 2.24-.85.26-.24.45-.53.59-.87l.08-.24zm-17.96.99h1.76c.08 0 .16-.07.16-.16V9.5c0-.08-.07-.16-.16-.16H3.85c-.09 0-.16.07-.16.16v1.58c.01.09.07.16.16.16m2.43 0h1.76c.08 0 .16-.07.16-.16V9.5c0-.08-.07-.16-.16-.16H6.28c-.09 0-.16.07-.16.16v1.58c.01.09.07.16.16.16m2.47 0h1.75c.1 0 .17-.07.17-.16V9.5c0-.08-.06-.16-.17-.16H8.75c-.08 0-.15.07-.15.16v1.58c0 .09.06.16.15.16m2.44 0h1.77c.08 0 .15-.07.15-.16V9.5c0-.08-.06-.16-.15-.16h-1.77c-.08 0-.15.07-.15.16v1.58c0 .09.07.16.15.16M6.28 9h1.76c.08 0 .16-.09.16-.18V7.25c0-.09-.07-.16-.16-.16H6.28c-.09 0-.16.06-.16.16v1.57c.01.09.07.18.16.18m2.47 0h1.75c.1 0 .17-.09.17-.18V7.25c0-.09-.06-.16-.17-.16H8.75c-.08 0-.15.06-.15.16v1.57c0 .09.06.18.15.18m2.44 0h1.77c.08 0 .15-.09.15-.18V7.25c0-.09-.07-.16-.15-.16h-1.77c-.08 0-.15.06-.15.16v1.57c0 .09.07.18.15.18m0-2.28h1.77c.08 0 .15-.07.15-.16V5c0-.1-.07-.17-.15-.17h-1.77c-.08 0-.15.06-.15.17v1.56c0 .08.07.16.15.16m2.46 4.52h1.76c.09 0 .16-.07.16-.16V9.5c0-.08-.07-.16-.16-.16h-1.76c-.08 0-.15.07-.15.16v1.58c0 .09.07.16.15.16\"/></svg>",
      "document": "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\"><path d=\"M0 0h24v24H0z\"/><path fill=\"#42a5f5\" d=\"M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm4 18H6V4h7v5h5z\"/></svg>",
      "editorconfig": "<svg xmlns=\"http://www.w3.org/2000/svg\" clip-rule=\"evenodd\" image-rendering=\"optimizeQuality\" shape-rendering=\"geometricPrecision\" text-rendering=\"geometricPrecision\" viewBox=\"0 0 3473 3473\"><path fill=\"#ede7f6\" d=\"M989.342 1977.409c41.146-26.835 75.137-93.922 54.564-141.33-56.353 24.151-53.67 79.61-54.564 141.33m636.877 153.851c44.724-14.311 87.66-64.402 63.509-116.283-34.886 24.151-57.248 57.247-63.51 116.284z\"/><g fill=\"#fafafa\"><path d=\"M374.827 2871.899c0 56.352 14.312 117.178 53.67 138.645 144.907 81.4 652.977 17.89 825.614-20.573 90.343-20.573 163.692-87.66 248.668-124.334 191.421-83.187 330.067-150.274 483.025-262.085 110.916-81.399 287.131-310.388 305.915-447.245l-151.169-33.991c-3.578 153.852-38.463 188.737-175.32 224.517-92.132 25.046-271.925 30.413-365.846 14.312-124.334-20.574-180.687-85.871-237.04-160.114-109.128-144.907 24.151-245.985-148.485-255.824-181.582 222.728-501.81 62.614-642.244 40.252-59.93 86.765-200.366 650.294-198.577 779.1 86.766-29.517 141.33 2.684 219.15 33.097 275.503 106.444 34.885 200.366-75.137 172.636-75.137-17.89-98.394-67.086-142.224-98.393m360.48-1285.383c111.81 21.468 211.1 67.982 305.915 115.39 154.747 76.926 182.476 66.192 196.788 173.53 1.789 19.68-1.789 30.413 54.564 48.303 94.816 29.518-54.564-23.257 199.471-22.362 151.169.894 497.337 61.72 609.148 132.384 46.513 29.519 37.568 67.087 194.999 62.615-1.79-185.16-50.986-461.557-123.44-631.51-88.554-205.733-205.733-237.04-444.561-313.966-139.54-44.725-549.217-93.922-676.235-15.207-118.967 74.243-141.33 162.798-252.246 318.439-32.202 45.619-43.83 80.504-64.403 132.384\"/><path d=\"M1720.14 1966.675c89.45 36.674-4.472 273.714-128.806 216.466-40.252-113.6 55.458-178.003 81.398-228.99-53.67-8.05-206.627-32.2-252.246-15.206-59.036 22.363-72.454 148.486-42.041 207.522 143.118 280.87 775.523 220.94 708.436 2.684-26.835-88.555-51.88-102.867-142.224-133.28-72.454-24.15-144.907-49.196-224.517-49.196m-1124.374-31.307c71.56 68.875 233.462 79.61 338.117 84.976 13.418-138.646 25.046-242.407 135.963-234.356 54.564 74.242 25.94 161.902-31.307 218.255 97.5-.894 153.852-74.242 139.54-180.687-82.293-59.036-331.856-177.109-457.084-194.104-34.885 37.569-120.756 243.301-125.229 305.916\"/></g><path d=\"M427.602 2820.913c59.036-5.367 212.889 39.357 225.412 89.449-95.71 11.628-217.361 2.683-225.412-89.45zm-52.775 50.986c43.83 31.307 67.087 80.504 142.224 98.393 110.022 27.73 350.64-66.192 75.137-172.636-77.82-30.413-132.384-62.614-219.15-33.096-1.789-128.807 138.646-692.336 198.577-779.101 140.435 22.362 460.662 182.476 642.244-40.252 172.636 9.84 39.357 110.917 148.485 255.824 56.353 74.243 112.706 139.54 237.04 160.114 93.921 16.1 273.714 10.734 365.846-14.312 136.857-35.78 171.742-70.665 175.32-224.517l151.17 33.99c-18.785 136.858-195 365.847-305.916 447.246-152.958 111.81-291.604 178.898-483.025 262.085-84.976 36.674-158.325 103.761-248.668 124.334-172.637 38.463-680.707 101.972-825.614 20.574-39.358-21.468-53.67-82.294-53.67-138.646M1626.22 2131.26c6.261-59.037 28.623-92.133 63.508-116.284 24.152 51.88-18.784 101.972-63.508 116.284m93.921-164.586c79.61 0 152.063 25.045 224.517 49.197 90.344 30.412 115.39 44.724 142.224 133.279 67.087 218.255-565.318 278.186-708.436-2.684-30.413-59.036-16.995-185.16 42.041-207.522 45.619-16.995 198.577 7.156 252.246 15.207-25.94 50.986-121.65 115.389-81.398 228.99 124.334 57.247 218.255-179.793 128.806-216.467m-730.798 10.734c.894-61.72-1.79-117.179 54.564-141.33 20.573 47.408-13.418 114.495-54.564 141.33m-393.576-42.041c4.473-62.615 90.344-268.347 125.229-305.916 125.228 16.995 374.791 135.068 457.084 194.104 14.312 106.445-42.04 179.793-139.54 180.687 57.247-56.353 85.87-144.013 31.307-218.255-110.917-8.05-122.545 95.71-135.963 234.356-104.655-5.367-266.558-16.1-338.117-84.976m-89.449-71.56c-33.096-91.238-33.096-233.462 107.339-245.09l-71.56 199.471c-18.783 42.936-18.783 33.096-35.779 45.62zm228.99-277.292c20.573-51.88 32.201-86.765 64.403-132.384 110.917-155.641 133.279-244.196 252.246-318.439 127.018-78.715 536.694-29.518 676.235 15.207 238.828 76.926 356.007 108.233 444.561 313.966 72.454 169.953 121.65 446.35 123.44 631.51-157.43 4.472-148.486-33.096-195-62.615-111.81-70.664-457.978-131.49-609.147-132.384-254.035-.895-104.655 51.88-199.471 22.362-56.353-17.89-52.775-28.624-54.564-48.302-14.312-107.34-42.041-96.605-196.788-173.531-94.816-47.408-194.104-93.922-305.915-115.39m1583.247-43.83c-16.995-56.352 14.312-52.775 68.876-91.238 31.307-22.362 56.353-45.619 94.816-67.086 144.013-80.504 412.36-93.922 526.854 1.789 46.514 38.463 122.545 113.6 110.917 211.994-24.151 195.893-158.325 303.232-268.347 392.68-111.811 91.239-297.865 185.16-490.18 122.546-16.101-39.358-3.578-288.92-22.363-381.053-16.995-82.293-8.05-91.238 39.358-140.435 139.54-144.907 441.878-250.457 613.62-126.123 72.454 53.67 51.88 74.243 89.449 115.39 46.513-50.092-40.252-218.256-360.48-207.522-217.36 7.156-311.282 177.109-402.52 169.058m-1302.377-508.964c4.472-124.335 118.967-381.948 233.461-471.397 138.646-107.338 283.554-208.416 496.442-87.66 52.775 29.519 50.092 44.725 55.459 118.073 4.472 70.665-1.79 96.605-19.679 153.852-141.33 456.19-259.402 194.105-712.014 302.338 16.995-148.485 145.802-280.87 217.361-349.746 122.545-118.967 211.1-195.893 395.365-170.847 50.986 84.976 56.352 138.646-5.367 237.934-82.293 132.385-102.867 124.334-90.344 214.678 64.403-16.101 84.082-78.715 113.6-141.33 179.793-375.686-81.398-421.305-241.512-352.429-107.339 45.62-298.76 256.719-361.374 383.736-12.523 25.046-25.94 57.248-37.568 84.977zm708.436 18.784c18.784-111.811 129.7-139.54 129.7-483.92 0-148.485-182.475-281.764-421.304-182.475-204.838 84.082-236.145 148.485-345.273 313.071-102.867 155.642-99.289 326.49-187.843 470.502-25.94 41.147-49.197 55.458-77.82 96.605-20.574 30.413-35.78 68.876-56.354 104.655-42.04 68.876-84.976 118.968-118.967 201.26-107.339 2.684-197.682 4.473-208.416 115.39-14.312 152.063 57.247 189.632 57.247 246.879-.894 61.72-251.351 684.285-181.581 1055.498 19.679 101.972 86.765 102.867 194.104 115.39 258.508 31.307 593.942 20.573 825.614-72.454l420.41-201.26c106.445-59.931 285.343-173.532 364.953-256.72 56.353-58.141 85.87-107.338 134.173-176.214 66.192-96.605 67.981-94.816 82.293-226.306 87.66 16.101 251.352 54.564 305.916 101.972-6.262 61.72-36.674 32.202-36.674 87.66 34.885.895 93.027-42.935 107.339-91.238-36.675-53.67-75.138-44.724-127.913-87.66 42.042-33.096 118.073-48.302 176.215-72.453 125.229-51.88 339.012-209.311 391.787-352.43 42.04-115.389 10.734-307.704-57.248-382.841-71.559-78.715-237.934-118.967-373.897-118.967-161.902 0-329.172 116.283-459.767 166.375-50.092-43.83-53.67-93.922-90.344-142.224-42.04-57.248-315.755-200.366-446.35-228.095\"/><path fill=\"#efebe9\" d=\"M2318.554 1542.686c91.238 8.05 185.16-161.902 402.52-169.058 320.228-10.734 406.993 157.43 360.48 207.521-37.569-41.146-16.995-61.72-89.45-115.389-171.741-124.334-474.079-18.784-613.62 126.123-47.407 49.197-56.352 58.142-39.357 140.435 18.785 92.133 6.262 341.695 22.362 381.053 192.316 62.614 378.37-31.307 490.181-122.545 110.022-89.45 244.196-196.788 268.347-392.681 11.628-98.394-64.403-173.531-110.917-211.994-114.494-95.71-382.841-82.293-526.854-1.79-38.463 21.468-63.51 44.725-94.816 67.087-54.564 38.464-85.871 34.886-68.876 91.238m-1302.377-508.964 43.83-77.821c11.628-27.73 25.045-59.93 37.568-84.977 62.614-127.017 254.035-338.117 361.374-383.736 160.114-68.876 421.305-23.257 241.512 352.43-29.518 62.614-49.197 125.228-113.6 141.329-12.523-90.344 8.05-82.293 90.344-214.678 61.72-99.288 56.353-152.958 5.367-237.934-184.265-25.046-272.82 51.88-395.365 170.847-71.56 68.876-200.366 201.26-217.361 349.746 452.612-108.233 570.685 153.852 712.014-302.338 17.89-57.247 24.151-83.187 19.679-153.852-5.367-73.348-2.684-88.554-55.459-118.073-212.888-120.756-357.796-19.678-496.442 87.66-114.494 89.45-228.989 347.062-233.461 471.397\"/><path fill=\"#eee\" d=\"M506.317 1863.808c16.996-12.523 16.996-2.683 35.78-45.619l71.559-199.47c-140.435 11.627-140.435 153.851-107.339 245.09z\"/><path fill=\"#efebe9\" d=\"M653.014 2910.362c-12.523-50.092-166.376-94.816-225.412-89.45 8.05 92.133 129.701 101.078 225.412 89.45\"/></svg>",
      "elixir": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#9575cd\" d=\"M12.173 22.681c-3.86 0-6.99-3.64-6.99-8.13 0-3.678 2.773-8.172 4.916-10.91 1.014-1.296 2.93-2.322 2.93-2.322s-.982 5.239 1.683 7.319c2.366 1.847 4.106 4.25 4.106 6.363 0 4.232-2.784 7.68-6.645 7.68\"/></svg>",
      "elm": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 323 323\"><path fill=\"#ffb300\" d=\"m106.716 99.763 54.785 54.782 54.779-54.782z\"/><path fill=\"#64dd17\" d=\"M96.881 89.93H216.83l-55.18-55.184H41.7zm131.546 11.593 59.705 59.704L228.16 221.2l-59.705-59.704z\"/><path fill=\"#00b8d4\" d=\"m175.552 34.746 112.703 112.695V34.746z\"/><path fill=\"#455a64\" d=\"m34.746 281.3 119.8-119.8-119.8-119.8z\"/><path fill=\"#ffb300\" d=\"m288.255 175.01-53.148 53.149 53.148 53.14z\"/><path fill=\"#00b8d4\" d=\"M281.3 288.254 161.5 168.455l-119.8 119.8z\"/></svg>",
      "erlang": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 30 30\"><path fill=\"#f44336\" d=\"M5.207 4.33q-.072.075-.143.153Q1.5 8.476 1.5 15.33c0 4.418 1.155 7.862 3.459 10.34h19.415c2.553-1.152 4.127-3.43 4.127-3.43l-3.147-2.52L23.9 21.1c-.867.773-.845.931-2.315 1.78-1.495.674-3.04.966-4.634.966-2.515 0-4.423-.909-5.723-2.059-1.286-1.15-1.985-4.511-2.096-6.68l17.458.067-.183-1.472s-.847-7.129-2.541-9.372zm8.76.846c1.565 0 3.22.535 3.961 1.471.74.937.931 1.667.973 3.524H9.11c.112-1.955.436-2.81 1.373-3.698.936-.887 2.03-1.297 3.484-1.297\"/></svg>",
      "eslint": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#3f51b5\" d=\"M22.713 4H9.287a.5.5 0 0 0-.432.248l-6.708 11.5a.5.5 0 0 0 0 .504l6.708 11.5a.5.5 0 0 0 .432.248h13.426a.5.5 0 0 0 .432-.248l6.708-11.5a.5.5 0 0 0 0-.504l-6.708-11.5A.5.5 0 0 0 22.713 4m-6.937 20.888-7.5-3.75A.5.5 0 0 1 8 20.691v-9.382a.5.5 0 0 1 .276-.447l7.5-3.75a.5.5 0 0 1 .448 0l7.5 3.75a.5.5 0 0 1 .276.447v9.382a.5.5 0 0 1-.276.447l-7.5 3.75a.5.5 0 0 1-.448 0\"/><path fill=\"#7986cb\" d=\"M22 19.441v-6.882a.5.5 0 0 0-.276-.447l-5.5-2.75a.5.5 0 0 0-.448 0l-5.5 2.75a.5.5 0 0 0-.276.447v6.882a.5.5 0 0 0 .276.447l5.5 2.75a.5.5 0 0 0 .448 0l5.5-2.75a.5.5 0 0 0 .276-.447\"/></svg>",
      "file": "<svg viewBox=\"0 0 16 16\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"m8.668 6h3.6641l-3.6641-3.668v3.668m-4.668-4.668h5.332l4 4v8c0 0.73828-0.59375 1.3359-1.332 1.3359h-8c-0.73828 0-1.332-0.59766-1.332-1.3359v-10.664c0-0.74219 0.59375-1.3359 1.332-1.3359m3.332 1.3359h-3.332v10.664h8v-6h-4.668z\" fill=\"#90a4ae\" /></svg>",
      "folder": "<svg viewBox=\"0 0 16 16\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\" fill=\"#90a4ae\" /></svg>",
      "folder-api": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#fbc02d\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#fffde7\" d=\"M10 9H8v1h3V7h-1zm4 0V7h-1v3h3V9Zm-6 4h2v2h1v-3H8Zm5 0v2h1v-2h2v-1h-3z\"/></svg>",
      "folder-api-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#fbc02d\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#fffde7\" d=\"M10 9H8v1h3V7h-1zm4 0V7h-1v3h3V9Zm-6 4h2v2h1v-3H8Zm5 0v2h1v-2h2v-1h-3z\"/></svg>",
      "folder-components": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#c0ca33\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#f0f4c3\" d=\"M6 10h4v4H6zm5 0h4v4h-4zM6 5h4v4H6zm4.172 2L13 4.172 15.829 7 13 9.829z\"/></svg>",
      "folder-components-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#c0ca33\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#f0f4c3\" d=\"M6 10h4v4H6zm5 0h4v4h-4zM6 5h4v4H6zm4.172 2L13 4.172 15.829 7 13 9.829z\"/></svg>",
      "folder-config": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#00acc1\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#80deea\" d=\"M11.5 12.075A1.6 1.6 0 0 1 9.882 10.5a1.62 1.62 0 1 1 1.62 1.575m3.437-1.138a4 4 0 0 0 .032-.438 4 4 0 0 0-.032-.45l.976-.733a.223.223 0 0 0 .056-.288l-.926-1.556a.23.23 0 0 0-.283-.1l-1.15.45a3.4 3.4 0 0 0-.783-.44l-.171-1.193A.23.23 0 0 0 12.425 6h-1.85a.23.23 0 0 0-.231.189l-.171 1.193a3.4 3.4 0 0 0-.781.44l-1.152-.45a.23.23 0 0 0-.282.1l-.926 1.556a.22.22 0 0 0 .056.288l.975.734a4 4 0 0 0-.032.45 4 4 0 0 0 .032.437l-.975.746a.22.22 0 0 0-.056.288l.925 1.558a.235.235 0 0 0 .283.099l1.152-.455a3.2 3.2 0 0 0 .781.446l.171 1.192a.23.23 0 0 0 .232.189h1.85a.23.23 0 0 0 .232-.189l.17-1.192a3.4 3.4 0 0 0 .783-.446l1.15.455a.24.24 0 0 0 .284-.1l.924-1.557a.223.223 0 0 0-.055-.288Z\"/></svg>",
      "folder-config-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#00acc1\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#80deea\" d=\"M11.5 12.075A1.6 1.6 0 0 1 9.882 10.5a1.62 1.62 0 1 1 1.62 1.575m3.437-1.138a4 4 0 0 0 .032-.438 4 4 0 0 0-.032-.45l.976-.733a.223.223 0 0 0 .056-.288l-.926-1.556a.23.23 0 0 0-.283-.1l-1.15.45a3.4 3.4 0 0 0-.783-.44l-.171-1.193A.23.23 0 0 0 12.425 6h-1.85a.23.23 0 0 0-.231.189l-.171 1.193a3.4 3.4 0 0 0-.781.44l-1.152-.45a.23.23 0 0 0-.282.1l-.926 1.556a.22.22 0 0 0 .056.288l.975.734a4 4 0 0 0-.032.45 4 4 0 0 0 .032.437l-.975.746a.22.22 0 0 0-.056.288l.925 1.558a.235.235 0 0 0 .283.099l1.152-.455a3.2 3.2 0 0 0 .781.446l.171 1.192a.23.23 0 0 0 .232.189h1.85a.23.23 0 0 0 .232-.189l.17-1.192a3.4 3.4 0 0 0 .783-.446l1.15.455a.24.24 0 0 0 .284-.1l.924-1.557a.223.223 0 0 0-.055-.288Z\"/></svg>",
      "folder-css": "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 16 16\"><defs><path id=\"a\" fill=\"#d1c4e9\" d=\"M7 10V9H6v4h1v-1h1v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1Zm5 0V9a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v1c0 .42.179 1.17 1.373 1.483.346.092.627.323.627.517v1h-1v-1H9v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1.67 1.67 0 0 0-1.373-1.483C10 10.352 10 10.097 10 10V9h1v1Zm4 0V9a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v1c0 .42.179 1.17 1.373 1.483.346.092.627.323.627.517v1h-1v-1h-1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1.67 1.67 0 0 0-1.373-1.483C14 10.352 14 10.097 14 10V9h1v1Z\"/></defs><path id=\"folder\" fill=\"#7e57c2\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><g id=\"motive\"><use xlink:href=\"#a\"/><use xlink:href=\"#a\"/></g></svg>",
      "folder-css-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 16 16\"><defs><path id=\"a\" fill=\"#d1c4e9\" d=\"M7 10V9H6v4h1v-1h1v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1Zm5 0V9a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v1c0 .42.179 1.17 1.373 1.483.346.092.627.323.627.517v1h-1v-1H9v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1.67 1.67 0 0 0-1.373-1.483C10 10.352 10 10.097 10 10V9h1v1Zm4 0V9a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v1c0 .42.179 1.17 1.373 1.483.346.092.627.323.627.517v1h-1v-1h-1v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1.67 1.67 0 0 0-1.373-1.483C14 10.352 14 10.097 14 10V9h1v1Z\"/></defs><path id=\"folder\" fill=\"#7e57c2\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><g id=\"motive\"><use xlink:href=\"#a\"/><use xlink:href=\"#a\"/></g></svg>",
      "folder-dist": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#e57373\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#ffcdd2\" d=\"M15 7h-2V6l-1-1h-2L9 6v1H7a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1m-5 0V6h2v1z\"/></svg>",
      "folder-dist-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#e57373\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#ffcdd2\" d=\"M15 7h-2V6l-1-1h-2L9 6v1H7a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1m-5 0V6h2v1z\"/></svg>",
      "folder-docs": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#0277bd\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#b3e5fc\" d=\"M12 5H8.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V8Zm0 8H9v-1h3zm2-2H9v-1h5zm-2.414-2.586V6L14 8.414Z\"/></svg>",
      "folder-docs-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#0277bd\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#b3e5fc\" d=\"M12 5H8.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V8Zm0 8H9v-1h3zm2-2H9v-1h5zm-2.414-2.586V6L14 8.414Z\"/></svg>",
      "folder-git": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#ff7043\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#ffccbc\" d=\"m6.297 9.295 2.892-2.897.846.85a.99.99 0 0 0 .465 1.116v2.772a1 1 0 0 0-.5.865 1.001 1.001 0 0 0 2.001 0 1 1 0 0 0-.5-.865V8.704l1.035 1.046a.6.6 0 0 0-.035.25 1.001 1.001 0 1 0 1.001-1.001.6.6 0 0 0-.25.035l-1.287-1.285a.99.99 0 0 0-.575-1.171 1.05 1.05 0 0 0-.64-.045l-.851-.846.396-.39a.987.987 0 0 1 1.41 0l3.998 3.998a.987.987 0 0 1 0 1.41l-3.998 3.998a.987.987 0 0 1-1.41 0l-3.998-3.998a.987.987 0 0 1 0-1.41\"/></svg>",
      "folder-git-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#ff7043\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#ffccbc\" d=\"m6.297 9.295 2.892-2.897.846.85a.99.99 0 0 0 .465 1.116v2.772a1 1 0 0 0-.5.865 1.001 1.001 0 0 0 2.001 0 1 1 0 0 0-.5-.865V8.704l1.035 1.046a.6.6 0 0 0-.035.25 1.001 1.001 0 1 0 1.001-1.001.6.6 0 0 0-.25.035l-1.287-1.285a.99.99 0 0 0-.575-1.171 1.05 1.05 0 0 0-.64-.045l-.851-.846.396-.39a.987.987 0 0 1 1.41 0l3.998 3.998a.987.987 0 0 1 0 1.41l-3.998 3.998a.987.987 0 0 1-1.41 0l-3.998-3.998a.987.987 0 0 1 0-1.41\"/></svg>",
      "folder-github": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#546e7a\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#eceff1\" d=\"M11.5 5A4.516 4.516 0 0 0 7 9.532a4.54 4.54 0 0 0 3.079 4.305c.225.036.296-.105.296-.226v-.766c-1.246.272-1.512-.607-1.512-.607a1.2 1.2 0 0 0-.499-.667c-.41-.28.031-.272.031-.272a.95.95 0 0 1 .689.466.963.963 0 0 0 1.31.377.98.98 0 0 1 .283-.607c-1-.114-2.047-.504-2.047-2.23a1.76 1.76 0 0 1 .463-1.228 1.63 1.63 0 0 1 .045-1.196s.377-.123 1.237.462a4.3 4.3 0 0 1 2.25 0c.86-.585 1.239-.462 1.239-.462a1.63 1.63 0 0 1 .044 1.196 1.76 1.76 0 0 1 .464 1.228c0 1.731-1.053 2.112-2.057 2.225a1.1 1.1 0 0 1 .311.839v1.242c0 .122.072.266.301.226A4.54 4.54 0 0 0 11.501 5\"/></svg>",
      "folder-github-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#546e7a\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#eceff1\" d=\"M11.5 5A4.516 4.516 0 0 0 7 9.532a4.54 4.54 0 0 0 3.079 4.305c.225.036.296-.105.296-.226v-.766c-1.246.272-1.512-.607-1.512-.607a1.2 1.2 0 0 0-.499-.667c-.41-.28.031-.272.031-.272a.95.95 0 0 1 .689.466.963.963 0 0 0 1.31.377.98.98 0 0 1 .283-.607c-1-.114-2.047-.504-2.047-2.23a1.76 1.76 0 0 1 .463-1.228 1.63 1.63 0 0 1 .045-1.196s.377-.123 1.237.462a4.3 4.3 0 0 1 2.25 0c.86-.585 1.239-.462 1.239-.462a1.63 1.63 0 0 1 .044 1.196 1.76 1.76 0 0 1 .464 1.228c0 1.731-1.053 2.112-2.057 2.225a1.1 1.1 0 0 1 .311.839v1.242c0 .122.072.266.301.226A4.54 4.54 0 0 0 11.501 5\"/></svg>",
      "folder-i18n": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#5c6bc0\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#c5cae9\" d=\"m11.395 11.881-1.154-1.13.014-.012A7.85 7.85 0 0 0 11.94 7.8h1.332v-.9H10.09V6h-.91v.9H6v.9h5.078a7.1 7.1 0 0 1-1.441 2.407A7 7 0 0 1 8.587 8.7h-.91a7.9 7.9 0 0 0 1.355 2.052L6.718 13.01l.646.64 2.272-2.25 1.414 1.399zm2.56-2.281h-.91L11 15h.909l.508-1.35h2.16L15.09 15H16Zm-1.192 3.15.737-1.949.737 1.949z\"/></svg>",
      "folder-i18n-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#5c6bc0\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#c5cae9\" d=\"m11.395 11.881-1.154-1.13.014-.012A7.85 7.85 0 0 0 11.94 7.8h1.332v-.9H10.09V6h-.91v.9H6v.9h5.078a7.1 7.1 0 0 1-1.441 2.407A7 7 0 0 1 8.587 8.7h-.91a7.9 7.9 0 0 0 1.355 2.052L6.718 13.01l.646.64 2.272-2.25 1.414 1.399zm2.56-2.281h-.91L11 15h.909l.508-1.35h2.16L15.09 15H16Zm-1.192 3.15.737-1.949.737 1.949z\"/></svg>",
      "folder-node": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#8bc34a\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#dcedc8\" d=\"M12.5 6 9 8.036v3.927L12.5 14l3.5-2.037V8.036Z\"/></svg>",
      "folder-node-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#8bc34a\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#dcedc8\" d=\"M12.5 6 9 8.036v3.927L12.5 14l3.5-2.037V8.036Z\"/></svg>",
      "folder-open": "<svg viewBox=\"0 0 16 16\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\" fill=\"#90a4ae\" /></svg>",
      "folder-packages": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#1e88e5\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#bbdefb\" d=\"M15.6 6.467 14.8 5.4A1 1 0 0 0 14 5h-4a1 1 0 0 0-.8.4l-.8 1.066a2 2 0 0 0-.4 1.2V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.667a2 2 0 0 0-.4-1.2M10 6h4l.75 1h-5.5zm3 5v2h-2v-2H9l3-3 3 3z\"/></svg>",
      "folder-packages-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#1e88e5\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#bbdefb\" d=\"M15.6 6.467 14.8 5.4A1 1 0 0 0 14 5h-4a1 1 0 0 0-.8.4l-.8 1.066a2 2 0 0 0-.4 1.2V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.667a2 2 0 0 0-.4-1.2M10 6h4l.75 1h-5.5zm3 5v2h-2v-2H9l3-3 3 3z\"/></svg>",
      "folder-public": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#039be5\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#b3e5fc\" d=\"M11 5a5 5 0 1 0 5 5 5 5 0 0 0-5-5m3.459 3H12.98a8 8 0 0 0-.671-1.77A4.02 4.02 0 0 1 14.459 8M11 6a7 7 0 0 1 .945 2h-1.89A7 7 0 0 1 11 6m-1.309.23A8 8 0 0 0 9.02 8H7.541a4.02 4.02 0 0 1 2.15-1.77M7.131 11a3.85 3.85 0 0 1 0-2h1.704a7.8 7.8 0 0 0 0 2zm.41 1H9.02a8 8 0 0 0 .671 1.77A4.02 4.02 0 0 1 7.541 12M11 14a7 7 0 0 1-.945-2h1.89A7 7 0 0 1 11 14m1.155-3h-2.31a6.7 6.7 0 0 1 0-2h2.31a6.7 6.7 0 0 1 0 2m.154 2.77A8 8 0 0 0 12.98 12h1.479a4.02 4.02 0 0 1-2.15 1.77m2.56-2.77h-1.704a7.8 7.8 0 0 0 0-2h1.704a3.85 3.85 0 0 1 0 2\"/></svg>",
      "folder-public-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#039be5\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#b3e5fc\" d=\"M11 5a5 5 0 1 0 5 5 5 5 0 0 0-5-5m3.459 3H12.98a8 8 0 0 0-.671-1.77A4.02 4.02 0 0 1 14.459 8M11 6a7 7 0 0 1 .945 2h-1.89A7 7 0 0 1 11 6m-1.309.23A8 8 0 0 0 9.02 8H7.541a4.02 4.02 0 0 1 2.15-1.77M7.131 11a3.85 3.85 0 0 1 0-2h1.704a7.8 7.8 0 0 0 0 2zm.41 1H9.02a8 8 0 0 0 .671 1.77A4.02 4.02 0 0 1 7.541 12M11 14a7 7 0 0 1-.945-2h1.89A7 7 0 0 1 11 14m1.155-3h-2.31a6.7 6.7 0 0 1 0-2h2.31a6.7 6.7 0 0 1 0 2m.154 2.77A8 8 0 0 0 12.98 12h1.479a4.02 4.02 0 0 1-2.15 1.77m2.56-2.77h-1.704a7.8 7.8 0 0 0 0-2h1.704a3.85 3.85 0 0 1 0 2\"/></svg>",
      "folder-resource": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#fbc02d\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#fff9c4\" d=\"M9.5 6a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5zm.5 1h5v1h-5zM7 8v6.5a.5.5 0 0 0 .5.5H14v-1H8V8zm3 1h5v1h-5zm0 2h3v1h-3z\"/></svg>",
      "folder-resource-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#fbc02d\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#fff9c4\" d=\"M9.5 6a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5zm.5 1h5v1h-5zM7 8v6.5a.5.5 0 0 0 .5.5H14v-1H8V8zm3 1h5v1h-5zm0 2h3v1h-3z\"/></svg>",
      "folder-scripts": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#546e7a\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#cfd8dc\" d=\"M14 6h-3a2 2 0 0 0-2 2v4h1V8h4v4.947a1.04 1.04 0 0 1-.832 1.04A1 1 0 0 1 12 13H8a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V8h1a2 2 0 0 0-2-2\"/></svg>",
      "folder-scripts-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#546e7a\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#cfd8dc\" d=\"M14 6h-3a2 2 0 0 0-2 2v4h1V8h4v4.947a1.04 1.04 0 0 1-.832 1.04A1 1 0 0 1 12 13H8a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V8h1a2 2 0 0 0-2-2\"/></svg>",
      "folder-src": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#4caf50\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#c8e6c9\" d=\"M9.225 15a.5.5 0 0 1-.12-.014.57.568 0 0 1-.414-.661l1.549-7.872a.566.565 0 0 1 .254-.372.53.53 0 0 1 .4-.067.57.57 0 0 1 .415.662l-1.552 7.872a.56.56 0 0 1-.253.371.53.53 0 0 1-.28.081m3.105-1h-.038a.54.54 0 0 1-.382-.206.583.582 0 0 1 .057-.774l2.664-2.483-2.653-2.312a.583.582 0 0 1-.08-.772.54.54 0 0 1 .377-.218.53.53 0 0 1 .406.129l3.126 2.727a.579.578 0 0 1 .002.862l-3.114 2.904a.536.535 0 0 1-.365.144zm-4.661 0a.536.535 0 0 1-.365-.146L4.186 10.95a.58.58 0 0 1-.005-.846l.01-.01 3.128-2.726a.516.515 0 0 1 .4-.13.54.54 0 0 1 .38.218.583.582 0 0 1-.08.773l-2.65 2.31 2.663 2.482a.579.578 0 0 1 .056.774.536.535 0 0 1-.381.206z\"/></svg>",
      "folder-src-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#4caf50\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#c8e6c9\" d=\"M9.225 15a.5.5 0 0 1-.12-.014.57.568 0 0 1-.414-.661l1.549-7.872a.566.565 0 0 1 .254-.372.53.53 0 0 1 .4-.067.57.57 0 0 1 .415.662l-1.552 7.872a.56.56 0 0 1-.253.371.53.53 0 0 1-.28.081m3.105-1h-.038a.54.54 0 0 1-.382-.206.583.582 0 0 1 .057-.774l2.664-2.483-2.653-2.312a.583.582 0 0 1-.08-.772.54.54 0 0 1 .377-.218.53.53 0 0 1 .406.129l3.126 2.727a.579.578 0 0 1 .002.862l-3.114 2.904a.536.535 0 0 1-.365.144zm-4.661 0a.536.535 0 0 1-.365-.146L4.186 10.95a.58.58 0 0 1-.005-.846l.01-.01 3.128-2.726a.516.515 0 0 1 .4-.13.54.54 0 0 1 .38.218.583.582 0 0 1-.08.773l-2.65 2.31 2.663 2.482a.579.578 0 0 1 .056.774.536.535 0 0 1-.381.206z\"/></svg>",
      "folder-test": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#00bfa5\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#a7ffeb\" d=\"M8 6v1h1v6a2 2 0 0 0 4 0V7h1V6Zm2.5 7a.5.5 0 1 1 .5-.5.5.5 0 0 1-.5.5m1-2a.5.5 0 1 1 .5-.5.5.5 0 0 1-.5.5m.5-2h-2V7h2z\"/></svg>",
      "folder-test-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#00bfa5\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#a7ffeb\" d=\"M8 6v1h1v6a2 2 0 0 0 4 0V7h1V6Zm2.5 7a.5.5 0 1 1 .5-.5.5.5 0 0 1-.5.5m1-2a.5.5 0 1 1 .5-.5.5.5 0 0 1-.5.5m.5-2h-2V7h2z\"/></svg>",
      "folder-typescript": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#0288d1\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#90caf9\" d=\"M12 9.535a.665.664 0 0 0 .15.52 1.25 1.248 0 0 0 .305.14c.27.09.665.184 1.045.309 1.32.44 1.48 1.159 1.495 1.743q.006.119.005.23v.024c0 .53-.23 1.394-1.72 1.489q-.096.006-.185.005A.5.5 0 0 1 13 14h-2v-.88l.12-.12H13a1 .999 0 0 0 .125-.004h.085c.09-.005.165-.015.235-.02a1 .999 0 0 0 .135-.03q.051-.015.095-.03a.02.02 0 0 0 .015-.005c.245-.09.295-.225.305-.33l.005-.08c0-.16-.34-.614-1.5-.998-1.37-.455-1.49-1.209-1.495-1.803A.3.3 0 0 1 11 9.635v-.13a1.425 1.423 0 0 1 .225-.794c.02-.03.035-.055.055-.08.005-.005.005-.01.01-.015a.5.5 0 0 1 .09-.1 2.15 2.147 0 0 1 1.575-.509H15v.999h-2q-.098-.001-.195.005c-.59.03-.745.2-.79.35a.1.1 0 0 0-.005.03.5.5 0 0 0-.01.114zM9 14H8V9.006H6v-.999h5v.999H9Z\"/></svg>",
      "folder-typescript-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#0288d1\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#90caf9\" d=\"M12 9.535a.665.664 0 0 0 .15.52 1.25 1.248 0 0 0 .305.14c.27.09.665.184 1.045.309 1.32.44 1.48 1.159 1.495 1.743q.006.119.005.23v.024c0 .53-.23 1.394-1.72 1.489q-.096.006-.185.005A.5.5 0 0 1 13 14h-2v-.88l.12-.12H13a1 .999 0 0 0 .125-.004h.085c.09-.005.165-.015.235-.02a1 .999 0 0 0 .135-.03q.051-.015.095-.03a.02.02 0 0 0 .015-.005c.245-.09.295-.225.305-.33l.005-.08c0-.16-.34-.614-1.5-.998-1.37-.455-1.49-1.209-1.495-1.803A.3.3 0 0 1 11 9.635v-.13a1.425 1.423 0 0 1 .225-.794c.02-.03.035-.055.055-.08.005-.005.005-.01.01-.015a.5.5 0 0 1 .09-.1 2.15 2.147 0 0 1 1.575-.509H15v.999h-2q-.098-.001-.195.005c-.59.03-.745.2-.79.35a.1.1 0 0 0-.005.03.5.5 0 0 0-.01.114zM9 14H8V9.006H6v-.999h5v.999H9Z\"/></svg>",
      "folder-utils": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#7cb342\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#dcedc8\" d=\"M9.5 6a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5zM12 7h1v2h2v1h-2v2h-1v-2h-2V9h2zM7 8v6.5a.5.5 0 0 0 .5.5H14v-1H8V8z\"/></svg>",
      "folder-utils-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#7cb342\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#dcedc8\" d=\"M9.5 6a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5zM12 7h1v2h2v1h-2v2h-1v-2h-2V9h2zM7 8v6.5a.5.5 0 0 0 .5.5H14v-1H8V8z\"/></svg>",
      "folder-vscode": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#42a5f5\" d=\"m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232\"/><path id=\"motive\" fill=\"#bbdefb\" d=\"M14.073 5 10.12 8.633 7.912 6.97 7 7.5l2.177 2L7 11.5l.912.533 2.209-1.665L14.072 14 16 13.063V5.937ZM14 7.39v4.22L11.199 9.5z\"/></svg>",
      "folder-vscode-open": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path id=\"folder\" fill=\"#42a5f5\" d=\"M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6\"/><path id=\"motive\" fill=\"#bbdefb\" d=\"M14.073 5 10.12 8.633 7.912 6.97 7 7.5l2.177 2L7 11.5l.912.533 2.209-1.665L14.072 14 16 13.063V5.937ZM14 7.39v4.22L11.199 9.5z\"/></svg>",
      "font": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#f44336\" d=\"M24 28h4L18 4h-4L4 28h4l8-19.422\"/><path fill=\"#f44336\" d=\"M8 20h16v4H8z\"/></svg>",
      "gemfile": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#e53935\" d=\"M21.184 10.016V10H10.881l.016.033-.016-.017L8 14l8.032 10L24 14z\"/><path fill=\"#e53935\" d=\"m16 3.455 11 6.286v12.518l-11 6.286-11-6.286V9.741zM16 0 2 8v16l14 8 14-8V8z\"/></svg>",
      "git": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#e64a19\" d=\"M13.172 2.828 11.78 4.22l1.91 1.91 2 2A2.986 2.986 0 0 1 20 10.81a3.25 3.25 0 0 1-.31 1.31l2.06 2a2.68 2.68 0 0 1 3.37.57 2.86 2.86 0 0 1 .88 2.117 3.02 3.02 0 0 1-.856 2.109A2.9 2.9 0 0 1 23 19.81a2.93 2.93 0 0 1-2.13-.87 2.694 2.694 0 0 1-.56-3.38l-2-2.06a3 3 0 0 1-.31.12V20a3 3 0 0 1 1.44 1.09 2.92 2.92 0 0 1 .56 1.72 2.88 2.88 0 0 1-.878 2.128 2.98 2.98 0 0 1-2.048.871 2.981 2.981 0 0 1-2.514-4.719A3 3 0 0 1 16 20v-6.38a2.96 2.96 0 0 1-1.44-1.09 2.9 2.9 0 0 1-.56-1.72 2.9 2.9 0 0 1 .31-1.31l-3.9-3.9-7.579 7.572a4 4 0 0 0-.001 5.658l10.342 10.342a4 4 0 0 0 5.656 0l10.344-10.344a4 4 0 0 0 0-5.656L18.828 2.828a4 4 0 0 0-5.656 0\"/></svg>",
      "go": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#00acc1\" d=\"M2 12h4v2H2zm-2 4h6v2H0zm4 4h2v2H4zm16.954-5H14v3h3.239a4.42 4.42 0 0 1-3.531 2 2.65 2.65 0 0 1-2.053-.858 2.86 2.86 0 0 1-.628-2.28A4.515 4.515 0 0 1 15.292 13a2.73 2.73 0 0 1 1.749.584l2.962-1.185A5.6 5.6 0 0 0 15.292 10a7.526 7.526 0 0 0-7.243 6.5 5.614 5.614 0 0 0 5.659 6.5 7.526 7.526 0 0 0 7.243-6.5 6.4 6.4 0 0 0 .003-1.5\"/><path fill=\"#00acc1\" d=\"M26.292 10a7.526 7.526 0 0 0-7.243 6.5 5.614 5.614 0 0 0 5.659 6.5 7.526 7.526 0 0 0 7.243-6.5 5.614 5.614 0 0 0-5.659-6.5m2.681 6.137A4.515 4.515 0 0 1 24.708 20a2.65 2.65 0 0 1-2.053-.858 2.86 2.86 0 0 1-.628-2.28A4.515 4.515 0 0 1 26.292 13a2.65 2.65 0 0 1 2.053.858 2.86 2.86 0 0 1 .628 2.28Z\"/></svg>",
      "go-mod": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ec407a\" d=\"M2 12h4v2H2zm-2 4h6v2H0zm4 4h2v2H4zm16.954-5H14v3h3.239a4.42 4.42 0 0 1-3.531 2 2.65 2.65 0 0 1-2.053-.858 2.86 2.86 0 0 1-.628-2.28A4.515 4.515 0 0 1 15.292 13a2.73 2.73 0 0 1 1.749.584l2.962-1.185A5.6 5.6 0 0 0 15.292 10a7.526 7.526 0 0 0-7.243 6.5 5.614 5.614 0 0 0 5.659 6.5 7.526 7.526 0 0 0 7.243-6.5 6.4 6.4 0 0 0 .003-1.5\"/><path fill=\"#ec407a\" d=\"M26.292 10a7.526 7.526 0 0 0-7.243 6.5 5.614 5.614 0 0 0 5.659 6.5 7.526 7.526 0 0 0 7.243-6.5 5.614 5.614 0 0 0-5.659-6.5m2.681 6.137A4.515 4.515 0 0 1 24.708 20a2.65 2.65 0 0 1-2.053-.858 2.86 2.86 0 0 1-.628-2.28A4.515 4.515 0 0 1 26.292 13a2.65 2.65 0 0 1 2.053.858 2.86 2.86 0 0 1 .628 2.28Z\"/></svg>",
      "gradle": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0097a7\" d=\"M16 10v2h6c-2 0-3-2-6-2\"/><path fill=\"#0097a7\" d=\"M26 4h-2a4 4 0 0 0-4 4h4a1 1 0 0 1 2 0v4H16v-2h-5.317A2.683 2.683 0 0 0 8 12.683v2.634A2.683 2.683 0 0 0 10.683 18H16v2h-5.98A4.02 4.02 0 0 1 6 16v-2c-2 0-4 4-4 8 0 5 1 6 2 6h4v-4h4v4h4v-4h4v4h4v-6a2 2 0 0 0 2-2v-2a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4m-4 12h-2a2 2 0 0 1-2-2h6a2 2 0 0 1-2 2\"/></svg>",
      "graphql": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ec407a\" d=\"M6 20h20v2H6z\"/><circle cx=\"7\" cy=\"21\" r=\"3\" fill=\"#ec407a\"/><circle cx=\"16\" cy=\"27\" r=\"3\" fill=\"#ec407a\"/><circle cx=\"25\" cy=\"21\" r=\"3\" fill=\"#ec407a\"/><path fill=\"#ec407a\" d=\"M6 10h20v2H6z\"/><circle cx=\"7\" cy=\"11\" r=\"3\" fill=\"#ec407a\"/><circle cx=\"16\" cy=\"5\" r=\"3\" fill=\"#ec407a\"/><circle cx=\"25\" cy=\"11\" r=\"3\" fill=\"#ec407a\"/><path fill=\"#ec407a\" d=\"M6 12h2v10H6zm18-2h2v12h-2z\"/><path fill=\"#ec407a\" d=\"m5.014 19.41 11.674 6.866L15.674 28 4 21.134z\"/><path fill=\"#ec407a\" d=\"M26.688 21.724 15.014 28.59 14 26.866 25.674 20zM5.124 10.382l11.415-7.29 1.077 1.686L6.2 12.068z\"/><path fill=\"#ec407a\" d=\"m25.798 12.067-11.415-7.29 1.077-1.685 11.415 7.29zM6.2 19.932l11.416 7.29-1.077 1.686-11.415-7.29z\"/><path fill=\"#ec407a\" d=\"m26.875 21.619-11.415 7.29-1.077-1.687 11.415-7.289zM5.877 22.6 16.04 3.686l1.762.946L7.638 23.546z\"/><path fill=\"#ec407a\" d=\"M24.361 23.545 14.197 4.633l1.761-.947 10.165 18.913z\"/></svg>",
      "h": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M18.5 11a5.49 5.49 0 0 0-4.5 2.344V4H8v24h6V17a2 2 0 0 1 4 0v11h6V16.5a5.5 5.5 0 0 0-5.5-5.5\"/></svg>",
      "haskell": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 300 300\"><g stroke-width=\"2.422\"><path fill=\"#ef5350\" d=\"m23.928 240.5 59.94-89.852-59.94-89.855h44.955l59.94 89.855-59.94 89.852z\"/><path fill=\"#ffa726\" d=\"m83.869 240.5 59.94-89.852-59.94-89.855h44.955l119.88 179.71h-44.95l-37.46-56.156-37.468 56.156z\"/><path fill=\"#ffee58\" d=\"m228.72 188.08-19.98-29.953h69.93v29.956h-49.95zm-29.97-44.924-19.98-29.953h99.901v29.953z\"/></g></svg>",
      "heroku": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#7e57c2\" d=\"M28 2H6a2 2 0 0 0-2 2v24a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M10 26v-6l4 3Zm14 0h-4v-6.45a2.55 2.55 0 0 0-.95-1.987 2.75 2.75 0 0 0-2.278-.478L10 18.44V6h4v7.56l2.16-.43A6.558 6.558 0 0 1 24 19.55Zm0-16h-4V6h4Z\"/></svg>",
      "hpp": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M28 6V2h-2v4h-6V2h-2v4h-4v2h4v4h2V8h6v4h2V8h4V6zm-15.5 5A5.49 5.49 0 0 0 8 13.344V4H2v24h6V17a2 2 0 0 1 4 0v11h6V16.5a5.5 5.5 0 0 0-5.5-5.5\"/></svg>",
      "html": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#e65100\" d=\"m4 4 2 22 10 2 10-2 2-22Zm19.72 7H11.28l.29 3h11.86l-.802 9.335L15.99 25l-6.635-1.646L8.93 19h3.02l.19 2 3.86.77 3.84-.77.29-4H8.84L8 8h16Z\"/></svg>",
      "image": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#26a69a\" d=\"M8.5 6h4l-4-4zM3.875 1H9.5l4 4v8.6c0 .773-.616 1.4-1.375 1.4h-8.25c-.76 0-1.375-.627-1.375-1.4V2.4c0-.777.612-1.4 1.375-1.4M4 13.6h8V8l-2.625 2.8L8 9.4zm1.25-7.7c-.76 0-1.375.627-1.375 1.4s.616 1.4 1.375 1.4c.76 0 1.375-.627 1.375-1.4S6.009 5.9 5.25 5.9\"/></svg>",
      "java": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#f44336\" d=\"M4 26h24v2H4zM28 4H7a1 1 0 0 0-1 1v13a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-4h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 8h-4V6h4Z\"/></svg>",
      "javascript": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#ffca28\" d=\"M2 2v12h12V2zm6 6h1v4a1.003 1.003 0 0 1-1 1H7a1.003 1.003 0 0 1-1-1v-1h1v1h1zm3 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1\"/></svg>",
      "jest": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#f4511e\" d=\"m21.032 8-1.878 4L20 13.998h2L22.928 12z\"/><path fill=\"#f4511e\" d=\"m14 2 2 8h2l3.032-6L24 10h2l2-8zm14 18h-2a4.34 4.34 0 0 1-4-4h-2a4.17 4.17 0 0 1-4.23 3.87c-1.522 2.38-5.155 4.283-7.77 5.148A4.724 4.724 0 0 1 5 20H4c-4.718 7.978 3.064 13.219 10.955 7.895C18.85 24.497 29.658 27.487 28 20\"/><circle cx=\"7\" cy=\"15\" r=\"3\" fill=\"#f4511e\"/><circle cx=\"27\" cy=\"15\" r=\"3\" fill=\"#f4511e\"/><circle cx=\"16\" cy=\"16\" r=\"2\" fill=\"#f4511e\"/></svg>",
      "jsconfig": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#757575\" d=\"M15 2H6a2.006 2.006 0 0 0-2 2v22a2.006 2.006 0 0 0 2 2h6v-4H6v-2h6v-2H6v-2h6v-2H6v-2h6v-2h2V4l8 8h2v-1Z\" data-mit-no-recolor=\"true\"/><path fill=\"#ffca28\" d=\"M12 12v18h18V12zm8 12a2.006 2.006 0 0 1-2 2h-2a2.006 2.006 0 0 1-2-2v-2h2v2h2v-8h2zm8-6h-4v2h2a2.006 2.006 0 0 1 2 2v2a2.006 2.006 0 0 1-2 2h-4v-2h4v-2h-2a2.006 2.006 0 0 1-2-2v-2a2.006 2.006 0 0 1 2-2h4z\"/></svg>",
      "json": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 -960 960 960\"><path fill=\"#f9a825\" d=\"M560-160v-80h120q17 0 28.5-11.5T720-280v-80q0-38 22-69t58-44v-14q-36-13-58-44t-22-69v-80q0-17-11.5-28.5T680-720H560v-80h120q50 0 85 35t35 85v80q0 17 11.5 28.5T840-560h40v160h-40q-17 0-28.5 11.5T800-360v80q0 50-35 85t-85 35zm-280 0q-50 0-85-35t-35-85v-80q0-17-11.5-28.5T120-400H80v-160h40q17 0 28.5-11.5T160-600v-80q0-50 35-85t85-35h120v80H280q-17 0-28.5 11.5T240-680v80q0 38-22 69t-58 44v14q36 13 58 44t22 69v80q0 17 11.5 28.5T280-240h120v80z\"/></svg>",
      "julia": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 50 50\"><g transform=\"translate(.21 -247.01)\"><circle cx=\"13.497\" cy=\"281.63\" r=\"9.555\" fill=\"#c62828\"/><circle cx=\"36.081\" cy=\"281.63\" r=\"9.555\" fill=\"#7e57c2\"/><circle cx=\"24.722\" cy=\"262.39\" r=\"9.555\" fill=\"#388e3c\"/></g></svg>",
      "jupyter": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#f57c00\" d=\"M6.2 18a22.7 22.7 0 0 0 9.8 2 22.7 22.7 0 0 0 9.8-2 10.002 10.002 0 0 1-19.6 0m19.6-4a22.7 22.7 0 0 0-9.8-2 22.7 22.7 0 0 0-9.8 2 10.002 10.002 0 0 1 19.6 0\"/><circle cx=\"27\" cy=\"5\" r=\"3\" fill=\"#757575\"/><circle cx=\"5\" cy=\"27\" r=\"3\" fill=\"#9e9e9e\"/><circle cx=\"5\" cy=\"5\" r=\"3\" fill=\"#616161\"/></svg>",
      "kotlin": "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 24 24\"><defs><linearGradient id=\"a\" x1=\"1.725\" x2=\"22.185\" y1=\"22.67\" y2=\"1.982\" gradientTransform=\"translate(1.306 1.129)scale(.89324)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#7c4dff\"/><stop offset=\".5\" stop-color=\"#d500f9\"/><stop offset=\"1\" stop-color=\"#ef5350\"/></linearGradient></defs><path fill=\"url(#a)\" d=\"M2.975 2.976v18.048h18.05v-.03l-4.478-4.511-4.48-4.515 4.48-4.515 4.443-4.477z\"/></svg>",
      "less": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#0277bd\" d=\"M8 3a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2H3v2h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2v-2H8v-5a2 2 0 0 0-2-2 2 2 0 0 0 2-2V5h2V3m6 0a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1v2h-1a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2v-2h2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5h-2V3z\"/></svg>",
      "license": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#ff5722\" d=\"M8 1a5.5 5.5 0 0 0-4 9.26V15l4-1.5 4 1.5v-4.74A5.49 5.49 0 0 0 8 1m0 1.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8m0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4\"/></svg>",
      "lock": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ffd54f\" d=\"M25 12h-3V8a6 6 0 0 0-12 0v4H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V13a1 1 0 0 0-1-1M14 8a2 2 0 0 1 4 0v4h-4Zm2 17a4 4 0 1 1 4-4 4 4 0 0 1-4 4\"/></svg>",
      "log": "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\"><path d=\"M0 0h24v24H0z\"/><path fill=\"#afb42b\" d=\"M19 5v9h-5v5H5V5zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10l6-6V5c0-1.1-.9-2-2-2m-7 11H7v-2h5zm5-4H7V8h10z\"/></svg>",
      "lua": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#42a5f5\" d=\"M30 6a3.86 3.86 0 0 1-1.167 2.833 4.024 4.024 0 0 1-5.666 0A3.86 3.86 0 0 1 22 6a3.86 3.86 0 0 1 1.167-2.833 4.024 4.024 0 0 1 5.666 0A3.86 3.86 0 0 1 30 6m-9.208 5.208A10.6 10.6 0 0 0 13 8a10.6 10.6 0 0 0-7.792 3.208A10.6 10.6 0 0 0 2 19a10.6 10.6 0 0 0 3.208 7.792A10.6 10.6 0 0 0 13 30a10.6 10.6 0 0 0 7.792-3.208A10.6 10.6 0 0 0 24 19a10.6 10.6 0 0 0-3.208-7.792m-1.959 7.625a4.024 4.024 0 0 1-5.666 0 4.024 4.024 0 0 1 0-5.666 4.024 4.024 0 0 1 5.666 0 4.024 4.024 0 0 1 0 5.666\"/></svg>",
      "makefile": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ef5350\" d=\"m29.5 24.02-1.6-.92a4.4 4.4 0 0 0 .09-.9A1.3 1.3 0 0 0 28 22a5.6 5.6 0 0 0-.1-1.1l1.6-.92a.493.493 0 0 0 .18-.68l-1.5-2.6a.45.45 0 0 0-.18-.18V6.01a2.006 2.006 0 0 0-2-2H4a2.006 2.006 0 0 0-2 2V22a2.006 2.006 0 0 0 2 2h10.53l-.03.02a.493.493 0 0 0-.18.68l1.5 2.6a.493.493 0 0 0 .68.18l1.6-.92a5.9 5.9 0 0 0 1.9 1.09v1.85a.495.495 0 0 0 .5.5h3a.495.495 0 0 0 .5-.5v-1.85a5.9 5.9 0 0 0 1.9-1.09l1.6.92a.493.493 0 0 0 .68-.18l1.5-2.6a.493.493 0 0 0-.18-.68M24 22.01a1.99 1.99 0 0 1-.88 1.65l-.18.11a2.04 2.04 0 0 1-1.88 0l-.18-.11a1.99 1.99 0 0 1-.88-1.65V22a2 2 0 0 1 .88-1.66l.18-.11a2.04 2.04 0 0 1 1.88 0l.18.11A2 2 0 0 1 24 22Zm2-4.63-.1.06a5.9 5.9 0 0 0-1.9-1.09V14.5a.495.495 0 0 0-.5-.5h-3a.495.495 0 0 0-.5.5v1.85a5.9 5.9 0 0 0-1.9 1.09l-1.6-.92a.493.493 0 0 0-.68.18l-1.5 2.6a.493.493 0 0 0 .18.68l1.6.92A5.6 5.6 0 0 0 16 22v.01L4 22V10.01h22Z\"/></svg>",
      "markdown": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#42a5f5\" d=\"m14 10-4 3.5L6 10H4v12h4v-6l2 2 2-2v6h4V10zm12 6v-6h-4v6h-4l6 8 6-8z\"/></svg>",
      "maven": "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 24 24\"><defs><linearGradient id=\"a\" x1=\".125\" x2=\"0\" y1=\"1\" y2=\"0\"><stop offset=\"0%\" stop-color=\"#ab47bc\"/><stop offset=\"37.5%\" stop-color=\"#ab47bc\"/><stop offset=\"37.501%\" stop-color=\"#d32f2f\"/><stop offset=\"54.25%\" stop-color=\"#d32f2f\"/><stop offset=\"54.251%\" stop-color=\"#ff7043\"/><stop offset=\"69.75%\" stop-color=\"#ff7043\"/><stop offset=\"69.751%\" stop-color=\"#ffa726\"/><stop offset=\"100%\" stop-color=\"#ffa726\"/></linearGradient></defs><path fill=\"url(#a)\" d=\"M22 2s-7.64-.37-13.66 7.88C3.72 16.21 2 22 2 22l1.94-1c1.44-2.5 2.19-3.53 3.6-5 2.53.74 5.17.65 7.46-2-2-.56-3.6-.43-5.96-.19C11.69 12 13.5 11.6 16 12l1-2c-1.8-.34-3-.37-4.78.04C14.19 8.65 15.56 7.87 18 8l1.11-1.73c-1.53-.06-2.4-.02-4.19.3 1.61-1.46 3.08-2.12 5.22-2.25 0 0 1.05-1.89 1.86-2.32\"/></svg>",
      "mdx": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ffca28\" d=\"m14 10-4 3.5L6 10H4v12h4v-6l2 2 2-2v6h4V10zm12 6v-6h-4v6h-4l6 8 6-8z\"/></svg>",
      "nodejs": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#8bc34a\" d=\"M16 20.003v2h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2v-2h4v-2h-4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v2Z\"/><path fill=\"#8bc34a\" d=\"m16 3.003-12 7v14l4 2h6v-13.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v11.5H8l-2-1.034V11.15l10-5.833 10 5.833v11.703l-10 5.833-1.745-1.022L13 29.253l3 1.75 12-7v-14Z\"/></svg>",
      "npm": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#e53935\" d=\"M4 4v24h24V4Zm20 20h-4V12h-4v12H8V8h16Z\"/></svg>",
      "pdf": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#ef5350\" d=\"M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m4.93 10.44c.41.9.93 1.64 1.53 2.15l.41.32c-.87.16-2.07.44-3.34.93l-.11.04.5-1.04c.45-.87.78-1.66 1.01-2.4m6.48 3.81c.18-.18.27-.41.28-.66.03-.2-.02-.39-.12-.55-.29-.47-1.04-.69-2.28-.69l-1.29.07-.87-.58c-.63-.52-1.2-1.43-1.6-2.56l.04-.14c.33-1.33.64-2.94-.02-3.6a.85.85 0 0 0-.61-.24h-.24c-.37 0-.7.39-.79.77-.37 1.33-.15 2.06.22 3.27v.01c-.25.88-.57 1.9-1.08 2.93l-.96 1.8-.89.49c-1.2.75-1.77 1.59-1.88 2.12-.04.19-.02.36.05.54l.03.05.48.31.44.11c.81 0 1.73-.95 2.97-3.07l.18-.07c1.03-.33 2.31-.56 4.03-.75 1.03.51 2.24.74 3 .74.44 0 .74-.11.91-.3m-.41-.71.09.11c-.01.1-.04.11-.09.13h-.04l-.19.02c-.46 0-1.17-.19-1.9-.51.09-.1.13-.1.23-.1 1.4 0 1.8.25 1.9.35M7.83 17c-.65 1.19-1.24 1.85-1.69 2 .05-.38.5-1.04 1.21-1.69zm3.02-6.91c-.23-.9-.24-1.63-.07-2.05l.07-.12.15.05c.17.24.19.56.09 1.1l-.03.16-.16.82z\"/></svg>",
      "php": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#1e88e5\" d=\"M12 18.08c-6.63 0-12-2.72-12-6.08s5.37-6.08 12-6.08S24 8.64 24 12s-5.37 6.08-12 6.08m-5.19-7.95c.54 0 .91.1 1.09.31.18.2.22.56.13 1.03-.1.53-.29.87-.58 1.09q-.42.33-1.29.33h-.87l.53-2.76zm-3.5 5.55h1.44l.34-1.75h1.23c.54 0 .98-.06 1.33-.17.35-.12.67-.31.96-.58.24-.22.43-.46.58-.73.15-.26.26-.56.31-.88.16-.78.05-1.39-.33-1.82-.39-.44-.99-.65-1.82-.65H4.59zm7.25-8.33-1.28 6.58h1.42l.74-3.77h1.14c.36 0 .6.06.71.18s.13.34.07.66l-.57 2.93h1.45l.59-3.07c.13-.62.03-1.07-.27-1.36-.3-.27-.85-.4-1.65-.4h-1.27L12 7.35zM18 10.13c.55 0 .91.1 1.09.31.18.2.22.56.13 1.03-.1.53-.29.87-.57 1.09-.29.22-.72.33-1.3.33h-.85l.5-2.76zm-3.5 5.55h1.44l.34-1.75h1.22c.55 0 1-.06 1.35-.17.35-.12.65-.31.95-.58.24-.22.44-.46.58-.73.15-.26.26-.56.32-.88.15-.78.04-1.39-.34-1.82-.36-.44-.99-.65-1.82-.65h-2.75z\"/></svg>",
      "pnpm": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#e0e0e0\" d=\"M2 22h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zM12 12h8v8h-8z\"/><path fill=\"#ffb300\" d=\"M2 2h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zm0 10h8v8h-8z\"/></svg>",
      "pnpm_light": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#757575\" d=\"M2 22h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zM12 12h8v8h-8z\"/><path fill=\"#ffb300\" d=\"M2 2h8v8H2zm10 0h8v8h-8zm10 0h8v8h-8zm0 10h8v8h-8z\"/></svg>",
      "prettier": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#f44336\" d=\"M2 8h4v1H2zm0 6h4v1H2zm9-10h3v1h-3zM2 2h3v1H2z\"/><path fill=\"#f9a825\" d=\"M9 2h3v1H9zm1 4h4v1h-4zm-5 6h1v1H5zm-3-2h6v1H2z\"/><path fill=\"#26a69a\" d=\"M2 12h3v1H2zm7-4h5v1H9zM2 4h4v1H2zm3-2h4v1H5z\"/><path fill=\"#ba68c8\" d=\"M2 6h3v1H2zm7-2h2v1H9zm-1 6h4v1H8z\"/></svg>",
      "proto": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#00bfa5\" d=\"M16 27 2 19v-5l14 8z\"/><path fill=\"#ffeb3b\" d=\"m30 14-14 8v5l14-8z\"/><path fill=\"#ff5722\" d=\"M16 6 2 14v5l14-8z\"/><path fill=\"#00e676\" d=\"m30 19-14-8V6l14 8z\"/><path fill=\"#03a9f4\" d=\"M16 27 2 19v-5l14 8z\"/></svg>",
      "python": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#0288d1\" d=\"M9.86 2A2.86 2.86 0 0 0 7 4.86v1.68h4.29c.39 0 .71.57.71.96H4.86A2.86 2.86 0 0 0 2 10.36v3.781a2.86 2.86 0 0 0 2.86 2.86h1.18v-2.68a2.85 2.85 0 0 1 2.85-2.86h5.25c1.58 0 2.86-1.271 2.86-2.851V4.86A2.86 2.86 0 0 0 14.14 2zm-.72 1.61c.4 0 .72.12.72.71s-.32.891-.72.891c-.39 0-.71-.3-.71-.89s.32-.711.71-.711\"/><path fill=\"#fdd835\" d=\"M17.959 7v2.68a2.85 2.85 0 0 1-2.85 2.859H9.86A2.85 2.85 0 0 0 7 15.389v3.75a2.86 2.86 0 0 0 2.86 2.86h4.28A2.86 2.86 0 0 0 17 19.14v-1.68h-4.291c-.39 0-.709-.57-.709-.96h7.14A2.86 2.86 0 0 0 22 13.64V9.86A2.86 2.86 0 0 0 19.14 7zM8.32 11.513l-.004.004.038-.004zm6.54 7.276c.39 0 .71.3.71.89a.71.71 0 0 1-.71.71c-.4 0-.72-.12-.72-.71s.32-.89.72-.89\"/></svg>",
      "python-misc": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#757575\" d=\"M15 2H6a2.006 2.006 0 0 0-2 2v22a2.006 2.006 0 0 0 2 2h16a2 2 0 0 0 2-2V11Zm3 22H6v-2h12Zm0-4H6v-2h12Zm0-4H6v-2h12Zm-4-4V4l8 8Z\"/><path fill=\"#fbc02d\" d=\"M30.714 16H28v5h-9v7.714A1.286 1.286 0 0 0 20.286 30h6.428A1.286 1.286 0 0 0 28 28.714V26h-6v-1h8.714A1.286 1.286 0 0 0 32 23.714v-6.428A1.286 1.286 0 0 0 30.714 16M24 28h3v1h-3Z\" style=\"isolation:isolate\"/><path fill=\"#0288d1\" d=\"M25.714 12h-6.428A1.286 1.286 0 0 0 18 13.286V16h6v1h-8.714A1.286 1.286 0 0 0 14 18.286v6.428A1.286 1.286 0 0 0 15.286 26H18v-6h9v-6.714A1.286 1.286 0 0 0 25.714 12M22 14h-3v-1h3Z\" style=\"isolation:isolate\"/></svg>",
      "r": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#1976d2\" d=\"M11.956 4.05c-5.694 0-10.354 3.106-10.354 6.947 0 3.396 3.686 6.212 8.531 6.813v2.205h3.53V17.82c.88-.093 1.699-.259 2.475-.497l1.43 2.692h3.996l-2.402-4.048c1.936-1.263 3.147-3.034 3.147-4.97 0-3.841-4.659-6.947-10.354-6.947m1.584 2.712c4.349 0 7.558 1.45 7.558 4.753 0 1.77-.952 3.013-2.505 3.779a1 1 0 0 1-.228-.156c-.373-.165-.994-.352-.994-.352s3.085-.227 3.085-3.302-3.23-3.127-3.23-3.127h-7.092v7.413c-2.64-.766-4.462-2.392-4.462-4.255 0-2.63 3.52-4.753 7.868-4.753m.156 4.12h2.143s.983-.05.983.974c0 1.004-.983 1.004-.983 1.004h-2.143v-1.977m-.031 4.566h.952c.186 0 .28.052.445.207.135.103.28.3.404.476-.57.073-1.17.104-1.801.104z\"/></svg>",
      "react": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#00bcd4\" d=\"M16 12c7.444 0 12 2.59 12 4s-4.556 4-12 4-12-2.59-12-4 4.556-4 12-4m0-2c-7.732 0-14 2.686-14 6s6.268 6 14 6 14-2.686 14-6-6.268-6-14-6\"/><path fill=\"#00bcd4\" d=\"M16 14a2 2 0 1 0 2 2 2 2 0 0 0-2-2\"/><path fill=\"#00bcd4\" d=\"M10.458 5.507c2.017 0 5.937 3.177 9.006 8.493 3.722 6.447 3.757 11.687 2.536 12.392a.9.9 0 0 1-.457.1c-2.017 0-5.938-3.176-9.007-8.492C8.814 11.553 8.779 6.313 10 5.608a.9.9 0 0 1 .458-.1m-.001-2A2.87 2.87 0 0 0 9 3.875C6.13 5.532 6.938 12.304 10.804 19c3.284 5.69 7.72 9.493 10.74 9.493A2.87 2.87 0 0 0 23 28.124c2.87-1.656 2.062-8.428-1.804-15.124-3.284-5.69-7.72-9.493-10.74-9.493Z\"/><path fill=\"#00bcd4\" d=\"M21.543 5.507a.9.9 0 0 1 .457.1c1.221.706 1.186 5.946-2.536 12.393-3.07 5.316-6.99 8.493-9.007 8.493a.9.9 0 0 1-.457-.1C8.779 25.686 8.814 20.446 12.536 14c3.07-5.316 6.99-8.493 9.007-8.493m0-2c-3.02 0-7.455 3.804-10.74 9.493C6.939 19.696 6.13 26.468 9 28.124a2.87 2.87 0 0 0 1.457.369c3.02 0 7.455-3.804 10.74-9.493C25.061 12.304 25.87 5.532 23 3.876a2.87 2.87 0 0 0-1.457-.369\"/></svg>",
      "react_ts": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M16 12c7.444 0 12 2.59 12 4s-4.556 4-12 4-12-2.59-12-4 4.556-4 12-4m0-2c-7.732 0-14 2.686-14 6s6.268 6 14 6 14-2.686 14-6-6.268-6-14-6\"/><path fill=\"#0288d1\" d=\"M16 14a2 2 0 1 0 2 2 2 2 0 0 0-2-2\"/><path fill=\"#0288d1\" d=\"M10.458 5.507c2.017 0 5.937 3.177 9.006 8.493 3.722 6.447 3.757 11.687 2.536 12.392a.9.9 0 0 1-.457.1c-2.017 0-5.938-3.176-9.007-8.492C8.814 11.553 8.779 6.313 10 5.608a.9.9 0 0 1 .458-.1m-.001-2A2.87 2.87 0 0 0 9 3.875C6.13 5.532 6.938 12.304 10.804 19c3.284 5.69 7.72 9.493 10.74 9.493A2.87 2.87 0 0 0 23 28.124c2.87-1.656 2.062-8.428-1.804-15.124-3.284-5.69-7.72-9.493-10.74-9.493Z\"/><path fill=\"#0288d1\" d=\"M21.543 5.507a.9.9 0 0 1 .457.1c1.221.706 1.186 5.946-2.536 12.393-3.07 5.316-6.99 8.493-9.007 8.493a.9.9 0 0 1-.457-.1C8.779 25.686 8.814 20.446 12.536 14c3.07-5.316 6.99-8.493 9.007-8.493m0-2c-3.02 0-7.455 3.804-10.74 9.493C6.939 19.696 6.13 26.468 9 28.124a2.87 2.87 0 0 0 1.457.369c3.02 0 7.455-3.804 10.74-9.493C25.061 12.304 25.87 5.532 23 3.876a2.87 2.87 0 0 0-1.457-.369\"/></svg>",
      "readme": "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 16 16\"><path d=\"M0 0h24v24H0z\"/><path fill=\"#42a5f5\" d=\"M8 1C4.136 1 1 4.136 1 8s3.136 7 7 7 7-3.136 7-7-3.136-7-7-7m1 11H7V7.5h2zm0-6H7V4h2z\"/></svg>",
      "ruby": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#f44336\" d=\"M18.041 3.177c2.24.382 2.879 1.919 2.843 3.527V6.67l-1.013 13.266-13.132.897h.008c-1.093-.044-3.518-.151-3.634-3.545l1.217-2.222 2.462 5.74 2.097-6.77-.045.009.018-.018 6.85 2.186L13.945 9.3l6.53-.409-5.144-4.212 2.71-1.51v.009M3.113 17.252v.017zM6.916 6.874c2.63-2.622 6.033-4.168 7.34-2.844 1.297 1.306-.072 4.523-2.702 7.135-2.666 2.613-6.015 4.248-7.322 2.933-1.306-1.324.036-4.612 2.675-7.224z\"/></svg>",
      "rust": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ff7043\" d=\"m30 12-4-2V6h-4l-2-4-4 2-4-2-2 4H6v4l-4 2 2 4-2 4 4 2v4h4l2 4 4-2 4 2 2-4h4v-4l4-2-2-4ZM6 16a9.9 9.9 0 0 1 .842-4H10v8H6.842A9.9 9.9 0 0 1 6 16m10 10a9.98 9.98 0 0 1-7.978-4H16v-2h-2v-2h4c.819.819.297 2.308 1.179 3.37a1.89 1.89 0 0 0 1.46.63h3.34A9.98 9.98 0 0 1 16 26m-2-12v-2h4a1 1 0 0 1 0 2Zm11.158 6H24a2.006 2.006 0 0 1-2-2 2 2 0 0 0-2-2 3 3 0 0 0 3-3q0-.08-.004-.161A3.115 3.115 0 0 0 19.83 10H8.022a9.986 9.986 0 0 1 17.136 10\"/></svg>",
      "sass": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ec407a\" d=\"M27.837 5.673a4.33 4.33 0 0 0-2.293-2.701c-2.362-1.261-6.11-1.298-9.548-.092a26.3 26.3 0 0 0-8.76 4.966c-2.752 2.542-3.438 4.925-3.189 6.194.523 2.668 3.274 4.539 5.485 6.042.418.284.822.559 1.175.816-1.429.76-4.261 2.444-5.088 4.248a3.88 3.88 0 0 0-.118 3.332A2.37 2.37 0 0 0 6.869 29.8a5.6 5.6 0 0 0 1.49.2 6.35 6.35 0 0 0 5.19-2.856 6.74 6.74 0 0 0 .864-5.382 7.3 7.3 0 0 1 2.044-.03 3.92 3.92 0 0 1 2.816 1.311 1.82 1.82 0 0 1 .423 1.262 1.55 1.55 0 0 1-.772 1.05c-.234.14-.586.355-.504.803.036.194.198.633.894.512a2.93 2.93 0 0 0 2.145-2.651 4 4 0 0 0-1.197-2.904 5.94 5.94 0 0 0-4.396-1.626 10.6 10.6 0 0 0-2.672.304 20 20 0 0 0-2.203-1.846c-1.712-1.3-3.33-2.529-3.235-4.26.125-2.263 2.468-4.532 6.964-6.744 4.016-1.976 7.254-2.037 8.944-1.438a2 2 0 0 1 1.204.883 2.77 2.77 0 0 1-.36 2.47 9.71 9.71 0 0 1-7.425 4.304 3.86 3.86 0 0 1-3.238-.757c-.278-.302-.593-.645-1.074-.383q-.565.31-.225 1.189a3.9 3.9 0 0 0 2.407 1.92 11.7 11.7 0 0 0 7.128-.671c3.527-1.35 6.681-5.202 5.756-8.787M11.895 24.475a4 4 0 0 1-.192.468 4.5 4.5 0 0 1-.753 1.081 2.83 2.83 0 0 1-2.533 1.107c-.056-.032-.078-.146-.085-.193a3.28 3.28 0 0 1 1.076-2.284 11.3 11.3 0 0 1 2.644-1.933 3.85 3.85 0 0 1-.157 1.754\"/></svg>",
      "settings": "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\"><path d=\"M0 0h24v24H0z\"/><path fill=\"#42a5f5\" d=\"M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.6.6 0 0 0-.18-.03c-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1q.09.03.18.03c.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64zm-1.98-1.71c.04.31.05.52.05.73s-.02.43-.05.73l-.14 1.13.89.7 1.08.84-.7 1.21-1.27-.51-1.04-.42-.9.68c-.43.32-.84.56-1.25.73l-1.06.43-.16 1.13-.2 1.35h-1.4l-.19-1.35-.16-1.13-1.06-.43c-.43-.18-.83-.41-1.23-.71l-.91-.7-1.06.43-1.27.51-.7-1.21 1.08-.84.89-.7-.14-1.13c-.03-.31-.05-.54-.05-.74s.02-.43.05-.73l.14-1.13-.89-.7-1.08-.84.7-1.21 1.27.51 1.04.42.9-.68c.43-.32.84-.56 1.25-.73l1.06-.43.16-1.13.2-1.35h1.39l.19 1.35.16 1.13 1.06.43c.43.18.83.41 1.23.71l.91.7 1.06-.43 1.27-.51.7 1.21-1.07.85-.89.7zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2\"/></svg>",
      "svelte": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 300 300\"><path fill=\"#ff5722\" d=\"M175.94 24.328c-13.037.252-26.009 3.872-37.471 11.174L79.912 72.818a67.13 67.13 0 0 0-30.355 44.906 70.8 70.8 0 0 0 6.959 45.445 67.2 67.2 0 0 0-10.035 25.102 71.54 71.54 0 0 0 12.236 54.156c23.351 33.41 69.468 43.311 102.81 22.07l58.559-37.158a67.36 67.36 0 0 0 30.355-44.906 70.77 70.77 0 0 0-6.982-45.422 67.65 67.65 0 0 0 10.059-25.102 71.63 71.63 0 0 0-12.236-54.156v-.18c-15.324-21.925-40.453-33.727-65.342-33.246zm5.137 28.68a46.5 46.5 0 0 1 36.09 19.969 42.98 42.98 0 0 1 7.365 32.557 45 45 0 0 1-1.393 5.455l-1.123 3.37-2.986-2.247a75.9 75.9 0 0 0-22.902-11.45l-2.244-.651.201-2.246a13.16 13.16 0 0 0-2.379-8.711 13.99 13.99 0 0 0-14.953-5.412 12.8 12.8 0 0 0-3.594 1.572l-58.578 37.25a12.24 12.24 0 0 0-5.502 8.15 13.1 13.1 0 0 0 2.246 9.834 14.03 14.03 0 0 0 14.93 5.569 13.5 13.5 0 0 0 3.594-1.573l22.453-14.234a41.8 41.8 0 0 1 11.898-5.232 46.48 46.48 0 0 1 49.914 18.502 43.02 43.02 0 0 1 7.363 32.557 40.42 40.42 0 0 1-18.254 27.078l-58.58 37.316a43 43 0 0 1-11.898 5.23A46.545 46.545 0 0 1 82.81 227.14a42.98 42.98 0 0 1-7.341-32.557 38 38 0 0 1 1.39-5.41l1.102-3.37 3.008 2.246a75.9 75.9 0 0 0 22.836 11.361l2.244.65-.201 2.247a13.25 13.25 0 0 0 2.447 8.644 14.03 14.03 0 0 0 15.043 5.569 13.1 13.1 0 0 0 3.592-1.573l58.467-37.316a12.17 12.17 0 0 0 5.502-8.173 12.96 12.96 0 0 0-2.246-9.811 14.03 14.03 0 0 0-15.043-5.568 12.8 12.8 0 0 0-3.592 1.57l-22.453 14.258a42.9 42.9 0 0 1-11.877 5.209 46.52 46.52 0 0 1-49.846-18.5 43.02 43.02 0 0 1-7.297-32.557A40.42 40.42 0 0 1 96.798 96.98l58.646-37.316a42.8 42.8 0 0 1 11.811-5.21 46.5 46.5 0 0 1 13.822-1.444z\"/></svg>",
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ffb300\" d=\"M29.168 14.03a2.7 2.7 0 0 0-1.968-.83 2.51 2.51 0 0 0-1.929.8h-4.443l3.078-3.078a2.835 2.835 0 0 0 2.857-2.842 2.6 2.6 0 0 0-.831-1.969 2.82 2.82 0 0 0-2.014-.788 2.67 2.67 0 0 0-1.968.788 2.36 2.36 0 0 0-.812 1.922L18 11.17V6.726a2.51 2.51 0 0 0 .8-1.929 2.7 2.7 0 0 0-.832-1.968 2.745 2.745 0 0 0-3.936 0 2.7 2.7 0 0 0-.832 1.968 2.51 2.51 0 0 0 .8 1.93v4.443l-3.138-3.138a2.36 2.36 0 0 0-.812-1.922 2.66 2.66 0 0 0-1.968-.788 2.83 2.83 0 0 0-2.014.788 2.6 2.6 0 0 0-.831 1.969 2.74 2.74 0 0 0 .831 2.013 2.8 2.8 0 0 0 2.026.829l3.078 3.078H6.729a2.51 2.51 0 0 0-1.929-.8 2.7 2.7 0 0 0-1.968.831 2.745 2.745 0 0 0 0 3.937 2.7 2.7 0 0 0 1.968.832 2.51 2.51 0 0 0 1.929-.8h4.443l-3.078 3.077a2.835 2.835 0 0 0-2.857 2.842 2.6 2.6 0 0 0 .831 1.969 2.82 2.82 0 0 0 2.014.788 2.67 2.67 0 0 0 1.968-.788 2.36 2.36 0 0 0 .812-1.922L14 20.827v4.444a2.51 2.51 0 0 0-.8 1.929 2.784 2.784 0 0 0 4.768 1.968A2.7 2.7 0 0 0 18.8 27.2a2.51 2.51 0 0 0-.8-1.929v-4.444l3.138 3.138a2.36 2.36 0 0 0 .812 1.922 2.66 2.66 0 0 0 1.968.788 2.83 2.83 0 0 0 2.014-.788 2.6 2.6 0 0 0 .831-1.969 2.74 2.74 0 0 0-.831-2.013 2.8 2.8 0 0 0-2.026-.829L20.828 18h4.443a2.51 2.51 0 0 0 1.93.8 2.784 2.784 0 0 0 1.967-4.769Z\"/></svg>",
      "swift": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#ff6e40\" d=\"M17.087 19.721c-2.36 1.36-5.59 1.5-8.86.1a13.8 13.8 0 0 1-6.23-5.32c.67.55 1.46 1 2.3 1.4 3.37 1.57 6.73 1.46 9.1 0-3.37-2.59-6.24-5.96-8.37-8.71-.45-.45-.78-1.01-1.12-1.51 8.28 6.05 7.92 7.59 2.41-1.01 4.89 4.94 9.43 7.74 9.43 7.74.16.09.25.16.36.22.1-.25.19-.51.26-.78.79-2.85-.11-6.12-2.08-8.81 4.55 2.75 7.25 7.91 6.12 12.24-.03.11-.06.22-.05.39 2.24 2.83 1.64 5.78 1.35 5.22-1.21-2.39-3.48-1.65-4.62-1.17\"/></svg>",
      "table": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#8bc34a\" d=\"M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m7 1.5V9h5.5zm4 7.5h-4v2h1l-2 1.67L10 13h1v-2H7v2h1l3 2.5L8 18H7v2h4v-2h-1l2-1.67L14 18h-1v2h4v-2h-1l-3-2.5 3-2.5h1z\"/></svg>",
      "tex": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><path fill=\"#2196f3\" d=\"M80 192 64 320h32c16-80 16-96 63.242-96H176c8.837 0 16 7.163 16 16v352c0 8.837 0 16-32 16h-32v32h192v-32h-32c-32 0-32-7.163-32-16V240c0-8.837 7.163-16 16-16h16c48 0 48 16 64 96h32l-16-128zm560 0v32c16 0 45.713 0 52.57 16L776 434.666 708.57 592c-6.857 16-52.57 16-68.57 16v32h128v-32s-34.285 0-27.428-16L792 472l51.428 120c3.103 7.24-1.52 16-11.428 16v32h128v-32c-16 0-45.713 0-52.57-16L824 397.334 891.43 240c6.857-16 52.57-16 68.57-16v-32H832v32s34.285 0 27.428 16L808 360l-51.428-120c-3.103-7.24 1.52-16 11.428-16v-32zM320 384v32h32c32 0 32 7.163 32 16v352c0 8.837 0 16-32 16h-32v32h304l16-128h-32c-16 80-16 96-64 96h-64c-32 0-32-7.163-32-16V624h80c8.837 0 16 0 16 32v16h32V544h-32v16c0 32-7.163 32-16 32h-80V432c0-8.837 0-16 32-16h64c48 0 48 16 64 96h32l-16-128z\"/></svg>",
      "toml": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#cfd8dc\" d=\"M4 6V4h8v2H9v7H7V6z\"/><path fill=\"#ef5350\" d=\"M4 1v1H2v12h2v1H1V1zm8 0v1h2v12h-2v1h3V1z\"/></svg>",
      "toml_light": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#455a64\" d=\"M4 6V4h8v2H9v7H7V6z\"/><path fill=\"#ef5350\" d=\"M4 1v1H2v12h2v1H1V1zm8 0v1h2v12h-2v1h3V1z\"/></svg>",
      "tsconfig": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#757575\" d=\"M15 2H6a2.006 2.006 0 0 0-2 2v22a2.006 2.006 0 0 0 2 2h6v-4H6v-2h6v-2H6v-2h6v-2H6v-2h6v-2h2V4l8 8h2v-1Z\" data-mit-no-recolor=\"true\"/><path fill=\"#0288d1\" d=\"M12 12v18h18V12Zm8 6h-2v8h-2v-8h-2v-2h6Zm8 0h-4v2h2a2.006 2.006 0 0 1 2 2v2a2.006 2.006 0 0 1-2 2h-4v-2h4v-2h-2a2.006 2.006 0 0 1-2-2v-2a2.006 2.006 0 0 1 2-2h4Z\"/></svg>",
      "tune": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#fbc02d\" d=\"M12 10h10v2H12z\"/><path fill=\"#fbc02d\" d=\"M16 4h2v8h-2zm4 18h10v2H20zm4 2h2v4h-2zm0-20h2v14h-2zM2 18h10v2H2z\"/><path fill=\"#fbc02d\" d=\"M6 18h2v10H6zM6 4h2v10H6zm10 12h2v12h-2z\"/></svg>",
      "typescript": "<svg xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\" viewBox=\"0 0 16 16\"><path fill=\"#0288d1\" d=\"M2 2v12h12V2zm4 6h3v1H8v4H7V9H6zm5 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1\"/></svg>",
      "video": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ff9800\" d=\"m24 6 2 6h-4l-2-6h-3l2 6h-4l-2-6h-3l2 6H8L6 6H5a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V6Z\"/></svg>",
      "vim": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#43a047\" d=\"M22.19 4H16v4h2.19L12 14.19V8h2V4H2v4h2v20h4v-.01l.01.01L28 8V4z\"/></svg>",
      "visualstudio": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#ab47bc\" d=\"m22 11.8-5.7 4.584L22 20.8zM7.24 23.68 4 21.64v-10.8l3.6-1.2 5.16 3.996L23.2 4 28 7v18.6L22 28l-9.192-8.808zm.36-5.28 2.232-2.064L7.6 14.2Z\"/></svg>",
      "vite": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#a0f\" d=\"M29.313 12h-6.664a1.427 1.427 0 0 1-1.1-2.24l4.398-6.676A.703.703 0 0 0 25.397 2H8.428a.62.62 0 0 0-.55.289l-5.77 8.627A.703.703 0 0 0 2.658 12h8.175a1.427 1.427 0 0 1 1.099 2.24l-4.48 6.676A.702.702 0 0 0 8 22l6.695.002A1.34 1.34 0 0 1 16 23.375v5.934a.652.652 0 0 0 1.168.433l12.694-16.586a.725.725 0 0 0-.55-1.156\"/></svg>",
      "vue": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#41b883\" d=\"M1.791 3.851 12 21.471 22.209 3.936V3.85H18.24l-6.18 10.616L5.906 3.851z\"/><path fill=\"#35495e\" d=\"m5.907 3.851 6.152 10.617L18.24 3.851h-3.723L12.084 8.03 9.66 3.85z\"/></svg>",
      "webpack": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#fafafa\" fill-opacity=\".785\" d=\"m19.376 15.988-7.708 4.45-7.709-4.45v-8.9l7.709-4.451 7.708 4.45z\"/><path fill=\"#90caf9\" d=\"M12.286 1.98c-.21 0-.41.059-.57.179l-7.9 4.44c-.32.17-.53.5-.53.88v9c0 .38.21.711.53.881l7.9 4.44c.16.12.36.18.57.18s.41-.06.57-.18l7.9-4.44c.32-.17.53-.5.53-.88v-9c0-.38-.21-.712-.53-.882l-7.9-4.44a.95.95 0 0 0-.57-.179zm0 2.15 7 3.94v2.103h-.016v5.177h.016v.54l-7 3.939-7-3.94V8.07zm0 2.08-4.9 2.83 4.9 2.83 4.9-2.83zm-5 5.08v3.58l4 2.309v-3.58l-4-2.31zm10 0-4 2.308v3.58l4-2.308z\"/><path fill=\"#0277bd\" d=\"m12.286 6.21-4.9 2.83 4.9 2.83 4.9-2.83zm-5 5.08v3.58l4 2.309v-3.58l-4-2.31zm10 0-4 2.308v3.58l4-2.308z\"/></svg>",
      "xml": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#8bc34a\" d=\"M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.11.89-2 2-2m.12 13.5 3.74 3.74 1.42-1.41-2.33-2.33 2.33-2.33-1.42-1.41zm11.16 0-3.74-3.74-1.42 1.41 2.33 2.33-2.33 2.33 1.42 1.41z\"/></svg>",
      "yaml": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#ff5252\" d=\"M13 9h5.5L13 3.5zM6 2h8l6 6v12c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2m12 16v-2H9v2zm-4-4v-2H6v2z\"/></svg>",
      "yarn": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><path fill=\"#0288d1\" d=\"M27.575 23.967a9.9 9.9 0 0 0-3.751 1.726 22.6 22.6 0 0 1-5.537 2.504 1.55 1.55 0 0 1-.931.52 59 59 0 0 1-6.11.548c-1.102.008-1.777-.282-1.965-.735a1.49 1.49 0 0 1 .82-1.965 3.6 3.6 0 0 1-.486-.359c-.163-.162-.334-.487-.385-.367-.213.52-.324 1.794-.897 2.366-.786.795-2.273.53-3.153.069-.965-.513.069-1.718.069-1.718a.69.69 0 0 1-.94-.324 4.6 4.6 0 0 1-.632-2.794 5.2 5.2 0 0 1 1.674-2.76 8.84 8.84 0 0 1 .624-4.17 9.9 9.9 0 0 1 3-3.469S7.136 11.015 7.82 9.177c.444-1.196.623-1.187.769-1.239a3.44 3.44 0 0 0 1.375-.811 4.99 4.99 0 0 1 4.178-1.607s1.094-3.357 2.12-2.7a17.4 17.4 0 0 1 1.452 2.735s1.213-.71 1.35-.445a10.74 10.74 0 0 1 .495 5.81 13.3 13.3 0 0 1-2.46 5.127c-.129.214 1.47.889 2.477 3.683.932 2.554.103 4.699.248 4.938.026.043.034.06.034.06s1.068.085 3.213-1.24a8.05 8.05 0 0 1 4.05-1.52 1.026 1.026 0 0 1 .453 2Z\"/></svg>",
      "zip": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"#afb42b\" d=\"M14 17h-2v-2h-2v-2h2v2h2m0-6h-2v2h2v2h-2v-2h-2V9h2V7h-2V5h2v2h2m5-4H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2\"/></svg>",
    }
    const EXT_ICON = {"js":"javascript","jsx":"react","mjs":"javascript","cjs":"javascript","ts":"typescript","tsx":"react_ts","mts":"typescript","cts":"typescript","json":"json","jsonc":"json","py":"python","pyi":"python","pyw":"python","sh":"console","bash":"console","zsh":"console","fish":"console","css":"css","scss":"sass","sass":"sass","less":"less","yml":"yaml","yaml":"yaml","toml":"toml","ini":"settings","conf":"settings","env":"tune","go":"go","rs":"rust","java":"java","kt":"kotlin","kts":"kotlin","cpp":"cpp","cxx":"cpp","cc":"cpp","hpp":"hpp","hxx":"hpp","hh":"hpp","ipp":"cpp","tpp":"cpp","ino":"arduino","c":"c","h":"h","cs":"csharp","sql":"database","rb":"ruby","md":"markdown","markdown":"markdown","mdx":"mdx","html":"html","htm":"html","xml":"xml","svg":"svg","png":"image","jpg":"image","jpeg":"image","gif":"image","webp":"image","ico":"image","pdf":"pdf","txt":"document","log":"log","lock":"lock","csproj":"visualstudio","sln":"visualstudio","gradle":"gradle","proto":"proto","graphql":"graphql","gql":"graphql","vue":"vue","svelte":"svelte","php":"php","lua":"lua","dart":"dart","swift":"swift","zip":"zip","tar":"zip","gz":"zip","woff":"font","woff2":"font","ttf":"font","mp3":"audio","mp4":"video","ipynb":"jupyter","csv":"table","tex":"tex","hs":"haskell","ex":"elixir","erl":"erlang","clj":"clojure","elm":"elm","r":"r","jl":"julia","vim":"vim"}
    const NAME_ICON = {"package.json":"nodejs","package-lock.json":"nodejs","yarn.lock":"yarn","pnpm-lock.yaml":"pnpm","tsconfig.json":"tsconfig","jsconfig.json":"jsconfig","dockerfile":"docker","docker-compose.yml":"docker","makefile":"makefile","cmakelists.txt":"cmake","readme.md":"readme","readme":"readme","license":"license","license.md":"license","license.txt":"license",".gitignore":"git",".gitattributes":"git",".gitmodules":"git",".editorconfig":"editorconfig",".npmrc":"npm",".prettierrc":"prettier",".eslintrc":"eslint",".eslintrc.json":"eslint",".babelrc":"babel","vite.config.ts":"vite","webpack.config.js":"webpack","jest.config.js":"jest",".env.local":"tune","gemfile":"gemfile","procfile":"heroku","requirements.txt":"python-misc","pyproject.toml":"python-misc","go.mod":"go-mod","pom.xml":"maven",".python-version":"python-misc",".nvmrc":"nodejs"}
    const FOLDER_ICON = {".git":"folder-git",".github":"folder-github","node_modules":"folder-node","src":"folder-src","dist":"folder-dist","build":"folder-dist","test":"folder-test","tests":"folder-test","docs":"folder-docs",".vscode":"folder-vscode","locales":"folder-i18n","assets":"folder-resource","config":"folder-config","packages":"folder-packages","api":"folder-api","components":"folder-components","styles":"folder-css","types":"folder-typescript","utils":"folder-utils","scripts":"folder-scripts","public":"folder-public"}
    const FOLDER_OPEN_ICON = {".git":"folder-git-open",".github":"folder-github-open","node_modules":"folder-node-open","src":"folder-src-open","dist":"folder-dist-open","build":"folder-dist-open","test":"folder-test-open","tests":"folder-test-open","docs":"folder-docs-open",".vscode":"folder-vscode-open","locales":"folder-i18n-open","assets":"folder-resource-open","config":"folder-config-open","packages":"folder-packages-open","api":"folder-api-open","components":"folder-components-open","styles":"folder-css-open","types":"folder-typescript-open","utils":"folder-utils-open","scripts":"folder-scripts-open","public":"folder-public-open"}
    const LIGHT_ICON = {"toml":"toml_light","pnpm":"pnpm_light"}

    const ICON_URLS = new Map()

    /** Whether the host page is currently dark (the shell marks it on body). */
    function isDarkTheme() {
      try {
        return typeof document !== 'undefined' && document.body !== null && document.body.hasAttribute('data-ds-dark-theme')
      } catch (_noDocument) {
        return true
      }
    }

    /** Data URL for one bundled glyph, built once per key. */
    function iconUrl(key) {
      const cached = ICON_URLS.get(key)
      if (cached !== undefined) return cached
      const svg = ICON_SVG[key] === undefined ? ICON_SVG.file : ICON_SVG[key]
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      ICON_URLS.set(key, url)
      return url
    }

    /** Resolve a tree entry to its Material glyph key. */
    function iconKeyOf(name, directory, expanded) {
      const lower = String(name || "").toLowerCase()
      const dark = isDarkTheme()
      const pick = (key) => (dark ? key : (LIGHT_ICON[key] || key))
      if (directory === true) {
        const table = expanded === true ? FOLDER_OPEN_ICON : FOLDER_ICON
        return pick(table[lower] || (expanded === true ? "folder-open" : "folder"))
      }
      if (NAME_ICON[lower] !== undefined) return pick(NAME_ICON[lower])
      const dot = lower.lastIndexOf(".")
      if (dot !== -1) {
        const extension = lower.slice(dot + 1)
        if (EXT_ICON[extension] !== undefined) return pick(EXT_ICON[extension])
      }
      return "file"
    }

    /** One Material file/folder glyph, or a named theme glyph via `glyph`. */
    function MaterialIcon(props) {
      const size = props.size === undefined ? 16 : props.size
      const key = typeof props.glyph === 'string'
        ? props.glyph
        : iconKeyOf(props.name, props.directory === true, props.expanded === true)
      return h("img", {
        className: "dcv-materialIcon",
        src: iconUrl(key),
        width: size, height: size, alt: "", "aria-hidden": true, draggable: false,
      })
    }

    /* ------------------------------------------------------------------ panel */

    /** Tab body: the whole Code page. */
    function createPanel(ctx, faces) {
      // Each Remote namespace is its own Cordis service (`remote.<namespace>`), and
      // reaching one through `ctx.remote` needs that dotted key in `inject`; the
      // direct lookup below is the same service by its exact key.
      const remoteFace = () => {
        try {
          const namespace = ctx.get('remote.workspaceFiles')
          if (namespace !== undefined && namespace !== null && typeof namespace.list === 'function') return namespace
        } catch (_guarded) { /* fall through to the nested access */ }
        try {
          const remote = ctx.get('remote')
          return remote && remote.workspaceFiles ? remote.workspaceFiles : undefined
        } catch (_guarded) {
          return undefined
        }
      }

      /** The keys that actually reach this command on this profile, for the panel's hints. */
      const shortcutHint = () => {
        try {
          const shortcuts = ctx.get('shortcuts')
          const fixed = shortcuts === undefined || shortcuts === null || shortcuts.fixedCatalog === undefined
            ? undefined
            : shortcuts.fixedCatalog.getSnapshot().find(entry => entry.id === 'code.view')
          if (fixed !== undefined && Array.isArray(fixed.keys) && fixed.keys.length > 0) return fixed.keys.join(' / ')
          const row = shortcuts === undefined || shortcuts === null
            ? undefined
            : shortcuts.catalog.getSnapshot().find(entry => entry.id === 'code.view')
          if (row !== undefined && Array.isArray(row.keys) && row.keys.length > 0) return row.keys.join(' / ')
          const primary = shortcuts !== undefined && shortcuts !== null && shortcuts.platform === 'macos' ? 'Cmd' : 'Ctrl'
          return `${primary}+Shift+L`
        } catch (_noShortcuts) {
          return 'Ctrl+Shift+L'
        }
      }

      /**
       * Hand the keyboard back to the composer with the caret it last held.
       * `SessionInput.focus()` is the shipped path for callers that took focus
       * away (it restores Lexical's stored selection, unlike a bare DOM focus).
       */
      function focusComposer(sessionId) {
        try {
          const binding = ctx.sessions.binding(sessionId)
          if (binding === undefined) return
          const conversation = binding.ctx.get('conversation')
          const resolver = conversation === undefined || conversation === null ? undefined : conversation.input
          const input = resolver !== undefined && typeof resolver.for === 'function' ? resolver.for(binding.ctx) : undefined
          if (input !== undefined && typeof input.focus === 'function') input.focus()
        } catch (_noComposer) {
          /* The composer is not mounted in this shell; nothing to focus. */
        }
      }

      /** Insert an `@file` reference chip at the composer caret; plain text if no chip listener. */
      function insertReference(sessionId, inputActions, relPath, range) {
        if (typeof relPath !== 'string' || relPath === '') return { ok: false, reason: 'no-file' }
        if (inputActions === undefined || inputActions === null || typeof inputActions.captureInsertion !== 'function') {
          return { ok: false, reason: 'no-input' }
        }
        const mention = referenceMention(relPath, range)
        const reference = {
          source: 'reference',
          // The chip points at the real path; the draft text carries the range.
          ref: mentionFor(relPath),
          label: range === null || range === undefined
            ? baseName(relPath)
            : `${baseName(relPath)}${range.first === range.last ? `:${range.first}` : `:${range.first}-${range.last}`}`,
          appearance: 'file',
          clipboardText: mention,
        }
        let result
        try {
          // The composer owns inline references; its session-scoped listener inserts the chip.
          const binding = ctx.sessions.binding(sessionId)
          if (binding !== undefined) {
            const accepted = binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', {
              reference, span: inputActions.captureInsertion(),
            })
            if (accepted === true) result = { ok: true, chip: true }
          }
          if (result === undefined) {
            // No listener, or a refused request: a plain mention still reaches the model.
            const inserted = inputActions.insertText(`${mention} `, inputActions.captureInsertion())
            result = inserted === true ? { ok: true, chip: false } : { ok: false, reason: 'refused' }
          }
        } catch (_failed) {
          return { ok: false, reason: 'refused' }
        }
        // The reference lands at the composer caret; move the keyboard there so typing continues.
        if (result.ok === true) focusComposer(sessionId)
        return result
      }

      /**
       * The embedded command line: the shipped terminal view (`ctx.webTerminals`)
       * driven from a text buffer. It is not a full emulator — output is stripped
       * of ANSI sequences and rendered as text, which is what a panel-width
       * command line needs. The PTY survives closing the section.
       */
      function TerminalDock(props) {
        const t = props.t
        const { sessionId } = props
        const [phase, setPhase] = useState('idle')
        const [lines, setLines] = useState([''])
        const [draft, setDraft] = useState('')
        const [error, setError] = useState(null)
        const [xtermModule, setXtermModule] = useState(null)
        const [attempt, setAttempt] = useState(0)
        const identityRef = useRef({ key: 'code-viewer', content: 'code-viewer://terminal', service: null })
        const retryRef = useRef(null)

        /** The Host terminal id survives page reloads; reattaching avoids a new PTY each time. */
        const savedTerminalId = () => {
          try { return window.localStorage.getItem(`codeide.terminal.${sessionId}`) || undefined } catch (_noStorage) { return undefined }
        }
        const rememberTerminalId = (id) => {
          try { window.localStorage.setItem(`codeide.terminal.${sessionId}`, id) } catch (_noStorage) { /* private mode */ }
        }
        const forgetTerminalId = () => {
          try { window.localStorage.removeItem(`codeide.terminal.${sessionId}`) } catch (_noStorage) { /* private mode */ }
        }
        const bufferRef = useRef({ lines: [''], cursor: { row: 0, column: 0 } })
        const viewRef = useRef(null)
        const pendingRef = useRef([])
        const revisionRef = useRef(0)
        const sizeRef = useRef({ cols: 0, rows: 0 })
        const historyRef = useRef({ items: [], index: 0 })
        const bodyRef = useRef(null)
        const hostRef = useRef(null)
        const terminalRef = useRef(null)

        useEffect(() => {
          const webTerminals = ctx.get('webTerminals')
          if (webTerminals === undefined || webTerminals === null || typeof webTerminals.view !== 'function') {
            setPhase('unavailable')
            return undefined
          }
          const key = attempt === 0 ? 'code-viewer' : `code-viewer-${attempt}`
          const content = attempt === 0 ? 'code-viewer://terminal' : `code-viewer://terminal/${attempt}`
          identityRef.current = { key, content, service: webTerminals }
          let view
          try {
            view = webTerminals.view(sessionId, key, content, attempt === 0 ? savedTerminalId() : undefined)
          } catch (failure) {
            setPhase('failed')
            setError(failure instanceof Error ? failure.message : String(failure))
            return undefined
          }
          viewRef.current = view
          revisionRef.current = 0
          bufferRef.current = { lines: [''], cursor: { row: 0, column: 0 } }
          let sawSnapshot = false
          let retryTimer = null
          const sync = () => {
            const state = view.state.getSnapshot()
            setPhase(state.phase)
            setError(state.error === undefined || state.error === null ? null : state.error)
            if (state.info !== undefined && state.info !== null && typeof state.info.id === 'string' && state.info.id !== '') {
              rememberTerminalId(state.info.id)
            }
            // A remembered terminal that no longer exists must not be retried as-is.
            if (state.phase === 'failed') forgetTerminalId()
            // One quiet retry: a first attach can lose a race with the Host.
            if (state.phase === 'failed' && attempt === 0 && retryTimer === null && retryRef.current !== null) {
              retryTimer = window.setTimeout(() => { retryRef.current() }, 1500)
            }
            if (state.writable === true && pendingRef.current.length > 0) {
              const queued = pendingRef.current
              pendingRef.current = []
              for (const data of queued) view.write(data)
            }
            const render = state.render
            if (render === undefined || render === null || render.revision <= revisionRef.current) return
            revisionRef.current = render.revision
            if (render.frame.type === 'snapshot') {
              bufferRef.current = splitScreen(render.frame.screen)
              sawSnapshot = true
            } else if (sawSnapshot) {
              bufferRef.current = applyTerminalOutput(bufferRef.current.lines, bufferRef.current.cursor, render.frame.data)
            } else {
              return
            }
            const terminal = terminalRef.current
            if (terminal !== null) {
              const payload = render.frame.type === 'snapshot' ? render.frame.screen : render.frame.data
              if (render.frame.type === 'snapshot') terminal.reset()
              terminal.write(payload, () => { view.acknowledge(render.revision) })
              if (bufferRef.current.lines.length > 2500) {
                bufferRef.current = { lines: bufferRef.current.lines.slice(-2500), cursor: { row: 0, column: 0 } }
              }
              return
            }
            if (bufferRef.current.lines.length > 2500) {
              const dropped = bufferRef.current.lines.length - 2500
              bufferRef.current = {
                lines: bufferRef.current.lines.slice(-2500),
                cursor: { row: Math.max(0, bufferRef.current.cursor.row - dropped), column: bufferRef.current.cursor.column },
              }
            }
            setLines(bufferRef.current.lines.slice())
            view.acknowledge(render.revision)
          }
          const unsubscribe = view.state.subscribe(sync)
          const detach = view.mount()
          sync()
          return () => {
            if (retryTimer !== null) window.clearTimeout(retryTimer)
            unsubscribe()
            detach()
            viewRef.current = null
          }
        }, [sessionId, attempt])

        /** Replace a failed terminal view with a fresh one. */
        const retryTerminal = useCallback(() => {
          const { key, content, service } = identityRef.current
          try {
            if (service !== null && typeof service.close === 'function') service.close(sessionId, key, content)
          } catch (_closeFailed) { /* the view may never have reached the Host */ }
          setError(null)
          setAttempt(value => value + 1)
        }, [sessionId])
        retryRef.current = retryTerminal

        // Prefer the real terminal component: xterm plus this plugin's PTY
        // stream. Environments without ResizeObserver/matchMedia keep the text
        // renderer, which is also the SSR and test path.
        useEffect(() => {
          if (typeof ResizeObserver !== 'function' || typeof window.matchMedia !== 'function') return undefined
          let live = true
          loadXterm().then((module) => {
            if (live && module !== null && typeof module.Terminal === 'function') setXtermModule(module)
          }).catch(() => { /* keep the text renderer when the asset cannot load */ })
          return () => { live = false }
        }, [])

        useEffect(() => {
          if (xtermModule === null) return undefined
          const host = hostRef.current
          if (host === null) return undefined
          const view = viewRef.current
          const style = window.getComputedStyle(host)
          let term
          try {
            term = new xtermModule.Terminal({
              fontFamily: MONO,
              fontSize: 11.5,
              lineHeight: 1.2,
              scrollback: 2000,
              cursorBlink: true,
              convertEol: false,
              theme: {
                background: style.backgroundColor,
                foreground: style.color,
                selectionBackground: 'rgba(125, 150, 255, 0.28)',
              },
            })
            term.open(host)
          } catch (_noTerminal) {
            setXtermModule(null)
            return undefined
          }
          terminalRef.current = term
          if (bufferRef.current.lines.join('') !== '') term.write(bufferRef.current.lines.join('\r\n'))
          const dataDisposable = term.onData((data) => {
            const target = viewRef.current
            if (target === null) return
            if (target.state.getSnapshot().writable === true) target.write(data)
            else pendingRef.current.push(data)
          })
          const resizeDisposable = term.onResize(({ cols, rows }) => {
            const target = viewRef.current
            if (target !== null) target.resize(cols, rows)
          })
          const measure = () => {
            const probe = document.createElement('span')
            probe.textContent = 'W'.repeat(20)
            probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${MONO};font-size:11.5px`
            document.body.appendChild(probe)
            const width = probe.getBoundingClientRect().width / 20
            probe.remove()
            const cell = width > 1 ? width : 7
            const cols = Math.max(20, Math.floor((host.clientWidth - 12) / cell))
            const rows = Math.max(4, Math.floor((host.clientHeight - 8) / 14))
            if (cols !== term.cols || rows !== term.rows) term.resize(cols, rows)
          }
          measure()
          const observer = new ResizeObserver(measure)
          observer.observe(host)
          return () => {
            observer.disconnect()
            dataDisposable.dispose()
            resizeDisposable.dispose()
            if (view !== undefined && view !== null && revisionRef.current > 0) view.acknowledge(revisionRef.current)
            terminalRef.current = null
            term.dispose()
          }
        }, [xtermModule])

        // Keep the PTY's width and height close to the rendered box.
        useEffect(() => {
          const measure = () => {
            const view = viewRef.current
            const box = bodyRef.current
            if (view === null || box === null) return
            const cols = Math.max(24, Math.floor(box.clientWidth / 7))
            const rows = Math.max(6, Math.floor(box.clientHeight / 18))
            if (cols === sizeRef.current.cols && rows === sizeRef.current.rows) return
            sizeRef.current = { cols, rows }
            view.resize(cols, rows)
          }
          measure()
          window.addEventListener('resize', measure)
          return () => { window.removeEventListener('resize', measure) }
        }, [])

        // Follow the tail.
        useEffect(() => {
          const box = bodyRef.current
          if (box !== null) box.scrollTop = box.scrollHeight
        }, [lines])

        const send = (data) => {
          const view = viewRef.current
          if (view === null) return
          if (view.state.getSnapshot().writable === true) view.write(data)
          else pendingRef.current.push(data)
        }

        const submit = () => {
          if (draft === '') return
          const history = historyRef.current
          history.items.push(draft)
          if (history.items.length > 200) history.items = history.items.slice(-200)
          history.index = history.items.length
          setDraft('')
          send(`${draft}\r`)
        }

        const phaseKey = `term.phase.${phase}`
        return h('div', { className: 'dcv-term', 'data-code-viewer-terminal': phase },
          h('div', { className: 'dcv-termHead' },
            h(IconTerminal, { size: 13 }),
            h('span', { className: 'dcv-termTitle' }, t('term.title')),
            h('span', { className: 'dcv-termPhase', title: error === null ? undefined : String(error) }, t(phaseKey)),
            h('button', {
              type: 'button', className: 'dcv-tool dcv-mini', title: t('term.openBuiltin'),
              onClick: () => {
                try {
                  ctx.sidebarRight.openTab('terminal')
                } catch (_noTerminalTab) { /* the terminal bundle is not mounted */ }
              },
            }, h(IconExternal, { size: 13 })),
            h('button', {
              type: 'button', className: 'dcv-tool dcv-mini', title: t('term.clear'),
              onClick: () => {
                bufferRef.current = { lines: [''], cursor: { row: 0, column: 0 } }
                setLines([''])
                if (terminalRef.current !== null) terminalRef.current.clear()
              },
            }, h('span', null, t('term.clear'))),
            h('button', {
              type: 'button', className: 'dcv-tool dcv-mini', title: t('term.interrupt'),
              onClick: () => { send('\u0003') },
            }, h('span', null, t('term.interrupt'))),
            h('button', {
              type: 'button', className: 'dcv-tool dcv-mini', title: t('term.close'),
              onClick: () => { if (typeof props.onClose === 'function') props.onClose() },
            }, h(IconClose, { size: 13 }))),
          phase === 'failed' || phase === 'disconnected'
            ? h('div', { className: 'dcv-termError' },
              h('span', { className: 'dcv-termErrorMessage' },
                error === null ? t('term.failed') : `${t('term.failed')}: ${error}`),
              h('button', {
                type: 'button', className: 'dcv-tab',
                onClick: () => { retryTerminal() },
              }, t('term.retry')))
            : null,
          xtermModule === null
            ? h('div', { className: 'dcv-termBody', ref: bodyRef },
              h('pre', { className: 'dcv-termScreen' }, lines.join('\n')))
            : h('div', { className: 'dcv-termXterm', ref: hostRef }),
          xtermModule !== null ? null : h('div', { className: 'dcv-termInput' },
            h('span', { className: 'dcv-termPrompt' }, '$'),
            h('input', {
              className: 'dcv-termField',
              value: draft,
              spellCheck: false,
              autoComplete: 'off',
              placeholder: t('term.placeholder'),
              'aria-label': t('term.title'),
              onChange: (event) => { setDraft(event.target.value) },
              onKeyDown: (event) => {
                if (event.key === 'Enter') { event.preventDefault(); submit(); return }
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  const history = historyRef.current
                  if (history.items.length === 0) return
                  const step = event.key === 'ArrowUp' ? -1 : 1
                  history.index = Math.max(0, Math.min(history.items.length, history.index + step))
                  setDraft(history.index >= history.items.length ? '' : history.items[history.index])
                  return
                }
                if (event.key === 'c' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  send('\u0003')
                }
              },
            })))
      }

      function CodePanel(props) {
        const t = typeof props.t === 'function' ? props.t : key => key
        const { sessionId, useSessions, useTabInfo, inputActions } = props
        const useSessionSelector = typeof useSessions === 'function'
          ? useSessions
          : selector => selector({ byId: {} })
        const cwd = useSessionSelector(snapshot => {
          const entry = snapshot && snapshot.byId ? snapshot.byId[sessionId] : undefined
          return entry === undefined ? undefined : entry.cwd
        })
        const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined
        const tabId = info && info.tab ? info.tab.id : undefined

        const [mode, setMode] = useState('files')
        const [selected, setSelected] = useState(null)
        const [expanded, setExpanded] = useState({ '': true })
        const [dirs, setDirs] = useState({})
        const [doc, setDoc] = useState({ status: 'idle' })
        const [repo, setRepo] = useState({ status: 'idle' })
        const [graph, setGraph] = useState({ status: 'idle' })
        const [commit, setCommit] = useState({ status: 'idle' })
        const [commitFile, setCommitFile] = useState(null)
        const [statusFiles, setStatusFiles] = useState([])
        const [notice, setNotice] = useState(null)
        const [showIgnored, setShowIgnored] = useState(false)
        const [mdMode, setMdMode] = useState('render')
        const [jsonPretty, setJsonPretty] = useState(true)
        const [themeEpoch, setThemeEpoch] = useState(0)
        const [termOpen, setTermOpen] = useState(true)
        const [treeWidth, setTreeWidth] = useState(260)
        const [termHeight, setTermHeight] = useState(200)
        const [imageFit, setImageFit] = useState(true)
        const [imageInfo, setImageInfo] = useState(null)
        const [preview, setPreview] = useState(false)
        const [editText, setEditText] = useState('')
        const [editMtime, setEditMtime] = useState(null)
        const [saveState, setSaveState] = useState('idle')
        const [saveMessage, setSaveMessage] = useState(null)
        const [diffMarks, setDiffMarks] = useState({})
        const [diffUntracked, setDiffUntracked] = useState(false)
        const editorRef = useRef(null)
        const gutterRef = useRef(null)
        const highlightRef = useRef(null)
        const panelRef = useRef(null)
        const bodyRef = useRef(null)
        const alive = useRef(true)
        const abortRef = useRef(null)

        // Glyphs carry their own colors, and two of them have a light variant;
        // re-render when the shell flips the page theme.
        useEffect(() => {
          if (typeof document === 'undefined' || document.body === null || typeof MutationObserver !== 'function') return undefined
          const observer = new MutationObserver(() => { if (alive.current) setThemeEpoch(value => value + 1) })
          observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-ds-dark-theme'] })
          return () => { observer.disconnect() }
        }, [])

        useEffect(() => {
          alive.current = true
          const controller = typeof AbortController === 'function' ? new AbortController() : null
          abortRef.current = controller
          return () => {
            alive.current = false
            if (controller !== null) controller.abort()
            abortRef.current = null
          }
        }, [])

        useEffect(() => {
          if (notice === null) return undefined
          const timer = setTimeout(() => { if (alive.current) setNotice(null) }, 2600)
          return () => { clearTimeout(timer) }
        }, [notice])

        /** One workspace directory page, at an absolute path. */
        const listRemote = useCallback(async (target) => {
          const remote = remoteFace()
          if (remote === undefined) return { ok: false, error: { code: 'workspace-file/unavailable' } }
          try {
            const result = await remote.list(sessionId, target, abortRef.current === null ? undefined : abortRef.current.signal)
            if (result === undefined || result === null) {
              return { ok: false, error: { code: 'bad-response', message: 'empty Remote result' } }
            }
            return result
          } catch (error) {
            return { ok: false, error: { code: 'exception', message: error instanceof Error ? error.message : String(error) } }
          }
        }, [sessionId])

        /** One workspace file page, at an absolute path. */
        const readRemote = useCallback(async (target) => {
          const remote = remoteFace()
          if (remote === undefined) return { ok: false, error: { code: 'workspace-file/unavailable' } }
          try {
            const result = await remote.read(
              sessionId,
              target,
              { offset: 1, limit: 3000 },
              abortRef.current === null ? undefined : abortRef.current.signal,
            )
            if (result === undefined || result === null) {
              return { ok: false, error: { code: 'bad-response', message: 'empty Remote result' } }
            }
            return result
          } catch (error) {
            return { ok: false, error: { code: 'exception', message: error instanceof Error ? error.message : String(error) } }
          }
        }, [sessionId])

        /**
         * List one directory through the Remote. The Host refuses an empty path
         * (`gateway/bad-request`), so the root is the Session's absolute working
         * directory. The workspace-relative form is retried once in case the
         * Session directory differs from the resolved workspace root.
         */
        const listDirectory = useCallback(async (dir) => {
          const absolute = joinPath(cwd, dir)
          const first = await withTimeout(listRemote(absolute), 12000)
          if (first.ok === true) return first
          const relative = dir === '' ? '.' : dir
          if (relative !== absolute) {
            const second = await withTimeout(listRemote(relative), 12000)
            if (second.ok === true) return second
          }
          return first
        }, [cwd, listRemote])

        const loadDir = useCallback(async (dir) => {
          setDirs(previous => ({ ...previous, [dir]: { status: 'loading' } }))
          try {
            const result = await listDirectory(dir)
            if (!alive.current) return
            const value = result.ok === true ? result.value : undefined
            const entries = value !== undefined && value !== null && Array.isArray(value.entries) ? value.entries : null
            if (entries === null) {
              setDirs(previous => ({
                ...previous,
                [dir]: {
                  status: 'error',
                  error: result && result.error !== undefined ? result.error : { code: 'bad-response', message: 'unexpected listing response' },
                },
              }))
              return
            }
            setDirs(previous => ({
              ...previous,
              [dir]: { status: 'ready', entries: sortEntries(entries), truncated: value.truncated === true },
            }))
          } catch (error) {
            if (!alive.current) return
            setDirs(previous => ({
              ...previous,
              [dir]: { status: 'error', error: { code: 'exception', message: error instanceof Error ? error.message : String(error) } },
            }))
          }
        }, [listDirectory])

        const loadRepo = useCallback(async (directory) => {
          if (typeof directory !== 'string' || directory === '') { setRepo({ status: 'noWorkspace' }); return }
          setRepo({ status: 'loading' })
          try {
            const info = await apiGet('/repo', { path: directory })
            if (!alive.current) return
            setRepo({ status: 'ready', data: info })
          } catch (error) {
            if (!alive.current) return
            setRepo({ status: 'error', error: error instanceof Error ? error.message : String(error) })
          }
          // Marks work even when the workspace only contains repositories.
          try {
            const status = await apiGet('/status', { path: directory })
            if (alive.current) setStatusFiles(Array.isArray(status.files) ? status.files : [])
          } catch (_noStatus) {
            if (alive.current) setStatusFiles([])
          }
        }, [])

        const refreshStatus = useCallback(async (directory) => {
          if (typeof directory !== 'string' || directory === '') return
          try {
            const status = await apiGet('/status', { path: directory })
            if (alive.current) setStatusFiles(Array.isArray(status.files) ? status.files : [])
          } catch (_noStatus) { /* keep the previous marks when git is unavailable */ }
        }, [])

        useEffect(() => {
          if (typeof cwd !== 'string' || cwd === '') return undefined
          let last = 0
          const onFocus = () => {
            const now = Date.now()
            if (now - last < 4000) return
            last = now
            void refreshStatus(cwd)
          }
          window.addEventListener('focus', onFocus)
          return () => { window.removeEventListener('focus', onFocus) }
        }, [cwd, refreshStatus])

        const loadGraph = useCallback(async (directory) => {
          if (typeof directory !== 'string' || directory === '') { setGraph({ status: 'noWorkspace' }); return }
          setGraph({ status: 'loading' })
          try {
            const data = await apiGet('/log', { path: directory, limit: '250' })
            if (alive.current) setGraph({ status: 'ready', data })
          } catch (error) {
            if (alive.current) setGraph({ status: 'error', error: error instanceof Error ? error.message : String(error) })
          }
        }, [])

        const loadCommit = useCallback(async (directory, hash) => {
          setCommitFile(null)
          setCommit({ status: 'loading', hash })
          try {
            const data = await apiGet('/commit', { path: directory, hash })
            if (alive.current) setCommit({ status: 'ready', hash, data })
          } catch (error) {
            if (alive.current) setCommit({ status: 'error', hash, error: error instanceof Error ? error.message : String(error) })
          }
        }, [])

        // A new Session or working directory is a new page.
        useEffect(() => {
          setSelected(null)
          setDirs({})
          setExpanded({ '': true })
          setDoc({ status: 'idle' })
          setGraph({ status: 'idle' })
          setCommit({ status: 'idle' })
          setStatusFiles([])
          if (typeof cwd !== 'string' || cwd === '') { setRepo({ status: 'noWorkspace' }); return }
          void loadDir('')
          void loadRepo(cwd)
        }, [sessionId, cwd, loadDir, loadRepo])

        const dirtyRef = useRef(false)
        const saveStateRef = useRef('idle')
        saveStateRef.current = saveState
        dirtyRef.current = doc.status === 'ready' && doc.image !== true && editText !== (typeof doc.text === 'string' ? doc.text : '')

        const openFile = useCallback(async (path) => {
          if (dirtyRef.current && selected !== null && selected.path !== path) {
            if (saveStateRef.current === 'conflict' || saveStateRef.current === 'error') {
              const discard = typeof window.confirm === 'function' ? window.confirm(t('edit.discardConfirm')) : true
              if (!discard) return
            } else {
              await saveFileRef.current(false)
            }
          }
          setPreview(false)
          setEditText('')
          setEditMtime(null)
          setSaveState('idle')
          setSaveMessage(null)
          setSelected({ path, name: baseName(path) })
          setMode('files')
          setCommit({ status: 'idle' })
          setImageInfo(null)
          if (isImagePath(path)) {
            setDoc({ status: 'ready', path, image: true, text: '', lines: 0, eof: true, bytes: 0 })
            return
          }
          setDoc({ status: 'loading', path })
          try {
            const result = await withTimeout(readRemote(joinPath(cwd, path)), 15000)
            if (!alive.current) return
            const value = result.ok === true ? result.value : undefined
            if (value === undefined || value === null || typeof value.text !== 'string') {
              setDoc({
                status: 'error', path,
                error: result && result.error !== undefined ? result.error : { code: 'bad-response', message: 'unexpected file response' },
              })
              return
            }
            const text = value.text
            const bytes = typeof value.bytes === 'number' ? value.bytes : text.length
            setDoc({
              status: 'ready', path, text, lines: Number(value.lines) || 0,
              eof: value.eof !== false, bytes,
            })
            setEditText(text)
            void loadDiff(path)
            if (typeof bytes === 'number' && bytes <= EDIT_LIMIT) {
              void apiGet('/stat', { path: cwd, rel: path }).then((info) => {
                if (alive.current) setEditMtime(typeof info.mtime === 'number' ? info.mtime : null)
              }).catch(() => { if (alive.current) setEditMtime(null) })
            }
          } catch (error) {
            if (!alive.current) return
            setDoc({ status: 'error', path, error: { code: 'exception', message: error instanceof Error ? error.message : String(error) } })
          }
        }, [cwd, readRemote])

        const stateRef = useRef({ path: null })
        stateRef.current.path = selected === null ? null : selected.path

        /**
         * The editor's selected line range, or null when there is no selection
         * (or the editor is not focused). Ctrl+L uses it to reference lines.
         */
        const selectionRange = useCallback(() => {
          const area = editorRef.current
          if (area === null || area === undefined) return null
          if (typeof document !== 'undefined' && document.activeElement !== area) return null
          const start = area.selectionStart
          const end = area.selectionEnd
          if (typeof start !== 'number' || typeof end !== 'number' || start === end) return null
          const value = area.value
          const first = value.slice(0, start).split('\n').length
          let last = value.slice(0, end).split('\n').length
          if (value[end - 1] === '\n') last -= 1
          return { first, last: Math.max(first, last) }
        }, [])

        // Register the reference face so the shortcut can act while this body is mounted.
        useEffect(() => {
          if (tabId === undefined) return undefined
          const face = {
            tabId,
            insert: () => insertReference(sessionId, inputActions, stateRef.current.path, selectionRange()),
          }
          faces.set(tabId, face)
          return () => { if (faces.get(tabId) === face) faces.delete(tabId) }
        }, [tabId, sessionId, inputActions, selectionRange])

        const toggleDir = useCallback((path) => {
          const open = expanded[path] === true
          setExpanded(previous => ({ ...previous, [path]: !open }))
          if (!open && dirs[path] === undefined) void loadDir(path)
        }, [expanded, dirs, loadDir])

        const referencedNow = useCallback(() => {
          const result = insertReference(sessionId, inputActions, stateRef.current.path, selectionRange())
          if (result.ok) setNotice(t('notice.referenced'))
          else if (result.reason === 'no-file') setNotice(t('notice.noReference'))
          else if (result.reason === 'no-input') setNotice(t('notice.noInput'))
          else setNotice(t('notice.failed'))
        }, [sessionId, inputActions, t])

        const reload = useCallback(() => {
          setStatusFiles([])
          void loadRepo(cwd)
          setDirs({})
          void loadDir('')
          setGraph({ status: 'idle' })
          setCommit({ status: 'idle' })
          if (selected !== null) void openFile(selected.path)
        }, [cwd, loadRepo, loadDir, openFile, selected])

        // Opening the Git page reads history once; the tab switch also asks for it.
        useEffect(() => {
          if (mode !== 'graph' || commit.status !== 'idle') return
          if (graph.status === 'idle' && typeof cwd === 'string' && cwd !== '') void loadGraph(cwd)
        }, [mode, commit.status, graph.status, cwd, loadGraph])

        /** Drag the tree's right edge to resize the two areas. */
        const startTreeResize = (event) => {
          event.preventDefault()
          const startX = event.clientX
          const startWidth = treeWidth
          const bodyWidth = bodyRef.current === null ? 0 : bodyRef.current.clientWidth
          const maximum = Math.max(240, Math.round((bodyWidth === 0 ? 900 : bodyWidth) * 0.7))
          const move = (moveEvent) => {
            setTreeWidth(Math.min(maximum, Math.max(140, startWidth + moveEvent.clientX - startX)))
          }
          const stop = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            document.body.style.userSelect = ''
          }
          document.body.style.userSelect = 'none'
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', stop)
        }

        /** Drag the terminal's top edge to resize the command line. */
        const startTermResize = (event) => {
          event.preventDefault()
          const startY = event.clientY
          const startHeight = termHeight
          const panelHeight = panelRef.current === null ? 0 : panelRef.current.clientHeight
          const maximum = Math.max(140, (panelHeight === 0 ? 800 : panelHeight) - 180)
          const move = (moveEvent) => {
            setTermHeight(Math.min(maximum, Math.max(110, startHeight - (moveEvent.clientY - startY))))
          }
          const stop = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            document.body.style.userSelect = ''
          }
          document.body.style.userSelect = 'none'
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', stop)
        }

        const statusMap = useMemo(() => {
          const map = {}
          for (const file of statusFiles) {
            const path = String(file.path).replace(/\\/gu, '/')
            map[path] = file.status
          }
          return map
        }, [statusFiles])

        // Every directory whose subtree holds a change, so collapsed folders
        // still advertise that something inside them changed.
        const changedDirs = useMemo(() => changedDirectories(Object.keys(statusMap)), [statusMap])

        const markOf = useCallback((path) => {
          const status = statusMap[path]
          if (status === undefined) return null
          if (status === '??') return { cls: 'untracked', letter: 'U', label: t('git.untracked') }
          if (status.indexOf('D') !== -1) return { cls: 'deleted', letter: 'D', label: t('git.deleted') }
          if (status[0] === 'A') return { cls: 'added', letter: 'A', label: t('git.added') }
          if (status[0] === 'R') return { cls: 'renamed', letter: 'R', label: t('git.renamed') }
          return { cls: 'modified', letter: 'M', label: t('git.modified') }
        }, [statusMap, t])

        const highlighted = useMemo(
          () => (doc.status === 'ready' ? highlightLines(doc.text || '', languageOf(doc.path)) : []),
          [doc],
        )
        // JSON bodies are reformatted by default; a body that does not parse
        // falls back to its source text with the format control disabled.
        const jsonView = useMemo(() => {
          if (doc.status !== 'ready') return null
          const language = languageOf(doc.path)
          if (language !== 'json' && language !== 'jsonc') return null
          try {
            const parsed = JSON.parse(stripJsonComments(doc.text || ''))
            const pretty = JSON.stringify(parsed, null, 2)
            // A reformatted body can grow far past the source page; keep the
            // raw text rather than mounting tens of thousands of rows.
            if (pretty.length > 600000 || pretty.split('\n').length > 5000) {
              return { ok: true, tooLarge: true, text: null }
            }
            return { ok: true, tooLarge: false, text: pretty }
          } catch (_invalid) {
            return { ok: false, tooLarge: false, text: null }
          }
        }, [doc])
        const jsonTokens = useMemo(
          () => (jsonView === null || jsonView.ok !== true || jsonPretty !== true ? null : highlightLines(jsonView.text, 'json')),
          [jsonView, jsonPretty],
        )
        const graphRows = useMemo(
          () => (graph.status === 'ready' && graph.data && Array.isArray(graph.data.commits) ? buildGraph(graph.data.commits) : []),
          [graph],
        )
        const diffBlocks = useMemo(
          () => (commit.status === 'ready' && commit.data ? parseDiff(commit.data.patch || '') : []),
          [commit],
        )

        function renderTree(dirPath, depth) {
          const node = dirs[dirPath]
          if (node === undefined) return null
          if (node.status === 'loading') {
            return h('div', { key: 'l:' + dirPath, className: 'dcv-treeNote', style: { paddingLeft: 8 + depth * 12 } }, t('tree.loading'))
          }
          if (node.status === 'error') {
            const code = node.error !== undefined && node.error !== null && typeof node.error.code === 'string' ? node.error.code : ''
            const detail = node.error !== undefined && node.error !== null && typeof node.error.message === 'string' ? node.error.message : ''
            return h('div', { key: 'e:' + dirPath, className: 'dcv-treeError', style: { paddingLeft: 8 + depth * 12 } },
              h('div', { className: 'dcv-treeErrorText' }, failureText(t, node.error, 'tree.error')),
              detail === '' ? null : h('div', { className: 'dcv-treeDetail' }, detail),
              code === '' ? null : h('div', { className: 'dcv-treeDetail' }, code),
              h('button', {
                type: 'button', className: 'dcv-retry',
                onClick: () => { void loadDir(dirPath) },
              }, t('action.retry')))
          }
          const entries = node.entries.filter(entry => showIgnored || !IGNORED.has(entry.name))
          if (entries.length === 0) {
            return h('div', { key: 'n:' + dirPath, className: 'dcv-treeNote', style: { paddingLeft: 8 + depth * 12 } }, t('tree.empty'))
          }
          const rows = []
          for (const entry of entries) {
            const full = dirPath === '' ? entry.name : `${dirPath}/${entry.name}`
            if (entry.type === 'directory') {
              const open = expanded[full] === true
              rows.push(h('button', {
                key: 'd:' + full, type: 'button',
                className: 'dcv-row dcv-dir' + (changedDirs.has(full) ? ' is-changed-dir' : ''),
                style: { paddingLeft: 4 + depth * 12 }, title: full,
                onClick: () => toggleDir(full),
              }, h(open ? IconChevronDown : IconChevronRight, { size: 13 }), h(MaterialIcon, { name: entry.name, directory: true, expanded: open, size: 16 }), h('span', { className: 'dcv-name' }, entry.name),
              changedDirs.has(full) ? h('span', { className: 'dcv-dirDot', title: t('git.containsChanges') }, '\u25cf') : null))
              if (open) rows.push(renderTree(full, depth + 1))
            } else {
              const active = selected !== null && selected.path === full
              const mark = markOf(full)
              rows.push(h('button', {
                key: 'f:' + full, type: 'button',
                className: 'dcv-row dcv-file' + (mark === null ? '' : ` is-changed is-${mark.cls}`) + (active ? ' is-active' : ''),
                style: { paddingLeft: 18 + depth * 12 }, title: full,
                onClick: () => { void openFile(full) },
              }, h(MaterialIcon, { name: entry.name, size: 16 }), h('span', { className: 'dcv-name' }, entry.name),
              mark === null ? null : h('span', { className: `dcv-mark dcv-mark-${mark.cls}`, title: mark.label }, mark.letter)))
            }
          }
          return rows
        }

        /** True while the current file can be edited in place. */
        const editable = doc.status === 'ready' && doc.image !== true
          && (typeof doc.bytes !== 'number' || doc.bytes <= EDIT_LIMIT)

        const savingRef = useRef(false)

        /** Fetch this file's changed line numbers against HEAD. */
        const loadDiff = useCallback(async (path) => {
          if (typeof cwd !== 'string' || cwd === '') return
          try {
            const data = await apiGet('/fileDiff', { path: cwd, rel: path })
            if (!alive.current) return
            if (data === null || data === undefined || data.repo === false) {
              setDiffUntracked(false)
              setDiffMarks({})
              return
            }
            if (data.tracked === false) {
              setDiffUntracked(true)
              setDiffMarks({})
              return
            }
            const marks = {}
            for (const hunk of Array.isArray(data.hunks) ? data.hunks : []) {
              for (let offset = 0; offset < hunk.count; offset += 1) marks[hunk.start + offset] = hunk.kind
            }
            setDiffUntracked(false)
            setDiffMarks(marks)
          } catch (_noDiff) {
            if (alive.current) { setDiffMarks({}); setDiffUntracked(false) }
          }
        }, [cwd])

        /** Save the buffer; `force` skips the mtime check after a 409. */
        const saveFile = useCallback(async (force) => {
          if (selected === null || doc.status !== 'ready' || doc.image === true) return
          if (savingRef.current) return
          if (force !== true && editMtime !== null && editText === doc.text) return
          savingRef.current = true
          setSaveState('saving')
          setSaveMessage(null)
          try {
            const payload = { rel: selected.path, text: editText }
            if (force !== true && editMtime !== null) payload.baseMtime = editMtime
            const saved = await apiPost('/write', payload, { path: cwd })
            if (!alive.current) return
            setEditMtime(typeof saved.mtime === 'number' ? saved.mtime : null)
            setDoc({ ...doc, text: editText, bytes: typeof saved.bytes === 'number' ? saved.bytes : doc.bytes })
            setSaveState('saved')
            void loadDiff(selected.path)
          } catch (error) {
            if (!alive.current) return
            if (error !== null && error !== undefined && error.status === 409) {
              setSaveState('conflict')
              setSaveMessage(t('edit.conflict'))
            } else {
              setSaveState('error')
              setSaveMessage(error instanceof Error ? error.message : String(error))
            }
          } finally {
            savingRef.current = false
          }
        }, [cwd, doc, editMtime, editText, selected, t])

        const saveFileRef = useRef(saveFile)
        saveFileRef.current = saveFile

        // Autosave: debounce edits, never overwrite a conflict.
        useEffect(() => {
          if (!dirtyRef.current || !editable || saveState === 'conflict') return undefined
          const handle = setTimeout(() => {
            if (dirtyRef.current) void saveFileRef.current(false)
          }, 800)
          return () => { clearTimeout(handle) }
        }, [editText, editable, saveState, doc.text])

        // Best-effort flush when the panel closes or the tab unmounts.
        const liveRef = useRef({ dirty: false, rel: null, text: '', mtime: null, cwd })
        liveRef.current = {
          dirty: dirtyRef.current,
          rel: selected === null ? null : selected.path,
          text: editText,
          mtime: editMtime,
          cwd,
        }
        useEffect(() => () => {
          const live = liveRef.current
          if (!live.dirty || live.rel === null) return
          try {
            void fetch(`${API}/write?path=${encodeURIComponent(live.cwd)}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ rel: live.rel, text: live.text, baseMtime: live.mtime === null ? undefined : live.mtime }),
              credentials: 'same-origin',
              keepalive: true,
            })
          } catch (_noFlush) { /* nothing else to do while unmounting */ }
        }, [])

        /**
         * The in-place editor: a gutter, a syntax-highlighted backdrop and a
         * transparent textarea on top, so typing shows coloured code like the
         * shipped editor. Saves happen automatically after a pause.
         */
        function renderEditor() {
          const dirty = dirtyRef.current
          const language = languageOf(doc.path)
          const markdown = language === 'md'
          const jsonFile = language === 'json' || language === 'jsonc'
          const lineCount = editText === '' ? 1 : editText.split('\n').length
          const numbers = []
          for (let index = 1; index <= lineCount; index += 1) numbers.push(String(index))
          const highlightedEdit = editText.length > 200000 ? null : highlightLines(editText, language)
          const status = saveState === 'saving'
            ? t('edit.saving')
            : (dirty ? t('edit.unsaved') : t('edit.saved'))
          const overlay = highlightedEdit === null
            ? null
            : h('pre', { className: 'dcv-editHighlight', ref: highlightRef, 'aria-hidden': true },
              highlightedEdit.map((tokens, index) => h('div', { className: 'dcv-line', key: index }, tokens.length === 0
                ? '\u200b'
                : tokens.map((token, tokenIndex) => h('span', { key: tokenIndex, className: `dcv-tok-${token.type}` }, token.text)))))
          return h('div', { key: 'editor', className: 'dcv-doc dcv-editorDoc' },
            h('div', { className: 'dcv-docHead' },
              h(MaterialIcon, { name: baseName(selected.path), size: 15 }),
              h('span', { className: 'dcv-path', title: selected.path }, selected.path),
              h('span', { className: 'dcv-meta' },
                t('doc.lines', { count: lineCount })
                + (doc.bytes === undefined ? '' : ` · ${formatBytes(doc.bytes)}`)
                + ` · ${(dirty || saveState === 'saving' ? '● ' : '')}${status}`),
              h('span', { className: 'dcv-docActions' },
                markdown
                  ? h('button', {
                    type: 'button', className: 'dcv-tab',
                    onClick: () => { setPreview(true) },
                  }, t('edit.preview'))
                  : null,
                h('button', {
                  type: 'button', className: 'dcv-tab',
                  title: `${t('edit.save')} (Ctrl+S)`,
                  disabled: saveState === 'saving' || (!dirty && saveState !== 'error' && saveState !== 'conflict'),
                  onClick: () => { void saveFile(false) },
                }, t('edit.save')))),
            saveState === 'error' || saveState === 'conflict'
              ? h('div', { className: 'dcv-banner dcv-saveError' },
                h('span', null, saveState === 'conflict' ? t('edit.conflict') : (saveMessage === null ? t('edit.failed') : saveMessage)),
                saveState === 'conflict'
                  ? h('button', {
                    type: 'button', className: 'dcv-tab',
                    onClick: () => { void saveFile(true) },
                  }, t('edit.overwrite'))
                  : null,
                h('button', {
                  type: 'button', className: 'dcv-tab',
                  onClick: () => { void openFile(selected.path) },
                }, t('edit.reload')))
              : null,
            h('div', { className: 'dcv-editor' },
              h('div', { className: 'dcv-editorGutter', ref: gutterRef, 'aria-hidden': true },
                numbers.map((number) => {
                  const kind = diffUntracked ? 'added' : diffMarks[Number(number)]
                  return h('div', { className: 'dcv-gutterLine', key: number },
                    h('span', { className: 'dcv-gutterDot' + (kind === undefined ? '' : ` is-${kind}`) }),
                    h('span', { className: 'dcv-gutterNo' }, number))
                })),
              h('div', { className: 'dcv-editorStack' },
                overlay,
                h('textarea', {
                  ref: editorRef,
                  className: 'dcv-editorArea' + (overlay === null ? '' : ' is-overlay'),
                  value: editText,
                  spellCheck: false,
                  autoComplete: 'off',
                  'aria-label': selected.path,
                  onChange: (event) => { setEditText(event.target.value) },
                  onScroll: (event) => {
                    if (gutterRef.current !== null) gutterRef.current.scrollTop = event.target.scrollTop
                    if (highlightRef.current !== null) {
                      highlightRef.current.scrollTop = event.target.scrollTop
                      highlightRef.current.scrollLeft = event.target.scrollLeft
                    }
                  },
                  onKeyDown: (event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                      event.preventDefault()
                      void saveFile(false)
                      return
                    }
                    if (event.key === 'Tab') {
                      event.preventDefault()
                      const node = event.target
                      const start = node.selectionStart
                      const end = node.selectionEnd
                      setEditText(editText.slice(0, start) + '  ' + editText.slice(end))
                      requestAnimationFrame(() => {
                        node.selectionStart = start + 2
                        node.selectionEnd = start + 2
                      })
                      return
                    }
                    if (event.key === 'Enter') {
                      const node = event.target
                      const start = node.selectionStart
                      const end = node.selectionEnd
                      const before = editText.slice(0, start)
                      const after = editText.slice(end)
                      const lineStart = before.lastIndexOf('\n') + 1
                      const current = before.slice(lineStart)
                      const indent = (current.match(/^[ \t]*/u) || [''])[0]
                      const previous = before.replace(/\s+$/u, '').slice(-1)
                      const next = after.replace(/^\s*/u, '').slice(0, 1)
                      const extra = (previous === '{' || previous === '(' || previous === '[') && next !== '}' && next !== ')' && next !== ']'
                        ? '  '
                        : ''
                      event.preventDefault()
                      const insert = `\n${indent}${extra}`
                      setEditText(before + insert + after)
                      const caret = start + insert.length
                      requestAnimationFrame(() => {
                        node.selectionStart = caret
                        node.selectionEnd = caret
                      })
                    }
                  },
                }))))
        }

        function renderDocPane() {
          if (selected === null) {
            return h('div', { key: 'empty', className: 'dcv-empty' },
              h(MaterialIcon, { glyph: 'file', size: 30 }),
              h('p', null, t('empty.pickFile')),
              h('p', { className: 'dcv-hint' }, t('empty.hint', { keys: shortcutHint() })))
          }
          if (doc.status === 'loading' || doc.status === 'idle') {
            return h('div', { key: 'loading', className: 'dcv-empty' }, h('p', null, t('doc.loading')))
          }
          if (doc.status === 'error') {
            const detail = doc.error !== undefined && doc.error !== null && typeof doc.error.message === 'string' ? doc.error.message : ''
            return h('div', { key: 'error', className: 'dcv-empty dcv-error' },
              h(MaterialIcon, { glyph: 'file', size: 30 }),
              h('p', null, t('doc.error')),
              h('p', { className: 'dcv-hint' }, failureText(t, doc.error)),
              detail === '' ? null : h('p', { className: 'dcv-hint' }, detail),
              h('button', {
                type: 'button', className: 'dcv-retry',
                onClick: () => { if (selected !== null) void openFile(selected.path) },
              }, t('action.retry')))
          }
          if (doc.image === true) {
            const url = imageUrlOf(cwd, doc.path)
            return h('div', { key: 'image', className: 'dcv-doc' },
              h('div', { className: 'dcv-docHead' },
                h(MaterialIcon, { name: baseName(doc.path), size: 15 }),
                h('span', { className: 'dcv-path', title: doc.path }, doc.path),
                imageInfo === null
                  ? null
                  : h('span', { className: 'dcv-docMeta' }, `${imageInfo.width} × ${imageInfo.height}`),
                h('span', { className: 'dcv-modes' },
                  h('button', {
                    type: 'button',
                    className: 'dcv-tab' + (imageFit ? ' is-on' : ''),
                    title: t('image.fit'),
                    onClick: () => { setImageFit(true) },
                  }, t('image.fit')),
                  h('button', {
                    type: 'button',
                    className: 'dcv-tab' + (imageFit ? '' : ' is-on'),
                    title: t('image.actual'),
                    onClick: () => { setImageFit(false) },
                  }, t('image.actual')),
                  h('button', {
                    type: 'button',
                    className: 'dcv-tab',
                    title: t('image.open'),
                    onClick: () => { window.open(url, '_blank', 'noopener,noreferrer') },
                  }, t('image.open')))),
              h('div', { className: 'dcv-imageWrap' + (imageFit ? ' is-fit' : '') },
                h('img', {
                  className: 'dcv-image',
                  src: url,
                  alt: doc.path,
                  onLoad: (event) => {
                    const node = event.target
                    setImageInfo({ width: node.naturalWidth, height: node.naturalHeight })
                  },
                  onError: () => { setImageInfo(null) },
                })))
          }
          if (editable && !(languageOf(doc.path) === 'md' && preview === true)) return renderEditor()
          const language = languageOf(doc.path)
          const markdown = language === 'md'
          const jsonFile = language === 'json' || language === 'jsonc'
          const shown = jsonTokens === null ? highlighted : jsonTokens
          const lines = shown.map((tokens, index) => h('div', { className: 'dcv-line', key: index },
            h('span', { className: 'dcv-ln', 'aria-hidden': true }, String(index + 1)),
            h('span', { className: 'dcv-src' }, tokens.length === 0
              ? '\u200b'
              : tokens.map((token, tokenIndex) => h('span', { key: tokenIndex, className: `dcv-tok-${token.type}` }, token.text)))))
          const rendered = markdown
          return h('div', { key: 'doc', className: 'dcv-doc' },
            h('div', { className: 'dcv-docHead' },
              h(MaterialIcon, { name: baseName(selected.path), size: 15 }),
              h('span', { className: 'dcv-path', title: selected.path }, selected.path),
              h('span', { className: 'dcv-meta' }, t('doc.lines', { count: rendered ? doc.lines : shown.length })
                + (doc.bytes === undefined ? '' : ` · ${formatBytes(doc.bytes)}`)),
              h('span', { className: 'dcv-docActions' },
                preview
                  ? h('button', {
                    type: 'button', className: 'dcv-tab',
                    onClick: () => { setPreview(false) },
                  }, t('edit.edit'))
                  : null,
                jsonFile ? h('span', { className: 'dcv-modes' },
                h('button', {
                  type: 'button',
                  className: 'dcv-tab' + (jsonTokens !== null ? ' is-on' : ''),
                  disabled: jsonView === null || jsonView.ok !== true || jsonView.tooLarge === true,
                  title: jsonView === null || jsonView.ok !== true
                    ? t('json.invalid')
                    : (jsonView.tooLarge === true ? t('json.tooLarge') : undefined),
                  onClick: () => { setJsonPretty(true) },
                }, t('json.pretty')),
                h('button', {
                  type: 'button',
                  className: 'dcv-tab' + (jsonTokens === null ? ' is-on' : ''),
                  onClick: () => { setJsonPretty(false) },
                }, t('json.raw'))) : null)),
            doc.eof === false ? h('div', { className: 'dcv-banner' }, t('doc.truncated', { count: doc.lines })) : null,
            rendered
              ? h('div', { className: 'dcv-mdScroll' }, h(MarkdownView, { key: 'md', text: doc.text }))
              : h('div', { className: 'dcv-code' }, lines))
        }

        function renderCommitView() {
          const data = commit.data
          const files = data !== undefined && Array.isArray(data.files) ? data.files : []
          const active = files.length === 0
            ? null
            : (commitFile !== null && files.some(file => file.path === commitFile) ? commitFile : files[0].path)
          const block = active === null ? null : (diffBlocks.find(entry => entry.path === active) || null)
          const rows = block === null ? [] : splitFileRows(block)
          const body = rows.map((row, index) => {
            if (row.kind === 'hunk') {
              return h('tr', { key: 'h:' + index, className: 'dcv-splitHunk' },
                h('td', { colSpan: 4 }, row.text))
            }
            return h('tr', { key: 'r:' + index, className: 'dcv-splitRow' },
              h('td', { className: 'dcv-splitNo' }, row.oldNo === null ? '' : String(row.oldNo)),
              h('td', { className: 'dcv-splitCode' + (row.kind === 'change' && row.oldText !== '' ? ' dcv-splitDel' : '') },
                row.oldText === '' ? '\u200b' : row.oldText),
              h('td', { className: 'dcv-splitNo' }, row.newNo === null ? '' : String(row.newNo)),
              h('td', { className: 'dcv-splitCode' + (row.kind === 'change' && row.newText !== '' ? ' dcv-splitAdd' : '') },
                row.newText === '' ? '\u200b' : row.newText))
          })
          return h('div', { key: 'commit', className: 'dcv-commitView' },
            h('div', { className: 'dcv-commitMeta' },
              h('div', { className: 'dcv-commitSubject' }, data === undefined ? '' : data.subject),
              h('div', { className: 'dcv-commitSub' },
                `${data === undefined ? commit.hash : data.hash.slice(0, 10)} · `,
                `${data === undefined ? '' : data.author} · ${data === undefined ? '' : formatDate(data.date)}`,
                data !== undefined && data.parents.length > 1 ? ` · ${t('commit.parent', { count: data.parents.length })}` : '')),
            h('div', { className: 'dcv-files' },
              files.length === 0
                ? h('div', { className: 'dcv-treeNote' }, t('commit.noFiles'))
                : files.map(file => h('button', {
                  key: file.path,
                  type: 'button',
                  className: 'dcv-fileRow' + (file.path === active ? ' is-active' : ''),
                  title: file.path,
                  'aria-pressed': file.path === active,
                  onClick: () => { setCommitFile(file.path) },
                },
                h(MaterialIcon, { name: baseName(file.path), size: 14 }),
                h('span', { className: 'dcv-fileName' }, file.path),
                h('span', { className: 'dcv-add' }, file.additions === null ? '±' : `+${file.additions}`),
                h('span', { className: 'dcv-del' }, file.deletions === null ? '' : `-${file.deletions}`)))),
            data !== undefined && data.truncated === true ? h('div', { className: 'dcv-banner' }, t('commit.truncated')) : null,
            h('div', { className: 'dcv-splitScroll' },
              rows.length === 0
                ? h('div', { className: 'dcv-treeNote' }, active === null ? t('commit.selectFile') : t('commit.noText'))
                : h('table', { className: 'dcv-splitTable' },
                  h('thead', null, h('tr', null,
                    h('th', { className: 'dcv-splitNo' }, ''),
                    h('th', null, t('commit.before')),
                    h('th', { className: 'dcv-splitNo' }, ''),
                    h('th', null, t('commit.after')))),
                  h('tbody', null, body))))
        }

        function renderGraphPane() {
          if (commit.status !== 'idle') return null
          if (graph.status === 'loading' || graph.status === 'idle') return h('div', { key: 'g-loading', className: 'dcv-empty' }, h('p', null, t('git.loading')))
          if (graph.status === 'error') {
            const message = String(graph.error || '')
            const missing = /not a git repository/iu.test(message)
            return h('div', { key: 'g-error', className: 'dcv-empty dcv-error' },
              h('p', null, missing ? t('git.noRepo') : t('git.error')),
              missing ? null : h('p', { className: 'dcv-hint' }, message))
          }
          if (graph.status === 'noWorkspace') return h('div', { key: 'g-none', className: 'dcv-empty' }, h('p', null, t('tree.empty')))
          const data = graph.data || {}
          const commits = Array.isArray(data.commits) ? data.commits : []
          if (commits.length === 0) {
            return h('div', { key: 'g-empty', className: 'dcv-empty' }, h(MaterialIcon, { glyph: 'git', size: 26 }), h('p', null, t('git.empty')))
          }
          const maxLanes = graphRows.reduce((max, row) => Math.max(max, row.laneCount), 0)
          const rows = graphRows.map(row => {
            const refs = (row.commit.refs || []).map(ref => {
              const isHead = ref.indexOf('HEAD') === 0
              const text = ref.replace(/^HEAD -> /u, '').replace(/^tag: /u, '')
              return h('span', { key: ref, className: 'dcv-ref' + (isHead ? ' dcv-ref-head' : '') }, text)
            })
            return h('button', {
              key: row.commit.hash, type: 'button', className: 'dcv-commit',
              title: `${row.commit.hash}\n${row.commit.subject}`,
              onClick: () => { void loadCommit(cwd, row.commit.hash) },
            },
            h(LaneArt, {
              lane: row.lane, laneCount: maxLanes, parentLanes: row.parentLanes,
              newTip: row.newTip, beforeActive: row.beforeActive,
            }),
            h('span', { className: 'dcv-commitBody' },
              h('span', { className: 'dcv-subject' }, refs, row.commit.subject),
              h('span', { className: 'dcv-byline' }, `${row.commit.author} · ${formatDate(row.commit.date)} · ${row.commit.hash.slice(0, 7)}`)))
          })
          return h('div', { key: 'graph', className: 'dcv-git' },
            h('div', { className: 'dcv-gitHead' },
              h(MaterialIcon, { glyph: 'git', size: 14 }),
              h('span', { className: 'dcv-name' }, data.detached ? t('git.detached') : (data.branch || t('git.detached'))),
              h('span', { className: 'dcv-meta' }, t('git.commits', { count: commits.length }))),
            h('div', { className: 'dcv-gitList' }, rows))
        }

        function renderGitPane() {
          if (commit.status === 'idle') return renderGraphPane()
          const header = h('div', { className: 'dcv-gitHead' },
            h('button', {
              type: 'button', className: 'dcv-tool dcv-mini', title: t('commit.back'),
              onClick: () => { setCommit({ status: 'idle' }) },
            }, h(IconBack, { size: 14 }), h('span', null, t('commit.back'))))
          if (commit.status === 'loading') {
            return h('div', { key: 'git', className: 'dcv-git' }, header,
              h('div', { key: 'c-loading', className: 'dcv-empty' }, h('p', null, t('git.loading'))))
          }
          if (commit.status === 'error') {
            return h('div', { key: 'git', className: 'dcv-git' }, header,
              h('div', { key: 'c-error', className: 'dcv-empty dcv-error' },
                h('p', null, t('git.error')),
                h('p', { className: 'dcv-hint' }, String(commit.error || ''))))
          }
          return h('div', { key: 'git', className: 'dcv-git' }, header, renderCommitView())
        }

        const branchText = repo.status === 'ready'
          ? (repo.data.detached
            ? (repo.data.head === null ? t('git.empty') : t('git.detached'))
            : (repo.data.branch || t('git.detached')))
          : null

        return h('div', { className: 'dcv-root', 'data-code-viewer': '', ref: panelRef },
          h('style', { key: 'style', 'data-plugin': ID }, CSS),
          h('div', { className: 'dcv-header' },
            h('span', { className: 'dcv-headTitle' },
              h(IconCodeIDE, { size: 15 }),
              h('span', { className: 'dcv-title' }, t('panel.title')),
              branchText === null ? null : h('span', { className: 'dcv-chip', title: t('git.branch') }, h(MaterialIcon, { glyph: 'git', size: 12 }), branchText)),
            h('span', { className: 'dcv-headActions' },
              h('button', {
                type: 'button', className: 'dcv-tab' + (mode === 'files' ? ' is-on' : ''),
                onClick: () => { setMode('files') },
              }, t('tab.files')),
              h('button', {
                type: 'button', className: 'dcv-tab' + (mode === 'graph' ? ' is-on' : ''),
                onClick: () => {
                  setMode('graph')
                  setCommit({ status: 'idle' })
                  // The page effect loads an idle graph; a failed one is retried here.
                  if (graph.status === 'error') void loadGraph(cwd)
                },
              }, t('tab.graph')),
              h('button', {
                type: 'button',
                className: 'dcv-tool dcv-mini' + (termOpen ? ' is-on' : ''),
                title: t('term.toggle'),
                'aria-pressed': termOpen,
                onClick: () => { setTermOpen(value => !value) },
              }, h(IconTerminal, { size: 14 })),
              selected === null ? null : h('button', {
                type: 'button', className: 'dcv-tool', title: `${t('action.reference')} (${shortcutHint()})`,
                disabled: inputActions === undefined, onClick: referencedNow,
              }, h(IconLink, { size: 13 }), h('span', null, t('action.referenceShort'))),
              h('button', { type: 'button', className: 'dcv-tool dcv-mini', title: t('action.reload'), onClick: reload },
                h(IconRefresh, { size: 14 })))),
          h('div', { className: 'dcv-body', ref: bodyRef },
            h('div', { className: 'dcv-tree', style: { flex: `0 0 ${treeWidth}px` } },
              h('div', { className: 'dcv-paneHead' },
                h('span', { className: 'dcv-paneTitle', title: cwd || '' }, baseName(cwd || '') || t('tree.workspace')),
                changedDirs.size > 0 ? h('span', { className: 'dcv-dirDot', title: t('git.containsChanges') }, '\u25cf') : null,
                h('button', {
                  type: 'button', className: 'dcv-tool dcv-mini', title: t('action.reloadTree'),
                  onClick: () => { setDirs({}); void loadDir('') },
                }, h(IconRefresh, { size: 13 })),
                h('button', {
                  type: 'button', className: 'dcv-tool dcv-mini' + (showIgnored ? ' is-on' : ''),
                  title: showIgnored ? t('tree.hideIgnored') : t('tree.showIgnored'),
                  'aria-pressed': showIgnored,
                  onClick: () => { setShowIgnored(value => !value) },
                }, h(IconFilter, { size: 13 }))),
              h('div', { className: 'dcv-treeScroll' },
                typeof cwd !== 'string' || cwd === ''
                  ? h('div', { className: 'dcv-treeNote' }, t('tree.workspace'))
                  : renderTree('', 0))),
            h('div', {
              key: 'v-resizer',
              className: 'dcv-resizer dcv-resizer-v',
              role: 'separator',
              'aria-orientation': 'vertical',
              title: t('tree.resize'),
              onPointerDown: startTreeResize,
            }),
            h('div', { className: 'dcv-main' }, mode === 'files' ? renderDocPane() : renderGitPane())),
          termOpen ? h('div', { className: 'dcv-termWrap', style: { height: `${termHeight}px` } },
            h('div', {
              key: 'h-resizer',
              className: 'dcv-resizer dcv-resizer-h',
              role: 'separator',
              'aria-orientation': 'horizontal',
              title: t('term.resize'),
              onPointerDown: startTermResize,
            }),
            h(TerminalDock, { key: 'terminal', sessionId, t, onClose: () => { setTermOpen(false) } })) : null,
          notice === null ? null : h('div', { className: 'dcv-notice' }, notice))
      }

      return CodePanel
    }

    /* ------------------------------------------------------------------ apply */

    let ctx = null

    /** Register the tab type, its body, its copy, and the open-or-reference shortcut. */
    function apply(pluginCtx) {
      ctx = pluginCtx
      const faces = new Map()
      const CodePanel = createPanel(pluginCtx, faces)

      pluginCtx.effect(() => pluginCtx.locale.register(NS, 'en', EN), 'code-viewer: English dictionary')
      pluginCtx.effect(() => pluginCtx.locale.register(NS, 'zh', ZH), 'code-viewer: Chinese dictionary')

      const t = pluginCtx.locale.bind(NS)

      // Stage one: what the tab type is.
      pluginCtx.effect(() => pluginCtx.sidebarRightTabs.register({
        id: ID,
        kind: KIND,
        priority: 'extension',
        keepMounted: true,
        title: () => t('type.label'),
        guide: [{
          id: 'code-viewer',
          order: 15,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: IconCodeIDE,
        }],
      }), 'code-viewer: tab type')

      // Stage two: the body, keyed by the definition id.
      pluginCtx.effect(() => pluginCtx.slots.inject('sidebar.right.pane.tab', () => pluginCtx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ID,
        locale: NS,
      }, CodePanel)), 'code-viewer: tab body')

      /** Open the panel, or reference its current file when it is already open. */
      const runCodeCommand = (element) => {
        const target = pluginCtx.sidebarRight.commandTarget(element)
        if (target === undefined) return false
        const open = pluginCtx.sidebarRight.openTabs.getSnapshot()
          .filter(entry => entry.sessionId === target.sessionId && entry.kind === KIND)
        const held = open.length === 0
          ? undefined
          : open.find(entry => entry.tabId === target.tabId) || open[open.length - 1]
        if (held === undefined) {
          pluginCtx.sidebarRight.openTabFromTarget(KIND, target)
          return true
        }
        const face = faces.get(held.tabId)
        if (face === undefined) {
          if (!pluginCtx.sidebarRight.isExpanded()) pluginCtx.sidebarRight.toggleExpanded()
          pluginCtx.sidebarRight.focus(held.tabId)
          return true
        }
        face.insert()
        return true
      }

      // Both gestures belong to this panel, on every profile: the editable
      // catalog cannot carry `primary+L` on Web (browsers own it) nor any
      // binding on Web/Linux (three combinations only), so the action is a
      // fixed one and the handler consumes the key only when it acts.
      const primaryLabel = pluginCtx.shortcuts.platform === 'macos' ? 'Cmd' : 'Ctrl'
      const fixedKeys = [`${primaryLabel}+L`, `${primaryLabel}+Shift+L`]
      const fixedBindings = [
        { code: 'KeyL', modifiers: ['primary'] },
        { code: 'KeyL', modifiers: ['primary', 'shift'] },
      ]
      if (typeof pluginCtx.shortcuts.registerFixed === 'function'
        && typeof pluginCtx.shortcuts.observeFixedInput === 'function') {
        pluginCtx.effect(() => pluginCtx.shortcuts.registerFixed({
          id: 'code.view',
          label: () => t('command.open'),
          keys: fixedKeys,
          bindings: fixedBindings,
          group: 'application',
        }), 'code-viewer: reserved keys')
        pluginCtx.effect(() => pluginCtx.shortcuts.observeFixedInput((input) => {
          if (input.type !== 'keydown') return
          const gesture = input.gesture
          if (gesture.composing || gesture.defaultPrevented || gesture.repeat) return
          if (gesture.code !== 'KeyL' || gesture.alt) return
          if (!(gesture.control || gesture.meta)) return
          const modal = input.context.modal
          if (modal !== null && modal !== undefined) return
          if (runCodeCommand(input.context.target)) input.consume()
        }), 'code-viewer: reserved keys handler')
      } else {
        // Older shells without fixed actions: an editable command still covers
        // the profiles the catalog admits.
        pluginCtx.effect(() => pluginCtx.shortcuts.register({
          id: 'code.view',
          label: () => t('command.open'),
          aliases: ['code', 'codeide', 'code toolbox', 'code viewer', 'vscode', 'git graph', '代码工具箱', '代码查看器', '代码'],
          defaults: {
            'desktop:macos': { code: 'KeyL', modifiers: ['primary'] },
            'desktop:windows': { code: 'KeyL', modifiers: ['primary'] },
            'desktop:linux': { code: 'KeyL', modifiers: ['primary'] },
            'web:macos': { code: 'KeyL', modifiers: ['primary', 'shift'] },
            'web:windows': { code: 'KeyL', modifiers: ['primary', 'shift'] },
          },
          regions: ['page', 'editable', 'terminal'], modals: [],
          resolve: ({ target: element }) => {
            if (pluginCtx.sidebarRight.commandTarget(element) === undefined) {
              return { status: 'blocked', reason: t('command.blocked') }
            }
            return { status: 'handled', run: () => { runCodeCommand(element) } }
          },
        }), 'code-viewer: shortcut')
      }
    }

    return { inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'shortcuts', 'sessions', 'remote', 'remote.workspaceFiles'], apply }
  },
})
