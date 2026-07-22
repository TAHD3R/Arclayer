from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.modules.domains.schema import DomainBindingOut
from src.modules.domains.service import DomainBindingService
from src.modules.sites.repository import SitesRepository
from src.modules.sites.runtime.config.service import SiteRuntimeConfigMixin


class _FakeSitesRepository:
    def __init__(self, *, project_id: UUID) -> None:
        self._project_id = project_id

    async def get_site_by_id(self, *, site_id: UUID):
        return SimpleNamespace(id=site_id, project_id=self._project_id)


class _FakeDomainService:
    def __init__(self, bindings: list[DomainBindingOut]) -> None:
        self._bindings = bindings

    async def list_bindings_for_project(self, *, project_id: UUID):
        return self._bindings

    def to_out(self, binding: DomainBindingOut):
        return binding.model_dump(by_alias=True)


def _binding(
    *,
    project_id: UUID,
    site_id: UUID,
    hostname: str,
    is_primary: bool = False,
    is_verified: bool = True,
    is_active: bool = True,
) -> DomainBindingOut:
    return DomainBindingOut(
        bindingId=uuid4(),
        hostname=hostname,
        source="custom",
        targetType="project_runtime",
        workspaceId=uuid4(),
        projectId=project_id,
        runtimeId=uuid4(),
        siteId=site_id,
        isPrimary=is_primary,
        isVerified=is_verified,
        isActive=is_active,
        certificateStatus="issued",
    )


def _runtime_config(
    monkeypatch: pytest.MonkeyPatch,
    *,
    project_id: UUID,
    bindings: list[DomainBindingOut],
) -> SiteRuntimeConfigMixin:
    service = SiteRuntimeConfigMixin()
    service.settings = cast(Settings, SimpleNamespace(database=SimpleNamespace(enabled=True)))
    service._repo = cast(SitesRepository, _FakeSitesRepository(project_id=project_id))
    service._domain_service = cast(DomainBindingService, _FakeDomainService(bindings))
    monkeypatch.setattr(
        service,
        "_load_project_core_settings",
        AsyncMock(return_value={"site": {"name": "Launch", "url": "https://legacy.example.com"}}),
    )
    monkeypatch.setattr(
        service,
        "_read_project_site_localization",
        AsyncMock(return_value=("en-US", "en-US", ["en-US"])),
    )
    monkeypatch.setattr(service, "_get_fonts_out", AsyncMock(return_value=[]))
    return service


@pytest.mark.asyncio
async def test_runtime_site_url_uses_routable_domain_instead_of_legacy_setting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    site_id = uuid4()
    primary = _binding(
        project_id=project_id,
        site_id=site_id,
        hostname="launch.example.com",
        is_primary=True,
    )
    service = _runtime_config(monkeypatch, project_id=project_id, bindings=[primary])

    runtime = await service.get_runtime(site_id=site_id, mode="public")

    assert runtime.site is not None
    assert runtime.site.url == "https://launch.example.com"


@pytest.mark.asyncio
async def test_runtime_site_url_stays_empty_without_a_routable_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    site_id = uuid4()
    unverified = _binding(
        project_id=project_id,
        site_id=site_id,
        hostname="pending.example.com",
        is_verified=False,
    )
    service = _runtime_config(monkeypatch, project_id=project_id, bindings=[unverified])

    runtime = await service.get_runtime(site_id=site_id, mode="public")

    assert runtime.site is not None
    assert runtime.site.url is None
