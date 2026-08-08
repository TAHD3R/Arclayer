from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import Settings
from src.models.skills._enums import SkillPackageStatus
from src.modules.system.skills.schema import (
    PlatformSkillGitHubImportRequest,
    PlatformSkillPackageReplaceRequest,
)
from src.modules.system.skills.service import PlatformSkillCatalogService, _platform_payload_from_snapshot
from src.modules.workspaces.skills.github_fetcher import PublicGitHubSkillFetcher
from src.modules.workspaces.skills.github_source import GitHubSkillSnapshot, GitHubTreeResource
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository


def test_platform_payload_from_github_snapshot_keeps_instructions_and_references() -> None:
    snapshot = GitHubSkillSnapshot(
        repository_url="https://github.com/arclayer/accessibility-review",
        requested_ref="main",
        subpath="skills/accessibility-review",
        resolved_commit="a" * 40,
        resolved_tree="b" * 40,
        resources=(
            GitHubTreeResource(
                path="SKILL.md",
                blob_sha="c" * 40,
                byte_size=19,
                mime_type="text/markdown",
                content="Review every control.",
            ),
            GitHubTreeResource(
                path="references/checklist.md",
                blob_sha="d" * 40,
                byte_size=12,
                mime_type="text/markdown",
                content="# Checklist",
            ),
        ),
    )
    request = PlatformSkillGitHubImportRequest(
        repository_url=snapshot.repository_url,
        requested_ref="main",
        subpath=snapshot.subpath,
        slug="accessibility-review",
        display_name="Accessibility review",
        description="Review an interface for accessibility issues.",
    )

    payload = _platform_payload_from_snapshot(payload=request, snapshot=snapshot)

    assert payload.instructions == "Review every control."
    assert payload.references[0].path == "references/checklist.md"
    assert payload.references[0].content == "# Checklist"


@pytest.mark.asyncio
async def test_complete_replace_advances_revision_when_only_content_changes(monkeypatch) -> None:
    package = SimpleNamespace(
        id=uuid4(),
        slug="accessibility-review",
        display_name="Accessibility review",
        description="Review an interface for accessibility issues.",
        metadata_revision=3,
        status=SkillPackageStatus.ACTIVE,
        updated_by_user_id=None,
    )
    repository = SimpleNamespace(
        get_platform_package=AsyncMock(return_value=package),
        get_version_by_idempotency_key=AsyncMock(return_value=None),
        save_package=AsyncMock(),
    )
    service = PlatformSkillCatalogService(
        cast(Settings, SimpleNamespace()),
        repository=cast(OfficialSkillCatalogRepository, repository),
        github_fetcher=cast(PublicGitHubSkillFetcher, SimpleNamespace()),
        activity_writer=AsyncMock(),
    )
    connection = SimpleNamespace()

    @asynccontextmanager
    async def transaction():
        yield connection

    version = SimpleNamespace(id=uuid4(), version_number=2)
    detail = SimpleNamespace(id=package.id)
    monkeypatch.setattr(service, "tx", transaction)
    monkeypatch.setattr(service, "_persist_version", AsyncMock(return_value=version))
    monkeypatch.setattr(service, "_write_activity", AsyncMock())
    monkeypatch.setattr(service, "get_package", AsyncMock(return_value=detail))
    payload = PlatformSkillPackageReplaceRequest(
        expected_revision=3,
        display_name=package.display_name,
        description=package.description,
        instructions="Use the updated review checklist.",
    )

    result = await service.replace_package(
        package_id=package.id,
        payload=payload,
        idempotency_key="replace-request-1",
        actor_user_id=uuid4(),
    )

    assert result is detail
    assert package.metadata_revision == 4
    assert repository.save_package.await_args.kwargs["update_fields"] == (
        "updated_by_user_id",
        "metadata_revision",
    )


@pytest.mark.asyncio
async def test_restore_archived_package_reopens_catalog_entry(monkeypatch) -> None:
    package = SimpleNamespace(
        id=uuid4(),
        metadata_revision=5,
        status=SkillPackageStatus.ARCHIVED,
        archived_at=object(),
        archived_by_user_id=uuid4(),
        updated_by_user_id=None,
        latest_valid_version_id=uuid4(),
    )
    repository = SimpleNamespace(
        get_platform_package=AsyncMock(return_value=package),
        save_package=AsyncMock(),
    )
    service = PlatformSkillCatalogService(
        cast(Settings, SimpleNamespace()),
        repository=cast(OfficialSkillCatalogRepository, repository),
        github_fetcher=cast(PublicGitHubSkillFetcher, SimpleNamespace()),
        activity_writer=AsyncMock(),
    )
    connection = SimpleNamespace()

    @asynccontextmanager
    async def transaction():
        yield connection

    detail = SimpleNamespace(id=package.id)
    monkeypatch.setattr(service, "tx", transaction)
    monkeypatch.setattr(service, "_write_activity", AsyncMock())
    monkeypatch.setattr(service, "get_package", AsyncMock(return_value=detail))

    actor_user_id = uuid4()
    result = await service.restore_package(
        package_id=package.id,
        expected_revision=5,
        actor_user_id=actor_user_id,
    )

    assert result is detail
    assert package.status is SkillPackageStatus.ACTIVE
    assert package.archived_at is None
    assert package.archived_by_user_id is None
    assert package.updated_by_user_id == actor_user_id
    assert package.metadata_revision == 6
    assert repository.save_package.await_args.kwargs["update_fields"] == (
        "status",
        "archived_at",
        "archived_by_user_id",
        "updated_by_user_id",
        "metadata_revision",
    )
