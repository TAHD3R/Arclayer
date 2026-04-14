# Progress

## 2026-04-15 03:12 CST

- `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/system/test_settings.py tests/core/test_static.py tests/core/test_middlewares.py tests/core/test_logging.py`
  - PASS
- `timeout 60s pnpm -C apps/api uv -- pytest -q -x tests/modules/auth/test_auth_integration.py tests/modules/auth/test_auth_2fa_privileged_ops_unit.py tests/modules/auth/test_auth_refresh_unit.py tests/modules/auth/test_auth_login_2fa_unit.py tests/modules/auth/test_auth_password_flows_unit.py`
  - PASS (`test_auth_integration.py` skipped when integration mode is disabled)
- `pnpm -C apps/api uv -- python -m compileall src/config.py src/settings/env_models.py src/core/middleware/guard_integration.py`
  - PASS

### Visible Unrelated Drift

- `tests/core/test_exception_handlers.py` currently expects raw English exception messages, but the live response payload is localized (`参数错误`, `资源不存在`). That drift was exposed during exploratory validation and intentionally left outside this env-contract cleanup slice.
