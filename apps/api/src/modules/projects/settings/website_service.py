from __future__ import annotations

from collections.abc import Callable
from typing import Literal, TypeVar, cast
from uuid import UUID

from pydantic import BaseModel, ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.settings.website_projection import (
    DISCOVERY_SETTINGS_PROJECTION,
    IDENTITY_SETTINGS_PROJECTION,
    LOCALIZATION_SETTINGS_PROJECTION,
    WebsiteSettingsProjection,
)
from src.modules.projects.settings.website_repository import ProjectWebsiteSettingsRepository
from src.modules.projects.settings.website_schema import (
    WebsiteDiscoverySettings,
    WebsiteDiscoverySettingsDetail,
    WebsiteIdentitySettings,
    WebsiteIdentitySettingsDetail,
    WebsiteLocalizationSettings,
    WebsiteLocalizationSettingsDetail,
)
from src.settings.core_schema import CORE_SETTINGS_SCHEMA
from src.settings.validation import merge_deep, validate_config_schema

type WebsiteSettingsSource = Literal["api", "agent"]
type WebsiteSettingsFacade = Literal["identity", "discovery", "localization"]

PROJECT_WEBSITE_IDENTITY_UPDATED_EVENT = "project.website.identity.updated"
PROJECT_WEBSITE_DISCOVERY_UPDATED_EVENT = "project.website.discovery.updated"
PROJECT_WEBSITE_LOCALIZATION_UPDATED_EVENT = "project.website.localization.updated"
PROJECT_WEBSITE_SETTINGS_ETAG_MISMATCH = "PROJECT_WEBSITE_SETTINGS_ETAG_MISMATCH"
PROJECT_WEBSITE_SETTINGS_INVALID = "PROJECT_WEBSITE_SETTINGS_INVALID"

SettingsModel = TypeVar("SettingsModel", bound=BaseModel)


def _record_value(record: SettingRecord | None) -> JsonObject:
    if record is None or record.value is None:
        return {}
    if not isinstance(record.value, dict):
        raise Conflict(
            "Stored project website settings are invalid",
            error=PROJECT_WEBSITE_SETTINGS_INVALID,
        )
    return cast(JsonObject, record.value)


class ProjectWebsiteSettingsService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: ProjectWebsiteSettingsRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository or ProjectWebsiteSettingsRepository()

    async def get_identity(self, *, project_id: UUID) -> WebsiteIdentitySettingsDetail:
        value = self._parse(
            IDENTITY_SETTINGS_PROJECTION.from_core,
            _record_value(await self.repository.get_core(project_id=project_id)),
        )
        return WebsiteIdentitySettingsDetail(
            value=value,
            etag=IDENTITY_SETTINGS_PROJECTION.etag(value),
        )

    async def get_discovery(self, *, project_id: UUID) -> WebsiteDiscoverySettingsDetail:
        value = self._parse(
            DISCOVERY_SETTINGS_PROJECTION.from_core,
            _record_value(await self.repository.get_core(project_id=project_id)),
        )
        return WebsiteDiscoverySettingsDetail(
            value=value,
            etag=DISCOVERY_SETTINGS_PROJECTION.etag(value),
        )

    async def get_localization(self, *, project_id: UUID) -> WebsiteLocalizationSettingsDetail:
        value = self._parse(
            LOCALIZATION_SETTINGS_PROJECTION.from_core,
            _record_value(await self.repository.get_core(project_id=project_id)),
        )
        return WebsiteLocalizationSettingsDetail(
            value=value,
            etag=LOCALIZATION_SETTINGS_PROJECTION.etag(value),
        )

    async def replace_identity(
        self,
        *,
        project_id: UUID,
        replacement: WebsiteIdentitySettings,
        expected_etag: str,
        actor_user_id: UUID,
        source: WebsiteSettingsSource = "api",
    ) -> WebsiteIdentitySettingsDetail:
        value, etag = await self._replace(
            project_id=project_id,
            replacement=replacement,
            expected_etag=expected_etag,
            actor_user_id=actor_user_id,
            source=source,
            facade="identity",
            event_name=PROJECT_WEBSITE_IDENTITY_UPDATED_EVENT,
            projection=IDENTITY_SETTINGS_PROJECTION,
        )
        return WebsiteIdentitySettingsDetail(value=value, etag=etag)

    async def replace_discovery(
        self,
        *,
        project_id: UUID,
        replacement: WebsiteDiscoverySettings,
        expected_etag: str,
        actor_user_id: UUID,
        source: WebsiteSettingsSource = "api",
    ) -> WebsiteDiscoverySettingsDetail:
        value, etag = await self._replace(
            project_id=project_id,
            replacement=replacement,
            expected_etag=expected_etag,
            actor_user_id=actor_user_id,
            source=source,
            facade="discovery",
            event_name=PROJECT_WEBSITE_DISCOVERY_UPDATED_EVENT,
            projection=DISCOVERY_SETTINGS_PROJECTION,
        )
        return WebsiteDiscoverySettingsDetail(value=value, etag=etag)

    async def replace_localization(
        self,
        *,
        project_id: UUID,
        replacement: WebsiteLocalizationSettings,
        expected_etag: str,
        actor_user_id: UUID,
        source: WebsiteSettingsSource = "api",
    ) -> WebsiteLocalizationSettingsDetail:
        value, etag = await self._replace(
            project_id=project_id,
            replacement=replacement,
            expected_etag=expected_etag,
            actor_user_id=actor_user_id,
            source=source,
            facade="localization",
            event_name=PROJECT_WEBSITE_LOCALIZATION_UPDATED_EVENT,
            projection=LOCALIZATION_SETTINGS_PROJECTION,
        )
        return WebsiteLocalizationSettingsDetail(value=value, etag=etag)

    @staticmethod
    def _parse(
        projector: Callable[[JsonObject], SettingsModel],
        core: JsonObject,
    ) -> SettingsModel:
        try:
            return projector(core)
        except (TypeError, ValidationError) as exc:
            raise Conflict(
                "Stored project website settings are invalid",
                error=PROJECT_WEBSITE_SETTINGS_INVALID,
            ) from exc

    async def _replace(
        self,
        *,
        project_id: UUID,
        replacement: SettingsModel,
        expected_etag: str,
        actor_user_id: UUID,
        source: WebsiteSettingsSource,
        facade: WebsiteSettingsFacade,
        event_name: str,
        projection: WebsiteSettingsProjection[SettingsModel],
    ) -> tuple[SettingsModel, str]:
        async with self.tx() as conn:
            record = await self.repository.get_core_for_update(project_id=project_id, conn=conn)
            core = _record_value(record)
            current = self._parse(projection.from_core, core)
            current_etag = projection.etag(current)
            self._require_matching_etag(expected_etag, current_etag, facade=facade)
            changed_paths = projection.changed_paths(current, replacement)
            if not changed_paths:
                return current, current_etag

            merged = merge_deep(core, projection.build_patch(current, replacement))
            validate_config_schema(CORE_SETTINGS_SCHEMA, merged, allow_unknown=True)
            await self.repository.save_core(
                record=record,
                value=merged,
                updated_by=actor_user_id,
                conn=conn,
            )
            replacement_etag = projection.etag(replacement)
            await self._write_activity_event(
                project_id=project_id,
                actor_user_id=actor_user_id,
                source=source,
                facade=facade,
                event_name=event_name,
                changed_paths=changed_paths,
                previous_etag=current_etag,
                etag=replacement_etag,
                conn=conn,
            )
            return replacement, replacement_etag

    @staticmethod
    def _require_matching_etag(
        expected_etag: str,
        current_etag: str,
        *,
        facade: WebsiteSettingsFacade,
    ) -> None:
        if expected_etag == current_etag:
            return
        raise Conflict(
            "Project website settings changed; reload before saving",
            error=PROJECT_WEBSITE_SETTINGS_ETAG_MISMATCH,
            meta={"facade": facade, "currentEtag": current_etag},
        )

    async def _write_activity_event(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        source: WebsiteSettingsSource,
        facade: WebsiteSettingsFacade,
        event_name: str,
        changed_paths: list[str],
        previous_etag: str,
        etag: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        properties: JsonObject = {
            "project_id": str(project_id),
            "facade": facade,
            "paths": changed_paths,
            "previous_etag": previous_etag,
            "etag": etag,
        }
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                project_id=project_id,
                entity_type="project_website_settings",
                entity_id=project_id,
                source=source,
                properties=properties,
            ),
            conn=conn,
        )
