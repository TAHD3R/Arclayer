from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, UploadFile, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.connectors import ConnectorKind
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.manifest import ProcessState
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.system.plugin_installation import PluginOperationKind
from src.modules.jobs.service import BackgroundJobService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.plugins.artifact_service import PluginArtifactService
from src.modules.system.plugins.catalog import (
    build_active_artifact_catalog_item,
    build_artifact_catalog_item,
    build_plugin_catalog,
    build_remote_plugin_catalog,
    filter_plugin_catalog,
    merge_plugin_catalogs,
)
from src.modules.system.plugins.configuration_service import PluginConfigurationService
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.lifecycle_service import PluginLifecycleService
from src.modules.system.plugins.remote_catalog import (
    PluginCatalogError,
    RemotePluginCatalogClient,
)
from src.modules.system.plugins.schema import (
    ExtensionConfigurationReadiness,
    ExtensionConfigurationTarget,
    ExtensionConnectionListOut,
    ExtensionConnectionOut,
    SystemConnectorDefinitionOut,
    SystemPluginAdminOut,
    SystemPluginArtifactReviewOut,
    SystemPluginCatalogItemOut,
    SystemPluginCatalogListOut,
    SystemPluginConfigurationOut,
    SystemPluginConfigurationPatch,
    SystemPluginDetailOut,
    SystemPluginInstallationCreateRequest,
    SystemPluginLifecycleRequest,
    SystemPluginListItemOut,
    SystemPluginListOut,
    SystemPluginOperationOut,
    SystemPluginProvidesOut,
)

IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=128, pattern=r".*\S.*"),
]

router = APIRouter(
    tags=["internal.system.plugins"],
)

_CONFIGURATION_TARGET_BY_CONNECTOR_KIND: dict[ConnectorKind, ExtensionConfigurationTarget] = {
    ConnectorKind.BILLING: ExtensionConfigurationTarget.COMMERCE_SUBSCRIPTIONS,
    ConnectorKind.OAUTH: ExtensionConfigurationTarget.ACCESS_SIGN_IN,
    ConnectorKind.ANALYTICS: ExtensionConfigurationTarget.MONITORING_PERFORMANCE,
    ConnectorKind.EMAIL: ExtensionConfigurationTarget.COMMUNICATIONS_EMAIL,
}
operations_router = APIRouter(
    tags=["internal.system.plugins"],
)


def get_extension_manager(request: Request) -> ExtensionManager:
    manager = getattr(request.app.state, "extension_manager", None)
    if not isinstance(manager, ExtensionManager):
        raise ServiceUnavailable(
            message=t("errors", "EXTENSION_RUNTIME_UNAVAILABLE"),
            error="EXTENSION_RUNTIME_UNAVAILABLE",
        )
    return manager


def get_plugin_lifecycle_repository() -> PluginLifecycleRepository:
    return PluginLifecycleRepository()


def get_plugin_lifecycle_service(
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
) -> PluginLifecycleService:
    return PluginLifecycleService(
        repository=repository,
        jobs=BackgroundJobService(settings),
        settings=settings,
    )


@operations_router.get(
    "",
    response_model=ResponseModel[PageData[SystemPluginOperationOut]],
    summary="List durable extension lifecycle operations",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
)
async def list_system_plugin_operations(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
) -> ResponseModel[PageData[SystemPluginOperationOut]]:
    return ApiResponse.success(data=await service.list_operations(params=params))


def get_plugin_configuration_service(
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
) -> PluginConfigurationService:
    return PluginConfigurationService(repository, settings=settings)


def get_plugin_artifact_service(
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
) -> PluginArtifactService:
    return PluginArtifactService(repository=repository, settings=settings)


def get_remote_plugin_catalog_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> RemotePluginCatalogClient:
    return RemotePluginCatalogClient(
        settings.plugin_distribution,
        allow_insecure_http=settings.app_env != "production",
    )


@router.get(
    "",
    response_model=ResponseModel[SystemPluginListOut],
    summary="List installed system plugins",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
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


@router.get(
    "/connections",
    operation_id="platform_list_extension_connections",
    response_model=ResponseModel[ExtensionConnectionListOut],
    summary="List installed extension connections and their owning Platform domains",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
)
async def list_extension_connections(
    manager: ExtensionManager = Depends(get_extension_manager),
) -> ResponseModel[ExtensionConnectionListOut]:
    items: list[ExtensionConnectionOut] = []
    for instance in manager.list_instances():
        for connector_key in instance.manifest.provides.connectors:
            registration = manager.registry.connectors.resolve(connector_key)
            if registration is None or registration.extension != instance.name:
                continue
            definition = registration.definition
            items.append(
                ExtensionConnectionOut(
                    extension_name=instance.manifest.name,
                    extension_version=instance.manifest.version,
                    connector_key=definition.key,
                    connector_kind=definition.kind,
                    trust_level=definition.trust_level,
                    runtime_ready=instance.process.state == ProcessState.READY,
                    configuration_readiness=ExtensionConfigurationReadiness.UNKNOWN,
                    configuration_target=_CONFIGURATION_TARGET_BY_CONNECTOR_KIND[definition.kind],
                )
            )
    items.sort(key=lambda item: (item.connector_kind, item.extension_name, item.connector_key))
    return ApiResponse.success(data=ExtensionConnectionListOut(items=items))


@router.get(
    "/catalog",
    response_model=ResponseModel[SystemPluginCatalogListOut],
    summary="Search the verified bundled plugin catalog",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
)
async def list_system_plugin_catalog(
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
    search: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    installed_only: Annotated[bool, Query(alias="installedOnly")] = False,
    updates_only: Annotated[bool, Query(alias="updatesOnly")] = False,
    include_online: Annotated[bool, Query(alias="includeOnline")] = False,
    ordering: Annotated[Literal["name", "-name", "version", "-version"], Query()] = "name",
) -> ResponseModel[SystemPluginCatalogListOut]:
    installation_records = await repository.list_installations()
    installations = {item.plugin_name: item for item in installation_records}
    items = build_plugin_catalog(manager, settings, installations=installations)
    for installation in installation_records:
        active = build_active_artifact_catalog_item(installation, manager, settings)
        if active is not None:
            items = [item for item in items if item.name != active.name]
            items.append(active)
    if include_online:
        try:
            online = await catalog_client.fetch()
        except PluginCatalogError as exc:
            raise ServiceUnavailable(error=exc.code, message=exc.safe_message) from exc
        items = merge_plugin_catalogs(
            items,
            build_remote_plugin_catalog(online, manager, settings, installations=installations),
        )
    items = filter_plugin_catalog(
        items,
        search=search,
        installed_only=installed_only,
        updates_only=updates_only,
        ordering=ordering,
    )
    return ApiResponse.success(data=SystemPluginCatalogListOut(items=items))


@router.post(
    "/artifacts/manual",
    response_model=ResponseModel[SystemPluginArtifactReviewOut],
    status_code=status.HTTP_201_CREATED,
    summary="Upload and review a signed plugin package",
)
async def review_manual_plugin_artifact(
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    package: Annotated[UploadFile, File()],
    detached_signature: Annotated[str, Form(min_length=1, max_length=512)],
) -> ResponseModel[SystemPluginArtifactReviewOut]:
    filename = package.filename or ""
    if not filename.lower().endswith(".zip"):
        raise BadRequest(
            error="PLUGIN_PACKAGE_FORMAT_UNSUPPORTED",
            message=t("errors", "PLUGIN_PACKAGE_FORMAT_UNSUPPORTED"),
        )
    try:
        archive = await package.read(settings.plugin_distribution.max_package_bytes + 1)
    finally:
        await package.close()
    return ApiResponse.success(
        data=await service.review_manual_upload(
            archive=archive,
            detached_signature=detached_signature,
            actor_user_id=actor.actor_id,
        )
    )


@router.get(
    "/artifacts/{artifact_id}",
    response_model=ResponseModel[SystemPluginArtifactReviewOut],
    summary="Get a reviewed plugin artifact",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
)
async def get_plugin_artifact_review(
    artifact_id: PublicUUID,
    service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
) -> ResponseModel[SystemPluginArtifactReviewOut]:
    return ApiResponse.success(data=await service.get_review(artifact_id))


@router.post(
    "/installations",
    response_model=ResponseModel[SystemPluginOperationOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a verified system plugin installation",
)
async def install_system_plugin(
    payload: SystemPluginInstallationCreateRequest,
    idempotency_key: IdempotencyKey,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
    artifact_service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginOperationOut]:
    artifact = None
    if payload.source_type == "manual_upload":
        if payload.artifact_id is None:
            raise BadRequest(error="PLUGIN_ARTIFACT_REQUIRED")
        artifact = await repository.get_artifact(payload.artifact_id)
        if artifact is None:
            raise NotFound(error="PLUGIN_ARTIFACT_NOT_FOUND")
        item = build_artifact_catalog_item(artifact, manager=manager, settings=settings, installation=None)
    elif payload.source_type == "catalog":
        if payload.plugin_name is None:
            raise BadRequest(error="PLUGIN_NAME_REQUIRED")
        try:
            catalog = await catalog_client.fetch()
            remote = catalog_client.select_item(
                catalog,
                plugin_name=payload.plugin_name,
                version=payload.target_version,
            )
        except PluginCatalogError as exc:
            raise ServiceUnavailable(error=exc.code, message=exc.safe_message) from exc
        artifact = await artifact_service.ensure_catalog_artifact(
            item=remote,
            catalog=catalog,
            actor_user_id=actor.actor_id,
        )
        item = build_artifact_catalog_item(artifact, manager=manager, settings=settings, installation=None)
    else:
        if payload.plugin_name is None:
            raise BadRequest(error="PLUGIN_NAME_REQUIRED")
        item = await _require_catalog_item(
            payload.plugin_name,
            manager=manager,
            settings=settings,
            repository=repository,
            catalog_client=catalog_client,
            include_online=False,
        )
        if item.source_type != "bundled":
            raise Conflict(error="PLUGIN_ARTIFACT_SOURCE_MISMATCH")
    return ApiResponse.success(
        data=await service.start_operation(
            item=item,
            artifact=artifact,
            kind=PluginOperationKind.INSTALL,
            payload=SystemPluginLifecycleRequest(
                target_version=item.available_version,
                approved_permissions=payload.approved_permissions,
            ),
            idempotency_key=idempotency_key,
            actor_user_id=actor.actor_id,
        )
    )


@operations_router.get(
    "/{operation_id}",
    response_model=ResponseModel[SystemPluginOperationOut],
    summary="Get a durable system plugin operation",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
)
async def get_system_plugin_operation(
    operation_id: PublicUUID,
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
) -> ResponseModel[SystemPluginOperationOut]:
    return ApiResponse.success(data=await service.get_operation(operation_id))


@router.get(
    "/{plugin_id}",
    response_model=ResponseModel[SystemPluginDetailOut],
    summary="Get verified plugin catalog and runtime detail",
    dependencies=[require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)],
)
async def get_system_plugin_detail(
    plugin_id: str,
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginDetailOut]:
    item = await _require_catalog_item(
        plugin_id,
        manager=manager,
        settings=settings,
        repository=repository,
        catalog_client=catalog_client,
        include_online=True,
    )
    operations = await repository.list_recent_operations(plugin_id)
    return ApiResponse.success(
        data=SystemPluginDetailOut(
            **item.model_dump(),
            recent_operations=[SystemPluginOperationOut.model_validate(operation) for operation in operations],
        )
    )


@router.get(
    "/{plugin_id}/configuration",
    response_model=ResponseModel[SystemPluginConfigurationOut],
    summary="Get schema-driven system plugin configuration",
)
async def get_system_plugin_configuration(
    plugin_id: str,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_CATALOG_READ)
    ],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginConfigurationService, Depends(get_plugin_configuration_service)],
) -> ResponseModel[SystemPluginConfigurationOut]:
    item = await _require_catalog_item(
        plugin_id,
        manager=manager,
        settings=settings,
        repository=repository,
    )
    return ApiResponse.success(data=await service.get_configuration(item=item, actor_user_id=actor.actor_id))


@router.patch(
    "/{plugin_id}/configuration",
    response_model=ResponseModel[SystemPluginConfigurationOut],
    summary="Revision-update schema-driven system plugin configuration",
)
async def update_system_plugin_configuration(
    plugin_id: str,
    payload: SystemPluginConfigurationPatch,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_CONFIGURE)
    ],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginConfigurationService, Depends(get_plugin_configuration_service)],
) -> ResponseModel[SystemPluginConfigurationOut]:
    item = await _require_catalog_item(
        plugin_id,
        manager=manager,
        settings=settings,
        repository=repository,
    )
    return ApiResponse.success(
        data=await service.update_configuration(
            item=item,
            payload=payload,
            actor_user_id=actor.actor_id,
        )
    )


@router.post(
    "/{plugin_id}/upgrade",
    response_model=ResponseModel[SystemPluginOperationOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a verified system plugin upgrade",
)
async def upgrade_system_plugin(
    plugin_id: str,
    payload: SystemPluginLifecycleRequest,
    idempotency_key: IdempotencyKey,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
    artifact_service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginOperationOut]:
    return await _start_plugin_operation(
        plugin_id=plugin_id,
        kind=PluginOperationKind.UPGRADE,
        payload=payload,
        idempotency_key=idempotency_key,
        actor=actor,
        manager=manager,
        settings=settings,
        repository=repository,
        service=service,
        artifact_service=artifact_service,
        catalog_client=catalog_client,
    )


@router.post(
    "/{plugin_id}/rollback",
    response_model=ResponseModel[SystemPluginOperationOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a verified system plugin rollback",
)
async def rollback_system_plugin(
    plugin_id: str,
    payload: SystemPluginLifecycleRequest,
    idempotency_key: IdempotencyKey,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
    artifact_service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginOperationOut]:
    return await _start_plugin_operation(
        plugin_id=plugin_id,
        kind=PluginOperationKind.ROLLBACK,
        payload=payload,
        idempotency_key=idempotency_key,
        actor=actor,
        manager=manager,
        settings=settings,
        repository=repository,
        service=service,
        artifact_service=artifact_service,
        catalog_client=catalog_client,
    )


@router.post(
    "/{plugin_id}/enable",
    response_model=ResponseModel[SystemPluginOperationOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start enabling a system plugin",
)
async def enable_system_plugin(
    plugin_id: str,
    payload: SystemPluginLifecycleRequest,
    idempotency_key: IdempotencyKey,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
    artifact_service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginOperationOut]:
    return await _start_plugin_operation(
        plugin_id=plugin_id,
        kind=PluginOperationKind.ENABLE,
        payload=payload,
        idempotency_key=idempotency_key,
        actor=actor,
        manager=manager,
        settings=settings,
        repository=repository,
        service=service,
        artifact_service=artifact_service,
        catalog_client=catalog_client,
    )


@router.post(
    "/{plugin_id}/disable",
    response_model=ResponseModel[SystemPluginOperationOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start disabling a system plugin",
)
async def disable_system_plugin(
    plugin_id: str,
    payload: SystemPluginLifecycleRequest,
    idempotency_key: IdempotencyKey,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
    artifact_service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginOperationOut]:
    return await _start_plugin_operation(
        plugin_id=plugin_id,
        kind=PluginOperationKind.DISABLE,
        payload=payload,
        idempotency_key=idempotency_key,
        actor=actor,
        manager=manager,
        settings=settings,
        repository=repository,
        service=service,
        artifact_service=artifact_service,
        catalog_client=catalog_client,
    )


@router.delete(
    "/{plugin_id}",
    response_model=ResponseModel[SystemPluginOperationOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start uninstalling a system plugin",
)
async def uninstall_system_plugin(
    plugin_id: str,
    payload: SystemPluginLifecycleRequest,
    idempotency_key: IdempotencyKey,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.EXTENSIONS_INSTALL)],
    manager: Annotated[ExtensionManager, Depends(get_extension_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
    repository: Annotated[PluginLifecycleRepository, Depends(get_plugin_lifecycle_repository)],
    service: Annotated[PluginLifecycleService, Depends(get_plugin_lifecycle_service)],
    artifact_service: Annotated[PluginArtifactService, Depends(get_plugin_artifact_service)],
    catalog_client: Annotated[RemotePluginCatalogClient, Depends(get_remote_plugin_catalog_client)],
) -> ResponseModel[SystemPluginOperationOut]:
    return await _start_plugin_operation(
        plugin_id=plugin_id,
        kind=PluginOperationKind.UNINSTALL,
        payload=payload,
        idempotency_key=idempotency_key,
        actor=actor,
        manager=manager,
        settings=settings,
        repository=repository,
        service=service,
        artifact_service=artifact_service,
        catalog_client=catalog_client,
    )


async def _start_plugin_operation(
    *,
    plugin_id: str,
    kind: PluginOperationKind,
    payload: SystemPluginLifecycleRequest,
    idempotency_key: str,
    actor: PlatformSessionPrincipal,
    manager: ExtensionManager,
    settings: Settings,
    repository: PluginLifecycleRepository,
    service: PluginLifecycleService,
    artifact_service: PluginArtifactService,
    catalog_client: RemotePluginCatalogClient,
) -> ResponseModel[SystemPluginOperationOut]:
    installation = await repository.get_installation(plugin_id)
    artifact = None
    if kind == PluginOperationKind.UPGRADE:
        if installation is None:
            raise Conflict(error="PLUGIN_NOT_INSTALLED")
        try:
            catalog = await catalog_client.fetch()
            remote = catalog_client.select_item(
                catalog,
                plugin_name=plugin_id,
                version=payload.target_version,
            )
        except PluginCatalogError as exc:
            raise ServiceUnavailable(error=exc.code, message=exc.safe_message) from exc
        artifact = await artifact_service.ensure_catalog_artifact(
            item=remote,
            catalog=catalog,
            actor_user_id=actor.actor_id,
        )
        item = build_artifact_catalog_item(
            artifact,
            manager=manager,
            settings=settings,
            installation=installation,
        )
    elif kind == PluginOperationKind.ROLLBACK:
        if installation is None or installation.previous_artifact is None:
            raise Conflict(error="PLUGIN_ROLLBACK_ARTIFACT_NOT_AVAILABLE")
        artifact = installation.previous_artifact
        item = build_artifact_catalog_item(
            artifact,
            manager=manager,
            settings=settings,
            installation=installation,
        )
    else:
        item = await _require_catalog_item(
            plugin_id,
            manager=manager,
            settings=settings,
            repository=repository,
            catalog_client=catalog_client,
            include_online=False,
        )
        if installation is not None:
            artifact = installation.active_artifact
    operation = await service.start_operation(
        item=item,
        artifact=artifact,
        kind=kind,
        payload=payload,
        idempotency_key=idempotency_key,
        actor_user_id=actor.actor_id,
    )
    return ApiResponse.success(data=operation)


async def _require_catalog_item(
    plugin_id: str,
    *,
    manager: ExtensionManager,
    settings: Settings,
    repository: PluginLifecycleRepository,
    catalog_client: RemotePluginCatalogClient | None = None,
    include_online: bool = False,
) -> SystemPluginCatalogItemOut:
    installation = await repository.get_installation(plugin_id)
    if installation is not None:
        active = build_active_artifact_catalog_item(installation, manager, settings)
        if active is not None and not include_online:
            return active
    bundled = next(
        (
            item
            for item in build_plugin_catalog(
                manager,
                settings,
                installations={plugin_id: installation} if installation is not None else None,
            )
            if item.name == plugin_id
        ),
        None,
    )
    if installation is not None:
        active = build_active_artifact_catalog_item(installation, manager, settings)
        if active is not None:
            bundled = active
    if bundled is not None and not include_online:
        return bundled
    if catalog_client is not None:
        try:
            catalog = await catalog_client.fetch()
        except PluginCatalogError as exc:
            if bundled is not None:
                return bundled
            raise ServiceUnavailable(error=exc.code, message=exc.safe_message) from exc
        remote = next(
            (
                item
                for item in build_remote_plugin_catalog(
                    catalog,
                    manager,
                    settings,
                    installations={plugin_id: installation} if installation is not None else None,
                )
                if item.name == plugin_id
            ),
            None,
        )
        if remote is not None:
            return remote if bundled is None else merge_plugin_catalogs([bundled], [remote])[0]
    if bundled is None:
        raise NotFound(message=t("errors", "PLUGIN_NOT_FOUND"), error="PLUGIN_NOT_FOUND")
    return bundled
