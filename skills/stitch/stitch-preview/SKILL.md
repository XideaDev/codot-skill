---
name: stitch-preview
description: "下载 Stitch 设计稿（HTML 与截图）并在 Codot 中预览或验收：提供本地静态服务配合内置浏览器完整预览，以及将 HTML 离线化（内联 Tailwind 与 Material Symbols 字体）后通过 show_preview 在对话内展示。当需要保存 download_file 输出或预览 Stitch 导出页面时使用。"
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
---

> **Codot Runtime Adaptation**
> - **Stitch MCP**: Provided centrally via **Codot Settings → MCP** (look for tools prefixed with `stitch:` or `mcp__stitch__`). Do not reconfigure per-agent MCP files.
> - **Browser & Visual Verification**: Prefer Codot's built-in `browser_*` tools (`browser_navigate`, `browser_snapshot`, `browser_screenshot`, `browser_console`) over external Chrome DevTools MCP when inspecting local dev servers or rendered pages.
> - **Visual Delivery**: `show_preview` is **offline and cannot access the network**; Stitch-exported HTML relies on CDN Tailwind/fonts and renders blank if passed directly. Use the `stitch-preview` skill for both preview paths (local static server + `browser_*` for full fidelity/interaction, or `stitch-offline.mjs` + `show_preview` for in-chat HTML preview, or `show_preview` directly on `.png` screenshots).
> - **Asset Download**: Always use Stitch MCP `download_file` (with `htmlCode.name` / `screenshot.name`), **never** `curl` against `downloadUrl` (which requires credentials and returns a JSON wrapper). If `download_file` output is truncated to a temporary file, decode it with `stitch-preview/scripts/save-stitch-file.mjs`.
> - **Object Parameters**: If an MCP tool fails with `expected object, got string` (some agent runtimes serialize object arguments as strings), switch to the string-only fallback workflow in `stitch-manage-design-system` instead of retrying the same failing call.
> - **Long-running Calls**: If `generate_screen_from_text` or `edit_screens` times out, poll `list_screens` every 60 seconds for up to ~5 minutes (5 polls); if no new screen appears, re-issue the call once instead of waiting indefinitely.
> - **Tool Mapping**: Map generic tool names (`Read`, `Write`, `Edit`, `Bash`) to the active Codot harness tools (`read`, `write`, `edit`, `bash`).

# Stitch Preview & Asset Download

Download Stitch screen assets reliably via MCP `download_file` and preview or verify exported pages inside Codot without broken styles or missing icons.

## 1. 下载资产（Asset Download）

1. 从 `get_screen` / `list_screens` / 生成工具返回的 screen 对象中提取文件资源名：
   - HTML：`htmlCode.name`（形如 `projects/{project}/files/{file}`）
   - 截图：`screenshot.name`（形如 `projects/{project}/files/{file}`）
   - **不要**使用 `curl` 请求 `downloadUrl`：该 URL 需要凭证，直接访问只会返回 JSON 包装而不是目标文件。
2. 调用 Stitch MCP 工具 `download_file`（参数 `{ "name": "projects/.../files/..." }`）。
3. 落盘保存：
   - 若返回体积较小、直接可见完整 JSON，可直接解码写入 `.stitch/designs/<name>.html` / `.png`。
   - 若输出体积较大被运行时截断，并在提示中给出完整输出文件路径（例如 `[Full output: /var/folders/.../pi-mcp-xxxx.txt]`），使用配套脚本解码落盘：
     ```bash
     node skills/stitch/stitch-preview/scripts/save-stitch-file.mjs <tool-output.json|txt> <out-path>
     ```
     - 脚本会自动识别 JSON 中的 `html` 字段（UTF-8 文本）或 `image` 字段（base64 解码为二进制图片，若 `<out-path>` 未带扩展名则按 `imageMetadata.mimeType` 自动补全 `.png` / `.jpg` / `.webp`）。

## 2. 两条预览路径的决策

根据验收目标选择对应路径：

| 场景 | 推荐路径 | 原因 |
|---|---|---|
| 像素级验收、真实 Web 字体、移动端视口测试、点击交互、控制台检查 | **路径 A：本地静态服务 + 内置浏览器** | `browser_*` 可联网加载 CDN Tailwind / 字体，支持 `viewport` 切换与真实 DOM 交互 |
| 直接把成果放进对话给用户看 / 离线审阅 | **路径 B：`show_preview`（PNG 或离线化 HTML）** | `show_preview` 离线无网，需先用 `stitch-offline.mjs` 内联 CSS 与图标字体 |

### 路径 A：完整保真 / 可交互（本地静态服务 + `browser_*`）

1. 用 `terminal_run` 在 HTML 所在目录启动本地静态服务（绑定 `127.0.0.1`）：
   ```bash
   python3 -m http.server 18123 --bind 127.0.0.1 --directory .stitch/designs
   ```
2. 用 `browser_navigate` 打开 `http://127.0.0.1:18123/<file>.html`：
   - 移动端设计可传入 `viewport: { width: 390, height: 844 }`。
3. 用 `browser_snapshot` 检查 DOM / 无障碍结构，用 `browser_screenshot` 截图确认视觉效果（可使用 `fullPage: true`）。
   - **注意**：截图启用 `fullPage: true` 时，页面中的 `position: fixed` 元素（如底部悬浮导航栏）在整页长图里会出现在视口高度对应的中间位置，属浏览器整页拼接的正常行为，不代表布局错位。
4. 预览或验收结束后，**务必调用 `terminal_stop`** 停掉 `terminal_run` 启动的静态服务，避免端口与进程残留。

### 路径 B：放进对话（`show_preview`）

`show_preview` 运行在离线沙箱中，**不能访问外部网络**：

- **展示截图**：对已下载的 `.png` 文件直接调用 `show_preview`。
- **展示可交互 HTML**：必须先运行离线化脚本，再对生成的 `*-offline.html` 调用 `show_preview`（切勿直接传入 Stitch 原始 HTML，否则 `cdn.tailwindcss.com` 无法加载会导致白屏或样式全失）：
  ```bash
  node skills/stitch/stitch-preview/scripts/stitch-offline.mjs <stitch.html> [out.html] [--system-font]
  ```
  - 省略 `[out.html]` 时默认输出到 `<basename>-offline.html`。
  - 加上 `--system-font` 可将正文字体统一替换为系统字体（`-apple-system, "SF Pro Text", "PingFang SC", sans-serif`），同时保留 `.material-symbols-outlined` 图标字体；适合检验 iOS / macOS 原生字体效果或避免无网回退字体差异。

#### `stitch-offline.mjs` 工作原理与限制说明

1. **Tailwind 编译**：从 HTML 中抽取 `tailwind.config = { ... }`（如 `<script id="tailwind-config">`），在临时目录生成 `tailwind.config.js` 并执行 `npx -y tailwindcss@3.4.17 -c tailwind.config.js -i in.css -o out.css --minify`。
   - **不支持的插件说明**：Stitch CDN 脚本常携带 `?plugins=forms,container-queries`，若提取到的 `tailwind.config` 内包含本地未安装的 `plugins` 配置，脚本会自动移除 `plugins` 字段以保证编译通过；若页面重度依赖 `@tailwindcss/forms` 或 `@tailwindcss/container-queries` 的专属样式类，离线版可能略微回退，此时请改用**路径 A（内置浏览器）**验收。
2. **Material Symbols 子集字体内联**：扫描 HTML 中 `data-icon="..."` 与 `.material-symbols-outlined` 标签文本提取图标名，向 Google Fonts 请求仅包含这些图标的 `woff2` 子集并转为 `data:font/woff2;base64,...` 内联。
3. **样式注入顺序**：图标 `@font-face` 与 `.material-symbols-outlined` 基础规则必须注入在 Tailwind CSS **之前**，否则 `.material-symbols-outlined { font-size: 24px }` 会覆盖 `text-[13px]`、`text-[20px]` 等 Tailwind 尺寸类。
4. **外链清理与检查**：移除外部 `<link>` 与 Tailwind CDN `<script>`，并在末尾检查并输出剩余 `http(s)://` 外链数量（排除 Tailwind CSS 注释头与 SVG `xmlns`）。若页面内还引用了远程 `<img>` URL，请结合需要替换为本地图片或通过路径 A 查看。
