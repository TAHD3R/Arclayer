from __future__ import annotations

import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.manifest import ProcessState
from src.models.jobs.background_job import JobInternalStatus
from src.models.system.plugin_installation import PluginOperationState, PluginTrustState
from src.modules.jobs.service import BackgroundJobService
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.package_store import calculate_directory_checksum
from src.modules.system.plugins.runtime_configuration import (
    PLUGIN_RUNTIME_CONFIGURATION_SERVICE,
    PluginRuntimeConfigurationSnapshot,
    PluginSecretReferenceError,
)
from src.modules.system.plugins.runtime_reconciliation import (
    load_desired_system_plugins,
    reconcile_plugin_runtime_operations,
)


class _RuntimeManager:
    def __init__(self, *, extension_dirs: list[Path] | None = None, instances: dict[str, object] | None = None) -> None:
        self.extension_dirs = extension_dirs or []
        self.instances = instances or {}
        self.loaded: list[Path] = []
        self.runtime_services: dict[str, object] = {}
        self.registry = SimpleNamespace(services=SimpleNamespace(register=self.runtime_services.__setitem__))

    def discover_extension_dirs(self) -> list[Path]:
        return self.extension_dirs

    async def load_extension(self, extension_dir: Path) -> None:
        self.loaded.append(extension_dir)

    def get_instance(self, plugin_name: str) -> object | None:
        return self.instances.get(plugin_name)


class _RuntimeRepository:
    def __init__(
        self,
        operation: Any | None = None,
        *,
        installations: list[Any] | None = None,
        configuration_waiting: list[Any] | None = None,
    ) -> None:
        self.operation = operation
        self.installations = installations or []
        self.configuration_waiting = configuration_waiting or []
        self.marked: list[object] = []
        self.configuration_verified: list[object] = []

    async def list_installations(self) -> list[Any]:
        return self.installations

    async def list_waiting_for_restart(self) -> list[Any]:
        return [] if self.operation is None else [self.operation]

    async def list_configuration_waiting_for_restart(self) -> list[Any]:
        return self.configuration_waiting

    async def mark_configuration_activation_verified(self, installation: Any) -> None:
        self.configuration_verified.append(installation)

    async def get_operation(self, operation_id: object, **_: object) -> Any | None:
        if self.operation is None or self.operation.id != operation_id:
            return None
        return self.operation

    async def mark_activation_verified(self, *, operation: Any, conn: object) -> None:
        self.marked.append((operation, conn))
        operation.activation_verified = True


class _JobRepository:
    def __init__(self, job: Any | None) -> None:
        self.job = job

    async def get_job_for_update(self, *, job_id: object, conn: object) -> Any | None:
        if self.job is None or self.job.id != job_id:
            return None
        return self.job


class _JobService:
    def __init__(self, job: Any | None) -> None:
        self.repository = _JobRepository(job)
        self.connection = object()
        self.resumed: list[object] = []
        self.published: list[object] = []

    @asynccontextmanager
    async def tx(self):
        yield self.connection

    async def resume_waiting_job_in_transaction(self, *, job_id: object, **_: object):
        self.resumed.append(job_id)
        return self.repository.job, None

    async def publish_resumed_after_commit(self, *, job: object) -> None:
        self.published.append(job)


def _write_manifest(extension_dir: Path, *, name: str) -> None:
    extension_dir.mkdir(parents=True)
    (extension_dir / "extension.json").write_text(
        json.dumps({"name": name, "version": "1.2.3", "entry": "plugin.py"}),
        encoding="utf-8",
    )


def _settings_with_plugin_store(tmp_path: Path) -> Settings:
    root_dir = tmp_path / "plugin-store"
    return Settings(
        app_env="test",
        plugin_distribution={
            "root_dir": root_dir,
            "staging_dir": root_dir / ".staging",
        },
    )


def _managed_artifact(package_dir: Path, *, plugin_name: str, version: str = "1.2.3") -> Any:
    _write_manifest(package_dir, name=plugin_name)
    manifest_bytes = (package_dir / "extension.json").read_bytes()
    return SimpleNamespace(
        plugin_name=plugin_name,
        version=version,
        package_path=package_dir.relative_to(package_dir.parents[3]).as_posix(),
        package_checksum=calculate_directory_checksum(package_dir),
        manifest_digest=f"sha256:{hashlib.sha256(manifest_bytes).hexdigest()}",
        trust_state=PluginTrustState.VERIFIED,
        trust_evidence=["artifact_signature", "package_checksum", "manifest_digest"],
    )


def _operation(*, desired_enabled: bool, job_id: object | None = None, version: str = "1.2.3") -> Any:
    return SimpleNamespace(
        id=uuid4(),
        plugin_name="catalog-test",
        state=PluginOperationState.WAITING_FOR_RESTART,
        activation_verified=False,
        job_id=job_id,
        requested_version=version,
        requested_by_user_id=uuid4(),
        installation=SimpleNamespace(
            desired_enabled=desired_enabled,
            installed_version=version,
        ),
    )


def _ready_instance(*, version: str = "1.2.3") -> Any:
    return SimpleNamespace(
        process=SimpleNamespace(state=ProcessState.READY),
        manifest=SimpleNamespace(version=version),
    )


def _installation(
    plugin_name: str,
    *,
    desired_enabled: bool = True,
    configuration: dict[str, object] | None = None,
    secret_references: dict[str, str] | None = None,
    active_artifact: Any | None = None,
) -> Any:
    return SimpleNamespace(
        plugin_name=plugin_name,
        desired_enabled=desired_enabled,
        configuration=configuration or {},
        secret_references=secret_references or {},
        active_artifact=active_artifact,
    )


async def test_load_desired_system_plugins_excludes_persisted_disabled_plugin(tmp_path: Path) -> None:
    enabled_dir = tmp_path / "plugins" / "enabled-plugin"
    disabled_dir = tmp_path / "plugins" / "disabled-plugin"
    _write_manifest(enabled_dir, name="enabled-plugin")
    _write_manifest(disabled_dir, name="disabled-plugin")
    manager = _RuntimeManager(extension_dirs=[enabled_dir, disabled_dir])
    repository = _RuntimeRepository(
        installations=[
            _installation("enabled-plugin", configuration={"enabled": True}),
            _installation("disabled-plugin", desired_enabled=False),
        ]
    )

    await load_desired_system_plugins(
        cast(ExtensionManager, manager),
        settings=_settings_with_plugin_store(tmp_path),
        repository=cast(PluginLifecycleRepository, repository),
    )

    assert manager.loaded == [enabled_dir]
    snapshot = cast(
        PluginRuntimeConfigurationSnapshot,
        manager.runtime_services[PLUGIN_RUNTIME_CONFIGURATION_SERVICE],
    )
    assert snapshot.configuration_for("enabled-plugin") == {"enabled": True}
    assert snapshot.configuration_for("disabled-plugin") == {}


async def test_load_desired_system_plugins_uses_verified_managed_artifact(tmp_path: Path) -> None:
    settings = _settings_with_plugin_store(tmp_path)
    bundled_dir = tmp_path / "plugins" / "managed-plugin"
    package_dir = settings.plugin_distribution.root_dir / "packages" / "managed-plugin" / "1.2.3" / "checksum"
    _write_manifest(bundled_dir, name="managed-plugin")
    artifact = _managed_artifact(package_dir, plugin_name="managed-plugin")
    manager = _RuntimeManager(extension_dirs=[bundled_dir])
    repository = _RuntimeRepository(installations=[_installation("managed-plugin", active_artifact=artifact)])

    await load_desired_system_plugins(
        cast(ExtensionManager, manager),
        settings=settings,
        repository=cast(PluginLifecycleRepository, repository),
    )

    assert manager.loaded == [package_dir]


async def test_load_desired_system_plugins_rejects_tampered_managed_artifact(tmp_path: Path) -> None:
    settings = _settings_with_plugin_store(tmp_path)
    package_dir = settings.plugin_distribution.root_dir / "packages" / "managed-plugin" / "1.2.3" / "checksum"
    artifact = _managed_artifact(package_dir, plugin_name="managed-plugin")
    artifact.package_checksum = "sha256:" + "0" * 64
    repository = _RuntimeRepository(installations=[_installation("managed-plugin", active_artifact=artifact)])

    with pytest.raises(RuntimeError, match="failed integrity verification"):
        await load_desired_system_plugins(
            cast(ExtensionManager, _RuntimeManager()),
            settings=settings,
            repository=cast(PluginLifecycleRepository, repository),
        )


async def test_load_desired_system_plugins_rejects_managed_artifact_without_trust_evidence(tmp_path: Path) -> None:
    settings = _settings_with_plugin_store(tmp_path)
    package_dir = settings.plugin_distribution.root_dir / "packages" / "managed-plugin" / "1.2.3" / "checksum"
    artifact = _managed_artifact(package_dir, plugin_name="managed-plugin")
    artifact.trust_evidence = []
    repository = _RuntimeRepository(installations=[_installation("managed-plugin", active_artifact=artifact)])

    with pytest.raises(RuntimeError, match="unverified trust evidence"):
        await load_desired_system_plugins(
            cast(ExtensionManager, _RuntimeManager()),
            settings=settings,
            repository=cast(PluginLifecycleRepository, repository),
        )


def test_runtime_configuration_snapshot_resolves_env_secret_without_mutating_persisted_values() -> None:
    installation = _installation(
        "analytics-plugin",
        configuration={"enabled": True},
        secret_references={"projectApiKey": "env:POSTHOG__PROJECT_API_KEY"},
    )

    snapshot = PluginRuntimeConfigurationSnapshot.from_installations(
        [installation],
        environment={"POSTHOG__PROJECT_API_KEY": "test-secret"},
    )

    assert snapshot.configuration_for("analytics-plugin") == {
        "enabled": True,
        "projectApiKey": "test-secret",
    }
    assert installation.configuration == {"enabled": True}


@pytest.mark.parametrize(
    ("reference", "environment", "message"),
    [
        ("plain-text", {}, "env:VARIABLE_NAME"),
        (
            "env:POSTHOG__PROJECT_API_KEY",
            {},
            "POSTHOG__PROJECT_API_KEY",
        ),
    ],
)
def test_runtime_configuration_snapshot_rejects_invalid_or_missing_secret_reference(
    reference: str,
    environment: dict[str, str],
    message: str,
) -> None:
    installation = _installation(
        "analytics-plugin",
        secret_references={"projectApiKey": reference},
    )

    with pytest.raises((ValueError, PluginSecretReferenceError), match=message):
        PluginRuntimeConfigurationSnapshot.from_installations(
            [installation],
            environment=environment,
        )


async def test_reconciliation_resumes_waiting_job_after_runtime_verification() -> None:
    job_id = uuid4()
    operation = _operation(desired_enabled=True, job_id=job_id)
    job = SimpleNamespace(id=job_id, internal_status=JobInternalStatus.WAITING_FOR_USER)
    repository = _RuntimeRepository(operation)
    jobs = _JobService(job)
    manager = _RuntimeManager(instances={"catalog-test": _ready_instance()})

    resumed = await reconcile_plugin_runtime_operations(
        cast(ExtensionManager, manager),
        settings=Settings(app_env="test"),
        repository=cast(PluginLifecycleRepository, repository),
        jobs=cast(BackgroundJobService, jobs),
    )

    assert resumed == 1
    assert repository.marked == [(operation, jobs.connection)]
    assert jobs.resumed == [job_id]
    assert jobs.published == [job]


async def test_reconciliation_verifies_configuration_after_ready_runtime() -> None:
    installation = SimpleNamespace(
        plugin_name="catalog-test",
        installed_version="1.2.3",
        configuration_revision=2,
    )
    repository = _RuntimeRepository(configuration_waiting=[installation])
    manager = _RuntimeManager(instances={"catalog-test": _ready_instance()})

    resumed = await reconcile_plugin_runtime_operations(
        cast(ExtensionManager, manager),
        settings=Settings(app_env="test"),
        repository=cast(PluginLifecycleRepository, repository),
        jobs=cast(BackgroundJobService, _JobService(None)),
    )

    assert resumed == 0
    assert repository.configuration_verified == [installation]


@pytest.mark.parametrize(
    ("instance", "job_status"),
    [
        (_ready_instance(version="9.9.9"), JobInternalStatus.WAITING_FOR_USER),
        (_ready_instance(), JobInternalStatus.RUNNING),
    ],
)
async def test_reconciliation_does_not_verify_mismatched_runtime_or_early_job_state(
    instance: object,
    job_status: JobInternalStatus,
) -> None:
    job_id = uuid4()
    operation = _operation(desired_enabled=True, job_id=job_id)
    job = SimpleNamespace(id=job_id, internal_status=job_status)
    repository = _RuntimeRepository(operation)
    jobs = _JobService(job)
    manager = _RuntimeManager(instances={"catalog-test": instance})

    resumed = await reconcile_plugin_runtime_operations(
        cast(ExtensionManager, manager),
        settings=Settings(app_env="test"),
        repository=cast(PluginLifecycleRepository, repository),
        jobs=cast(BackgroundJobService, jobs),
    )

    assert resumed == 0
    assert repository.marked == []
    assert jobs.resumed == []
    assert jobs.published == []


async def test_reconciliation_verifies_disabled_plugin_only_when_runtime_is_absent() -> None:
    job_id = uuid4()
    operation = _operation(desired_enabled=False, job_id=job_id)
    job = SimpleNamespace(id=job_id, internal_status=JobInternalStatus.WAITING_FOR_USER)
    repository = _RuntimeRepository(operation)
    jobs = _JobService(job)

    resumed = await reconcile_plugin_runtime_operations(
        cast(ExtensionManager, _RuntimeManager()),
        settings=Settings(app_env="test"),
        repository=cast(PluginLifecycleRepository, repository),
        jobs=cast(BackgroundJobService, jobs),
    )

    assert resumed == 1
    assert repository.marked == [(operation, jobs.connection)]


async def test_reconciliation_rejects_operation_without_durable_job_binding() -> None:
    operation = _operation(desired_enabled=False)
    repository = _RuntimeRepository(operation)

    with pytest.raises(RuntimeError, match="without a durable Job"):
        await reconcile_plugin_runtime_operations(
            cast(ExtensionManager, _RuntimeManager()),
            settings=Settings(app_env="test"),
            repository=cast(PluginLifecycleRepository, repository),
            jobs=cast(BackgroundJobService, _JobService(None)),
        )
