from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.core.exceptions import Conflict
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.workspaces.design_systems.manifest import build_design_system_manifest
from src.modules.workspaces.design_systems.schema import (
    DesignSystemDetailOut,
    DesignSystemValidationResultOut,
    DesignSystemVersionDetailOut,
    WorkspaceDesignSystemDefaultOut,
)
from src.modules.workspaces.design_systems.service import WorkspaceDesignSystemsService
from src.modules.workspaces.design_systems.starter import WorkspaceStarterDesignSystemOrchestrator
from src.modules.workspaces.design_systems.starter_manifest import build_arclayer_starter_manifest
from src.modules.workspaces.design_systems.validator import validate_design_system_foundation

pytestmark = pytest.mark.unit


class _Service:
    def __init__(self, *, concurrent_default: bool = False) -> None:
        self.default: WorkspaceDesignSystemDefaultOut | None = None
        self.system_id = uuid4()
        self.version_id = uuid4()
        self.calls: list[str] = []
        self.concurrent_default = concurrent_default

    async def get_default(self, **_kwargs: object) -> WorkspaceDesignSystemDefaultOut | None:
        self.calls.append("get_default")
        return self.default

    async def create_system(self, **_kwargs: object) -> DesignSystemDetailOut:
        self.calls.append("create_system")
        return cast(DesignSystemDetailOut, SimpleNamespace(id=self.system_id))

    async def create_version(self, **_kwargs: object) -> DesignSystemVersionDetailOut:
        self.calls.append("create_version")
        return cast(
            DesignSystemVersionDetailOut,
            SimpleNamespace(id=self.version_id, manifest_checksum="sha256:" + "a" * 64),
        )

    async def create_validation(self, **_kwargs: object) -> DesignSystemValidationResultOut:
        self.calls.append("create_validation")
        return cast(
            DesignSystemValidationResultOut,
            SimpleNamespace(finding_hash="sha256:" + "b" * 64),
        )

    async def set_default(self, **_kwargs: object) -> WorkspaceDesignSystemDefaultOut:
        self.calls.append("set_default")
        if self.concurrent_default:
            self.default = cast(WorkspaceDesignSystemDefaultOut, SimpleNamespace(version_id=uuid4()))
            raise Conflict(error="DESIGN_SYSTEM_REVISION_CONFLICT")
        self.default = cast(WorkspaceDesignSystemDefaultOut, SimpleNamespace(version_id=self.version_id))
        return self.default


def _orchestrator(service: _Service) -> WorkspaceStarterDesignSystemOrchestrator:
    return WorkspaceStarterDesignSystemOrchestrator(
        service_factory=lambda: cast(WorkspaceDesignSystemsService, service),
    )


def test_arclayer_starter_manifest_is_foundation_valid() -> None:
    manifest = build_design_system_manifest(build_arclayer_starter_manifest())
    outcome = validate_design_system_foundation(
        manifest,
        component_catalog_resolver=get_official_component_catalog_registry(),
    )
    assert outcome.status == "valid"
    assert manifest.component_catalog_version == "arclayer-wireframe-v1"


@pytest.mark.asyncio
async def test_starter_default_is_idempotent_and_skips_existing_default() -> None:
    service = _Service()
    orchestrator = _orchestrator(service)
    workspace_id, organization_id, actor_user_id = uuid4(), uuid4(), uuid4()

    first = await orchestrator.ensure_default(
        workspace_id=workspace_id,
        organization_id=organization_id,
        actor_user_id=actor_user_id,
    )
    second = await orchestrator.ensure_default(
        workspace_id=workspace_id,
        organization_id=organization_id,
        actor_user_id=actor_user_id,
    )

    assert first.version_id == second.version_id
    assert service.calls == [
        "get_default",
        "create_system",
        "create_version",
        "create_validation",
        "get_default",
        "set_default",
        "get_default",
    ]


@pytest.mark.asyncio
async def test_starter_default_accepts_a_concurrent_assignment() -> None:
    service = _Service(concurrent_default=True)
    orchestrator = _orchestrator(service)

    result = await orchestrator.ensure_default(
        workspace_id=uuid4(),
        organization_id=uuid4(),
        actor_user_id=uuid4(),
    )

    assert result.version_id is not None
