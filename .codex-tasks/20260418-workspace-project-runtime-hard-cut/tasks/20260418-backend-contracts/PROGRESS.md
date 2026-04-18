# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-backend-contracts`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-backend-contracts/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: FastAPI / Tortoise / pnpm

## Context Recovery Block

- **Current milestone**: #4 — Add project-scoped releases and publish routers then validate
- **Current status**: DONE
- **Last completed**: #4 — Add project-scoped releases and publish routers then validate
- **Current artifact**: `TODO.csv`
- **Key context**: Project-scoped backend facades now exist for site bridge, api keys, releases, and publish preview. Lower layers still use workspace + site internally.
- **Known issues**: This is a facade cutover, not a full storage ownership rewrite.
- **Next action**: Move to parent epic child #3 — admin IA cutover.

## Milestone 1: Create backend-contract task artifacts and inspect target routes

- **Status**: DONE
- **What was done**:
  - Wrote child task artifacts.
  - Confirmed second-stage surface area is `site`, `api-keys`, `releases`, and `publish`.
- **Validation**: `echo inspected` -> exit 0
- **Next step**: Milestone 2 — Add project bootstrap and shared project facade helpers

## Milestone 2: Add project bootstrap and shared project facade helpers

- **Status**: DONE
- **What was done**:
  - Added repository helper to create a default project per workspace.
  - Added project facade context service bridging project to workspace/site/runtime.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Files changed**:
  - `apps/api/src/modules/projects/repository.py`
  - `apps/api/src/modules/projects/facade/service.py`
- **Next step**: Milestone 3 — Add project-scoped site and api key routers

## Milestone 3: Add project-scoped site and api key routers

- **Status**: DONE
- **What was done**:
  - Added project site bridge route and preview token route.
  - Added project-scoped api key list/create/get/revoke/rotate routes.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/modules` -> exit 0
- **Files changed**:
  - `apps/api/src/modules/projects/facade/router.py`
- **Next step**: Milestone 4 — Add project-scoped releases and publish routers then validate

## Milestone 4: Add project-scoped releases and publish routers then validate

- **Status**: DONE
- **What was done**:
  - Added project-scoped release list/detail/publish/rollback routes.
  - Added project-scoped publish impact and preview contract routes.
  - Mounted project facade router under the projects module.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Files changed**:
  - `apps/api/src/modules/projects/facade/router.py`
  - `apps/api/src/modules/projects/router.py`
- **Next step**: parent epic child #3 — admin IA cutover
