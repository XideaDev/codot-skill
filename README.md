# Codot Skills

专门针对 **Codot** 多智能体工作流优化的开源技能库，遵循 [Agent Skills](https://agentskills.io) 开放标准。

## 在 Codot 中安装

1. 打开 **Codot 设置 → 技能**，点击安装技能仓库，填入：
   ```text
   https://github.com/XideaDev/codot-skill
   ```
   （或直接在对话中让 Agent 调用 `codot_skill_install` 安装）
2. 在技能列表中启用需要的技能。

---

## 第一组技能：Google Stitch (`skills/stitch/`)

源自 [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills)（Apache-2.0），针对 **Codot** 做了以下专属优化：

- **命名规范化**：移除原仓库中的 `stitch::` 前缀，确保所有 16 个技能的 `name` 与目录名严格一致，满足 Codot 校验规则（`^[a-z0-9][a-z0-9-]{0,63}$`），全部可直接开关启用。
- **Codot MCP 统一接入**：适配 **Codot 设置 → MCP** 集中注入模式，无需在单个 Agent（Claude / OpenCode / Codex）里重复配置 MCP。
- **内置浏览器与预览适配**：优先使用 Codot 内置 `browser_*`（浏览/截图/控制台检查）与 `show_preview`（直接在对话展示设计稿截图与 HTML），替代外部 Chrome DevTools MCP。

### 使用前置条件

在 **Codot 设置 → MCP** 中添加 Google Stitch MCP 服务：
- **名称**：`stitch`
- **类型**：HTTP
- **URL**：`https://stitch.googleapis.com/mcp`
- **Header**：`X-Goog-Api-Key: <你的 Stitch API Key>`

### 包含技能（16 个）

#### 设计与画布管理
| 技能 | 说明 |
|---|---|
| `stitch-generate-design` | 通过自然语言或参考图在 Stitch 生成新页面、修改现有页面、生成变体 |
| `stitch-code-to-design` | 将现有前端项目（React / Vue / Angular 等）提取并上传到 Stitch |
| `stitch-manage-design-system` | 在 Stitch 中管理设计系统、上传 `DESIGN.md` 并应用到屏幕 |
| `stitch-extract-design-md` | 从现有前端源码逆向提取 `DESIGN.md` 设计规范 |
| `stitch-extract-static-html` | 从运行中的 Web 应用提取自包含静态 HTML 快照 |
| `stitch-upload-to-stitch` | 将本地图片、原型或 HTML 上传到指定 Stitch 项目 |

#### 前端代码生成与构建
| 技能 | 说明 |
|---|---|
| `stitch-react-components` | 将 Stitch 页面转换为模块化 Vite + React 组件并校验 |
| `stitch-react-native` | 将 Stitch 设计稿转换为 React Native 组件（StyleSheet） |
| `stitch-react-vite-dashboard` | 转换为带 TanStack Query 与设计 Token 的 React + Vite 仪表盘 |
| `stitch-shadcn-ui` | 结合 shadcn/ui 组件库进行发现、安装与定制开发 |
| `stitch-remotion` | 基于 Stitch 项目自动生成带缩放与转场的 Remotion 演示视频 |

#### 提示词与自动化迭代
| 技能 | 说明 |
|---|---|
| `stitch-enhance-prompt` | 将模糊的 UI 想法增强为高精度的 Stitch 提示词 |
| `stitch-design-md` | 分析 Stitch 项目并生成语义化的 `DESIGN.md` |
| `stitch-site-md` | 生成用于 `stitch-loop` 的整站规划文档 `SITE.md` |
| `stitch-loop` | 基于接力任务文件连续自动构建多页网站 |
| `stitch-taste-design` | 生成反平庸、高审美标准的 `DESIGN.md` |

---

## License

Apache License 2.0 (see [LICENSE](./LICENSE))
