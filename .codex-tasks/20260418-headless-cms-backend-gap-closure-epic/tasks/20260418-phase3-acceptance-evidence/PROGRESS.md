# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-phase3-acceptance-evidence`
- **Task dir**: `.codex-tasks/20260418-headless-cms-backend-gap-closure-epic/tasks/20260418-phase3-acceptance-evidence/`
- **Spec**: `.codex-tasks/20260418-headless-cms-backend-gap-closure-epic/tasks/20260418-phase3-acceptance-evidence/SPEC.md`

## Context Recovery Block

- **Current milestone**: Phase complete
- **Current status**: DONE
- **Last completed**: Task 4 — Run quantitative validation and close phase
- **Current artifact**: `TODO.csv`
- **Key context**:
  - backend-only acceptance still lacks formal proof for coverage and latency gates.
  - This phase turns those gates into reproducible commands plus recorded artifacts.
- **Known issues**:
  - Quantitative commands must run serially because concurrent database initialization causes real contention failures.
- **Next action**: Hand phase results back to the parent epic and advance to release-readiness closeout.

## Milestone 1: Coverage Boundary Definition

- **Status**: DONE
- **Started**: 2026-04-18
- **Completed**: 2026-04-18
- **What was done**:
  - Defined the backend core-domain acceptance boundary as three focused groups: `api_keys`, `publish_releases`, and `delivery_graphql_resolve`.
  - Bound the phase to proof of the backend delivery plane instead of full-repo coverage.
  - Recorded the boundary in a dedicated evidence document under `docs/plans/2026-04-18-headless-cms-backend-gap-closure/`.

## Milestone 2: Focused Coverage Evidence

- **Status**: DONE
- **Started**: 2026-04-18
- **Completed**: 2026-04-18
- **What was done**:
  - Added focused unit coverage for GraphQL service and route resolve content service.
  - Re-ran the three focused coverage groups and stored JSON artifacts at `/tmp/arclayer-*.json`.
  - Raised the delivery, GraphQL, and resolve group from the prior failing state to the planned passing range.
- **Validation**:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_management_integration.py tests/modules/workspaces/test_workspace_api_keys_security_unit.py -x --cov-reset --cov=src/modules/workspaces/api_keys --cov-report=json:/tmp/arclayer-api-keys-coverage.json`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish/test_preview_contract_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py -x --cov-reset --cov=src/modules/workspaces/publish --cov=src/modules/workspaces/releases --cov-report=json:/tmp/arclayer-publish-coverage.json`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_delivery_integration.py tests/modules/sites/test_sites_graphql_integration.py tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/sites/test_sites_resolve_service_unit.py tests/modules/sites/test_sites_resolve_content_service_unit.py -x --cov-reset --cov=src/modules/sites/delivery --cov=src/modules/sites/graphql --cov=src/modules/sites/publishing/routes/resolve --cov-report=json:/tmp/arclayer-delivery-coverage.json`
- **Measured result**:
  - `api_keys`: `90.16%`
  - `publish_releases`: `92.41%`
  - `delivery_graphql_resolve`: `86.80%`
  - combined focused coverage: `88.68%`

## Milestone 3: Benchmark Evidence

- **Status**: DONE
- **Started**: 2026-04-18
- **Completed**: 2026-04-18
- **What was done**:
  - Reused the existing benchmark harness and re-ran it as the official Phase 3 latency proof.
  - Captured the current benchmark payload and compared it against the spec thresholds.
- **Validation**:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_benchmark_baselines_integration.py -x -s --no-cov`
- **Measured result**:
  - `pages.resolve` p95: `20.72 ms`
  - GraphQL public p95: `20.63 ms`
  - GraphQL with key p95: `23.78 ms`
  - auth overhead p95: `3.15 ms`

## Milestone 4: Serial Execution Constraint

- **Status**: DONE
- **Started**: 2026-04-18
- **Completed**: 2026-04-18
- **What was done**:
  - Reproduced real database contention failures when quantitative commands were executed in parallel.
  - Recorded those failure modes as an execution constraint instead of masking them with fallbacks.
- **Observed failures**:
  - `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`
  - `deadlock detected`
  - `relation "internal_permissions" does not exist`
- **Decision**:
  - Phase 3 quantitative validation is standardized on serial execution only.
