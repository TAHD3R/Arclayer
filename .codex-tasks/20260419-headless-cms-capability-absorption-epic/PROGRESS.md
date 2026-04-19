# Progress Log

---

## Session Start

- **Date**: 2026-04-19
- **Task name**: `20260419-headless-cms-capability-absorption-epic`
- **Task dir**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/`
- **Specs**:
  - `docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md`
  - `docs/plans/2026-04-18-headless-cms-commercial-gap-analysis.md`
- **Plan**: `docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md`
- **Environment**: Python / FastAPI / React / Vite / Plate / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

**Current milestone**: Milestone 7 — execute Epic 5 Editorial Workflow and Release Orchestration
- **Current status**: DONE
- **Last completed**: Epic5 complete
- **Current artifact**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic5-editorial-workflow-and-release-orchestration/TODO.csv`
- **Key context**:
  - Epic 0 is complete and its baseline docs now live under `docs/plan`.
  - Epic 1 is complete and its dependency on Epic 0 is satisfied.
  - Epic 1 now covers contract registry, schema change plan, and the Models governance operator workflow.
  - Epic 2 runtime slices are complete and the closure pass added workspace primary project hydration plus full `/api/v1/sites` route registration.
  - Epic 2 final backend aggregate verification is green with `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/workspaces/publish tests/modules/sites`.
  - Epic 3 is complete across backend permission core, action catalog, governance UI, GraphQL query sanitization, system managed payload enforcement, frontend permission consumption, Assets gating, and release/routing action catalog closure.
  - Epic3 backend fresh focused verification is green with `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_permission_policy_service_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/sites/test_sites_graphql_service_unit.py` and 40 tests passed.
  - Epic3 admin fresh focused verification is green with `timeout 60s pnpm -C apps/admin exec vitest run test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx test/pages/workspaces/content/content-library-row-actions.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/workspaces/assets/assets-page-view.test.tsx test/pages/workspaces/assets/assets-view-overlays.test.tsx test/pages/workspaces/assets/asset-preview-dialog.test.tsx` and 83 tests passed.
  - Epic4 has started with a schema builder/artifact slice: `sites/graphql/registry.py` now formalizes built-in model query contracts, and the committed GraphQL manifest is registry-backed.
  - Epic4 now also has a dedicated query runtime slice: `sites/graphql/planner.py` formalizes `GraphQLQueryPlan`, built-in query rules, and bounded pagination, while `SiteGraphQLService.list_records` executes that plan.
  - Epic4 also has explicit hook and subscription contracts in `sites/graphql/hooks.py` and `sites/graphql/subscriptions.py`, and the committed manifest now publishes hook/subscription metadata for future SDK and frontend consumers.
  - Epic4 fresh focused verification is green with `pnpm -C apps/api graphql:schema:verify` and `pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/sites/test_sites_graphql_artifacts_unit.py tests/modules/sites/test_sites_graphql_subscriptions_unit.py`, covering 31 tests.
  - Epic4 delivery SDK manifest helper slice is complete with `packages/delivery-sdk/src/graphql-manifest.ts`, and SDK verification is green with `pnpm --filter @arclayer/delivery-sdk test` plus `pnpm --filter @arclayer/delivery-sdk typecheck`.
  - The SDK REST client now calls the current generated runtime delivery OpenAPI functions while preserving its existing `siteId` external input contract.
  - Epic4 is now complete: frontend/shared query input helpers also landed in `packages/delivery-sdk/src/graphql-query-input.ts`, backend focused verification passed with 33 tests, and SDK focused verification passed with 9 tests plus typecheck.
  - Epic5 is now complete: backend workflow enums and content plus release metadata are live, content item workflow projection and workflow patch API are live, publish gates now honor workflow stage readiness, and release dry-run plus readiness summary plus lineage contracts are live.
  - Epic5 admin workflow consumption is also live: Content Library columns render workflow status, article editor exposes the workflow lane and runtime refresh, and Release Center ships with readiness, blocker, lineage, publish, and rollback UI.
  - Epic5 backend focused verification passed with `env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish tests/modules/workspaces/releases`.
  - Epic5 admin focused verification passed with `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx` plus `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-runtime.test.ts`.
- **Known issues**:
  - `pnpm -C apps/admin typecheck` remains blocked by pre-existing repo errors outside the Epic5 slice, including localization options, workspace list items, workspace basics localization, roles view, asset preview dialog, and older test fixtures.
- **Next action**: Proceed to Epic 6 Automation Flows and Operations Platform.

---

## Milestone 1: Scaffold child epic task artifacts

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Created the parent epic files under `.codex-tasks/20260419-headless-cms-capability-absorption-epic/`.
  - Created one child task directory per epic with `SPEC.md`, `TODO.csv`, and `PROGRESS.md`.
  - Created the docs index at `docs/plan/headless-cms-capability-absorption-task-index.md`.
- **Validation**: `find .codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks -maxdepth 2 -type f | sort` → exit 0
- **Files changed**:
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/EPIC.md`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/SUBTASKS.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/PROGRESS.md`
  - `docs/plan/headless-cms-capability-absorption-task-index.md`
- **Next step**: Milestone 2 — execute Epic 0 Program Setup

---

## Milestone 2: Execute Epic 0 Program Setup

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Executed child task `20260419-epic0-program-setup`.
  - Created `docs/plan/2026-04-19-headless-cms-platform-object-dictionary.md`.
  - Created `docs/plan/2026-04-19-headless-cms-reference-capability-matrix.md`.
  - Created `docs/plan/2026-04-19-headless-cms-validation-baseline.md`.
  - Updated the docs index with the new Epic 0 baseline deliverables section.
- **Validation**:
  - `test -f docs/plan/2026-04-19-headless-cms-platform-object-dictionary.md && test -f docs/plan/2026-04-19-headless-cms-reference-capability-matrix.md && test -f docs/plan/2026-04-19-headless-cms-validation-baseline.md && echo OK` → `OK`
  - `rg -n "平台对象|参考能力映射矩阵|focused checks|admin focused checks|editor focused checks" docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md` → exit 0
- **Files changed**:
  - `docs/plan/2026-04-19-headless-cms-platform-object-dictionary.md`
  - `docs/plan/2026-04-19-headless-cms-reference-capability-matrix.md`
  - `docs/plan/2026-04-19-headless-cms-validation-baseline.md`
  - `docs/plan/headless-cms-capability-absorption-task-index.md`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic0-program-setup/TODO.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic0-program-setup/PROGRESS.md`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/SUBTASKS.csv`
- **Next step**: Milestone 3 — wait for Epic 1 execution

---

## Milestone 3: Execute Epic 1 Model Lifecycle Platform

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Switched child task `20260419-epic1-model-lifecycle-platform` to active execution.
  - Completed the first Epic1 slice: `model contract registry 2.0`.
  - Added formal registry DTOs to backend content model contracts and regenerated OpenAPI types.
  - Upgraded the Admin `Models` surface from a protocol canvas shell into a governance console with system/custom/workflow/delivery/graphql sections.
  - Completed the second Epic1 slice: formal schema change plan artifacts with revision snapshots, diff entries, and apply gates.
  - Extended the Admin `Models` inspector to show revision path, apply gates, and schema diff entries from the same preview response.
  - Completed the third Epic1 slice: revision compare, stale preview warning, unsaved switch guard, discard flow, and apply confirmation inside the existing governance console.
  - Added a dedicated admin governance query key helper and stabilized the model list button accessibility contract for focused operator tests.
- **Validation**:
  - `pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_content_contracts_unit.py tests/modules/workspaces/content/test_content_models_unit.py` → passed
  - `pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_content_contracts_unit.py tests/modules/workspaces/content/test_content_models_unit.py tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py tests/modules/workspaces/content/test_content_models_integration.py` → passed with integration slices skipped by the repo's `integration tests disabled` gate
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-models-control-center.test.tsx` → passed
  - `pnpm -C apps/api openapi:sync` → passed
  - `pnpm -C apps/admin typecheck` → blocked by pre-existing repo errors outside Epic1 scope
- **Files changed**:
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic1-model-lifecycle-platform/TODO.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic1-model-lifecycle-platform/PROGRESS.md`
  - `apps/api/src/modules/workspaces/content/contracts/schema.py`
  - `apps/api/src/modules/workspaces/content/models/canonical_service.py`
  - `apps/api/src/modules/workspaces/content/models/router.py`
  - `apps/api/src/modules/workspaces/content/models/domain_helpers.py`
  - `apps/admin/src/api/content.ts`
  - `apps/admin/src/pages/workspaces/content/models/page.tsx`
  - `apps/admin/src/types/api/content.ts`
  - `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`
  - `apps/api/tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py`
  - `apps/api/tests/modules/workspaces/test_workspace_content_contracts_unit.py`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
  - `packages/openapi/src/generated/types.gen.ts`
- **Next step**: Recover Epic 2 child truth before coding.

---

## Milestone 4: Execute Epic 2 Document Runtime Platform

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Activated child task `20260419-epic2-document-runtime-platform`.
  - Recovered live Epic2 scope from the implementation plan section covering Module 2A through 2G.
  - Mapped current backend runtime entry points across `content/items`, `workspaces/publish`, `sites/publishing`, and `sites/graphql`.
  - Mapped current frontend consumer surfaces across `Content Library`, `article editor`, and `item resolver`.
  - Expanded the child `TODO.csv` from 3 scaffold rows into 6 module-aligned execution rows tied to live repo files.
  - Added the first backend runtime slice with `DocumentFacade`, `DocumentReadContext`, `DocumentMutationContext`, and `DocumentRuntimeItemFields`.
  - Routed `WorkspaceContentCanonicalItemReadService` through the new facade for active item field aggregation.
  - Added focused unit coverage for the facade and the read-service integration path.
  - Added the second backend runtime slice with published/preview read models and the new `content/history` system-object boundary.
  - Routed the read-service version/history path through `ContentHistoryService`.
  - Added the third backend runtime slice with `DocumentQuery`, `DocumentQueryBoundary`, `DocumentQueryRecord`, and `DocumentRuntimeMetadata`.
  - Routed GraphQL preview/published listing through the shared query boundary while preserving outward GraphQL contracts.
  - Completed Module 2E by adding an admin shared runtime query layer for Content Library items, models, views, item detail, version history, and article editor snapshot loading.
  - Unified list/card/preview state presentation behind shared runtime badges and diagnostics derived from document truth fields.
  - Completed verification closure by hydrating workspace primary project bindings in workspace creation/detail flows and by restoring the full site/public route registration surface under `/api/v1/sites`.
- **Validation**:
  - `rg -n "Epic 2|Module 2A|Module 2B|Module 2C|Module 2D|Module 2E|Module 2F|Module 2G" docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md` → passed
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_document_runtime_unit.py` → passed
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/workspaces/content/test_document_runtime_unit.py` → passed
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-runtime.test.ts test/api/content-editor.test.ts test/pages/workspaces/content/content-library-preview-panel.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx` → passed
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-resolver-route.test.tsx test/pages/workspaces/content/content-library-item-settings-dialogs.test.tsx test/pages/workspaces/content/content-library-page.test.tsx` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py::test_runtime_routes_resolve_same_delivery_and_runtime_contract_as_project_primary_runtime tests/modules/sites/test_sites_delivery_integration.py::test_delivery_pages_resolve_and_by_id_honor_release_world_and_preview_draft -vv -s` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_benchmark_baselines_integration.py::test_headless_cms_benchmark_baselines tests/modules/sites/test_sites_canonical_content_runtime_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/sites/test_sites_graphql_integration.py` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_portal_protocol_integration.py::test_sites_public_preview_draft_publish_flow -vv -s` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/workspaces/publish tests/modules/sites` → passed
- **Files changed**:
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/SUBTASKS.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/PROGRESS.md`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic2-document-runtime-platform/TODO.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic2-document-runtime-platform/PROGRESS.md`
  - `apps/api/src/modules/workspaces/content/runtime/__init__.py`
  - `apps/api/src/modules/workspaces/content/runtime/facade.py`
  - `apps/api/src/modules/workspaces/content/history/__init__.py`
  - `apps/api/src/modules/workspaces/content/history/service.py`
  - `apps/api/src/modules/organization/workspaces/service.py`
  - `apps/api/src/modules/workspaces/service.py`
  - `apps/api/src/core/routes.py`
  - `apps/api/src/modules/sites/router.py`
  - `apps/api/src/modules/workspaces/content/items/read_service.py`
  - `apps/api/src/modules/sites/graphql/service.py`
  - `apps/api/tests/modules/workspaces/content/test_document_runtime_unit.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_service_unit.py`
  - `apps/admin/src/pages/workspaces/content/library/runtime/index.ts`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-runtime-badges.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-runtime.test.ts`
  - `apps/admin/test/pages/workspaces/content/content-library-preview-panel.test.tsx`
- **Next step**: Proceed to Epic 3.

---

## Milestone 5: Execute Epic 3 Permission and Policy Platform

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Activated child task `20260419-epic3-permission-and-policy-platform`.
  - Added `apps/api/src/modules/workspaces/permissions/` as the backend action registry and route-independent policy evaluation boundary.
  - Wired workspace authz guard, API key granted actions, and delivery GraphQL access through the shared decision model.
  - Added registry-backed workspace permission action catalog API and a workspace permissions governance surface in settings.
  - Added GraphQL query field allowlist enforcement and system managed model mutable payload policy enforcement.
  - Added shared admin hook `useWorkspacePermissionAccess` to join authz snapshot and action catalog once per workspace surface.
  - Wired Models, Extensions, Content Library, Site Builder, article publish, and site settings save surfaces into the shared permission consumption layer.
  - Wired Assets upload, bulk actions, folder writes, preview writes, and DnD writes into the same shared permission consumption layer.
  - Added release and routing action definitions for `content:routing:read`, `content:routing:write`, `release:read`, `release:publish`, and `release:rollback`.
  - Added focused coverage for release and routing action catalog entries plus granular router permission contracts.
- **Latest validation**:
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_permission_policy_service_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/sites/test_sites_graphql_service_unit.py` → passed with 40 tests
  - `timeout 60s pnpm -C apps/admin exec vitest run test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx test/pages/workspaces/content/content-library-row-actions.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/workspaces/assets/assets-page-view.test.tsx test/pages/workspaces/assets/assets-view-overlays.test.tsx test/pages/workspaces/assets/asset-preview-dialog.test.tsx` → passed with 11 files / 83 tests
  - `pnpm -C apps/admin exec tsc --noEmit --pretty false --skipLibCheck` → blocked by pre-existing repo errors outside the Assets slice
- **Next step**: Proceed to Epic 4.

---

## Milestone 6: Execute Epic 4 GraphQL Platformization

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Activated child task `20260419-epic4-graphql-platformization`.
  - Added GraphQL schema registry, artifact export verification, query planner, hook contracts, subscription contracts, and shared delivery SDK manifest helpers.
  - Added shared frontend query input helpers so schema-aware GraphQL consumers can build filter, sort, and pagination payloads from one contract.
- **Validation**:
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_integration.py tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/sites/test_sites_graphql_artifacts_unit.py tests/modules/sites/test_sites_graphql_subscriptions_unit.py` → passed
  - `pnpm --filter @arclayer/delivery-sdk test` → passed
  - `pnpm --filter @arclayer/delivery-sdk typecheck` → passed
- **Files changed**:
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic4-graphql-platformization/TODO.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic4-graphql-platformization/PROGRESS.md`
  - `apps/api/src/modules/sites/graphql/registry.py`
  - `apps/api/src/modules/sites/graphql/planner.py`
  - `apps/api/src/modules/sites/graphql/hooks.py`
  - `apps/api/src/modules/sites/graphql/subscriptions.py`
  - `packages/delivery-sdk/src/graphql-manifest.ts`
  - `packages/delivery-sdk/src/graphql-query-input.ts`
- **Next step**: Proceed to Epic 5.

---

## Milestone 7: Execute Epic 5 Editorial Workflow and Release Orchestration

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Activated child task `20260419-epic5-editorial-workflow-and-release-orchestration`.
  - Added workflow enums plus content item and release metadata fields, along with migration `0013_editorial_workflow_release_metadata.py`.
  - Added content item workflow projection and item-level workflow patch API, then wired publish safety gates to workflow stage readiness.
  - Added release dry-run, readiness summary, blocked item diagnostics, lineage metadata, and selection count contracts on the backend.
  - Synced generated OpenAPI/admin content types and extended admin API helpers for workflow and release operations.
  - Added Content Library workflow projection, article editor workflow lane with runtime refresh, and the full Release Center route and page rollout with publish, rollback, blocker, and lineage surfaces.
- **Validation**:
  - `env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish tests/modules/workspaces/releases` → passed
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx` → passed
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-runtime.test.ts` → passed
- **Files changed**:
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/SUBTASKS.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic5-editorial-workflow-and-release-orchestration/TODO.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic5-editorial-workflow-and-release-orchestration/PROGRESS.md`
  - `apps/api/src/models/content/_enums.py`
  - `apps/api/src/models/content/content_item.py`
  - `apps/api/src/models/content/release.py`
  - `apps/api/src/migrations/0013_editorial_workflow_release_metadata.py`
  - `apps/api/src/modules/workspaces/content/contracts/schema.py`
  - `apps/api/src/modules/workspaces/content/items/input_schema.py`
  - `apps/api/src/modules/workspaces/content/items/domain_helpers.py`
  - `apps/api/src/modules/workspaces/content/items/canonical_service.py`
  - `apps/api/src/modules/workspaces/content/items/router.py`
  - `apps/api/src/modules/workspaces/publish/schema.py`
  - `apps/api/src/modules/workspaces/publish/service.py`
  - `apps/api/src/modules/workspaces/releases/schema.py`
  - `apps/api/src/modules/workspaces/releases/service.py`
  - `apps/api/src/modules/workspaces/releases/router.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_workflow_integration.py`
  - `apps/api/tests/modules/workspaces/releases/test_release_dry_run_integration.py`
  - `packages/openapi/src/admin-types.ts`
  - `packages/openapi/src/generated/types.gen.ts`
  - `apps/admin/src/api/content.ts`
  - `apps/admin/src/types/api/content.ts`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-table-columns.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-shell.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/hooks/use-content-library-article-editor.ts`
  - `apps/admin/src/pages/workspaces/content/library/runtime/index.ts`
  - `apps/admin/src/pages/workspaces/content/releases/page.tsx`
  - `apps/admin/src/routes/projects/$projectId/content/releases/index.tsx`
  - `apps/admin/src/routes/projects/$projectId/content/releases/index.lazy.tsx`
  - `apps/admin/src/constants/menu/workspaces.ts`
  - `apps/admin/src/lib/routing/workspace-content-routing.ts`
  - `apps/admin/test/pages/workspaces/content/content-library-table-columns.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-release-center-page.test.tsx`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
  - `locales/en-US/nav.json`
  - `locales/zh-CN/nav.json`
- **Next step**: Proceed to Epic 6.
