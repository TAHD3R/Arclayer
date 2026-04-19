# Progress Log

---

## Session Start

- **Date**: 2026-04-19
- **Task name**: `20260419-epic1-model-lifecycle-platform`
- **Task dir**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic1-model-lifecycle-platform/`
- **Spec**: See `SPEC.md`
- **Plan**: See `TODO.csv` (3 milestones)
- **Environment**: Python / FastAPI / React / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

**Current milestone**: #3 — 落地 Models governance console 清单
- **Current status**: DONE
- **Last completed**: #3 — 落地 Models governance console 清单
- **Current artifact**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic1-model-lifecycle-platform/TODO.csv`
- **Key context**:
  - Epic1 milestone #1 已完成：backend `ContentModelOut` 现在暴露正式 `contract_registry` DTO，包含 system/custom field boundary、workflow capability、delivery policy、graphql policy。
  - OpenAPI generated types 已同步，Admin `Models` 页面已经消费新 DTO 并渲染五个治理区块。
  - 现有 preview/save mutation 流保持可用，右侧 impact inspector 没有回退。
- **Known issues**:
  - `pnpm -C apps/admin typecheck` 仍有仓库既有错误，涉及 `src/lib/settings/general/localization-options.ts`、`src/pages/usercenter/workspaces/workspace-list-items.ts`、`test/pages/account/projects-mutations.test.tsx`，与本次 Epic1 切片无关。
  - `pnpm -C apps/api uv -- pytest ...integration...` 在当前环境默认受 `integration tests disabled` 开关影响而跳过；本 milestone 的 unit 与 admin focused checks 已通过。
- **Next action**: Epic1 child milestones are complete. Resume from parent epic truth before selecting the next epic.

---

## Milestone 1: Model Contract Registry 2.0

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Added `ContentModelContractRegistryOut` plus boundary/capability DTOs to `apps/api/src/modules/workspaces/content/contracts/schema.py`.
  - Wired `apps/api/src/modules/workspaces/content/models/domain_helpers.py` to derive formal registry metadata from persisted model records.
  - Regenerated `packages/openapi/src/generated/types.gen.ts` so admin consumers receive `contractRegistry`.
  - Reworked `apps/admin/src/pages/workspaces/content/models/page.tsx` into a governance surface with system fields, custom field boundary, workflow governance, delivery governance, and GraphQL governance sections.
  - Extended admin and backend tests to cover the new registry contract and governance UI rendering.
- **Validation**:
  - `pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_content_contracts_unit.py tests/modules/workspaces/content/test_content_models_unit.py` → passed
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-models-control-center.test.tsx` → passed
  - `pnpm -C apps/api openapi:sync` → passed
  - `pnpm -C apps/admin typecheck` → blocked by pre-existing repo errors outside Epic1 scope
- **Files changed**:
  - `apps/api/src/modules/workspaces/content/contracts/schema.py`
  - `apps/api/src/modules/workspaces/content/models/domain_helpers.py`
  - `apps/api/tests/modules/workspaces/test_workspace_content_contracts_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
  - `apps/admin/src/pages/workspaces/content/models/page.tsx`
  - `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`
  - `locales/zh-CN/content.json`
  - `locales/en-US/content.json`
  - `packages/openapi/src/generated/types.gen.ts`
  - `packages/openapi/src/generated/index.ts`
- **Next step**: Milestone 2 — implement schema snapshot / diff / apply plus revision-oriented backend artifacts.

---

## Milestone 2: Schema Snapshot Diff Apply And Revisions

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Extended backend content model contracts with formal schema change-plan DTOs: revision summary, canonical snapshots, normalized diff entries, and apply gates.
  - Upgraded `impact-preview` to return a formal `change_plan` while preserving the existing preview token and impact flow used by save mutations.
  - Implemented current draft, next draft, and published snapshot assembly inside `canonical_service.py`, then derived diff entries and apply gates from the same preview context.
  - Regenerated OpenAPI SDK artifacts so Admin consumes the new `changePlan` contract through the existing API layer.
  - Extended the Admin Models governance inspector to render revision path, apply gates, and schema diff entries inside the current right-rail preview surface.
  - Rebased `apps/admin/src/types/api/content.ts` onto the generated admin OpenAPI types so the content model contract stays tied to repo truth.
- **Validation**:
  - `pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_content_contracts_unit.py tests/modules/workspaces/content/test_content_models_unit.py tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py tests/modules/workspaces/content/test_content_models_integration.py` → passed with integration slices skipped by the repo's `integration tests disabled` gate
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-models-control-center.test.tsx` → passed
  - `pnpm -C apps/api openapi:sync` → passed
- **Files changed**:
  - `apps/api/src/modules/workspaces/content/contracts/schema.py`
  - `apps/api/src/modules/workspaces/content/models/canonical_service.py`
  - `apps/api/src/modules/workspaces/content/models/router.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py`
  - `apps/api/tests/modules/workspaces/test_workspace_content_contracts_unit.py`
  - `apps/admin/src/pages/workspaces/content/models/page.tsx`
  - `apps/admin/src/types/api/content.ts`
  - `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
  - `packages/openapi/src/generated/index.ts`
  - `packages/openapi/src/generated/types.gen.ts`
- **Next step**: Milestone 3 — land the broader Models governance console tasks around revision compare and operator review workflows.

---

## Milestone 3: Models Governance Console Operator Workflow

- **Status**: DONE
- **Started**: 2026-04-19
- **Completed**: 2026-04-19
- **What was done**:
  - Landed richer operator workflow inside the existing Models governance console without adding a new backend endpoint.
  - Added revision compare switching between current draft and published baseline inside the inspector.
  - Added stale preview detection so apply stays tied to the exact reviewed payload.
  - Added unsaved model-switch guard plus discard flow so protocol changes stay explicit.
  - Added apply confirmation dialog on top of the existing `changePlan` contract before persisting the next draft revision.
  - Extracted a dedicated admin governance query key helper in `apps/admin/src/api/content.ts` and aligned the page to use it.
  - Stabilized the governance model list button accessibility contract with a direct `aria-label` for focused operator tests.
- **Validation**:
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-models-control-center.test.tsx` → passed
- **Files changed**:
  - `apps/admin/src/api/content.ts`
  - `apps/admin/src/pages/workspaces/content/models/page.tsx`
  - `apps/admin/test/pages/workspaces/content/content-models-control-center.test.tsx`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
- **Next step**: Epic1 child task complete. Continue from the parent epic backlog.

---

## Final Summary

- **Total milestones**: 3
- **Completed**: 3
- **Failed + recovered**: 0
- **External unblock events**: 0
- **Total retries**: 0
- **Files created**: 3
- **Files modified**: 0
- **Key learnings**:
  - This child task inherits scope from the 2026-04-19 capability absorption implementation plan.
- **Recommendations for future tasks**:
  - Keep child progress and docs index aligned before execution starts.
