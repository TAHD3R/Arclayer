# F10: Environment System

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 环境系统
> Matrix category: completely missing
> Source audit anchors: sections 13.1 and 14.
> Default batch: 5
> Coupling: high

## Objective

Add Contentful-style environments and aliases so content models and content data can be isolated, promoted, and rolled back with minimal downtime.

## Context

- The audit identifies environments and aliases as missing.
- Arclayer has workspace, project, and site tenancy, but the audit does not identify a content environment layer.
- Contentful uses named environments and aliases such as `staging` pointing to `production`.

## Scope

- Define environment model ownership under workspace/project/site.
- Define alias records and resolution rules.
- Add environment-aware content model and content item access.
- Add clone, promote, and alias-switch operations.
- Integrate with transfer and schema sync where required.

## Exclusions

- Full visual deployment pipeline.
- Search reindex orchestration across all providers unless search integration is complete and included.
- Marketplace app environment behavior.

## Dependencies

- Should follow `f06-dynamic-schema-sync.md`.
- Should follow `f03-data-transfer-engine.md` for clone/export/import semantics.
- Informs future Content API cache and SDK behavior.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `docs/guidelines/backend-folder-architecture.md`
- Source audit section 13.1.

## Execution Instructions

1. Inspect tenancy models and content model ownership.
2. Define environment identity and alias resolution.
3. Decide how default environment maps to existing data.
4. Add migrations and backfill behavior.
5. Make all content model and content item queries environment-aware.
6. Add alias switching with explicit validation and audit logging.
7. Add tests for default environment, clone, alias switch, content isolation, and rollback.

## Acceptance Criteria

- Existing projects get a default environment without data loss.
- Content models and content items are isolated by environment.
- Aliases resolve deterministically and can be switched atomically.
- Content API and Admin API can target an environment or alias.

## Verification

- Run focused environment integration tests.
- Run migration tests.
- Run `pnpm api:check`.
- Run GitNexus `impact` on tenancy and content model symbols before editing, then `detect_changes`.

## Execution Log

- Status: verified
- Last updated: 2026-05-01
- Impact analysis:
  - GitNexus `impact` on `ProjectEnvironmentsService`: LOW risk; direct callers/importers include environment router and deployments service.
  - GitNexus `impact` on `ContentModelDefinitionRecord`: MEDIUM risk; direct importers include content models/items repositories, transfer service, and model tests.
  - GitNexus `impact` on `ContentItemRecord`: HIGH risk; direct importers include content item, publish, runtime, routing, transfer, and site delivery paths.
- Files changed:
  - `apps/api/src/models/projects/environment.py`
  - `apps/api/src/models/content/model_definition.py`
  - `apps/api/src/models/content/content_item.py`
  - `apps/api/src/models/content/route_binding.py`
  - `apps/api/src/migrations/0024_project_content_environments.py`
  - `apps/api/src/migrations/models/tenant_control.py`
  - `apps/api/src/modules/projects/environments/router.py`
  - `apps/api/src/modules/projects/environments/schema.py`
  - `apps/api/src/modules/projects/environments/service.py`
  - `apps/api/src/modules/projects/content/shared/router.py`
  - `apps/api/src/modules/projects/content/models/router.py`
  - `apps/api/src/modules/projects/content/models/repository.py`
  - `apps/api/src/modules/projects/content/models/canonical_service.py`
  - `apps/api/src/modules/projects/content/items/router.py`
  - `apps/api/src/modules/projects/content/items/repository.py`
  - `apps/api/src/modules/projects/content/items/read_service.py`
  - `apps/api/src/modules/projects/content/items/canonical_service.py`
  - `apps/api/src/modules/projects/content/history/service.py`
  - `apps/api/src/modules/projects/content/routing/router.py`
  - `apps/api/src/modules/projects/content/routing/service.py`
  - `apps/api/src/modules/projects/content/bindings/router.py`
  - `apps/api/src/modules/projects/content/presentations/router.py`
  - `apps/api/src/modules/projects/content/seo/router.py`
  - `apps/api/src/modules/projects/content/transfer/repository.py`
  - `apps/api/src/modules/projects/content/transfer/schema.py`
  - `apps/api/src/modules/projects/content/transfer/service.py`
  - `apps/api/src/modules/projects/publish/service.py`
  - `apps/api/src/modules/projects/deployments/service.py`
  - `apps/api/src/modules/sites/content_api/entries_router.py`
  - `apps/api/src/modules/sites/graphql/router.py`
  - `apps/api/src/modules/sites/graphql/schema.py`
  - `apps/api/src/modules/sites/graphql/service.py`
  - `apps/api/src/modules/sites/runtime/repository.py`
  - `apps/api/src/modules/sites/search/service.py`
  - `apps/api/src/core/api_generator/content_api.py`
  - `apps/api/src/core/entity_manager/manager.py`
  - `apps/api/tests/modules/projects/test_project_environments_integration.py`
  - `apps/api/tests/core/test_api_generator_content_api_unit.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_artifacts_unit.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_service_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
- Result:
  - Added default project environments (`development`, `staging`, `production`) plus a `master` alias targeting production.
  - Added environment alias switching with row-level locking and actor metadata.
  - Added environment-scoped content model, item, and route-binding uniqueness and tenant/public migration backfills.
  - Added environment-aware Admin content model/item/routing/read/write paths using `environment` and `environmentId` query targets.
  - Added Content API and GraphQL environment/alias resolution for runtime delivery reads.
  - Added clone and promote operations that copy schema, items, versions, route bindings, releases, and CMS runtime deployments between environments.
  - Added transfer export/import environment metadata support.
- Verification:
  - Fresh verification on 2026-05-01:
    - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q --no-cov -x --tb=short tests/modules/projects/test_project_environments_integration.py` passed: 3 passed.
    - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q --no-cov tests/modules/tenancy/test_tenant_migration_runner_unit.py tests/modules/projects/test_project_environments_integration.py tests/core/test_api_generator_content_api_unit.py tests/modules/workspaces/content/test_content_models_unit.py` passed: 47 passed.
    - `timeout 60s pnpm -C apps/api uv -- pytest -q --no-cov tests/modules/sites/test_sites_graphql_artifacts_unit.py::test_graphql_single_query_runtime_uses_generated_argument_name_without_exec tests/modules/sites/test_sites_graphql_service_unit.py::test_list_records_uses_query_plan_for_filter_sort_and_pagination tests/modules/sites/test_sites_graphql_service_unit.py::test_list_records_runs_graphql_query_post_processors` passed: 3 passed.
    - `pnpm api:check` passed: lint, format, typecheck, and test succeeded; API tests reported 626 passed, 198 skipped, 26 warnings.
    - GitNexus `detect_changes(scope="all")` returned 41 changed files, 203 changed symbols, 7 affected processes, and HIGH risk across expected F10 content model, content item, publish, runtime delivery, and environment flows.
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q --no-cov -x --tb=short tests/modules/projects/test_project_environments_integration.py::test_new_project_bootstraps_three_environments_and_lists_in_predictable_order` passed.
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q --no-cov -x --tb=short tests/modules/projects/test_project_environments_integration.py` passed: 3 passed.
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q --no-cov tests/modules/tenancy/test_tenant_migration_runner_unit.py tests/modules/projects/test_project_environments_integration.py tests/core/test_api_generator_content_api_unit.py tests/modules/workspaces/content/test_content_models_unit.py` passed: 47 passed.
  - `timeout 60s pnpm -C apps/api uv -- pytest -q --no-cov tests/modules/sites/test_sites_graphql_artifacts_unit.py::test_graphql_single_query_runtime_uses_generated_argument_name_without_exec tests/modules/sites/test_sites_graphql_service_unit.py::test_list_records_uses_query_plan_for_filter_sort_and_pagination tests/modules/sites/test_sites_graphql_service_unit.py::test_list_records_runs_graphql_query_post_processors` passed: 3 passed.
  - `pnpm api:check` passed: lint, format, typecheck, and test succeeded; API tests reported 626 passed, 198 skipped, 26 warnings.
