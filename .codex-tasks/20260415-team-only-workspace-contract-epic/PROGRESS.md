# Progress Log

---

## Session Start

- **Date**: 2026-04-15
- **Task name**: `20260415-team-only-workspace-contract-epic`
- **Task dir**: `.codex-tasks/20260415-team-only-workspace-contract-epic/`
- **Plan**: `docs/plans/2026-04-15-team-only-workspace-contract-implementation-plan.md`
- **Environment**: Python / FastAPI / React / Vite / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: Child 5 — validation and artifact close-out
- **Current status**: DONE
- **Current artifact**: `.codex-tasks/20260415-team-only-workspace-contract-epic/SUBTASKS.csv`
- **Key context**:
  - The previous personal-vs-team contract shipped yesterday but has been
    superseded in chat.
  - The user wants a development-time hard cut with no migration path for legacy
    Personal workspaces.
  - The onboarding flow shape stays, but step 2 must only collect Team workspace
    `name + slug`.
  - `personal` must be removed deeply from backend/admin contract surfaces rather
    than hidden in the UI.
- **Known hot spots**:
  - `apps/api/src/models/workspaces/workspace.py`
  - `apps/api/src/modules/workspaces/schema.py`
  - `apps/api/src/modules/workspaces/service.py`
  - `apps/api/src/modules/workspaces/router.py`
  - `apps/api/src/modules/workspaces/personal_space/service.py`
  - `apps/admin/src/pages/onboarding/workspace-first/page.tsx`
  - `apps/admin/src/components/layout/admin-workspace-switcher.tsx`
- **Next action**: none; the epic truth files are synced to the finished Team-only contract.

---

## Milestone 1: Child 1 — backend workspace core contract cleanup

- **Status**: DONE
- **Completed**: 2026-04-15 01:39
- **What was done**:
  - Removed `WorkspaceKind.PERSONAL` and the workspace model uniqueness rule
    that only existed to enforce one Personal workspace per owner.
  - Removed Personal-space switcher schema, Personal onboarding payload shape,
    and the dedicated Personal retry API route/service.
  - Simplified `/me/workspaces` to return normal Team workspace items plus
    onboarding state, and rewrote focused onboarding/switcher/bootstrap/auth
    tests to assert the Team-only payload.
  - Deleted obsolete Personal-only backend tests and policy service code that
    would no longer compile after the enum hard cut.
- **Validation**:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/auth/test_auth_workspace_first_registration_flow_integration.py tests/modules/workspaces/test_workspace_first_onboarding_state_integration.py tests/modules/workspaces/test_workspace_switcher_contract_integration.py tests/modules/system/test_instance_bootstrap_integration.py tests/modules/workspaces/test_workspace_slug_update_unit.py` → passed
  - `pnpm -C apps/api typecheck` → passed with pre-existing repository warnings
- **Next step**: Child 2 — focused backend policy regression validation

---

## Milestone 2: Child 2 — backend policy and caller cleanup

- **Status**: DONE
- **Completed**: 2026-04-15 02:05
- **What was done**:
  - Verified that the danger endpoint, workspace settings metadata, and role
    policy integrations no longer depend on Personal-only behavior after the
    enum hard cut.
  - Confirmed the remaining backend service graph no longer needs special leave,
    delete, or manage guards for a Personal workspace.
  - Synced the child and parent taskmaster truth files so the epic now advances
    from backend validation to admin cleanup.
- **Validation**:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_danger_endpoints_integration.py tests/modules/workspaces/test_workspace_settings_metadata_integration.py tests/modules/workspaces/test_workspace_role_policy_endpoints_integration.py` → passed
  - `pnpm -C apps/api typecheck` → passed with pre-existing repository warnings
- **Next step**: Child 3 — admin onboarding and post-auth Team-only cleanup

---

## Milestone 3: Child 3 — admin onboarding and post-auth Team-only cleanup

- **Status**: DONE
- **Completed**: 2026-04-15 02:24
- **What was done**:
  - Removed Personal-only fields from the admin workspace API types and client
    so onboarding and switcher payloads align with the backend Team-only
    contract.
  - Simplified onboarding step 2 into a single workspace `name + slug` form
    while keeping the existing onboarding cadence.
  - Removed the Personal fallback branch from post-auth routing and updated the
    onboarding locale copy to describe the Team-only model.
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/post-auth-routing.test.ts test/pages/onboarding/workspace-first-onboarding-page.test.tsx` → passed
  - `pnpm -C apps/admin typecheck` → passed
- **Next step**: Child 4 — admin switcher, `/workspaces`, and shell Team-only cleanup

---

## Milestone 4: Child 4 — admin switcher, `/workspaces`, and shell Team-only cleanup

- **Status**: DONE
- **Completed**: 2026-04-15 02:24
- **What was done**:
  - Removed Personal status/retry UI and stale tag rendering from the admin
    workspace switcher.
  - Removed Personal-only card/table/list branches from usercenter
    `/workspaces`, workspace settings basics, and Team route guards.
  - Deleted the stale Personal workspace tag file and updated focused admin
    tests to assert the Team-only behavior.
- **Validation**:
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/components/common/admin-workspace-switcher.test.tsx test/pages/account/workspace-list-items.test.ts test/pages/account/workspaces-card-grid.test.tsx test/routes/workspace-team-route-kind-guard.test.ts test/lib/workspace-nav-regression.test.ts test/pages/workspaces/workspace-settings-basics-form.test.tsx test/pages/destructive-flows/organization-workspace-danger.test.tsx test/components/layout/admin-notifications-panel-width.test.tsx test/components/layout/admin-notifications-panel-motion.test.tsx test/components/layout/admin-notifications-panel-toggle.test.tsx` → passed
  - `pnpm -C apps/admin typecheck` → passed
- **Next step**: Child 5 — focused validation and artifact close-out

---

## Milestone 5: Child 5 — focused validation and artifact close-out

- **Status**: DONE
- **Completed**: 2026-04-15 02:24
- **What was validated**:
  - `pnpm -C apps/admin typecheck` → passed
  - `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/lib/post-auth-routing.test.ts test/pages/onboarding/workspace-first-onboarding-page.test.tsx test/components/common/admin-workspace-switcher.test.tsx test/pages/account/workspace-list-items.test.ts test/pages/account/workspaces-card-grid.test.tsx test/routes/workspace-team-route-kind-guard.test.ts test/lib/workspace-nav-regression.test.ts test/pages/workspaces/workspace-settings-basics-form.test.tsx test/pages/destructive-flows/organization-workspace-danger.test.tsx test/components/layout/admin-notifications-panel-width.test.tsx test/components/layout/admin-notifications-panel-motion.test.tsx test/components/layout/admin-notifications-panel-toggle.test.tsx` → passed
  - `pnpm -C apps/api typecheck` → passed with pre-existing repository warnings
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_danger_endpoints_integration.py tests/modules/workspaces/test_workspace_settings_metadata_integration.py tests/modules/workspaces/test_workspace_role_policy_endpoints_integration.py` → passed
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/auth/test_auth_workspace_first_registration_flow_integration.py tests/modules/workspaces/test_workspace_first_onboarding_state_integration.py tests/modules/workspaces/test_workspace_switcher_contract_integration.py tests/modules/system/test_instance_bootstrap_integration.py tests/modules/workspaces/test_workspace_slug_update_unit.py` → passed
- **Environment notes**:
  - One attempted parallel backend pytest run hit harness-level collisions:
    Tortoise global context fallback was already enabled and PostgreSQL schema
    setup hit a duplicate `pg_type_typname_nsp_index` key.
  - The same auth/onboarding pytest batch passed when rerun serially, so the
    failure was recorded as a test harness collision rather than a Team-only
    workspace regression.
- **Close-out**:
  - Child 3, Child 4, and Child 5 task artifacts were synced to `DONE`.
  - The parent `SUBTASKS.csv` and `PROGRESS.md` now match the live repository
    state.
  - The same admin and backend validation commands were rerun successfully
    after artifact sync as a fresh completion check.
