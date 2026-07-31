from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest
from src.modules.organization.workspaces.service import OrganizationWorkspaceService


async def test_create_workspace_rejects_name_too_long(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationWorkspaceService(settings)

    payload = OrganizationWorkspaceCreateRequest.model_construct(name="x" * 129, description=None, template="blank")
    with pytest.raises(BadRequest) as exc:
        await service.create_workspace(
            organization_id=uuid4(),
            user_id=uuid4(),
            payload=payload,
        )

    assert exc.value.error == "WORKSPACE_NAME_TOO_LONG"
