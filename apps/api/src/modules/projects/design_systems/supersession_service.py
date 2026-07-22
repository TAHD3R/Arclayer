from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import orjson
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
from src.models.design_systems.design_system import DesignSystemRecord
from src.models.design_systems.design_system_version import (
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.schema import (
    ProjectDesignSystemSupersessionOut,
    ProjectDesignSystemSupersessionRequest,
)
from src.modules.workspaces.design_systems.projection import project_version_summary

ActivityWriter = Callable[..., Awaitable[object]]


class ProjectDesignSystemSupersessionService(BaseService):
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

    async def supersede_version(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        system_id: UUID,
        target_version_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: ProjectDesignSystemSupersessionRequest,
    ) -> ProjectDesignSystemSupersessionOut:
        key = _idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "systemId": str(system_id),
            "targetVersionId": str(target_version_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            await self._repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            replay = await self._repository.get_command(
                project_id=project_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                _require_replay(replay.request_fingerprint, fingerprint)
                return ProjectDesignSystemSupersessionOut.model_validate(replay.result_snapshot)

            system = await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
            )
            if system.metadata_revision != payload.expected_system_revision:
                _raise_revision_conflict()

            target = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=target_version_id,
                conn=conn,
            )
            replacement = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=payload.replacement_version_id,
                conn=conn,
            )
            target_state = await self._require_state_for_update(
                workspace_id=workspace_id,
                version_id=target.id,
                conn=conn,
            )
            replacement_state = await self._require_state_for_update(
                workspace_id=workspace_id,
                version_id=replacement.id,
                conn=conn,
            )
            self._validate_target_state(target_state=target_state, payload=payload)
            await self._validate_replacement(
                workspace_id=workspace_id,
                target=target,
                replacement=replacement,
                replacement_state=replacement_state,
                expected_checksum=payload.expected_replacement_checksum,
                conn=conn,
            )
            if await self._repository.has_project_assignment_for_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=target.id,
                conn=conn,
            ):
                _raise_version_in_use()

            previous_latest_valid_version_id = system.latest_valid_version_id
            target_state.status = DesignSystemVersionStatus.SUPERSEDED
            target_state.status_revision += 1
            target_state.superseded_by_version_id = replacement.id
            target_state.status_changed_at = datetime.now(UTC)
            target_state.status_changed_by_user_id = actor_user_id
            await self._repository.save_version_state(
                record=target_state,
                update_fields=(
                    "status",
                    "status_revision",
                    "superseded_by_version_id",
                    "status_changed_at",
                    "status_changed_by_user_id",
                ),
                conn=conn,
            )

            latest = await self._repository.get_latest_eligible_valid_version(
                workspace_id=workspace_id,
                system_id=system.id,
                conn=conn,
            )
            system.latest_valid_version_id = latest.id if latest is not None else None
            system.metadata_revision += 1
            system.updated_by_user_id = actor_user_id
            await self._repository.save_system(
                record=system,
                update_fields=("latest_valid_version_id", "metadata_revision", "updated_by_user_id"),
                conn=conn,
            )

            validations = await self._repository.latest_validations(
                workspace_id=workspace_id,
                version_ids=(target.id, replacement.id),
                conn=conn,
            )
            result = ProjectDesignSystemSupersessionOut(
                target_version=project_version_summary(
                    target,
                    validation=validations.get(target.id),
                    lifecycle_state=target_state,
                ),
                replacement_version=project_version_summary(
                    replacement,
                    validation=validations.get(replacement.id),
                    lifecycle_state=replacement_state,
                ),
                previous_latest_valid_version_id=previous_latest_valid_version_id,
                current_latest_valid_version_id=system.latest_valid_version_id,
                system_metadata_revision=system.metadata_revision,
            )
            await self._record_command(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                result=result,
                conn=conn,
            )
            await self._write_activity(
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                system=system,
                target=target,
                replacement=replacement,
                previous_latest_valid_version_id=previous_latest_valid_version_id,
                conn=conn,
            )
            return result

    async def _require_project_system(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemRecord:
        system = await self._repository.get_system(
            workspace_id=workspace_id,
            system_id=system_id,
            conn=conn,
            for_update=True,
        )
        if (
            system is None
            or str(system.owner_kind) != DesignSystemOwnerKind.PROJECT.value
            or system.owning_project_id != project_id
        ):
            _raise_not_found()
        return system

    async def _require_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionRecord:
        version = await self._repository.get_version(
            workspace_id=workspace_id,
            system_id=system_id,
            version_id=version_id,
            conn=conn,
        )
        if version is None:
            _raise_not_found()
        return version

    async def _require_state_for_update(
        self,
        *,
        workspace_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionStateRecord:
        state = await self._repository.get_version_state(
            workspace_id=workspace_id,
            version_id=version_id,
            conn=conn,
            for_update=True,
        )
        if state is None:
            raise RuntimeError(f"Design System version {version_id} is missing lifecycle state")
        return state

    @staticmethod
    def _validate_target_state(
        *,
        target_state: DesignSystemVersionStateRecord,
        payload: ProjectDesignSystemSupersessionRequest,
    ) -> None:
        if str(target_state.status) == DesignSystemVersionStatus.SUPERSEDED.value:
            _raise_version_superseded()
        if str(target_state.status) == DesignSystemVersionStatus.ARCHIVED.value:
            _raise_lifecycle_conflict()
        if (
            str(target_state.status) != payload.expected_target_status
            or target_state.status_revision != payload.expected_target_status_revision
        ):
            _raise_lifecycle_conflict()

    async def _validate_replacement(
        self,
        *,
        workspace_id: UUID,
        target: DesignSystemVersionRecord,
        replacement: DesignSystemVersionRecord,
        replacement_state: DesignSystemVersionStateRecord,
        expected_checksum: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        if (
            replacement.id == target.id
            or replacement.version_number <= target.version_number
            or replacement.manifest_checksum != expected_checksum
            or str(replacement_state.status) != DesignSystemVersionStatus.VALID.value
        ):
            _raise_replacement_invalid()
        validation = await self._repository.latest_validation(
            workspace_id=workspace_id,
            version_id=replacement.id,
            conn=conn,
        )
        if validation is None or str(validation.status) != DesignSystemValidationStatus.VALID.value:
            _raise_replacement_invalid()

    async def _record_command(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        result: ProjectDesignSystemSupersessionOut,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repository.create_command(
            values={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "command_kind": "version.supersede",
                "request_idempotency_key": key,
                "request_fingerprint": fingerprint,
                "result_snapshot": result.model_dump(mode="json", by_alias=True),
                "actor_user_id": actor_user_id,
            },
            conn=conn,
        )

    async def _write_activity(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        system: DesignSystemRecord,
        target: DesignSystemVersionRecord,
        replacement: DesignSystemVersionRecord,
        previous_latest_valid_version_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="project.design_system.version.superseded",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                entity_type="design_system_version",
                entity_id=target.id,
                properties={
                    "designSystemId": str(system.id),
                    "replacementVersionId": str(replacement.id),
                    "previousLatestValidVersionId": (
                        str(previous_latest_valid_version_id) if previous_latest_valid_version_id is not None else None
                    ),
                    "currentLatestValidVersionId": (
                        str(system.latest_valid_version_id) if system.latest_valid_version_id is not None else None
                    ),
                    "systemMetadataRevision": system.metadata_revision,
                    "assignmentChanged": False,
                    "siteRevisionChanged": False,
                    "activeReleaseChanged": False,
                },
            ),
            conn=conn,
        )


def _fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _idempotency_key(value: str) -> str:
    key = value.strip()
    if not key:
        raise Conflict(
            error="DESIGN_SYSTEM_IDEMPOTENCY_INVALID",
            message=t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_INVALID"),
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


def _raise_version_superseded() -> NoReturn:
    raise Conflict(
        error="DESIGN_SYSTEM_VERSION_SUPERSEDED",
        message=t("errors", "DESIGN_SYSTEM_VERSION_SUPERSEDED"),
    )


def _raise_version_in_use() -> NoReturn:
    raise Conflict(
        error="DESIGN_SYSTEM_VERSION_IN_USE",
        message=t("errors", "DESIGN_SYSTEM_VERSION_IN_USE"),
    )


def _raise_replacement_invalid() -> NoReturn:
    raise Conflict(
        error="DESIGN_SYSTEM_SUPERSESSION_REPLACEMENT_INVALID",
        message=t("errors", "DESIGN_SYSTEM_SUPERSESSION_REPLACEMENT_INVALID"),
    )


def _raise_lifecycle_conflict() -> NoReturn:
    raise Conflict(
        error="DESIGN_SYSTEM_LIFECYCLE_CONFLICT",
        message=t("errors", "DESIGN_SYSTEM_LIFECYCLE_CONFLICT"),
    )
