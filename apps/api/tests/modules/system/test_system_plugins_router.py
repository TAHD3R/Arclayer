from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import init_exception_handlers
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.manifest import parse_manifest
from src.models.system.plugin_installation import (
    PluginLifecycleState,
    PluginOperationKind,
    PluginOperationState,
    PluginRuntimeActivationState,
    PluginSourceType,
)
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.plugins.router import (
    get_plugin_artifact_service,
    get_plugin_lifecycle_repository,
    get_plugin_lifecycle_service,
    get_remote_plugin_catalog_client,
)
from src.modules.system.plugins.router import (
    operations_router as system_plugin_operations_router,
)
from src.modules.system.plugins.router import (
    router as system_plugins_router,
)
from src.modules.system.plugins.schema import (
    SystemPluginArtifactReviewOut,
    SystemPluginCatalogItemOut,
    SystemPluginCompatibilityOut,
    SystemPluginOperationOut,
    SystemPluginProvidesOut,
    SystemPluginSourceType,
)
from tests.utils.asgi_client import asgi_client


class _PluginLifecycleServiceStub:
    def __init__(self, operation: SystemPluginOperationOut) -> None:
        self.operation = operation
        self.started: list[dict[str, object]] = []
        self.requested_operation_ids: list[UUID] = []

    async def start_operation(self, **kwargs: object) -> SystemPluginOperationOut:
        self.started.append(kwargs)
        return self.operation

    async def get_operation(self, operation_id: UUID) -> SystemPluginOperationOut:
        self.requested_operation_ids.append(operation_id)
        return self.operation


class _CatalogRepositoryStub:
    def __init__(
        self,
        installations: list[object] | None = None,
        artifacts: list[object] | None = None,
    ) -> None:
        self.installations = installations or []
        self.artifacts = artifacts or []

    async def list_installations(self) -> list[object]:
        return self.installations

    async def get_installation(self, plugin_name: str) -> object | None:
        return next(
            (item for item in self.installations if getattr(item, "plugin_name", None) == plugin_name),
            None,
        )

    async def get_artifact(self, artifact_id: UUID) -> object | None:
        return next((item for item in self.artifacts if getattr(item, "id", None) == artifact_id), None)

    async def list_recent_operations(self, plugin_name: str) -> list[object]:
        return []


class _PluginArtifactServiceStub:
    def __init__(self, artifact: SimpleNamespace, review: SystemPluginArtifactReviewOut) -> None:
        self.artifact = artifact
        self.review = review
        self.manual_reviews: list[dict[str, object]] = []
        self.catalog_reviews: list[dict[str, object]] = []

    async def review_manual_upload(self, **kwargs: object) -> SystemPluginArtifactReviewOut:
        self.manual_reviews.append(kwargs)
        return self.review

    async def ensure_catalog_artifact(self, **kwargs: object) -> SimpleNamespace:
        self.catalog_reviews.append(kwargs)
        return self.artifact


class _RemoteCatalogClientStub:
    def __init__(self, remote: object) -> None:
        self.remote = remote
        self.payload = object()
        self.selections: list[dict[str, object]] = []

    async def fetch(self) -> object:
        return self.payload

    def select_item(self, _catalog: object, **kwargs: object) -> object:
        self.selections.append(kwargs)
        return self.remote


def _operation_out() -> SystemPluginOperationOut:
    return SystemPluginOperationOut(
        id=uuid4(),
        plugin_name="catalog-test",
        kind=PluginOperationKind.INSTALL,
        state=PluginOperationState.QUEUED,
        phase="queued",
        progress_completed=0,
        progress_total=5,
        job_id=uuid4(),
        requested_version="1.2.3",
        permission_diff={"added": [], "approved": ["catalog:read"]},
        migration_warnings=[],
        restart_required=False,
        activation_verified=False,
        retryable=False,
        failure_code=None,
        failure_summary=None,
        requested_by_user_id=uuid4(),
        started_at=None,
        completed_at=None,
    )


def _write_extension(project_root: Path) -> None:
    extension_dir = project_root / "plugins" / "catalog-test"
    (extension_dir / "src").mkdir(parents=True)
    (extension_dir / "extension.json").write_text(
        json.dumps({
            "name": "catalog-test",
            "version": "1.2.3",
            "entry": "src/plugin.py",
            "provides": {
                "services": ["catalog-service"],
                "middlewares": ["catalog-middleware"],
                "providers": ["catalog-provider"],
                "connectors": ["catalog.test"],
                "content_types": ["catalog-entry"],
            },
            "permissions": ["catalog:read"],
            "config_schema": {"enabled": {"type": "boolean"}},
            "admin": {
                "label_key": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_NAME",
                "description_key": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_DESC",
                "settings_path": "/system/settings/catalog-test",
            },
        }),
        encoding="utf-8",
    )
    (extension_dir / "src" / "plugin.py").write_text(
        """from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel

def create_plugin():
    class Plugin:
        def arclayer_register(self, registry):
            registry.services.register("catalog-service", object())
            registry.middlewares.register("catalog-middleware", object())
            registry.providers.register("catalog-provider", object())
            registry.connectors.register(
                extension="catalog-test",
                definition=ConnectorDefinition(
                    key="catalog.test",
                    kind=ConnectorKind.ANALYTICS,
                    version="1.0.0",
                    trust_level=ConnectorTrustLevel.THIRD_PARTY,
                ),
                factory=object,
            )
            registry.content_types.register("catalog-entry", {"key": "catalog-entry"})
    return Plugin()
""",
        encoding="utf-8",
    )


def _managed_artifact(project_root: Path, *, source_type: PluginSourceType) -> SimpleNamespace:
    manifest = parse_manifest(project_root / "plugins" / "catalog-test" / "extension.json")
    return SimpleNamespace(
        id=uuid4(),
        plugin_name=manifest.name,
        version=manifest.version,
        source_type=source_type,
        source_locator=(
            "https://plugins.example.test/catalog-test.zip"
            if source_type == PluginSourceType.CATALOG
            else "manual://catalog-test.zip"
        ),
        artifact_checksum=f"sha256:{'a' * 64}",
        package_checksum=f"sha256:{'b' * 64}",
        manifest_digest=f"sha256:{'c' * 64}",
        signer_fingerprint="d" * 64,
        review_projection={"manifest": manifest.model_dump(mode="json")},
    )


def _artifact_review(artifact: Any) -> SystemPluginArtifactReviewOut:
    now = datetime.now(UTC)
    return SystemPluginArtifactReviewOut(
        id=artifact.id,
        created_at=now,
        updated_at=now,
        plugin_name=artifact.plugin_name,
        version=artifact.version,
        source_type=SystemPluginSourceType(artifact.source_type),
        source_locator=artifact.source_locator,
        artifact_checksum=artifact.artifact_checksum,
        package_checksum=artifact.package_checksum,
        manifest_digest=artifact.manifest_digest,
        signer_fingerprint=artifact.signer_fingerprint,
        provenance_status="verified",
        size_bytes=1024,
        compatibility=SystemPluginCompatibilityOut(compatible=True),
        provides=SystemPluginProvidesOut(connectors=["catalog.test"]),
        permissions=["catalog:read"],
    )


def _build_app(
    *,
    manager: ExtensionManager | None,
    is_super_admin: bool,
    lifecycle_service: _PluginLifecycleServiceStub | None = None,
    catalog_repository: _CatalogRepositoryStub | None = None,
    artifact_service: _PluginArtifactServiceStub | None = None,
    catalog_client: _RemoteCatalogClientStub | None = None,
) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, Settings(app_env="test"))
    if manager is not None:
        app.state.extension_manager = manager
    app.include_router(system_plugins_router, prefix="/api/v1/system/plugins")
    app.include_router(system_plugin_operations_router, prefix="/api/v1/system/plugin-operations")

    actor_id = uuid4()

    async def _user_override():
        return SimpleNamespace(id=actor_id, is_super_admin=is_super_admin)

    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_plugin_lifecycle_repository] = lambda: catalog_repository or _CatalogRepositoryStub()
    if is_super_admin:
        app.dependency_overrides[require_super_admin] = _user_override
    if lifecycle_service is not None:
        app.dependency_overrides[get_plugin_lifecycle_service] = lambda: lifecycle_service
    if artifact_service is not None:
        app.dependency_overrides[get_plugin_artifact_service] = lambda: artifact_service
    if catalog_client is not None:
        app.dependency_overrides[get_remote_plugin_catalog_client] = lambda: catalog_client
    return app


async def test_system_plugins_require_super_admin() -> None:
    app = _build_app(manager=None, is_super_admin=False)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 403
    assert response.json()["error"] == "SUPER_ADMIN_REQUIRED"


async def test_system_plugins_report_unavailable_runtime() -> None:
    app = _build_app(manager=None, is_super_admin=True)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 503
    assert response.json()["error"] == "EXTENSION_RUNTIME_UNAVAILABLE"


async def test_system_plugins_map_runtime_manifest(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    await manager.load_all()
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    app = _build_app(manager=manager, is_super_admin=True)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 200, response.text
    assert response.json()["data"] == {
        "plugins": [
            {
                "name": "catalog-test",
                "version": "1.2.3",
                "packageState": "installed",
                "processState": "ready",
                "provides": {
                    "services": ["catalog-service"],
                    "middlewares": ["catalog-middleware"],
                    "providers": ["catalog-provider"],
                    "connectors": ["catalog.test"],
                    "contentTypes": ["catalog-entry"],
                },
                "permissions": ["catalog:read"],
                "configSchema": {"enabled": {"type": "boolean"}},
                "admin": {
                    "labelKey": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_NAME",
                    "descriptionKey": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_DESC",
                    "settingsPath": "/system/settings/catalog-test",
                },
                "connectorDefinitions": [
                    {
                        "key": "catalog.test",
                        "kind": "analytics",
                        "version": "1.0.0",
                        "trustLevel": "third_party",
                        "capabilities": [],
                        "configSchema": {},
                        "secretSchema": {},
                        "scopes": [],
                        "webhookEvents": [],
                        "healthContract": [],
                        "admin": None,
                    }
                ],
            }
        ]
    }


async def test_system_plugins_expose_official_posthog_connector() -> None:
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-posthog")
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    app = _build_app(manager=manager, is_super_admin=True)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 200, response.text
    plugin = response.json()["data"]["plugins"][0]
    assert plugin["name"] == "arclayer-posthog"
    assert plugin["processState"] == "ready"
    assert plugin["provides"]["connectors"] == ["analytics.posthog"]
    assert plugin["connectorDefinitions"][0]["key"] == "analytics.posthog"
    assert plugin["connectorDefinitions"][0]["kind"] == "analytics"
    assert plugin["connectorDefinitions"][0]["trustLevel"] == "official"


async def test_system_plugin_catalog_exposes_integrity_compatibility_and_detail(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    await manager.load_all()
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    app = _build_app(manager=manager, is_super_admin=True)

    async with asgi_client(app) as client:
        catalog_response = await client.get(
            "/api/v1/system/plugins/catalog",
            params={"search": "catalog-service", "ordering": "-version", "installedOnly": "true"},
        )
        updates_response = await client.get(
            "/api/v1/system/plugins/catalog",
            params={"updatesOnly": "true"},
        )
        detail_response = await client.get("/api/v1/system/plugins/catalog-test")
        missing_response = await client.get("/api/v1/system/plugins/missing-plugin")

    assert catalog_response.status_code == 200, catalog_response.text
    catalog = catalog_response.json()["data"]["items"]
    assert len(catalog) == 1
    item = catalog[0]
    assert item["name"] == "catalog-test"
    assert item["availableVersion"] == "1.2.3"
    assert item["installedVersion"] == "1.2.3"
    assert item["hasUpdate"] is False
    assert item["sourceType"] == "bundled"
    assert item["sourceLocator"] == "plugins/catalog-test"
    assert item["packageChecksum"].startswith("sha256:")
    assert item["manifestDigest"].startswith("sha256:")
    assert item["provenanceStatus"] == "verified"
    assert item["compatibility"]["compatible"] is True
    assert item["processState"] == "ready"
    assert item["connectorDefinitions"][0]["key"] == "catalog.test"

    assert updates_response.status_code == 200, updates_response.text
    assert updates_response.json()["data"]["items"] == []
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()["data"]
    assert detail.pop("recentOperations") == []
    assert detail == item
    assert missing_response.status_code == 503
    assert missing_response.json()["error"] == "PLUGIN_CATALOG_NOT_CONFIGURED"


async def test_system_plugin_catalog_uses_persisted_disabled_installation_state(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    installation = SimpleNamespace(
        id=uuid4(),
        plugin_name="catalog-test",
        installed_version="1.1.0",
        lifecycle_state=PluginLifecycleState.DISABLED,
        desired_enabled=False,
        runtime_activation_state=PluginRuntimeActivationState.VERIFIED,
        current_operation_id=None,
        current_job_id=None,
        approved_permissions=["catalog:read"],
        active_artifact=None,
    )
    app = _build_app(
        manager=manager,
        is_super_admin=True,
        catalog_repository=_CatalogRepositoryStub([installation]),
    )

    async with asgi_client(app) as client:
        response = await client.get(
            "/api/v1/system/plugins/catalog",
            params={"installedOnly": "true"},
        )

    assert response.status_code == 200, response.text
    item = response.json()["data"]["items"][0]
    assert item["installedVersion"] == "1.1.0"
    assert item["lifecycleState"] == "disabled"
    assert item["desiredEnabled"] is False
    assert item["processState"] is None
    assert item["approvedPermissions"] == ["catalog:read"]


async def test_system_plugin_install_requires_idempotency_key(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    operation = _operation_out()
    service = _PluginLifecycleServiceStub(operation)
    app = _build_app(manager=manager, is_super_admin=True, lifecycle_service=service)

    async with asgi_client(app) as client:
        response = await client.post(
            "/api/v1/system/plugins/installations",
            json={
                "sourceType": "bundled",
                "pluginName": "catalog-test",
                "approvedPermissions": ["catalog:read"],
            },
        )

    assert response.status_code == 422
    assert service.started == []


async def test_manual_plugin_artifact_review_accepts_signed_zip_multipart(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    artifact = _managed_artifact(tmp_path, source_type=PluginSourceType.MANUAL_UPLOAD)
    artifact_service = _PluginArtifactServiceStub(artifact, _artifact_review(artifact))
    app = _build_app(
        manager=None,
        is_super_admin=True,
        artifact_service=artifact_service,
    )

    async with asgi_client(app) as client:
        response = await client.post(
            "/api/v1/system/plugins/artifacts/manual",
            data={"detached_signature": "base64-signature"},
            files={"package": ("catalog-test.zip", b"signed-archive", "application/zip")},
        )

    assert response.status_code == 201, response.text
    assert response.json()["data"]["id"] == encode_uuid(artifact.id)
    assert len(artifact_service.manual_reviews) == 1
    assert artifact_service.manual_reviews[0]["archive"] == b"signed-archive"
    assert artifact_service.manual_reviews[0]["detached_signature"] == "base64-signature"
    assert isinstance(artifact_service.manual_reviews[0]["actor_user_id"], UUID)


async def test_manual_plugin_install_binds_reviewed_artifact(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    artifact = _managed_artifact(tmp_path, source_type=PluginSourceType.MANUAL_UPLOAD)
    repository = _CatalogRepositoryStub(artifacts=[artifact])
    service = _PluginLifecycleServiceStub(_operation_out())
    app = _build_app(
        manager=manager,
        is_super_admin=True,
        lifecycle_service=service,
        catalog_repository=repository,
    )

    async with asgi_client(app) as client:
        response = await client.post(
            "/api/v1/system/plugins/installations",
            headers={"Idempotency-Key": "install-manual-catalog-test"},
            json={
                "sourceType": "manual_upload",
                "artifactId": encode_uuid(artifact.id),
                "approvedPermissions": ["catalog:read"],
            },
        )

    assert response.status_code == 202, response.text
    assert len(service.started) == 1
    assert service.started[0]["artifact"] is artifact
    item = cast(SystemPluginCatalogItemOut, service.started[0]["item"])
    assert item.source_type == SystemPluginSourceType.MANUAL_UPLOAD
    assert item.artifact_id == artifact.id


async def test_online_catalog_install_binds_catalog_artifact(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    artifact = _managed_artifact(tmp_path, source_type=PluginSourceType.CATALOG)
    remote = object()
    catalog_client = _RemoteCatalogClientStub(remote)
    artifact_service = _PluginArtifactServiceStub(artifact, _artifact_review(artifact))
    service = _PluginLifecycleServiceStub(_operation_out())
    app = _build_app(
        manager=manager,
        is_super_admin=True,
        lifecycle_service=service,
        artifact_service=artifact_service,
        catalog_client=catalog_client,
    )

    async with asgi_client(app) as client:
        response = await client.post(
            "/api/v1/system/plugins/installations",
            headers={"Idempotency-Key": "install-online-catalog-test"},
            json={
                "sourceType": "catalog",
                "pluginName": "catalog-test",
                "targetVersion": "1.2.3",
                "approvedPermissions": ["catalog:read"],
            },
        )

    assert response.status_code == 202, response.text
    assert catalog_client.selections == [{"plugin_name": "catalog-test", "version": "1.2.3"}]
    assert artifact_service.catalog_reviews[0]["item"] is remote
    assert artifact_service.catalog_reviews[0]["catalog"] is catalog_client.payload
    assert service.started[0]["artifact"] is artifact
    item = cast(SystemPluginCatalogItemOut, service.started[0]["item"])
    assert item.source_type == SystemPluginSourceType.CATALOG


async def test_system_plugin_install_starts_durable_operation(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    operation = _operation_out()
    service = _PluginLifecycleServiceStub(operation)
    app = _build_app(manager=manager, is_super_admin=True, lifecycle_service=service)

    async with asgi_client(app) as client:
        response = await client.post(
            "/api/v1/system/plugins/installations",
            headers={"Idempotency-Key": "install-catalog-test"},
            json={
                "sourceType": "bundled",
                "pluginName": "catalog-test",
                "approvedPermissions": ["catalog:read"],
            },
        )

    assert response.status_code == 202, response.text
    assert response.json()["data"]["id"] == encode_uuid(operation.id)
    assert len(service.started) == 1
    assert service.started[0]["kind"] == PluginOperationKind.INSTALL
    assert service.started[0]["idempotency_key"] == "install-catalog-test"


async def test_system_plugin_disable_starts_durable_operation(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    await manager.load_all()
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    operation = _operation_out().model_copy(update={"kind": PluginOperationKind.DISABLE})
    service = _PluginLifecycleServiceStub(operation)
    app = _build_app(manager=manager, is_super_admin=True, lifecycle_service=service)

    async with asgi_client(app) as client:
        response = await client.post(
            "/api/v1/system/plugins/catalog-test/disable",
            headers={"Idempotency-Key": "disable-catalog-test"},
            json={},
        )

    assert response.status_code == 202, response.text
    assert response.json()["data"]["kind"] == "disable"
    assert len(service.started) == 1
    assert service.started[0]["kind"] == PluginOperationKind.DISABLE


async def test_system_plugin_operation_endpoint_reads_durable_state() -> None:
    operation = _operation_out()
    service = _PluginLifecycleServiceStub(operation)
    app = _build_app(manager=None, is_super_admin=True, lifecycle_service=service)

    async with asgi_client(app) as client:
        response = await client.get(f"/api/v1/system/plugin-operations/{operation.id}")

    assert response.status_code == 200, response.text
    assert response.json()["data"]["id"] == encode_uuid(operation.id)
    assert service.requested_operation_ids == [operation.id]
