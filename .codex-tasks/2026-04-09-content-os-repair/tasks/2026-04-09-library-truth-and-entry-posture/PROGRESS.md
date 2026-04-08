# Progress

## Recovery Notes

- Existing dirty files already include:
  - `ContentLibraryRowActions` replacing sidebar-preview affordances with direct item open semantics
  - `ContentLibraryPage` navigating `onOpen` to the item route
  - locale copy updates around content item open and typed bootstrap language
- These changes still require targeted library validation before the subtask can be marked done.

## Audit Log

- 2026-04-09: child task created after Subtask 1 completed and unblocked library-truth work.
- 2026-04-09: verified current in-flight diff replaces sidebar-preview-first row action affordances with direct content item open semantics.
- 2026-04-09: added a local preview-panel mock in `content-library-page.test.tsx` so focused page-route assertions can run without pulling the full article editor CSS/import chain into this subtask.

## Outcome

- `ContentLibraryRowActions` now uses a stable `Open` affordance with `CONTENT_LIBRARY_ACTION_OPEN_ITEM` tooltip copy and no longer flips into a sidebar close affordance.
- `ContentLibraryPage.handleOpenPreview()` now navigates to `workspaceContentLibraryItemPath(workspaceId, row.id)` instead of toggling split preview state.
- Library-facing copy now speaks in item-entry / typed-draft terms rather than sidebar-preview or template-decides-type language.

## Validation

- Passed: `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-row-actions.test.tsx`
- Passed: `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx -t "maximizes the split editor into the library article page route"`

## Notes

- A full run of `test/pages/workspaces/content/content-library-page.test.tsx` still surfaces unrelated pre-existing failures in saved-view/filter/card-mode coverage and a `ContentLibraryRoleTag` presentation crash. Those were not introduced by this subtask and were not widened into scope here.
