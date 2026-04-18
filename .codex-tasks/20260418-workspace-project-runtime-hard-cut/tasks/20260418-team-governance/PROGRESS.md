# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-team-governance`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-team-governance/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: FastAPI / Vite React / TanStack Router / pnpm

## Context Recovery Block

- **Current milestone**: COMPLETE
- **Current status**: DONE
- **Parent milestone**: #5 — Move team governance into settings and add project member control
- **Current artifact**: `TODO.csv`
- **Key context**: Workspace governance now lives under `/settings/workspace/*`, and project member control now lives under `/projects/$projectId/settings/members` with project-scoped member APIs.
- **Known issues**: None inside this child task after milestone verification.
- **Next action**: Return to parent epic and start milestone #6 runtime publish cutover.

## Milestone 1: Repair backend primary project identity contract

- **Status**: DONE
- **What was done**:
  - Added primary project binding to workspace and organization workspace response schemas.
  - Added repository lookup for primary project ids by workspace ids.
  - Created primary project during organization workspace creation.
  - Returned primary project binding from workspace detail and workspace list APIs.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Completed at**: `2026-04-18T11:25:04+08:00`

## Milestone 2: Repair admin project route identity

- **Status**: DONE
- **What was done**:
  - Exported invitation acceptance project identity through the Admin API type surface.
  - Reworked workspace switcher and route helpers to switch by `projectId` while keeping workspace-scoped APIs on `workspaceId`.
  - Updated usercenter workspace helpers, settings icon adapter, and affected fixtures to carry `projectId` and `project` bindings.
  - Narrowed workspace archive/delete dialog contracts to the fields they actually consume so global shell and usercenter flows share the same typed target shape.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
- **Completed at**: `2026-04-18T11:25:04+08:00`

## Milestone 3: Add project member backend API

- **Status**: DONE
- **What was done**:
  - Added the `ProjectMembership` model, migration, schema, repository, and service.
  - Exposed project-scoped members list and role update routes under `/projects/{project_id}/members`.
  - Bootstrapped project memberships from active workspace memberships so existing workspace governance can seed project-level access.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Completed at**: `2026-04-18T11:42:57+08:00`

## Milestone 4: Add project members settings UI

- **Status**: DONE
- **What was done**:
  - Added project members API client and type surface in Admin.
  - Added `/projects/$projectId/settings/members` and wired it into context settings navigation and i18n.
  - Repaired project-aware fixtures for onboarding, post-auth routing, workspace switcher, and workspace settings icon flows.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/settings/context-settings-pages.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/post-auth-routing.test.ts test/components/common/admin-workspace-switcher.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx test/pages/workspaces/workspace-settings-icon-accordion-item.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
- **Completed at**: `2026-04-18T11:42:57+08:00`

## Milestone 5: Run milestone verification and update parent epic

- **Status**: DONE
- **What was done**:
  - Ran targeted regression tests for the project identity cutover and repaired the onboarding workspace store mock to support `setCurrentProjectId`.
  - Re-ran Admin typecheck and the full `admin:check` quality gate after the project members surface landed.
  - Prepared the child task for parent epic closeout.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/post-auth-routing.test.ts test/components/common/admin-workspace-switcher.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx test/pages/workspaces/workspace-settings-icon-accordion-item.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm admin:check` -> exit 0
- **Completed at**: `2026-04-18T11:42:57+08:00`

- **Next step**: Start milestone 6 runtime publish cutover from the parent epic.
