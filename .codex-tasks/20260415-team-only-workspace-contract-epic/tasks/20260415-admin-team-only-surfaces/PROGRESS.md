# Child Progress Log

## Context Recovery Block

- **Task**: admin switcher, workspaces, and shell Team-only cleanup
- **Status**: DONE
- **Current step**: completed
- **Truth file**: `.codex-tasks/20260415-team-only-workspace-contract-epic/tasks/20260415-admin-team-only-surfaces/TODO.csv`
- **Key context**:
  - Child 4 removed the remaining Personal-only UI branches after Child 3
    aligned the admin contract layer with the backend hard cut.
  - The remaining work lived in the workspace switcher, usercenter
    `/workspaces`, workspace settings basics, route guards, and their focused
    test fixtures.
- **Next action**: move to Child 5 validation and epic artifact close-out.

## Completion

- **Completed**: 2026-04-15 02:24
- **What was done**:
  - Removed Personal status, retry, and tag rendering from
    `apps/admin/src/components/layout/admin-workspace-switcher.tsx`.
  - Deleted the stale Personal workspace tag implementation at
    `apps/admin/src/components/ui/tags/workspace-tags.tsx` and removed the
    corresponding export.
  - Removed Personal-specific list mapping and card/table rendering from
    `apps/admin/src/pages/usercenter/workspaces/**`.
  - Simplified `apps/admin/src/constants/menu/workspaces.ts`,
    `apps/admin/src/routes/w/$workspaceId/team/index.tsx`, and workspace
    settings basics surfaces so they no longer branch on Personal-vs-Team.
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/common/admin-workspace-switcher.test.tsx test/pages/account/workspace-list-items.test.ts test/pages/account/workspaces-card-grid.test.tsx test/routes/workspace-team-route-kind-guard.test.ts test/lib/workspace-nav-regression.test.ts test/pages/workspaces/workspace-settings-basics-form.test.tsx test/pages/destructive-flows/organization-workspace-danger.test.tsx test/components/layout/admin-notifications-panel-width.test.tsx test/components/layout/admin-notifications-panel-motion.test.tsx test/components/layout/admin-notifications-panel-toggle.test.tsx` → passed
  - `pnpm -C apps/admin typecheck` → passed
- **Notes**:
  - Team routes and settings surfaces now stay available for one-owner
    workspaces because the product no longer models that case as a Personal
    exception.
