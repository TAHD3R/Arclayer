# F01: Content Delivery API

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: Content Delivery API
> Matrix category: completely missing
> Source audit anchors: sections 3.1, 4.2, 14, 15.
> Default batch: 1
> Coupling: high

## Objective

Create an independent, content-facing API for published and preview content, with authentication and rate limiting separated from Admin API authentication.

## Context

- Content API is absent in the audit matrix.
- `apps/api/src/modules/auth/content_api/` is empty.
- The current API surface shares `/api/v1/` and Admin authentication conventions.

## Scope

- Add Content Delivery API route surface after `d01-api-architecture-separation.md`.
- Add content API token model or integrate with the existing project-level token model using a distinct token type and scope.
- Add read-only published content endpoints.
- Add preview access with a distinct preview token or explicit preview scope.
- Add route-level rate limiting for content API tokens.
- Add tests for public reads, preview reads, auth failures, scope failures, and rate-limit behavior.

## Exclusions

- Generated REST endpoints for every content type. That belongs to `f07-api-auto-generation.md`.
- Full CDN integration.
- Search and Images API query semantics.
- Environment aliases.

## Dependencies

- Requires `d01-api-architecture-separation.md`.
- Benefits from `f02-plugin-startup-integration.md` if plugins register delivery routes or policies.
- Informs `f07-api-auto-generation.md`, `f04-search-integration.md`, and `f09-images-api.md`.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `docs/guidelines/backend-endpoint-contract.md`
- `docs/guidelines/backend-folder-architecture.md`
- Source audit sections 3.1 and 4.2.

## Execution Instructions

1. Confirm the canonical API boundary from D01.
2. Inspect current content item, version, site, project, and preview-token models.
3. Design the minimum Content API contract:
   - project/site selection
   - content type selection
   - published item reads
   - preview item reads
   - locale handling
   - pagination and filtering
4. Implement explicit token validation with delivery and preview scopes.
5. Ensure Admin session auth and Content API token auth are separate dependencies.
6. Add rate-limiting hooks using existing security middleware or an explicit content-api limiter.
7. Add integration tests that exercise the route as an external content consumer.
8. Update SDK plans only after route contract is stable.

## Acceptance Criteria

- Published content can be read through the Content API using a delivery credential.
- Preview content requires a preview credential or explicit preview scope.
- Admin session credentials do not define Content API access.
- Content API failures return explicit typed errors.
- Route naming, auth, and rate limiting are documented.

## Verification

- Run focused API integration tests for Content API auth and reads.
- Run `pnpm api:check`.
- Run GitNexus `impact` before editing auth/router symbols and `detect_changes` before commit.

## Execution Log

- Status: verified
- Last updated: 2026-04-30
- Route contract:
  - Content API remains under `/content-api/v1`.
  - Structured entries are exposed at `/content-api/v1/runtimes/{runtime_id}/content/{model_key}` and `/content-api/v1/runtimes/{runtime_id}/content/{model_key}/{entry_id}`.
  - GraphQL delivery remains at `/content-api/v1/runtimes/{runtime_id}/graphql`.
  - Published reads accept no credential or a published delivery key. Preview reads require a preview delivery key or preview token.
  - Content API delivery keys use `x-api-key` or `Authorization: Bearer <delivery-key>`; Admin session tokens are rejected by Content API auth.
  - Content API and GraphQL delivery reads use tenant database routing from the runtime context before reading content records.
  - Content API REST and GraphQL delivery routes share the explicit `CONTENT_API_RATE_LIMITED` route-level limiter.
- Files changed:
  - `apps/api/src/core/exceptions/__init__.py`
  - `apps/api/src/modules/sites/content_api/router.py`
  - `apps/api/src/modules/sites/content_api/entries_router.py`
  - `apps/api/src/modules/sites/content_api/rate_limit.py`
  - `apps/api/src/modules/sites/content_api/schema.py`
  - `apps/api/src/modules/sites/graphql/router.py`
  - `apps/api/src/modules/sites/graphql/service.py`
  - `apps/api/tests/modules/sites/test_sites_benchmark_baselines_integration.py`
  - `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`
  - `apps/api/tests/modules/sites/test_sites_content_api_integration.py`
  - `apps/api/tests/modules/sites/test_sites_delivery_integration.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_integration.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_service_unit.py`
  - `.trellis/spec/api/backend/content-delivery-api.md`
  - `.trellis/spec/api/backend/index.md`
- Verification:
  - `rtk pnpm -C apps/api lint` passed; ruff fixed import ordering automatically.
  - `rtk timeout 60s pnpm -C apps/api typecheck` passed with existing warnings.
  - `rtk timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_content_api_integration.py tests/modules/sites/test_sites_graphql_integration.py tests/modules/sites/test_sites_graphql_service_unit.py` passed: 33 passed.
  - `rtk timeout 60s pnpm api:check` reached the 60s timeout after lint passed, format left 739 files unchanged, typecheck completed with 226 existing diagnostics, and the test task had started.
  - `rtk git diff --check` passed.
  - GitNexus `detect_changes(scope="all")` reported low risk: 18 changed indexed symbols, 10 changed indexed files, 0 affected processes.
  - GitNexus `detect_changes(scope="staged")` reported low risk: 42 changed indexed symbols/sections, 21 changed files, 0 affected processes.
- Review notes:
  - Added shared route-level Content API limiter for both REST entries and GraphQL delivery.
  - Added focused GraphQL route-limit coverage.
  - GitNexus impact was run for `ContentApiAuthService`, `get_optional_runtime_delivery_credential`, `SiteGraphQLService.list_records`, `register_routes`, `TooManyRequests`, `_create_content_model`, `_record_matches_all`, `build_graphql_context`, and `SiteGraphQLContext`; high-risk router/export paths were kept to the existing Content API include surface and exception re-export.
