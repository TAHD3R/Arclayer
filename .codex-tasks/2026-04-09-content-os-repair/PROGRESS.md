# Progress

## Current State

- Epic created from the implementation plan after discovering there were no existing `.codex-tasks` artifacts.
- User confirmed current dirty content-related files are in-flight implementation changes and should be continued, not discarded.
- Subtasks 1-4 are complete: typed creation, bootstrap, library entry posture, resolver/surfaces, and models/publish alignment are covered by targeted validation.
- Subtask 5 is now complete: the repo has an explicit development-only destructive reset path through `pnpm -C apps/api content:reset-dev-baseline --workspace-id <id>`, backed by integration coverage.
- Subtask 6 is now complete: full checks were rerun and browser/manual verification covered create, library, writing, structured, canvas, and recovery paths.
- Epic status: complete.

## Recovery Block

任务: 修复 ContentOS 的 canonical typed creation、library truth、resolver、surface UX、publish alignment，并完成剩余 reset 与全量验证收尾
形态: epic
进度: 6/6 subtasks done
当前: 全部子任务完成
文件: `.codex-tasks/2026-04-09-content-os-repair/SUBTASKS.csv`
下一步: 无；implementation plan 对应的 epic 已闭环，剩余的是 repo 基线债务，不属于本次 ContentOS repair 变更本身

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
- Browser/manual verification:
  - reset local workspace baseline via `pnpm -C apps/api content:reset-dev-baseline --workspace-id GmM1V0Wl6c25eMFS4cLQQQ`
  - verified `/content/create` exposes `Article`, `Landing Page`, and `Structured Entry`
  - verified create -> writing (`TM Article Surface Smoke`), create -> structured (`TM Structured Surface Smoke`), and create -> canvas (`TM Landing Surface Smoke`) flows
  - verified Content Library cards show canonical posture/model copy and reopen the correct continuation surface
  - verified recovery UI by forcing one local smoke item into `unshaped` state, then resetting the workspace back to the clean typed baseline

## Known Test Debt

- `pnpm api:check` is still blocked by existing Pyright debt in content typing and unrelated auth/publish test files:
  - `apps/api/src/models/content/model_relation.py`
  - `apps/api/src/modules/workspaces/content/items/domain_helpers.py`
  - `apps/api/src/modules/workspaces/content/items/read_service.py`
  - `apps/api/src/modules/workspaces/content/items/repository.py`
  - `apps/api/src/modules/workspaces/content/models/canonical_service.py`
  - `apps/api/src/modules/workspaces/content/models/domain_helpers.py`
  - `apps/api/src/modules/workspaces/content/models/repository.py`
  - `apps/api/tests/modules/auth/test_auth_email_change_reauth_unit.py`
  - `apps/api/tests/modules/auth/test_auth_sso_linked_identities_contract_unit.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py`
- `pnpm admin:check` is still blocked by existing red suites outside this task slice:
  - `test/lib/bootstrap-routing.test.ts`
  - `test/pages/workspaces/assets/assets-folder-rail-recent-section.test.tsx`
  - `test/lib/time/date-time.test.ts`
  - `test/components/layout/admin-notifications-panel-width.test.tsx`
  - `test/components/layout/admin-notifications-panel-motion.test.tsx`
  - `test/pages/workspaces/content/content-library-page.test.tsx`
  - unhandled autosave rejection surfaced during `test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- A full run of `test/pages/workspaces/content/content-library-page.test.tsx` is still red outside this task slice:
  - saved-view/filter/card-mode assertions do not currently hydrate mocked rows as expected
  - `ContentLibraryRoleTag` can crash on missing presentation data in that suite
- This debt was exposed while validating Subtask 2 but was not introduced by the current row-action/open-route changes.
