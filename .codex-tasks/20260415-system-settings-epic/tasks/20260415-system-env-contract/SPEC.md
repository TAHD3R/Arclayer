# Child Task: Canonical API Env Contract Cleanup

## Goal

Remove the legacy alias-heavy API env contract, replace it with canonical nested env names only, and relocate the misnamed runtime settings sections under `src/settings/`.

## Scope

- Move `apps/api/src/config_runtime.py` to `apps/api/src/settings/env_models.py`
- Drop legacy `APP_*` / `DB_*` / `CACHE_*` / bare `JWT_SECRET` aliases from API settings models
- Remove the nested-settings reparse/merge workaround from `Settings`
- Clean the dead env sections and unsupported keys from `apps/api/.env.example`

## Success Criteria

- `get_settings()` loads canonical nested env names without the old merge workaround
- API tests use canonical env names only
- `.env.example` no longer documents dead env sections that have no live consumer
