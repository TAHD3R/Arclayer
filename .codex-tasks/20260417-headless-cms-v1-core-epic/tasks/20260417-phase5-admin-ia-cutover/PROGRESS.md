# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-phase5-admin-ia-cutover`
- **Task dir**: `.codex-tasks/20260417-headless-cms-v1-core-epic/tasks/20260417-phase5-admin-ia-cutover/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- **Plan**: `TODO.csv`
- **Environment**: React / Vite / TanStack Router / Vitest / pnpm

---

## Context Recovery Block

- **Current milestone**: Phase 5 started
- **Current status**: IN_PROGRESS
- **Last completed**: Phase 4 perspective and dependency rules
- **Current artifact**: `TODO.csv`
- **Key context**: The backend content contracts are in place. Admin still carries the old interaction narrative through a standalone create page, a control-form models surface, and a page handoff shell that stops before the actual site-builder route.
- **Known issues**: The IA must hard-cut to `Library-first` without dual flows or silent fallbacks.
- **Next action**: Replace the create entry with an overlay in `Content Library`, then cut the remaining surfaces to the approved roles.

---

## Milestone Result

- **Status**: DONE
- **Completed**: 2026-04-17
- **What was done**:
  - Replaced the Library header create action with a route-backed overlay that surfaces only the four official protocol types.
  - Rebuilt the Models surface into a governance panel with protocol list, system contract framing, extension layer, and impact inspector.
  - Routed Page/canvas continuation straight into Site Builder and redirected the legacy `/content/create` route into `Content Library` with `create=1`.
  - Tightened content type presentation, preview copy, bootstrap variants, and settings copy around the approved `Article / Page / Reusable Section / Category` contract.
- **Validation**:
  - Passed: `pnpm -C apps/admin test test/pages/workspaces/content/content-models-control-center.test.tsx`
  - Passed: `pnpm -C apps/admin test test/pages/workspaces/content/content-library-page.test.tsx`
  - Passed: `pnpm -C apps/admin test test/pages/workspaces/content/content-library-resolver-route.test.tsx test/pages/workspaces/content/content-surface-routing.test.tsx test/pages/workspaces/content/content-site-builder-shell.test.tsx`
  - Passed: `pnpm -C apps/admin test test/pages/workspaces/content/content-bootstrap-page.test.tsx`
  - Passed: `pnpm -C apps/admin test test/routes/workspace-content-create-route-redirect.test.ts test/layouts/sidebar-route-state.test.tsx test/components/layout/admin-side-nav.test.tsx`
  - Attempted: `pnpm admin:check`
  - Result: blocked by unrelated existing failures in `src/pages/workspaces/assets/components/folder-description-tooltip.tsx`, `test/pages/workspaces/assets/assets-folder-rail-folder-section.test.tsx`, and multiple unrelated admin test suites such as `adaptive-overlay-backdrop`, `login`, `admin-notifications-panel-toggle`, and `content-library-article-editor-page`.
- **Next step**: Pause for phase report and then activate Phase 6 closeout.
