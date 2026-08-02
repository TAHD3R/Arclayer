from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Literal, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.modules.projects.builder import service as builder_service_module
from src.modules.projects.builder.render_document_design import (
    BuilderRenderDesignPins,
    resolve_design_token_values,
)
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.service import SiteBuilderService
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestInputV1,
    DesignSystemManifestV1,
    build_design_system_manifest,
)


def _design_manifest(
    *,
    theme_mode: Literal["light", "dark"] = "light",
    cycle: bool = False,
) -> DesignSystemManifestV1:
    semantic_tokens = (
        {
            "semantic.color.action.legacy": {
                "type": "color",
                "alias": "semantic.color.action.primary",
            },
            "semantic.color.action.primary": {
                "type": "color",
                "alias": "semantic.color.action.legacy",
            },
        }
        if cycle
        else {
            "semantic.color.action.legacy": {
                "type": "color",
                "alias": "primitive.color.action",
                "deprecated": True,
                "replacement": "semantic.color.action.primary",
            },
            "semantic.color.action.primary": {
                "type": "color",
                "alias": "primitive.color.action",
            },
        }
    )
    payload = DesignSystemManifestInputV1.model_validate({
        "manifestVersion": 1,
        "name": "Catalog projection",
        "primitiveTokens": {
            "primitive.color.action": {"type": "color", "value": "#155EEF"},
            "primitive.color.canvas": {"type": "color", "value": "#FFFFFF"},
        },
        "semanticTokens": semantic_tokens,
        "themes": [
            {
                "key": theme_mode,
                "name": theme_mode.title(),
                "mode": theme_mode,
                "overrides": {},
            }
        ],
        "breakpoints": {"mobile": "24rem", "tablet": "48rem", "desktop": "80rem"},
        "componentCatalogVersion": "arclayer-wireframe-v1",
    })
    return build_design_system_manifest(payload)


@pytest.mark.asyncio
async def test_component_catalog_projects_sorted_resolved_tokens_and_deprecation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id, project_id, runtime_id = uuid4(), uuid4(), uuid4()
    site_id, environment_id, revision_id, design_system_id, design_version_id = (uuid4() for _ in range(5))
    design_manifest = _design_manifest()
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    revision_manifest = SimpleNamespace(
        id=revision_id,
        design_system_id=design_system_id,
        design_system_version_id=design_version_id,
        design_system_manifest_checksum=design_manifest.checksum,
    )
    repository = SimpleNamespace(
        get_project=AsyncMock(return_value=SimpleNamespace(id=project_id)),
        get_site=AsyncMock(return_value=SimpleNamespace(id=site_id)),
        get_default_preview_environment=AsyncMock(return_value=SimpleNamespace(id=environment_id)),
        get_latest_site_revision=AsyncMock(return_value=SimpleNamespace(id=revision_id)),
    )
    service = SiteBuilderService(
        repository=cast(SiteBuilderRepository, repository),
        design_system_repository=cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
    )

    @asynccontextmanager
    async def transaction() -> AsyncIterator[BaseDBAsyncClient]:
        yield cast(BaseDBAsyncClient, SimpleNamespace())

    async def resolve_contract(**_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(manifest=design_manifest, catalog=catalog)

    monkeypatch.setattr(service, "tx", transaction)
    monkeypatch.setattr(
        builder_service_module,
        "parse_site_revision_manifest",
        lambda _record: revision_manifest,
    )
    monkeypatch.setattr(builder_service_module, "resolve_builder_design_contract", resolve_contract)

    result = await service.get_component_catalog(
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
    )

    assert result.site_revision_id == revision_id
    assert result.default_theme_key == "light"
    assert result.breakpoints == {"mobile": "24rem", "tablet": "48rem", "desktop": "80rem"}
    assert [token.path for token in result.design_tokens] == sorted(token.path for token in result.design_tokens)
    tokens = {token.path: token for token in result.design_tokens}
    assert tokens["semantic.color.action.primary"].resolved_value == "#155EEF"
    assert tokens["semantic.color.action.legacy"].resolved_value == "#155EEF"
    assert tokens["semantic.color.action.legacy"].deprecated is True
    assert tokens["semantic.color.action.legacy"].replacement == "semantic.color.action.primary"


def test_design_token_resolution_rejects_alias_cycles() -> None:
    manifest = _design_manifest(cycle=True)

    with pytest.raises(Conflict) as exc_info:
        resolve_design_token_values(design_manifest=manifest)

    assert exc_info.value.error == "BUILDER_RENDER_DOCUMENT_INVALID"
    assert isinstance(exc_info.value.details, list)
    assert exc_info.value.details[0]["code"] == "BUILDER_RENDER_TOKEN_CYCLE"


def test_design_token_resolution_requires_one_default_light_theme() -> None:
    manifest = _design_manifest(theme_mode="dark")

    with pytest.raises(Conflict) as exc_info:
        resolve_design_token_values(design_manifest=manifest)

    assert exc_info.value.error == "BUILDER_RENDER_THEME_NOT_FOUND"


@pytest.mark.asyncio
async def test_candidate_render_document_rejects_missing_catalog_without_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id, project_id, revision_id, page_item_id = (uuid4() for _ in range(4))
    design_system_id, design_version_id = uuid4(), uuid4()
    manifest = build_design_system_manifest(
        DesignSystemManifestInputV1.model_validate({
            "manifestVersion": 1,
            "name": "Missing candidate catalog",
            "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        })
    )
    repository = SimpleNamespace(list_content_versions=AsyncMock())
    service = SiteBuilderService(
        repository=cast(SiteBuilderRepository, repository),
        design_system_repository=cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
    )

    @asynccontextmanager
    async def transaction() -> AsyncIterator[BaseDBAsyncClient]:
        yield cast(BaseDBAsyncClient, SimpleNamespace())

    get_revision = AsyncMock(return_value=SimpleNamespace())
    monkeypatch.setattr(service, "tx", transaction)
    monkeypatch.setattr(builder_service_module, "get_project_builder_revision", get_revision)

    with pytest.raises(Conflict) as exc_info:
        await service.get_page_render_document_for_design_system(
            workspace_id=workspace_id,
            project_id=project_id,
            revision_id=revision_id,
            page_item_id=page_item_id,
            locale="en-US",
            theme_key="light",
            design_pins=BuilderRenderDesignPins(
                design_system_id=design_system_id,
                design_system_version_id=design_version_id,
                design_system_manifest_checksum=manifest.checksum,
            ),
            design_manifest=manifest,
        )

    assert exc_info.value.error == "DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE"
    assert get_revision.await_count == 1
    repository.list_content_versions.assert_not_awaited()
