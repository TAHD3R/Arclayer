from __future__ import annotations

import asyncio

from src.common.constants.events import SETTINGS_UPDATED
from src.common.protocols.logging import LoggerLike
from src.core.events import Event, EventBus
from src.settings.schema import ConfigSchema
from src.settings.validation import iter_secret_field_paths

_FATAL_SETTINGS_SERVICE_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SETTINGS_SERVICE_ERRORS):
        raise exc


def _flatten_patch_paths(patch: dict[str, object], *, _prefix: str = "") -> list[str]:
    # Only emit keys/paths, never values (could contain secrets).
    out: list[str] = []
    for key, value in (patch or {}).items():
        if not key:
            continue
        path = f"{_prefix}.{key}" if _prefix else str(key)
        if isinstance(value, dict):
            out.extend(_flatten_patch_paths(value, _prefix=path))
        else:
            out.append(path)
    return out


def _is_secret_descendant(path: str, secrets: set[str]) -> bool:
    prefix = f"{path}."
    return any(s.startswith(prefix) for s in secrets)


class SettingsEventsMixin:
    event_bus: EventBus
    logger: LoggerLike

    async def _emit_settings_updated(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        patch: dict[str, object],
        actor_user_id: str | None,
    ) -> None:
        try:
            secret_paths = set(iter_secret_field_paths(schema))
            changed_paths = _flatten_patch_paths(patch)
            contains_secrets = any((p in secret_paths) or _is_secret_descendant(p, secret_paths) for p in changed_paths)
            await self.event_bus.publish(
                Event(
                    name=SETTINGS_UPDATED,
                    payload={
                        "namespace": namespace,
                        "paths": changed_paths,
                        "contains_secrets": contains_secrets,
                    },
                    source="core",
                    actor_user_id=actor_user_id,
                )
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Settings updated event publish failed",
                action="emit_settings_updated_event",
                namespace=namespace,
                event_name=SETTINGS_UPDATED,
                error=str(exc),
            )
            return
