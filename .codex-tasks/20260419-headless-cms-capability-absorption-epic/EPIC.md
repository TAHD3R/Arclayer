# Epic Specification

## Goal

- 把 Strapi 和 Directus 可吸收的 Headless CMS 平台能力系统化收编到 Arclayer，按 Epic 颗粒度形成可恢复、可验证、可独立推进的任务体系，覆盖 backend、admin frontend、editor、SDK 与 operator surfaces。

## Non-Goals

- 本轮不直接实现业务代码
- 本轮不运行跨 Epic 的真实功能开发
- 本轮不修改既有 Headless CMS 核心实现
- 本轮不引入额外任务管理工具替代 Taskmaster

## Constraints

- Follow `docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md`
- Follow `docs/plans/2026-04-18-headless-cms-commercial-gap-analysis.md`
- Keep repo truth first and use disk artifacts as recovery source of truth
- One child deliverable per epic
- Every child task must own `SPEC.md`, `TODO.csv`, and `PROGRESS.md`
- Keep failures explicit; no silent fallback or fake success paths

## Risk Assessment

- Epic boundaries can drift if the implementation plan and Taskmaster artifacts diverge
- Frontend and backend dependencies can become ambiguous if each epic does not state its dependency chain clearly
- Recovery quality degrades if child task files do not include enough context to resume cold
- Docs index can become stale if epic task paths are not listed centrally

## Child Deliverables

- Epic 0 Program Setup
- Epic 1 Model Lifecycle Platform
- Epic 2 Document Runtime Platform
- Epic 3 Permission and Policy Platform
- Epic 4 GraphQL Platformization
- Epic 5 Editorial Workflow and Release Orchestration
- Epic 6 Automation Flows and Operations Platform
- Epic 7 Extension and Admin Surface Platform
- Epic 8 Asset and File System Object Platform
- Epic 9 SDK Productization 2.0
- Epic 10 Audit Observability Benchmarks and Upgrade Tooling

## Dependency Notes

- Epic 0 is the planning and baseline prerequisite for all other child tasks
- Epic 1 depends on Epic 0
- Epic 2 depends on Epic 0;1
- Epic 3 depends on Epic 0;1;2
- Epic 4 depends on Epic 0;1;2;3
- Epic 5 depends on Epic 0;2;3;4
- Epic 6 depends on Epic 0;3;5
- Epic 7 depends on Epic 0;1;3;4
- Epic 8 depends on Epic 0;2;4;7
- Epic 9 depends on Epic 0;1;3;4;5;6;8
- Epic 10 depends on all prior epics

## Child Task Types

- `single-full`

## Done-When

- [ ] Every row in `SUBTASKS.csv` is `DONE`
- [ ] Every child task has its own `SPEC.md`, `TODO.csv`, and `PROGRESS.md`
- [ ] `docs/plan/headless-cms-capability-absorption-task-index.md` lists every epic checklist and task path
- [ ] The parent epic can be resumed from disk alone
