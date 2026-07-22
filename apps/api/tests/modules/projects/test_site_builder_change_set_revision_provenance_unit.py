from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.builder._enums import BuilderProvenanceSource
from src.modules.projects.builder.change_set_revision import _persist_site_revision
from src.modules.projects.builder.manifest import (
    RootSiteRevisionManifestInput,
    build_root_site_revision_manifest,
)
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.snapshot import canonical_hash


async def test_site_revision_persistence_keeps_direct_agent_identity() -> None:
    now = datetime(2026, 7, 22, tzinfo=UTC)
    agent_id, agent_version_id, agent_assignment_id = (uuid4() for _ in range(3))
    manifest = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput(
            workspace_id=uuid4(),
            project_id=uuid4(),
            site_id=uuid4(),
            environment_id=uuid4(),
            content_structure_revision_id=uuid4(),
            content_structure_hash=canonical_hash({"pages": []}),
            page_versions=(),
            presentation_set_hash=canonical_hash([]),
            design_system_id=uuid4(),
            design_system_version_id=uuid4(),
            design_system_manifest_checksum=canonical_hash({"tokens": {}}),
            provenance_source=BuilderProvenanceSource.AGENT,
            actor_user_id=uuid4(),
            agent_run_id=None,
            agent_id=agent_id,
            agent_version_id=agent_version_id,
            agent_assignment_id=agent_assignment_id,
            correlation_id=None,
            created_at=now,
        )
    )
    repository = SimpleNamespace(create_site_revision=AsyncMock())

    await _persist_site_revision(
        repository=cast(SiteBuilderRepository, repository),
        manifest=manifest,
        base_manifest=manifest,
        provenance_source=BuilderProvenanceSource.AGENT,
        actor_user_id=UUID(str(manifest.actor_user_id)),
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=agent_version_id,
        agent_assignment_id=agent_assignment_id,
        now=now,
        conn=cast(BaseDBAsyncClient, object()),
    )

    values = repository.create_site_revision.await_args.kwargs["values"]
    assert values["agent_run_id"] is None
    assert values["agent_id"] == agent_id
    assert values["agent_version_id"] == agent_version_id
    assert values["agent_assignment_id"] == agent_assignment_id
    assert values["manifest_snapshot"]["agentId"] == manifest.model_dump(mode="json", by_alias=True)["agentId"]
