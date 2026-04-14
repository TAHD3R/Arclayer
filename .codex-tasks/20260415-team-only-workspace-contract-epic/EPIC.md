# Epic: Team-Only Workspace Contract

## Goal

Deliver a hard-cut Team-only workspace model where registration/bootstrap create
only the account/session, onboarding step 2 creates a Team workspace from
`name + slug`, and backend/admin surfaces no longer model or render Personal
workspace concepts.

## Out of Scope

- Any migration or compatibility workflow for legacy Personal workspaces
- New onboarding steps beyond the existing flow shape
- Unrelated visual redesign outside the touched onboarding, switcher, and
  `/workspaces` surfaces

## Source of Truth

- `docs/plans/2026-04-15-team-only-workspace-contract-implementation-plan.md`

## Done When

- Backend no longer exposes `personal` as a workspace contract branch
- Admin onboarding/switcher/workspaces/shell are Team-only
- Focused backend/admin validation passes
- `SUBTASKS.csv` and `PROGRESS.md` match the live repo state

## Child Tasks

1. Backend workspace core contract cleanup
2. Backend policy and caller cleanup
3. Admin onboarding and post-auth Team-only cleanup
4. Admin switcher, `/workspaces`, and shell Team-only cleanup
5. Focused validation and artifact close-out
