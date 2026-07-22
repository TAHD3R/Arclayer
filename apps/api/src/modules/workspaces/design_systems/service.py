from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import orjson
from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.design_systems._enums import (
    DesignSystemValidationStatus,
    DesignSystemVersionStatus,
)
from src.models.design_systems.design_system import DesignSystemRecord
from src.models.design_systems.design_system_version import (
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestV1,
    build_design_system_manifest,
    compute_design_token_index_hash,
    normalize_design_system_name,
)
from src.modules.workspaces.design_systems.projection import (
    project_default,
    project_system_detail,
    project_system_summary,
    project_validation,
    project_version_detail,
    project_version_summary,
)
from src.modules.workspaces.design_systems.repository import WorkspaceDesignSystemsRepository
from src.modules.workspaces.design_systems.schema import (
    DesignSystemCreateRequest,
    DesignSystemCursorPage,
    DesignSystemDetailOut,
    DesignSystemSummaryOut,
    DesignSystemValidationCreateRequest,
    DesignSystemValidationResultOut,
    DesignSystemVersionCreateRequest,
    DesignSystemVersionDetailOut,
    DesignSystemVersionSummaryOut,
    WorkspaceDesignSystemDefaultOut,
    WorkspaceDesignSystemDefaultSetRequest,
    WorkspaceDesignSystemsCapabilitiesOut,
)
from src.modules.workspaces.design_systems.validator import validate_design_system_foundation

ActivityWriter = Callable[..., Awaitable[object]]

DESIGN_SYSTEM_CREATED = "workspace.design_system.created"
DESIGN_SYSTEM_VERSION_CREATED = "workspace.design_system.version.created"
DESIGN_SYSTEM_VALIDATED = "workspace.design_system.version.validated"
DESIGN_SYSTEM_DEFAULT_ASSIGNED = "workspace.design_system.default.assigned"


def workspace_design_system_capabilities() -> WorkspaceDesignSystemsCapabilitiesOut:
    return WorkspaceDesignSystemsCapabilitiesOut()


class WorkspaceDesignSystemsService(BaseService):
    def __init__(
        self,
        *,
        repository: WorkspaceDesignSystemsRepository,
        component_catalog_resolver: ComponentCatalogResolver,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._component_catalog_resolver = component_catalog_resolver
        self._activity_writer = activity_writer

    async def list_systems(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
    ) -> DesignSystemCursorPage[DesignSystemSummaryOut]:
        systems, next_cursor = await self._repository.list_systems(
            workspace_id=workspace_id,
            limit=limit,
            cursor=cursor,
            query=_optional_text(query),
        )
        counts = await self._repository.version_counts(
            workspace_id=workspace_id,
            system_ids=tuple(system.id for system in systems),
        )
        default = await self._repository.get_default(workspace_id=workspace_id)
        return DesignSystemCursorPage[DesignSystemSummaryOut](
            items=tuple(
                project_system_summary(
                    system,
                    version_count=counts.get(system.id, 0),
                    default=default,
                )
                for system in systems
            ),
            next_cursor=next_cursor,
        )

    def list_component_catalogs(self) -> tuple[ComponentCatalogV1, ...]:
        return self._component_catalog_resolver.list_catalogs()

    async def get_system(self, *, workspace_id: UUID, system_id: UUID) -> DesignSystemDetailOut:
        system = await self._require_system(workspace_id=workspace_id, system_id=system_id)
        counts = await self._repository.version_counts(workspace_id=workspace_id, system_ids=(system.id,))
        latest = await self._repository.get_latest_version(workspace_id=workspace_id, system_id=system.id)
        validations = await self._repository.latest_validations(
            workspace_id=workspace_id,
            version_ids=(latest.id,) if latest is not None else (),
        )
        states = await self._repository.version_states(
            workspace_id=workspace_id,
            version_ids=(latest.id,) if latest is not None else (),
        )
        default = await self._repository.get_default(workspace_id=workspace_id)
        return project_system_detail(
            system,
            version_count=counts.get(system.id, 0),
            default=default,
            latest_version=latest,
            latest_validation=validations.get(latest.id) if latest is not None else None,
            latest_version_state=_state_for(states, latest.id) if latest is not None else None,
        )

    async def create_system(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: DesignSystemCreateRequest,
    ) -> DesignSystemDetailOut:
        key = _require_idempotency_key(idempotency_key)
        normalized_name = normalize_design_system_name(payload.name)
        fingerprint = _fingerprint({"workspaceId": str(workspace_id), **payload.model_dump(mode="json")})
        try:
            async with self.tx() as conn:
                existing = await self._repository.get_system_by_idempotency_key(
                    workspace_id=workspace_id,
                    idempotency_key=key,
                    conn=conn,
                )
                if existing is not None:
                    _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                    system = existing
                else:
                    duplicate = await self._repository.get_system_by_name(
                        workspace_id=workspace_id,
                        normalized_name=normalized_name,
                        conn=conn,
                    )
                    if duplicate is not None:
                        _raise_name_conflict()
                    system = await self._repository.create_system(
                        values={
                            "workspace_id": workspace_id,
                            "owner_kind": "workspace",
                            "name": payload.name,
                            "normalized_name": normalized_name,
                            "description": payload.description,
                            "status": "active",
                            "metadata_revision": 1,
                            "created_by_user_id": actor_user_id,
                            "updated_by_user_id": actor_user_id,
                            "request_idempotency_key": key,
                            "request_fingerprint": fingerprint,
                        },
                        conn=conn,
                    )
                    await self._write_activity(
                        event_name=DESIGN_SYSTEM_CREATED,
                        organization_id=organization_id,
                        workspace_id=workspace_id,
                        actor_user_id=actor_user_id,
                        entity_type="design_system",
                        entity_id=system.id,
                        properties={"name": system.name},
                        conn=conn,
                    )
        except IntegrityError as exc:
            system = await self._resolve_system_create_race(
                workspace_id=workspace_id,
                key=key,
                fingerprint=fingerprint,
                normalized_name=normalized_name,
                error=exc,
            )
        return await self.get_system(workspace_id=workspace_id, system_id=system.id)

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> DesignSystemCursorPage[DesignSystemVersionSummaryOut]:
        await self._require_system(workspace_id=workspace_id, system_id=system_id)
        versions, next_cursor = await self._repository.list_versions(
            workspace_id=workspace_id,
            system_id=system_id,
            limit=limit,
            cursor=cursor,
        )
        validations = await self._repository.latest_validations(
            workspace_id=workspace_id,
            version_ids=tuple(version.id for version in versions),
        )
        states = await self._repository.version_states(
            workspace_id=workspace_id,
            version_ids=tuple(version.id for version in versions),
        )
        return DesignSystemCursorPage[DesignSystemVersionSummaryOut](
            items=tuple(
                project_version_summary(
                    version,
                    validation=validations.get(version.id),
                    lifecycle_state=_state_for(states, version.id),
                )
                for version in versions
            ),
            next_cursor=next_cursor,
        )

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
    ) -> DesignSystemVersionDetailOut:
        version = await self._require_version(
            workspace_id=workspace_id,
            system_id=system_id,
            version_id=version_id,
        )
        validations = await self._repository.latest_validations(
            workspace_id=workspace_id,
            version_ids=(version.id,),
        )
        state = await self._repository.get_version_state(
            workspace_id=workspace_id,
            version_id=version.id,
        )
        return project_version_detail(
            version,
            validation=validations.get(version.id),
            lifecycle_state=_require_state(state, version.id),
        )

    async def create_version(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        system_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: DesignSystemVersionCreateRequest,
    ) -> DesignSystemVersionDetailOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "systemId": str(system_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            system = await self._repository.get_system_for_update(
                workspace_id=workspace_id,
                system_id=system_id,
                conn=conn,
            )
            if system is None:
                _raise_not_found()
            existing = await self._repository.get_version_by_idempotency_key(
                system_id=system.id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                version = existing
            else:
                latest = await self._repository.get_latest_version(
                    workspace_id=workspace_id,
                    system_id=system.id,
                    conn=conn,
                )
                _validate_parent(payload=payload, latest=latest)
                manifest = build_design_system_manifest(payload.manifest)
                version = await self._repository.create_version(
                    values={
                        "design_system_id": system.id,
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
                await self._repository.create_version_state(
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
                await self._write_activity(
                    event_name=DESIGN_SYSTEM_VERSION_CREATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="design_system_version",
                    entity_id=version.id,
                    properties={
                        "designSystemId": str(system.id),
                        "versionNumber": version.version_number,
                        "manifestChecksum": version.manifest_checksum,
                    },
                    conn=conn,
                )
        return await self.get_version(workspace_id=workspace_id, system_id=system_id, version_id=version.id)

    async def create_validation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        system_id: UUID,
        version_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: DesignSystemValidationCreateRequest,
    ) -> DesignSystemValidationResultOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "systemId": str(system_id),
            "versionId": str(version_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            system = await self._repository.get_system_for_update(
                workspace_id=workspace_id,
                system_id=system_id,
                conn=conn,
            )
            if system is None:
                _raise_not_found()
            version = await self._repository.get_version(
                workspace_id=workspace_id,
                system_id=system.id,
                version_id=version_id,
                conn=conn,
            )
            if version is None:
                _raise_not_found()
            state = _require_state(
                await self._repository.get_version_state(
                    workspace_id=workspace_id,
                    version_id=version.id,
                    conn=conn,
                    for_update=True,
                ),
                version.id,
            )
            existing = await self._repository.get_validation_by_idempotency_key(
                version_id=version.id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                validation = existing
            else:
                _require_validation_transition_allowed(state)
                manifest = DesignSystemManifestV1.model_validate(version.manifest)
                outcome = validate_design_system_foundation(
                    manifest,
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
                state.status = DesignSystemVersionStatus(str(outcome.status))
                state.status_revision += 1
                state.status_changed_at = datetime.now(UTC)
                state.status_changed_by_user_id = actor_user_id
                await self._repository.save_version_state(
                    record=state,
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
                await self._write_activity(
                    event_name=DESIGN_SYSTEM_VALIDATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="design_system_version",
                    entity_id=version.id,
                    properties={
                        "designSystemId": str(system.id),
                        "status": str(outcome.status),
                        "findingHash": outcome.finding_hash,
                        "publishReady": False,
                    },
                    conn=conn,
                )
        return project_validation(validation)

    async def list_validations(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
    ) -> tuple[DesignSystemValidationResultOut, ...]:
        await self._require_version(workspace_id=workspace_id, system_id=system_id, version_id=version_id)
        records = await self._repository.list_validations(workspace_id=workspace_id, version_id=version_id)
        return tuple(project_validation(record) for record in records)

    async def get_default(self, *, workspace_id: UUID) -> WorkspaceDesignSystemDefaultOut | None:
        record = await self._repository.get_default(workspace_id=workspace_id)
        return project_default(record) if record is not None else None

    async def set_default(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: WorkspaceDesignSystemDefaultSetRequest,
    ) -> WorkspaceDesignSystemDefaultOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({"workspaceId": str(workspace_id), **payload.model_dump(mode="json")})
        async with self.tx() as conn:
            await self._repository.lock_workspace_systems(workspace_id=workspace_id, conn=conn)
            replay = await self._repository.get_default_command(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                _require_matching_fingerprint(replay.request_fingerprint, fingerprint)
                return WorkspaceDesignSystemDefaultOut.model_validate(replay.result_snapshot)
            system = await self._repository.get_system(
                workspace_id=workspace_id,
                system_id=payload.design_system_id,
                conn=conn,
            )
            version = await self._repository.get_version(
                workspace_id=workspace_id,
                system_id=payload.design_system_id,
                version_id=payload.version_id,
                conn=conn,
            )
            if system is None or version is None:
                _raise_not_found()
            if version.manifest_checksum != payload.expected_manifest_checksum:
                _raise_revision_conflict()
            validations = await self._repository.latest_validations(
                workspace_id=workspace_id,
                version_ids=(version.id,),
                conn=conn,
            )
            validation = validations.get(version.id)
            state = _require_state(
                await self._repository.get_version_state(
                    workspace_id=workspace_id,
                    version_id=version.id,
                    conn=conn,
                ),
                version.id,
            )
            _require_assignable_state(state)
            if (
                validation is None
                or str(validation.status) != DesignSystemValidationStatus.VALID.value
                or validation.finding_hash != payload.validation_finding_hash
            ):
                _raise_validation_required()
            default = await self._repository.get_default(
                workspace_id=workspace_id,
                conn=conn,
                for_update=True,
            )
            actual_revision = default.metadata_revision if default is not None else 0
            if actual_revision != payload.expected_revision:
                _raise_revision_conflict()
            if default is None:
                default = await self._repository.create_default(
                    values={
                        "workspace_id": workspace_id,
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
                default.design_system_id = system.id
                default.design_system_version_id = version.id
                default.manifest_checksum = version.manifest_checksum
                default.validation_finding_hash = validation.finding_hash
                default.metadata_revision += 1
                default.assigned_by_user_id = actor_user_id
                await self._repository.save_default(
                    record=default,
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
            result = project_default(default)
            await self._repository.create_default_command(
                values={
                    "workspace_id": workspace_id,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "result_snapshot": result.model_dump(mode="json", by_alias=True),
                    "actor_user_id": actor_user_id,
                },
                conn=conn,
            )
            await self._write_activity(
                event_name=DESIGN_SYSTEM_DEFAULT_ASSIGNED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="design_system",
                entity_id=system.id,
                properties={
                    "versionId": str(version.id),
                    "manifestChecksum": version.manifest_checksum,
                    "revision": default.metadata_revision,
                },
                conn=conn,
            )
            return result

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

    async def _require_system(self, *, workspace_id: UUID, system_id: UUID) -> DesignSystemRecord:
        record = await self._repository.get_system(workspace_id=workspace_id, system_id=system_id)
        if record is None:
            _raise_not_found()
        return record

    async def _require_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
    ) -> DesignSystemVersionRecord:
        record = await self._repository.get_version(
            workspace_id=workspace_id,
            system_id=system_id,
            version_id=version_id,
        )
        if record is None:
            _raise_not_found()
        return record

    async def _resolve_system_create_race(
        self,
        *,
        workspace_id: UUID,
        key: str,
        fingerprint: str,
        normalized_name: str,
        error: IntegrityError,
    ) -> DesignSystemRecord:
        replay = await self._repository.get_system_by_idempotency_key(
            workspace_id=workspace_id,
            idempotency_key=key,
        )
        if replay is not None:
            _require_matching_fingerprint(replay.request_fingerprint, fingerprint)
            return replay
        duplicate = await self._repository.get_system_by_name(
            workspace_id=workspace_id,
            normalized_name=normalized_name,
        )
        if duplicate is not None:
            _raise_name_conflict()
        raise error

    async def _write_activity(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        entity_type: str,
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
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                properties=properties,
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


def _require_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise BadRequest(t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_INVALID"), error="DESIGN_SYSTEM_IDEMPOTENCY_INVALID")
    return normalized


def _require_matching_fingerprint(actual: str, expected: str) -> None:
    if actual != expected:
        raise Conflict(
            t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"),
            error="DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT",
        )


def _optional_text(value: str | None) -> str | None:
    normalized = value.strip() if value is not None else ""
    return normalized or None


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "DESIGN_SYSTEM_NOT_FOUND"), error="DESIGN_SYSTEM_NOT_FOUND")


def _raise_name_conflict() -> NoReturn:
    raise Conflict(t("errors", "DESIGN_SYSTEM_NAME_CONFLICT"), error="DESIGN_SYSTEM_NAME_CONFLICT")


def _raise_revision_conflict() -> NoReturn:
    raise Conflict(t("errors", "DESIGN_SYSTEM_REVISION_CONFLICT"), error="DESIGN_SYSTEM_REVISION_CONFLICT")


def _raise_validation_required() -> NoReturn:
    raise Conflict(
        t("errors", "DESIGN_SYSTEM_VALIDATION_REQUIRED"),
        error="DESIGN_SYSTEM_VALIDATION_REQUIRED",
    )


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
            t("errors", "DESIGN_SYSTEM_VERSION_SUPERSEDED"),
            error="DESIGN_SYSTEM_VERSION_SUPERSEDED",
        )
    if str(state.status) == DesignSystemVersionStatus.ARCHIVED.value:
        raise Conflict(
            t("errors", "DESIGN_SYSTEM_LIFECYCLE_CONFLICT"),
            error="DESIGN_SYSTEM_LIFECYCLE_CONFLICT",
        )


def _require_assignable_state(state: DesignSystemVersionStateRecord) -> None:
    if str(state.status) == DesignSystemVersionStatus.SUPERSEDED.value:
        raise Conflict(
            t("errors", "DESIGN_SYSTEM_VERSION_SUPERSEDED"),
            error="DESIGN_SYSTEM_VERSION_SUPERSEDED",
        )
    if str(state.status) != DesignSystemVersionStatus.VALID.value:
        _raise_validation_required()
