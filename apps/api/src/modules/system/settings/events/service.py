from __future__ import annotations

import asyncio
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.events import (
    SETTINGS_UPDATED,
    SYSTEM_FEATURE_FLAGS_UPDATED,
    SYSTEM_MAIL_UPDATED,
    SYSTEM_STORAGE_UPDATED,
)
from src.common.protocols.logging import LoggerLike
from src.common.types.json_types import JsonObject
from src.core.services import BaseService
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.settings.schema import ConfigSchema
from src.settings.validation import iter_secret_field_paths

_FATAL_SETTINGS_SERVICE_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)

_FEATURE_FLAG_SECTIONS: frozenset[str] = frozenset({
    "auth",
    "comments",
    "notifications",
    "oauth_provisioning",
})


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SETTINGS_SERVICE_ERRORS):
        raise exc


def _flatten_patch_paths(patch: JsonObject, *, _prefix: str = "") -> list[str]:
    # Only emit keys/paths, never values (could contain secrets).
    out: list[str] = []
    for key, value in (patch or {}).items():
        if not key:
            continue
        path = f"{_prefix}.{key}" if _prefix else str(key)
        if isinstance(value, dict):
            out.extend(_flatten_patch_paths(cast(JsonObject, value), _prefix=path))
        else:
            out.append(path)
    return out


def _is_secret_descendant(path: str, secrets: set[str]) -> bool:
    prefix = f"{path}."
    return any(s.startswith(prefix) for s in secrets)


def _event_name_for_changed_paths(changed_paths: list[str]) -> str:
    top_level_sections = {path.split(".", 1)[0] for path in changed_paths if path}
    if top_level_sections == {"mail"}:
        return SYSTEM_MAIL_UPDATED
    if top_level_sections == {"storage"}:
        return SYSTEM_STORAGE_UPDATED
    if top_level_sections and top_level_sections <= _FEATURE_FLAG_SECTIONS:
        return SYSTEM_FEATURE_FLAGS_UPDATED
    return SETTINGS_UPDATED


class SettingsEventsMixin:
    logger: LoggerLike

    async def _emit_settings_updated(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        patch: JsonObject,
        actor_user_id: str | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[str, JsonObject]:
        secret_paths = set(iter_secret_field_paths(schema))
        changed_paths = _flatten_patch_paths(patch)
        contains_secrets = any((p in secret_paths) or _is_secret_descendant(p, secret_paths) for p in changed_paths)
        event_name = _event_name_for_changed_paths(changed_paths)
        service = cast(BaseService, self)
        await write_required_activity_event(
            settings=service.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                source="core",
                actor_user_id=_coerce_uuid(actor_user_id),
                properties={
                    "namespace": namespace,
                    "paths": changed_paths,
                    "contains_sensitive_values": contains_secrets,
                },
            ),
            conn=conn,
        )
        return event_name, {
            "namespace": namespace,
            "paths": changed_paths,
            "contains_sensitive_values": contains_secrets,
        }


def _coerce_uuid(value: str | None):
    if value is None:
        return None
    return UUID(str(value))
