# Studio 对齐（为后续全量重构保留一致性）

Studio 当前 UI 可能处于过渡期；本 skill 对 Studio 的目标是“复用 tokens + overlay 语义”，避免未来重构时的风格分叉。

## 必读入口

- `apps/studio/src/providers/app-providers.tsx`：antd `ConfigProvider` + `@celestial/theme/antd`
- `apps/studio/src/index.css`：引入 `@celestial/theme/tokens.css` 与 Tailwind layer 结构

## Studio 新 UI 的最小对齐策略

- 继续使用 `@celestial/theme/tokens.css` 的语义 tokens（避免 studio 自创配色）
- overlays / 结构组件尽量使用 `@celestial/ui/*`（与 Admin 共用 shadcn 封装）
- i18n 文案保持与仓库约束一致（避免硬编码）

## 不做的事（v1）

- 不在 Studio 内强制引入 Admin 的 `DefaultPage` 壳（直到 Studio 重构方案冻结）
- 不对 Studio 现有页面做风格大迁移（只为新页面提供可复用语言与组件选型）
