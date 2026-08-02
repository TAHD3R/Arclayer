from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.models.design_systems._enums import (
    DesignSystemArtifactStatus,
    DesignSystemPublicationStatus,
    DesignSystemValidationStatus,
    DesignSystemVersionStatus,
)
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobHandledFailure
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    build_design_system_manifest,
)
from src.modules.workspaces.design_systems.publication_assets import DesignSystemAssetPin, design_system_asset_pins_hash
from src.modules.workspaces.design_systems.publication_compiler import (
    DESIGN_SYSTEM_COMPILER_VERSION,
    DESIGN_SYSTEM_RENDERER_PROFILE,
    DESIGN_SYSTEM_RENDERER_VERSION,
    compile_design_system_artifact,
    design_system_artifact_input_hash,
)
from src.modules.workspaces.design_systems.publication_contract import (
    DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE,
    DesignSystemCompileJobInput,
    DesignSystemCompileJobTarget,
    build_design_system_compile_job_definition,
)
from src.modules.workspaces.design_systems.publication_handler import DesignSystemPublicationJobHandler
from src.settings.env_models import BackgroundJobExecutionSettings

pytestmark = pytest.mark.unit


def _manifest():
    return build_design_system_manifest(
        DesignSystemManifestInputV1.model_validate({
            "manifestVersion": 1,
            "name": "Publication contract",
            "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        })
    )


def test_compile_artifact_is_deterministic_and_pins_validation_evidence() -> None:
    manifest = _manifest()
    asset = DesignSystemAssetPin(
        asset_id=uuid4(),
        checksum_sha256="a" * 64,
        kind="image",
        mime="image/png",
    )
    first = compile_design_system_artifact(
        manifest=manifest,
        validation_finding_hash="sha256:" + "b" * 64,
        validator_version=2,
        asset_pins=(asset,),
        component_catalog_version=None,
    )
    second = compile_design_system_artifact(
        manifest=manifest,
        validation_finding_hash="sha256:" + "b" * 64,
        validator_version=2,
        asset_pins=(asset,),
        component_catalog_version=None,
    )
    changed_validation = design_system_artifact_input_hash(
        manifest_checksum=manifest.checksum,
        validation_finding_hash="sha256:" + "c" * 64,
        validator_version=2,
        asset_pins=(asset,),
        component_catalog_version=None,
        compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
        renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
        renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
    )

    assert first == second
    assert first.artifact_input_hash != changed_validation
    assert first.payload["format"] == "design_system.compile.v1"


def test_compile_job_contract_uses_publish_workload_without_cancellation_facade() -> None:
    definition = build_design_system_compile_job_definition(execution_policy=BackgroundJobExecutionSettings())

    assert definition.workload_class == JobWorkloadClass.PUBLISH
    assert definition.required_permission is not None
    assert definition.required_permission.action == "system:site:manage"
    assert definition.cancellable_phases == frozenset()
    assert definition.input_reference_schema is DesignSystemCompileJobInput
    assert definition.target_schema is DesignSystemCompileJobTarget


@pytest.mark.asyncio
async def test_publication_handler_persists_compiled_output_but_never_fakes_renderer_evidence() -> None:
    workspace_id, system_id, version_id, publication_id, job_id, actor_user_id = (uuid4() for _ in range(6))
    manifest = _manifest()
    finding_hash = "sha256:" + "d" * 64
    asset_pins_hash = design_system_asset_pins_hash(())
    input_reference = DesignSystemCompileJobInput(
        publication_id=publication_id,
        manifest_checksum=manifest.checksum,
        validation_finding_hash=finding_hash,
        validator_version=2,
        component_catalog_version=None,
        compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
        renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
        renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
        asset_pins_hash=asset_pins_hash,
    )
    artifact_input_hash = design_system_artifact_input_hash(
        manifest_checksum=manifest.checksum,
        validation_finding_hash=finding_hash,
        validator_version=2,
        asset_pins=(),
        component_catalog_version=None,
        compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
        renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
        renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
    )
    publication = SimpleNamespace(
        id=publication_id,
        job_id=job_id,
        workspace_id=workspace_id,
        design_system_id=system_id,
        design_system_version_id=version_id,
        manifest_checksum=manifest.checksum,
        validation_finding_hash=finding_hash,
        validator_version=2,
        component_catalog_version=None,
        compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
        renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
        renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
        asset_pins_hash=asset_pins_hash,
        asset_pins=[],
        actor_user_id=actor_user_id,
        status=DesignSystemPublicationStatus.PENDING,
        failure_code=None,
        failure_message=None,
    )
    artifact = SimpleNamespace(
        id=uuid4(),
        publication_id=publication_id,
        design_system_version_id=version_id,
        workspace_id=workspace_id,
        design_system_id=system_id,
        manifest_checksum=manifest.checksum,
        validation_finding_hash=finding_hash,
        validator_version=2,
        artifact_input_hash=artifact_input_hash,
        artifact_hash=None,
        status=DesignSystemArtifactStatus.PENDING,
        compiler_version=DESIGN_SYSTEM_COMPILER_VERSION,
        renderer_profile=DESIGN_SYSTEM_RENDERER_PROFILE,
        renderer_version=DESIGN_SYSTEM_RENDERER_VERSION,
        component_catalog_version=None,
        asset_pins=[],
        artifact_payload=None,
        built_at=None,
        failure_code=None,
        failure_message=None,
    )
    publications = _Publications(publication=publication, artifact=artifact)
    systems = _Systems(
        system=SimpleNamespace(id=system_id, latest_published_version_id=None),
        version=SimpleNamespace(
            id=version_id,
            manifest=manifest.model_dump(mode="json", by_alias=True),
            manifest_checksum=manifest.checksum,
            component_catalog_version=None,
        ),
        state=SimpleNamespace(status=DesignSystemVersionStatus.VALID),
        validation=SimpleNamespace(
            status=DesignSystemValidationStatus.VALID,
            finding_hash=finding_hash,
            validator_version=2,
        ),
    )
    handler = DesignSystemPublicationJobHandler(
        design_systems_factory=lambda: systems,
        publications_factory=lambda: publications,
        asset_resolver_factory=lambda: _AssetResolver(),
    )
    context = _Context(
        target=DesignSystemCompileJobTarget(
            workspace_id=workspace_id,
            design_system_id=system_id,
            version_id=version_id,
        ),
        input_reference=input_reference,
        actor_user_id=actor_user_id,
        job_id=job_id,
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await handler.execute(context=context)

    assert exc_info.value.code == DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE
    assert artifact.artifact_hash is not None
    assert artifact.artifact_payload is not None
    assert publication.status == DesignSystemPublicationStatus.BUILDING
    assert artifact.status == DesignSystemArtifactStatus.BUILDING
    await handler.project_failure(context=context, error=exc_info.value)

    reconciled = await handler.reconcile(context=context)
    assert isinstance(reconciled, JobHandledFailure)
    assert reconciled.code == DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE
    assert publication.status == DesignSystemPublicationStatus.FAILED
    assert artifact.status == DesignSystemArtifactStatus.FAILED
    assert systems.state.status == DesignSystemVersionStatus.VALID
    assert systems.system.latest_published_version_id is None


class _Publications:
    def __init__(self, *, publication: SimpleNamespace, artifact: SimpleNamespace) -> None:
        self.publication = publication
        self.artifact = artifact

    async def get_publication_by_id(self, **_kwargs: object) -> SimpleNamespace:
        return self.publication

    async def get_artifact_for_publication(self, **_kwargs: object) -> SimpleNamespace:
        return self.artifact

    async def save_publication(self, **_kwargs: object) -> None:
        return None

    async def save_artifact(self, **_kwargs: object) -> None:
        return None


class _Systems:
    def __init__(
        self,
        *,
        system: SimpleNamespace,
        version: SimpleNamespace,
        state: SimpleNamespace,
        validation: SimpleNamespace,
    ) -> None:
        self.system = system
        self.version = version
        self.state = state
        self.validation = validation

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[object]:
        yield object()

    async def get_system(self, **_kwargs: object) -> SimpleNamespace:
        return self.system

    async def get_system_for_update(self, **_kwargs: object) -> SimpleNamespace:
        return self.system

    async def get_version(self, **_kwargs: object) -> SimpleNamespace:
        return self.version

    async def get_version_state(self, **_kwargs: object) -> SimpleNamespace:
        return self.state

    async def latest_validations(self, **_kwargs: object) -> dict:
        return {self.version.id: self.validation}


class _AssetResolver:
    async def resolve(self, **_kwargs: object) -> tuple[DesignSystemAssetPin, ...]:
        return ()


class _Context:
    def __init__(
        self,
        *,
        target: DesignSystemCompileJobTarget,
        input_reference: DesignSystemCompileJobInput,
        actor_user_id,
        job_id,
    ) -> None:
        self.target = target
        self.input_reference = input_reference
        self.actor_user_id = actor_user_id
        self.source_revision = input_reference.manifest_checksum
        self.lease = SimpleNamespace(job_id=job_id)
        self.progress: list[JobProgressUpdate] = []

    async def report_progress(self, update: JobProgressUpdate) -> None:
        self.progress.append(update)

    async def checkpoint(self) -> None:
        return None

    async def run_fenced_domain_commit(self, operation: Callable[[], Awaitable[object]]) -> object:
        return await operation()
