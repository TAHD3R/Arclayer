# Subtask Spec

## Goal

Refactor resolver and continuation-facing product surfaces so valid content routes land in real user-facing writing/structured/canvas experiences and blocked items render recovery UX instead of raw debug-first continuation dumps.

## Scope

- Audit resolver-route, structured-surface, site-builder shell, and article-editor page behavior against the implementation plan.
- Identify where page bodies still expose raw continuation metadata, diagnostics, or engineering-first copy.
- Land the smallest coherent slice that moves these surfaces to product-facing behavior without adding fallback logic.

## Acceptance

- Valid writing items open a real article/editor surface.
- Valid structured/canvas items land in product-facing surfaces, not debug dumps.
- Blocked items render recovery messaging with explicit next action instead of raw codes/routes as the primary body.
- Targeted resolver/surface tests pass or any remaining blocker is explicitly documented in `PROGRESS.md`.

## Validation

- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-resolver-route.test.tsx`
- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-structured-surface.test.tsx`
- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-site-builder-shell.test.tsx`
- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
