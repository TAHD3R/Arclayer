# Progress

## Recovery Notes

- This child task covers plan Phase 1 Task 2, which was not captured in the first four implementation subtasks.
- Repo audit confirmed there was no development-facing ContentOS reset path; only the test-only `reset_postgres_schema()` helper existed.
- The development reset path is now implemented as `pnpm -C apps/api content:reset-dev-baseline --workspace-id <workspace-id-or-public-id>`.
- Default behavior reseeds a typed validation baseline with `article`, `landing-page`, and `structured-entry`; `--no-seed-default-models` leaves an empty valid state.

## Audit Log

- 2026-04-09: child task created after comparing `.codex-tasks` completion state against the implementation plan and discovering the destructive reset baseline slice was still missing.
- 2026-04-09: audited repo truth and found no existing content-specific development reset command under `apps/api/scripts` or package scripts.
- 2026-04-09: added `apps/api/scripts/reset_content_dev_baseline.py` and the repo-native command `pnpm -C apps/api content:reset-dev-baseline --workspace-id <workspace-id-or-public-id>`.
- 2026-04-09: documented the command in `docs/plans/2026-04-09-content-os-repair-spec.md` under `Development Reset Path`.

## Validation

- Passed integration proof:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_dev_reset_baseline_integration.py`
- Passed targeted formatting check:
  - `pnpm -C apps/api uv -- ruff format --check scripts/reset_content_dev_baseline.py tests/modules/workspaces/content/test_content_dev_reset_baseline_integration.py`
- Passed targeted lint check after import ordering fix:
  - `pnpm -C apps/api uv -- ruff check scripts/reset_content_dev_baseline.py tests/modules/workspaces/content/test_content_dev_reset_baseline_integration.py`

## Outcome

- Invalid model-less dev data no longer needs runtime compatibility logic.
- Local verification can be restarted from a clean typed baseline through one explicit, destructive, development-only command.
