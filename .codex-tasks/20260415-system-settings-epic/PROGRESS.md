# Progress

## 2026-04-15 00:00 CST

### Session Start

- Task: Super admin system settings epic
- Shape: epic
- Task dir: `.codex-tasks/20260415-system-settings-epic/`
- Active truth file: `.codex-tasks/20260415-system-settings-epic/SUBTASKS.csv`
- Plan doc: `docs/plans/2026-04-15-001-system-settings-implementation-plan.md`

### Context Recovery

- Current milestone: Child #2 — Admin global route/menu and visibility guard
- Current status: IN_PROGRESS
- Last completed: Child #1 — Backend super-admin system settings foundation
- Current artifact: `.codex-tasks/20260415-system-settings-epic/SUBTASKS.csv`
- Key context:
  - Design has been approved in chat: `System Settings` is a global-scene, super-admin-only instance console.
  - Live repo already contains `/system/settings/*` APIs and admin API clients, but the backend is still guarded by org owner and the frontend has no real entry surface yet.
- Known issues:
  - `config.py` and `config_runtime.py` still mix deployment and operator concerns; only the first safe contract slice should land now.
  - Global route identity only treats `/` and `/workspaces` as global-scene paths today.
- Next action: extend admin global routing/menu contracts so `/system/*` renders in the global scene and only super admins can see or enter it.

## 2026-04-15 01:02 CST

### Child #1 Complete

- Added `require_super_admin` to `apps/api/src/modules/auth/http/service.py`.
- Switched `apps/api/src/modules/system/settings/router.py` and `apps/api/src/modules/system/mail/router.py` from `require_org_owner` to `require_super_admin`.
- Updated system integration tests so super-admin dependency overrides reflect the new auth path.
- Added a focused `SUPER_ADMIN_REQUIRED` endpoint test for `/api/v1/system/settings`.

### Verification

- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/system/test_admin_mail_integration.py::test_admin_mail_test_endpoint_respects_core_mail_enabled tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_endpoints_available_without_deployment_mode_gate tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_settings_require_super_admin`
  - PASS

### Notes

- A broader pass that included `test_system_runtime_public_endpoint` still exposed an unrelated baseline issue: that test assumes `InstanceSetupService` can run without DB wiring. That failure is not introduced by the super-admin gate change, so the narrowed validation command was kept aligned to the touched endpoints.

## 2026-04-15 02:04 CST

### Child #2 Complete

- Added `apps/admin/src/hooks/use-current-user-profile.ts` to centralize `/auth/me` and derive `isSuperAdmin`.
- Replaced the old global settings placeholder with a real `global.system` nav contract in `apps/admin/src/constants/menu/global.ts`.
- Updated `apps/admin/src/layouts/global-layout.tsx` so both `AdminTopbar` and `AdminSceneLayout` receive the same filtered global-nav list.
- Extended `apps/admin/src/lib/routing/route-identity.ts` so `/system/*` resolves as part of the global scene.

### Child #3 Complete

- Added a shared `SystemSettingsShell` plus nested `/system`, `/system/storage`, and `/system/email` routes.
- Implemented three first-pass domain pages backed by live runtime and system-core settings data.
- Reused the existing `/system/mail/test` endpoint to provide a truthful first interactive action inside the email domain.
- Added the required nav/settings locale keys for the new console hierarchy.

### Validation

- `pnpm -C apps/admin exec vitest run test/lib/global-nav-regression.test.ts test/layouts/global-layout.test.tsx test/lib/route-identity.test.ts`
  - PASS
- `pnpm -C apps/admin exec vitest run test/routes/route-title-registry.test.ts`
  - PASS
- `pnpm -C apps/admin typecheck`
  - PASS

### Artifact Reconciliation

- Added child task directories for `20260415-admin-shell`, `20260415-system-settings-ui`, and `20260415-validation`.
- Updated `SUBTASKS.csv` so child #2, #3, and #4 now reflect the actual completion state.

### Notes

- The console intentionally stays scoped to overview/storage/email for now. Wider domains such as OAuth, security, accounts, analytics, and compliance remain design-backed but unimplemented until the config contract cleanup lands.

## 2026-04-15 02:53 CST

### Phase 2 Complete

- Replaced the rejected mini side rail with a ChromeTabs-based shell and added `/system/oauth` into the same global super-admin surface.
- Upgraded storage from a stale read-only summary into an editable provider + connection contract and explicitly removed the old `public_base_url / upload policy` operator IA from the live surface.
- Upgraded email from a read-only snapshot into real SMTP, delivery policy, and test-send editing flows.
- Added a new OAuth page that edits Google/GitHub provider credentials plus provisioning/public registration policy through the existing `/system/settings/core` backend contract.
- Tightened `apps/api/src/settings/core_schema.py` so the editable slices now reflect the live consumers (`notifications`, `auth`, `oauth_google`, `oauth_github`, `oauth_provisioning`) while dropping the stale storage operator fields from the schema surface.

### Verification

- `pnpm -C apps/admin exec vitest run test/lib/global-nav-regression.test.ts test/layouts/global-layout.test.tsx test/lib/route-identity.test.ts test/routes/route-title-registry.test.ts`
  - PASS
- `pnpm -C apps/admin typecheck`
  - PASS
- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/system/test_admin_mail_integration.py::test_admin_mail_test_endpoint_respects_core_mail_enabled tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_endpoints_available_without_deployment_mode_gate tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_settings_require_super_admin`
  - PASS

### Notes

- This phase still does not attempt the full `config.py` / `config_runtime.py` cleanup. The operator-facing contract is now narrower and more truthful, which creates the right surface for a later env/runtime simplification pass.

## 2026-04-15 03:12 CST

### Phase 3 Complete

- Moved the env-backed API settings section models from `apps/api/src/config_runtime.py` into `apps/api/src/settings/env_models.py` so the runtime contract lives under the `src/settings/` namespace instead of a misleading top-level module.
- Hard-cut the API env contract to canonical nested env names only. `config.py` and `env_models.py` no longer carry the old `APP_*`, `DB_*`, `CACHE_*`, or bare `JWT_SECRET` alias matrix.
- Removed `Settings._apply_env_overrides()` and the second-pass nested-settings merge workaround. Canonical env and dotenv precedence now relies on the normal pydantic settings source order.
- Updated focused backend tests to use canonical env names and cleaned `apps/api/.env.example` so it no longer documents dead `OBSERVABILITY__*`, `PLUGIN__*`, `SETUP__*`, `APPLICATION__DEPLOYMENT_MODE`, or `DATABASE__PLUGIN_PACKAGES` keys.

### Verification

- `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/system/test_settings.py tests/core/test_static.py tests/core/test_middlewares.py tests/core/test_logging.py`
  - PASS
- `timeout 60s pnpm -C apps/api uv -- pytest -q -x tests/modules/auth/test_auth_integration.py tests/modules/auth/test_auth_2fa_privileged_ops_unit.py tests/modules/auth/test_auth_refresh_unit.py tests/modules/auth/test_auth_login_2fa_unit.py tests/modules/auth/test_auth_password_flows_unit.py`
  - PASS (`test_auth_integration.py` skipped when integration mode is disabled)
- `pnpm -C apps/api uv -- python -m compileall src/config.py src/settings/env_models.py src/core/middleware/guard_integration.py`
  - PASS

### Notes

- An exploratory validation pass that included `tests/core/test_exception_handlers.py` still exposes unrelated localization drift: those tests assert raw English messages while live payloads are localized. That drift remains visible and was intentionally not folded into this env-contract cleanup slice.

## 2026-04-15 03:30 CST

### Epic Resumed

- Reopened the epic after re-reading the approved product scope against live `/system` code.
- Current implementation truth: the first rollout delivered `overview/storage/email/oauth` plus env cleanup, but the approved super-admin control-plane scope still lacks dedicated Access, Notifications, and Activity domains.
- Added three new child tasks to continue the same epic instead of starting a disconnected follow-up:
  - `#11` system governance domains (`/system/access`, `/system/notifications`)
  - `#12` system activity audit domain and backend contract cleanup
  - `#13` phase-4 focused validation and artifact reconciliation

### Current Focus

- Child `#11` is now `IN_PROGRESS`.
- Next action: land the expanded `/system` route graph and move the existing policy editors onto the new Access and Notifications pages before touching the activity contract.

## 2026-04-15 03:55 CST

### Phase 6 Complete

- Split the super-admin console into clearer instance domains:
  - added `Access` and `Notifications` tabs/pages
  - shrank `Email` back to SMTP transport + test-send
  - shrank `OAuth` back to provider credentials
- Promoted `/system/activity` into a real super-admin audit surface with instance-wide listing/detail semantics instead of the old org-admin contract.
- Updated overview summaries and locale/title coverage so the expanded ChromeTabs IA is consistent across the global system console.

### Verification

- `pnpm -C apps/admin exec vitest run test/lib/global-nav-regression.test.ts test/layouts/global-layout.test.tsx test/lib/route-identity.test.ts test/routes/route-title-registry.test.ts test/api/activity.test.ts`
  - PASS
- `pnpm -C apps/admin typecheck`
  - PASS
- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/analytics/test_audit_log_endpoints_integration.py tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_settings_require_super_admin tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_activity_requires_super_admin`
  - PASS

### Notes

- The unrelated `test_system_runtime_public_endpoint` DB-less baseline issue remains visible and was not folded into this rollout's success boundary.
- Child tasks `#11`, `#12`, and `#13` are now complete and the epic truth files are back in sync with the validated repo state.
