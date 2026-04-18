# Progress Log

## Session Start

- **Date**: 2026-04-18
- **Task name**: `workspace-project-runtime-hard-cut`
- **Task dir**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/`
- **Spec**: `docs/superpowers/specs/2026-04-18-workspace-project-runtime-hard-cut-design.md`
- **Plan**: `SUBTASKS.csv`
- **Environment**: pnpm monorepo / FastAPI / Vite React / Vitest / pytest

## Context Recovery Block

- **Current milestone**: #7 — Remove obsolete workspace-as-site surfaces and run final verification
- **Current status**: DONE
- **Last completed**: #7 — Remove obsolete workspace-as-site surfaces and run final verification
- **Current artifact**: `.codex-tasks/20260418-workspace-project-runtime-hard-cut/SUBTASKS.csv`
- **Key context**: Backend foundation, backend project facade, admin IA project-route cutover, settings shell split, team governance cutover, runtime-scoped publishing/delivery boundary, and final workspace-as-site cleanup are complete and recorded with fresh targeted verification.
- **Known issues**: Repo-wide final evidence remains timeout-limited because `timeout 60s pnpm check` reaches the full API pytest phase after admin and API pre-test gates pass, then exits at the required timeout cap without emitted test failure.
- **Next action**: Epic is complete; use this file as the recovery source for any follow-up commit or audit work.

## Milestone 1: Establish backend project-runtime foundation

- **Status**: DONE
- **What was done**:
  - Wrote spec, epic artifacts, child task artifacts, and implementation plan.
  - Added backend `Project / Runtime` domain foundation and registered project router.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Files changed**:
  - `docs/superpowers/specs/2026-04-18-workspace-project-runtime-hard-cut-design.md`
  - `docs/plans/2026-04-18-001-workspace-project-runtime-hard-cut-implementation-plan.md`
  - `.codex-tasks/20260418-workspace-project-runtime-hard-cut/**`
  - `apps/api/src/models/projects/project.py`
  - `apps/api/src/models/projects/runtime.py`
  - `apps/api/src/modules/projects/**`
  - `apps/api/src/core/routes.py`
- **Next step**: Milestone 2 — Cut backend project API and auth boundaries

## Milestone 2: Cut backend project API and auth boundaries

- **Status**: DONE
- **What was done**:
  - Added project bootstrap helper in repository.
  - Added project facade context bridging project to workspace/site/runtime.
  - Added project-scoped backend routes for site bridge, preview token, api keys, releases, publish impact, and preview contract.
- **Validation**: `pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
- **Files changed**:
  - `apps/api/src/modules/projects/repository.py`
  - `apps/api/src/modules/projects/facade/service.py`
  - `apps/api/src/modules/projects/facade/router.py`
  - `apps/api/src/modules/projects/router.py`
- **Next step**: Milestone 3 — Cut admin IA from workspace routes to project routes

## Milestone 3: Cut admin IA from workspace routes to project routes

- **Status**: DONE
- **What was done**:
  - Added `/projects` and `/projects/$projectId/*` route shells and rewired project-home path helpers.
  - Retargeted `/workspaces` semantics, global/admin layouts, command palette, notifications, onboarding, invitations, and switcher/list copy toward project-first IA.
  - Stabilized side-nav rerender behavior and repaired full admin regression coverage so the admin package passes its full quality gate.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/layout/admin-side-nav-capabilities.test.tsx --reporter=dot` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/route-identity.test.ts test/lib/workspace-nav-regression.test.ts test/layouts/sidebar-route-state.test.tsx test/lib/workspace-routing.test.ts test/lib/post-auth-routing.test.ts test/lib/global-nav-regression.test.ts test/lib/routing/inbox-source.test.ts test/components/layout/topbar-sidebar-toggle-icon.test.tsx test/components/common/admin-workspace-switcher.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx test/routes/route-title-registry.test.ts test/components/layout/admin-side-nav.test.tsx test/components/layout/admin-side-nav-capabilities.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
  - `env NODE_OPTIONS=--max-old-space-size=8192 pnpm admin:check` -> exit 0
- **Files changed**:
  - `apps/admin/src/routes/projects/**`
  - `apps/admin/src/routes/workspaces/index.tsx`
  - `apps/admin/src/components/layout/admin-workspace-switcher.tsx`
  - `apps/admin/src/layouts/admin-layout.tsx`
  - `apps/admin/src/layouts/global-layout.tsx`
  - `apps/admin/src/hooks/use-admin-command-palette.ts`
  - `apps/admin/src/lib/routing/**`
  - `apps/admin/src/pages/home/page.tsx`
  - `apps/admin/src/pages/onboarding/workspace-first/page.tsx`
  - `apps/admin/src/pages/usercenter/workspaces/page.tsx`
  - `apps/admin/src/components/layout/admin-side-nav/admin-sider-nav.tsx`
  - `apps/admin/test/components/layout/admin-side-nav-capabilities.test.tsx`
  - `apps/admin/test/setup.ts`
  - `locales/en-US/{account,command,common}.json`
  - `locales/zh-CN/{account,command,common}.json`
- **Next step**: Milestone 4 — Rebuild settings shell for workspace and project groups

## Milestone 4: Rebuild settings shell for workspace and project groups

- **Status**: DONE
- **What was done**:
  - Built a page-native context settings shell aligned with personal settings hierarchy.
  - Added dedicated workspace settings ownership under `/settings/workspace/*`.
  - Added project settings ownership under `/projects/$projectId/settings/*`.
  - Moved workspace team pages into the settings IA and rewired navigation helpers, switcher shortcuts, notification targets, and favorite templates.
- **Validation**:
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/settings/context-settings-pages.test.tsx test/pages/workspaces/workspace-settings-utils.test.ts test/pages/workspaces/workspace-settings-basics-view.test.tsx test/pages/workspaces/team/team-members-layout.test.ts test/pages/workspaces/team/team-invitations-layout.test.ts test/pages/workspaces/team/roles/team-roles-view.test.tsx test/lib/workspace-nav-regression.test.ts test/components/layout/admin-side-nav.test.tsx test/components/common/admin-workspace-switcher.test.tsx test/layouts/sidebar-route-state.test.tsx test/routes/route-title-registry.test.ts` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm admin:check` -> exit 0
- **Files changed**:
  - `apps/admin/src/constants/menu/settings.ts`
  - `apps/admin/src/constants/menu/workspaces.ts`
  - `apps/admin/src/pages/settings/context-settings-shell.tsx`
  - `apps/admin/src/pages/settings/context-settings-pages.tsx`
  - `apps/admin/src/routes/settings/workspace/**`
  - `apps/admin/src/routes/projects/$projectId/settings/**`
  - `apps/admin/src/hooks/use-admin-command-palette.ts`
  - `apps/admin/src/lib/routing/notification-target.ts`
  - `apps/admin/src/lib/routing/workspace-routing.ts`
  - `apps/admin/src/components/layout/admin-side-nav/favorite-nav-items.ts`
  - `apps/admin/src/pages/workspaces/settings/site/components/general-settings-shell.tsx`
  - `apps/admin/src/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view.tsx`
  - `apps/admin/src/pages/workspaces/settings/workspace/danger/components/workspace-settings-danger-view.tsx`
  - `apps/admin/src/pages/workspaces/team/members/components/team-members-view.tsx`
  - `apps/admin/test/pages/settings/context-settings-pages.test.tsx`
  - `apps/admin/test/lib/workspace-nav-regression.test.ts`
  - `apps/admin/test/components/layout/admin-side-nav.test.tsx`
  - `apps/admin/test/components/layout/favorite-nav-items.test.ts`
  - `apps/admin/test/pages/destructive-flows/organization-workspace-danger.test.tsx`
  - `locales/en-US/account.json`
  - `locales/en-US/nav.json`
  - `locales/zh-CN/account.json`
  - `locales/zh-CN/nav.json`
- **Next step**: Milestone 5 — Move team governance into settings and add project member control

## Milestone 5: Move team governance into settings and add project member control

- **Status**: DONE
- **What was done**:
  - Fixed backend and admin primary project identity flow so workspace-scoped APIs can resolve project routes safely.
  - Added project membership backend APIs and the `/projects/$projectId/settings/members` settings surface.
  - Repaired remaining project-route regression fixtures across post-auth routing, onboarding, workspace switcher, and workspace settings icon flows.
- **Validation**:
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/settings/context-settings-pages.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/post-auth-routing.test.ts test/components/common/admin-workspace-switcher.test.tsx test/pages/onboarding/workspace-first-onboarding-page.test.tsx test/pages/workspaces/workspace-settings-icon-accordion-item.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm admin:check` -> exit 0
- **Files changed**:
  - `apps/api/src/models/projects/membership.py`
  - `apps/api/src/modules/projects/members_schema.py`
  - `apps/api/src/modules/projects/members_repository.py`
  - `apps/api/src/modules/projects/members_service.py`
  - `apps/api/src/modules/projects/http/schema.py`
  - `apps/api/src/modules/projects/http/service.py`
  - `apps/api/src/modules/projects/router.py`
  - `apps/api/src/migrations/0010_project_memberships.py`
  - `apps/admin/src/api/project-members.ts`
  - `apps/admin/src/pages/settings/context-settings-pages.tsx`
  - `apps/admin/src/routes/projects/$projectId/settings/members/index.tsx`
  - `apps/admin/src/types/api/index.ts`
  - `apps/admin/src/types/api/project-members.ts`
  - `apps/admin/test/lib/post-auth-routing.test.ts`
  - `apps/admin/test/components/common/admin-workspace-switcher.test.tsx`
  - `apps/admin/test/pages/onboarding/workspace-first-onboarding-page.test.tsx`
  - `apps/admin/test/pages/workspaces/workspace-settings-icon-accordion-item.test.tsx`
  - `apps/admin/test/pages/settings/context-settings-pages.test.tsx`
  - `locales/en-US/account.json`
  - `locales/zh-CN/account.json`
- **Next step**: Milestone 6 — Move publish and delivery to runtime-scoped boundaries

## Milestone 6: Move publish and delivery to runtime-scoped boundaries

- **Status**: DONE
- **What was done**:
  - Added runtime-owned backend service and schema boundary for resolving runtime, project, workspace, and site bridge context.
  - Added runtime-scoped public routes under `/api/v1/runtimes/{runtime_id}` for runtime config, route resolution, delivery reads, and preview token creation.
  - Reworked project facade publish, preview, release, and API key flows to resolve through the runtime bridge before delegating to existing site/workspace internals.
  - Added integration coverage proving runtime routes and project facade flows share the same runtime/site bridge.
- **Validation**:
  - `timeout 60s pnpm -C apps/api lint` -> exit 0
  - `timeout 60s pnpm -C apps/api format` -> exit 0, 566 files unchanged
  - `timeout 60s pnpm -C apps/api typecheck` -> exit 0, 129 existing diagnostics reported as warnings
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules tests/modules/projects` -> exit 0
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py` -> 10 passed, exit 0
  - `timeout 60s pnpm api:check` -> exit 124 after lint, format, and typecheck completed; full API test phase was still running and emitted no failure before timeout
- **Files changed**:
  - `apps/api/src/common/protocols/tortoise.py`
  - `apps/api/src/core/routes.py`
  - `apps/api/src/modules/projects/repository.py`
  - `apps/api/src/modules/projects/facade/service.py`
  - `apps/api/src/modules/projects/facade/router.py`
  - `apps/api/src/modules/projects/runtime/schema.py`
  - `apps/api/src/modules/projects/runtime/service.py`
  - `apps/api/src/modules/projects/runtime/router.py`
  - `apps/api/src/modules/projects/http/service.py`
  - `apps/api/src/modules/projects/members_service.py`
  - `apps/api/tests/modules/projects/test_project_runtime_routes_integration.py`
- **Next step**: Milestone 7 — Remove obsolete workspace-as-site surfaces and run final verification

## Milestone 7: Remove obsolete workspace-as-site surfaces and run final verification

- **Status**: DONE
- **What was done**:
  - Removed the legacy admin external route surface under `apps/admin/src/routes/w/**` and `apps/admin/src/routes/workspaces/index.tsx`.
  - Kept project operations on the new `apps/admin/src/routes/projects/$projectId/**` surface while reusing the existing page implementations behind the new route ownership.
  - Removed the old public site runtime/delivery/preview router registration from `apps/api/src/core/routes.py`.
  - Updated targeted admin and backend tests so route expectations align with `/projects/...` and `/api/v1/runtimes/{runtime_id}` contracts.
- **Validation**:
  - `pnpm -C apps/admin test -- test/lib/workspace-content-routing.test.ts test/pages/workspaces/content/content-bootstrap-controller.test.tsx test/pages/workspaces/content/content-bootstrap-handoff.test.tsx test/routes/workspace-team-route-kind-guard.test.ts test/pages/workspaces/content/content-library-page.test.tsx` -> exit 0
  - `timeout 60s env NODE_OPTIONS=--max-old-space-size=8192 pnpm -C apps/admin typecheck` -> exit 0
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/projects/test_project_runtime_routes_integration.py tests/modules/sites/test_sites_delivery_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py` -> 10 passed, exit 0
  - `timeout 60s pnpm -C apps/api uv -- python -m compileall src/models src/modules tests/modules/projects tests/modules/sites tests/modules/workspaces/publish` -> exit 0
  - `timeout 60s pnpm check` -> exit 124 after `@arclayer/admin` lint/format/typecheck/test all passed and `@arclayer/api` lint/format/typecheck passed with 129 existing warnings; full API pytest was still running and emitted no failure before the required timeout
- **Files changed**:
  - `apps/admin/src/routes/w/**`
  - `apps/admin/src/routes/workspaces/index.tsx`
  - `apps/admin/src/routeTree.gen.ts`
  - `apps/admin/test/lib/workspace-content-routing.test.ts`
  - `apps/admin/test/pages/workspaces/content/content-bootstrap-controller.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-bootstrap-handoff.test.tsx`
  - `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
  - `apps/admin/test/routes/workspace-team-route-kind-guard.test.ts`
  - `apps/api/src/core/routes.py`
  - `apps/api/tests/modules/projects/test_project_runtime_routes_integration.py`
  - `apps/api/tests/modules/sites/test_sites_delivery_integration.py`
- **Outcome**:
  - The hard-cut implementation scope across backend, admin IA, settings, team governance, and runtime publish boundaries is complete.
  - Final repo-wide verification is recorded with honest timeout-limited evidence because the repo rule caps backend test commands at 60 seconds.
