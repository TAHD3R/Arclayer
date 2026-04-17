# Headless CMS V1 Benchmark Baselines

日期：2026-04-17
范围：Phase 6 `Operational readiness`
状态：Captured and final gate verified

## Methodology

- Harness：`apps/api/tests/modules/sites/test_sites_benchmark_baselines_integration.py`
- Runtime：FastAPI app through `httpx.ASGITransport`, integration Postgres fixture, integration Valkey fixture
- Dataset：single published dynamic page route `/benchmark/:slug` bound to one published `article` record
- Warmup：`5` requests per scenario
- Measured samples：`20` requests per scenario
- Perspective：
  - delivery REST: `published`
  - GraphQL: `PUBLISHED`
- Key auth overhead definition：`GraphQL with published delivery key p95 - GraphQL public p95`

## Command

```bash
timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_benchmark_baselines_integration.py -x -s --no-cov
```

## Results

| Scenario | p95 | mean | max | Gate |
| --- | --- | --- | --- | --- |
| `pages.resolve` | `20.66 ms` | `19.35 ms` | `20.77 ms` | `< 200 ms` |
| `GraphQL` single query, public | `21.48 ms` | `19.51 ms` | `21.69 ms` | `< 300 ms` |
| `GraphQL` single query, published delivery key | `28.42 ms` | `25.36 ms` | `28.57 ms` | support metric |
| key auth overhead p95 | `6.94 ms` | n/a | n/a | `< 20 ms` |

Raw benchmark payload:

```json
{
  "auth_overhead_p95_ms": 6.94,
  "graphql_public": {
    "count": 20.0,
    "max_ms": 21.69,
    "mean_ms": 19.51,
    "min_ms": 18.03,
    "p95_ms": 21.48
  },
  "graphql_with_key": {
    "count": 20.0,
    "max_ms": 28.57,
    "mean_ms": 25.36,
    "min_ms": 23.06,
    "p95_ms": 28.42
  },
  "pages_resolve": {
    "count": 20.0,
    "max_ms": 20.77,
    "mean_ms": 19.35,
    "min_ms": 18.24,
    "p95_ms": 20.66
  },
  "requests_per_case": 20,
  "warmup_requests": 5
}
```

## Interpretation

- `pages.resolve` is well inside the `200 ms` ceiling with a `20.66 ms` p95.
- GraphQL single-query read is well inside the `300 ms` ceiling with a `21.48 ms` p95.
- Delivery-key authentication adds `6.94 ms` at p95 on the measured GraphQL read path.
- The benchmark route exercises the same page binding and server-side flattening contracts shipped in Phases 3 and 4.

## Validation Status

Readiness validation passed:

- `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_management_integration.py -x`
- `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish/test_publish_releases_integration.py -x`
- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_delivery_integration.py tests/modules/sites/test_sites_graphql_integration.py -x`
- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_benchmark_baselines_integration.py -x -s --no-cov`
- `pnpm -C packages/openapi generate`
- `pnpm --filter @arclayer/management-sdk typecheck`
- `pnpm --filter @arclayer/management-sdk test`
- `pnpm --filter @arclayer/delivery-sdk typecheck`
- `pnpm --filter @arclayer/delivery-sdk test`
- `pnpm api:check`
