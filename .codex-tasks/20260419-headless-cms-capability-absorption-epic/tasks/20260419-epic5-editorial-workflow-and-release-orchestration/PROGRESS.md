# Progress Log

---

## Session Start

- **Date**: 2026-04-19
- **Task name**: `20260419-epic5-editorial-workflow-and-release-orchestration`
- **Task dir**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic5-editorial-workflow-and-release-orchestration/`
- **Spec**: See `SPEC.md`
- **Plan**: See `TODO.csv` (3 milestones)
- **Environment**: Python / FastAPI / React / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: #12 — 回写 Epic5 progress 并同步父级状态
- **Current status**: DONE
- **Last completed**: #10 / #11 — backend + admin focused verification
- **Current artifact**: `apps/admin/src/pages/workspaces/content/releases/page.tsx`
- **Key context**:
  - Epic5 目标是把 publish kernel 与 editorial workflow 拆成两个对象域，并补上 release readiness、dry-run diagnostics、lineage 与前端 workflow surfaces。
  - 已完成 backend workflow domain 落地：`apps/api/src/models/content/_enums.py`、`content_item.py`、`release.py` 与 migration `0013_editorial_workflow_release_metadata.py` 现在承载 workflow stage、summary、notes、selection count 和 lineage metadata。
  - `apps/api/src/modules/workspaces/content/contracts/schema.py`、`items/input_schema.py`、`items/domain_helpers.py`、`items/canonical_service.py`、`items/router.py` 已补齐 content item workflow projection 与 item-level workflow patch API。
  - `apps/api/src/modules/workspaces/publish/schema.py`、`service.py` 与 `apps/api/src/modules/workspaces/releases/schema.py`、`service.py`、`router.py` 已补齐 release dry-run、readiness summary、workflow gate blocker、selection count 和 lineage contract。
  - `apps/api/tests/modules/workspaces/publish/test_publish_workflow_integration.py` 与 `apps/api/tests/modules/workspaces/releases/test_release_dry_run_integration.py` 已固定 approval gate、workflow blocker、release lineage 和 selection metadata。
  - OpenAPI/admin API types 已同步到 `packages/openapi/src/admin-types.ts`、`packages/openapi/src/generated/types.gen.ts`、`apps/admin/src/types/api/content.ts` 与 `apps/admin/src/api/content.ts`。
  - Content Library workflow projection 已接入 `content-library-table-columns.tsx`，article editor workflow lane 与 runtime refresh 已接入 `content-library-article-editor-shell.tsx`、`use-content-library-article-editor.ts` 与 `runtime/index.ts`。
  - Release Center route/page/menu/i18n 已落地到 `apps/admin/src/pages/workspaces/content/releases/page.tsx`、`apps/admin/src/routes/projects/$projectId/content/releases/`、`apps/admin/src/constants/menu/workspaces.ts`、`apps/admin/src/lib/routing/workspace-content-routing.ts` 与 locale JSON。
  - Epic5 focused backend verification 已通过：`env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish tests/modules/workspaces/releases`。
  - Epic5 focused admin verification 已通过：`pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-release-center-page.test.tsx` 与 `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-runtime.test.ts`。
- **Known issues**:
  - `pnpm -C apps/admin exec tsc --noEmit --skipLibCheck` 仍被既有仓库类型错误阻塞，当前剩余错误位于 `src/lib/settings/general/localization-options.ts`、`src/pages/usercenter/workspaces/workspace-list-items.ts`、`src/pages/workspaces/assets/components/asset-preview-dialog.tsx`、`src/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-localization-panel.tsx`、`src/pages/workspaces/team/roles/components/team-roles-view.tsx` 与若干历史测试文件。
- **Next action**: Epic5 is complete; the next implementation slice belongs to Epic6 automation flows and operations platform.

---

## Execution Notes

- 2026-04-19: Expanded Epic5 `TODO.csv` from scaffold rows into 12 module-aligned execution steps covering workflow domain, release readiness, publish gates, admin workflow surfaces, and release center rollout.
- 2026-04-19: Added workflow enums and content item plus release metadata fields so editorial workflow state becomes a first-class content domain contract.
- 2026-04-19: Added item-level workflow patch API and approval-gated publish behavior through the content items and publish services.
- 2026-04-19: Added release dry-run, readiness summary, blocked item diagnostics, lineage metadata, and selection count to the releases service and router contracts.
- 2026-04-19: Synced generated OpenAPI/admin content types and extended admin API helpers for workflow and release operations.
- 2026-04-19: Added Content Library workflow projection in list columns and article editor workflow lane with local runtime refresh after successful workflow transitions.
- 2026-04-19: Added Release Center route, page, lazy route registration, menu entry, and i18n copy for readiness, blockers, publish, rollback, and lineage visibility.
- 2026-04-19: Focused admin verification passed across content library workflow columns, article editor workflow lane, release center page, and shared content runtime helpers.
- 2026-04-19: Focused backend verification passed across publish and releases integration suites with live workflow gate and release lineage coverage.

---

## Final Summary

- **Total milestones**: 12
- **Completed**: 12
- **Failed + recovered**: 0
- **External unblock events**: 0
- **Total retries**: 0
- **Files created**: 6
- **Files modified**: 31
- **Key learnings**:
  - This child task inherits scope from the 2026-04-19 capability absorption implementation plan.
  - Editorial workflow becomes easier to operate when workflow state, publish readiness, and release dry-run diagnostics are modeled as one explicit contract family instead of spread across publish-only responses.
  - Release Center can stay lightweight when it consumes one release dry-run contract plus release history and lineage rather than re-deriving readiness client-side.
- **Recommendations for future tasks**:
  - Carry the same explicit contract style into Epic6 automation flows so workflow transitions and release actions can become automation triggers without another schema rewrite.
