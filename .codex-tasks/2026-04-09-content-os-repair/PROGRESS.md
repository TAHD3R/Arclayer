# Progress

## Current State

- Epic created from the implementation plan after discovering there were no existing `.codex-tasks` artifacts.
- User confirmed current dirty content-related files are in-flight implementation changes and should be continued, not discarded.
- Subtasks 1-4 are complete: typed creation, bootstrap, library entry posture, resolver/surfaces, and models/publish alignment are covered by targeted validation.
- Subtask 5 is now complete: the repo has an explicit development-only destructive reset path through `pnpm -C apps/api content:reset-dev-baseline --workspace-id <id>`, backed by integration coverage.
- Subtask 6 is now complete: full checks were rerun and browser/manual verification covered create, library, writing, structured, canvas, and recovery paths.
- User requested continued execution according to the implementation plan, so the epic is reopened against the plan's original complete checkpoint.
- New follow-up subtasks 7-9 now track the remaining blocker cleanup required to make `pnpm api:check` and `pnpm admin:check` actually pass.
- Subtask 7 is now complete: `pnpm api:check` is green again after fixing content typing, repository generics, and the remaining auth/publish typing blockers.
- Subtask 8 is now complete: `pnpm admin:check` is green again after shared/Admin test alignment, timezone-correct date formatting, and content-library/editor fixture stabilization.
- Subtask 9 is now complete: the original implementation plan complete checkpoint has been revalidated with a passing `pnpm api:check && pnpm admin:check`.
- Epic status: complete.

## Recovery Block

任务: 修复 ContentOS 的 canonical typed creation、library truth、resolver、surface UX、publish alignment，并完成剩余 reset 与全量验证收尾
形态: epic
进度: 9/9 subtasks done
当前: 完成
文件: `.codex-tasks/2026-04-09-content-os-repair/SUBTASKS.csv`
下一步: 无，epic 已按原计划完成检查点关闭

## Recent Validation

- Passed development reset baseline verification:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_dev_reset_baseline_integration.py`
- Passed targeted Admin bootstrap tests:
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-bootstrap-controller.test.tsx test/pages/workspaces/content/content-bootstrap-page.test.tsx test/pages/workspaces/content/content-bootstrap-handoff.test.tsx`
- Passed targeted API integration tests:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/content/test_content_items_integration.py -q`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/content/test_content_items_continuation_contract_integration.py -q`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/content/test_content_routing_integration.py tests/modules/workspaces/content/test_content_presentations_integration.py tests/modules/workspaces/publish/test_publish_integration.py -q`
- Passed targeted library posture tests:
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-row-actions.test.tsx`
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx -t "maximizes the split editor into the library article page route"`
- Passed resolver/surface validation:
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-resolver-route.test.tsx test/pages/workspaces/content/content-structured-surface.test.tsx`
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-site-builder-shell.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- Passed models/publish validation:
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-models-control-center.test.tsx`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/publish/test_publish_integration.py -q`
- Full-check blocker rerun:
  - `pnpm api:check`
  - `pnpm admin:check`
- API full-check cleanup:
  - `pnpm -C apps/api typecheck`
  - `pnpm api:check`
- Admin full-check cleanup:
  - `pnpm -C apps/admin exec vitest run test/lib/bootstrap-routing.test.ts test/components/layout/admin-notifications-panel-motion.test.tsx test/components/layout/admin-notifications-panel-width.test.tsx test/lib/time/date-time.test.ts test/pages/workspaces/assets/assets-folder-rail-recent-section.test.tsx`
  - `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
  - `pnpm admin:check`
- Final plan-complete verification:
  - `pnpm api:check && pnpm admin:check`
- Browser/manual verification:
  - reset local workspace baseline via `pnpm -C apps/api content:reset-dev-baseline --workspace-id GmM1V0Wl6c25eMFS4cLQQQ`
  - verified `/content/create` exposes `Article`, `Landing Page`, and `Structured Entry`
  - verified create -> writing (`TM Article Surface Smoke`), create -> structured (`TM Structured Surface Smoke`), and create -> canvas (`TM Landing Surface Smoke`) flows
  - verified Content Library cards show canonical posture/model copy and reopen the correct continuation surface
  - verified recovery UI by forcing one local smoke item into `unshaped` state, then resetting the workspace back to the clean typed baseline

## Closure Notes

- The implementation plan's `Checkpoint: Complete` is now materially true in the repo:
  - `pnpm api:check` passes
  - `pnpm admin:check` passes
- Shared/Admin cleanup resolved the reopened blocker set without adding runtime fallbacks:
  - bootstrap-routing tests now reflect current workspace-preserving post-auth behavior
  - notifications panel test mocks now include `useRouterState`
  - `apps/admin/src/lib/time/date-time.ts` now formats absolute date-time values against the requested timezone instead of the process-local timezone
  - content-library page test fixtures now match the current `AdminContentItem` contract
  - article-editor autosave coverage now uses a repeated patch mock and a bounded timeout instead of relying on a single mocked Promise
- The epic remains browser-verified for create/library/writing/structured/canvas/recovery flows and now also closes with passing full checks.
