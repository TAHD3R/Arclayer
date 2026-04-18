# Child Task Spec: Backend Project API And Auth Boundaries

## Goal

把当前 `workspace/site` 管理接口收敛成 `project-scoped` 后端入口，并建立 project 级 context / facade，为后续 admin route 与 settings cutover 提供稳定 API surface。

## Scope

- 给每个 project 自动建立默认 project membership / project role 基础边界中的最小门面暂缓，当前先复用 workspace access
- 新增 project-scoped site facade 接口
- 新增 project-scoped api keys facade 接口
- 新增 project-scoped releases / publish facade 接口
- 保持底层现有 publish / release / site service 复用

## Non-Goals

- 本子任务不改前端调用方
- 本子任务不删除旧 workspace routes
- 本子任务不把底层 publish 数据模型立即改成 runtime-owned
