from __future__ import annotations

import importlib.util
from pathlib import Path

from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    """
    Data migration: split legacy core settings key `localization` into:
    - `workspace_localization` (admin experience default)
    - `site_localization` (visitor/site default, reserved for future)

    Notes:
    - Applies to both system-scoped and workspace-scoped `core` records.
    - Idempotent: safe to run multiple times.
    """

    return """
        UPDATE "settings"
        SET "value" = (
            CASE
                WHEN "value" IS NULL THEN NULL
                WHEN ("value" ? 'localization') THEN
                    ("value" - 'localization')
                    || jsonb_build_object(
                        'workspace_localization',
                        COALESCE("value"->'workspace_localization', "value"->'localization'),
                        'site_localization',
                        COALESCE("value"->'site_localization', "value"->'localization')
                    )
                ELSE "value"
            END
        )
        WHERE "namespace" = 'core';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    """
    Best-effort revert: merge `workspace_localization` back into `localization` and
    drop the split keys. This may lose the distinction between workspace/site localization.
    """

    return """
        UPDATE "settings"
        SET "value" = (
            CASE
                WHEN "value" IS NULL THEN NULL
                WHEN ("value" ? 'workspace_localization') OR ("value" ? 'site_localization') THEN
                    ("value" - 'workspace_localization' - 'site_localization')
                    || jsonb_build_object(
                        'localization',
                        COALESCE("value"->'workspace_localization', "value"->'site_localization')
                    )
                ELSE "value"
            END
        )
        WHERE "namespace" = 'core';"""


def _load_prev_models_state() -> str:
    # Aerich expects MODELS_STATE to be present in every migration module.
    # This migration is data-only, so we reuse the previous migration's MODELS_STATE.
    prev = Path(__file__).with_name("39_20260201193530_plugin_plugin_admin_dynamic_menu.py")
    spec = importlib.util.spec_from_file_location("_prev_migration_39", prev)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load previous migration module for MODELS_STATE")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    state = getattr(mod, "MODELS_STATE", None)
    if not isinstance(state, str):
        raise RuntimeError("Previous migration MODELS_STATE is missing or invalid")
    return state


MODELS_STATE = _load_prev_models_state()
