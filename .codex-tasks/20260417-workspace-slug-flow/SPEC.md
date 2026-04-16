# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- Add `slug` input, auto-generation, availability feedback, and final normalized-slug submission to the `/workspaces` create dialog.
- Refactor onboarding step 2 to share the same slug generation rules without regressing the current profile-seeded default behavior.
- Add `slugify`-based workspace slug generation with explicit Chinese segmentation support on the admin side.

## Non-Goals

- Changing backend create or availability endpoint semantics beyond thin admin-client wiring.
- Redesigning onboarding flow structure or `/workspaces` page layout beyond the dialog fields and slug behavior.
- Changing workspace settings slug-edit behavior outside onboarding and create dialog.

## Constraints

- Reuse the existing backend endpoints for onboarding and organization workspace slug availability.
- Preserve backend truth by submitting the backend-returned `normalizedSlug` instead of trusting only local normalization.
- Keep the implementation inside the existing admin patterns: React + TanStack Query + Vite + Vitest + existing i18n namespaces.
- Add `slugify` only where it is needed for admin-side slug derivation; avoid widening the dependency surface unnecessarily.

## Environment

- **Project root**: `/home/philip/arclayer-refactor`
- **Language/runtime**: TypeScript / React / Vite
- **Package manager**: `pnpm`
- **Test framework**: `vitest`
- **Build command**: `pnpm -C apps/admin build`
- **Reference plan**: `docs/plans/2026-04-17-001-workspace-slug-flow-implementation-plan.md`

## Risk Assessment

- [x] External dependencies reviewed: `slugify` is a new npm dependency and needs a wrapper because transliteration alone does not solve Chinese segmentation.
- [x] Breaking changes assessed: onboarding default slug behavior and `/workspaces` create flow both have existing tests that must stay green.
- [x] Large-file touch points identified: onboarding page and create dialog already carry flow state, so shared logic extraction should stay surgical.
- [x] Long-running validation bounded: focused admin vitest + `pnpm -C apps/admin typecheck` are sufficient for this task.

## Deliverables

- Shared admin-side workspace slug controller/helper
- `/workspaces` create dialog with slug field and availability flow
- Refactored onboarding step 2 using the shared slug behavior
- Focused tests and i18n updates for slug states and Chinese examples
- Taskmaster truth artifacts for resumable execution

## Done-When

- [ ] `/workspaces` dialog supports `name + description + slug` and sends a validated normalized slug
- [ ] Onboarding preserves profile-seeded slug stability while still supporting name-seeded auto-generation when appropriate
- [ ] Chinese slug examples are covered by focused tests through the shared controller
- [ ] Focused admin validation passes and task artifacts match repo state

## Final Validation Command

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/workspace-slug-controller.test.ts test/api/organization-workspaces.test.ts test/pages/account/workspaces-card-grid.test.tsx test/pages/account/workspaces-dialogs.test.tsx test/pages/account/workspaces-page.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx && pnpm -C apps/admin typecheck
```

## Demo Flow

1. Open `/workspaces`, switch between card/table modes, open the create dialog, and verify slug auto-generation plus availability feedback.
2. Type a Chinese workspace name and verify the slug suggestion is deterministic and editable.
3. Complete onboarding step 2 with a profile-seeded slug and verify name edits do not unexpectedly rewrite that slug.
