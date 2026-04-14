from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.models.organization.org_membership import OrgRole
from src.modules.organization.router import create_my_organization
from src.modules.organization.schema import CreateMyOrganizationRequest
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest
from src.modules.organization.workspaces.service import OrganizationWorkspaceService


async def test_create_organization_rejects_name_too_long(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings()

    payload = CreateMyOrganizationRequest.model_construct(name="x" * 129, slug=None)
    with pytest.raises(BadRequest) as exc:
        await create_my_organization(payload, user_id=uuid4())

    assert exc.value.error == "ORG_NAME_TOO_LONG"


async def test_create_workspace_rejects_name_too_long(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationWorkspaceService(settings)

    payload = OrganizationWorkspaceCreateRequest.model_construct(name="x" * 129, description=None, template="blank")
    with pytest.raises(BadRequest) as exc:
        await service.create_workspace(
            organization_id=uuid4(),
            user_id=uuid4(),
            org_role=OrgRole.OWNER,
            payload=payload,
        )

    assert exc.value.error == "WORKSPACE_NAME_TOO_LONG"
