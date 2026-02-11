# Admin Frontend Remediation Plan Execution (2026-02-11)

## Scope

- Package: `@celestial/admin`
- Keep organization pages in `src/pages/organization`.
- Move workspace-scoped pages to `src/pages/workspaces`.
- Standardize dialog/sheet/alert shell behavior.
- Centralize test files under `apps/web/admin/test`.
- Fix Antd `Select` popup parent issues in Radix overlays.

## Completed Work

### 1) Page structure normalization

Workspace-scoped modules were moved from mixed locations into:

- `src/pages/workspaces/team/*`
- `src/pages/workspaces/settings/*`
- `src/pages/workspaces/assets/*`
- `src/pages/workspaces/appearance/*`
- `src/pages/workspaces/content/*`
- `src/pages/workspaces/dashboard/*`
- `src/pages/workspaces/plugins/installed/*`

Route/page imports were updated while keeping route URLs unchanged.

### 2) Organization pages de-monolith and componentization

Major organization pages were split into focused modules:

- `organization/team/invitations/page.tsx`
  - `invitations-columns.tsx`
  - `invitations-dialogs.tsx`
  - `invitations-constants.ts`
  - `use-organization-team-invitations.ts`
- `organization/team/roles/page.tsx`
  - `roles-display.ts`
  - `roles-matrix-table.tsx`
  - `roles-dialogs.tsx`
  - `permission-copy-map.ts`
- `organization/team/members/page.tsx`
  - `use-organization-team-members.ts`
  - `members-toolbar.tsx`
  - `members-table-columns.tsx`
  - `members-table-section.tsx`
  - `members-dialogs.tsx`
- `organization/workspaces/page.tsx`
  - `organization-workspaces-toolbar.tsx`
  - `organization-workspaces-dialogs.tsx`
  - `use-organization-workspaces-columns.tsx`
  - `use-organization-workspaces-mutations.ts`
  - `use-organization-workspaces-tables.ts`
- `organization/team/shared/organization-member-inspect-sheet.tsx`
  - `organization-member-inspect-role-tab.tsx`
  - `organization-member-inspect-workspaces-tab.tsx`
  - `organization-member-inspect-activity-tab.tsx`
  - `use-organization-member-inspect-activity.ts`

`organization/members/page.tsx` was also split:

- `organization/members/members-columns.tsx`
- `organization/members/invite-organization-member-dialog.tsx`

Additional cleanup:

- Removed inline style usage in organization pages and shared organization subcomponents.
- Replaced style-based spacing with class-based styles.
- Replaced role/status hardcoded rendering in organization pages with i18n-backed labels.
- All organization page entry files now remain under maintainable size target (`< 300` lines).

### 3) Dialog and overlay consistency

Updated shared UI primitives:

- `components/ui/dialog.tsx`
- `components/ui/sheet.tsx`
- `components/ui/alert-dialog.tsx`

Changes:

- Header includes default border and spacing.
- Footer includes default border and spacing.
- Content keeps unified baseline spacing behavior.

Added shared dialog body base:

- `components/common/dialog/standard-dialog-layout.tsx`

and adopted it in `components/common/setting-dialog.tsx`.

Input dialogs were audited to ensure `DialogTitle` + `DialogDescription` are present.

### 4) Antd Select + Radix parent handling

Added shared helper entry:

- `src/lib/antd/get-popup-container.ts`
- `src/lib/antd/popup-container.ts`

Integrated globally in app shell:

- `providers/app-providers.tsx` via `ConfigProvider.getPopupContainer`

Applied explicit `getPopupContainer` usage in overlay-heavy dialogs/popovers/sheets.

### 5) Shared permission copy-map reuse

Unified organization permission copy map into a single source:

- `organization/team/shared/permission-copy-map.ts`

Consumers now reuse this map:

- `organization/team/members/members-display.ts`
- `organization/team/roles/roles-display.ts`
- `organization/team/roles/permission-copy-map.ts` (re-export compatibility)

### 6) Test file consolidation

Moved frontend tests to `apps/web/admin/test` with mirrored source structure.

Updated:

- `apps/web/admin/vitest.config.ts` (`setupFiles`, `include`)
- `apps/web/admin/tsconfig.json` (`include`, `@test/*` mapping)

Removed migrated empty directories under `apps/web/admin/src/pages/**`.

## Verification and Results

### Quality gates

Executed successfully:

- `pnpm --filter @celestial/admin typecheck`
- `pnpm --filter @celestial/admin lint`
- `pnpm --filter @celestial/admin test -- --testTimeout=60000`

Result summary:

- Typecheck: pass
- Lint: pass (0 warnings / 0 errors)
- Test: pass (`18` files, `56` tests)

### Automated remediation checks

Executed script-based audits:

- No `*.test.*` files remain under `apps/web/admin/src`.
- Dialog blocks containing input/select controls include `DialogDescription`.
- Overlay blocks (`DialogContent`/`SheetContent`/`PopoverContent`) with Antd `Select` use `getPopupContainer` handling.
- No inline `style={{...}}` remains under `apps/web/admin/src/pages/organization`.
- No empty directories remain under `apps/web/admin/src/pages`.

## Notes

- This remediation worktree intentionally includes structural moves plus behavior-preserving extraction.
- A companion status file is also maintained at `docs/plan/2026-02-11-admin-org-remediation-plan.md`.
