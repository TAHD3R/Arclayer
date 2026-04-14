# Progress

## 2026-04-14

- Created full-single task artifacts.
- Confirmed current repo truth:
  - custom limiter lives in `apps/api/src/platform/limiter/limiter.py`
  - lifecycle wiring still initializes and closes that limiter from `apps/api/src/core/registry.py`
  - current route-specific limits are expressed only through `dependencies=[rate_limit(...)]`
  - FastAPI Guard already supports route-specific decorators and Redis-backed rate limiting
- Audit summary:
  - explicit Guard route overrides kept for abuse-prone and account-sensitive surfaces:
    - public auth entry points: email check, login, email-code login, 2FA login, register, refresh, forgot/reset password, invitation accept/preview
    - authenticated sensitive auth actions: change password, set password, 2FA setup/confirm/disable/regenerate, email change request/confirm, account delete
    - SSO public/auth-adjacent actions: providers, exchange, link-state, OAuth start, OAuth callback
    - system bootstrap and preview-token creation
  - hot-path public reads and routine authenticated CRUD remain on the Guard global default rather than strict per-route overrides:
    - public site/runtime/delivery/assets/library reads
    - workspace/admin CRUD surfaces without obvious abuse semantics
- Implementation summary:
  - added shared Guard decorator integration in `src/core/middleware/guard_decorators.py`
  - wired the decorator into app state from `guard_integration.py`
  - removed custom limiter lifecycle wiring from `core/registry.py`
  - removed Valkey limiter settings fields and deleted `src/platform/limiter/*`
  - converted route-level auth/system/sso limits from `dependencies=[rate_limit(...)]` to Guard route decorators
  - enabled Guard rate limiting in repo env examples with a high global baseline (`3000/60`) so public runtime traffic is not throttled by default
- Verification:
  - `pnpm -C apps/api uv -- ruff check ...` on all touched API files: pass
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/core/test_middlewares.py`: pass
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/auth/test_auth_login_2fa_unit.py tests/modules/auth/test_auth_refresh_unit.py tests/modules/auth/test_auth_sso_exchange_unit.py tests/modules/auth/test_auth_sso_providers_empty_unit.py tests/modules/auth/test_auth_2fa_privileged_ops_unit.py`: pass
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/auth tests/modules/system`: fail, but the failures are outside the rate-limit migration:
    - `tests/modules/auth/test_auth_2fa_challenge_atomic_unit.py::test_two_factor_challenge_cannot_be_reused_even_if_record_still_exists`
      - fails in `PersonalSpaceService.ensure_for_login()` because Tortoise models have no DB connection in this unit-test setup
    - `tests/modules/system/test_settings_ia_refactor_endpoints.py::test_system_runtime_public_endpoint`
      - fails in `InstanceSetupService.get_state()` because the bare router test invokes DB-backed queries without ORM initialization
