# CelestialCMS Admin 同 Feel：可复现语言（Design DNA）

目标：让新页面/弹层在不提供太多信息时，也能稳定对齐 CelestialCMS Admin 的“结构、节奏、排版、交互语义”。

## 1) 性格（最高优先级）

- **清晰（Perspicuous）**：少装饰噪音；层级直接；用户一眼知道“是什么/能做什么/下一步”。
- **自信（Confident）**：主/次/危险动作语义明确；禁用与阻塞原因可见；不做暧昧按钮。
- **对话感（Conversational）**：短句、sentence case；避免“答案：”“请注意…”等元话术。
- **智能（Intelligent）**：不啰嗦解释，但空/错态必须给“可执行下一步”。

## 2) 排版与色彩（由 tokens.css 驱动）

- 只用语义排版类：`text-largetitle` / `text-title2` / `text-body` / `text-callout` / `text-footnote` / `text-caption`
- 说明/帮助文字统一：`text-label-secondary`
- 强调只用语义色：`var(--primary)` 作为 CTA 与 focus；危险操作用 destructive
- 结构线偏轻：边框与分割多用 `border` + 低对比（例如 `border-border/40`）
- **Admin 约束**：禁止使用标准 Tailwind 字号（`text-sm` / `text-base` / `text-lg` 等），只用语义字号类。
- **Admin 约束**：禁止新引入 `text-muted-foreground`，统一用 `text-label-secondary`。

一句话模板：
> “低对比结构线承载信息骨架；标题用语义字号压层级；说明统一 secondary；强调只用主色与 destructive，不做彩色装饰。”

## 3) 页面壳（DefaultPage 语法）

- 容器：`DefaultPage width="fixed"`（除非明确要 full）
- 标题：左侧 `text-largetitle`；描述：标题下 `text-label-secondary`
- 顶部 action：通常 1 个 primary CTA（带 16px icon），Antd Button 必须 `autoInsertSpace={false}`
- `extra`：用于搜索/筛选/工具条（节奏固定，避免乱塞到 body 顶部）

## 4) 状态契约（必须显式列出）

任何数据驱动页面/弹层都必须定义：
- `loading`：不闪跳；骨架或 loader 与最终结构一致
- `empty`：给出“下一步动作”（创建/导入/清空筛选）
- `error`：可读错误 + retry
- `disabled`：说明原因（必要时）

## 5) Overlay（SettingDialog 语法，强推荐）

当你要做“详情/编辑/创建”的 dialog：
- 用 `SettingDialog`（不要在 feature 里手搓裸 Dialog header/body/footer）
- 必须有 `title` + `description`
- body 节奏：`grid gap-4 py-2`；字段块：`grid gap-1.5`（label/help/control）
- footer：`bg-card`；取消 `type="text"`；确认 `type="primary"` + `loading` 绑定 mutation
- 所有 Select/Dropdown：必须使用项目 popup container 策略（避免被 overlay 截断/遮挡）
- overlay 内 loading 指示优先使用项目标准 loader/skeleton（Admin overlays 中避免新增 `Spin`）。
- 需要确认的危险操作：优先用 `AlertDialog`，并让 feature 自己持有 footer actions（避免引入不一致的确认弹层）。

一句话模板：
> “SettingDialog：header 清晰（title+desc），body 用 grid 节奏承载字段组，footer 固定 bg-card，取消 text，确认 primary 并绑定 loading；所有下拉走 overlay 内 popup container。”

## 6) 组件选型（shadcn 封装 vs antd）

- **结构/overlay primitives**：优先 `@celestial/ui/*`（来源：`packages/ui/shadcn`）
- **输入/按钮语义**：优先 `antd`（受 ConfigProvider theme、autoInsertSpace、popup container 约束）
- 不引入新的 UI 组件库；不自创一套 tokens/字号/阴影体系
- Admin 的 tag/pill UI：不要在 feature 里手搓；必须走项目的语义 Tag 系统（避免风格漂移）。
