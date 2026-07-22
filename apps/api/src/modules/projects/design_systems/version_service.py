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
    DesignSystemVersionSource,
    DesignSystemVersionStatus,
)
from src.models.design_systems.design_system import DesignSystemRecord
from src.models.design_systems.design_system_version import (
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.design_systems.concept_schema import (
    AgentDesignSystemConceptVersionCreate,
    DesignSystemConceptGenerationCandidateOut,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.schema import (
    ProjectDesignSystemComparisonOut,
    ProjectDesignSystemComparisonRequest,
    ProjectDesignSystemVersionPageOut,
)
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.workspaces.design_systems.diff import compare_design_system_manifests
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestV1,
    build_design_system_manifest,
    compute_design_token_index_hash,
)
from src.modules.workspaces.design_systems.projection import (
    project_validation,
    project_version_detail,
    project_version_summary,
)
from src.modules.workspaces.design_systems.schema import (
    DesignSystemValidationCreateRequest,
    DesignSystemValidationResultOut,
    DesignSystemVersionCreateRequest,
    DesignSystemVersionDetailOut,
)
from src.modules.workspaces.design_systems.validator import validate_design_system_foundation

ActivityWriter = Callable[..., Awaitable[object]]


class ProjectDesignSystemVersionService(BaseService):
    def __init__(
        self,
        *,
        repository: ProjectDesignSystemsRepository,
        component_catalog_resolver: ComponentCatalogResolver,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._component_catalog_resolver = component_catalog_resolver
        self._activity_writer = activity_writer

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        version_id: UUID,
    ) -> DesignSystemVersionDetailOut:
        async with self.tx() as conn:
            await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
            )
            version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=version_id,
                conn=conn,
            )
            validation = await self._repository.latest_validation(
                workspace_id=workspace_id,
                version_id=version.id,
                conn=conn,
            )
            lifecycle_state = _require_state(
                await self._repository.get_version_state(
                    workspace_id=workspace_id,
                    version_id=version.id,
                    conn=conn,
                ),
                version.id,
            )
        return project_version_detail(
            version,
            validation=validation,
            lifecycle_state=lifecycle_state,
        )

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> ProjectDesignSystemVersionPageOut:
        async with self.tx() as conn:
            system = await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
            )
            cursor_version = (
                await self._require_version(
                    workspace_id=workspace_id,
                    system_id=system_id,
                    version_id=cursor,
                    conn=conn,
                )
                if cursor is not None
                else None
            )
            versions, next_cursor = await self._repository.list_versions(
                workspace_id=workspace_id,
                system_id=system_id,
                limit=limit,
                cursor=cursor_version,
                conn=conn,
            )
            validations = await self._repository.latest_validations(
                workspace_id=workspace_id,
                version_ids=tuple(version.id for version in versions),
                conn=conn,
            )
            states = await self._repository.version_states(
                workspace_id=workspace_id,
                version_ids=tuple(version.id for version in versions),
                conn=conn,
            )
        return ProjectDesignSystemVersionPageOut(
            items=tuple(
                project_version_summary(
                    version,
                    validation=validations.get(version.id),
                    lifecycle_state=_state_for(states, version.id),
                )
                for version in versions
            ),
            next_cursor=next_cursor,
            system_metadata_revision=system.metadata_revision,
        )

    async def compare_versions(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        payload: ProjectDesignSystemComparisonRequest,
    ) -> ProjectDesignSystemComparisonOut:
        async with self.tx() as conn:
            await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
            )
            from_version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=payload.from_version_id,
                conn=conn,
            )
            to_version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=payload.to_version_id,
                conn=conn,
            )
            validations = await self._repository.latest_validations(
                workspace_id=workspace_id,
                version_ids=(from_version.id, to_version.id),
                conn=conn,
            )
            states = await self._repository.version_states(
                workspace_id=workspace_id,
                version_ids=(from_version.id, to_version.id),
                conn=conn,
            )
        diff = compare_design_system_manifests(
            DesignSystemManifestV1.model_validate(from_version.manifest),
            DesignSystemManifestV1.model_validate(to_version.manifest),
        )
        comparison_payload = {
            "fromVersionId": str(from_version.id),
            "fromChecksum": from_version.manifest_checksum,
            "toVersionId": str(to_version.id),
            "toChecksum": to_version.manifest_checksum,
            "diff": diff.model_dump(mode="json", by_alias=True),
        }
        comparison_hash = f"sha256:{_fingerprint(comparison_payload)}"
        return ProjectDesignSystemComparisonOut(
            from_version=project_version_summary(
                from_version,
                validation=validations.get(from_version.id),
                lifecycle_state=_state_for(states, from_version.id),
            ),
            to_version=project_version_summary(
                to_version,
                validation=validations.get(to_version.id),
                lifecycle_state=_state_for(states, to_version.id),
            ),
            comparison_hash=comparison_hash,
            diff=diff,
        )

    async def create_version(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        system_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: DesignSystemVersionCreateRequest,
    ) -> DesignSystemVersionDetailOut:
        key = _idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "systemId": str(system_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            await self._repository.lock_project(project_id=project_id, workspace_id=workspace_id, conn=conn)
            replay = await self._repository.get_command(project_id=project_id, idempotency_key=key, conn=conn)
            if replay is not None:
                _require_replay(replay.request_fingerprint, fingerprint)
                return DesignSystemVersionDetailOut.model_validate(replay.result_snapshot)
            await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
                for_update=True,
            )
            latest = await self._repository.get_latest_version(
                workspace_id=workspace_id,
                system_id=system_id,
                conn=conn,
            )
            _validate_parent(payload=payload, latest=latest)
            manifest = build_design_system_manifest(payload.manifest)
            version = await self._repository.create_version(
                values={
                    "design_system_id": system_id,
                    "workspace_id": workspace_id,
                    "version_number": 1 if latest is None else latest.version_number + 1,
                    "manifest_version": 1,
                    "manifest": manifest.model_dump(mode="json", by_alias=True),
                    "manifest_checksum": manifest.checksum,
                    "token_index_hash": compute_design_token_index_hash(manifest),
                    "component_catalog_version": manifest.component_catalog_version,
                    "schema_version": 1,
                    "parent_version_id": latest.id if latest is not None else None,
                    "source": "manual",
                    "provenance": {"source": "manual", "actorUserId": str(actor_user_id)},
                    "created_by_user_id": actor_user_id,
                    "correlation_id": correlation_id.get(None),
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            lifecycle_state = await self._repository.create_version_state(
                values={
                    "design_system_version_id": version.id,
                    "workspace_id": workspace_id,
                    "status": DesignSystemVersionStatus.CANDIDATE,
                    "status_revision": 1,
                    "status_changed_at": datetime.now(UTC),
                    "status_changed_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            result = project_version_detail(
                version,
                validation=None,
                lifecycle_state=lifecycle_state,
            )
            await self._record_command(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                kind="version.create",
                key=key,
                fingerprint=fingerprint,
                result=result.model_dump(mode="json", by_alias=True),
                conn=conn,
            )
            await self._activity(
                event_name="project.design_system.version.created",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                version=version,
                properties={"versionNumber": version.version_number},
                conn=conn,
            )
            return result

    async def create_validation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        system_id: UUID,
        version_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: DesignSystemValidationCreateRequest,
    ) -> DesignSystemValidationResultOut:
        key = _idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "systemId": str(system_id),
            "versionId": str(version_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            await self._repository.lock_project(project_id=project_id, workspace_id=workspace_id, conn=conn)
            replay = await self._repository.get_command(project_id=project_id, idempotency_key=key, conn=conn)
            if replay is not None:
                _require_replay(replay.request_fingerprint, fingerprint)
                return DesignSystemValidationResultOut.model_validate(replay.result_snapshot)
            system = await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
                for_update=True,
            )
            version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system.id,
                version_id=version_id,
                conn=conn,
            )
            lifecycle_state = _require_state(
                await self._repository.get_version_state(
                    workspace_id=workspace_id,
                    version_id=version.id,
                    conn=conn,
                    for_update=True,
                ),
                version.id,
            )
            _require_validation_transition_allowed(lifecycle_state)
            outcome = validate_design_system_foundation(
                DesignSystemManifestV1.model_validate(version.manifest),
                component_catalog_resolver=self._component_catalog_resolver,
            )
            validation = await self._repository.create_validation(
                values={
                    "design_system_version_id": version.id,
                    "workspace_id": workspace_id,
                    "profile": "foundation",
                    "validator_version": outcome.validator_version,
                    "status": outcome.status,
                    "findings": [item.model_dump(mode="json", by_alias=True) for item in outcome.findings],
                    "finding_hash": outcome.finding_hash,
                    "token_index_hash": outcome.token_index_hash,
                    "publish_ready": False,
                    "compatibility": outcome.compatibility,
                    "actor_user_id": actor_user_id,
                    "correlation_id": correlation_id.get(None),
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            lifecycle_state.status = DesignSystemVersionStatus(str(outcome.status))
            lifecycle_state.status_revision += 1
            lifecycle_state.status_changed_at = datetime.now(UTC)
            lifecycle_state.status_changed_by_user_id = actor_user_id
            await self._repository.save_version_state(
                record=lifecycle_state,
                update_fields=(
                    "status",
                    "status_revision",
                    "status_changed_at",
                    "status_changed_by_user_id",
                ),
                conn=conn,
            )
            await self._sync_latest_valid(
                system=system,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            result = project_validation(validation)
            await self._record_command(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                kind="version.validate",
                key=key,
                fingerprint=fingerprint,
                result=result.model_dump(mode="json", by_alias=True),
                conn=conn,
            )
            await self._activity(
                event_name="project.design_system.version.validated",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                version=version,
                properties={"status": str(outcome.status), "findingHash": outcome.finding_hash},
                conn=conn,
            )
            return result

    async def create_agent_concept_version(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        system_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: AgentDesignSystemConceptVersionCreate,
    ) -> DesignSystemConceptGenerationCandidateOut:
        key = _idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "systemId": str(system_id),
            **payload.model_dump(mode="json", by_alias=True),
        })
        async with self.tx() as conn:
            await self._repository.lock_project(project_id=project_id, workspace_id=workspace_id, conn=conn)
            replay = await self._repository.get_command(project_id=project_id, idempotency_key=key, conn=conn)
            if replay is not None:
                _require_replay(replay.request_fingerprint, fingerprint)
                return DesignSystemConceptGenerationCandidateOut.model_validate(replay.result_snapshot)
            system = await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
                for_update=True,
            )
            base_version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=payload.base_version_id,
                conn=conn,
            )
            if base_version.manifest_checksum != payload.expected_base_checksum:
                _raise_revision_conflict()
            version, lifecycle_state = await self._create_agent_concept_candidate(
                workspace_id=workspace_id,
                system_id=system_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                payload=payload,
                base_version=base_version,
                conn=conn,
            )
            validation = await self._validate_agent_concept_candidate(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                version=version,
                lifecycle_state=lifecycle_state,
                conn=conn,
            )
            await self._sync_latest_valid(system=system, actor_user_id=actor_user_id, conn=conn)
            result = DesignSystemConceptGenerationCandidateOut(
                candidate_index=payload.candidate_index,
                summary=payload.summary,
                version=project_version_detail(version, validation=validation, lifecycle_state=lifecycle_state),
                validation=project_validation(validation),
            )
            await self._record_command(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                kind="version.agent_concept",
                key=key,
                fingerprint=fingerprint,
                result=result.model_dump(mode="json", by_alias=True),
                conn=conn,
            )
            await self._activity(
                event_name="project.design_system.version.created",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                version=version,
                properties={
                    "versionNumber": version.version_number,
                    "source": DesignSystemVersionSource.AGENT.value,
                    "generationId": str(payload.generation_id),
                    "candidateIndex": payload.candidate_index,
                },
                conn=conn,
            )
            await self._activity(
                event_name="project.design_system.version.validated",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                version=version,
                properties={
                    "status": str(validation.status),
                    "findingHash": validation.finding_hash,
                    "generationId": str(payload.generation_id),
                    "candidateIndex": payload.candidate_index,
                },
                conn=conn,
            )
            return result

    async def _create_agent_concept_candidate(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        payload: AgentDesignSystemConceptVersionCreate,
        base_version: DesignSystemVersionRecord,
        conn: BaseDBAsyncClient,
    ) -> tuple[DesignSystemVersionRecord, DesignSystemVersionStateRecord]:
        latest = await self._repository.get_latest_version(
            workspace_id=workspace_id,
            system_id=system_id,
            conn=conn,
        )
        manifest = build_design_system_manifest(payload.manifest)
        version = await self._repository.create_version(
            values={
                "design_system_id": system_id,
                "workspace_id": workspace_id,
                "version_number": 1 if latest is None else latest.version_number + 1,
                "manifest_version": 1,
                "manifest": manifest.model_dump(mode="json", by_alias=True),
                "manifest_checksum": manifest.checksum,
                "token_index_hash": compute_design_token_index_hash(manifest),
                "component_catalog_version": manifest.component_catalog_version,
                "schema_version": 1,
                "parent_version_id": base_version.id,
                "source": DesignSystemVersionSource.AGENT,
                "provenance": {
                    "source": DesignSystemVersionSource.AGENT.value,
                    "agentRunId": str(payload.agent_run_id) if payload.agent_run_id is not None else None,
                    "agentId": str(payload.agent_id),
                    "agentVersionId": str(payload.agent_version_id),
                    "agentAssignmentId": str(payload.agent_assignment_id),
                    "generationId": str(payload.generation_id),
                    "candidateIndex": payload.candidate_index,
                    "summary": payload.summary,
                },
                "created_by_user_id": actor_user_id,
                "correlation_id": correlation_id.get(None),
                "request_idempotency_key": key,
                "request_fingerprint": fingerprint,
            },
            conn=conn,
        )
        lifecycle_state = await self._repository.create_version_state(
            values={
                "design_system_version_id": version.id,
                "workspace_id": workspace_id,
                "status": DesignSystemVersionStatus.CANDIDATE,
                "status_revision": 1,
                "status_changed_at": datetime.now(UTC),
                "status_changed_by_user_id": actor_user_id,
            },
            conn=conn,
        )
        return version, lifecycle_state

    async def _validate_agent_concept_candidate(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        version: DesignSystemVersionRecord,
        lifecycle_state: DesignSystemVersionStateRecord,
        conn: BaseDBAsyncClient,
    ):
        outcome = validate_design_system_foundation(
            DesignSystemManifestV1.model_validate(version.manifest),
            component_catalog_resolver=self._component_catalog_resolver,
        )
        validation = await self._repository.create_validation(
            values={
                "design_system_version_id": version.id,
                "workspace_id": workspace_id,
                "profile": "foundation",
                "validator_version": outcome.validator_version,
                "status": outcome.status,
                "findings": [item.model_dump(mode="json", by_alias=True) for item in outcome.findings],
                "finding_hash": outcome.finding_hash,
                "token_index_hash": outcome.token_index_hash,
                "publish_ready": False,
                "compatibility": outcome.compatibility,
                "actor_user_id": actor_user_id,
                "correlation_id": correlation_id.get(None),
                "request_idempotency_key": f"{key}:validation",
                "request_fingerprint": fingerprint,
            },
            conn=conn,
        )
        lifecycle_state.status = DesignSystemVersionStatus(str(outcome.status))
        lifecycle_state.status_revision += 1
        lifecycle_state.status_changed_at = datetime.now(UTC)
        lifecycle_state.status_changed_by_user_id = actor_user_id
        await self._repository.save_version_state(
            record=lifecycle_state,
            update_fields=("status", "status_revision", "status_changed_at", "status_changed_by_user_id"),
            conn=conn,
        )
        return validation

    async def _require_project_system(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> DesignSystemRecord:
        system = await self._repository.get_system(
            workspace_id=workspace_id,
            system_id=system_id,
            conn=conn,
            for_update=for_update,
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

    async def _sync_latest_valid(
        self,
        *,
        system: DesignSystemRecord,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        latest = await self._repository.get_latest_eligible_valid_version(
            workspace_id=system.workspace_id,
            system_id=system.id,
            conn=conn,
        )
        latest_id = latest.id if latest is not None else None
        if system.latest_valid_version_id == latest_id:
            return
        system.latest_valid_version_id = latest_id
        system.updated_by_user_id = actor_user_id
        system.metadata_revision += 1
        await self._repository.save_system(
            record=system,
            update_fields=("latest_valid_version_id", "updated_by_user_id", "metadata_revision"),
            conn=conn,
        )

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
        version: DesignSystemVersionRecord,
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
                entity_type="design_system_version",
                entity_id=version.id,
                properties={"designSystemId": str(version.design_system_id), **properties},
            ),
            conn=conn,
        )


def _validate_parent(
    *,
    payload: DesignSystemVersionCreateRequest,
    latest: DesignSystemVersionRecord | None,
) -> None:
    if latest is None:
        if payload.parent_version_id is not None or payload.expected_parent_checksum is not None:
            _raise_revision_conflict()
        return
    if payload.parent_version_id != latest.id or payload.expected_parent_checksum != latest.manifest_checksum:
        _raise_revision_conflict()


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


def _state_for(
    states: dict[UUID, DesignSystemVersionStateRecord],
    version_id: UUID,
) -> DesignSystemVersionStateRecord:
    return _require_state(states.get(version_id), version_id)


def _require_state(
    state: DesignSystemVersionStateRecord | None,
    version_id: UUID,
) -> DesignSystemVersionStateRecord:
    if state is None:
        raise RuntimeError(f"Design System version {version_id} is missing lifecycle state")
    return state


def _require_validation_transition_allowed(state: DesignSystemVersionStateRecord) -> None:
    if str(state.status) == DesignSystemVersionStatus.SUPERSEDED.value:
        raise Conflict(
            error="DESIGN_SYSTEM_VERSION_SUPERSEDED",
            message=t("errors", "DESIGN_SYSTEM_VERSION_SUPERSEDED"),
        )
    if str(state.status) == DesignSystemVersionStatus.ARCHIVED.value:
        raise Conflict(
            error="DESIGN_SYSTEM_LIFECYCLE_CONFLICT",
            message=t("errors", "DESIGN_SYSTEM_LIFECYCLE_CONFLICT"),
        )
