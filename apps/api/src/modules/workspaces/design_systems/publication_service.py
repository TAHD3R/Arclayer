from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

import orjson
from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.design_systems._enums import DesignSystemValidationStatus, DesignSystemVersionStatus
from src.models.design_systems.publication import DesignSystemArtifactRecord, DesignSystemPublicationRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1
from src.modules.workspaces.design_systems.publication_assets import (
    DesignSystemAssetPinningError,
    DesignSystemAssetPinResolver,
    design_system_asset_pins_hash,
)
from src.modules.workspaces.design_systems.publication_compiler import (
    DESIGN_SYSTEM_COMPILER_VERSION,
    DESIGN_SYSTEM_RENDERER_PROFILE,
    DESIGN_SYSTEM_RENDERER_VERSION,
    design_system_artifact_input_hash,
)
from src.modules.workspaces.design_systems.publication_contract import (
    DESIGN_SYSTEM_COMPILE_JOB_TYPE,
    DESIGN_SYSTEM_COMPILE_JOB_TYPE_VERSION,
    DesignSystemCompileJobInput,
    DesignSystemCompileJobTarget,
)
from src.modules.workspaces.design_systems.publication_projection import project_publication
from src.modules.workspaces.design_systems.publication_repository import DesignSystemPublicationRepository
from src.modules.workspaces.design_systems.publication_schema import (
    WorkspaceDesignSystemPublicationCreateRequest,
    WorkspaceDesignSystemPublicationOut,
)
from src.modules.workspaces.design_systems.repository import WorkspaceDesignSystemsRepository

ActivityWriter = Callable[..., Awaitable[object]]
DESIGN_SYSTEM_PUBLICATION_REQUESTED = "workspace.design_system.publication.requested"


class DesignSystemPublicationService(BaseService):
    def __init__(
        self,
        *,
        repository: WorkspaceDesignSystemsRepository,
        publications: DesignSystemPublicationRepository,
        assets: DesignSystemAssetPinResolver,
        jobs: BackgroundJobService,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._publications = publications
        self._assets = assets
        self._jobs = jobs
        self._activity_writer = activity_writer

    async def request_publication(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        system_id: UUID,
        version_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: WorkspaceDesignSystemPublicationCreateRequest,
    ) -> WorkspaceDesignSystemPublicationOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "systemId": str(system_id),
            "versionId": str(version_id),
            "actorUserId": str(actor_user_id),
            **payload.model_dump(mode="json", by_alias=True),
        })
        publication_id = uuid4()
        job_result: BackgroundJobCreateResult | None = None
        try:
            async with self.tx() as conn:
                publication, artifact, job_result = await self._request_in_transaction(
                    workspace_id=workspace_id,
                    organization_id=organization_id,
                    system_id=system_id,
                    version_id=version_id,
                    actor_user_id=actor_user_id,
                    idempotency_key=key,
                    fingerprint=fingerprint,
                    publication_id=publication_id,
                    payload=payload,
                    conn=conn,
                )
        except IntegrityError:
            publication = await self._publications.get_publication(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=version_id,
            )
            if publication is None:
                raise
            _require_replay(publication=publication, key=key, fingerprint=fingerprint)
            artifact = await self._publications.get_artifact_for_publication(publication_id=publication.id)
            if artifact is None:
                raise RuntimeError("DESIGN_SYSTEM_PUBLICATION_ARTIFACT_INVARIANT_INVALID")
            return project_publication(publication=publication, artifact=artifact)
        if job_result is not None:
            await self._jobs.publish_created_after_commit(job_result)
        return project_publication(publication=publication, artifact=artifact)

    async def _request_in_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        system_id: UUID,
        version_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        publication_id: UUID,
        payload: WorkspaceDesignSystemPublicationCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> tuple[DesignSystemPublicationRecord, DesignSystemArtifactRecord, BackgroundJobCreateResult | None]:
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
        state = await self._repository.get_version_state(
            workspace_id=workspace_id,
            version_id=version.id,
            conn=conn,
            for_update=True,
        )
        if state is None:
            raise RuntimeError("DESIGN_SYSTEM_LIFECYCLE_STATE_MISSING")
        existing = await self._publications.get_publication(
            workspace_id=workspace_id,
            system_id=system.id,
            version_id=version.id,
            conn=conn,
            for_update=True,
        )
        if existing is not None:
            _require_replay(publication=existing, key=idempotency_key, fingerprint=fingerprint)
            artifact = await self._publications.get_artifact_for_publication(publication_id=existing.id, conn=conn)
            if artifact is None:
                raise RuntimeError("DESIGN_SYSTEM_PUBLICATION_ARTIFACT_INVARIANT_INVALID")
            return existing, artifact, None
        _require_publication_base(version_checksum=version.manifest_checksum, state=state, payload=payload)
        validation = (
            await self._repository.latest_validations(
                workspace_id=workspace_id,
                version_ids=(version.id,),
                conn=conn,
            )
        ).get(version.id)
        if (
            validation is None
            or str(validation.status) != DesignSystemValidationStatus.VALID.value
            or validation.finding_hash != payload.expected_validation_finding_hash
        ):
            _raise_validation_blocked()
        manifest = DesignSystemManifestV1.model_validate(version.manifest)
        try:
            asset_pins = await self._assets.resolve(workspace_id=workspace_id, manifest=manifest, conn=conn)
        except DesignSystemAssetPinningError as error:
            raise Conflict(t("errors", "DESIGN_SYSTEM_ASSET_INVALID"), error="DESIGN_SYSTEM_ASSET_INVALID") from error
        asset_pins_hash = design_system_asset_pins_hash(asset_pins)
        artifact_input_hash = design_system_artifact_input_hash(
            manifest_checksum=version.manifest_checksum,
            validation_finding_hash=validation.finding_hash,
            validator_version=validation.validator_version,
            asset_pins=asset_pins,
            component_catalog_version=version.component_catalog_version,
            compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
            renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
            renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
        )
        job_result = await self._jobs.create_job_in_transaction(
            command=self._job_command(
                workspace_id=workspace_id,
                system_id=system.id,
                version_id=version.id,
                actor_user_id=actor_user_id,
                publication_id=publication_id,
                manifest_checksum=version.manifest_checksum,
                component_catalog_version=version.component_catalog_version,
                validation_finding_hash=validation.finding_hash,
                validator_version=validation.validator_version,
                asset_pins_hash=asset_pins_hash,
            ),
            conn=conn,
        )
        publication = await self._publications.create_publication(
            values={
                "id": publication_id,
                "design_system_version_id": version.id,
                "workspace_id": workspace_id,
                "design_system_id": system.id,
                "manifest_checksum": version.manifest_checksum,
                "validation_finding_hash": validation.finding_hash,
                "validator_version": validation.validator_version,
                "status": "pending",
                "job_id": job_result.job.id,
                "component_catalog_version": version.component_catalog_version,
                "compiler_version": DESIGN_SYSTEM_COMPILER_VERSION,
                "renderer_profile": DESIGN_SYSTEM_RENDERER_PROFILE,
                "renderer_version": DESIGN_SYSTEM_RENDERER_VERSION,
                "asset_pins": [pin.model_dump(mode="json", by_alias=True) for pin in asset_pins],
                "asset_pins_hash": asset_pins_hash,
                "actor_user_id": actor_user_id,
                "correlation_id": correlation_id.get(None),
                "request_idempotency_key": idempotency_key,
                "request_fingerprint": fingerprint,
            },
            conn=conn,
        )
        artifact = await self._publications.create_artifact(
            values={
                "publication_id": publication.id,
                "design_system_version_id": version.id,
                "workspace_id": workspace_id,
                "design_system_id": system.id,
                "manifest_checksum": version.manifest_checksum,
                "validation_finding_hash": validation.finding_hash,
                "validator_version": validation.validator_version,
                "artifact_input_hash": artifact_input_hash,
                "status": "pending",
                "compiler_version": DESIGN_SYSTEM_COMPILER_VERSION,
                "renderer_profile": DESIGN_SYSTEM_RENDERER_PROFILE,
                "renderer_version": DESIGN_SYSTEM_RENDERER_VERSION,
                "component_catalog_version": version.component_catalog_version,
                "asset_pins": [pin.model_dump(mode="json", by_alias=True) for pin in asset_pins],
            },
            conn=conn,
        )
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=DESIGN_SYSTEM_PUBLICATION_REQUESTED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="design_system_version",
                entity_id=version.id,
                properties={
                    "designSystemId": str(system.id),
                    "manifestChecksum": version.manifest_checksum,
                    "publicationId": str(publication.id),
                    "artifactInputHash": artifact_input_hash,
                    "jobId": str(job_result.job.id),
                },
            ),
            conn=conn,
        )
        return publication, artifact, job_result

    def _job_command(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
        actor_user_id: UUID,
        publication_id: UUID,
        manifest_checksum: str,
        component_catalog_version: str | None,
        validation_finding_hash: str,
        validator_version: int,
        asset_pins_hash: str,
    ) -> BackgroundJobCreate:
        definition = self._jobs.registry.require(
            job_type=DESIGN_SYSTEM_COMPILE_JOB_TYPE,
            job_type_version=DESIGN_SYSTEM_COMPILE_JOB_TYPE_VERSION,
        )
        target = DesignSystemCompileJobTarget(
            workspace_id=workspace_id,
            design_system_id=system_id,
            version_id=version_id,
        )
        input_reference = DesignSystemCompileJobInput(
            publication_id=publication_id,
            manifest_checksum=manifest_checksum,
            validation_finding_hash=validation_finding_hash,
            validator_version=validator_version,
            component_catalog_version=component_catalog_version,
            compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
            renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
            renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
            asset_pins_hash=asset_pins_hash,
        )
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=definition.authority_mode,
            workspace_id=workspace_id,
            project_id=None,
            site_id=None,
            actor_user_id=actor_user_id,
            target_descriptor=target.model_dump(mode="json", by_alias=True),
            input_reference=input_reference.model_dump(mode="json", by_alias=True),
            idempotency_key=f"design-system-publication:{system_id}:{version_id}",
            source_revision=manifest_checksum,
            correlation_id=correlation_id.get(None) or publication_id.hex,
            trace_id=correlation_id.get(None),
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )


def _require_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise Conflict(t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"), error="DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT")
    return normalized


def _fingerprint(payload: object) -> str:
    return hashlib.sha256(orjson.dumps(payload, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _require_replay(*, publication, key: str, fingerprint: str) -> None:
    if publication.request_idempotency_key != key or publication.request_fingerprint != fingerprint:
        raise Conflict(t("errors", "DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT"), error="DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT")


def _require_publication_base(
    *, version_checksum: str, state, payload: WorkspaceDesignSystemPublicationCreateRequest
) -> None:
    if (
        version_checksum != payload.expected_manifest_checksum
        or state.status_revision != payload.expected_status_revision
    ):
        raise Conflict(t("errors", "DESIGN_SYSTEM_REVISION_CONFLICT"), error="DESIGN_SYSTEM_REVISION_CONFLICT")
    if str(state.status) != DesignSystemVersionStatus.VALID.value:
        _raise_validation_blocked()


def _raise_not_found() -> None:
    raise NotFound(t("errors", "DESIGN_SYSTEM_NOT_FOUND"), error="DESIGN_SYSTEM_NOT_FOUND")


def _raise_validation_blocked() -> None:
    raise Conflict(t("errors", "DESIGN_SYSTEM_VALIDATION_BLOCKED"), error="DESIGN_SYSTEM_VALIDATION_BLOCKED")
