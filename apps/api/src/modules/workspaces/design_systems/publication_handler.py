from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import NoReturn, cast

from src.common.types.json_types import JsonObject
from src.models.design_systems._enums import (
    DesignSystemArtifactStatus,
    DesignSystemPublicationStatus,
    DesignSystemValidationStatus,
    DesignSystemVersionStatus,
)
from src.models.design_systems.design_system import DesignSystemRecord
from src.models.design_systems.design_system_version import (
    DesignSystemValidationResultRecord,
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.models.design_systems.publication import DesignSystemArtifactRecord, DesignSystemPublicationRecord
from src.modules.jobs.execution_errors import JOB_EXECUTION_CONTRACT_MISMATCH_CODE, PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledFailure, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1
from src.modules.workspaces.design_systems.publication_assets import (
    DesignSystemAssetPin,
    DesignSystemAssetPinningError,
    DesignSystemAssetPinResolver,
    design_system_asset_pins_hash,
)
from src.modules.workspaces.design_systems.publication_compiler import (
    CompiledDesignSystemArtifact,
    DesignSystemCompilationError,
    compile_design_system_artifact,
    design_system_artifact_input_hash,
)
from src.modules.workspaces.design_systems.publication_contract import (
    DESIGN_SYSTEM_PUBLICATION_FAILED,
    DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE,
    DESIGN_SYSTEM_PUBLICATION_TRANSIENT_FAILURE,
    DesignSystemCompileJobInput,
    DesignSystemCompileJobResult,
    DesignSystemCompileJobTarget,
    DesignSystemPublicationFailureMetadata,
)
from src.modules.workspaces.design_systems.publication_repository import DesignSystemPublicationRepository
from src.modules.workspaces.design_systems.repository import WorkspaceDesignSystemsRepository

_PROGRESS_TOTAL = 3


@dataclass(frozen=True, slots=True)
class _PublicationExecutionState:
    publication: DesignSystemPublicationRecord
    artifact: DesignSystemArtifactRecord
    system: DesignSystemRecord
    version: DesignSystemVersionRecord
    version_state: DesignSystemVersionStateRecord
    validation: DesignSystemValidationResultRecord
    manifest: DesignSystemManifestV1
    asset_pins: tuple[DesignSystemAssetPin, ...]
    artifact_input_hash: str


class DesignSystemPublicationJobHandler:
    """Compile an exact immutable Design System, then require real publication evidence."""

    def __init__(
        self,
        *,
        design_systems_factory: Callable[[], WorkspaceDesignSystemsRepository],
        publications_factory: Callable[[], DesignSystemPublicationRepository],
        asset_resolver_factory: Callable[[], DesignSystemAssetPinResolver],
    ) -> None:
        self._design_systems_factory = design_systems_factory
        self._publications_factory = publications_factory
        self._asset_resolver_factory = asset_resolver_factory

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
    ) -> DesignSystemCompileJobResult | JobHandledFailure | None:
        publication, artifact = await self._load_outcome_records(context=context, for_update=False)
        if publication.status == DesignSystemPublicationStatus.PUBLISHED:
            return _result(publication=publication, artifact=artifact)
        if publication.status == DesignSystemPublicationStatus.FAILED:
            return _failure(publication=publication)
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
    ) -> DesignSystemCompileJobResult:
        await context.report_progress(_progress(phase="pinning_assets", completed=0))
        state = await self._load_executable_state(context=context, for_update=False)
        await self._mark_building(context=context)
        await context.report_progress(_progress(phase="compiling", completed=1))
        try:
            compiled = compile_design_system_artifact(
                manifest=state.manifest,
                validation_finding_hash=state.validation.finding_hash,
                validator_version=state.validation.validator_version,
                asset_pins=state.asset_pins,
                component_catalog_version=state.version.component_catalog_version,
                compiler_version=context.input_reference.compiler_version,
                renderer_profile=context.input_reference.renderer_profile,
                renderer_version=context.input_reference.renderer_version,
            )
        except DesignSystemCompilationError as error:
            raise _publication_failure("The exact Design System compiler could not produce an artifact") from error
        await context.checkpoint()
        await self._persist_compiled_artifact(context=context, compiled=compiled)
        await context.report_progress(_progress(phase="verifying", completed=2))
        raise _renderer_unavailable()

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        async def commit() -> None:
            publication, artifact = await self._load_outcome_records(context=context, for_update=True)
            if publication.status == DesignSystemPublicationStatus.PUBLISHED:
                return
            publication.status = DesignSystemPublicationStatus.FAILED
            publication.failure_code = error.code
            publication.failure_message = error.safe_message
            artifact.status = DesignSystemArtifactStatus.FAILED
            artifact.failure_code = error.code
            artifact.failure_message = error.safe_message
            repository = self._publications_factory()
            await repository.save_publication(
                record=publication,
                update_fields=("status", "failure_code", "failure_message"),
            )
            await repository.save_artifact(
                record=artifact,
                update_fields=("status", "failure_code", "failure_message"),
            )

        await context.run_fenced_domain_commit(commit)

    async def _mark_building(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
    ) -> None:
        async def commit() -> None:
            state = await self._load_executable_state(context=context, for_update=True)
            if state.publication.status == DesignSystemPublicationStatus.BUILDING:
                return
            state.publication.status = DesignSystemPublicationStatus.BUILDING
            state.artifact.status = DesignSystemArtifactStatus.BUILDING
            repository = self._publications_factory()
            await repository.save_publication(record=state.publication, update_fields=("status",))
            await repository.save_artifact(record=state.artifact, update_fields=("status",))

        await context.run_fenced_domain_commit(commit)

    async def _persist_compiled_artifact(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
        compiled: CompiledDesignSystemArtifact,
    ) -> None:
        async def commit() -> None:
            state = await self._load_executable_state(context=context, for_update=True)
            if compiled.artifact_input_hash != state.artifact_input_hash:
                _raise_contract_mismatch("Design System compiler input changed before artifact persistence")
            state.artifact.artifact_hash = compiled.artifact_hash
            state.artifact.artifact_payload = compiled.payload
            state.artifact.built_at = datetime.now(UTC)
            repository = self._publications_factory()
            await repository.save_artifact(
                record=state.artifact,
                update_fields=("artifact_hash", "artifact_payload", "built_at"),
            )

        await context.run_fenced_domain_commit(commit)

    async def _load_outcome_records(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
        for_update: bool,
    ) -> tuple[DesignSystemPublicationRecord, DesignSystemArtifactRecord]:
        repository = self._publications_factory()
        publication = await repository.get_publication_by_id(
            publication_id=context.input_reference.publication_id,
            for_update=for_update,
        )
        if publication is None:
            _raise_contract_mismatch("Design System publication is unavailable for its durable Job")
        _require_publication_binding(publication=publication, context=context)
        artifact = await repository.get_artifact_for_publication(publication_id=publication.id, for_update=for_update)
        if artifact is None:
            _raise_contract_mismatch("Design System publication is missing its canonical artifact")
        _require_artifact_binding(artifact=artifact, publication=publication, context=context)
        return publication, artifact

    async def _load_executable_state(
        self,
        *,
        context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
        for_update: bool,
    ) -> _PublicationExecutionState:
        systems = self._design_systems_factory()
        publications = self._publications_factory()
        async with systems.connection() as conn:
            system = (
                await systems.get_system_for_update(
                    workspace_id=context.target.workspace_id,
                    system_id=context.target.design_system_id,
                    conn=conn,
                )
                if for_update
                else await systems.get_system(
                    workspace_id=context.target.workspace_id,
                    system_id=context.target.design_system_id,
                    conn=conn,
                )
            )
            version = await systems.get_version(
                workspace_id=context.target.workspace_id,
                system_id=context.target.design_system_id,
                version_id=context.target.version_id,
                conn=conn,
            )
            version_state = await systems.get_version_state(
                workspace_id=context.target.workspace_id,
                version_id=context.target.version_id,
                conn=conn,
                for_update=for_update,
            )
            validations = await systems.latest_validations(
                workspace_id=context.target.workspace_id,
                version_ids=(context.target.version_id,),
                conn=conn,
            )
            validation = validations.get(context.target.version_id)
            if system is None or version is None or version_state is None or validation is None:
                _raise_contract_mismatch("Design System publication source is no longer available")
            _require_executable_lifecycle(version_state=version_state, validation=validation, context=context)
            try:
                manifest = DesignSystemManifestV1.model_validate(version.manifest)
            except ValueError as error:
                raise _contract_mismatch("Design System publication manifest is invalid") from error
            try:
                asset_pins = await self._asset_resolver_factory().resolve(
                    workspace_id=context.target.workspace_id,
                    manifest=manifest,
                    conn=conn,
                )
            except DesignSystemAssetPinningError as error:
                raise _asset_invalid("Design System Asset pins no longer resolve exactly") from error
            artifact_input_hash = design_system_artifact_input_hash(
                manifest_checksum=version.manifest_checksum,
                validation_finding_hash=validation.finding_hash,
                validator_version=validation.validator_version,
                asset_pins=asset_pins,
                component_catalog_version=version.component_catalog_version,
                compiler_version=context.input_reference.compiler_version,
                renderer_profile=context.input_reference.renderer_profile,
                renderer_version=context.input_reference.renderer_version,
            )
            publication = await publications.get_publication_by_id(
                publication_id=context.input_reference.publication_id,
                conn=conn,
                for_update=for_update,
            )
            if publication is None:
                _raise_contract_mismatch("Design System publication is unavailable for its durable Job")
            _require_publication_binding(publication=publication, context=context)
            artifact = await publications.get_artifact_for_publication(
                publication_id=publication.id,
                conn=conn,
                for_update=for_update,
            )
            if artifact is None:
                _raise_contract_mismatch("Design System publication is missing its canonical artifact")
            _require_artifact_binding(artifact=artifact, publication=publication, context=context)
            _require_exact_pins(
                publication=publication,
                artifact=artifact,
                asset_pins=asset_pins,
                artifact_input_hash=artifact_input_hash,
                context=context,
            )
        return _PublicationExecutionState(
            publication=publication,
            artifact=artifact,
            system=system,
            version=version,
            version_state=version_state,
            validation=validation,
            manifest=manifest,
            asset_pins=asset_pins,
            artifact_input_hash=artifact_input_hash,
        )


def _require_publication_binding(
    *,
    publication: DesignSystemPublicationRecord,
    context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
) -> None:
    if (
        publication.job_id != context.lease.job_id
        or publication.workspace_id != context.target.workspace_id
        or publication.design_system_id != context.target.design_system_id
        or publication.design_system_version_id != context.target.version_id
        or publication.manifest_checksum != context.input_reference.manifest_checksum
        or publication.validation_finding_hash != context.input_reference.validation_finding_hash
        or publication.validator_version != context.input_reference.validator_version
        or publication.component_catalog_version != context.input_reference.component_catalog_version
        or publication.compiler_version != context.input_reference.compiler_version
        or publication.renderer_profile != context.input_reference.renderer_profile
        or publication.renderer_version != context.input_reference.renderer_version
        or publication.asset_pins_hash != context.input_reference.asset_pins_hash
        or publication.actor_user_id != context.actor_user_id
        or context.source_revision != context.input_reference.manifest_checksum
    ):
        _raise_contract_mismatch("Design System publication no longer matches its durable Job")


def _require_artifact_binding(
    *,
    artifact: DesignSystemArtifactRecord,
    publication: DesignSystemPublicationRecord,
    context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
) -> None:
    if (
        artifact.publication_id != publication.id
        or artifact.design_system_version_id != publication.design_system_version_id
        or artifact.workspace_id != context.target.workspace_id
        or artifact.design_system_id != context.target.design_system_id
        or artifact.manifest_checksum != context.input_reference.manifest_checksum
        or artifact.validation_finding_hash != context.input_reference.validation_finding_hash
        or artifact.validator_version != context.input_reference.validator_version
        or artifact.component_catalog_version != context.input_reference.component_catalog_version
        or artifact.compiler_version != context.input_reference.compiler_version
        or artifact.renderer_profile != context.input_reference.renderer_profile
        or artifact.renderer_version != context.input_reference.renderer_version
    ):
        _raise_contract_mismatch("Design System artifact no longer matches its publication")


def _require_executable_lifecycle(
    *,
    version_state: DesignSystemVersionStateRecord,
    validation: DesignSystemValidationResultRecord,
    context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
) -> None:
    if (
        str(version_state.status) != DesignSystemVersionStatus.VALID.value
        or str(validation.status) != DesignSystemValidationStatus.VALID.value
        or validation.finding_hash != context.input_reference.validation_finding_hash
        or validation.validator_version != context.input_reference.validator_version
    ):
        raise PermanentJobExecutionError(
            code="DESIGN_SYSTEM_VALIDATION_BLOCKED",
            safe_message="Design System validation no longer matches the queued publication",
        )


def _require_exact_pins(
    *,
    publication: DesignSystemPublicationRecord,
    artifact: DesignSystemArtifactRecord,
    asset_pins: tuple[DesignSystemAssetPin, ...],
    artifact_input_hash: str,
    context: JobExecutionContext[DesignSystemCompileJobTarget, DesignSystemCompileJobInput],
) -> None:
    pins_hash = design_system_asset_pins_hash(asset_pins)
    pins_payload = _pins_payload(asset_pins)
    if (
        pins_hash != context.input_reference.asset_pins_hash
        or publication.asset_pins_hash != pins_hash
        or publication.asset_pins != pins_payload
        or artifact.asset_pins != pins_payload
        or artifact.artifact_input_hash != artifact_input_hash
    ):
        raise _asset_invalid("Design System Asset pins changed after publication was queued")


def _pins_payload(asset_pins: tuple[DesignSystemAssetPin, ...]) -> list[JsonObject]:
    return [cast(JsonObject, pin.model_dump(mode="json", by_alias=True)) for pin in asset_pins]


def _result(
    *,
    publication: DesignSystemPublicationRecord,
    artifact: DesignSystemArtifactRecord,
) -> DesignSystemCompileJobResult:
    if artifact.status != DesignSystemArtifactStatus.READY or artifact.artifact_hash is None:
        _raise_contract_mismatch("Published Design System publication is missing a ready artifact")
    return DesignSystemCompileJobResult(
        publication_id=publication.id,
        artifact_id=artifact.id,
        artifact_hash=artifact.artifact_hash,
        status="published",
    )


def _failure(*, publication: DesignSystemPublicationRecord) -> JobHandledFailure:
    code = publication.failure_code or DESIGN_SYSTEM_PUBLICATION_FAILED
    metadata = _failure_metadata(code=code)
    return JobHandledFailure(
        code=code,
        safe_message=publication.failure_message or "Design System publication failed",
        metadata=metadata,
    )


def _failure_metadata(*, code: str) -> JsonObject | None:
    if code not in {
        DESIGN_SYSTEM_PUBLICATION_FAILED,
        DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE,
        DESIGN_SYSTEM_PUBLICATION_TRANSIENT_FAILURE,
    }:
        return None
    return cast(
        JsonObject,
        DesignSystemPublicationFailureMetadata(public_error_code=code).model_dump(mode="json", by_alias=True),
    )


def _progress(*, phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"DESIGN_SYSTEM_PUBLICATION_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=_PROGRESS_TOTAL,
    )


def _contract_mismatch(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE, safe_message=message)


def _raise_contract_mismatch(message: str) -> NoReturn:
    raise _contract_mismatch(message)


def _asset_invalid(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(code="DESIGN_SYSTEM_ASSET_INVALID", safe_message=message)


def _publication_failure(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=DESIGN_SYSTEM_PUBLICATION_FAILED,
        safe_message=message,
        metadata=_failure_metadata(code=DESIGN_SYSTEM_PUBLICATION_FAILED),
    )


def _renderer_unavailable() -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE,
        safe_message="Real browser smoke and font-rights verification are not deployed for Design System publication",
        metadata=_failure_metadata(code=DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE),
    )
