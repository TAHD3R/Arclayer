from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime
from pathlib import Path

import structlog

from src.config import Settings
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.manifest import ProcessState, parse_manifest
from src.models.jobs.background_job import JobInternalStatus
from src.models.system.plugin_installation import (
    PluginArtifactRecord,
    PluginInstallationRecord,
    PluginOperationRecord,
    PluginOperationState,
)
from src.modules.jobs.service import BackgroundJobService
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.package_store import PluginPackageStore, calculate_directory_checksum
from src.modules.system.plugins.runtime_configuration import (
    PLUGIN_RUNTIME_CONFIGURATION_SERVICE,
    PluginRuntimeConfigurationSnapshot,
)

logger = structlog.get_logger("arclayer.system.plugins.runtime")


async def load_desired_system_plugins(
    manager: ExtensionManager,
    *,
    settings: Settings,
    repository: PluginLifecycleRepository | None = None,
) -> None:
    """Load enabled bundled packages and the exact managed artifacts selected in storage."""

    repository = repository or PluginLifecycleRepository()
    installations = await repository.list_installations()
    persisted_names = frozenset(installation.plugin_name for installation in installations)
    manager.registry.services.register(
        PLUGIN_RUNTIME_CONFIGURATION_SERVICE,
        PluginRuntimeConfigurationSnapshot.from_installations(installations),
    )
    for extension_dir in manager.discover_extension_dirs():
        manifest = parse_manifest(extension_dir / "extension.json")
        installation = next(
            (item for item in installations if item.plugin_name == manifest.name),
            None,
        )
        if installation is not None and (not installation.desired_enabled or installation.active_artifact is not None):
            logger.info(
                "Bundled system plugin excluded by persisted installation state",
                plugin_name=manifest.name,
                desired_enabled=installation.desired_enabled,
                has_managed_artifact=installation.active_artifact is not None,
            )
            continue
        await manager.load_extension(extension_dir)
    package_store = PluginPackageStore(settings.plugin_distribution)
    for installation in installations:
        if not installation.desired_enabled or installation.active_artifact is None:
            continue
        package_path = await _verify_active_artifact(installation, package_store=package_store)
        await manager.load_extension(package_path)
    logger.info(
        "Desired system plugin packages loaded",
        persisted_plugins=sorted(persisted_names),
    )


async def _verify_active_artifact(
    installation: PluginInstallationRecord,
    *,
    package_store: PluginPackageStore,
) -> Path:
    artifact = installation.active_artifact
    if artifact is None:
        raise RuntimeError(f"Plugin {installation.plugin_name} has no active managed artifact")
    if artifact.package_path is None:
        raise RuntimeError(f"Plugin {installation.plugin_name} active artifact has no materialized package")
    package_path = package_store.resolve_package_path(artifact.package_path)
    manifest = parse_manifest(package_path / "extension.json")
    _validate_active_artifact_identity(
        installation, artifact=artifact, manifest_name=manifest.name, manifest_version=manifest.version
    )
    package_checksum, manifest_digest = await asyncio.gather(
        asyncio.to_thread(calculate_directory_checksum, package_path),
        asyncio.to_thread(_manifest_digest, package_path),
    )
    if package_checksum != artifact.package_checksum or manifest_digest != artifact.manifest_digest:
        raise RuntimeError(f"Plugin {installation.plugin_name} active artifact failed integrity verification")
    return package_path


def _validate_active_artifact_identity(
    installation: PluginInstallationRecord,
    *,
    artifact: PluginArtifactRecord,
    manifest_name: str,
    manifest_version: str,
) -> None:
    if artifact.plugin_name != installation.plugin_name:
        raise RuntimeError(f"Plugin {installation.plugin_name} active artifact has a different plugin identity")
    if manifest_name != artifact.plugin_name or manifest_version != artifact.version:
        raise RuntimeError(
            f"Plugin {installation.plugin_name} active artifact manifest identity does not match storage"
        )


def _manifest_digest(package_path: Path) -> str:
    digest = hashlib.sha256((package_path / "extension.json").read_bytes()).hexdigest()
    return f"sha256:{digest}"


async def reconcile_plugin_runtime_operations(
    manager: ExtensionManager,
    *,
    settings: Settings,
    repository: PluginLifecycleRepository | None = None,
    jobs: BackgroundJobService | None = None,
) -> int:
    """Verify post-restart runtime state and resume matching interrupted Jobs."""

    installations = repository or PluginLifecycleRepository()
    job_service = jobs or BackgroundJobService(settings)
    for installation in await installations.list_configuration_waiting_for_restart():
        instance = manager.get_instance(installation.plugin_name)
        if (
            instance is None
            or instance.process.state != ProcessState.READY
            or instance.manifest.version != installation.installed_version
        ):
            logger.info(
                "Plugin configuration remains pending runtime verification",
                plugin_name=installation.plugin_name,
                configuration_revision=installation.configuration_revision,
            )
            continue
        await installations.mark_configuration_activation_verified(installation)
        logger.info(
            "Plugin configuration runtime activation verified",
            plugin_name=installation.plugin_name,
            configuration_revision=installation.configuration_revision,
        )
    resumed = 0
    for candidate in await installations.list_waiting_for_restart():
        if not _runtime_matches(candidate, manager=manager):
            logger.info(
                "Plugin operation remains pending runtime verification",
                operation_id=str(candidate.id),
                plugin_name=candidate.plugin_name,
                desired_enabled=candidate.installation.desired_enabled,
            )
            continue
        if candidate.job_id is None:
            raise RuntimeError(f"Plugin operation {candidate.id} is waiting for restart without a durable Job")
        async with job_service.tx() as conn:
            operation = await installations.get_operation(candidate.id, conn=conn, for_update=True)
            if operation is None:
                raise RuntimeError(f"Plugin operation {candidate.id} disappeared during runtime verification")
            if operation.state != PluginOperationState.WAITING_FOR_RESTART or operation.activation_verified:
                continue
            if not _runtime_matches(operation, manager=manager):
                continue
            if operation.job_id is None:
                raise RuntimeError(f"Plugin operation {operation.id} lost its durable Job binding")
            job_record = await job_service.repository.get_job_for_update(job_id=operation.job_id, conn=conn)
            if job_record is None:
                raise RuntimeError(f"Plugin operation {operation.id} references a missing durable Job")
            if job_record.internal_status != JobInternalStatus.WAITING_FOR_USER:
                continue
            await installations.mark_activation_verified(operation=operation, conn=conn)
            job, _ = await job_service.resume_waiting_job_in_transaction(
                job_id=operation.job_id,
                actor_user_id=operation.requested_by_user_id,
                resumed_at=datetime.now(UTC),
                conn=conn,
            )
        await job_service.publish_resumed_after_commit(job=job)
        resumed += 1
    return resumed


def _runtime_matches(operation: PluginOperationRecord, *, manager: ExtensionManager) -> bool:
    installation = operation.installation
    instance = manager.get_instance(operation.plugin_name)
    if not installation.desired_enabled:
        return instance is None
    if instance is None or instance.process.state != ProcessState.READY:
        return False
    expected_version = operation.requested_version or installation.installed_version
    return expected_version is not None and instance.manifest.version == expected_version
