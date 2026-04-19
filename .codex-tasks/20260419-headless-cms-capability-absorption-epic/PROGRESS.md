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

**Current milestone**: Milestone 4 — execute Epic 2 Document Runtime Platform
- **Current status**: DONE
- **Last completed**: Milestone 4 — execute Epic 2 Document Runtime Platform
- **Current artifact**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/SUBTASKS.csv`
- **Key context**:
  - Epic 0 is complete and its baseline docs now live under `docs/plan`.
  - Epic 1 is complete and its dependency on Epic 0 is satisfied.
  - Epic 1 now covers contract registry, schema change plan, and the Models governance operator workflow.
  - Epic 2 runtime slices are complete and the closure pass added workspace primary project hydration plus full `/api/v1/sites` route registration.
  - Epic 2 final backend aggregate verification is green with `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/workspaces/publish tests/modules/sites`.
- **Known issues**:
  - `pnpm -C apps/admin typecheck` remains blocked by pre-existing repo errors outside the Epic1 slice.
- **Next action**: Proceed to Epic 3 after Epic2 changes are committed.

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
