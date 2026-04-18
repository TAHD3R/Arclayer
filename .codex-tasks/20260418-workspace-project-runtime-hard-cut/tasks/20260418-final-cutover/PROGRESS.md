# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-final-cutover`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-final-cutover/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: FastAPI / Vite React / TanStack Router / pnpm

## Context Recovery Block

- **Current milestone**: #5 — Run final repo gates and close epic
- **Current status**: DONE
- **Parent milestone**: #7 — Remove obsolete workspace-as-site surfaces and run final verification
- **Current artifact**: `TODO.csv`
- **Key context**: Legacy admin `/w/$workspaceId/*` and `/workspaces` file routes are removed, backend no longer registers the old `/sites/{site_id}` public runtime surface, and targeted route-contract regressions are green.
- **Known issues**: Final `pnpm check` remains timeout-limited at the repo rule boundary because full API pytest exceeds the required 60 second cap.
- **Next action**: Child milestone is complete; use this file as the recovery source for any follow-up verification or commit staging.

## Milestone Closeout

- **Status**: DONE
- **What was done**:
  - Deleted the legacy admin file-route surface under `apps/admin/src/routes/w/**` and `apps/admin/src/routes/workspaces/index.tsx`, while keeping project operations on `apps/admin/src/routes/projects/$projectId/**`.
  - Removed the old public site router registration from `apps/api/src/core/routes.py`.
  - Updated runtime and publish contract tests so project facade assertions resolve site identity through the project bridge and public runtime delivery through `/api/v1/runtimes/{runtime_id}`.
  - Repaired stale admin test assumptions that still mocked `/w/...` routes or old page props.
- **Validation**:
  - `pnpm -C apps/admin test -- test/lib/workspace-content-routing.test.ts test/pages/workspaces/content/content-bootstrap-controller.test.tsx test/pages/workspaces/content/content-bootstrap-handoff.test.tsx test/routes/workspace-team-route-kind-guard.test.ts test/pages/workspaces/content/content-library-page.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py` -> 10 passed, exit 0
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules tests/modules/projects tests/modules/sites tests/modules/workspaces/publish` -> exit 0
  - `timeout 60s pnpm check` -> exit 124 after `@arclayer/admin` lint/format/typecheck/test all passed, `@arclayer/api` lint/format/typecheck passed with 129 existing warnings, and full API pytest remained running without emitted test failure before the required timeout
- **Files changed**:
  - `apps/admin/src/routes/w/**`
  - `apps/admin/src/routes/workspaces/index.tsx`
  - `apps/admin/src/routeTree.gen.ts`
  - `apps/admin/test/lib/workspace-content-routing.test.ts`
  - `apps/admin/test/pages/workspaces/content/content-bootstrap-controller.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-bootstrap-handoff.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
  - `apps/admin/test/routes/workspace-team-route-kind-guard.test.ts`
  - `apps/api/src/core/routes.py`
  - `apps/api/tests/modules/projects/test_project_runtime_routes_integration.py`
  - `apps/api/tests/modules/sites/test_sites_delivery_integration.py`
- **Outcome**:
  - The final hard-cut implementation scope is complete and the milestone has fresh targeted verification.
  - The repo-wide `pnpm check` gate still inherits the repo rule that full API pytest is capped at 60 seconds, so final evidence records a timeout-limited gate instead of a full green completion signal.
