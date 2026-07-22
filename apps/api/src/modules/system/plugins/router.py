from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from src.core.exceptions import ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.modules.auth.http.service import require_super_admin
from src.modules.system.plugins.schema import (
    SystemConnectorDefinitionOut,
    SystemPluginAdminOut,
    SystemPluginListItemOut,
    SystemPluginListOut,
    SystemPluginProvidesOut,
)

router = APIRouter(
    tags=["internal.system.plugins"],
    dependencies=[Depends(require_super_admin)],
)


def get_extension_manager(request: Request) -> ExtensionManager:
    manager = getattr(request.app.state, "extension_manager", None)
    if not isinstance(manager, ExtensionManager):
        raise ServiceUnavailable(
            message=t("errors", "EXTENSION_RUNTIME_UNAVAILABLE"),
            error="EXTENSION_RUNTIME_UNAVAILABLE",
        )
    return manager


@router.get(
    "",
    response_model=ResponseModel[SystemPluginListOut],
    summary="List installed system plugins",
)
async def list_system_plugins(
    manager: ExtensionManager = Depends(get_extension_manager),
) -> ResponseModel[SystemPluginListOut]:
    plugins = []
    for instance in manager.list_instances():
        manifest = instance.manifest
        admin = manifest.admin
        connector_definitions = []
        for connector_key in manifest.provides.connectors:
            registration = manager.registry.connectors.resolve(connector_key)
            if registration is not None and registration.extension == instance.name:
                connector_definitions.append(
                    SystemConnectorDefinitionOut.model_validate(registration.definition.model_dump())
                )
        plugins.append(
            SystemPluginListItemOut(
                name=manifest.name,
                version=manifest.version,
                package_state=instance.package.state,
                process_state=instance.process.state,
                provides=SystemPluginProvidesOut(**manifest.provides.model_dump()),
                permissions=list(manifest.permissions),
                config_schema=dict(manifest.config_schema),
                admin=SystemPluginAdminOut(**admin.model_dump()) if admin is not None else None,
                connector_definitions=connector_definitions,
            )
        )
    return ApiResponse.success(data=SystemPluginListOut(plugins=plugins))
