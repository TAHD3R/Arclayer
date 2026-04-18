# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-admin-ia`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-admin-ia/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: Vite React / TanStack Router / pnpm

## Context Recovery Block

- **Current milestone**: #4 — Run focused admin verification and update task status
- **Current status**: DONE
- **Last completed**: #4 — Run focused admin verification and update task status
- **Current artifact**: `TODO.csv`
- **Key context**: Admin primary IA now exposes `/projects` and `/projects/$projectId/*` entrypoints, rewires project home helpers, and updates switcher/list semantics toward Projects while preserving existing deep workspace page implementations for later phases.
- **Known issues**: Settings shell, team governance, and publish/runtime semantics still need their own hard-cut phases.
- **Next action**: Parent epic child #4 — settings shell cutover.

## Milestone 1: Create admin-ia task artifacts and inspect route ownership

- **Status**: DONE
- **What was done**:
  - Wrote child task artifacts and inspected route ownership across layouts, routing helpers, onboarding, and switcher surfaces.
  - Confirmed `admin-workspace-switcher.tsx` already contained user-owned dirty changes and kept them intact during the cutover.
- **Validation**: `echo inspected` -> exit 0
- **Next step**: Milestone 2 — Add project route shells and project path helpers

## Milestone 2: Add project route shells and project path helpers

- **Status**: DONE
- **What was done**:
  - Added `/projects`, `/projects/$projectId`, `/projects/$projectId/index`, and lazy route shells.
  - Retargeted path helpers and route identity helpers so project home semantics route through `/projects`.
- **Validation**: `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/layouts/sidebar-route-state.test.tsx` -> exit 0
- **Files changed**:
  - `apps/admin/src/routes/projects/index.tsx`
  - `apps/admin/src/routes/projects/$projectId.tsx`
  - `apps/admin/src/routes/projects/$projectId/index.tsx`
  - `apps/admin/src/routes/projects/$projectId/index.lazy.tsx`
  - `apps/admin/src/lib/routing/workspace-routing.ts`
  - `apps/admin/src/lib/routing/route-identity.ts`
  - `apps/admin/src/routes/workspaces/index.tsx`
- **Next step**: Milestone 3 — Retarget workspaces list page and workspace switcher semantics

## Milestone 3: Retarget workspaces list page and workspace switcher semantics

- **Status**: DONE
- **What was done**:
  - Retargeted `/workspaces` semantics, global/home layouts, notifications routing, command palette, onboarding, invitations, and workspaces usercenter entry toward project-first IA.
  - Made project-oriented switcher visibility available in global layout contexts while preserving the existing user-owned switcher edits.
  - Updated i18n copy from workspace-list semantics toward project-list semantics.
- **Validation**: `pnpm -C apps/admin typecheck` -> exit 0
- **Files changed**:
  - `apps/admin/src/components/layout/admin-workspace-switcher.tsx`
  - `apps/admin/src/layouts/admin-layout.tsx`
  - `apps/admin/src/layouts/global-layout.tsx`
  - `apps/admin/src/hooks/use-admin-command-palette.ts`
  - `apps/admin/src/pages/home/page.tsx`
  - `apps/admin/src/pages/onboarding/workspace-first/page.tsx`
  - `apps/admin/src/pages/usercenter/workspaces/page.tsx`
  - `locales/en-US/account.json`
  - `locales/en-US/command.json`
  - `locales/en-US/common.json`
  - `locales/zh-CN/account.json`
  - `locales/zh-CN/command.json`
  - `locales/zh-CN/common.json`
- **Next step**: Milestone 4 — Run focused admin verification and update task status

## Milestone 4: Run focused admin verification and update task status

- **Status**: DONE
- **What was done**:
  - Fixed route-tree `staticData` ownership for the new lazy project index route.
  - Stabilized side-nav open-chain state updates to stop unnecessary rerender loops under unstable test dependencies.
  - Repaired route/nav regression tests and added test-environment timer cleanup so full Vitest runs no longer fail on OTP teardown timers.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav-capabilities.test.tsx --reporter=dot` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/route-identity.test.ts test/lib/workspace-nav-regression.test.ts test/layouts/sidebar-route-state.test.tsx test/lib/workspace-routing.test.ts test/lib/post-auth-routing.test.ts test/lib/global-nav-regression.test.ts test/lib/routing/inbox-source.test.ts test/components/layout/topbar-sidebar-toggle-icon.test.tsx test/components/common/admin-workspace-switcher.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx test/routes/route-title-registry.test.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-capabilities.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
  - `env NODE_OPTIONS=--max-old-space-size=8192 pnpm admin:check` -> exit 0
- **Files changed**:
  - `apps/admin/src/routes/projects/$projectId/index.lazy.tsx`
  - `apps/admin/src/components/layout/admin-side-nav/admin-sider-nav.tsx`
  - `apps/admin/test/components/layout/admin-side-nav-capabilities.test.tsx`
  - `apps/admin/test/setup.ts`
  - `apps/admin/test/pages/workspaces/assets/assets-page-view.test.tsx`
  - `apps/admin/test/components/layout/floating-panel-animation-config.test.tsx`
  - `apps/admin/test/pages/me/user-profile-view.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
  - `apps/admin/test/components/layout/admin-notifications-panel-motion.test.tsx`
- **Next step**: Parent epic child #4 — settings shell cutover
