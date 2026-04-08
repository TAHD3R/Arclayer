# Progress

## Current State

- Epic created from the implementation plan after discovering there were no existing `.codex-tasks` artifacts.
- User confirmed current dirty content-related files are in-flight implementation changes and should be continued, not discarded.
- Subtasks 1-4 are complete: typed creation, bootstrap, library entry posture, resolver/surfaces, and models/publish alignment are covered by targeted validation.
- The implementation plan still has two explicit open layers that were not in the first four-subtask breakdown:
  - destructive development reset / clean typed baseline
  - full checks plus browser/manual verification
- Epic status: in progress until those plan-level layers are closed.

## Recovery Block

任务: 修复 ContentOS 的 canonical typed creation、library truth、resolver、surface UX、publish alignment，并完成剩余 reset 与全量验证收尾
形态: epic
进度: 4/6 subtasks done
当前: Subtask 5 `Destructive development reset path and clean typed baseline`
文件: `.codex-tasks/2026-04-09-content-os-repair/SUBTASKS.csv`
下一步: 审计 repo 里现有 reset/seed 支持，落一条 development-only clean baseline 路径并验证

## Recent Validation

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

## Known Test Debt

- A full run of `test/pages/workspaces/content/content-library-page.test.tsx` is still red outside this task slice:
  - saved-view/filter/card-mode assertions do not currently hydrate mocked rows as expected
  - `ContentLibraryRoleTag` can crash on missing presentation data in that suite
- This debt was exposed while validating Subtask 2 but was not introduced by the current row-action/open-route changes.
