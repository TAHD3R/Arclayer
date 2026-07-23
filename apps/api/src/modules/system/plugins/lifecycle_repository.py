from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.plugin_installation import (
    PluginArtifactRecord,
    PluginArtifactState,
    PluginInstallationRecord,
    PluginLifecycleState,
    PluginOperationKind,
    PluginOperationRecord,
    PluginOperationState,
    PluginRuntimeActivationState,
)
from src.modules.system.plugins.job_contract import PluginLifecycleJobInput

_STAGING_STATES = {
    PluginOperationKind.INSTALL: PluginLifecycleState.INSTALLING,
    PluginOperationKind.UPGRADE: PluginLifecycleState.UPGRADING,
    PluginOperationKind.ROLLBACK: PluginLifecycleState.UPGRADING,
    PluginOperationKind.ENABLE: PluginLifecycleState.INSTALLING,
    PluginOperationKind.DISABLE: PluginLifecycleState.DISABLING,
    PluginOperationKind.UNINSTALL: PluginLifecycleState.UNINSTALLING,
}


class PluginLifecycleRepository(TortoiseORMRepository):
    async def get_artifact(
        self,
        artifact_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> PluginArtifactRecord | None:
        query = PluginArtifactRecord.filter(id=artifact_id)
        if for_update:
            query = query.select_for_update()
        return await self.using_db(query, conn).first()

    async def get_artifact_by_identity(
        self,
        *,
        artifact_checksum: str,
        signer_fingerprint: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> PluginArtifactRecord | None:
        query = PluginArtifactRecord.filter(
            artifact_checksum=artifact_checksum,
            signer_fingerprint=signer_fingerprint,
        )
        return await self.using_db(query, conn).first()

    async def create_artifact(
        self,
        *,
        data: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> PluginArtifactRecord:
        return await self.create_record(PluginArtifactRecord, conn=conn, **data)

    async def mark_artifact_materialized(
        self,
        artifact: PluginArtifactRecord,
        *,
        archive_path: str,
        package_path: str,
    ) -> PluginArtifactRecord:
        return await self.update_fields(
            artifact,
            fields={
                "archive_path": archive_path,
                "package_path": package_path,
                "state": PluginArtifactState.STAGED,
                "failure_code": None,
                "failure_summary": None,
                "updated_at": datetime.now(UTC),
            },
        )

    async def list_installations(self) -> list[PluginInstallationRecord]:
        return await PluginInstallationRecord.all().prefetch_related("active_artifact", "previous_artifact")

    async def list_recent_operations(
        self,
        plugin_name: str,
        *,
        limit: int = 10,
    ) -> list[PluginOperationRecord]:
        return await PluginOperationRecord.filter(plugin_name=plugin_name).order_by("-created_at").limit(limit)

    async def get_installation(
        self,
        plugin_name: str,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> PluginInstallationRecord | None:
        query = PluginInstallationRecord.filter(plugin_name=plugin_name).prefetch_related(
            "active_artifact",
            "previous_artifact",
        )
        if for_update:
            query = query.select_for_update()
        return await self.using_db(query, conn).first()

    async def create_installation(
        self,
        *,
        data: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> PluginInstallationRecord:
        return await self.create_record(PluginInstallationRecord, conn=conn, **data)

    async def update_configuration(
        self,
        installation: PluginInstallationRecord,
        *,
        configuration: JsonObject,
        secret_references: dict[str, str],
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> PluginInstallationRecord:
        return await self.update_fields(
            installation,
            fields={
                "configuration": configuration,
                "secret_references": secret_references,
                "configuration_revision": revision,
                "runtime_activation_state": PluginRuntimeActivationState.PENDING_RESTART,
                "updated_by_user_id": actor_user_id,
                "updated_at": datetime.now(UTC),
            },
            conn=conn,
        )

    async def list_configuration_waiting_for_restart(self) -> list[PluginInstallationRecord]:
        return await PluginInstallationRecord.filter(
            desired_enabled=True,
            runtime_activation_state=PluginRuntimeActivationState.PENDING_RESTART,
            current_operation_id=None,
        )

    async def mark_configuration_activation_verified(
        self,
        installation: PluginInstallationRecord,
    ) -> None:
        await self.update_fields(
            installation,
            fields={
                "runtime_activation_state": PluginRuntimeActivationState.VERIFIED,
                "runtime_verified_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC),
            },
        )

    async def list_waiting_for_restart(self) -> list[PluginOperationRecord]:
        return await PluginOperationRecord.filter(
            state=PluginOperationState.WAITING_FOR_RESTART,
            activation_verified=False,
        ).prefetch_related("installation")

    async def get_operation_by_idempotency_hash(
        self,
        idempotency_key_hash: str,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> PluginOperationRecord | None:
        query = PluginOperationRecord.filter(idempotency_key_hash=idempotency_key_hash).prefetch_related("installation")
        return await self.using_db(query, conn).first()

    async def create_operation(
        self,
        *,
        data: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> PluginOperationRecord:
        return await self.create_record(PluginOperationRecord, conn=conn, **data)

    async def bind_operation_job(
        self,
        *,
        operation: PluginOperationRecord,
        installation: PluginInstallationRecord,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(operation, fields={"job_id": job_id}, conn=conn)
        await self.update_fields(
            installation,
            fields={"current_operation_id": operation.id, "current_job_id": job_id},
            conn=conn,
        )

    async def mark_activation_verified(
        self,
        *,
        operation: PluginOperationRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.update_fields(
            operation,
            fields={
                "activation_verified": True,
                "phase": "verifying_activation",
                "progress_completed": 4,
                "progress_total": 5,
            },
            conn=conn,
        )

    async def mark_operation_progress(
        self,
        operation_id: UUID,
        *,
        phase: str,
        completed: int,
        total: int,
    ) -> None:
        operation = await PluginOperationRecord.filter(id=operation_id).first()
        if operation is None:
            raise LookupError("plugin operation was not found while projecting progress")
        operation.state = PluginOperationState.RUNNING
        operation.phase = phase
        operation.progress_completed = completed
        operation.progress_total = total
        operation.started_at = operation.started_at or datetime.now(UTC)
        await operation.save(
            update_fields=(
                "state",
                "phase",
                "progress_completed",
                "progress_total",
                "started_at",
                "updated_at",
            )
        )

    async def get_operation(
        self,
        operation_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> PluginOperationRecord | None:
        query = PluginOperationRecord.filter(id=operation_id).prefetch_related("installation")
        if for_update:
            query = query.select_for_update()
        return await self.using_db(query, conn).first()

    async def stage_for_restart(self, job_input: PluginLifecycleJobInput) -> PluginOperationRecord:
        async with in_transaction() as conn:
            operation = (
                await PluginOperationRecord.filter(id=job_input.operation_id).using_db(conn).select_for_update().first()
            )
            if operation is None:
                raise LookupError("plugin operation was not found")
            installation = (
                await PluginInstallationRecord
                .filter(id=operation.installation_id)
                .using_db(conn)
                .select_for_update()
                .get()
            )
            operation.state = PluginOperationState.WAITING_FOR_RESTART
            operation.phase = "waiting_for_restart"
            operation.progress_completed = 3
            operation.progress_total = 5
            operation.restart_required = True
            operation.started_at = operation.started_at or datetime.now(UTC)
            await operation.save(
                using_db=conn,
                update_fields=(
                    "state",
                    "phase",
                    "progress_completed",
                    "progress_total",
                    "restart_required",
                    "started_at",
                    "updated_at",
                ),
            )
            installation.lifecycle_state = _STAGING_STATES[job_input.kind]
            installation.desired_enabled = job_input.desired_enabled
            installation.runtime_activation_state = PluginRuntimeActivationState.PENDING_RESTART
            installation.current_operation_id = operation.id
            installation.current_job_id = operation.job_id
            installation.available_version = job_input.target_version
            installation.updated_by_user_id = operation.requested_by_user_id
            if job_input.artifact_id is not None and job_input.kind in {
                PluginOperationKind.INSTALL,
                PluginOperationKind.UPGRADE,
                PluginOperationKind.ROLLBACK,
            }:
                artifact = (
                    await PluginArtifactRecord.filter(id=job_input.artifact_id).using_db(conn).select_for_update().get()
                )
                operation.previous_artifact_id = installation.active_artifact_id
                installation.previous_artifact_id = installation.active_artifact_id
                installation.active_artifact_id = artifact.id
                installation.source_type = artifact.source_type
                installation.source_locator = artifact.source_locator
                installation.package_checksum = artifact.package_checksum
                installation.manifest_digest = artifact.manifest_digest
                installation.provenance_status = artifact.provenance_status
                artifact.state = PluginArtifactState.ACTIVE
                await artifact.save(using_db=conn, update_fields=("state", "updated_at"))
                if installation.previous_artifact_id is not None:
                    await (
                        PluginArtifactRecord
                        .filter(id=installation.previous_artifact_id)
                        .using_db(conn)
                        .update(
                            state=PluginArtifactState.RETAINED,
                            updated_at=datetime.now(UTC),
                        )
                    )
                await operation.save(using_db=conn, update_fields=("previous_artifact_id", "updated_at"))
            await installation.save(
                using_db=conn,
                update_fields=(
                    "lifecycle_state",
                    "desired_enabled",
                    "runtime_activation_state",
                    "current_operation_id",
                    "current_job_id",
                    "available_version",
                    "updated_by_user_id",
                    "previous_artifact_id",
                    "active_artifact_id",
                    "source_type",
                    "source_locator",
                    "package_checksum",
                    "manifest_digest",
                    "provenance_status",
                    "updated_at",
                ),
            )
        return operation

    async def finalize_verified(self, operation_id: UUID) -> PluginOperationRecord:
        async with in_transaction() as conn:
            operation = await PluginOperationRecord.filter(id=operation_id).using_db(conn).select_for_update().get()
            installation = (
                await PluginInstallationRecord
                .filter(id=operation.installation_id)
                .using_db(conn)
                .select_for_update()
                .get()
            )
            if not operation.activation_verified:
                raise ValueError("plugin runtime activation is not verified")
            now = datetime.now(UTC)
            operation.state = PluginOperationState.SUCCEEDED
            operation.phase = "finalizing"
            operation.progress_completed = 5
            operation.progress_total = 5
            operation.completed_at = now
            await operation.save(
                using_db=conn,
                update_fields=(
                    "state",
                    "phase",
                    "progress_completed",
                    "progress_total",
                    "completed_at",
                    "updated_at",
                ),
            )
            installation.previous_version = installation.installed_version
            if operation.kind in {
                PluginOperationKind.INSTALL,
                PluginOperationKind.UPGRADE,
                PluginOperationKind.ROLLBACK,
            }:
                installation.installed_version = operation.requested_version
                installation.rollback_version = installation.previous_version
            elif operation.kind == PluginOperationKind.UNINSTALL:
                retained_artifact_ids = {
                    artifact_id
                    for artifact_id in (
                        installation.active_artifact_id,
                        installation.previous_artifact_id,
                    )
                    if artifact_id is not None
                }
                if retained_artifact_ids:
                    await (
                        PluginArtifactRecord
                        .filter(id__in=retained_artifact_ids)
                        .using_db(conn)
                        .update(
                            state=PluginArtifactState.RETAINED,
                            updated_at=now,
                        )
                    )
                installation.installed_version = None
                installation.rollback_version = None
                installation.active_artifact_id = None
                installation.previous_artifact_id = None
            installation.lifecycle_state = (
                PluginLifecycleState.INSTALLED if installation.desired_enabled else PluginLifecycleState.DISABLED
            )
            installation.runtime_activation_state = PluginRuntimeActivationState.VERIFIED
            installation.runtime_verified_at = now
            installation.current_operation_id = None
            installation.current_job_id = None
            installation.last_success_summary = f"{operation.kind} runtime activation verified"
            installation.last_failure_code = None
            installation.last_failure_summary = None
            await installation.save(
                using_db=conn,
                update_fields=(
                    "previous_version",
                    "installed_version",
                    "rollback_version",
                    "active_artifact_id",
                    "previous_artifact_id",
                    "lifecycle_state",
                    "runtime_activation_state",
                    "runtime_verified_at",
                    "current_operation_id",
                    "current_job_id",
                    "last_success_summary",
                    "last_failure_code",
                    "last_failure_summary",
                    "updated_at",
                ),
            )
        refreshed = await self.get_operation(operation_id)
        if refreshed is None:
            raise LookupError("finalized plugin operation was not found")
        return refreshed

    async def project_failure(self, operation_id: UUID, *, code: str, summary: str) -> None:
        async with in_transaction() as conn:
            operation = await PluginOperationRecord.filter(id=operation_id).using_db(conn).select_for_update().first()
            if operation is None:
                return
            installation = (
                await PluginInstallationRecord
                .filter(id=operation.installation_id)
                .using_db(conn)
                .select_for_update()
                .get()
            )
            operation.state = PluginOperationState.FAILED
            operation.failure_code = code
            operation.failure_summary = summary
            operation.completed_at = datetime.now(UTC)
            await operation.save(
                using_db=conn,
                update_fields=("state", "failure_code", "failure_summary", "completed_at", "updated_at"),
            )
            installation.lifecycle_state = PluginLifecycleState.FAILED
            installation.runtime_activation_state = PluginRuntimeActivationState.FAILED
            installation.last_failure_code = code
            installation.last_failure_summary = summary
            await installation.save(
                using_db=conn,
                update_fields=(
                    "lifecycle_state",
                    "runtime_activation_state",
                    "last_failure_code",
                    "last_failure_summary",
                    "updated_at",
                ),
            )
