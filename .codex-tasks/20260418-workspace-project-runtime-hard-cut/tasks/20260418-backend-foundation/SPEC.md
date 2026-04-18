# Child Task Spec: Backend Project Runtime Foundation

## Goal

建立 `Project / Runtime` 的后端一等对象、最小模块骨架和上下文入口，为后续 project-scoped API、admin IA 和 runtime publish cutover 提供基础。

## Scope

- 新增 `Project` 与 `ProjectRuntime` 模型
- 新增 `modules/projects/*` 和 `modules/projects/runtime/*` 基础模块
- 提供最小 project context schema / service
- 在 `core/routes.py` 注册基础 router

## Non-Goals

- 本子任务不完成全部 project API cutover
- 本子任务不改 admin routes
- 本子任务不完成 publish/delivery runtime cutover
