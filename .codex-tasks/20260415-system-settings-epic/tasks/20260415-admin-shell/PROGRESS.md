# Progress

## 2026-04-15 02:04 CST

### Milestone Completion

- Added `useCurrentUserProfile()` so global surfaces can read `/auth/me` once and derive `isSuperAdmin` without duplicating query wiring.
- Replaced the deprecated global settings placeholder with a real `global.system` nav item plus `resolveGlobalNavItems()`.
- Updated `GlobalLayout` to feed the same filtered nav items into both `AdminTopbar` and `AdminSceneLayout`.
- Extended route identity so `/system/*` is now part of the global scene.

### Verification

- `pnpm -C apps/admin exec vitest run test/lib/global-nav-regression.test.ts test/layouts/global-layout.test.tsx test/lib/route-identity.test.ts`
  - PASS

### Notes

- The focused layout test initially failed because the `AdminSceneLayout` test double did not invoke `renderTopbar`; that gap was fixed rather than weakening the assertions.
