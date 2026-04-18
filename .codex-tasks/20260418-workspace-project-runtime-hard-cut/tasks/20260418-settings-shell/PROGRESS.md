# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `20260418-settings-shell`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/tasks/20260418-settings-shell/`
- **Spec**: `SPEC.md`
- **Plan**: `TODO.csv`
- **Environment**: Vite React / TanStack Router / pnpm

## Context Recovery Block

- **Current milestone**: all child milestones complete
- **Current status**: DONE
- **Last completed**: #4 — Run admin verification and update parent epic status
- **Current artifact**: `TODO.csv`
- **Key context**: Workspace and project settings now live under distinct page-native route groups, and workspace team governance is folded into `/settings/workspace/*`.
- **Known issues**: Project-level member governance remains a later milestone. Legacy `/w/$workspaceId/settings/*` and `/w/$workspaceId/team/*` routes still exist and will be removed in later cutover milestones.
- **Next action**: Hand control back to the parent epic and begin Milestone 5 team governance follow-through.

## Milestone 1: Inspect current settings and team route ownership

- **Status**: DONE
- **What was done**:
  - Audited the current `/settings` tree and confirmed it only hosts the personal overlay bridge plus `/settings/personal/*`.
  - Audited legacy workspace settings ownership and confirmed old workspace/site pages still live under `/w/$workspaceId/settings/workspace/*`, `/w/$workspaceId/settings/site/*`, and `/w/$workspaceId/settings/seo`.
  - Audited team ownership and confirmed members, invitations, and roles still live under `/w/$workspaceId/team/*`, with invitations and roles already supporting `workspaceIdOverride` while members still depend on store context.
  - Audited menu and route-entry drift and confirmed `settings.ts`, `workspaces.ts`, command palette, and notification targets still expose old workspace/site/team semantics.
- **Validation**: `echo inspected` -> exit 0
- **Files inspected**:
  - `apps/admin/src/pages/settings/settings-shell.tsx`
  - `apps/admin/src/constants/menu/settings.ts`
  - `apps/admin/src/constants/menu/workspaces.ts`
  - `apps/admin/src/pages/workspaces/settings/workspace/**`
  - `apps/admin/src/pages/workspaces/settings/site/**`
  - `apps/admin/src/pages/workspaces/team/**`
  - `apps/admin/src/routes/settings/**`
  - `apps/admin/src/routes/w/$workspaceId/settings/**`
  - `apps/admin/src/routes/w/$workspaceId/team/**`
  - `apps/admin/src/hooks/use-admin-command-palette.ts`
  - `apps/admin/src/lib/routing/notification-target.ts`
- **Next step**: Milestone 2 — Build context-aware settings shell groups for workspace and project

## Milestone 2: Build context-aware settings shell groups for workspace and project

- **Status**: DONE
- **What was done**:
  - Added a page-native `ContextSettingsShell` aligned with the personal settings surface hierarchy.
  - Added dedicated workspace settings routes under `/settings/workspace/general|members|invitations|roles`.
  - Added project settings routes under `/projects/$projectId/settings/general|domain|localization|seo|api-keys|runtime`.
  - Embedded the existing workspace basics and general settings forms into the new shell without preserving the old tabbed page chrome.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/workspace-settings-utils.test.ts test/pages/workspaces/workspace-settings-basics-view.test.tsx` -> exit 0
- **Files changed**:
  - `apps/admin/src/constants/menu/settings.ts`
  - `apps/admin/src/pages/settings/context-settings-shell.tsx`
  - `apps/admin/src/pages/settings/context-settings-pages.tsx`
  - `apps/admin/src/pages/workspaces/settings/site/components/general-settings-shell.tsx`
  - `apps/admin/src/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view.tsx`
  - `apps/admin/src/routes/settings/workspace/**`
  - `apps/admin/src/routes/projects/$projectId/settings/**`
  - `apps/admin/test/pages/settings/context-settings-pages.test.tsx`
- **Next step**: Milestone 3 — Move team settings surfaces into the new settings information architecture

## Milestone 3: Move team settings surfaces into the new settings information architecture

- **Status**: DONE
- **What was done**:
  - Rehosted workspace members, invitations, and roles inside `/settings/workspace/*`.
  - Added workspace override support to `TeamMembersView`.
  - Updated workspace navigation, switcher actions, command palette member search, notification target routing, and favorite template resolution to use the new IA.
  - Updated related i18n strings and sidebar regression coverage to reflect project-first settings semantics.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/team/team-members-layout.test.ts test/pages/workspaces/team/team-invitations-layout.test.ts test/pages/workspaces/team/roles/team-roles-view.test.tsx test/lib/workspace-nav-regression.test.ts test/components/layout/admin-side-nav.test.tsx test/components/common/admin-workspace-switcher.test.tsx` -> exit 0
- **Files changed**:
  - `apps/admin/src/pages/workspaces/team/members/components/team-members-view.tsx`
  - `apps/admin/src/constants/menu/workspaces.ts`
  - `apps/admin/src/hooks/use-admin-command-palette.ts`
  - `apps/admin/src/lib/routing/notification-target.ts`
  - `apps/admin/src/lib/routing/workspace-routing.ts`
  - `apps/admin/src/components/layout/admin-side-nav/favorite-nav-items.ts`
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx`
  - `apps/admin/test/components/layout/favorite-nav-items.test.ts`
  - `apps/admin/test/lib/workspace-nav-regression.test.ts`
  - `apps/admin/test/pages/destructive-flows/organization-workspace-danger.test.tsx`
  - `locales/en-US/account.json`
  - `locales/zh-CN/account.json`
  - `locales/en-US/nav.json`
  - `locales/zh-CN/nav.json`
- **Next step**: Milestone 4 — Run admin verification and update parent epic status

## Milestone 4: Run admin verification and update parent epic status

- **Status**: DONE
- **What was done**:
  - Regenerated route tree through the normal admin toolchain.
  - Verified the new settings shell and team IA through focused Vitest coverage and the full admin quality gate.
  - Prepared the child task for parent-epic completion.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm admin:check` -> exit 0
- **Next step**: parent epic Milestone 4 can be marked complete
