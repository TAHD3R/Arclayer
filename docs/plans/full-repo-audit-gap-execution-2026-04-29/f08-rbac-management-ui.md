# F08: RBAC Management UI

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: RBAC 管理界面
> Matrix category: completely missing
> Source audit anchors: sections 4.1, 14, 15.
> Default batch: 3
> Coupling: high

## Objective

Add an Admin UI for visual role and permission management, backed by existing RBAC APIs or new minimal APIs where gaps exist.

## Context

- The audit records RBAC engine capability as present.
- The audit records RBAC management UI as missing.
- Conditions are missing and planned separately in `p07-conditional-permissions.md`.

## Scope

- Build Admin surfaces for role list, role detail, permission matrix, and save/revert behavior.
- Add or complete backend endpoints required by the UI.
- Support permissions for workspace, project, content, asset, release, and system surfaces represented by live permission models.
- Integrate conditional permissions only after `p07-conditional-permissions.md`.
- Add i18n strings for user-facing copy in `en-US` and `zh-CN`.

## Exclusions

- Defining condition semantics. That belongs to `p07-conditional-permissions.md`.
- Rebuilding the RBAC engine.
- SSO provider role mapping.

## Dependencies

- Should follow `p07-conditional-permissions.md` when the UI includes conditions.
- May proceed earlier for role-level permissions if scoped explicitly.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/admin/frontend/index.md`
- `DESIGN.md`
- `docs/guidelines/frontend-design.md`
- `docs/guidelines/i18n.md`

## Execution Instructions

1. Inspect existing permission models, admin settings routes, and current management patterns.
2. Define the role and permission data contract.
3. Add backend endpoints if missing, keeping routers thin.
4. Build Admin UI using existing page shell and settings primitives.
5. Use a dense permission matrix only where it improves scanning.
6. Add optimistic state only when failure handling is explicit.
7. Add tests for backend permission updates and frontend render/save behavior.
8. Verify i18n coverage for all visible strings.

## Acceptance Criteria

- Admin users with permission can create, edit, and review role permissions.
- Permission changes persist through backend APIs.
- UI communicates unsaved changes, validation errors, and save failures clearly.
- Access to the RBAC UI itself is permission-protected.

## Verification

- Run focused API permission tests.
- Run focused Admin tests for RBAC UI.
- Run `pnpm api:check` and `pnpm admin:check` when both layers changed.
- Use Playwright visual verification when a runtime is available.
- Run GitNexus `detect_changes` before commit.

## Execution Log

- Status: verified
- Last updated: 2026-04-30
- Files changed:
  - `apps/admin/src/api/rbac.ts`
  - `apps/admin/src/pages/settings/context-settings-pages.tsx`
  - `apps/admin/src/pages/workspaces/settings/workspace/permissions/components/workspace-permissions-settings-view.tsx`
  - `apps/admin/src/pages/workspaces/team/roles/components/team-roles-view.tsx`
  - `apps/admin/src/types/api/rbac.ts`
  - `apps/admin/test/pages/settings/context-settings-pages.test.tsx`
  - `apps/admin/test/pages/workspaces/team/roles/team-roles-view.test.tsx`
  - `locales/en-US/team.json`
  - `locales/zh-CN/team.json`
- Implementation notes:
  - Reused the live workspace RBAC API surface instead of adding duplicate backend routes.
  - Added explicit read/write permission gates around the workspace RBAC management UI.
  - Changed role-permission toggles into a local draft matrix with visible save and revert actions.
  - Preserved existing conditional permission grants when saving role permissions and exposed condition counts in the matrix.
  - Added action catalog condition template tags and synchronized `en-US` / `zh-CN` copy.
- Verification:
  - `pnpm -C apps/admin test test/pages/workspaces/team/roles/team-roles-view.test.tsx --run` -> 5 passed.
  - `pnpm -C apps/admin test test/pages/settings/workspace-permissions-settings-view.test.tsx test/pages/settings/context-settings-pages.test.tsx --run` -> 2 files passed, 5 tests passed.
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_rbac_service_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py` -> 17 passed.
  - `pnpm -C apps/admin typecheck` -> passed.
  - `pnpm admin:check` -> lint, format, typecheck, and 232 Admin test files passed; 953 tests passed.
  - `git diff --check` -> passed.
  - GitNexus `detect_changes(scope="all")` -> medium risk, 11 changed files including plan backfill, affected flows limited to `TeamRolesView` and shared RBAC page-loading helpers.
