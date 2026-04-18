# Child Task Spec: Admin IA Project Route Cutover

## Goal

把 admin 的主 IA 从 workspace 路由语义切到 project 路由语义，建立 `/projects` 与 `/projects/$projectId/*` 主入口，并调整 workspace switcher 与列表页跳转契约。

## Scope

- 新建 project 路由入口与 route shell
- 把 `/workspaces` 语义切为 `/projects`
- 调整 path helper 与 switcher 跳转
- 保留原有 page 组件的最大复用，先完成主 IA 层切换

## Non-Goals

- 本子任务不完成 settings 分组重构
- 本子任务不完成 team 页面迁移
- 本子任务不完成所有 `/w/$workspaceId/*` 深路径替换
