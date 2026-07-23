from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.models.system.plugin_installation import PluginRuntimeActivationState
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.system.plugins.configuration_service import PluginConfigurationService
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.schema import (
    SystemConnectorDefinitionOut,
    SystemPluginCatalogItemOut,
    SystemPluginConfigurationPatch,
)


class _Repository:
    def __init__(self, installation: Any) -> None:
        self.installation = installation

    async def get_installation(self, _plugin_name: str, **_: object) -> Any:
        return self.installation

    async def update_configuration(self, installation: Any, **kwargs: object) -> Any:
        installation.configuration = kwargs["configuration"]
        installation.secret_references = kwargs["secret_references"]
        installation.configuration_revision = kwargs["revision"]
        installation.runtime_activation_state = PluginRuntimeActivationState.PENDING_RESTART
        installation.updated_at = datetime.now(UTC)
        return installation


class _Service(PluginConfigurationService):
    @asynccontextmanager
    async def tx(self, **_: object):
        yield object()


def _installation() -> Any:
    return SimpleNamespace(
        id=uuid4(),
        plugin_name="arclayer-posthog",
        configuration_revision=1,
        configuration={},
        secret_references={},
        runtime_activation_state=PluginRuntimeActivationState.VERIFIED,
        updated_at=datetime.now(UTC),
    )


def _catalog_item(*, schema: dict[str, Any] | None = None) -> SystemPluginCatalogItemOut:
    return SystemPluginCatalogItemOut.model_validate({
        "name": "arclayer-posthog",
        "available_version": "1.0.0",
        "installed_version": "1.0.0",
        "source_type": "bundled",
        "source_locator": "plugins/arclayer-posthog",
        "artifact_checksum": "sha256:artifact",
        "package_checksum": "sha256:package",
        "manifest_digest": "sha256:manifest",
        "provenance_status": "verified",
        "compatibility": {"compatible": True},
        "provides": {"connectors": ["analytics.posthog"]},
        "permissions": ["analytics:write"],
        "config_schema": schema
        or {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "default": False},
                "host": {"type": "string", "format": "uri"},
                "timeoutSeconds": {"type": "number", "minimum": 1, "maximum": 30},
            },
            "additionalProperties": False,
        },
        "connector_definitions": [
            SystemConnectorDefinitionOut.model_validate({
                "key": "analytics.posthog",
                "kind": "analytics",
                "version": "1.0.0",
                "trust_level": "official",
                "secret_schema": {
                    "projectApiKey": {
                        "type": "string",
                        "writeOnly": True,
                        "x-required-when-enabled": True,
                    }
                },
            })
        ],
    })


async def test_plugin_configuration_update_increments_revision_and_audits_only_field_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installation = _installation()
    repository = _Repository(installation)
    service = _Service(
        cast(PluginLifecycleRepository, repository),
        settings=Settings(app_env="test"),
    )
    audits: list[object] = []

    async def _capture_audit(**kwargs: object) -> object:
        audits.append(kwargs["payload"])
        return object()

    monkeypatch.setattr(
        "src.modules.system.plugins.configuration_service.write_required_activity_event",
        _capture_audit,
    )

    result = await service.update_configuration(
        item=_catalog_item(),
        payload=SystemPluginConfigurationPatch(
            expected_revision=1,
            values={
                "enabled": True,
                "host": "https://eu.i.posthog.com",
                "timeoutSeconds": 7,
            },
            secret_references={"projectApiKey": "env:POSTHOG__PROJECT_API_KEY"},
        ),
        actor_user_id=uuid4(),
    )

    assert result.revision == 2
    assert result.restart_required is True
    assert result.secret_references == {"projectApiKey": "env:POSTHOG__PROJECT_API_KEY"}
    assert len(audits) == 1
    properties = cast(ActivityAuditPayload, audits[0]).properties
    assert properties["configuration_fields"] == ["enabled", "host", "timeoutSeconds"]
    assert properties["secret_reference_fields"] == ["projectApiKey"]
    assert "POSTHOG__PROJECT_API_KEY" not in str(properties)


async def test_plugin_configuration_update_rejects_revision_conflict() -> None:
    service = _Service(
        cast(PluginLifecycleRepository, _Repository(_installation())),
        settings=Settings(app_env="test"),
    )

    with pytest.raises(Conflict) as raised:
        await service.update_configuration(
            item=_catalog_item(),
            payload=SystemPluginConfigurationPatch(
                expected_revision=2,
                values={},
                secret_references={},
            ),
            actor_user_id=uuid4(),
        )

    assert raised.value.error == "PLUGIN_CONFIGURATION_REVISION_CONFLICT"
    assert raised.value.meta == {"expectedRevision": 2, "currentRevision": 1}


@pytest.mark.parametrize(
    "values",
    [
        {"unknown": True},
        {"host": "not-a-uri"},
        {"timeoutSeconds": 31},
        {"enabled": "true"},
    ],
)
async def test_plugin_configuration_update_rejects_invalid_values(values: dict[str, Any]) -> None:
    service = _Service(
        cast(PluginLifecycleRepository, _Repository(_installation())),
        settings=Settings(app_env="test"),
    )

    with pytest.raises(BadRequest) as raised:
        await service.update_configuration(
            item=_catalog_item(),
            payload=SystemPluginConfigurationPatch(
                expected_revision=1,
                values=values,
                secret_references={},
            ),
            actor_user_id=uuid4(),
        )

    assert raised.value.error == "PLUGIN_CONFIGURATION_INVALID"


async def test_plugin_configuration_rejects_schema_constraints_the_host_cannot_enforce() -> None:
    service = _Service(
        cast(PluginLifecycleRepository, _Repository(_installation())),
        settings=Settings(app_env="test"),
    )
    item = _catalog_item(
        schema={
            "type": "object",
            "properties": {"mode": {"type": "string", "pattern": "^[a-z]+$"}},
            "additionalProperties": False,
        }
    )

    with pytest.raises(ServiceUnavailable) as raised:
        await service.update_configuration(
            item=item,
            payload=SystemPluginConfigurationPatch(
                expected_revision=1,
                values={"mode": "safe"},
                secret_references={},
            ),
            actor_user_id=uuid4(),
        )

    assert raised.value.error == "PLUGIN_CONFIGURATION_SCHEMA_UNSUPPORTED"
