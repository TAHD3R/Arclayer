# Admin Dialog & Antd Button Conventions (Design)

Date: 2026-03-03

## Goals

1. Remove `@celestial/ui/confirm-dialog` usage from Admin business code.
   - Admin business components render dialog footers themselves with Ant Design `Button`.
2. Normalize dialog content spacing in Admin.
   - Dialog body: parent container uses `grid gap-4`.
   - Each item/section uses `grid gap-1.5`.
3. Standardize Ant Design `Button` usage in Admin.
   - Always set `autoInsertSpace={false}` to avoid extra spacing between two Chinese characters.
   - Prefer plain text children (no redundant wrapper nodes).
   - Icon buttons use Antd `icon` prop (do not place icon components directly inside button children).
4. Improve button affordances (selectively).
   - Add `loading` based on existing pending state where applicable.
   - Add icons where semantics are clear and helpful.

## Non-goals

- Do not change `@celestial/ui/confirm-dialog` implementation in `packages/ui`.
- Do not introduce an Admin-level `Button` wrapper component.
- Do not change Portal/Studio UI patterns unless they already share the same issues.

## Scope

- Code changes are limited to `apps/admin/src/**` (and shared UI only when required for imports/types).
- Dialog refactors focus on files currently importing `@celestial/ui/confirm-dialog` and other common dialog usage sites.

## Approach (Chosen)

Approach A: Update call sites directly (no wrapper).

### Confirm dialogs

Replace `<ConfirmDialog />` usage with explicit `AlertDialog` composition:

- Use styled layout primitives from `@celestial/ui/alert-dialog` (`AlertDialogContent/Header/Footer/Title/Description`).
- Use Radix action/cancel primitives from `@celestial/ui/radix-primitives/radix-alert-dialog` with `asChild`.
- Render Antd `Button` in footer with:
  - `autoInsertSpace={false}`
  - `loading`/`disabled` wired to existing pending state
  - correct `type` (`text` for cancel, `primary` for confirm, `danger` when destructive)

### Dialog content spacing

Inside dialog body:

- Use a single parent container: `className="grid gap-4"`.
- Each logical block uses `className="grid gap-1.5"`.

### Antd Button conventions

Scan `apps/admin/src/**`:

- Add `autoInsertSpace={false}` to every Antd `<Button />` call site.
- Remove redundant wrappers inside buttons when unnecessary.
- Use Antd `icon` prop for icon buttons.
- Add icons/loading for obvious actions based on current semantics and pending state.

## Acceptance criteria

- Admin contains no `@celestial/ui/confirm-dialog` imports.
- All Antd `Button` call sites in Admin set `autoInsertSpace={false}`.
- Dialog bodies in the touched components follow the `grid gap-4` / `grid gap-1.5` spacing rule.
- `pnpm admin:check` passes.

## Validation

- `pnpm admin:check`
