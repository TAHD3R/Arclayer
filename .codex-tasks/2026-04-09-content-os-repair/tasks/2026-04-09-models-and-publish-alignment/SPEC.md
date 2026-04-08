# Subtask Spec

## Goal

Confirm that the models control plane and publish flow now consume the same canonical continuation truth introduced by the earlier subtasks, and close the epic if no further implementation is needed.

## Scope

- Audit the models control-center surface against the plan.
- Revalidate publish integration after canonical typed creation enforcement.
- Record whether any additional implementation is required or whether live repo truth already satisfies this slice.

## Acceptance

- Models page is actionable as a setup/control surface.
- Publish integration still passes with typed model truth enforced.
- Any remaining gap is explicit in `PROGRESS.md`; otherwise the subtask can close without speculative edits.

## Validation

- `pnpm -C apps/admin exec vitest run test/pages/workspaces/content/content-models-control-center.test.tsx`
- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -m integration tests/modules/workspaces/publish/test_publish_integration.py -q`
