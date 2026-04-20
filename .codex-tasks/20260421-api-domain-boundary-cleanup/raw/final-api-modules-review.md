# Final API Modules Review

Date: 2026-04-21
Epic: `20260421-api-domain-boundary-cleanup`

## Review Scope

- `apps/api/src/modules` ownership after the Workspace / Project / Runtime hard cut
- deleted extension platform and workspace theme confirmation
- project-owned deliverable modules and generated/Admin residue
- current residual debt after the `projects/facade -> projects/runtime_bridge` and `sites/facade -> sites/runtime_access` cuts

## Confirmed Removals

- live source has no `apps/api/src/modules/extensions`
- live source has no `apps/api/src/modules/workspaces/extensions`
- live source has no `apps/api/src/modules/organization/extensions`
- live source has no `apps/api/src/modules/workspaces/themes`
- live source has no `apps/api/src/modules/projects/themes`
- live source has no `apps/api/src/modules/projects/facade`
- live source has no `apps/api/src/modules/sites/facade`
- live source has no workspace-owned deliverable source trees under:
  - `apps/api/src/modules/workspaces/content`
  - `apps/api/src/modules/workspaces/publish`
  - `apps/api/src/modules/workspaces/releases`
  - `apps/api/src/modules/workspaces/automation`

Evidence:

- `find apps/api/src/modules -type d | rg "(facade|themes|extensions)$"` returned no matches.
- `rg -n "buildWorkspaceContentLibraryFocusSearch|ownerPluginId|ownerPlugin|extension layer|Extension layer|扩展层|plugin-disabled|Plugins should call|plugin management|Article extensions" ...` returned no matches.
- wider stale-design grep only shows accepted technical/test terms: Vite/Tailwind/Plate plugin APIs, file extension fields, GraphQL error `extensions`, SMTP extension test text, deletion guard tests, and UI color-mode theme strings.

## Current Ownership State

### Workspace

- collaboration container
- team, invites, RBAC, authz snapshot, workspace settings, workspace activity
- shared assets and admin notifications are still mounted through the workspace shell
- personal `/me/api-keys` bridge remains in `workspaces/api_keys/router.py`

### Project

- user-visible deliverable management boundary
- owns:
  - project API keys
  - content models/items/views/routing/bindings/presentations/SEO/history/runtime boundary
  - publishing and preview-token issuance
  - releases
  - automation
  - domains
  - project governance wrappers
  - runtime bridge
- current source event domains are project-owned:
  - `project.content.*`
  - `project.release.*`
  - `project.preview_token.created`
  - `project.automation`

### Project Governance

- source of truth:
  - `apps/api/src/modules/projects/governance/router.py`
- current routes:
  - `/projects/{project_id}/me/authz`
  - `/projects/{project_id}/settings/core`
- role:
  - project-facing wrappers around workspace governance state
  - permissions are evaluated through the owning workspace context

### Project Runtime Bridge

- source of truth:
  - `apps/api/src/modules/projects/runtime_bridge/router.py`
  - `apps/api/src/modules/projects/runtime_bridge/service.py`
- current routes:
  - `/projects/{project_id}/site`
  - `/projects/{project_id}/site/preview-tokens`
- role:
  - project-to-runtime/site bridge
  - preview-token event source is `project.preview_token.created`

### Site / Runtime

- public runtime and delivery implementation remains under `sites/*`
- `sites/runtime_access/service.py` replaces the old facade naming
- GraphQL error `extensions` remains a protocol-level field and is accepted

## Remaining Architecture Debt

### 1. Runtime implementation remains site-heavy

- Files:
  - `apps/api/src/modules/sites/service.py`
  - `apps/api/src/modules/sites/runtime/*`
  - `apps/api/src/modules/sites/publishing/*`
  - `apps/api/src/modules/sites/delivery/*`
  - `apps/api/src/modules/sites/graphql/*`
- Current risk:
  - the product boundary is now Project -> Runtime/Site, while runtime execution, delivery, GraphQL, and publishing internals are still distributed across a broad `sites/*` tree
- Required follow-up:
  - establish a runtime-owned module boundary for public execution and shrink `sites/*` toward site record/storage primitives

### 2. Project settings core is still backed by workspace settings service

- File:
  - `apps/api/src/modules/projects/governance/router.py`
- Current risk:
  - `/projects/{project_id}/settings/core` is a project-facing API but still persists via `WorkspaceSettingsService`
  - this matches the current v1 storage reality and keeps governance checks correct, while the naming still exposes the old storage boundary
- Required follow-up:
  - split project-owned settings into project/runtime settings storage, keeping workspace settings for collaboration-container preferences

### 3. Compatibility wording and legacy helpers remain in runtime-adjacent modules

- Files:
  - `apps/api/src/modules/projects/runtime/site/schema.py`
  - `apps/api/src/modules/workspaces/authz/schema.py`
  - `apps/api/src/modules/assets/admin/assets/schema.py`
  - `apps/api/src/modules/assets/admin/uploads/service.py`
  - `apps/api/src/modules/sites/publishing/deps/repository.py`
  - `apps/api/src/modules/sites/publishing/routes/resolve/content/service.py`
- Current risk:
  - these are not active extension/theme/facade modules, yet the wording still carries compatibility-era framing
- Required follow-up:
  - tighten descriptions and helper naming when the corresponding runtime/storage contracts are migrated

### 4. Admin content strategy naming still carries workspace wording

- Files:
  - `apps/admin/src/lib/settings/workspace-content-strategy.ts`
  - `apps/admin/src/pages/workspaces/settings/workspace/content/components/workspace-settings-content-view.tsx`
  - `apps/admin/src/pages/projects/content/library/article-editor/hooks/use-content-library-article-editor.ts`
- Current risk:
  - project editor code reads a helper named `WorkspaceContentStrategy`
  - the backing API is currently workspace core settings, so a blind rename would hide a real settings ownership decision
- Required follow-up:
  - move project content strategy to project/runtime settings before renaming the helper to project content strategy

## Accepted Technical Terms

- Vite/Tailwind/Plate `plugin` APIs in frontend/editor code
- GraphQL response `extensions`
- file extension fields and upload-extension extraction
- SMTP extension test strings
- deletion guard tests that assert stale extension/theme/workspace-content routes stay absent
- UI color-mode theme labels
- DB column compatibility mapping from `Permission.owner_key` to stored `plugin_id`

## Validation Snapshot

- JSON syntax check passed:
  - `node -e "JSON.parse(require('fs').readFileSync('locales/en-US/content.json','utf8')); JSON.parse(require('fs').readFileSync('locales/zh-CN/content.json','utf8'));"`.
- Admin boundary/nav validation passed:
  - `pnpm -C apps/admin exec vitest run test/lib/admin-nav-utils.test.ts test/lib/project-boundary-contract.test.ts`
  - result: 2 files passed, 28 tests passed.
- Focused API validation passed:
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/core/test_i18n.py::test_hardcoded_api_error_codes_exist_in_errors_locale tests/core/test_i18n.py::test_backend_product_code_does_not_embed_hardcoded_user_messages tests/modules/projects/test_project_boundary_contract_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/workspaces/content/test_document_runtime_unit.py tests/modules/sites/test_sites_graphql_service_unit.py`
  - result: 46 passed.
- Targeted Admin validation passed:
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/team/roles/team-roles-view.test.tsx test/components/common/admin-workspace-switcher.test.tsx test/lib/post-auth-routing.test.ts test/lib/admin-nav-utils.test.ts test/lib/project-boundary-contract.test.ts`
  - result: 5 files passed, 51 tests passed.
- Final API gate passed:
  - `pnpm api:check`
  - result: 4 tasks successful; test result `386 passed, 131 skipped, 26 warnings`.

## Final Judgment

- live API source now follows the intended top-level split:
  - workspace = collaboration container
  - project = deliverable management boundary
  - runtime/site = public execution and publishing boundary
- extension platform modules and workspace/project theme package modules are absent from live API modules
- facade naming has been removed from project and site runtime bridge source
- remaining debt is concentrated in runtime ownership extraction, project settings storage ownership, compatibility wording, and one Admin content-strategy naming line tied to settings ownership
