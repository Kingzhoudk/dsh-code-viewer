![CodeIDE icon](icon.svg)

# CodeIDE · VS Code 风格的右侧栏面板

为 DeepSeek Harness Web GUI 增加一个右侧栏标签页（kind = `code`），形状与 VS Code 一致：

```
┌──────────────────────────────────────────────────────┐
│ 代码  ·  main            [文件] [Git 图谱] [引用] [↻] │
├───────────────┬──────────────────────────────────────┤
│ 工作区文件树   │ 文件内容（行号 + 语法着色）            │
│ 懒加载目录     │ 或 Git 泳道图 / 单次提交 diff          │
└───────────────┴──────────────────────────────────────┘
```

它是**带编辑能力的查看器**：可以保存文本文件（带 mtime 冲突检测），但**不改 Git 状态**——不做暂存、提交、checkout、分支操作。

## 能力

- **左侧文件树**：按工作区根目录懒加载（`remote.workspaceFiles.list`），默认隐藏 `.git`、`node_modules`、`dist` 等目录，可用标题栏的漏斗按钮显示；已修改/新增/删除/未跟踪文件带 `M`/`A`/`D`/`U` 角标。
- **右侧文件内容**：`remote.workspaceFiles.read` 按行分页读取（一次最多 3,000 行，超出提示截断），带行号、横向滚动与轻量语法着色；标题前显示该文件的 Material 图标。
- **语言渲染细化**：
  - **Python**：三引号字符串（docstring）跨行着色、装饰器 `@name`、`f"…"`/`rb'…'` 前缀字符串、`self`/`cls`/内置函数与异常名单独着色；
  - **C++**：独立关键字表（`namespace`/`template`/`concept`/`constexpr`/`override`/`auto` 等）、`#include`/`#define` 等预处理行整行着色、`std`/`string`/`vector`/`size_t` 等标准名着色；`.h` 按 C++ 处理；
  - **JSON**：属性名与字符串值区分着色，数字与 `true/false/null` 单独着色；默认按 2 空格**格式化**显示，标题栏可切「格式化 / 原始」；解析失败、或格式化后超过 600 KB / 5000 行时自动保留原始文本；`.jsonc` 支持注释后再格式化；
  - **Markdown**：默认**渲染**（标题层级、粗体/斜体/删除线、行内代码、列表、引用、分隔线、链接、代码块——代码块里的 Python/C++/JSON 等继续按语言着色），标题栏可在「渲染 / 源码」之间切换；
  - **其余常用语言**：C、C++、C#、Java、Kotlin、Scala、Go、Rust、Swift、Dart、PHP、Perl、Lua、R、Julia、Haskell、Elixir、Erlang、Clojure、Elm、F#、OCaml、Nim、Zig、Solidity、Groovy、HCL/Terraform、Nix、PowerShell、Batch、Assembly、Vim script、TeX、Protobuf、GraphQL、CMake、Makefile、Dockerfile、Diff/Patch、HTML/XML/Vue/Svelte（标记语法单独扫描：标签、属性、注释、字符串）。
  - 语言识别按扩展名与特殊文件名（`Dockerfile`、`Makefile`、`CMakeLists.txt` 等），`.h` 按 C++、`.mm/.m` 按 C 处理。
- **Git 图谱**（只读）：全部分支的提交泳道图、分支/标签装饰、作者与时间；点任一提交进入该提交的**可点击改动文件列表**，下方按 `修改前 / 修改后` 分栏对比选中文件（默认选中第一个文件，点击其他文件即切换），可返回图谱。
- **命令行分栏**（默认打开，可收起）：面板底部内嵌一个命令行，使用 Harness 自带的 terminal 服务（`ctx.webTerminals`）驱动**真实 shell**（与自带终端标签是同一个 PTY 栈）。优先使用内置的 **xterm.js**（`vendor/xterm.mjs`，MIT，见 `vendor/LICENSE-xterm`）渲染，键盘输入、选中复制、滚回都与自带终端一致；环境缺少 `ResizeObserver`/`matchMedia` 或资产加载失败时自动退回文本渲染（去 ANSI、支持命令历史 ↑/↓ 的简易终端）。收起分栏只断开视图，shell 进程保留，重新展开即恢复；标题栏的终端按钮可随时收起/打开，分栏头部的「在自带终端标签中打开」会打开 Harness 自带的终端标签。
- **可拖拽布局**：文件树与内容之间、内容与命令行之间各有一条分隔条，可左右/上下拖拽调整大小（树 140px 起、命令行 110px 起，按面板尺寸自动限幅）。
- **一键引用**（同一个键两种行为，`Ctrl+L` 与 `Ctrl+Shift+L` **都绑定**此功能）：
  - 面板未打开：打开该标签页并聚焦；
  - 面板已打开：把当前正在看的文件以 `@文件` 原子引用插入对话框光标处；**编辑器里有框选时**，草稿文本带行号区间（`@文件:12` 或 `@文件:12-20`），芯片本身仍指向文件（若内部引用通道不可用，则退化为插入 `@路径` 纯文本），**并把键盘焦点交还输入框**（`SessionInput.focus()`，光标停在刚插入的引用之后，可以直接继续打字）。
  - 两个键通过 Harness 的**固定键动作**注册，因此不受 Web 快捷键准入限制（Web/Linux 只允许 `Ctrl+/` 等三种组合）；面板空态与「引用」按钮的提示会显示当前真正生效的按键。
  - 注意：浏览器把 `Ctrl+L` 当作地址栏快捷键，网页收不到该按键，所以 Web 端实际可用的是 `Ctrl+Shift+L`；桌面客户端两个键都可用。
- **中文/英文**文案，浅色/深色主题，全部使用 `--dsw-*` 主题变量。

## 图标

文件树与文档标题的图标使用 **Material Icon Theme**（MIT，Copyright (c) 2025 Material Extensions，
https://github.com/material-extensions/vscode-material-icon-theme）的官方素材子集，按扩展名/文件名/文件夹名映射，
以内联 data URL 渲染（不联网、不依赖 host 额外路由）。完整许可文本见 [`LICENSE-material-icon-theme`](LICENSE-material-icon-theme)；重新生成用 [`scripts/gen-icons.mjs`](scripts/gen-icons.mjs)。

- 文件：94 个扩展名 + 36 个特殊文件名（`package.json`、`Dockerfile`、`README.md`、`LICENSE` 等）；
- 文件夹：21 个常见目录名各有闭合/展开两套图标（`src`、`node_modules`、`.git`、`dist`、`test`、`docs` 等），其余用通用 folder；
- 浅色/深色：Material 的两套浅色变体（`toml`、`pnpm`）会跟随页面主题自动切换，主题切换时图标即时重绘。

## 组成

| 半边 | 文件 | 职责 |
|---|---|---|
| Host | `index.js` | `/plugins/code-viewer` 路由：`/repo`、`/log`、`/commit`、`/status`、`/stat`、`POST /write`、`/file`（图片）、`/asset`（xterm） |
| Client | `client.js` | 右侧栏 tab 类型 + 面板 UI + 快捷键 + 引用桥接 |

读取文件内容走 Harness 自带、按会话授权的 `remote.workspaceFiles`；仓库历史、图片、xterm 资产和保存走 `index.js` 的路由。保存接口有独立的路径校验与大小上限。

## 安全边界

- Git 只读：只有 `rev-parse`、`log`、`show`、`diff`、`status` 这类查询命令，参数由插件固定，调用方只能给目录、提交 hash 与条数。
- 保存：`POST /write` 只写**已存在的普通文本文件**；路径必须解析在工作区内（含软链 realpath 校验）、拒绝 `.git/` 内部；body 上限 8 MiB；带 `baseMtime` 时与磁盘 mtime 不一致返回 409，不会静默覆盖。不新建、不删除文件。
- 提交 hash 用 `^[0-9a-f]{4,40}$` 校验，避免参数注入；目录必须存在且为绝对路径。
- Git 子进程禁用交互提示、hooks、可选索引写入与惰性拉取，单命令 8 秒超时、8 MiB 输出上限、`LC_ALL=C`。
- 路由沿用页面自己的浏览器会话 Cookie 校验（`connection.authorizeIndex`）：未认证请求返回 401；同时拒绝跨站 `Origin`。桌面外壳里没有 connection 服务时跳过该校验。

## 安装

需要 DSH `>=0.2.2-rc.1 <0.3.0`。从 GitHub 安装：

```sh
dsh plugin add github:Kingzhoudk/dsh-code-viewer
# 等价的显式 git spec
dsh plugin add git+https://github.com/Kingzhoudk/dsh-code-viewer.git
```

也可以在 Web 的 **Plugins** 页安装，或让 agent 调用 `plugin_manager`
（action `install_bundle`，target 用同一 spec）。插件管理器会写入 profile 依赖并启用这个
bundle；开发时可改用 `dsh plugin add link:<本仓库绝对路径>` 安装本地 checkout。

安装后刷新页面：右侧栏的 Guide 页会出现「CodeIDE」入口，或按面板提示里显示的那个键（桌面端默认
`Cmd/Ctrl+L`，Web 端 `Cmd/Ctrl+Shift+L`）。

## 已知边界

- 暂存、提交、checkout、分支操作仍未实现；编辑只针对单个文本文件，不做多文件/多标签的编辑器。
- Markdown 渲染器是内置的轻量实现：支持标题/段落/粗斜体/删除线/行内代码/列表/引用/分隔线/链接/围栏代码块，不支持表格、脚注、原始 HTML、任务列表勾选与图片加载。
- 命令行分栏优先用 **xterm.js** 渲染（`vendor/xterm.mjs`，随插件内置、按需加载，64 KiB gzip 左右），因此 `vim`、`top` 这类全屏 TUI 可用；只有浏览器环境缺少 `ResizeObserver`/`matchMedia` 或资产加载失败时才退回文本渲染（那时 TUI 显示不完整）。
- xterm 资产由 `scripts/sync-xterm.mjs <@xterm/xterm 包目录>` 从已安装依赖同步，版本记录在 `vendor/VERSION`。
- 模型侧的 `bash` 工具是**面向模型的工具调用**（带沙箱与审批语义），不能嵌进 UI；分栏里跑的是同一台机器上的真实 shell，而不是模型工具。
- 收起分栏只断开视图，shell 进程继续存活；`exit` 或终端服务关闭后需要重新打开面板才会重建。
- 文件树不递归搜索（只有懒加载浏览）；根目录很大时首次展开较慢。
- diff 只显示文本改动，二进制文件显示为 `±`。
- 与已安装的 `@linxin666/dsh-client-ui-git-graph` 互不影响：那个插件提供空白会话的分支切换与全屏图谱，本插件是右侧栏内的独立只读图谱。

## 故障排查

- 文件树出现红色「无法读取该目录」时，下面会直接给出 Host 的错误码与原文（例如 `gateway/bad-request`、`workspace-file/not-found`、`workspace-file/outside-workspace`），并带「重试」按钮。
- 文件树根目录用的是会话的**绝对工作目录**（Host 的 `workspaceFiles.list` 拒绝空路径），若与工作区根目录不一致会自动改用相对形式重试一次。
- 单次请求 12 秒（读文件 15 秒）未返回即转为可见错误，不会一直转圈。
- 想对照：右侧栏自带的「Files」标签用的是同一套服务；如果它同样报错，问题在该会话的工作区解析，而不是本面板。

## 许可证

MIT，见 [LICENSE](LICENSE)。内置的 Material Icon Theme 素材与 xterm.js 资产分别遵循
[`LICENSE-material-icon-theme`](LICENSE-material-icon-theme) 与
[`vendor/LICENSE-xterm`](vendor/LICENSE-xterm) 中的第三方许可。
