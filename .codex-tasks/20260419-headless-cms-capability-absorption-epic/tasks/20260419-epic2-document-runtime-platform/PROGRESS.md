# Progress Log

---

## Session Start

- **Date**: 2026-04-19
- **Task name**: `20260419-epic2-document-runtime-platform`
- **Task dir**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic2-document-runtime-platform/`
- **Spec**: See `SPEC.md`
- **Plan**: See `TODO.csv` (3 milestones)
- **Environment**: Python / FastAPI / React / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: #6 — 完成 Module 2G Item Resolver and Detail Surface 执行账本映射
- **Current status**: IN_PROGRESS
- **Last completed**: #6 — 完成 Module 2G Item Resolver and Detail Surface 执行账本映射
- **Current artifact**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic2-document-runtime-platform/TODO.csv`
- **Key context**:
  - `apps/api/src/modules/workspaces/content/runtime/` 已存在最小 runtime package，当前包含 `DocumentFacade`、`DocumentReadContext`、`DocumentMutationContext`。
  - `WorkspaceContentCanonicalItemReadService` 已切到 facade 读取 active item fields，外部 router / canonical service 契约保持不变。
  - focused backend test `tests/modules/workspaces/content/test_document_runtime_unit.py` 已覆盖 facade field aggregation 和 read service facade 接入。
  - `DocumentReadContext` 现在额外提供 published read model 和 preview diagnostics read model。
  - `apps/api/src/modules/workspaces/content/history/` 已成为正式 version/history system-object 边界，`read_service` 的 version reads 已接入该 service。
  - `content/runtime` 现在额外提供 `DocumentQuery`、`DocumentQueryBoundary`、`DocumentQueryRecord`、`DocumentRuntimeMetadata`。
  - `SiteGraphQLService` 的 preview/published record listing 已经通过共享 query boundary 走统一 record filter path。
  - Admin `Content Library` 已新增 shared runtime query layer，并且 page、version history、item resolver、item settings invalidation 已经改走统一 runtime query keys 和 loader。
  - list/card/preview 现在共享 runtime badges 与 diagnostics summary，前端已开始消费 draft/published/shape/bootstrap 真值。
  - article editor hook 现在额外返回 unified runtime state，shell、save indicator、updates panel 已通过共享 runtime contract 消费当前视角、版本和 diagnostics。
  - item resolver blocked/boundary/error surface、preview detail surface、settings dialogs 现在共享同一份 detail summary strip 和 runtime badge/diagnostics truth。
- **Known issues**:
  - `pnpm -C apps/admin typecheck` 仍有仓库既有错误，当前不适合作为 Epic2 milestone #1 的 focused validation。
  - GitNexus 对 runtime 入口面检索结果有限，当前以 implementation plan + live repo truth 为主。
- **Next action**: Epic2 verification closure is complete; sync parent epic truth and commit the slice.

---

## Milestone 1: Module 2A~2G Execution Ledger Mapping

- **Status**: IN_PROGRESS
- **Started**: 2026-04-19
- **Completed**: In progress
- **What was done**:
  - Recovered Epic2 parent/child truth from disk after Epic1 completion.
  - Read the implementation plan section for `Epic 2: Document Runtime Platform` and extracted live target modules for Module 2A through 2G.
  - Mapped current backend runtime entry points across `items`, `publish`, `publishing`, and `graphql`.
  - Mapped current frontend consumer surfaces across `Content Library`, `article editor`, and `item resolver`.
  - Expanded `TODO.csv` from 3 scaffold milestones into 6 module-aligned execution rows tied to live repo files.
- **Validation**:
  - `rg -n "Epic 2|Module 2A|Module 2B|Module 2C|Module 2D|Module 2E|Module 2F|Module 2G" docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md` → passed
  - `test -f apps/api/src/modules/workspaces/content/items/read_service.py && test -f apps/api/src/modules/workspaces/publish/service.py && test -f apps/api/src/modules/sites/publishing/service.py && test -f apps/api/src/modules/sites/graphql/service.py && test -f apps/admin/src/pages/workspaces/content/library/page.tsx && test -f apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-shell.tsx` → pending next step
- **Files changed**:
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic2-document-runtime-platform/TODO.csv`
  - `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic2-document-runtime-platform/PROGRESS.md`
- **Next step**: Finish Module 2A row notes and acceptance detail, then promote Epic2 to `IN_PROGRESS` in the parent epic truth.

---

## Milestone 2: Module 2A Document Facade first backend slice

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Added `apps/api/src/modules/workspaces/content/runtime/` with the first runtime package boundary.
  - Introduced `DocumentFacade`, `DocumentReadContext`, `DocumentMutationContext`, and `DocumentRuntimeItemFields`.
  - Moved active item field aggregation out of `items/read_service.py` and into `DocumentReadContext.resolve_active_item_fields`.
  - Updated `WorkspaceContentCanonicalItemReadService` to consume the new facade through constructor injection while preserving its external router contract.
  - Added `tests/modules/workspaces/content/test_document_runtime_unit.py` to cover facade aggregation and read-service integration.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_document_runtime_unit.py` → passed
- **Files changed**:
  - `apps/api/src/modules/workspaces/content/runtime/__init__.py`
  - `apps/api/src/modules/workspaces/content/runtime/facade.py`
  - `apps/api/src/modules/workspaces/content/items/read_service.py`
  - `apps/api/tests/modules/workspaces/content/test_document_runtime_unit.py`
- **Next step**: Start Module 2B/2C by formalizing draft/published/preview read models and the first history system-object boundary on top of the new facade.

---

## Milestone 3: Module 2B/2C first backend slice

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Extended `DocumentReadContext` with `DocumentPublishedReadModel` and `DocumentPreviewDiagnosticsReadModel`.
  - Added `apps/api/src/modules/workspaces/content/history/` with `ContentHistoryService`, `ContentVersionSystemObject`, and `ContentVersionSystemObjectList`.
  - Moved version/history read assembly behind the new history service and updated `WorkspaceContentCanonicalItemReadService` to consume it for version reads.
  - Expanded focused unit coverage to assert published/preview diagnostics read models, history system objects, and the read-service version path.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_document_runtime_unit.py` → passed
- **Files changed**:
  - `apps/api/src/modules/workspaces/content/history/__init__.py`
  - `apps/api/src/modules/workspaces/content/history/service.py`
  - `apps/api/src/modules/workspaces/content/runtime/__init__.py`
  - `apps/api/src/modules/workspaces/content/runtime/facade.py`
  - `apps/api/src/modules/workspaces/content/items/read_service.py`
  - `apps/api/tests/modules/workspaces/content/test_document_runtime_unit.py`
- **Next step**: Start Module 2D by extracting a protocol-aware runtime query boundary shared by items, publish, publishing, and GraphQL consumers.

---

## Milestone 4: Module 2D first backend slice

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Extended `content/runtime` with `DocumentQuery`, `DocumentQueryBoundary`, `DocumentQueryRecord`, and `DocumentRuntimeMetadata`.
  - Refactored `SiteGraphQLService` preview/published list loaders to emit `DocumentQueryRecord` objects first.
  - Routed `SiteGraphQLService.list_records` through the shared query boundary before applying GraphQL-specific exact/contains filters and sorting.
  - Kept outward GraphQL `StructuredContentRecord` contracts stable by converting query records back through `_to_structured_record`.
  - Added focused unit coverage for the query boundary filter semantics and the updated GraphQL record build path.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/workspaces/content/test_document_runtime_unit.py` → passed
- **Files changed**:
  - `apps/api/src/modules/workspaces/content/runtime/__init__.py`
  - `apps/api/src/modules/workspaces/content/runtime/facade.py`
  - `apps/api/src/modules/sites/graphql/service.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_service_unit.py`
- **Next step**: Start Module 2E by wiring admin content-library data surfaces to the runtime query boundary and the new history/read-model contracts.

---

## Milestone 5: Module 2E Content Library Data Surface 2.0

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Added `apps/admin/src/pages/workspaces/content/library/runtime/index.ts` as the shared admin runtime query and snapshot boundary for content-library surfaces.
  - Moved content-library page data loading for items, models, and saved views onto shared runtime query keys and loaders.
  - Routed article editor snapshot loading, version history surface, item resolver, item settings invalidation, and article preview shell item-list invalidation through the same runtime contract.
  - Added runtime badge and diagnostics derivation in the shared runtime layer using draft/published version truth, shape state, and bootstrap preset state.
  - Wired card list, table columns, and preview panel to the same runtime badge and diagnostics presentation so `list/card/sidebar/preview` share one document-state surface.
  - Added focused admin coverage for the runtime layer, preview panel diagnostics surface, and the expanded table columns contract.
- **Validation**:
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-runtime.test.ts test/api/content-editor.test.ts test/pages/workspaces/content/content-library-preview-panel.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx` → passed
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-resolver-route.test.tsx test/pages/workspaces/content/content-library-item-settings-dialogs.test.tsx test/pages/workspaces/content/content-library-page.test.tsx` → passed
- **Files changed**:
  - `apps/admin/src/pages/workspaces/content/library/runtime/index.ts`
  - `apps/admin/src/pages/workspaces/content/library/page.tsx`
  - `apps/admin/src/pages/workspaces/content/library/item-resolver/page.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-item-settings-dialogs.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/hooks/api.ts`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-version-history-surface.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-shell.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-runtime-badges.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-status-tag.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-card-list.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-table-columns.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-preview-panel.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-runtime.test.ts`
  - `apps/admin/test/pages/workspaces/content/content-library-preview-panel.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-table-columns.test.tsx`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
- **Next step**: Start Module 2F by aligning article editor shell history, diagnostics, and lane state with the runtime facade and history objects.

---

## Milestone 6: Module 2F Article Editor Runtime Surface

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Extended `apps/admin/src/pages/workspaces/content/library/runtime/index.ts` with `ContentLibraryArticleEditorRuntimeState`, `ContentLibraryArticleEditorViewState`, and the shared editor runtime state builder.
  - Updated `useContentLibraryArticleEditor` to keep item runtime truth alongside draft state and return a unified `runtime` object without changing the autosave/publish behavior.
  - Routed page-mode article editor shell through the shared `runtime` object so save indicator, publish gating, and current-view summary consume one contract instead of several loose props.
  - Added current-view and diagnostics summary to the editor shell header, and surfaced the same runtime truth in the updates panel.
  - Aligned `ContentLibraryArticleEditorSaveIndicator` and page toolbar consumers to the shared runtime contract.
- **Validation**:
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-runtime.test.ts test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx` → passed
- **Files changed**:
  - `apps/admin/src/pages/workspaces/content/library/runtime/index.ts`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/hooks/use-content-library-article-editor.ts`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-save-indicator.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-updates-panel.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-shell.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/components/content-library-article-editor-page-toolbar.tsx`
  - `apps/admin/src/pages/workspaces/content/library/article-editor/page.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-runtime.test.ts`
  - `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- **Next step**: Start Module 2G by pulling item resolver header, detail summary, and settings dialog entry points onto the same runtime state plane.

---

## Milestone 7: Module 2G Item Resolver and Detail Surface

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Added `apps/admin/src/pages/workspaces/content/library/components/content-library-detail-summary-strip.tsx` as the shared detail header summary strip for preview, resolver, and settings dialog surfaces.
  - Updated `ContentLibraryPreviewPanel` summary previews to consume the shared strip so preview detail fields, runtime badges, and diagnostics stay on the same document runtime plane.
  - Updated `ContentLibraryItemResolverPage` blocked and boundary surfaces to render the same summary strip before route/reason detail fields, which aligns list -> detail -> edit handoff to one runtime truth model.
  - Updated `ContentLibraryItemSettingsDialogs` to render the shared detail strip above dialog fields so settings entry points inherit the same protocol-aware summary surface as preview and resolver.
  - Kept item settings invalidation on runtime query keys so saved dialog changes refresh both list and resolver detail consumers through the shared runtime boundary.
- **Validation**:
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-preview-panel.test.tsx test/pages/workspaces/content/content-library-resolver-route.test.tsx test/pages/workspaces/content/content-library-item-settings-dialogs.test.tsx` → passed
- **Files changed**:
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-detail-summary-strip.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-preview-panel.tsx`
  - `apps/admin/src/pages/workspaces/content/library/item-resolver/page.tsx`
  - `apps/admin/src/pages/workspaces/content/library/components/content-library-item-settings-dialogs.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-preview-panel.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-resolver-route.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-item-settings-dialogs.test.tsx`
- **Next step**: Run the accumulated Epic2 verification sweep and update the parent epic truth for closure readiness.

---

## Verification Sweep

- **Status**: DONE
- **What was done**:
  - Ran the full Epic2 admin focused verification sweep covering runtime layer, preview panel, table columns, resolver route, item settings dialogs, content-library page, article editor page, and toolbar UI.
  - Attempted the parent Epic2 backend verification command from `SUBTASKS.csv`.
  - Broke the backend verification into split commands to diagnose whether the blocker came from `content`, `publish`, or `sites`.
  - Re-ran `tests/modules/workspaces/content` serially to remove the false failures caused by parallel test processes sharing the same Postgres schema and Tortoise global context.
  - Fixed the real backend blockers by restoring workspace primary project bindings and by registering the full site/public route surface under `/api/v1/sites`.
  - Re-ran the focused backend and full aggregate verification suite without the 60-second timeout after the user explicitly lifted that constraint for Docker-backed Postgres.
- **Validation**:
  - `timeout 60s pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-runtime.test.ts test/api/content-editor.test.ts test/pages/workspaces/content/content-library-preview-panel.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx test/pages/workspaces/content/content-library-resolver-route.test.tsx test/pages/workspaces/content/content-library-item-settings-dialogs.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx` → passed (`9` files, `61` tests)
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/workspaces/publish tests/modules/sites` → timed out with exit code `124`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content` → timed out with exit code `124`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish` → passed
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites` → failed when run in parallel with other backend groups because the shared Postgres schema and Tortoise global context collided during setup; this run is not a reliable product regression signal
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py::test_runtime_routes_resolve_same_delivery_and_runtime_contract_as_project_primary_runtime tests/modules/sites/test_sites_delivery_integration.py::test_delivery_pages_resolve_and_by_id_honor_release_world_and_preview_draft -vv -s` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_benchmark_baselines_integration.py::test_headless_cms_benchmark_baselines tests/modules/sites/test_sites_canonical_content_runtime_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/sites/test_sites_graphql_integration.py` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_portal_protocol_integration.py::test_sites_public_preview_draft_publish_flow -vv -s` → passed
  - `env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/workspaces/publish tests/modules/sites` → passed
- **Current conclusion**:
  - Epic2 frontend consumer verification is green.
  - Epic2 backend aggregate verification is green in the user-approved non-timeout mode, so the child task is ready to close.

---

## Final Summary

- **Total milestones**: 3
- **Completed**: 3
- **Failed + recovered**: 0
- **External unblock events**: 0
- **Total retries**: 2
- **Files created**: 7
- **Files modified**: 5
- **Key learnings**:
  - A narrow runtime slice can land safely by pushing repeated read-side assembly behind `DocumentReadContext` before touching publish or GraphQL consumers.
  - Version and history reads can become first-class system objects without changing outward API contracts, which makes later compare/promote work easier to stage.
  - Query boundary work can stay low-risk when the shared layer owns only query input and runtime metadata, while surface-specific formatting remains in the consumer.
- **Recommendations for future tasks**:
  - Grow the facade through one consumer at a time and keep focused pytest coverage alongside each new runtime boundary.
  - Keep `/api/v1/sites` registration centralized through the aggregated sites router so site-scoped delivery and portal protocol contracts move together.
