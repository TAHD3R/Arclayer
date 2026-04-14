# Progress

## 2026-04-15 00:00 CST

### Session Start

- Task: Backend super-admin system settings foundation
- Shape: single-full
- Task dir: `.codex-tasks/20260415-system-settings-epic/tasks/20260415-backend-foundation/`
- Active truth file: `.codex-tasks/20260415-system-settings-epic/tasks/20260415-backend-foundation/TODO.csv`

### Context Recovery

- Current milestone: complete
- Current status: DONE
- Last completed: #3 — Add focused backend verification for the new authority boundary
- Current artifact: `.codex-tasks/20260415-system-settings-epic/tasks/20260415-backend-foundation/TODO.csv`
- Key context:
  - `/system/settings/*` currently uses `require_org_owner`, which conflicts with the approved super-admin-only design.
  - User model and auth payload already carry `is_super_admin`, so the durable fix is a dedicated dependency rather than another org-level permission rule.
- Known issues:
  - The public runtime probe test still has an unrelated DB-less assumption and should be handled in a separate cleanup task if we expand backend runtime work later.
- Next action: hand off to the admin shell child task so frontend routing/menu visibility can align with the new authority boundary.

## 2026-04-15 01:02 CST

### Milestone Completion

- Completed task #2 by introducing a dedicated `require_super_admin` dependency in `src.modules.auth.http.service`.
- Rewired `src.modules.system.settings.router` and `src.modules.system.mail.router` to use that dependency instead of `require_org_owner`.
- Updated system integration tests so auth overrides now reflect the new dependency chain and added a direct `SUPER_ADMIN_REQUIRED` assertion.

### Verification

- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/system/test_admin_mail_integration.py::test_admin_mail_test_endpoint_respects_core_mail_enabled tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_endpoints_available_without_deployment_mode_gate tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_settings_require_super_admin`
  - PASS

### Notes

- A broader pass that included `test_system_runtime_public_endpoint` failed for an unrelated pre-existing reason: `InstanceSetupService` now queries DB-backed super-admin truth while that test still assumes a DB-less app. The failure was left visible and excluded from the focused validation command for this child task.
