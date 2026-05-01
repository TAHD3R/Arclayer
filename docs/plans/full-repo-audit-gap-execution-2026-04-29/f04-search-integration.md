# F04: Search Integration

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 搜索集成
> Matrix category: completely missing
> Source audit anchors: sections 3.3, 11, 14, 15.
> Default batch: 5
> Coupling: medium

## Objective

Add a real search infrastructure layer for content search, with explicit indexing, query semantics, permissions, and operational behavior.

## Context

- The audit records no confirmed application-level Meilisearch, pgvector search, Elasticsearch, Algolia, or Typesense integration.
- Dev infrastructure already declares a Meilisearch service and enables pgvector for Postgres initialization. F04 must decide whether to use those existing infrastructure choices or replace them through an explicit backend-selection note.
- Existing search is query-parameter filtering, not a dedicated search engine.
- Contentful provides a managed full-text `query` capability.

## Scope

- Select a search backend after research and repo constraints review.
- Define indexing ownership for content models and content items.
- Add indexing jobs or event subscribers tied to content publish/update/delete.
- Expose Content API search query semantics.
- Enforce field visibility and permission constraints in search results.

## Exclusions

- Correcting stale docs. That belongs to `d02-search-audit-correction.md`.
- Vector search unless selected explicitly by the research and product decision.
- Replacing current structured filters.

## Dependencies

- Requires `d02-search-audit-correction.md`.
- Benefits from `f01-content-delivery-api.md`.
- Benefits from `f02-plugin-startup-integration.md` if search indexing uses lifecycle hooks.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `docs/guidelines/backend-endpoint-contract.md`
- Source audit sections 3.3 and 11.
- A research artifact comparing search backend options must be created before implementation.

## Execution Instructions

1. Research candidate search backends and write a task research artifact.
2. Choose one backend and document why it fits Arclayer's runtime and deployment model.
3. Define index schema per content model and locale.
4. Add indexing lifecycle for publish, unpublish, update, delete, and schema changes.
5. Add Content API query contract for full-text search.
6. Apply field visibility, locale, project, and permission constraints.
7. Add tests for indexing, search query, stale document removal, and permission filtering.

## Acceptance Criteria

- A real search backend is integrated through a clear adapter boundary.
- Published content can be searched through the intended API.
- Search results respect project/site/locale/visibility constraints.
- Operational setup is documented.

## Verification

- Run focused search tests with the configured test backend.
- Run `pnpm api:check`.
- Run GitNexus `impact` on content lifecycle and query symbols before editing, then `detect_changes` before commit.

## Execution Log

- Status: verified
- Last updated: 2026-05-01
- Files changed:
  - `apps/api/src/config.py`
  - `apps/api/src/core/runtime_init.py`
  - `apps/api/src/modules/projects/content/items/router.py`
  - `apps/api/src/modules/sites/content_api/router.py`
  - `apps/api/src/modules/sites/search/backend.py`
  - `apps/api/src/modules/sites/search/deps.py`
  - `apps/api/src/modules/sites/search/router.py`
  - `apps/api/src/modules/sites/search/runtime.py`
  - `apps/api/src/modules/sites/search/schema.py`
  - `apps/api/src/modules/sites/search/service.py`
  - `apps/api/tests/modules/sites/test_sites_search_route_unit.py`
  - `apps/api/tests/modules/sites/test_sites_search_unit.py`
  - `apps/api/tests/modules/system/test_settings.py`
  - `docs/guidelines/README.md`
  - `docs/guidelines/search-integration.md`
  - `docs/plans/full-repo-audit-gap-execution-2026-04-29/research/search-backend-options.md`
- Research:
  - Created `research/search-backend-options.md`.
  - Selected Meilisearch because the repo already declares a Meilisearch service, `httpx` is already available in the API package, and self-hosted deployments avoid adding a SaaS-only dependency.
  - Deferred pgvector to future semantic search because the repo currently has Postgres extension bootstrap without an embedding pipeline or vector query path.
- Implementation notes:
  - Added `SearchSettings` with disabled-by-default search, Meilisearch production backend settings, and explicit `memory` test backend selection.
  - Added `ContentSearchBackend` with disabled, memory, and Meilisearch adapters.
  - Added `/content-api/v1/runtimes/{runtime_id}/search?q=...&modelKey=...&locale=...` for published Content API search.
  - Reused published Content API read authorization and rate limiting for search queries.
  - Built indexed documents from delivery-shaped `StructuredContentRecord` values so hidden fields and password fields are excluded before indexing.
  - Added release publish/rollback reindex subscribers, content publish reindex calls, content unpublish/delete stale document removal, and lifecycle `AFTER_DELETE` removal.
  - Documented runtime settings, index shape, query contract, and lifecycle behavior in `docs/guidelines/search-integration.md`.
- GitNexus impact before editing:
  - `Settings` in `apps/api/src/config.py`: HIGH; mitigated by disabled-by-default search settings with compatible defaults.
  - `init_domain_runtime`: LOW.
  - `ContentApiGeneratedController`: MEDIUM.
  - `ContentDeliveryServiceBinding`: LOW.
  - `ProjectContentCanonicalItemsService`: HIGH; avoided internal service mutation and wired explicit router-level search operations.
- Verification:
  - `rtk pnpm -C apps/api uv -- ruff format src/config.py src/core/runtime_init.py src/modules/projects/content/items/router.py src/modules/sites/content_api/router.py src/modules/sites/search tests/modules/sites/test_sites_search_unit.py tests/modules/sites/test_sites_search_route_unit.py tests/modules/system/test_settings.py`
  - `rtk pnpm -C apps/api uv -- ruff check src/config.py src/core/runtime_init.py src/modules/projects/content/items/router.py src/modules/sites/content_api/router.py src/modules/sites/search tests/modules/sites/test_sites_search_unit.py tests/modules/sites/test_sites_search_route_unit.py tests/modules/system/test_settings.py`
  - `rtk proxy timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_search_unit.py tests/modules/sites/test_sites_search_route_unit.py tests/modules/system/test_settings.py` -> 7 passed.
  - `rtk pnpm api:check` -> lint, format, typecheck, and API test suite passed; pytest result was 622 passed, 197 skipped, 26 warnings in 133.36s.
- GitNexus change detection:
  - `scope=all` after implementation: changed_count 22, changed_files 7, risk_level low, affected_processes none.
  - `scope=staged` before commit: changed_count 33, changed_files 18, risk_level low, affected_processes none.
