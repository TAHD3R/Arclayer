# Workspace and Organization Kind Removal Design

**Status:** Approved for documentation review

**Date:** 2026-07-29

**Decision:** Remove the obsolete personal/team kind model from Workspace and Organization as one atomic hard cut.

## Problem

The admin `POST /api/v1/workspaces` flow persists a workspace successfully, then returns HTTP 500 while mapping the response. `WorkspaceService._map_manage_workspace_out()` reads `workspace.kind`, but `OrganizationWorkspaceOut` has no `kind` attribute.

Adding the missing field would preserve an obsolete model. `WorkspaceKind` only contains `team`, current workspace rows all use that value, and no business behavior branches on it. The same personal/team model remains on `OrganizationKind`, where current organization rows also use only `team`.

These kind fields are shallow interfaces: they are stored and propagated through repositories, request contexts, schemas, generated OpenAPI types, Admin projections, and tests without providing behavioral leverage. Keeping them reduces locality and allows contract drift such as the current 500.

## Goals

- Remove `WorkspaceKind` and `OrganizationKind` from the canonical domain model.
- Remove their database columns, indexes, parameters, context fields, response fields, generated types, Admin projections, and test fixtures.
- Remove workspace switcher structures whose only purpose is grouping workspaces as `teams`.
- Preserve onboarding organization idempotency without kind-based lookup.
- Make workspace creation return a valid response after the transaction succeeds.
- Keep one canonical contract surface with no compatibility facade or silent fallback.

## Non-goals

- Redesigning organization selection or adding support for multiple account containers per owner.
- Renaming existing organization slugs stored in the database.
- Removing valid team collaboration concepts such as memberships, invitations, roles, or member-management copy.
- Changing workspace templates, visibility, permissions, or project-binding behavior.

## Chosen Approach

Use one atomic hard cut across persistence, backend, generated contracts, Admin consumers, and tests. A staged compatibility layer is rejected because it would keep the obsolete model alive and create two contract surfaces. A mapping-only fix is rejected because it treats the symptom while retaining the source of drift.

## Domain Model and Persistence

### Workspace

- Delete the `WorkspaceKind` enum.
- Delete `Workspace.kind` and its database index.
- Delete the `kind` argument from workspace repository creation methods.
- Remove every read, write, and projection of the field.

### Organization

- Delete the `OrganizationKind` enum.
- Delete `Organization.kind` and its database index.
- Delete the `kind` argument from `OrganizationRepository.create_organization()`.
- Replace the composite uniqueness constraint `(kind, owner_user_id)` with uniqueness on non-null `owner_user_id` through the nullable unique field semantics provided by PostgreSQL. Multiple rows with `owner_user_id = NULL` remain valid.

The owner constraint preserves the current account-container invariant: onboarding produces at most one owned organization per user. Before applying the migration, query for duplicate non-null `owner_user_id` values. If duplicates exist, stop with an explicit migration precondition failure; do not merge or discard data automatically.

### Migration Discipline

1. Change the Tortoise models first.
2. Generate the migration only with `pnpm --filter @arclayer/api db:migrate`.
3. Inspect the generated migration for both column/index removals and the replacement owner uniqueness constraint.
4. Apply it only with `pnpm --filter @arclayer/api db:upgrade`.
5. Run `db:upgrade` again and require a clean `No migrations to apply` result.

Generated migration files must not be hand-edited. Existing slugs such as `team-org-*` remain unchanged because they can be externally referenced identifiers; newly created onboarding organizations use a neutral prefix.

## Backend Modules and Interfaces

### Repository and Service Semantics

- Rename `OrganizationRepository.get_onboarding_team_organization()` to `get_onboarding_organization()` and query only by `owner_user_id`.
- Rename `WorkspaceService._ensure_onboarding_team_organization()` to `_ensure_onboarding_organization()`.
- Remove `OrganizationKind.TEAM` and `WorkspaceKind.TEAM` arguments from all creation paths.
- Keep the existing reactivation and owner-membership reconciliation behavior unchanged.

### Request Contexts

- Delete `WorkspaceContext.workspace_kind`.
- Delete `ProjectRequestContext.workspace_kind`.
- Delete all constructors and fixtures that propagate these values.

No business rule currently consumes these fields. Their removal shortens the interface without moving conditional behavior into callers.

### Response Contracts

- Remove `kind` from workspace list, management list, detail, directory, and related output schemas.
- Remove any organization `kind` output found in the same contract audit.
- Remove the corresponding mapper assignments.
- Delete `WorkspaceSwitcherOut` and `MyWorkspaceListResult.switcher`.
- Keep `MyWorkspaceListResult.items` as the sole collection of workspaces visible to the current user.

`POST /api/v1/workspaces` will map only fields present on the created workspace output. The fix must not synthesize `kind`, catch `AttributeError`, or return a degraded success response.

## OpenAPI and Admin Consumers

- Regenerate `@arclayer/openapi` after backend schema changes using the package's `generate` script.
- Remove generated `WorkspaceKind` and `OrganizationKind` exports when no canonical schema references remain.
- Remove the `switcher.teams` override from `packages/openapi/src/admin-types.ts`.
- Update `AdminScopeSwitcher` to consume `MyWorkspaceListResult.items` directly.
- Remove local UI projections and fixtures containing `kind: "team"` when they represent workspace or organization identity.

Every remaining source occurrence of `team`, `WorkspaceKind`, `OrganizationKind`, `workspace_kind`, or `switcher.teams` must be classified. Membership, invite, role, and collaboration semantics remain when they describe actual team behavior rather than the deleted identity mode.

## Error Handling and Concurrency

- Do not add compatibility defaults, response fallbacks, exception swallowing, or mock success paths.
- Let duplicate-owner migration preconditions fail explicitly.
- Preserve database-backed uniqueness for onboarding idempotency. The service may query before creation, but the unique constraint remains the final concurrency boundary.
- Existing conflict/error translation should remain visible if concurrent onboarding creation violates that invariant; this change does not introduce a silent retry path.

## Verification

### Automated Checks

- Add or update an integration test proving `POST /api/v1/workspaces` returns success and a response without `kind` after persistence.
- Cover onboarding organization reuse by `owner_user_id` and the single-owned-organization invariant.
- Update workspace switcher/onboarding tests to assert `items` directly and to reject the removed `switcher` and `kind` contract fields where appropriate.
- Remove obsolete kind values from API and Admin fixtures.
- Regenerate OpenAPI and run frontend type checks to expose every consumer drift.
- Run `pnpm check` because the change crosses API, generated packages, and Admin.
- Run `pnpm code-review-engine --scope changed --base HEAD --format json` at implementation review boundaries.
- Run GitNexus `detect_changes()` before each implementation commit; if graph tooling is unavailable, record that failure rather than claiming graph verification.

### Runtime Check

Start the real local stack and exercise the Admin workspace creation flow in a browser. Verify that:

1. The create request returns success rather than 500.
2. The new workspace appears in the scope switcher sourced from `items`.
3. Entering the workspace and opening workspace settings still works.
4. A new onboarding user reuses the same owned organization on repeated onboarding calls.
5. Logs contain no schema mapping, OpenAPI validation, or webhook regression errors.

## Acceptance Criteria

- No production source exports or imports `WorkspaceKind` or `OrganizationKind`.
- Neither `workspaces` nor `organizations` has a `kind` column or index.
- No request context carries `workspace_kind`.
- Workspace and organization API responses do not expose identity `kind` fields.
- `MyWorkspaceListResult` exposes `items` and no `switcher.teams` compatibility shape.
- The Admin workspace creation flow completes interactively without HTTP 500.
- Onboarding organization creation remains idempotent and constrained by owner.
- Generated contracts, focused regressions, full repository checks, migration verification, and changed-scope audits pass.
