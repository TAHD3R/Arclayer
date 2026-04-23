# Project Settings Project-Scoped Authz Hard-Cut Plan

Date: 2026-04-23
Repo: `/home/philip/arclayer-refactor`
Branch: `refactor`

## Execution Status

Audit updated on `2026-04-24` against `/home/philip/Arclayer`, where `develop` and `refactor` currently point to the same HEAD.

Current outcome:

1. Project settings storage is now persisted on `SCOPE_TYPE_PROJECT`.
2. Project settings permission checks now evaluate against `project_id` and `ProjectMembership`.
3. `ProjectSettingsService.get_core_detail()` and `.patch_core()` now accept `project_id` only.
4. Workspace-scoped project-settings webhook/onboarding side effects have left the service.
5. Backend target verification passed.
6. Cross-layer Admin cleanup has been applied in the current working tree, including removal of stale `ProjectAuthzSnapshot.workspaceId` consumers and project action code alignment on project pages.

Fresh verification captured on `2026-04-24`:

```bash
timeout 60s pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_authz_contract_unit.py \
  tests/modules/projects/test_project_governance_routes_contract_unit.py \
  tests/modules/projects/test_project_governance_actions_unit.py \
  tests/modules/projects/test_project_settings_service_unit.py \
  tests/modules/projects/test_project_api_key_scopes_unit.py
```

Result: `22 passed`

```bash
timeout 120s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_settings_core_integration.py
```

Result: `1 passed`

```bash
pnpm -C apps/admin test \
  test/pages/settings/context-settings-pages.test.tsx \
  test/pages/account/projects-page.test.tsx \
  test/lib/routing/notification-target.test.ts \
  test/components/layout/favorite-nav-items.test.ts \
  test/lib/workspace-nav-regression.test.ts
```

Result: `5 files passed, 19 tests passed`

```bash
pnpm -C apps/admin typecheck
```

Result after consumer cleanup:

- `exit 0`

```bash
pnpm -C apps/admin test \
  test/api/project-governance-contract.test.ts \
  test/pages/settings/general-settings-shell-permissions.test.tsx \
  test/pages/workspaces/content/content-library-article-editor-page.test.tsx \
  test/pages/workspaces/content/content-library-page.test.tsx \
  test/pages/workspaces/content/content-site-builder-shell.test.tsx \
  test/pages/workspaces/content/content-automation-page.test.tsx \
  test/pages/workspaces/content/content-release-center-page.test.tsx \
  test/pages/workspaces/content/content-models-control-center.test.tsx
```

Result: `8 files passed, 65 tests passed`

## Goal

Move project settings authorization to a true project-scoped model.

This change set will deliver four outcomes together:

1. Project settings storage stays on `SCOPE_TYPE_PROJECT`.
2. Project settings permission checks evaluate against `project_id` and `ProjectMembership`.
3. Project settings service and tests stop depending on `workspace_id`.
4. Workspace-scoped project-settings side effects and stale tests leave the tree in the same change set.

## Critical Review

The live repo exposes a clean project-settings storage layer and a workspace-based permission layer at the same time.

Current truth:

- `apps/api/src/modules/projects/settings/service.py` already persists settings on `SCOPE_TYPE_PROJECT`.
- `apps/api/src/modules/projects/governance/router.py` still gates `/projects/{project_id}/settings/core` with `ensure_workspace_permission_granted(...)`.
- `apps/api/src/modules/projects/authz/router_helpers.py` and `apps/api/src/modules/projects/authz/service.py` still translate `ProjectRequestContext` into `WorkspaceContext`.
- `apps/api/src/modules/projects/permissions/catalog.py` still publishes workspace-scoped action definitions and workspace permission codes.
- `apps/api/src/models/system/rbac.py` only supports `ORG` and `WORKSPACE` in `PermissionScope`.
- `apps/api/src/models/projects/membership.py` already gives us a project-scoped fact source: `ProjectMembership` and `ProjectMemberRole`.

This plan uses a dedicated project authz policy layer built on `ProjectMembership` and `ProjectMemberRole`. That keeps the blast radius bounded to project surfaces while still giving project settings a true project-scoped permission boundary.

## Hard-Cut Decisions

1. `ProjectMembership` is the source of truth for project-scoped authorization.
2. Project permission evaluation uses project-scoped action codes and project role mappings.
3. Project settings routes stop calling workspace authz helpers.
4. Workspace-scoped project-settings events and their stale tests leave the repo in this change set.
5. Generated OpenAPI artifacts are regenerated after backend contract changes.

## Success Criteria

- `/projects/{project_id}/settings/core` read and write gates evaluate project membership for `project_id`.
- `ProjectSettingsService.get_core_detail()` and `.patch_core()` accept `project_id` only.
- `apps/api/src/modules/projects/authz/*` no longer converts project authz decisions through workspace authz for settings and direct project route callers.
- Governance contract returns `ProjectAuthzSnapshot` and `ProjectPermissionActionOut` backed by project-scoped evaluation.
- Project API key permission resolution aligns with project-scoped permission codes.
- Dead workspace-scoped project-settings event code and stale unit tests are removed or rewritten.
- OpenAPI generation and targeted backend tests pass.

## Audit Verdict

The hard-cut goal for project settings itself is implemented.

The follow-up consumer cleanup slice is also implemented in the current working tree:

1. stale Admin/test consumers that assumed `ProjectAuthzSnapshot.workspaceId` have been removed from this surface
2. workspace-backed asset/activity scope for the affected project surfaces now resolves from project route context instead of the project authz contract
3. Admin contract fixtures and focused verification have been refreshed

## Task 1: Build the Project Authz Core

### Scope

- `apps/api/src/modules/projects/authz/schema.py`
- `apps/api/src/modules/projects/authz/service.py`
- `apps/api/src/modules/projects/authz/router_helpers.py`
- `apps/api/src/modules/projects/permissions/catalog.py`
- `apps/api/src/modules/projects/permissions/service.py`
- `apps/api/src/modules/projects/governance/router.py`
- `apps/api/src/modules/projects/governance/schema.py`

### Implementation Steps

1. Define the canonical project action vocabulary used by project routes.
   Candidate actions from current call sites:
   - `project:settings:read`
   - `project:settings:manage`
   - `project:team:members:read`
   - `project:team:roles:manage`
   - project content / automation / key actions currently routed through `ensure_project_permission_granted(...)`

2. Add a project role-to-permission mapping based on `ProjectMemberRole`.
   Baseline expectation:
   - `owner` carries project settings and team-management authority
   - `editor` carries content and runtime mutation authority that product already expects
   - `viewer` carries read-only authority

3. Rework `get_project_authz_snapshot(...)` to build a real project snapshot from `ProjectMembership`.

4. Rework `ensure_project_permission_granted(...)` to evaluate project actions directly against the project snapshot.

5. Restore governance endpoints to project-scoped contracts:
   - `/projects/{project_id}/me/authz` returns `ProjectAuthzSnapshot`
   - `/projects/{project_id}/actions` returns `ProjectPermissionActionOut`
   - `/projects/{project_id}/settings/core` uses the project authz helper

6. Remove workspace-context translation from project authz code paths that exist only to delegate authorization.

### Verification

Run:

```bash
timeout 60s pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_authz_contract_unit.py \
  tests/modules/projects/test_project_governance_routes_contract_unit.py \
  tests/modules/projects/test_project_governance_actions_unit.py
```

## Task 2: Migrate Project Route Callers and API Key Permission Resolution

### Scope

- `apps/api/src/modules/projects/router.py`
- `apps/api/src/modules/projects/http/router_helpers.py`
- `apps/api/src/modules/projects/automation/router.py`
- `apps/api/src/modules/projects/content/shared/router.py`
- `apps/api/src/modules/projects/content/views/router_helpers.py`
- `apps/api/src/modules/projects/api_keys/router.py`
- `apps/api/src/modules/projects/api_keys/scopes.py`

### Implementation Steps

1. Replace workspace-style permission literals at project call sites with the canonical project action codes from Task 1.

2. Keep `ProjectRequestContext` as the authz boundary for project routes.

3. Update project API key scope evaluation so `ProjectAuthzSnapshot.permission_codes` and API-key management scopes share the same project-scoped permission vocabulary.

4. Preserve runtime/service lookups that truly need workspace/site context while keeping permission decisions on `project_id`.

5. Add or update regression tests proving that project permission checks use project membership instead of workspace authz state.

### Verification

Run:

```bash
timeout 60s pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_core_settings_contract_unit.py \
  tests/modules/projects/test_project_settings_service_unit.py
```

Add targeted tests for any new project authz helper behavior introduced in this task and include them in the command.

## Task 3: Delete Workspace-Scoped Project-Settings Leftovers and Regenerate Contracts

### Scope

- `apps/api/src/modules/projects/settings/service.py`
- `apps/api/src/modules/projects/settings/events.py`
- `apps/api/tests/modules/projects/test_project_settings_service_unit.py`
- `apps/api/tests/modules/projects/test_project_settings_core_integration.py`
- `packages/openapi/src/generated/*`

### Implementation Steps

1. Keep `ProjectSettingsService` pure:
   - `project_id` only
   - project-scoped storage only
   - no workspace-scoped event emission
   - no onboarding side effects

2. Delete `apps/api/src/modules/projects/settings/events.py` if no live code references remain after Task 1 and Task 2.

3. Rewrite unit tests to assert the live contract:
   - no `workspace_id` in service signatures
   - no webhook emission
   - project-scoped persistence only

4. Keep the integration test that proves:
   - records are stored under `SCOPE_TYPE_PROJECT`
   - no workspace-scoped record is created
   - another project in the same workspace reads an independent settings payload

5. Regenerate OpenAPI artifacts:

```bash
pnpm -C packages/openapi generate
```

### Verification

Run:

```bash
timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_settings_core_integration.py
```

Then run:

```bash
pnpm api:check
```

## Risks to Watch

1. `ProjectMembership` bootstrap currently seeds membership rows from workspace membership. The role matrix must make project settings authority explicit, otherwise the repo will still behave like a broad workspace grant.

2. Project API key scopes currently intersect against workspace-style permission strings. Task 2 must align both sides of that intersection in the same change set.

3. Several project route tests currently assume workspace-wrapped project authz. Keep the plan strict: update those tests in the same task where the route logic changes.

4. OpenAPI generation will change both `index.ts` and `types.gen.ts`. Treat generated artifacts as a required outcome of the backend contract cut.

## Execution Notes for Subagent-Driven Development

Recommended task order:

1. Task 1
2. Task 2
3. Task 3

Recommended review gates after each task:

1. Spec compliance review against this plan file.
2. Code quality review on the produced diff.

Recommended final verification bundle:

```bash
timeout 60s pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_authz_contract_unit.py \
  tests/modules/projects/test_project_governance_routes_contract_unit.py \
  tests/modules/projects/test_project_governance_actions_unit.py \
  tests/modules/projects/test_project_settings_service_unit.py

timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q \
  tests/modules/projects/test_project_settings_core_integration.py

pnpm -C packages/openapi generate
pnpm api:check
```
