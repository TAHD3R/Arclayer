from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.design_systems._enums import (
    DesignSystemOwnerKind,
    DesignSystemValidationStatus,
    DesignSystemVersionStatus,
)
from src.models.design_systems.design_system_version import (
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.schema import (
    ProjectDesignSystemAssignmentSetRequest,
    ProjectDesignSystemForkRequest,
    ProjectDesignSystemSupersessionRequest,
)
from src.modules.projects.design_systems.service import ProjectDesignSystemsService
from src.modules.projects.design_systems.supersession_service import ProjectDesignSystemSupersessionService
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.workspaces.design_systems.repository import WorkspaceDesignSystemsRepository
from src.modules.workspaces.design_systems.schema import WorkspaceDesignSystemDefaultSetRequest
from src.modules.workspaces.design_systems.service import (
    RepresentativePreviewRenderer,
    WorkspaceDesignSystemsService,
    _require_assignable_state,
)

pytestmark = pytest.mark.unit

_CHECKSUM = f"sha256:{'a' * 64}"
_FINDING_HASH = f"sha256:{'b' * 64}"


class _WorkspaceDefaultRepository:
    def __init__(self, *, system_id: UUID, version_id: UUID, state: SimpleNamespace) -> None:
        self.system = SimpleNamespace(id=system_id)
        self.version = SimpleNamespace(id=version_id, manifest_checksum=_CHECKSUM)
        self.state = state
        self.mutation_calls: list[str] = []

    async def lock_workspace_systems(self, **_kwargs: object) -> None:
        return None

    async def get_default_command(self, **_kwargs: object) -> None:
        return None

    async def get_system(self, **_kwargs: object) -> SimpleNamespace:
        return self.system

    async def get_version(self, **_kwargs: object) -> SimpleNamespace:
        return self.version

    async def latest_validations(self, **_kwargs: object) -> dict[UUID, SimpleNamespace]:
        return {
            self.version.id: SimpleNamespace(
                status=DesignSystemValidationStatus.VALID,
                finding_hash=_FINDING_HASH,
            )
        }

    async def get_version_state(self, **_kwargs: object) -> SimpleNamespace:
        return self.state

    async def create_default(self, **_kwargs: object) -> None:
        self.mutation_calls.append("create_default")
        raise AssertionError("a candidate version must not create a default")

    async def save_default(self, **_kwargs: object) -> None:
        self.mutation_calls.append("save_default")
        raise AssertionError("a candidate version must not update a default")


class _ProjectRepository:
    def __init__(self, *, system: SimpleNamespace, version: SimpleNamespace, state: SimpleNamespace) -> None:
        self.system = system
        self.version = version
        self.state = state
        self.mutation_calls: list[str] = []

    async def lock_project(self, **_kwargs: object) -> None:
        return None

    async def get_command(self, **_kwargs: object) -> None:
        return None

    async def get_system(self, **_kwargs: object) -> SimpleNamespace:
        return self.system

    async def get_version(self, **_kwargs: object) -> SimpleNamespace:
        return self.version

    async def get_version_state(self, **_kwargs: object) -> SimpleNamespace:
        return self.state

    async def latest_validation(self, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(status=DesignSystemValidationStatus.VALID, finding_hash=_FINDING_HASH)

    async def create_assignment(self, **_kwargs: object) -> None:
        self.mutation_calls.append("create_assignment")
        raise AssertionError("a candidate version must not create a Project assignment")

    async def save_assignment(self, **_kwargs: object) -> None:
        self.mutation_calls.append("save_assignment")
        raise AssertionError("a candidate version must not update a Project assignment")

    async def create_system(self, **_kwargs: object) -> None:
        self.mutation_calls.append("create_system")
        raise AssertionError("a candidate version must not be forked")


class _SupersessionRepository:
    def __init__(
        self,
        *,
        system: SimpleNamespace,
        target: SimpleNamespace,
        replacement: SimpleNamespace,
        target_state: SimpleNamespace,
        replacement_state: SimpleNamespace,
    ) -> None:
        self.system = system
        self.target = target
        self.replacement = replacement
        self.target_state = target_state
        self.replacement_state = replacement_state
        self.mutation_calls: list[str] = []

    async def lock_project(self, **_kwargs: object) -> None:
        return None

    async def get_command(self, **_kwargs: object) -> None:
        return None

    async def get_system(self, **_kwargs: object) -> SimpleNamespace:
        return self.system

    async def get_version(self, *, version_id: UUID, **_kwargs: object) -> SimpleNamespace:
        return self.target if version_id == self.target.id else self.replacement

    async def get_version_state(self, *, version_id: UUID, **_kwargs: object) -> SimpleNamespace:
        return self.target_state if version_id == self.target.id else self.replacement_state

    async def latest_validation(self, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(status=DesignSystemValidationStatus.VALID, finding_hash=_FINDING_HASH)

    async def save_version_state(self, **_kwargs: object) -> None:
        self.mutation_calls.append("save_version_state")
        raise AssertionError("an unreleased version must not be superseded")


class _WorkspaceService(WorkspaceDesignSystemsService):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn if conn is not None else cast(BaseDBAsyncClient, object())


class _ProjectService(ProjectDesignSystemsService):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn if conn is not None else cast(BaseDBAsyncClient, object())


class _SupersessionService(ProjectDesignSystemSupersessionService):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn if conn is not None else cast(BaseDBAsyncClient, object())


def _state(status: DesignSystemVersionStatus) -> SimpleNamespace:
    return SimpleNamespace(
        status=status,
        status_revision=1,
        status_changed_at=datetime.now(UTC),
        status_changed_by_user_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_default_requires_a_published_version_before_any_default_write() -> None:
    workspace_id, system_id, version_id = uuid4(), uuid4(), uuid4()
    repository = _WorkspaceDefaultRepository(
        system_id=system_id, version_id=version_id, state=_state(DesignSystemVersionStatus.VALID)
    )
    service = _WorkspaceService(
        repository=cast(WorkspaceDesignSystemsRepository, repository),
        component_catalog_resolver=cast(ComponentCatalogResolver, object()),
        representative_preview_renderer=cast(RepresentativePreviewRenderer, object()),
    )
    payload = WorkspaceDesignSystemDefaultSetRequest(
        design_system_id=system_id,
        version_id=version_id,
        expected_manifest_checksum=_CHECKSUM,
        validation_finding_hash=_FINDING_HASH,
        expected_revision=0,
    )

    with pytest.raises(Conflict) as exc_info:
        await service.set_default(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            idempotency_key="candidate-default",
            payload=payload,
        )

    assert exc_info.value.error == "DESIGN_SYSTEM_RELEASE_REQUIRED"
    assert repository.mutation_calls == []
    _require_assignable_state(cast(DesignSystemVersionStateRecord, _state(DesignSystemVersionStatus.PUBLISHED)))
    with pytest.raises(Conflict) as superseded:
        _require_assignable_state(cast(DesignSystemVersionStateRecord, _state(DesignSystemVersionStatus.SUPERSEDED)))
    assert superseded.value.error == "DESIGN_SYSTEM_VERSION_SUPERSEDED"


@pytest.mark.asyncio
async def test_project_assignment_and_fork_require_a_released_workspace_source_or_valid_project_source() -> None:
    workspace_id, project_id, system_id, version_id = (uuid4() for _ in range(4))
    repository = _ProjectRepository(
        system=SimpleNamespace(
            id=system_id,
            owner_kind=DesignSystemOwnerKind.WORKSPACE,
            owning_project_id=None,
        ),
        version=SimpleNamespace(id=version_id, manifest_checksum=_CHECKSUM),
        state=_state(DesignSystemVersionStatus.CANDIDATE),
    )
    service = _ProjectService(repository=cast(ProjectDesignSystemsRepository, repository))
    assignment = ProjectDesignSystemAssignmentSetRequest(
        design_system_id=system_id,
        version_id=version_id,
        expected_manifest_checksum=_CHECKSUM,
        validation_finding_hash=_FINDING_HASH,
        expected_revision=0,
    )
    fork = ProjectDesignSystemForkRequest(
        source_design_system_id=system_id,
        source_version_id=version_id,
        expected_source_checksum=_CHECKSUM,
        validation_finding_hash=_FINDING_HASH,
        name="Project fork",
    )

    with pytest.raises(Conflict) as assignment_exc:
        await service.set_assignment(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            project_id=project_id,
            actor_user_id=uuid4(),
            idempotency_key="candidate-assignment",
            payload=assignment,
        )
    with pytest.raises(Conflict) as fork_exc:
        await service.fork(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            project_id=project_id,
            actor_user_id=uuid4(),
            idempotency_key="candidate-fork",
            payload=fork,
        )

    assert assignment_exc.value.error == "DESIGN_SYSTEM_VALIDATION_REQUIRED"
    assert fork_exc.value.error == "DESIGN_SYSTEM_VALIDATION_REQUIRED"
    assert repository.mutation_calls == []

    repository.state.status = DesignSystemVersionStatus.VALID
    with pytest.raises(Conflict) as unreleased:
        await service._require_exact_source(
            workspace_id=workspace_id,
            project_id=project_id,
            system_id=system_id,
            version_id=version_id,
            checksum=_CHECKSUM,
            finding_hash=_FINDING_HASH,
            conn=cast(BaseDBAsyncClient, object()),
        )
    assert unreleased.value.error == "DESIGN_SYSTEM_RELEASE_REQUIRED"

    repository.state.status = DesignSystemVersionStatus.PUBLISHED
    source = await service._require_exact_source(
        workspace_id=workspace_id,
        project_id=project_id,
        system_id=system_id,
        version_id=version_id,
        checksum=_CHECKSUM,
        finding_hash=_FINDING_HASH,
        conn=cast(BaseDBAsyncClient, object()),
    )
    assert source[1] is repository.version

    repository.system.owner_kind = DesignSystemOwnerKind.PROJECT
    repository.system.owning_project_id = project_id
    repository.state.status = DesignSystemVersionStatus.VALID
    project_source = await service._require_exact_source(
        workspace_id=workspace_id,
        project_id=project_id,
        system_id=system_id,
        version_id=version_id,
        checksum=_CHECKSUM,
        finding_hash=_FINDING_HASH,
        conn=cast(BaseDBAsyncClient, object()),
    )
    assert project_source[1] is repository.version

    repository.state.status = DesignSystemVersionStatus.PUBLISHED
    with pytest.raises(Conflict) as project_published:
        await service._require_exact_source(
            workspace_id=workspace_id,
            project_id=project_id,
            system_id=system_id,
            version_id=version_id,
            checksum=_CHECKSUM,
            finding_hash=_FINDING_HASH,
            conn=cast(BaseDBAsyncClient, object()),
        )
    assert project_published.value.error == "DESIGN_SYSTEM_VALIDATION_REQUIRED"

    repository.state.status = DesignSystemVersionStatus.SUPERSEDED
    with pytest.raises(Conflict) as superseded:
        await service._require_exact_source(
            workspace_id=workspace_id,
            project_id=project_id,
            system_id=system_id,
            version_id=version_id,
            checksum=_CHECKSUM,
            finding_hash=_FINDING_HASH,
            conn=cast(BaseDBAsyncClient, object()),
        )
    assert superseded.value.error == "DESIGN_SYSTEM_VERSION_SUPERSEDED"


@pytest.mark.asyncio
async def test_supersession_requires_valid_target_and_replacement_without_writing_candidates() -> None:
    workspace_id, project_id, system_id, target_id, replacement_id = (uuid4() for _ in range(5))
    target = SimpleNamespace(id=target_id, version_number=1, manifest_checksum=_CHECKSUM)
    replacement = SimpleNamespace(id=replacement_id, version_number=2, manifest_checksum=_CHECKSUM)
    repository = _SupersessionRepository(
        system=SimpleNamespace(
            id=system_id,
            owner_kind=DesignSystemOwnerKind.PROJECT,
            owning_project_id=project_id,
            metadata_revision=1,
        ),
        target=target,
        replacement=replacement,
        target_state=_state(DesignSystemVersionStatus.VALID),
        replacement_state=_state(DesignSystemVersionStatus.CANDIDATE),
    )
    service = _SupersessionService(repository=cast(ProjectDesignSystemsRepository, repository))
    valid_target_request = ProjectDesignSystemSupersessionRequest(
        replacement_version_id=replacement_id,
        expected_replacement_checksum=_CHECKSUM,
        expected_target_status="valid",
        expected_target_status_revision=1,
        expected_system_revision=1,
    )

    with pytest.raises(Conflict) as replacement_exc:
        await service.supersede_version(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            project_id=project_id,
            system_id=system_id,
            target_version_id=target_id,
            actor_user_id=uuid4(),
            idempotency_key="candidate-target",
            payload=valid_target_request,
        )

    assert replacement_exc.value.error == "DESIGN_SYSTEM_SUPERSESSION_REPLACEMENT_INVALID"
    assert repository.mutation_calls == []

    service._validate_target_state(
        target_state=cast(DesignSystemVersionStateRecord, repository.target_state),
        payload=valid_target_request,
    )

    repository.replacement_state.status = DesignSystemVersionStatus.VALID
    await service._validate_replacement(
        workspace_id=workspace_id,
        target=cast(DesignSystemVersionRecord, target),
        replacement=cast(DesignSystemVersionRecord, replacement),
        replacement_state=cast(DesignSystemVersionStateRecord, repository.replacement_state),
        expected_checksum=_CHECKSUM,
        conn=cast(BaseDBAsyncClient, object()),
    )

    repository.target_state.status = DesignSystemVersionStatus.SUPERSEDED
    with pytest.raises(Conflict) as superseded:
        service._validate_target_state(
            target_state=cast(DesignSystemVersionStateRecord, repository.target_state),
            payload=valid_target_request,
        )
    assert superseded.value.error == "DESIGN_SYSTEM_VERSION_SUPERSEDED"
