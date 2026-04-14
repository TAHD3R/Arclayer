# Progress

## 2026-04-15 03:12 CST

- Moved the env-backed settings section models from `apps/api/src/config_runtime.py` to `apps/api/src/settings/env_models.py` so they live under the same `src/settings/` namespace as the rest of the configuration contract.
- Removed the legacy alias matrix from `apps/api/src/config.py` and `apps/api/src/settings/env_models.py`; canonical nested env keys are now the only supported input shape for those settings.
- Deleted the nested-settings `_apply_env_overrides()` merge pass from `Settings`; env and dotenv precedence now comes from the normal pydantic settings source order instead of a second manual parse.
- Updated focused API tests to use canonical env names such as `APPLICATION__*`, `LOGGING__*`, `MIDDLEWARE__*`, and `AUTH__JWT_SECRET`.
- Pruned unsupported keys from `apps/api/.env.example`, including the dead `OBSERVABILITY__*`, `PLUGIN__*`, `SETUP__*`, `APPLICATION__DEPLOYMENT_MODE`, and `DATABASE__PLUGIN_PACKAGES` entries.
