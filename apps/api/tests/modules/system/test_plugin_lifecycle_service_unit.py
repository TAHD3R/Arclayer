from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.system.plugin_installation import (
    PluginLifecycleState,
    PluginOperationKind,
    PluginOperationState,
    PluginTrustState,
)
from src.modules.jobs.service import BackgroundJobService
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.lifecycle_service import PluginLifecycleService
from src.modules.system.plugins.schema import (
    ExtensionDependencyOut,
    SystemPluginCatalogItemOut,
    SystemPluginCompatibilityOut,
    SystemPluginLifecycleRequest,
    SystemPluginProvenanceStatus,
    SystemPluginProvidesOut,
    SystemPluginSourceType,
)


class _LifecycleRepository:
    def __init__(self, installation: Any | None = None) -> None:
        self.installation = installation
        self.operations: dict[UUID, Any] = {}
        self.operations_by_key: dict[str, Any] = {}
        self.created_installations: list[tuple[dict[str, object], object]] = []
        self.created_operations: list[tuple[dict[str, object], object]] = []
        self.bindings: list[tuple[Any, Any, UUID, object]] = []

    async def get_operation_by_idempotency_hash(self, key_hash: str, **_: object) -> Any | None:
        return self.operations_by_key.get(key_hash)

    async def get_installation(self, plugin_name: str, **_: object) -> Any | None:
        if self.installation is not None and self.installation.plugin_name == plugin_name:
            return self.installation
        return None

    async def list_installations(self) -> list[Any]:
        return [self.installation] if self.installation is not None else []

    async def create_installation(self, *, data: dict[str, object], conn: object) -> Any:
        installation = SimpleNamespace(
            id=uuid4(),
            current_operation_id=None,
            current_job_id=None,
            previous_version=None,
            rollback_version=None,
            **data,
        )
        self.installation = installation
        self.created_installations.append((data, conn))
        return installation

    async def create_operation(self, *, data: dict[str, object], conn: object) -> Any:
        operation = SimpleNamespace(
            id=uuid4(),
            phase="queued",
            progress_completed=0,
            progress_total=5,
            job_id=None,
            migration_warnings=[],
            restart_required=False,
            activation_verified=False,
            retryable=False,
            failure_code=None,
            failure_summary=None,
            started_at=None,
            completed_at=None,
            **data,
        )
        self.operations[operation.id] = operation
        self.operations_by_key[operation.idempotency_key_hash] = operation
        self.created_operations.append((data, conn))
        return operation

    async def bind_operation_job(
        self,
        *,
        operation: Any,
        installation: Any,
        job_id: UUID,
        conn: object,
    ) -> None:
        operation.job_id = job_id
        installation.current_operation_id = operation.id
        installation.current_job_id = job_id
        self.bindings.append((operation, installation, job_id, conn))

    async def get_operation(self, operation_id: UUID, **_: object) -> Any | None:
        return self.operations.get(operation_id)


class _Jobs:
    def __init__(self) -> None:
        self.created: list[tuple[object, object]] = []
        self.published: list[Any] = []

    async def create_job_in_transaction(self, *, command: object, conn: object) -> Any:
        result = SimpleNamespace(job=SimpleNamespace(id=uuid4()), dispatch_outbox=SimpleNamespace(id=uuid4()))
        self.created.append((command, conn))
        return result

    async def publish_created_after_commit(self, result: Any) -> None:
        self.published.append(result)


class _TestPluginLifecycleService(PluginLifecycleService):
    def __init__(self, *, repository: _LifecycleRepository, jobs: _Jobs) -> None:
        super().__init__(
            repository=cast(PluginLifecycleRepository, repository),
            jobs=cast(BackgroundJobService, jobs),
            settings=Settings(app_env="test"),
        )
        self.connection = object()

    @asynccontextmanager
    async def tx(self, **_: object):
        yield self.connection


def _catalog_item(
    *,
    name: str = "catalog-test",
    installed_version: str | None = None,
    has_update: bool = False,
    permissions: list[str] | None = None,
    approved_permissions: list[str] | None = None,
) -> SystemPluginCatalogItemOut:
    return SystemPluginCatalogItemOut(
        name=name,
        available_version="1.2.3",
        installed_version=installed_version,
        has_update=has_update,
        source_type=SystemPluginSourceType.BUNDLED,
        source_locator=f"plugins/{name}",
        artifact_checksum=f"sha256:{'a' * 64}",
        package_checksum=f"sha256:{'a' * 64}",
        manifest_digest=f"sha256:{'b' * 64}",
        provenance_status=SystemPluginProvenanceStatus.VERIFIED,
        trust_state=PluginTrustState.VERIFIED,
        trust_evidence=["bundle_source_policy", "package_checksum", "manifest_digest"],
        compatibility=SystemPluginCompatibilityOut(compatible=True),
        provides=SystemPluginProvidesOut(services=["catalog-service"]),
        permissions=["catalog:read"] if permissions is None else permissions,
        approved_permissions=[] if approved_permissions is None else approved_permissions,
    )


def _installed_record(*, plugin_name: str = "catalog-test", desired_enabled: bool = True) -> Any:
    return SimpleNamespace(
        id=uuid4(),
        plugin_name=plugin_name,
        installed_version="1.2.3",
        previous_version=None,
        rollback_version=None,
        lifecycle_state=PluginLifecycleState.INSTALLED,
        desired_enabled=desired_enabled,
        current_operation_id=None,
        current_job_id=None,
    )


async def _start_install(
    service: PluginLifecycleService,
    *,
    idempotency_key: str = "install-catalog-test",
    approved_permissions: list[str] | None = None,
):
    return await service.start_operation(
        item=_catalog_item(),
        kind=PluginOperationKind.INSTALL,
        payload=SystemPluginLifecycleRequest(
            target_version="1.2.3",
            approved_permissions=approved_permissions or ["catalog:read"],
        ),
        idempotency_key=idempotency_key,
        actor_user_id=uuid4(),
    )


async def test_start_operation_creates_job_binding_and_audit_in_same_transaction(monkeypatch) -> None:
    repository = _LifecycleRepository()
    jobs = _Jobs()
    service = _TestPluginLifecycleService(repository=repository, jobs=jobs)
    audit = AsyncMock()
    monkeypatch.setattr("src.modules.system.plugins.lifecycle_service.write_required_activity_event", audit)

    operation = await _start_install(service)

    assert operation.state == PluginOperationState.QUEUED
    assert operation.permission_diff == {
        "added": ["catalog:read"],
        "removed": [],
        "approved": ["catalog:read"],
    }
    assert len(repository.created_installations) == 1
    assert len(repository.created_operations) == 1
    assert repository.created_installations[0][1] is service.connection
    assert repository.created_operations[0][1] is service.connection
    assert jobs.created[0][1] is service.connection
    assert repository.bindings[0][3] is service.connection
    audit_call = audit.await_args
    assert audit_call is not None
    assert audit_call.kwargs["conn"] is service.connection
    assert len(jobs.published) == 1
    assert jobs.published[0].job.id == repository.bindings[0][2]
    operation_data = repository.created_operations[0][0]
    assert operation_data["desired_enabled"] is False
    assert operation_data["provided_capabilities"] == ["catalog-service"]


async def test_start_operation_replays_identical_idempotent_request(monkeypatch) -> None:
    repository = _LifecycleRepository()
    jobs = _Jobs()
    service = _TestPluginLifecycleService(repository=repository, jobs=jobs)
    monkeypatch.setattr(
        "src.modules.system.plugins.lifecycle_service.write_required_activity_event",
        AsyncMock(),
    )
    actor_user_id = uuid4()
    payload = SystemPluginLifecycleRequest(
        target_version="1.2.3",
        approved_permissions=["catalog:read"],
    )

    first = await service.start_operation(
        item=_catalog_item(),
        kind=PluginOperationKind.INSTALL,
        payload=payload,
        idempotency_key="same-key",
        actor_user_id=actor_user_id,
    )
    replay = await service.start_operation(
        item=_catalog_item(),
        kind=PluginOperationKind.INSTALL,
        payload=payload,
        idempotency_key="same-key",
        actor_user_id=actor_user_id,
    )

    assert replay.id == first.id
    assert len(repository.created_operations) == 1
    assert len(jobs.created) == 1


async def test_start_operation_rejects_idempotency_key_with_different_fingerprint(monkeypatch) -> None:
    repository = _LifecycleRepository()
    jobs = _Jobs()
    service = _TestPluginLifecycleService(repository=repository, jobs=jobs)
    monkeypatch.setattr(
        "src.modules.system.plugins.lifecycle_service.write_required_activity_event",
        AsyncMock(),
    )
    actor_user_id = uuid4()

    await service.start_operation(
        item=_catalog_item(),
        kind=PluginOperationKind.INSTALL,
        payload=SystemPluginLifecycleRequest(approved_permissions=["catalog:read"]),
        idempotency_key="same-key",
        actor_user_id=actor_user_id,
    )

    with pytest.raises(Conflict, match="PLUGIN_IDEMPOTENCY_CONFLICT"):
        await service.start_operation(
            item=_catalog_item().model_copy(update={"available_version": "1.2.4"}),
            kind=PluginOperationKind.INSTALL,
            payload=SystemPluginLifecycleRequest(
                target_version="1.2.4",
                approved_permissions=["catalog:read"],
            ),
            idempotency_key="same-key",
            actor_user_id=actor_user_id,
        )


async def test_start_operation_rejects_second_non_terminal_operation(monkeypatch) -> None:
    repository = _LifecycleRepository()
    jobs = _Jobs()
    service = _TestPluginLifecycleService(repository=repository, jobs=jobs)
    monkeypatch.setattr(
        "src.modules.system.plugins.lifecycle_service.write_required_activity_event",
        AsyncMock(),
    )

    await _start_install(service, idempotency_key="first-key")

    with pytest.raises(Conflict, match="PLUGIN_OPERATION_IN_PROGRESS"):
        await _start_install(service, idempotency_key="second-key")


async def test_install_requires_explicit_permission_approval() -> None:
    service = _TestPluginLifecycleService(repository=_LifecycleRepository(), jobs=_Jobs())

    with pytest.raises(Conflict, match="PLUGIN_PERMISSION_REVIEW_REQUIRED"):
        await service.start_operation(
            item=_catalog_item(),
            kind=PluginOperationKind.INSTALL,
            payload=SystemPluginLifecycleRequest(approved_permissions=[]),
            idempotency_key="missing-approval",
            actor_user_id=uuid4(),
        )


async def test_enable_requires_explicit_approval_for_unapproved_requested_permissions() -> None:
    installation = _installed_record(desired_enabled=False)
    service = _TestPluginLifecycleService(repository=_LifecycleRepository(installation), jobs=_Jobs())

    with pytest.raises(Conflict, match="PLUGIN_PERMISSION_REVIEW_REQUIRED"):
        await service.start_operation(
            item=_catalog_item(installed_version="1.2.3"),
            kind=PluginOperationKind.ENABLE,
            payload=SystemPluginLifecycleRequest(),
            idempotency_key="enable-without-permission-review",
            actor_user_id=uuid4(),
        )


async def test_operation_rejects_permissions_not_requested_by_the_extension() -> None:
    service = _TestPluginLifecycleService(repository=_LifecycleRepository(), jobs=_Jobs())

    with pytest.raises(Conflict, match="PLUGIN_PERMISSION_APPROVAL_INVALID"):
        await service.start_operation(
            item=_catalog_item(),
            kind=PluginOperationKind.INSTALL,
            payload=SystemPluginLifecycleRequest(
                approved_permissions=["catalog:read", "unrelated:permission"],
            ),
            idempotency_key="unexpected-permission",
            actor_user_id=uuid4(),
        )


async def test_non_review_operation_rejects_permission_approval_payload() -> None:
    installation = _installed_record()
    service = _TestPluginLifecycleService(repository=_LifecycleRepository(installation), jobs=_Jobs())

    with pytest.raises(Conflict, match="PLUGIN_PERMISSION_APPROVAL_NOT_APPLICABLE"):
        await service.start_operation(
            item=_catalog_item(installed_version="1.2.3", approved_permissions=["catalog:read"]),
            kind=PluginOperationKind.DISABLE,
            payload=SystemPluginLifecycleRequest(approved_permissions=["catalog:read"]),
            idempotency_key="disable-with-approval-payload",
            actor_user_id=uuid4(),
        )


async def test_install_rejects_catalog_item_without_explicit_trust_evidence() -> None:
    service = _TestPluginLifecycleService(repository=_LifecycleRepository(), jobs=_Jobs())
    item = _catalog_item().model_copy(update={"trust_evidence": []})

    with pytest.raises(Conflict, match="EXTENSION_TRUST_NOT_VERIFIED"):
        await service.start_operation(
            item=item,
            kind=PluginOperationKind.INSTALL,
            payload=SystemPluginLifecycleRequest(approved_permissions=["catalog:read"]),
            idempotency_key="untrusted-install",
            actor_user_id=uuid4(),
        )


async def test_install_requires_declared_extension_dependencies_to_be_enabled() -> None:
    service = _TestPluginLifecycleService(repository=_LifecycleRepository(), jobs=_Jobs())
    item = _catalog_item().model_copy(
        update={"dependencies": [ExtensionDependencyOut(extension_name="required-extension")]}
    )

    with pytest.raises(Conflict, match="EXTENSION_DEPENDENCY_NOT_READY"):
        await service.start_operation(
            item=item,
            kind=PluginOperationKind.INSTALL,
            payload=SystemPluginLifecycleRequest(approved_permissions=["catalog:read"]),
            idempotency_key="missing-dependency",
            actor_user_id=uuid4(),
        )


async def test_recover_requires_failed_installation_and_preserves_disabled_intent(monkeypatch) -> None:
    installation = _installed_record(desired_enabled=False)
    installation.lifecycle_state = PluginLifecycleState.FAILED
    installation.current_operation_id = uuid4()
    failed_operation_id = installation.current_operation_id
    repository = _LifecycleRepository(installation)
    jobs = _Jobs()
    service = _TestPluginLifecycleService(repository=repository, jobs=jobs)
    monkeypatch.setattr("src.modules.system.plugins.lifecycle_service.write_required_activity_event", AsyncMock())

    operation = await service.start_operation(
        item=_catalog_item(installed_version="1.2.3"),
        kind=PluginOperationKind.RECOVER,
        payload=SystemPluginLifecycleRequest(),
        idempotency_key="recover-failed-operation",
        actor_user_id=uuid4(),
    )

    assert operation.kind == PluginOperationKind.RECOVER
    operation_data = repository.created_operations[0][0]
    assert operation_data["desired_enabled"] is False
    assert operation_data["recovery_of_operation_id"] == failed_operation_id


@pytest.mark.parametrize("kind", [PluginOperationKind.DISABLE, PluginOperationKind.UNINSTALL])
async def test_required_core_plugin_cannot_be_disabled_or_uninstalled(kind: PluginOperationKind) -> None:
    installation = _installed_record(plugin_name="arclayer-core")
    service = _TestPluginLifecycleService(
        repository=_LifecycleRepository(installation),
        jobs=_Jobs(),
    )

    with pytest.raises(Conflict, match="PLUGIN_REQUIRED_DEPENDENCY"):
        await service.start_operation(
            item=_catalog_item(name="arclayer-core", installed_version="1.2.3"),
            kind=kind,
            payload=SystemPluginLifecycleRequest(),
            idempotency_key=f"core-{kind}",
            actor_user_id=uuid4(),
        )
