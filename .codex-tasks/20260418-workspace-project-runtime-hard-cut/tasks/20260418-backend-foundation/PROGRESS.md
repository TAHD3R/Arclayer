# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-backend-foundation`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-backend-foundation/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: FastAPI / Tortoise / pnpm

## Context Recovery Block

- **Current milestone**: #4 — Register project routers and run focused validation
- **Current status**: DONE
- **Last completed**: #4 — Register project routers and run focused validation
- **Current artifact**: `TODO.csv`
- **Key context**: Backend foundation is in place: project/runtime models, project context, project router, and route registration all compile. Old site/workspace coupling still remains for later cutover tasks.
- **Known issues**: No migrations or consumer rewiring yet. Existing APIs still primarily speak workspace/site semantics.
- **Next action**: Update parent epic artifacts and start backend contract cutover child task.

## Milestone 1: Inspect backend registration and existing workspace-site coupling

- **Status**: DONE
- **What was done**:
  - Read `core/routes.py`, workspace context service, and existing site/workspace models.
  - Confirmed current coupling and identified lowest-risk foundation insertion points.
- **Validation**: `echo inspected` -> exit 0
- **Next step**: Milestone 2 — Add project and runtime domain models

## Milestone 2: Add project and runtime domain models

- **Status**: DONE
- **What was done**:
  - Added `ProjectRecord`.
  - Added `ProjectRuntimeRecord` plus `primary` runtime kind.
  - Added project post-save bootstrap for default primary runtime.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/models` -> exit 0
- **Files changed**:
  - `apps/api/src/models/projects/project.py`
  - `apps/api/src/models/projects/runtime.py`
- **Next step**: Milestone 3 — Add project context schema service and router skeleton

## Milestone 3: Add project context schema service and router skeleton

- **Status**: DONE
- **What was done**:
  - Added project repository, schema, service, project request context, and project router.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/modules` -> exit 0
- **Files changed**:
  - `apps/api/src/modules/projects/repository.py`
  - `apps/api/src/modules/projects/schema.py`
  - `apps/api/src/modules/projects/service.py`
  - `apps/api/src/modules/projects/http/schema.py`
  - `apps/api/src/modules/projects/http/service.py`
  - `apps/api/src/modules/projects/router.py`
- **Next step**: Milestone 4 — Register project routers and run focused validation

## Milestone 4: Register project routers and run focused validation

- **Status**: DONE
- **What was done**:
  - Registered project router in `core/routes.py`.
  - Ran focused compile validation across models and modules.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Files changed**:
  - `apps/api/src/core/routes.py`
- **Next step**: parent epic child #2 — backend contract cutover
