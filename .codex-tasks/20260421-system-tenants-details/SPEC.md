# Task Specification

> Scope anchor for the task. Update only when goals or constraints change, and log the reason in PROGRESS.md.

## Task Shape

- **Shape**: `single-full`

## Goals

- Add a read-only details experience for `/system/tenants` across `Users`, `Organizations`, `Workspaces`, and `Projects`.
- Keep the current directory list pages as the primary browsing surface and open entity details in a right-side panel.
- Reuse shared Admin shell and overlay primitives instead of creating a second page family.

## Non-Goals

- Write actions, destructive actions, or edit forms
- Tenant-scoped impersonation, billing, quota, or audit timelines
- A separate `/system/tenants/:type/:id` route family
- Placeholder values or hidden fallback states

## Constraints

- Platform area remains super-admin only on frontend and backend.
- Details must stay read-only and use real backend data only.
- Frontend strings must keep using i18n resources in both `zh-CN` and `en-US`.
- Current list browsing flow and scene-aware `/system` shell split must remain intact.
- Validation should stay focused to the touched surfaces.

## Environment

- **Project root**: `/home/philip/arclayer-refactor`
- **Language/runtime**: TypeScript + Python
- **Package manager**: `pnpm`
- **Test framework**: `vitest` + `pytest`
- **Build command**: `pnpm admin:build`
- **Existing test count**: task uses focused slices around system directory surfaces

## Risk Assessment

- [x] External dependencies (APIs, services) — availability confirmed?
- [x] Breaking changes to existing code — impact assessed?
- [x] Large file generation — disk space sufficient?
- [x] Long-running tests — timeout configured?

## Deliverables

- detail endpoints or enriched detail payloads for system directory entities
- shared frontend detail panel flow for the four `/system/tenants` tabs
- row-level affordance that opens the detail panel from the current list surface
- focused frontend and backend tests for the details flow

## Done-When

- [ ] Super admins can open read-only details from each `/system/tenants` tab
- [ ] Details panel renders real data for users, organizations, workspaces, and projects
- [ ] Existing list browsing, tab switching, and settings-shell routing still work
- [ ] Focused backend and frontend validation passes

## Final Validation Command

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/global-nav-regression.test.ts test/layouts/global-layout.test.tsx test/pages/system/system-directory-shell.test.tsx test/pages/system/system-directory-page.test.tsx && timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/system/test_system_directory_router.py
```

## Demo Flow (optional)

1. Sign in as a super admin.
2. Open `/system/tenants/users`.
3. Open one row detail panel from each of the four tabs.
4. Verify the panel content changes with the selected entity and the surrounding list stays in place.
