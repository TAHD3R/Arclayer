from __future__ import annotations

from hashlib import sha256
from typing import cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.builder.composition_saga import BuilderCompositionSagaRecord
from src.models.builder.generation import BuilderGenerationRecord
from src.models.builder.site_revision import SiteRevisionManifestRecord
from src.models.jobs.background_job import JobAuthorityMode
from src.modules.ai.agent_tool_grants import BUILDER_WIREFRAME_GENERATE_TOOL
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.command import builder_request_fingerprint
from src.modules.projects.builder.generation_authority import ResolvedBuilderGenerationAuthority
from src.modules.projects.builder.generation_context import resolve_wireframe_generation_context
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
    BuilderGenerationJobTarget,
    BuilderWireframeGenerationJobInput,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver


class BuilderCompositionChildCreation(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    generation: BuilderGenerationRecord
    job_result: BackgroundJobCreateResult


class BuilderCompositionChildCreator:
    def __init__(
        self,
        *,
        generation_repository: BuilderGenerationRepository,
        builder_repository: SiteBuilderRepository,
        design_system_repository: ProjectDesignSystemsRepository,
        component_catalog_resolver: ComponentCatalogResolver,
        settings: Settings,
        job_service: BackgroundJobService | None = None,
    ) -> None:
        self._generations = generation_repository
        self._builder_repository = builder_repository
        self._design_system_repository = design_system_repository
        self._component_catalog_resolver = component_catalog_resolver
        self._settings = settings
        self._jobs = job_service or BackgroundJobService(settings)

    async def create_in_transaction(
        self,
        *,
        organization_id: UUID,
        saga: BuilderCompositionSagaRecord,
        revision: SiteRevisionManifestRecord,
        authority: ResolvedBuilderGenerationAuthority,
        conn: BaseDBAsyncClient,
    ) -> BuilderCompositionChildCreation:
        targets = tuple(BuilderGenerationTargetV1.model_validate(value) for value in saga.targets)
        composition_context = await resolve_wireframe_generation_context(
            builder_repository=self._builder_repository,
            design_system_repository=self._design_system_repository,
            component_catalog_resolver=self._component_catalog_resolver,
            workspace_id=saga.workspace_id,
            project_id=saga.project_id,
            builder_context=authority.builder_context,
            targets=targets,
            conn=conn,
        )
        generation_id = _composition_generation_identity(saga.id)
        request_fingerprint = _composition_request_fingerprint(
            saga=saga,
            revision=revision,
            generation_id=generation_id,
        )
        job_result = await self._jobs.create_job_in_transaction(
            command=self._job_command(
                saga=saga,
                revision=revision,
                generation_id=generation_id,
                request_fingerprint=request_fingerprint,
            ),
            conn=conn,
        )
        generation = await self._generations.create_generation(
            values=_generation_values(
                saga=saga,
                revision=revision,
                authority=authority,
                composition_context=composition_context,
                generation_id=generation_id,
                job_id=job_result.job.id,
                request_fingerprint=request_fingerprint,
            ),
            conn=conn,
        )
        await _write_created_activity(
            settings=self._settings,
            organization_id=organization_id,
            saga=saga,
            revision=revision,
            generation=generation,
            job_id=job_result.job.id,
            conn=conn,
        )
        return BuilderCompositionChildCreation(generation=generation, job_result=job_result)

    def _job_command(
        self,
        *,
        saga: BuilderCompositionSagaRecord,
        revision: SiteRevisionManifestRecord,
        generation_id: UUID,
        request_fingerprint: str,
    ) -> BackgroundJobCreate:
        definition = self._jobs.registry.require(
            job_type=BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
            job_type_version=BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
        )
        target = BuilderGenerationJobTarget(
            workspace_id=saga.workspace_id,
            project_id=saga.project_id,
            runtime_id=saga.runtime_id,
            environment_id=saga.environment_id,
        )
        input_reference = BuilderWireframeGenerationJobInput(
            generation_id=generation_id,
            base_site_revision_id=revision.id,
            agent_version_id=saga.agent_version_id,
            request_hash=request_fingerprint,
        )
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
            workspace_id=saga.workspace_id,
            project_id=saga.project_id,
            actor_user_id=saga.actor_user_id,
            target_descriptor=_dump(target),
            input_reference=_dump(input_reference),
            idempotency_key=f"builder-composition-generation:{saga.project_id}:{generation_id}",
            source_revision=revision.manifest_hash,
            correlation_id=correlation_id.get(None) or saga.id.hex,
            trace_id=correlation_id.get(None),
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )


def _generation_values(**kwargs) -> dict[str, object]:
    saga = kwargs["saga"]
    revision = kwargs["revision"]
    authority = kwargs["authority"]
    composition_context = kwargs["composition_context"]
    return {
        "id": kwargs["generation_id"],
        "workspace_id": saga.workspace_id,
        "project_id": saga.project_id,
        "runtime_id": saga.runtime_id,
        "site_id": saga.site_id,
        "environment_id": saga.environment_id,
        "base_site_revision_id": revision.id,
        "base_manifest_hash": revision.manifest_hash,
        "base_etag": revision.manifest_hash,
        "job_id": kwargs["job_id"],
        "actor_user_id": saga.actor_user_id,
        "agent_run_id": authority.agent_run_id,
        "agent_id": authority.agent_id,
        "agent_version_id": authority.agent_version_id,
        "agent_assignment_id": authority.agent_assignment_id,
        "tool_name": BUILDER_WIREFRAME_GENERATE_TOOL,
        "target_stage": "wireframe",
        "objective": saga.objective,
        "locale": saga.locale,
        "candidate_count": saga.candidate_count,
        "targets": list(saga.targets),
        "knowledge_reference_ids": list(saga.knowledge_reference_ids),
        "builder_context": authority.builder_context.model_dump(mode="json", by_alias=True),
        "composition_context": composition_context.model_dump(mode="json", by_alias=True),
        "request_fingerprint": kwargs["request_fingerprint"],
        "composition_saga_id": saga.id,
        "composition_saga_phase": "composition",
    }


async def _write_created_activity(**kwargs) -> None:
    saga = kwargs["saga"]
    await write_required_activity_event(
        settings=kwargs["settings"],
        payload=ActivityAuditPayload(
            event_name="project.builder.composition_saga.composition_queued",
            organization_id=kwargs["organization_id"],
            workspace_id=saga.workspace_id,
            project_id=saga.project_id,
            actor_user_id=saga.actor_user_id,
            entity_type="builder_composition_saga",
            entity_id=saga.id,
            source="api",
            properties={
                "compositionGenerationId": str(kwargs["generation"].id),
                "compositionJobId": str(kwargs["job_id"]),
                "planningResultRevisionId": str(kwargs["revision"].id),
                "targetCount": len(saga.targets),
            },
        ),
        conn=kwargs["conn"],
    )


def _composition_generation_identity(saga_id: UUID) -> UUID:
    digest = sha256(f"arclayer:builder-composition-saga:{saga_id}:composition".encode()).digest()
    return UUID(bytes=digest[:16], version=4)


def _composition_request_fingerprint(**kwargs) -> str:
    saga = kwargs["saga"]
    revision = kwargs["revision"]
    return builder_request_fingerprint({
        "sagaId": str(saga.id),
        "generationId": str(kwargs["generation_id"]),
        "baseRevisionId": str(revision.id),
        "baseManifestHash": revision.manifest_hash,
        "agentVersionId": str(saga.agent_version_id),
        "targets": list(saga.targets),
    })


def _dump(value: BaseSchema) -> JsonObject:
    return cast(JsonObject, value.model_dump(mode="json", by_alias=True))


__all__ = ["BuilderCompositionChildCreation", "BuilderCompositionChildCreator"]
