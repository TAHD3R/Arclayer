from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import orjson
from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.design_systems._enums import (
    DesignSystemOwnerKind,
    DesignSystemValidationStatus,
    DesignSystemVersionStatus,
)
from src.models.design_systems.design_system import (
    DesignSystemRecord,
    ProjectDesignSystemAssignmentRecord,
)
from src.models.design_systems.design_system_version import (
    DesignSystemValidationResultRecord,
    DesignSystemVersionRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.schema import (
    ProjectDesignSystemAssignmentOut,
    ProjectDesignSystemAssignmentResultOut,
    ProjectDesignSystemAssignmentSetRequest,
    ProjectDesignSystemForkOut,
    ProjectDesignSystemForkRequest,
)
from src.modules.workspaces.design_systems.manifest import normalize_design_system_name

ActivityWriter = Callable[..., Awaitable[object]]


class ProjectDesignSystemsService(BaseService):
    def __init__(
        self,
        *,
        repository: ProjectDesignSystemsRepository,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._activity_writer = activity_writer

    async def get_assignment(self, *, project_id: UUID) -> ProjectDesignSystemAssignmentOut | None:
        record = await self._repository.get_assignment(project_id=project_id)
        if record is None:
            return None
        async with self.tx() as conn:
            system = await self._repository.get_system(
                workspace_id=record.workspace_id,
                system_id=record.design_system_id,
                conn=conn,
            )
        if system is None:
            _raise_not_found()
        return _project_assignment(record, system)

    async def set_assignment(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: ProjectDesignSystemAssignmentSetRequest,
    ) -> ProjectDesignSystemAssignmentResultOut:
        key = _idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            await self._repository.lock_project(project_id=project_id, workspace_id=workspace_id, conn=conn)
            replay = await self._repository.get_command(project_id=project_id, idempotency_key=key, conn=conn)
            if replay is not None:
                _require_replay(replay.request_fingerprint, fingerprint)
                return ProjectDesignSystemAssignmentResultOut.model_validate(replay.result_snapshot)
            system, version, validation = await self._require_exact_source(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=payload.design_system_id,
                version_id=payload.version_id,
                checksum=payload.expected_manifest_checksum,
                finding_hash=payload.validation_finding_hash,
                conn=conn,
            )
            current = await self._repository.get_assignment(project_id=project_id, conn=conn, for_update=True)
            actual_revision = current.metadata_revision if current is not None else 0
            if actual_revision != payload.expected_revision:
                _raise_revision_conflict()
            previous_system = (
                await self._repository.get_system(
                    workspace_id=workspace_id,
                    system_id=current.design_system_id,
                    conn=conn,
                )
                if current is not None
                else None
            )
            if current is not None and previous_system is None:
                _raise_not_found()
            previous = (
                _project_assignment(current, previous_system)
                if current is not None and previous_system is not None
                else None
            )
            if current is None:
                current = await self._repository.create_assignment(
                    values={
                        "workspace_id": workspace_id,
                        "project_id": project_id,
                        "design_system_id": system.id,
                        "design_system_version_id": version.id,
                        "manifest_checksum": version.manifest_checksum,
                        "validation_finding_hash": validation.finding_hash,
                        "metadata_revision": 1,
                        "assigned_by_user_id": actor_user_id,
                    },
                    conn=conn,
                )
            else:
                current.design_system_id = system.id
                current.design_system_version_id = version.id
                current.manifest_checksum = version.manifest_checksum
                current.validation_finding_hash = validation.finding_hash
                current.metadata_revision += 1
                current.assigned_by_user_id = actor_user_id
                await self._repository.save_assignment(
                    record=current,
                    update_fields=(
                        "design_system_id",
                        "design_system_version_id",
                        "manifest_checksum",
                        "validation_finding_hash",
                        "metadata_revision",
                        "assigned_by_user_id",
                    ),
                    conn=conn,
                )
            result = ProjectDesignSystemAssignmentResultOut(
                previous=previous,
                current=_project_assignment(current, system),
            )
            await self._record_command(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                kind="assign",
                key=key,
                fingerprint=fingerprint,
                result=result.model_dump(mode="json", by_alias=True),
                conn=conn,
            )
            await self._activity(
                event_name="project.design_system.assigned",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                entity_id=current.id,
                properties={
                    "designSystemId": str(system.id),
                    "versionId": str(version.id),
                    "metadataRevision": current.metadata_revision,
                    "activeReleaseChanged": False,
                    "siteRevisionChanged": False,
                },
                conn=conn,
            )
            return result

    async def fork(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: ProjectDesignSystemForkRequest,
    ) -> ProjectDesignSystemForkOut:
        key = _idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            await self._repository.lock_project(project_id=project_id, workspace_id=workspace_id, conn=conn)
            replay = await self._repository.get_command(project_id=project_id, idempotency_key=key, conn=conn)
            if replay is not None:
                _require_replay(replay.request_fingerprint, fingerprint)
                return ProjectDesignSystemForkOut.model_validate(replay.result_snapshot)
            source, source_version, validation = await self._require_exact_source(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=payload.source_design_system_id,
                version_id=payload.source_version_id,
                checksum=payload.expected_source_checksum,
                finding_hash=payload.validation_finding_hash,
                conn=conn,
            )
            normalized_name = normalize_design_system_name(payload.name)
            if (
                await self._repository.get_system_by_name(
                    workspace_id=workspace_id, normalized_name=normalized_name, conn=conn
                )
                is not None
            ):
                raise Conflict(error="DESIGN_SYSTEM_NAME_CONFLICT", message=t("errors", "DESIGN_SYSTEM_NAME_CONFLICT"))
            command_token = hashlib.sha256(f"{project_id}:{key}".encode()).hexdigest()
            system = await self._repository.create_system(
                values={
                    "workspace_id": workspace_id,
                    "owner_kind": DesignSystemOwnerKind.PROJECT,
                    "owning_project_id": project_id,
                    "forked_from_system_id": source.id,
                    "forked_from_version_id": source_version.id,
                    "forked_from_manifest_checksum": source_version.manifest_checksum,
                    "name": payload.name,
                    "normalized_name": normalized_name,
                    "description": payload.description,
                    "status": "active",
                    "metadata_revision": 1,
                    "created_by_user_id": actor_user_id,
                    "updated_by_user_id": actor_user_id,
                    "request_idempotency_key": f"fork:{command_token}",
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            version = await self._repository.create_version(
                values={
                    "design_system_id": system.id,
                    "workspace_id": workspace_id,
                    "version_number": 1,
                    "manifest_version": source_version.manifest_version,
                    "manifest": source_version.manifest,
                    "manifest_checksum": source_version.manifest_checksum,
                    "token_index_hash": source_version.token_index_hash,
                    "component_catalog_version": source_version.component_catalog_version,
                    "schema_version": source_version.schema_version,
                    "parent_version_id": source_version.id,
                    "source": "fork",
                    "provenance": {
                        "source": "fork",
                        "sourceDesignSystemId": str(source.id),
                        "sourceVersionId": str(source_version.id),
                        "sourceManifestChecksum": source_version.manifest_checksum,
                    },
                    "created_by_user_id": actor_user_id,
                    "correlation_id": correlation_id.get(None),
                    "request_idempotency_key": f"fork:{command_token}",
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            copied_validation = await self._repository.create_validation(
                values={
                    "design_system_version_id": version.id,
                    "workspace_id": workspace_id,
                    "profile": validation.profile,
                    "validator_version": validation.validator_version,
                    "status": validation.status,
                    "findings": validation.findings,
                    "finding_hash": validation.finding_hash,
                    "token_index_hash": validation.token_index_hash,
                    "publish_ready": False,
                    "compatibility": validation.compatibility,
                    "actor_user_id": actor_user_id,
                    "correlation_id": correlation_id.get(None),
                    "request_idempotency_key": f"fork:{command_token}",
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            await self._repository.create_version_state(
                values={
                    "design_system_version_id": version.id,
                    "workspace_id": workspace_id,
                    "status": DesignSystemVersionStatus.VALID,
                    "status_revision": 1,
                    "status_changed_at": datetime.now(UTC),
                    "status_changed_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            system.latest_valid_version_id = version.id
            await self._repository.save_system(
                record=system,
                update_fields=("latest_valid_version_id",),
                conn=conn,
            )
            result = ProjectDesignSystemForkOut(
                project_id=project_id,
                design_system_id=system.id,
                version_id=version.id,
                manifest_checksum=version.manifest_checksum,
                validation_finding_hash=copied_validation.finding_hash,
                source_design_system_id=source.id,
                source_version_id=source_version.id,
                source_manifest_checksum=source_version.manifest_checksum,
            )
            await self._record_command(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                kind="fork",
                key=key,
                fingerprint=fingerprint,
                result=result.model_dump(mode="json", by_alias=True),
                conn=conn,
            )
            await self._activity(
                event_name="project.design_system.forked",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                entity_id=system.id,
                properties={
                    "sourceDesignSystemId": str(source.id),
                    "sourceVersionId": str(source_version.id),
                    "versionId": str(version.id),
                    "manifestChecksum": version.manifest_checksum,
                },
                conn=conn,
            )
            return result

    async def _require_exact_source(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        version_id: UUID,
        checksum: str,
        finding_hash: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[DesignSystemRecord, DesignSystemVersionRecord, DesignSystemValidationResultRecord]:
        system = await self._repository.get_system(workspace_id=workspace_id, system_id=system_id, conn=conn)
        if system is None or not _system_available_to_project(system, project_id):
            _raise_not_found()
        version = await self._repository.get_version(
            workspace_id=workspace_id, system_id=system.id, version_id=version_id, conn=conn
        )
        if version is None:
            _raise_not_found()
        if version.manifest_checksum != checksum:
            _raise_revision_conflict()
        lifecycle_state = await self._repository.get_version_state(
            workspace_id=workspace_id,
            version_id=version.id,
            conn=conn,
        )
        if lifecycle_state is None:
            raise RuntimeError(f"Design System version {version.id} is missing lifecycle state")
        if str(lifecycle_state.status) == DesignSystemVersionStatus.SUPERSEDED.value:
            raise Conflict(
                error="DESIGN_SYSTEM_VERSION_SUPERSEDED",
                message=t("errors", "DESIGN_SYSTEM_VERSION_SUPERSEDED"),
            )
        if str(lifecycle_state.status) != DesignSystemVersionStatus.VALID.value:
            raise Conflict(
                error="DESIGN_SYSTEM_VALIDATION_REQUIRED",
                message=t("errors", "DESIGN_SYSTEM_VALIDATION_REQUIRED"),
            )
        validation = await self._repository.latest_validation(
            workspace_id=workspace_id, version_id=version.id, conn=conn
        )
        if (
            validation is None
            or str(validation.status) != DesignSystemValidationStatus.VALID.value
            or validation.finding_hash != finding_hash
        ):
            raise Conflict(
                error="DESIGN_SYSTEM_VALIDATION_REQUIRED",
                message=t("errors", "DESIGN_SYSTEM_VALIDATION_REQUIRED"),
            )
        return system, version, validation

    async def _record_command(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        kind: str,
        key: str,
        fingerprint: str,
        result: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repository.create_command(
            values={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "command_kind": kind,
                "request_idempotency_key": key,
                "request_fingerprint": fingerprint,
                "result_snapshot": result,
                "actor_user_id": actor_user_id,
            },
            conn=conn,
        )

    async def _activity(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        entity_id: UUID,
        properties: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                entity_type="design_system",
                entity_id=entity_id,
                properties=properties,
            ),
            conn=conn,
        )


def _project_assignment(
    record: ProjectDesignSystemAssignmentRecord,
    system: DesignSystemRecord,
) -> ProjectDesignSystemAssignmentOut:
    return ProjectDesignSystemAssignmentOut(
        project_id=record.project_id,
        design_system_id=record.design_system_id,
        version_id=record.design_system_version_id,
        manifest_checksum=record.manifest_checksum,
        validation_finding_hash=record.validation_finding_hash,
        metadata_revision=record.metadata_revision,
        owner_kind=str(system.owner_kind),
        assigned_at=record.updated_at,
    )


def _system_available_to_project(system: DesignSystemRecord, project_id: UUID) -> bool:
    return (str(system.owner_kind) == DesignSystemOwnerKind.WORKSPACE.value and system.owning_project_id is None) or (
        str(system.owner_kind) == DesignSystemOwnerKind.PROJECT.value and system.owning_project_id == project_id
    )


def _fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _idempotency_key(value: str) -> str:
    key = value.strip()
    if not key:
        raise Conflict(
            error="DESIGN_SYSTEM_IDEMPOTENCY_INVALID", message=t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_INVALID")
        )
    return key


def _require_replay(actual: str, expected: str) -> None:
    if actual != expected:
        raise Conflict(
            error="DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT",
            message=t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"),
        )


def _raise_not_found() -> NoReturn:
    raise NotFound(error="DESIGN_SYSTEM_NOT_FOUND", message=t("errors", "DESIGN_SYSTEM_NOT_FOUND"))


def _raise_revision_conflict() -> NoReturn:
    raise Conflict(error="DESIGN_SYSTEM_REVISION_CONFLICT", message=t("errors", "DESIGN_SYSTEM_REVISION_CONFLICT"))
