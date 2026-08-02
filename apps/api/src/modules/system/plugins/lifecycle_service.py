from __future__ import annotations

from math import ceil
from uuid import UUID

from asgi_correlation_id import correlation_id
from packaging.specifiers import SpecifierSet
from packaging.version import Version
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.jobs.background_job import JobAuthorityMode
from src.models.system.plugin_installation import (
    PluginArtifactRecord,
    PluginInstallationRecord,
    PluginOperationKind,
    PluginOperationRecord,
    PluginOperationState,
    PluginSourceType,
    PluginTrustState,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.schema import BackgroundJobCreate
from src.modules.jobs.service import BackgroundJobService
from src.modules.system.plugins.installation_defaults import build_plugin_installation_data
from src.modules.system.plugins.job_contract import (
    PluginLifecycleJobInput,
    PluginLifecycleJobTarget,
    build_plugin_lifecycle_job_definition,
    build_plugin_lifecycle_source_revision,
)
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.schema import (
    SystemPluginCatalogItemOut,
    SystemPluginLifecycleRequest,
    SystemPluginOperationOut,
    SystemPluginSourceType,
)

_TERMINAL_OPERATION_STATES = frozenset({
    PluginOperationState.SUCCEEDED,
    PluginOperationState.FAILED,
    PluginOperationState.CANCELLED,
})
_PERMISSION_REVIEW_KINDS = frozenset({
    PluginOperationKind.INSTALL,
    PluginOperationKind.UPGRADE,
    PluginOperationKind.ENABLE,
})


class PluginLifecycleService(BaseService):
    def __init__(
        self,
        *,
        repository: PluginLifecycleRepository | None = None,
        jobs: BackgroundJobService | None = None,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository or PluginLifecycleRepository()
        self.jobs = jobs or BackgroundJobService(self.settings)

    async def get_operation(self, operation_id: UUID) -> SystemPluginOperationOut:
        operation = await self.repository.get_operation(operation_id)
        if operation is None:
            raise NotFound(error="PLUGIN_OPERATION_NOT_FOUND")
        return SystemPluginOperationOut.model_validate(operation)

    async def list_operations(self, *, params: PageParams) -> PageData[SystemPluginOperationOut]:
        total, rows = await self.repository.list_operations(offset=params.offset, limit=params.limit)
        pages = ceil(total / params.size) if total else 0
        return PageData(
            items=[SystemPluginOperationOut.model_validate(row) for row in rows],
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=min(params.page - 1, pages) if params.page > 1 and pages else None,
        )

    async def start_operation(
        self,
        *,
        item: SystemPluginCatalogItemOut,
        kind: PluginOperationKind,
        payload: SystemPluginLifecycleRequest,
        idempotency_key: str,
        actor_user_id: UUID,
        artifact: PluginArtifactRecord | None = None,
    ) -> SystemPluginOperationOut:
        target_version = self._resolve_target_version(item=item, kind=kind, requested=payload.target_version)
        self._validate_install_readiness(item=item)
        self._validate_artifact_binding(item=item, artifact=artifact, target_version=target_version)
        permission_diff = self._permission_diff(item=item, approved=payload.approved_permissions)
        self._validate_permission_review(
            kind=kind,
            permission_diff=permission_diff,
            submitted_permissions=payload.approved_permissions,
        )
        fingerprint = hash_json({
            "plugin_name": item.name,
            "kind": str(kind),
            "target_version": target_version,
            "package_checksum": item.package_checksum,
            "manifest_digest": item.manifest_digest,
            "artifact_id": str(artifact.id) if artifact is not None else None,
            "artifact_checksum": item.artifact_checksum,
            "approved_permissions": payload.approved_permissions,
        })
        key_hash = hash_json({"actor_user_id": str(actor_user_id), "idempotency_key": idempotency_key})

        async with self.tx() as conn:
            replay = await self.repository.get_operation_by_idempotency_hash(key_hash, conn=conn)
            if replay is not None:
                if replay.request_fingerprint != fingerprint:
                    raise Conflict(error="PLUGIN_IDEMPOTENCY_CONFLICT")
                return SystemPluginOperationOut.model_validate(replay)

            installation = await self.repository.get_installation(item.name, conn=conn, for_update=True)
            if installation is None:
                installation = await self.repository.create_installation(
                    data=build_plugin_installation_data(item, actor_user_id=actor_user_id),
                    conn=conn,
                )
            await self._validate_transition(installation=installation, item=item, kind=kind, conn=conn)
            await self._validate_dependencies(item=item, kind=kind, conn=conn)
            desired_enabled = self._desired_enabled(installation=installation, kind=kind)
            provided_capabilities = _provided_capabilities(item)
            operation = await self.repository.create_operation(
                data={
                    "installation_id": installation.id,
                    "plugin_name": item.name,
                    "kind": kind,
                    "state": PluginOperationState.QUEUED,
                    "idempotency_key_hash": key_hash,
                    "request_fingerprint": fingerprint,
                    "audit_correlation_id": correlation_id.get(None),
                    "recovery_of_operation_id": (
                        installation.current_operation_id if kind == PluginOperationKind.RECOVER else None
                    ),
                    "requested_version": target_version,
                    "previous_version": installation.installed_version,
                    "package_checksum": item.package_checksum,
                    "manifest_digest": item.manifest_digest,
                    "artifact_id": artifact.id if artifact is not None else None,
                    "permission_diff": permission_diff,
                    "requested_permissions": sorted(item.permissions),
                    "approved_permissions": permission_diff["approved"],
                    "provided_capabilities": provided_capabilities,
                    "desired_enabled": desired_enabled,
                    "requested_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            job_result = await self.jobs.create_job_in_transaction(
                command=_job_command(
                    settings=self.settings,
                    operation=operation,
                    item=item,
                    artifact=artifact,
                    kind=kind,
                    target_version=target_version,
                    idempotency_key=idempotency_key,
                    actor_user_id=actor_user_id,
                ),
                conn=conn,
            )
            await self.repository.bind_operation_job(
                operation=operation,
                installation=installation,
                job_id=job_result.job.id,
                conn=conn,
            )
            await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name=f"system.plugin.{kind}.requested",
                    actor_user_id=actor_user_id,
                    entity_type="system_plugin_operation",
                    entity_id=operation.id,
                    source="api",
                    trace_id=correlation_id.get(None),
                    properties={
                        "plugin_name": item.name,
                        "operation_kind": str(kind),
                        "job_id": str(job_result.job.id),
                        "target_version": target_version,
                    },
                ),
                conn=conn,
            )
        await self.jobs.publish_created_after_commit(job_result)
        refreshed = await self.repository.get_operation(operation.id)
        if refreshed is None:
            raise RuntimeError("created plugin operation could not be reloaded")
        return SystemPluginOperationOut.model_validate(refreshed)

    @staticmethod
    def _validate_install_readiness(*, item: SystemPluginCatalogItemOut) -> None:
        if item.trust_state != PluginTrustState.VERIFIED or not item.trust_evidence:
            raise Conflict(error="EXTENSION_TRUST_NOT_VERIFIED")
        if not item.compatibility.compatible:
            raise Conflict(error="EXTENSION_COMPATIBILITY_REQUIRED")

    @staticmethod
    def _validate_artifact_binding(
        *,
        item: SystemPluginCatalogItemOut,
        artifact: PluginArtifactRecord | None,
        target_version: str | None,
    ) -> None:
        if item.source_type == SystemPluginSourceType.BUNDLED:
            if artifact is not None:
                raise Conflict(error="PLUGIN_ARTIFACT_SOURCE_MISMATCH")
            return
        if artifact is None:
            raise Conflict(error="PLUGIN_ARTIFACT_REQUIRED")
        expected = (
            artifact.plugin_name == item.name
            and (target_version is None or artifact.version == target_version)
            and artifact.artifact_checksum == item.artifact_checksum
            and artifact.package_checksum == item.package_checksum
            and artifact.manifest_digest == item.manifest_digest
            and artifact.signer_fingerprint == item.signer_fingerprint
        )
        if not expected:
            raise Conflict(error="PLUGIN_ARTIFACT_IDENTITY_CONFLICT")

    async def _validate_transition(
        self,
        *,
        installation: PluginInstallationRecord,
        item: SystemPluginCatalogItemOut,
        kind: PluginOperationKind,
        conn: BaseDBAsyncClient,
    ) -> None:
        if installation.current_operation_id is not None:
            current = await self.repository.get_operation(
                installation.current_operation_id,
                conn=conn,
                for_update=True,
            )
            if current is not None and current.state not in _TERMINAL_OPERATION_STATES:
                raise Conflict(error="PLUGIN_OPERATION_IN_PROGRESS")
        if kind == PluginOperationKind.RECOVER:
            if installation.lifecycle_state.value != "failed":
                raise Conflict(error="PLUGIN_RECOVERY_NOT_AVAILABLE")
            return
        if kind == PluginOperationKind.INSTALL and installation.installed_version is not None:
            raise Conflict(error="PLUGIN_ALREADY_INSTALLED")
        if kind != PluginOperationKind.INSTALL and installation.installed_version is None:
            raise Conflict(error="PLUGIN_NOT_INSTALLED")
        if kind == PluginOperationKind.UPGRADE and not item.has_update:
            raise Conflict(error="PLUGIN_UPDATE_NOT_AVAILABLE")
        if kind == PluginOperationKind.ROLLBACK and not installation.rollback_version:
            raise Conflict(error="PLUGIN_ROLLBACK_NOT_AVAILABLE")
        if kind == PluginOperationKind.ENABLE and installation.desired_enabled:
            raise Conflict(error="PLUGIN_ALREADY_ENABLED")
        if kind == PluginOperationKind.DISABLE and not installation.desired_enabled:
            raise Conflict(error="PLUGIN_ALREADY_DISABLED")
        if kind in {PluginOperationKind.DISABLE, PluginOperationKind.UNINSTALL} and item.name == "arclayer-core":
            raise Conflict(error="PLUGIN_REQUIRED_DEPENDENCY")
        if kind in {PluginOperationKind.DISABLE, PluginOperationKind.UNINSTALL}:
            if item.consumers.state.value == "unknown":
                raise Conflict(error="EXTENSION_CONSUMERS_UNVERIFIED")
            if item.consumers.consumers:
                raise Conflict(error="EXTENSION_CONSUMERS_ACTIVE")

    @staticmethod
    def _desired_enabled(*, installation: PluginInstallationRecord, kind: PluginOperationKind) -> bool:
        if kind == PluginOperationKind.ENABLE:
            return True
        if kind in {PluginOperationKind.INSTALL, PluginOperationKind.DISABLE, PluginOperationKind.UNINSTALL}:
            return False
        return bool(installation.desired_enabled)

    async def _validate_dependencies(
        self,
        *,
        item: SystemPluginCatalogItemOut,
        kind: PluginOperationKind,
        conn: BaseDBAsyncClient,
    ) -> None:
        if kind in {PluginOperationKind.INSTALL, PluginOperationKind.ENABLE, PluginOperationKind.RECOVER}:
            for dependency in item.dependencies:
                installation = await self.repository.get_installation(
                    dependency.extension_name,
                    conn=conn,
                    for_update=True,
                )
                if installation is None or installation.installed_version is None or not installation.desired_enabled:
                    raise Conflict(error="EXTENSION_DEPENDENCY_NOT_READY")
                if dependency.version_requirement is not None and not SpecifierSet(
                    dependency.version_requirement
                ).contains(
                    Version(installation.installed_version),
                    prereleases=True,
                ):
                    raise Conflict(error="EXTENSION_DEPENDENCY_VERSION_INCOMPATIBLE")
        if kind not in {PluginOperationKind.DISABLE, PluginOperationKind.UNINSTALL}:
            return
        dependents = await self.repository.list_installations()
        for dependent in dependents:
            if dependent.installed_version is None or not dependent.desired_enabled:
                continue
            for dependency in dependent.declared_dependencies:
                if isinstance(dependency, dict) and dependency.get("extension_name") == item.name:
                    raise Conflict(error="EXTENSION_DEPENDENTS_ACTIVE")

    @staticmethod
    def _resolve_target_version(
        *,
        item: SystemPluginCatalogItemOut,
        kind: PluginOperationKind,
        requested: str | None,
    ) -> str | None:
        if requested is not None and requested != item.available_version:
            raise Conflict(error="PLUGIN_VERSION_NOT_AVAILABLE")
        if kind == PluginOperationKind.UNINSTALL:
            return None
        return requested or item.available_version

    @staticmethod
    def _permission_diff(*, item: SystemPluginCatalogItemOut, approved: list[str]) -> dict[str, list[str]]:
        requested = set(item.permissions)
        previously_approved = set(item.approved_permissions)
        approved_set = set(approved)
        unexpected = approved_set - requested
        if unexpected:
            raise Conflict(error="PLUGIN_PERMISSION_APPROVAL_INVALID")
        return {
            "added": sorted(requested - previously_approved),
            "removed": sorted(previously_approved - requested),
            "approved": sorted((requested & previously_approved) | (requested & approved_set)),
        }

    @staticmethod
    def _validate_permission_review(
        *,
        kind: PluginOperationKind,
        permission_diff: dict[str, list[str]],
        submitted_permissions: list[str],
    ) -> None:
        if kind not in _PERMISSION_REVIEW_KINDS:
            if submitted_permissions:
                raise Conflict(error="PLUGIN_PERMISSION_APPROVAL_NOT_APPLICABLE")
            return
        unapproved = set(permission_diff["added"]) - set(permission_diff["approved"])
        if unapproved:
            raise Conflict(error="PLUGIN_PERMISSION_REVIEW_REQUIRED")


def _job_command(
    *,
    settings: Settings,
    operation: PluginOperationRecord,
    item: SystemPluginCatalogItemOut,
    artifact: PluginArtifactRecord | None,
    kind: PluginOperationKind,
    target_version: str | None,
    idempotency_key: str,
    actor_user_id: UUID,
) -> BackgroundJobCreate:
    definition = build_plugin_lifecycle_job_definition(
        execution_policy=settings.background_jobs.plugin_lifecycle,
    )
    job_input = PluginLifecycleJobInput(
        operation_id=operation.id,
        plugin_name=item.name,
        kind=kind,
        artifact_id=artifact.id if artifact is not None else None,
        source_type=(artifact.source_type if artifact is not None else PluginSourceType.BUNDLED),
        source_locator=artifact.source_locator if artifact is not None else item.source_locator,
        target_version=target_version,
        artifact_checksum=item.artifact_checksum,
        package_checksum=item.package_checksum,
        manifest_digest=item.manifest_digest,
        signer_fingerprint=artifact.signer_fingerprint if artifact is not None else None,
        requested_permissions=tuple(sorted(item.permissions)),
        approved_permissions=tuple(operation.approved_permissions),
        provided_capabilities=tuple(operation.provided_capabilities),
        desired_enabled=operation.desired_enabled,
    )
    target = PluginLifecycleJobTarget(operation_id=operation.id, plugin_name=item.name)
    trace = correlation_id.get(None)
    return BackgroundJobCreate(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        actor_user_id=actor_user_id,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=job_input.model_dump(mode="json", by_alias=True),
        idempotency_key=f"plugin:{item.name}:{kind}:{idempotency_key}",
        source_revision=build_plugin_lifecycle_source_revision(job_input),
        correlation_id=trace or f"system-plugin:{operation.id}",
        trace_id=trace,
        retry_class=definition.retry_class,
        max_attempts=definition.max_attempts,
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        status_key=definition.initial_status_key,
    )


def _provided_capabilities(item: SystemPluginCatalogItemOut) -> list[str]:
    return sorted({
        *item.provides.services,
        *item.provides.providers,
        *item.provides.connectors,
        *item.provides.middlewares,
        *item.provides.content_types,
    })
