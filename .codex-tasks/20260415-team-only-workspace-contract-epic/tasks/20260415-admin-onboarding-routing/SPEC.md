# Child Task Spec: Admin onboarding and post-auth Team-only cleanup

## Goal

Remove Personal workspace from the admin onboarding contract so onboarding step
2 is always a Team workspace form and post-auth routing only reasons about
normal workspace items.

## Scope

- Remove Personal-space types from admin workspace API models
- Remove onboarding `kind` payload/result handling from the admin client
- Replace onboarding step 2 mode selection with a single `name + slug` form
- Remove Personal fallback routing from post-auth route resolution

## Out of Scope

- Workspace switcher panel cleanup
- Usercenter `/workspaces` cards/tables and shell route cleanup
