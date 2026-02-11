# Admin Organization Remediation Plan Execution (2026-02-11)

This document tracks the implementation of the organization/workspace page governance plan for `@celestial/admin`.

## Scope Lock

- Keep organization pages in `src/pages/organization/**`.
- Move workspace-scoped pages into `src/pages/workspaces/**` without URL changes.
- Standardize dialog shells and fix Select popup parent behavior in overlay containers.
- Centralize frontend tests into `apps/web/admin/test/**`.

## Delivery Matrix

- ✅ Directory normalization completed (workspace pages moved under `pages/workspaces/**`).
- ✅ Route imports updated to new page module locations while preserving route paths.
- ✅ Organization pages de-monolith completed for members/invitations/roles/workspaces.
- ✅ Dialog/Sheet/AlertDialog shell style normalized (header/footer border, consistent spacing).
- ✅ Overlay popup container helper applied globally and in high-risk local overlays.
- ✅ Test files migrated under `apps/web/admin/test/**` with `vitest` and TS config updates.
- ✅ Empty legacy page directories removed from `src/pages/**` after migration.

## Key Artifacts

- Popup helper: `src/lib/antd/get-popup-container.ts` and `src/lib/antd/popup-container.ts`
- Dialog layout base: `src/components/common/dialog/standard-dialog-layout.tsx`
- Execution log: `docs/plan/2026-02-11-admin-pages-remediation.md`

## Validation

- `pnpm --filter @celestial/admin typecheck`
- `pnpm --filter @celestial/admin lint`
- `pnpm --filter @celestial/admin test -- --testTimeout=60000`

All commands pass on the current remediation worktree.
