# Progress

## Recovery Notes

- Existing dirty files already cover:
  - API `modelKey` plumbed into create-item payload
  - bootstrap controller model query and selection
  - bootstrap step-one model picker UI
  - row-action change that shifts "open" toward real item entry
- These changes are only a partial implementation until validation confirms:
  - model-less creation is actually rejected, not merely resolved with `None`
  - bootstrap no-model state is product-valid and blocks continuation correctly

## Audit Log

- 2026-04-09: taskmaster artifacts reconstructed from the plan and current worktree because no `.codex-tasks` directory existed yet.
- 2026-04-09: user confirmed current content-related dirty files are the intended in-flight changes for this task.
- 2026-04-09: tightened API create-item truth by making `modelKey` mandatory end-to-end and rejecting blank/unknown model keys before persistence.
- 2026-04-09: aligned bootstrap no-model state to a setup-blocked CTA that routes users to Content Models instead of pretending templates can replace missing types.
- 2026-04-09: normalized integration model fixtures so article/page seeds carry explicit product semantics (`category`, `defaultEditor`, continuation defaults) instead of drifting to `custom` / `form`.
- 2026-04-09: updated continuation contract assertions to match live backend truth where bootstrap preserves model-backed `content_library` context.

## Outcome

- Backend now refuses model-less item creation and always persists `model_definition_id` from a resolved content model.
- Admin bootstrap now exposes `hasAvailableModels`, blocks continue when no real models exist, and routes blocked users to the models setup surface.
- Locales were updated so the blocked state is human-facing rather than a silent empty selector.

## Validation

- Passed: `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-bootstrap-controller.test.tsx test/pages/workspaces/content/content-bootstrap-page.test.tsx test/pages/workspaces/content/content-bootstrap-handoff.test.tsx`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/content/test_content_items_integration.py -q`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/content/test_content_items_continuation_contract_integration.py -q`
- Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/content/test_content_routing_integration.py tests/modules/workspaces/content/test_content_presentations_integration.py tests/modules/workspaces/publish/test_publish_integration.py -q`
