from __future__ import annotations

from typing import cast
from uuid import UUID

from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.events import EventBus
from src.core.exceptions import BadRequest, NotFound
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.system.settings.events.service import SettingsEventsMixin
from src.modules.system.settings.repository import SettingsRepository
from src.modules.system.settings.schema import SettingsDetail, SettingsNamespaceSummary
from src.modules.system.settings.schemahelpers.service import SettingsSchemaHelpersMixin
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import (
    StorageProfileRouteService,
    StorageProfileRouteUnavailableError,
)
from src.platform.storage.profiles import ENV_DEFAULT_PROFILE_KEY
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.runtime import invalidate_core_settings_cache
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from src.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


def _te(key: str) -> str:
    return t("errors", key)


def _normalize_default_profile_patch(
    patch: JsonObject,
    *,
    fallback_key: str,
) -> tuple[JsonObject, str | None]:
    storage = patch.get("storage")
    if not isinstance(storage, dict) or "default_profile_key" not in storage:
        return patch, None

    raw_key = storage.get("default_profile_key")
    if raw_key is not None and not isinstance(raw_key, str):
        return patch, None

    submitted_key = raw_key.strip().lower() if isinstance(raw_key, str) else ""
    target_key = submitted_key or fallback_key.strip().lower()
    normalized_storage = cast(JsonObject, {**storage, "default_profile_key": submitted_key or None})
    return cast(JsonObject, {**patch, "storage": normalized_storage}), target_key


class SettingsService(
    SettingsEventsMixin,
    SettingsSchemaHelpersMixin,
    BaseService,
):
    def __init__(
        self,
        settings: Settings,
        *,
        event_bus: EventBus,
        repository: SettingsRepository | None = None,
        profile_repository: StorageProfileRouteRepository | None = None,
        profile_route_service: StorageProfileRouteService | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=event_bus)
        self.repo = repository or SettingsRepository()
        self.profile_repository = profile_repository or StorageProfileRouteRepository()
        self.profile_route_service = profile_route_service or StorageProfileRouteService(
            settings,
            repository=self.profile_repository,
        )
        self.event_bus = event_bus

    async def list_namespaces(self, *, params: PageParams) -> PageData[SettingsNamespaceSummary]:
        items: list[SettingsNamespaceSummary] = [
            SettingsNamespaceSummary(
                namespace=CORE_SETTINGS_NAMESPACE,
                kind="core",
                title=_ts("CORE_SETTINGS_TITLE", "系统设置"),
                description=_ts("CORE_SETTINGS_DESC", "站点设置与基础系统配置。"),
            )
        ]
        return paginate_items(items, params=params)

    async def get_namespace_detail(self, namespace: str) -> SettingsDetail:
        if namespace == CORE_SETTINGS_NAMESPACE:
            schema = CORE_SETTINGS_SCHEMA
            record = await self.repo.get_by_namespace(CORE_SETTINGS_NAMESPACE)
            raw = record.value if record and isinstance(record.value, dict) else {}
            masked, secrets = self._mask_secrets(schema, raw)
            return SettingsDetail(
                namespace=CORE_SETTINGS_NAMESPACE,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=record.updated_at if record else None,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")

    async def patch_namespace(
        self,
        namespace: str,
        *,
        patch: JsonObject,
        updated_by: UUID | None,
    ) -> SettingsDetail:
        if namespace == CORE_SETTINGS_NAMESPACE:
            schema = CORE_SETTINGS_SCHEMA
            normalized_patch, default_profile_key = _normalize_default_profile_patch(
                patch,
                fallback_key=self.settings.storage.default_profile_key,
            )
            await self._materialize_environment_default(default_profile_key)

            async with self.tx() as conn:
                await self._lock_available_default_profile(default_profile_key, conn=conn)
                record = await self.repo.get_by_namespace_for_update(
                    CORE_SETTINGS_NAMESPACE,
                    conn=conn,
                )
                current = record.value if record and isinstance(record.value, dict) else {}
                merged = merge_deep(current, normalized_patch)
                validate_config_schema(schema, merged, allow_unknown=True)
                saved = await self.repo.upsert(
                    namespace=CORE_SETTINGS_NAMESPACE,
                    value=merged,
                    updated_by=updated_by,
                    conn=conn,
                )
                event_name, event_payload = await self._emit_settings_updated(
                    namespace=CORE_SETTINGS_NAMESPACE,
                    schema=schema,
                    patch=normalized_patch,
                    actor_user_id=str(updated_by) if updated_by is not None else None,
                    conn=conn,
                )
            invalidate_core_settings_cache()
            await self.publish_domain_event(
                name=event_name,
                payload=event_payload,
                actor_user_id=updated_by,
            )
            masked, secrets = self._mask_secrets(schema, merged)
            return SettingsDetail(
                namespace=CORE_SETTINGS_NAMESPACE,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=saved.updated_at,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")

    async def _materialize_environment_default(self, profile_key: str | None) -> None:
        if profile_key != ENV_DEFAULT_PROFILE_KEY:
            return
        try:
            await self.profile_route_service.materialize_by_key(profile_key=profile_key)
        except (ValidationError, StorageProfileRouteUnavailableError) as exc:
            raise self._default_profile_unavailable() from exc

    async def _lock_available_default_profile(
        self,
        profile_key: str | None,
        *,
        conn: BaseDBAsyncClient,
    ) -> None:
        if profile_key is None:
            return
        profile = await self.profile_repository.get_profile_by_key_for_update(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            profile_key=profile_key,
            conn=conn,
        )
        if profile is None or profile.tombstoned_at is not None or not profile.is_active:
            raise self._default_profile_unavailable()
        try:
            await self.profile_route_service.materialize_locked_profile(
                profile=profile,
                conn=conn,
            )
        except (ValidationError, StorageProfileRouteUnavailableError) as exc:
            raise self._default_profile_unavailable() from exc

    @staticmethod
    def _default_profile_unavailable() -> BadRequest:
        return BadRequest(
            message=_te("STORAGE_PROFILE_DEFAULT_UNAVAILABLE"),
            error="STORAGE_PROFILE_DEFAULT_UNAVAILABLE",
        )

    @staticmethod
    def _mask_secrets(schema, config: JsonObject) -> tuple[JsonObject, dict[str, bool]]:
        masked: JsonObject = dict(config or {})
        secrets: dict[str, bool] = {}

        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = masked.get(section_id)
            if not isinstance(section, dict):
                secrets[path] = False
                continue
            section_dict = cast(JsonObject, section)
            value = section_dict.get(field_key)
            if value is None:
                secrets[path] = False
                continue
            secrets[path] = True
            section_dict[field_key] = None

        return masked, secrets
