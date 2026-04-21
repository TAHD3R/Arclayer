from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.organization.org_rbac import OrganizationPermission, OrganizationRole
from src.modules.organization.rbac import service as rbac_service_module
from src.modules.organization.rbac.service import (
    _BUILTIN_ROLE_RULES,
    OrganizationRBACService,
)
from src.modules.workspaces.permissions import get_organization_permission_catalog


class _FakeOrganizationRBACRepo:
    def __init__(self) -> None:
        self.created_roles: list[dict[str, object]] = []

    async def upsert_permission(self, *, code: str, module: str, name: str, description: str | None):
        return SimpleNamespace(id=uuid4(), code=code, module=module, name=name, description=description)

    async def get_role_by_code(self, *, organization_id, code: str):
        _ = organization_id, code
        return None

    async def create_role(self, **kwargs):
        self.created_roles.append(dict(kwargs))
        return SimpleNamespace(id=uuid4(), **kwargs)

    async def replace_role_permissions(self, *, role, permission_ids):
        _ = role, permission_ids
        return None


@pytest.mark.asyncio
async def test_organization_rbac_localize_role_uses_i18n_refs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationRBACService(settings)

    role = SimpleNamespace(
        id=uuid4(),
        code="owner",
        name="Owner",
        description="Full organization control",
        name_i18n="rbac:ORG_RBAC_ROLE_OWNER_NAME",
        description_i18n="rbac:ORG_RBAC_ROLE_OWNER_DESC",
        is_system=True,
        is_builtin=True,
    )

    localized = service.localize_role(cast(OrganizationRole, role))

    assert localized["name"]
    assert localized["description"]


@pytest.mark.asyncio
async def test_organization_rbac_ensure_defaults_creates_builtin_roles_with_i18n_refs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationRBACService(settings)
    fake_repo = _FakeOrganizationRBACRepo()
    service.repo = fake_repo  # type: ignore[assignment]

    await service.ensure_defaults(organization_id=uuid4())

    assert fake_repo.created_roles
    owner_payload = next((payload for payload in fake_repo.created_roles if payload.get("code") == "owner"), None)
    assert owner_payload is not None
    assert owner_payload.get("name_i18n")
    assert owner_payload.get("description_i18n")


def test_organization_rbac_sensitive_permissions_have_owner_only_defaults() -> None:
    permission_codes = set(get_organization_permission_catalog())

    assert "org.workspaces.delete" in permission_codes
    assert "org.settings.assign-default-role" in permission_codes
    assert "org.settings.delete" in permission_codes

    owner_codes = _BUILTIN_ROLE_RULES["owner"]
    admin_codes = _BUILTIN_ROLE_RULES["admin"]

    assert "org.workspaces.delete" in owner_codes
    assert "org.settings.assign-default-role" in owner_codes
    assert "org.settings.delete" in owner_codes

    assert "org.workspaces.delete" not in admin_codes
    assert "org.settings.assign-default-role" not in admin_codes
    assert "org.settings.delete" not in admin_codes


def test_organization_rbac_permission_i18n_map_covers_all_templates() -> None:
    catalog = get_organization_permission_catalog()

    assert all(definition.name_i18n for definition in catalog.values())
    assert all(definition.description_i18n for definition in catalog.values())


def test_organization_rbac_localize_permission_uses_i18n_map(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationRBACService(settings)

    monkeypatch.setattr(
        rbac_service_module,
        "t",
        lambda namespace, key, default=None: f"{namespace}:{key}:{default}",
    )

    permission = SimpleNamespace(
        id=uuid4(),
        code="org.settings.delete",
        module="settings",
        name="Delete organization",
        description="Delete organization and all scoped settings.",
    )

    localized = service.localize_permission(cast(OrganizationPermission, permission))

    assert localized["name"] == "common:ORG_ROLE_PERMISSION_SETTINGS_DELETE:Delete organization"
    assert (
        localized["description"]
        == "common:ORG_ROLE_PERMISSION_SETTINGS_DELETE_DESC:Delete organization and all scoped settings."
    )


def test_organization_rbac_localize_permission_keeps_raw_when_no_i18n_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationRBACService(settings)
    permission = SimpleNamespace(
        id=uuid4(),
        code="org.unknown.read",
        module="unknown",
        name="Unknown permission",
        description="Unknown description.",
    )

    localized = service.localize_permission(cast(OrganizationPermission, permission))

    assert localized["name"] == "Unknown permission"
    assert localized["description"] == "Unknown description."
