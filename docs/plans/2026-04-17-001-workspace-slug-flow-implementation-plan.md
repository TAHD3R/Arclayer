# Implementation Plan: Workspace Slug Flow Across Onboarding And Create Dialog

## Overview

Extend the `/workspaces` create dialog so it collects `name + description + slug`, checks slug availability before creation, and submits the normalized slug to the existing organization workspace create API. At the same time, refactor onboarding step 2 to share the same slug generation rules without regressing the current default-data behavior: onboarding should keep the profile-seeded slug stable when the user edits the default workspace name, while dialog mode should keep the slug synced to the name until the user edits the slug explicitly. The implementation should add `slugify` on the admin side, wrap it in a shared workspace-slug controller, and preserve backend truth by re-checking availability at submit time.

## Architecture Decisions

- Reuse the existing backend contracts instead of inventing new endpoints. The current repo already exposes `GET /api/v1/me/workspaces/onboarding/slug-availability`, `GET /api/v1/organizations/me/workspaces/slug-availability`, `POST /api/v1/me/workspaces/onboarding`, and `POST /api/v1/organizations/me/workspaces`.
- Introduce one shared admin-side slug controller for workspace creation surfaces. The controller should own normalization, debounced availability triggers, and the slug provenance state instead of duplicating onboarding-specific logic inside the dialog.
- Model slug provenance explicitly. The shared state should distinguish at least:
  - `profile-seed`: onboarding default slug derived from stable user information such as `username`
  - `name-seed`: slug auto-derived from the editable workspace name
  - `manual`: slug manually edited by the user
- Use `slugify` as the transliteration and ASCII normalization layer. Because `slugify` alone does not provide trustworthy Chinese word segmentation, wrap it with `Intl.Segmenter`-based preprocessing for CJK names before passing the text into `slugify`.
- Keep final backend truth on submit. Availability badges can be optimistic and debounced, but the create mutation should always call the availability endpoint one more time and submit `normalizedSlug` from the server response.
- Preserve the current onboarding cadence. This task changes slug mechanics inside step 2; it does not add new onboarding steps or new post-create flows.

## Task List

### Phase 1: Shared Slug Foundation

- [ ] Task 1: Add a shared workspace slug helper/controller for admin surfaces
- [ ] Task 2: Add organization workspace slug-availability client wiring and shared reason handling

### Checkpoint: Shared Slug Foundation

- [ ] One shared controller can express `profile-seed`, `name-seed`, and `manual` behavior
- [ ] The admin app can call both onboarding and organization slug-availability endpoints through explicit API helpers

### Phase 2: Onboarding Convergence

- [ ] Task 3: Refactor onboarding step 2 onto the shared slug controller
- [ ] Task 4: Add onboarding regression coverage for seeded-slug stability and Chinese slug generation

### Checkpoint: Onboarding Convergence

- [ ] Onboarding still prefills workspace name from profile/language defaults
- [ ] Onboarding keeps the profile-seeded slug stable when the user edits the default workspace name
- [ ] Onboarding still blocks create when slug is invalid, reserved, taken, or unavailable

### Phase 3: `/workspaces` Create Dialog

- [ ] Task 5: Extend the create dialog form to collect slug, show availability state, and submit normalized slug
- [ ] Task 6: Add focused dialog/page regression tests and sync copy/i18n

### Checkpoint: Complete

- [ ] `/workspaces` dialog supports `name + description + slug`
- [ ] Dialog auto-generates slug from name until the user edits slug explicitly
- [ ] Chinese names produce deterministic slug suggestions through the shared controller
- [ ] Focused admin verification passes

## Detailed Task Breakdown

## Task 1: Add a shared workspace slug helper/controller for admin surfaces

**Description:** Create a shared admin utility or hook that owns workspace slug derivation rules. It should expose normalized slug text, whether the slug is still auto-managed, and state transitions for `profile-seed`, `name-seed`, and `manual` flows.

**Acceptance criteria:**

- [ ] Shared workspace slug logic lives outside the onboarding page and create dialog component
- [ ] The controller preserves profile-seeded slug values when the user edits the workspace name
- [ ] The controller keeps name-derived slugs synced until the user edits the slug manually

**Verification:**

- [ ] Tests pass: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/workspace-slug-controller.test.ts`

**Dependencies:** None

**Files likely touched:**

- `apps/admin/src/lib/workspaces/*`
- `apps/admin/test/lib/workspace-slug-controller.test.ts`

**Estimated scope:** Medium

## Task 2: Add organization workspace slug-availability client wiring and shared reason handling

**Description:** Add a client helper for the existing organization slug-availability endpoint and keep its response shape aligned with the onboarding helper so the shared controller can consume one consistent availability contract.

**Acceptance criteria:**

- [ ] Admin API layer exposes an organization workspace slug-availability helper
- [ ] Shared types cover normalized slug plus `invalid | reserved | exists | null`
- [ ] No new backend endpoint is introduced for this task

**Verification:**

- [ ] Tests pass: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/api/organization-workspaces.test.ts`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/admin/src/api/organization-workspaces.ts`
- `apps/admin/src/types/api/organization-workspaces.ts`
- `apps/admin/test/api/organization-workspaces.test.ts`

**Estimated scope:** Small

## Task 3: Refactor onboarding step 2 onto the shared slug controller

**Description:** Replace the onboarding page’s local regex-based slug state with the shared slug controller while preserving the current default data behavior from `profile.username`, `displayName`, and locale-specific workspace-name defaults.

**Acceptance criteria:**

- [ ] Onboarding still defaults workspace name from user/profile locale logic
- [ ] Onboarding defaults slug from stable user information when available
- [ ] Editing the default workspace name does not overwrite a profile-seeded slug unless the slug is still name-seeded

**Verification:**

- [ ] Tests pass: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/onboarding/workspace-first-onboarding-page.test.tsx`

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- `apps/admin/src/pages/onboarding/workspace-first/page.tsx`
- `apps/admin/test/pages/onboarding/workspace-first-onboarding-page.test.tsx`

**Estimated scope:** Medium

## Task 4: Add onboarding regression coverage for seeded-slug stability and Chinese slug generation

**Description:** Lock the tricky state edges with focused tests: username-seeded onboarding slugs, name-seeded fallback when username is missing, manual slug edits, and representative Chinese names.

**Acceptance criteria:**

- [ ] Tests prove username-seeded slug stays stable across workspace-name edits
- [ ] Tests prove name-seeded slug follows name changes until manual edit
- [ ] Tests prove representative Chinese names produce deterministic slug suggestions

**Verification:**

- [ ] Tests pass: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/workspace-slug-controller.test.ts test/pages/onboarding/workspace-first-onboarding-page.test.tsx`

**Dependencies:** Task 3

**Files likely touched:**

- `apps/admin/test/lib/workspace-slug-controller.test.ts`
- `apps/admin/test/pages/onboarding/workspace-first-onboarding-page.test.tsx`

**Estimated scope:** Small

## Task 5: Extend the create dialog form to collect slug, show availability state, and submit normalized slug

**Description:** Add a slug field to the `/workspaces` create dialog, wire debounced availability checks against the organization endpoint, preserve name-derived auto-sync until manual slug edit, and send the normalized slug with the create mutation.

**Acceptance criteria:**

- [ ] Create dialog collects `name + description + slug`
- [ ] Dialog shows required / checking / available / unavailable states for slug
- [ ] Create submit performs a final availability check and submits the returned normalized slug

**Verification:**

- [ ] Tests pass: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/account/workspaces-dialogs.test.tsx test/pages/account/workspaces-page.test.tsx`

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- `apps/admin/src/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs.tsx`
- `apps/admin/src/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations.ts`
- `apps/admin/src/pages/usercenter/workspaces/page.tsx`
- `apps/admin/test/pages/account/workspaces-dialogs.test.tsx`
- `apps/admin/test/pages/account/workspaces-page.test.tsx`

**Estimated scope:** Medium

## Task 6: Add focused dialog/page regression tests and sync copy/i18n

**Description:** Add dialog-local copy for slug field/help/status, keep onboarding copy truthful, and ensure the new dialog does not regress the recently changed `/workspaces` button placement rules.

**Acceptance criteria:**

- [ ] `common` locale files include dialog-ready slug field/help/status copy
- [ ] Focused account/onboarding tests cover the new slug behaviors
- [ ] `/workspaces` table/card create entry behavior remains unchanged after the dialog expansion

**Verification:**

- [ ] Tests pass: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/account/workspaces-card-grid.test.tsx test/pages/account/workspaces-dialogs.test.tsx test/pages/account/workspaces-page.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx`
- [ ] Typecheck succeeds: `pnpm -C apps/admin typecheck`

**Dependencies:** Task 4, Task 5

**Files likely touched:**

- `locales/en-US/common.json`
- `locales/zh-CN/common.json`
- `apps/admin/test/pages/account/*.test.tsx`
- `apps/admin/test/pages/onboarding/workspace-first-onboarding-page.test.tsx`

**Estimated scope:** Medium

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frontend slug generation diverges from backend parsing | High | Always run a final availability call and submit the backend-returned `normalizedSlug` |
| `slugify` transliteration alone gives poor Chinese token boundaries | High | Pre-segment CJK text with `Intl.Segmenter` before passing tokens into `slugify`, then lock examples in tests |
| Onboarding has multiple auto-fill sources that can fight each other | Medium | Introduce explicit slug provenance state instead of inferring from field emptiness alone |
| Dialog and onboarding need different auto-sync behavior | Medium | Keep one shared controller with explicit seed mode rather than two separate ad hoc implementations |

## Open Questions

- No product-level open question blocks implementation. If `slugify + Intl.Segmenter` still produces unacceptable Chinese output for real examples during implementation, the task should stop on that evidence and tighten the normalization strategy before wider rollout.
