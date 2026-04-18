# Epic Specification

## Goal

- 完成 Arclayer `Workspace -> Project -> Runtime` 架构 hard cut，覆盖后端领域、前端 IA、settings shell、成员治理与发布边界。

## Non-Goals

- 不保留旧 `workspace = site` 的长期兼容路径
- 不围绕现有生产数据设计迁移兼容层
- 不在 v1 暴露多 runtime 管理 UI

## Constraints

- 遵守 repo 现有 frontend/backend folder architecture
- 前后端都采用 hard cut，不引入 silent fallback
- 所有变更通过 repo script 验证
- 不覆盖用户当前 dirty worktree 中无关改动

## Risk Assessment

- 路由与上下文主键重命名会触发大面积前端回归
- backend `workspace/site` 缠绕深，domain split 容易引入 contract break
- settings / team / publish 几条线存在共享壳层与权限依赖

## Child Deliverables

- backend foundation: `Project / Runtime` 一等对象与模块骨架
- backend contract cutover: 项目域 API 与权限边界
- admin IA cutover: routes / nav / switcher / context
- settings shell cutover: workspace/project 双分组与样式对齐
- team governance cutover: workspace/project 双层成员治理
- publish/runtime cutover: runtime-scoped release/delivery
- cleanup and verification

## Dependency Notes

- backend foundation 是所有后续子任务依赖
- admin IA 和 settings shell 依赖 backend contract baseline
- publish/runtime cutover 依赖 backend foundation

## Child Task Types

- `single-full`

## Done-When

- [ ] Every row in `SUBTASKS.csv` is `DONE`
- [ ] Final epic validation passes
