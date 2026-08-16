# 项目指导索引

本目录只存放**非规范**（non-spec）的长期指导文档。

实现契约不在本目录维护，权威实现契约位于 `docs/spec/**`；产品方向、计划与执行记录位于 `docs/plan/**`（当前方向权威：`docs/plan/ai-builder-product-direction.md`）。

## 活跃指导

- `frontend-design.md`：Product Application 与 Platform Console 的前端实现指导（视觉语言权威仍是 `DESIGN.md`）。
- `code-review-engine.md`：Code Review Engine（`scripts/code-review-engine`）的工具说明与规则目录指引。
- `code-reuse-thinking-guide.md`：写新代码前优先考虑复用的思考清单（非规范）。
- `cross-layer-thinking-guide.md`：跨层改动时数据流与边界契约的思考清单（非规范）。

## 维护规则

- 新增或修改实现契约 → `docs/spec/**`。
- 新增方向备忘录、实施计划、执行记录 → `docs/plan/**`。
- 本目录只保留可跨任务复用的长期指导；一次性报告与执行日志不落在此处。
- 架构决策记录 → `docs/adr/**`。
