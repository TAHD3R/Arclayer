# 输出契约（让“低输入”也稳定同 Feel）

当用户只说一句话（例如“做资源详情 dialog”）时，必须按以下结构输出；这能防止跑偏与风格漂移。

## 1) 风格锁定声明（必写）

用 5–8 行短句锁定：
- 落点：Admin / Studio
- 页面壳：DefaultPage / SettingDialog / Sheet
- 组件选型：结构用 `@celestial/ui/*`；输入/按钮用 `antd`
- tokens：只用 `packages/ui/tokens/src/tokens.css` 的语义 tokens
- 文案：i18n（双语落地）
- 状态：loading/empty/error/disabled（明确列出）

## 2) 信息架构（必写）

用条目列出页面/弹层的区块：
- header / toolbar / content sections / footer actions
- 每个区块一句话说明“用户在这里做什么”

## 3) 组件映射（必写）

把每个区块映射到“项目已有组件”：
- DefaultPage / ContentGuard
- SettingDialog / AlertDialog / Sheet（按场景选）
- antd Button/Input/Select/Form（按场景选）

要求：对每个“非默认选型”写一句理由（引用设计指南的动机：一致性、可用性、复杂度）。

## 4) 状态与交互（必写）

逐条写清：
- loading：用 skeleton 还是 loader（以及位置）
- empty：文案 + 下一步按钮
- error：提示 + retry
- disabled：原因与可见性
- destructive：确认策略（AlertDialog）

## 5) i18n keys（必写）

列出新增 key 的命名空间与 key 名（不用一次给出完整 JSON，但必须先给 key 清单，避免后补漏项）：
- 例如 `assets:...` / `team:...` / `common:...`

## 6) 代码落点（可选但推荐）

如果用户没给文件路径，先给出建议落点（例如 `apps/admin/src/pages/...`），并说明与 anchors 的对齐点。
