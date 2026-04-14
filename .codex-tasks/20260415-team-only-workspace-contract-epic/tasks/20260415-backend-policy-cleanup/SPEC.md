# Child Task Spec: Backend policy and caller cleanup

## Goal

Close the remaining backend behavior and regression surface after the Team-only
hard cut so no Team endpoint, danger flow, or metadata path still depends on
Personal-specific logic.

## Scope

- Validate leave/delete/danger capabilities after removing Personal-only
  restrictions
- Validate backend metadata/settings endpoints against the Team-only contract
- Sync parent and child taskmaster artifacts after focused backend validation

## Out of Scope

- Admin UI cleanup
- Broad backend validation unrelated to workspace contract changes
