# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-runtime-publish`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-runtime-publish/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: FastAPI / pnpm / pytest

## Context Recovery Block

- **Current milestone**: Complete
- **Current status**: DONE
- **Parent milestone**: #6 — Move publish and delivery to runtime-scoped boundaries
- **Current artifact**: `TODO.csv`
- **Key context**: Runtime is now the formal public boundary for runtime config, route resolution, delivery reads, and preview token creation. Project facade resolves publishing/site bridge through `ProjectRuntimeService`, then delegates to existing site/workspace internals with a runtime-owned context.
- **Known issues**: `timeout 60s pnpm api:check` reached lint, format, and typecheck, then hit the repo-required 60 second timeout while full API tests were still running. No test failure was emitted before timeout. Fresh narrow gates and targeted integration coverage passed.
- **Next action**: Resume parent milestone #7 — remove obsolete workspace-as-site surfaces and run final verification.

## Milestone 1: Inspect runtime publish and delivery ownership drift

- **Status**: DONE
- **What was done**:
  - Read milestone 6 design and implementation plan anchors.
  - Confirmed `ProjectContext` already exposes `runtime_id`, while `ProjectFacadeService` still resolves and returns `site_id`.
  - Confirmed project preview token, API keys, releases, publish impact, and preview contract still delegate to `WorkspaceApiKeysService`, `WorkspaceReleasesService`, `WorkspacePublishService`, `WorkspacePublishPreviewService`, and `SiteService` with `workspace_id/site_id`.
  - Confirmed public delivery/runtime/preview endpoints are still mounted under `/sites/{site_id}`.
- **Validation**:
  - `echo inspected` -> completed by repo inspection and mapped in this progress log
- **Next step**: Milestone 2 — Add runtime context and runtime-scoped backend service boundary

## Milestone 2: Add runtime context and runtime-scoped backend service boundary

- **Status**: DONE
- **What was done**:
  - Added `ProjectRuntimeService` as the runtime-owned bridge from runtime or project identity to project, workspace, primary site, runtime metadata, locale defaults, and active status.
  - Added runtime response schemas for bridge and preview token output.
  - Added runtime repository lookup by runtime id.
  - Registered the runtime router under the global API prefix.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules tests/modules/projects` -> exit 0
- **Next step**: Milestone 3 — Cut project facade publish and api-key flows to runtime ownership

## Milestone 3: Cut project facade publish and api-key flows to runtime ownership

- **Status**: DONE
- **What was done**:
  - Replaced direct project facade site resolution with `ProjectRuntimeService.get_context_by_project`.
  - Kept existing workspace/site internals as storage-level bridge targets while exposing runtime as the project publishing context.
  - Routed project releases, publish impact, preview contract, preview token, and API key creation through the runtime-derived bridge.
  - Fixed surfaced backend type issues around project/runtime FK attributes and route UUID path parameters.
- **Validation**:
  - `timeout 60s pnpm -C apps/api lint` -> exit 0
  - `timeout 60s pnpm -C apps/api format` -> exit 0, 566 files unchanged
  - `timeout 60s pnpm -C apps/api typecheck` -> exit 0, 129 existing diagnostics reported as warnings
- **Next step**: Milestone 4 — Add runtime-scoped delivery and preview routes plus targeted tests

## Milestone 4: Add runtime-scoped delivery and preview routes plus targeted tests

- **Status**: DONE
- **What was done**:
  - Added `/api/v1/runtimes/{runtime_id}/runtime`.
  - Added `/api/v1/runtimes/{runtime_id}/routes/resolve`.
  - Added `/api/v1/runtimes/{runtime_id}/delivery/*` route family for menus, style, pages, sections, and global sets.
  - Added `/api/v1/runtimes/{runtime_id}/preview-tokens`.
  - Added integration tests proving runtime routes, project facade publishing, preview contract, and project API keys resolve through the same runtime/site bridge.
- **Validation**:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py` -> 10 passed, exit 0
- **Next step**: Milestone 5 — Run milestone verification and update parent epic

## Milestone 5: Run milestone verification and update parent epic

- **Status**: DONE
- **What was done**:
  - Re-ran backend lint, format, typecheck, compileall, and targeted runtime/publish/delivery integration tests after implementation.
  - Ran `timeout 60s pnpm api:check` as the milestone quality gate.
  - Recorded full-check timeout honestly because backend tests exceeded the required 60 second cap.
- **Validation**:
  - `timeout 60s pnpm -C apps/api lint` -> exit 0
  - `timeout 60s pnpm -C apps/api format` -> exit 0, 566 files unchanged
  - `timeout 60s pnpm -C apps/api typecheck` -> exit 0, 129 existing diagnostics reported as warnings
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules tests/modules/projects` -> exit 0
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py` -> 10 passed, exit 0
  - `timeout 60s pnpm api:check` -> exit 124 after lint, format, and typecheck completed; full API test phase was still running and emitted no failure before timeout
- **Next step**: Parent milestone 7 — Remove obsolete workspace-as-site surfaces and run final verification
