from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.models.skills._enums import SkillPackageScope
from src.modules.workspaces.skills import default_provisioner as provisioner_module
from src.modules.workspaces.skills.default_provisioner import DefaultWorkspaceOfficialSkillProvisioner
from src.modules.workspaces.skills.schema import SkillInstallationCreateRequest

pytestmark = pytest.mark.unit


class _CatalogService:
    package_ids = (uuid4(), uuid4())
    version_ids = (uuid4(), uuid4())

    def __init__(self, **_kwargs: object) -> None:
        pass

    async def list_catalog(self, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            items=tuple(
                SimpleNamespace(package_id=package_id, version_id=version_id)
                for package_id, version_id in zip(self.package_ids, self.version_ids, strict=True)
            )
        )

    async def resolve_installation_target(
        self,
        *,
        package_id: UUID,
        version_id: UUID,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            package_checksum="sha256:" + ("a" * 64),
            validation_finding_hash="sha256:" + ("b" * 64),
            manifest=SimpleNamespace(
                required_tools=(SimpleNamespace(tool_id=f"tool.{package_id.hex[:8]}"),),
                permissions=(SimpleNamespace(action="content.read"),),
                data_egress=(SimpleNamespace(destination="none"),),
            ),
            version_id=version_id,
        )


class _LifecycleService:
    calls: list[dict[str, object]] = []
    installations_by_key: dict[str, SimpleNamespace] = {}

    def __init__(self, **_kwargs: object) -> None:
        pass

    async def create_installation(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        key = str(kwargs["idempotency_key"])
        return self.installations_by_key.setdefault(key, SimpleNamespace(id=uuid4(), status="enabled"))


@pytest.mark.asyncio
async def test_default_provisioner_installs_all_official_skills_idempotently(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    actor_user_id = uuid4()
    tenant_context = object()
    _LifecycleService.calls.clear()
    _LifecycleService.installations_by_key.clear()

    async def _tenant_context(**_kwargs: object) -> object:
        return tenant_context

    monkeypatch.setattr(provisioner_module, "ensure_workspace_tenant_context", _tenant_context)
    monkeypatch.setattr(provisioner_module, "WorkspaceSkillLifecycleRepository", lambda _context: object())
    monkeypatch.setattr(provisioner_module, "WorkspaceSkillsRepository", lambda _context: object())
    monkeypatch.setattr(provisioner_module, "OfficialSkillCatalogRepository", lambda: object())
    monkeypatch.setattr(provisioner_module, "WorkspaceOfficialSkillCatalogService", _CatalogService)
    monkeypatch.setattr(provisioner_module, "WorkspaceSkillLifecycleService", _LifecycleService)
    provisioner = DefaultWorkspaceOfficialSkillProvisioner(cast(Settings, object()))

    for _ in range(2):
        await provisioner.provision(
            organization_id=organization_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )

    assert len(_LifecycleService.calls) == 4
    assert len(_LifecycleService.installations_by_key) == 2
    assert set(_LifecycleService.installations_by_key) == {
        f"official-default:{package_id}" for package_id in _CatalogService.package_ids
    }
    for call in _LifecycleService.calls:
        assert call["workspace_id"] == workspace_id
        assert call["organization_id"] == organization_id
        assert call["actor_user_id"] == actor_user_id
        payload = cast(SkillInstallationCreateRequest, call["payload"])
        assert payload.package_scope == SkillPackageScope.SYSTEM
        assert payload.accepted_permissions == ("content.read",)
        assert payload.accepted_data_egress == ("none",)
        assert len(payload.accepted_required_tools) == 1
