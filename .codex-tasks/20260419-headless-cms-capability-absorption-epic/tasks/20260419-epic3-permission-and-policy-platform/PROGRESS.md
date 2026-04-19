# Progress Log

---

## Session Start

- **Date**: 2026-04-19
- **Task name**: `20260419-epic3-permission-and-policy-platform`
- **Task dir**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic3-permission-and-policy-platform/`
- **Spec**: See `SPEC.md`
- **Plan**: See `TODO.csv` (3 milestones)
- **Environment**: Python / FastAPI / React / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: Epic3 complete
- **Current status**: DONE
- **Last completed**: #44 — 回写 Epic3 progress 并关闭 child task
- **Current artifact**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic3-permission-and-policy-platform/TODO.csv`
- **Key context**:
  - 已完成 3A/3B 首批 backend core：新增 `apps/api/src/modules/workspaces/permissions/registry.py`、`schema.py`、`service.py`，形成 action registry + route-independent evaluator。
  - 已把 `workspaces/authz/http/service.py`、`workspaces/api_keys/scopes.py`、`sites/graphql/service.py` 接到统一 decision 模型。
  - 已新增 `tests/modules/workspaces/test_workspace_permission_policy_service_unit.py`，并扩展 API key / GraphQL focused tests。
  - 已完成第二批 admin governance slice：`apps/admin/src/pages/workspaces/settings/workspace/permissions/` 提供 action catalog 摘要、workspace/delivery 分区以及嵌入式 roles matrix；`context-settings-pages.tsx` 已切到新 permissions surface。
  - 第二批 focused verification 已通过：`pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_permission_policy_service_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py` 与 `pnpm -C apps/admin exec vitest run test/pages/settings/context-settings-pages.test.tsx`
  - 已完成 3C 第一刀 query sanitization：`apps/api/src/modules/sites/graphql/service.py` 新增 model-aware query rule allowlist，拒绝非法 exact filter、contains filter 和 sort field，并统一抛出 `GRAPHQL_QUERY_FIELD_FORBIDDEN`。
  - GraphQL sanitization focused verification 已通过：`pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/workspaces/test_workspace_permission_policy_service_unit.py`
  - 已完成 3C 第二刀 payload enforcement：`apps/api/src/modules/workspaces/content/models/canonical_service.py` 将 system managed model 的 payload 写入边界提炼成显式 mutable field policy，并在锁定字段冲突中返回 `allowedFieldNames` 元数据。
  - payload enforcement focused verification 已通过：`env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py tests/modules/workspaces/test_workspace_permission_policy_service_unit.py`
  - 已完成 3F 第一刀 frontend consumption：新增 `apps/admin/src/hooks/use-workspace-permission-access.ts`，把 workspace authz snapshot 和 action catalog 收口成 `hasPermission` / `hasAction`。
  - `Models` 与 `Extensions` 已接入统一 permission consumption。`ContentModelsControlCenterPage` 现在会在缺少 `content:models:write` 能力时显示只读提示并禁用 preview/save，extensions 页面去掉了重复的 authz 查询逻辑。
  - 已完成 3F 第二刀 frontend consumption：`Content Library` 通过共享 hook 把 create、bulk mutate、row mutate、item settings 和 preview summary actions 收成只读态；`Site Builder` 增加 builder read-only guidance，并把 configure 入口接到统一 action gate。
  - 为了让治理面和消费面继续使用统一 contract，本轮补充了 `content:items:write` 与 `content:site-builder:write` action definition，并用 focused backend pytest 固化 action catalog 行为。
  - 3F 第二批 focused verification 已通过：`pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-row-actions.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx` 与 `pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/workspaces/test_workspace_permission_policy_service_unit.py`
  - 已完成 3F 第三刀 frontend consumption：`ContentLibraryArticleEditorShell` 通过共享 hook 消费 `system:content:publish`，并统一禁用 page 与 split 两个 publish 入口；缺权限时保留草稿编辑能力并显示 publish access hint。
  - `GeneralSettingsShell` 通过共享 hook 消费 `system:site:manage`，缺权限时显示站点设置只读提示，并把 disabled 状态下发到 basics 与 localization tabs，集中覆盖 `patchCoreSettings` 保存入口。
  - 3F 第三批 focused verification 已通过：`pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx test/pages/settings/general-settings-shell-permissions.test.tsx`，结果为 3 files / 13 tests passed。
  - 已完成 Assets permission consumption slice：`AssetsPageView` 通过共享 hook 消费 `system:assets:manage`，缺权限时禁用 upload、bulk move/access/delete、folder create/edit/move/delete、preview edit/access/delete 与 DnD 写操作，并显示安静的 read-only notice。
  - Assets focused verification 已通过：`pnpm -C apps/admin exec vitest run test/pages/workspaces/assets/assets-page-view.test.tsx test/pages/workspaces/assets/assets-view-overlays.test.tsx test/pages/workspaces/assets/asset-preview-dialog.test.tsx`，结果为 3 files / 11 tests passed。
  - 已补齐 release 与 routing action catalog：`content:routing:read`、`content:routing:write`、`release:read`、`release:publish`、`release:rollback` 已进入 `PermissionActionDefinition` registry，并通过 `GET /rbac/actions` 治理面消费统一暴露。
  - 已补 release 与 routing focused policy coverage：registry tests 覆盖新增 actions，release router 与 routing router tests 固化 granular permission contract。
  - Epic3 fresh backend focused verification 已通过：`timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_permission_policy_service_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/sites/test_sites_graphql_service_unit.py`，结果为 40 tests passed。
  - Epic3 fresh admin focused verification 已通过：`timeout 60s pnpm -C apps/admin exec vitest run test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/content/content-models-control-center.test.tsx test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx test/pages/workspaces/content/content-library-row-actions.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx test/pages/settings/general-settings-shell-permissions.test.tsx test/pages/workspaces/assets/assets-page-view.test.tsx test/pages/workspaces/assets/assets-view-overlays.test.tsx test/pages/workspaces/assets/asset-preview-dialog.test.tsx`，结果为 11 files / 83 tests passed。
- **Known issues**:
  - `apps/api/src/modules/workspaces/policy` 当前只有历史 `__pycache__`，没有可复用源码边界。
  - `apps/admin typecheck` 当前仍被多处现存类型问题阻塞，包括 `src/lib/settings/general/localization-options.ts`、`src/pages/usercenter/workspaces/workspace-list-items.ts`、`src/pages/workspaces/content/library/runtime/index.ts`、`src/types/api/content.ts` 等非 Epic3 本轮改动点。
  - Releases center 与 Routing bindings 正式 UI 属于后续 Epic surface，当前 live repo 没有独立 admin 页面可承接 Epic3 frontend consumption。
- **Next action**: Hand off to Epic4 GraphQL Platformization.

---

## Execution Notes

- 2026-04-19: Recovered Epic3 scaffold and expanded `TODO.csv` from 3 coarse rows to 7 executable leaf steps.
- 2026-04-19: Added `apps/api/src/modules/workspaces/permissions/` as the Epic3 backend permission core boundary.
- 2026-04-19: Unified workspace guard, API key scope actions, and delivery GraphQL access on `PolicyEvaluationService`.
- 2026-04-19: Focused backend verification passed with 35 tests.
- 2026-04-19: Added registry-backed `GET /workspaces/{workspace_id}/rbac/actions` and extended RBAC focused coverage for action catalog reads.
- 2026-04-19: Replaced workspace roles settings shell entry with `WorkspacePermissionsSettingsPage`, which composes a permissions catalog support layer above the embedded roles matrix.
- 2026-04-19: Focused admin verification passed for `test/pages/settings/context-settings-pages.test.tsx`; catalog assertions were tightened around the permissions governance view.
- 2026-04-19: Added model-aware GraphQL query rules in `SiteGraphQLService` and locked invalid filter plus sort fields behind explicit `BadRequest` errors.
- 2026-04-19: Added focused unit tests to pin allowed and rejected GraphQL query fields for built-in models.
- 2026-04-19: Extracted the mutable payload policy for system managed models into an explicit allowlist and exposed allowed field names in the lock error meta.
- 2026-04-19: Added integration coverage for preview-time system field collision and locked-field metadata under real `RUN_INTEGRATION_TESTS=1` execution.
- 2026-04-19: Added a shared workspace permission consumption hook in admin and reused it across extensions surfaces.
- 2026-04-19: Wired models action visibility to the unified permission layer and added a focused no-access test for disabled preview/save controls.
- 2026-04-19: Added `content:items:write` and `content:site-builder:write` to the shared permission action registry so frontend permission consumption can stay action-driven instead of hard-coding raw permission codes.
- 2026-04-19: Wired Content Library create, bulk, row-action, item-settings, and preview summary controls into an explicit read-only mode backed by `useWorkspacePermissionAccess`.
- 2026-04-19: Wired Site Builder configure entry points into the same shared permission layer and added read-only guidance when the user can inspect but not mutate builder configuration.
- 2026-04-19: Focused frontend verification passed with 45 tests across Content Library and Site Builder; focused backend verification passed with 13 tests across RBAC action catalog and permission policy core.
- 2026-04-19: Wired article editor publish actions into `system:content:publish` through the shared workspace permission hook for both page and split mode toolbars.
- 2026-04-19: Wired site settings save surfaces into `system:site:manage` through the shared workspace permission hook and added a focused read-only notice for users without site management access.
- 2026-04-19: Focused frontend verification passed with 13 tests across article editor publish toolbar, toolbar UI defaults, and general settings permission gating.
- 2026-04-19: Wired Assets upload, bulk actions, folder write controls, preview write controls, and DnD writes into `system:assets:manage` through the shared workspace permission hook.
- 2026-04-19: Focused Assets frontend verification passed with 11 tests across Assets page shell, selection toolbar, and preview menu permission gating.
- 2026-04-19: `pnpm -C apps/admin exec tsc --noEmit --pretty false --skipLibCheck` remains blocked by existing non-Assets errors in localization options, usercenter workspace list items, content runtime/generated content types, workspace basics localization, roles view, and older test fixtures.
- 2026-04-19: Added release and routing action definitions to the unified permission action registry and pinned them with focused policy plus router contract tests.
- 2026-04-19: Fresh backend focused verification passed with 40 tests across permission policy, API key scopes, RBAC catalog and guard contracts, and sites GraphQL service.
- 2026-04-19: Fresh admin focused verification passed with 83 tests across permissions governance, content models, content library, site builder, article publish controls, site settings permissions, and Assets permission consumption.

---

## Final Summary

- **Total milestones**: 3
- **Completed**: 44
- **Failed + recovered**: 0
- **External unblock events**: 0
- **Total retries**: 0
- **Files created**: 3
- **Files modified**: 10
- **Files modified**: 15
- **Files modified**: 21
- **Files modified**: 24
- **Key learnings**:
  - This child task inherits scope from the 2026-04-19 capability absorption implementation plan.
  - The permissions governance UI fits Arclayer settings hierarchy better as one support layer plus one main matrix layer than as a full roles page rewrite.
  - Query sanitization belongs in the GraphQL service boundary, where schema inputs from multiple resolvers converge into one shared enforcement contract.
  - Payload enforcement for system managed models is easier to operate when the mutable field contract is explicit and returned to the caller as error metadata.
  - Frontend permission consumption is easier to scale when authz snapshot and action catalog are joined once in a shared hook instead of being re-derived in each page.
  - Write-surface gates should sit at the smallest shared shell that owns the mutation callback: article editor shell for publish, general settings shell for site settings saves.
  - Assets requires both visible control gating and DnD gating because dragging folders/assets can trigger write mutations without opening dialogs.
  - Release and routing capabilities should enter the shared action registry before their dedicated operator UIs exist, so governance and backend contracts stay ahead of frontend route rollout.
- **Recommendations for future tasks**:
  - Drive Epic4 from GraphQL schema/runtime platformization now that permission policy contracts are centralized.
