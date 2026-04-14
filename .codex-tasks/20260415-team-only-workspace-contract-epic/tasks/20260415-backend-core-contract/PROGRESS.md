# Child Progress Log

## Context Recovery Block

- **Task**: backend workspace core contract cleanup
- **Status**: IN_PROGRESS
- **Current step**: step 1 / 4
- **Truth file**: `.codex-tasks/20260415-team-only-workspace-contract-epic/tasks/20260415-backend-core-contract/TODO.csv`
- **Key context**:
  - `WorkspaceKind` still exposes `PERSONAL`.
  - `WorkspaceSwitcherOut` still includes `personal_space`.
  - `WorkspaceService.create_onboarding_workspace()` still branches on
    `payload.kind`.
  - `apps/api/src/modules/workspaces/router.py` still exposes
    `retry_my_personal_space`.
- **Next action**: patch backend contract roots, then rewrite focused tests and
  validate.
