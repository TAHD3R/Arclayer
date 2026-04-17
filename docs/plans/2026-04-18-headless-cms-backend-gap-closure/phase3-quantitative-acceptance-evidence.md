# Phase 3 Quantitative Acceptance Evidence

Date: 2026-04-18
Scope: backend-only Headless CMS core-domain acceptance proof
Epic: `.codex-tasks/20260418-headless-cms-backend-gap-closure-epic/`

## Acceptance Outcome

- Core-domain focused coverage passed the planned threshold.
- Benchmark latency passed the planned threshold.
- Quantitative evidence is reproducible with serial execution.

## Core-Domain Coverage Boundary

The Phase 3 boundary is defined as three focused backend groups:

1. `src/modules/workspaces/api_keys`
2. `src/modules/workspaces/publish` + `src/modules/workspaces/releases`
3. `src/modules/sites/delivery` + `src/modules/sites/graphql` + `src/modules/sites/publishing/routes/resolve`

This boundary matches the v1 backend and SDK delivery surface:

- key-based delivery access
- publish and release delivery plane
- delivery resolve and GraphQL delivery contracts

## Focused Coverage Commands

### API keys

```bash
timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 \
  pnpm -C apps/api uv -- pytest -q \
  tests/modules/workspaces/test_workspace_api_keys_management_integration.py \
  tests/modules/workspaces/test_workspace_api_keys_security_unit.py \
  -x --cov-reset --cov=src/modules/workspaces/api_keys \
  --cov-report=json:/tmp/arclayer-api-keys-coverage.json
```

Result:

- statements: `386`
- covered: `348`
- missing: `38`
- coverage: `90.16%`

### Publish and releases

```bash
timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 \
  pnpm -C apps/api uv -- pytest -q \
  tests/modules/workspaces/publish/test_preview_contract_integration.py \
  tests/modules/workspaces/publish/test_publish_releases_integration.py \
  -x --cov-reset --cov=src/modules/workspaces/publish \
  --cov=src/modules/workspaces/releases \
  --cov-report=json:/tmp/arclayer-publish-coverage.json
```

Result:

- statements: `448`
- covered: `414`
- missing: `34`
- coverage: `92.41%`

### Delivery, GraphQL, resolve

```bash
timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 \
  pnpm -C apps/api uv -- pytest -q \
  tests/modules/sites/test_sites_delivery_integration.py \
  tests/modules/sites/test_sites_graphql_integration.py \
  tests/modules/sites/test_sites_graphql_service_unit.py \
  tests/modules/sites/test_sites_resolve_service_unit.py \
  tests/modules/sites/test_sites_resolve_content_service_unit.py \
  -x --cov-reset --cov=src/modules/sites/delivery \
  --cov=src/modules/sites/graphql \
  --cov=src/modules/sites/publishing/routes/resolve \
  --cov-report=json:/tmp/arclayer-delivery-coverage.json
```

Result:

- statements: `1189`
- covered: `1032`
- missing: `157`
- coverage: `86.80%`

### Combined core-domain result

- statements: `2023`
- covered: `1794`
- missing: `229`
- combined coverage: `88.68%`

## Benchmark Command

```bash
timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 \
  pnpm -C apps/api uv -- pytest -q \
  tests/modules/sites/test_sites_benchmark_baselines_integration.py \
  -x -s --no-cov
```

Observed benchmark payload:

```json
{
  "auth_overhead_p95_ms": 3.15,
  "graphql_public": {
    "count": 20.0,
    "max_ms": 21.84,
    "mean_ms": 19.66,
    "min_ms": 18.54,
    "p95_ms": 20.63
  },
  "graphql_with_key": {
    "count": 20.0,
    "max_ms": 24.83,
    "mean_ms": 22.66,
    "min_ms": 21.66,
    "p95_ms": 23.78
  },
  "pages_resolve": {
    "count": 20.0,
    "max_ms": 23.26,
    "mean_ms": 18.61,
    "min_ms": 17.09,
    "p95_ms": 20.72
  },
  "requests_per_case": 20,
  "warmup_requests": 5
}
```

Threshold comparison:

- `pages.resolve` p95 `20.72 ms` against threshold `< 200 ms`
- GraphQL public p95 `20.63 ms` against threshold `< 300 ms`
- API key auth overhead p95 `3.15 ms` against threshold `< 20 ms`

## Execution Constraint

Focused validation commands must run serially.

Observed repo-truth failures during parallel execution:

- `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` during concurrent schema generation
- `deadlock detected` during workspace bootstrap and benchmark setup
- `relation "internal_permissions" does not exist` when benchmark startup raced schema initialization

This phase therefore standardizes serial execution for quantitative evidence commands.

## Phase 3 Completion Decision

Phase 3 is complete with evidence-backed acceptance:

- coverage threshold met
- benchmark threshold met
- reproducible command set recorded
- serial execution constraint documented
