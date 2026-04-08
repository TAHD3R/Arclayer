# Subtask Spec

## Goal

Align Content Library row actions and page copy with backend continuation truth so the workbench opens real content item routes, speaks in user-facing language, and stops presenting sidebar preview semantics as the primary entry posture.

## Scope

- Audit current `Content Library` row-action and page-level in-flight changes against the implementation plan.
- Keep the backend as the source of truth for open-entry posture.
- Update UI copy where the workbench still speaks in implementation-first or preview-first language.
- Validate only the targeted Admin content-library tests needed for this slice.

## Acceptance

- Library primary action opens the real content item route rather than toggling a sidebar preview affordance.
- Library row-action copy reflects item entry semantics, not preview chrome semantics.
- Page copy remains consistent with typed draft / continuation truth introduced in Subtask 1.
- Targeted library tests pass without adding fallback behavior.

## Validation

- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-row-actions.test.tsx`
- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx`
