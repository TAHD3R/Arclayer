# Child Task Spec: Backend workspace core contract cleanup

## Goal

Remove Personal workspace as a backend contract concept so the workspace model,
workspace-first onboarding, and `/me/workspaces` payloads become Team-only.

## Scope

- Remove `WorkspaceKind.PERSONAL`
- Remove Personal-space switcher schema/payload
- Make onboarding workspace creation Team-only
- Remove dedicated Personal-space retry/service entry points from normal
  workspace APIs

## Out of Scope

- Admin UI cleanup
- Broader backend policy cleanup outside the core contract roots
