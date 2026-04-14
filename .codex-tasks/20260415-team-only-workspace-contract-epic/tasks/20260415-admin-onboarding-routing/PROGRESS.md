# Child Progress Log

## Context Recovery Block

- **Task**: admin onboarding and post-auth Team-only cleanup
- **Status**: DONE
- **Current step**: completed
- **Truth file**: `.codex-tasks/20260415-team-only-workspace-contract-epic/tasks/20260415-admin-onboarding-routing/TODO.csv`
- **Key context**:
  - Backend onboarding and `/me/workspaces` contracts are already Team-only.
  - Child 3 existed to remove the remaining Personal contract fields from the
    admin onboarding page, workspace API types, and post-auth route resolver.
  - The onboarding flow shape had to stay intact; only step 2 could change.
- **Next action**: move to Child 4 admin switcher and usercenter surface cleanup.

## Completion

- **Completed**: 2026-04-15 02:24
- **What was done**:
  - Removed onboarding `kind` handling and Personal-only fields from
    `apps/admin/src/types/api/workspaces.ts` and
    `apps/admin/src/api/workspaces.ts`.
  - Simplified onboarding step 2 in
    `apps/admin/src/pages/onboarding/workspace-first/page.tsx` so it only
    collects workspace `name + slug` and no longer renders Personal-vs-Team
    choice cards.
  - Removed Personal fallback routing from
    `apps/admin/src/lib/routing/post-auth-routing.ts` while preserving the
    last-workspace, single-workspace, then `/` fallback order.
  - Updated onboarding locale copy in `locales/en-US/onboarding.json` and
    `locales/zh-CN/onboarding.json` to match the Team-only contract.
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/post-auth-routing.test.ts test/pages/onboarding/workspace-first-onboarding-page.test.tsx` → passed
  - `pnpm -C apps/admin typecheck` → passed
- **Notes**:
  - The admin contract is now aligned with the backend hard cut: the workspace
    switcher payload has only Team workspaces and onboarding no longer submits
    a workspace kind.
