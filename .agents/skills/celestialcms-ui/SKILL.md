---
name: celestialcms-ui
description: "在 CelestialCMS 仓库中按既有设计规范与视觉 tokens 设计并实现 UI（React/TSX），并正确使用项目内的 shadcn 组件封装（packages/ui/shadcn 导出为 @celestial/ui/*）与 antd（含 ConfigProvider 主题、popup 容器策略、autoInsertSpace 约束）。当用户提出“帮我设计界面/页面/弹窗/对话框/详情页/管理页”、新增或改版 apps/admin 的页面与 overlays（SettingDialog/Sheet），或希望新功能与既有页面保持同 Feel（例如 assets、workspace basics、team roles、invite members dialog）时使用。也用于 apps/studio 在重构前的对齐：复用 tokens 与 overlay 语义，但不强行复刻 Admin 的路由与页面壳实现。"
---

# CelestialCMS UI（同 Feel 复现）

## 快速开始（每次 UI 任务都先做）

1) 运行上下文扫描（只读，不改代码）：

```bash
bash .agents/skills/celestialcms-ui/scripts/scan-all.sh
```

2) 阅读“风格 DNA”（用于稳定复现）：
- `references/admin-feel-dna.md`
- `references/anchors.md`
- `references/output-contract.md`（输出结构：低输入也能稳定同 Feel）
- `references/studio-alignment.md`（仅当目标是 Studio）

3) 输出必须先写一段“风格锁定声明”（让后续实现不跑偏）：
- 目标落点：`Admin` / `Studio`
- 容器：`DefaultPage` / `SettingDialog` / `Sheet`
- 组件选型：结构用 `@celestial/ui/*`，输入/按钮用 `antd`
- 排版：语义字体类（`text-title2`、`text-body`、`text-label-secondary` 等）
- 状态：loading/empty/error/disabled（逐条列清）

## 工作流（按请求类型选分支）

### A) 新增/改版 Admin 页面（默认分支）

必须遵守：
- 页面壳：默认 `DefaultPage width="fixed"`（参考 anchors）
- 状态契约：必须显式实现 `loading` / `empty` / `error`（优先用 `ContentGuard` 与标准 skeleton）
- 文案：全部走 i18n（同时落地 `locales/zh-CN/*.json` 与 `locales/en-US/*.json`）
- tokens：只用 `packages/ui/tokens/src/tokens.css` 语义 tokens（禁止自创颜色/字号体系）
- Antd Button：必须 `autoInsertSpace={false}`（Admin 约束）

产出要求（在回答/实现里要明确写出）：
- 页面标题/描述（sentence case 的 i18n key）
- 顶部 action（通常 1 个 primary CTA，带 16px icon）
- `extra` 区（需要时放搜索/筛选/toolbar）
- 主体结构（SettingPanel/表格/卡片列表等），并说明组件选型理由

### B) 新增 Admin 详情/编辑 Dialog（SettingDialog，强推荐）

默认使用 `@celestial/ui/setting-dialog`（不要在 feature 文件里手搓裸 `Dialog` 结构）：
- 必须提供 `title` + `description`（参考 invite-members-dialog anchor）
- body 节奏：`grid gap-4 py-2`；字段块：`grid gap-1.5`（label/help/control）
- footer：`border-t bg-card`；取消按钮用 Antd `type="text"`；确认按钮 `type="primary"` 并绑定 `loading`
- 下拉/Select：必须使用项目的 popup container 策略（避免 overlay 截断/遮挡）

### C) 新增 Admin 右侧详情 Sheet（用于资源预览/详情）

优先复用 `@celestial/ui/sheet` 语义与现有资产预览的“边框+header+footer”结构（参考 assets 的 sheet anchor），并保证：
- header 有清晰标题与二级信息（`text-footnote`/secondary）
- sticky/overflow 不引入全局 z-index 漂移（遵守 design guideline 的 layering 契约）

### D) Studio 对齐（为后续全量重构做准备）

Studio 当前实现可能未完全遵守 Admin 的语义排版与约束；新实现应优先做到：
- 复用 `@celestial/theme/tokens.css`（已在 `apps/studio/src/index.css` 引入）
- 复用 `@celestial/theme/antd` 的 theme 生成与 `ConfigProvider`（参考 `apps/studio/src/providers/app-providers.tsx`）
- overlays/结构组件优先使用 `@celestial/ui/*`，保持与 Admin 一致的 overlay 语义

## 只允许的“自由度”

允许创作的范围（不破坏同 Feel）：
- 信息架构（分组/层级/节奏）
- 空状态文案与下一步动作
- 轻量交互（hover/focus/disabled/loading 的一致性细节）

不允许的范围（会导致风格漂移）：
- 自创配色、字体体系、阴影体系（必须来自 tokens）
- 引入新 UI 组件库
- 在 feature 里手搓“看起来像 Tag/Badge”的 pill（Admin 必须走语义 Tag 系统）

## 资源

### scripts/
- `scripts/scan-all.sh`：一次性跑完 Admin anchors / tokens / Studio 入口扫描（只读）

### references/
- `references/admin-feel-dna.md`：同 Feel 的稳定复现语言（页面/overlay/排版/交互）
- `references/anchors.md`：你指定的 4 个锚点文件“要学什么、要避免什么”
- `references/studio-alignment.md`：Studio 的最小对齐策略（为重构准备）
