from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.core.i18n import t
from src.core.services import BaseService
from src.models.system.plugin_installation import (
    PluginInstallationRecord,
    PluginRuntimeActivationState,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.system.plugins.configuration_validation import (
    PluginConfigurationSchemaError,
    PluginConfigurationValueError,
    validate_configuration_values,
    validate_secret_references,
)
from src.modules.system.plugins.installation_defaults import build_plugin_installation_data
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.schema import (
    SystemPluginCatalogItemOut,
    SystemPluginConfigurationOut,
    SystemPluginConfigurationPatch,
)


class PluginConfigurationService(BaseService):
    def __init__(
        self,
        repository: PluginLifecycleRepository,
        *,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository

    async def get_configuration(
        self,
        *,
        item: SystemPluginCatalogItemOut,
        actor_user_id: UUID,
    ) -> SystemPluginConfigurationOut:
        async with self.tx() as conn:
            installation = await self._require_installation(
                item=item,
                actor_user_id=actor_user_id,
                conn=conn,
                for_update=False,
            )
        self._validate_persisted_configuration(item=item, installation=installation)
        return _configuration_out(installation)

    async def update_configuration(
        self,
        *,
        item: SystemPluginCatalogItemOut,
        payload: SystemPluginConfigurationPatch,
        actor_user_id: UUID,
    ) -> SystemPluginConfigurationOut:
        values, secret_references = _validate_patch(item=item, payload=payload)
        async with self.tx() as conn:
            installation = await self._require_installation(
                item=item,
                actor_user_id=actor_user_id,
                conn=conn,
                for_update=True,
            )
            current_revision = int(installation.configuration_revision)
            if current_revision != payload.expected_revision:
                raise Conflict(
                    message=t("errors", "PLUGIN_CONFIGURATION_REVISION_CONFLICT"),
                    error="PLUGIN_CONFIGURATION_REVISION_CONFLICT",
                    meta={
                        "expectedRevision": payload.expected_revision,
                        "currentRevision": current_revision,
                    },
                )
            changed_values = _changed_fields(installation.configuration or {}, values)
            changed_secrets = _changed_fields(installation.secret_references or {}, secret_references)
            if changed_values or changed_secrets:
                next_revision = current_revision + 1
                await self.repository.update_configuration(
                    installation,
                    configuration=values,
                    secret_references=secret_references,
                    revision=next_revision,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
                await write_required_activity_event(
                    settings=self.settings,
                    payload=ActivityAuditPayload(
                        event_name="system.plugin.configuration.updated",
                        actor_user_id=actor_user_id,
                        entity_type="system_plugin_installation",
                        entity_id=installation.id,
                        properties={
                            "plugin_name": item.name,
                            "revision": next_revision,
                            "configuration_fields": changed_values,
                            "secret_reference_fields": changed_secrets,
                            "restart_required": True,
                        },
                    ),
                    conn=conn,
                )
        return _configuration_out(installation)

    async def _require_installation(
        self,
        *,
        item: SystemPluginCatalogItemOut,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool,
    ) -> PluginInstallationRecord:
        installation = await self.repository.get_installation(
            item.name,
            conn=conn,
            for_update=for_update,
        )
        if installation is not None:
            return installation
        if item.installed_version is None:
            raise Conflict(
                message=t("errors", "PLUGIN_NOT_INSTALLED"),
                error="PLUGIN_NOT_INSTALLED",
            )
        return await self.repository.create_installation(
            data=build_plugin_installation_data(item, actor_user_id=actor_user_id),
            conn=conn,
        )

    def _validate_persisted_configuration(
        self,
        *,
        item: SystemPluginCatalogItemOut,
        installation: PluginInstallationRecord,
    ) -> None:
        try:
            validate_configuration_values(item.config_schema, installation.configuration or {})
            validate_secret_references(
                item.connector_definitions,
                installation.secret_references or {},
            )
        except PluginConfigurationSchemaError as exc:
            raise ServiceUnavailable(
                message=t("errors", "PLUGIN_CONFIGURATION_SCHEMA_UNSUPPORTED"),
                error="PLUGIN_CONFIGURATION_SCHEMA_UNSUPPORTED",
                details=str(exc),
            ) from exc
        except PluginConfigurationValueError as exc:
            raise ServiceUnavailable(
                message=t("errors", "PLUGIN_CONFIGURATION_STATE_INVALID"),
                error="PLUGIN_CONFIGURATION_STATE_INVALID",
                details=exc.field_errors,
            ) from exc


def _validate_patch(
    *,
    item: SystemPluginCatalogItemOut,
    payload: SystemPluginConfigurationPatch,
) -> tuple[JsonObject, dict[str, str]]:
    try:
        values = validate_configuration_values(item.config_schema, payload.values)
        secret_references = validate_secret_references(
            item.connector_definitions,
            payload.secret_references,
        )
    except PluginConfigurationSchemaError as exc:
        raise ServiceUnavailable(
            message=t("errors", "PLUGIN_CONFIGURATION_SCHEMA_UNSUPPORTED"),
            error="PLUGIN_CONFIGURATION_SCHEMA_UNSUPPORTED",
            details=str(exc),
        ) from exc
    except PluginConfigurationValueError as exc:
        raise BadRequest(
            message=t("errors", "PLUGIN_CONFIGURATION_INVALID"),
            error="PLUGIN_CONFIGURATION_INVALID",
            meta={"fieldErrors": exc.field_errors},
        ) from exc
    return values, secret_references


def _changed_fields(before: Mapping[str, object], after: Mapping[str, object]) -> list[str]:
    return sorted(field for field in set(before) | set(after) if before.get(field) != after.get(field))


def _configuration_out(installation: PluginInstallationRecord) -> SystemPluginConfigurationOut:
    return SystemPluginConfigurationOut(
        plugin_name=installation.plugin_name,
        revision=int(installation.configuration_revision),
        values=installation.configuration or {},
        secret_references=installation.secret_references or {},
        restart_required=(installation.runtime_activation_state == PluginRuntimeActivationState.PENDING_RESTART),
        updated_at=installation.updated_at,
    )
