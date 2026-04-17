# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-phase6-operational-readiness`
- **Task dir**: `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/tasks/20260417-phase6-operational-readiness/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-backend-sdk-v1-spec.md`
- **Plan**: `TODO.csv`
- **Environment**: Python / FastAPI / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: Phase 6 closed
- **Current status**: DONE
- **Last completed**: Phase 5 — Official SDKs
- **Current artifact**: `TODO.csv`
- **Key context**: Structured logs and audit hooks are implemented for API key lifecycle, release publish/rollback, delivery resolve, and GraphQL access. A repeatable benchmark harness now exists for delivery resolve, GraphQL read, and key-auth overhead.
- **Known issues**: `pnpm api:check` is green. Typecheck still reports 122 existing warnings in the API package.
- **Next action**: Commit Phase 6 and close the backend+SDK v1 epic.

---

## Implementation Log

### Observability Surface Audit

- Confirmed repo truth already propagates request `trace_id` through `asgi-correlation-id` and `structlog`.
- Identified missing explicit audit/structured-log coverage on:
  - personal/workspace API key lifecycle actions
  - release publish/rollback actions
  - delivery REST page resolve / by-id reads
  - GraphQL access grants
- Decided to keep the Phase 6 scope on the approved slice and avoid introducing broader auth or delivery feature changes.

### Code Changes

- Added structured lifecycle logs to `WorkspaceApiKeysService` for create, revoke, and rotate on personal and workspace keys.
- Added router-level audit event publication for:
  - `me.api_key.created`
  - `me.api_key.revoked`
  - `me.api_key.rotated`
  - `workspace.api_key.created`
  - `workspace.api_key.revoked`
  - `workspace.api_key.rotated`
- Added structured publish / rollback logs plus router-level audit events for:
  - `workspace.release.published`
  - `workspace.release.rolled_back`
- Added delivery REST structured logs for successful and failed `pages.resolve` and `pages.byId`.
- Added GraphQL access logs with `access_mode`, `delivery_key_id`, `delivery_key_perspective`, `graphql_read`, `perspective`, and `site_id`.

### Verification

- Passed: `pnpm -C apps/api uv -- python -m compileall src/modules/workspaces/api_keys src/modules/workspaces/releases src/modules/sites/delivery src/modules/sites/graphql tests/modules/sites/test_sites_benchmark_baselines_integration.py`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_management_integration.py -x`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish/test_publish_releases_integration.py -x`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_delivery_integration.py tests/modules/sites/test_sites_graphql_integration.py -x`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_benchmark_baselines_integration.py -x -s --no-cov`
- Passed: `pnpm -C packages/openapi generate`
- Passed: `pnpm --filter @arclayer/management-sdk typecheck`
- Passed: `pnpm --filter @arclayer/management-sdk test`
- Passed: `pnpm --filter @arclayer/delivery-sdk typecheck`
- Passed: `pnpm --filter @arclayer/delivery-sdk test`
- Passed: `pnpm api:check`
- Passed: `pnpm -C packages/openapi generate`
- Passed: `pnpm --filter @arclayer/management-sdk test`
- Passed: `pnpm --filter @arclayer/delivery-sdk test`

### Benchmark Results

- Recorded under `docs/plans/2026-04-17-headless-cms-backend-sdk-v1/benchmark-baselines.md`
- `pages.resolve` p95: `20.66 ms`
- GraphQL public single-query p95: `21.48 ms`
- GraphQL published-key single-query p95: `28.42 ms`
- key-auth overhead p95: `6.94 ms`

### Final Gate

- `pnpm api:check` passed with `309 passed, 117 skipped, 32 warnings`.
- Typecheck completed with 122 existing warnings.
- `pnpm -C packages/openapi generate` completed successfully.
- `pnpm --filter @arclayer/management-sdk test` passed with `1` test file and `2` tests.
- `pnpm --filter @arclayer/delivery-sdk test` passed with `1` test file and `5` tests.

### MCP Closeout Review

- `code-review-graph get_minimal_context` and `detect_changes` reported high breadth risk (`0.80`) across config, workspace setup, delivery, GraphQL, API key, release, and test surfaces.
- CRG review priorities were checked against the changed code: `OrganizationWorkspaceService.create_workspace`, `InstanceSetupService.count_super_admins`, delivery handlers, GraphQL access, API key lifecycle, and release publish/rollback.
- `serena` symbol review checked API key event publication, release event publication, GraphQL `resolve_query_access`, delivery page handlers, setup DB-disabled behavior, workspace creation, and database settings.
- No blocker was found in the reviewed Phase 6 code paths.
