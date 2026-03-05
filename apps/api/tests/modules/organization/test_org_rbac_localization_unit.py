from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from apps.api.src.config import get_settings
from apps.api.src.modules.organization.rbac.service import OrganizationRBACService


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
    monkeypatch.setenv("JWT_SECRET", "test-secret")
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

    localized = service.localize_role(role)

    assert localized["name"]
    assert localized["description"]


@pytest.mark.asyncio
async def test_organization_rbac_ensure_defaults_creates_builtin_roles_with_i18n_refs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
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
