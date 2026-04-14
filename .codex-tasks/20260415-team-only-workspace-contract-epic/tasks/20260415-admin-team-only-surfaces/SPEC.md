# Child Task Spec: Admin switcher, workspaces, and shell Team-only cleanup

## Goal

Remove the remaining Personal workspace rendering and route guards from the
admin shell so all workspace surfaces treat Team workspaces as the only product
truth.

## Scope

- Remove Personal status/retry logic from the admin workspace switcher
- Remove Personal-only rendering from usercenter `/workspaces`
- Remove Personal-only route guards and fixtures from admin shell tests

## Out of Scope

- Backend contract work
- Non-workspace onboarding steps after workspace creation
