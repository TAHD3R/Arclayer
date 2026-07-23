from __future__ import annotations

from uuid import uuid4

import pytest

from src.models.system.plugin_installation import (
    PluginArtifactRecord,
    PluginArtifactState,
    PluginInstallationRecord,
    PluginLifecycleState,
    PluginOperationKind,
    PluginOperationRecord,
    PluginOperationState,
    PluginRuntimeActivationState,
    PluginSourceType,
)
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository

pytestmark = pytest.mark.integration


async def _create_artifact(*, version: str, digest_character: str) -> PluginArtifactRecord:
    checksum = f"sha256:{digest_character * 64}"
    return await PluginArtifactRecord.create(
        plugin_name="managed-test",
        version=version,
        source_type=PluginSourceType.MANUAL_UPLOAD,
        source_locator=f"manual://managed-test/{version}",
        state=PluginArtifactState.ACTIVE,
        artifact_checksum=checksum,
        package_checksum=checksum,
        manifest_digest=checksum,
        detached_signature="signature",
        signer_fingerprint=digest_character * 64,
        provenance_status="verified",
        size_bytes=1024,
    )


async def _create_verified_operation(
    installation: PluginInstallationRecord,
    *,
    kind: PluginOperationKind,
) -> PluginOperationRecord:
    return await PluginOperationRecord.create(
        installation=installation,
        plugin_name=installation.plugin_name,
        kind=kind,
        state=PluginOperationState.WAITING_FOR_RESTART,
        idempotency_key_hash=uuid4().hex,
        request_fingerprint=uuid4().hex,
        requested_version=None if kind == PluginOperationKind.UNINSTALL else installation.installed_version,
        previous_version=installation.installed_version,
        activation_verified=True,
        requested_by_user_id=uuid4(),
    )


async def test_finalize_uninstall_releases_managed_artifact_pointers(prepared_db) -> None:
    _ = prepared_db
    active = await _create_artifact(version="2.0.0", digest_character="a")
    previous = await _create_artifact(version="1.0.0", digest_character="b")
    installation = await PluginInstallationRecord.create(
        plugin_name="managed-test",
        source_type=PluginSourceType.MANUAL_UPLOAD,
        source_locator="manual://managed-test/2.0.0",
        installed_version="2.0.0",
        previous_version="1.0.0",
        rollback_version="1.0.0",
        lifecycle_state=PluginLifecycleState.UNINSTALLING,
        desired_enabled=False,
        runtime_activation_state=PluginRuntimeActivationState.PENDING_RESTART,
        active_artifact=active,
        previous_artifact=previous,
    )
    operation = await _create_verified_operation(installation, kind=PluginOperationKind.UNINSTALL)

    await PluginLifecycleRepository().finalize_verified(operation.id)

    await installation.refresh_from_db()
    await active.refresh_from_db()
    await previous.refresh_from_db()
    assert installation.installed_version is None
    assert installation.rollback_version is None
    assert installation.active_artifact_id is None
    assert installation.previous_artifact_id is None
    assert installation.lifecycle_state == PluginLifecycleState.DISABLED
    assert active.state == PluginArtifactState.RETAINED
    assert previous.state == PluginArtifactState.RETAINED


async def test_finalize_disable_preserves_active_artifact(prepared_db) -> None:
    _ = prepared_db
    active = await _create_artifact(version="2.0.0", digest_character="c")
    installation = await PluginInstallationRecord.create(
        plugin_name="managed-test",
        source_type=PluginSourceType.MANUAL_UPLOAD,
        source_locator="manual://managed-test/2.0.0",
        installed_version="2.0.0",
        lifecycle_state=PluginLifecycleState.DISABLING,
        desired_enabled=False,
        runtime_activation_state=PluginRuntimeActivationState.PENDING_RESTART,
        active_artifact=active,
    )
    operation = await _create_verified_operation(installation, kind=PluginOperationKind.DISABLE)

    await PluginLifecycleRepository().finalize_verified(operation.id)

    await installation.refresh_from_db()
    await active.refresh_from_db()
    assert installation.installed_version == "2.0.0"
    assert installation.active_artifact_id == active.id
    assert installation.lifecycle_state == PluginLifecycleState.DISABLED
    assert active.state == PluginArtifactState.ACTIVE
