from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest
from src.modules.organization.workspaces.service import OrganizationWorkspaceService


class _GuidanceLayerProvisioner:
    def __init__(self) -> None:
        self.workspace_calls: list[dict[str, object]] = []
        self.project_calls: list[dict[str, object]] = []

    async def provision_workspace_layer(self, **kwargs: object) -> None:
        self.workspace_calls.append(kwargs)

    async def provision_project_layer(self, **kwargs: object) -> None:
        self.project_calls.append(kwargs)


async def test_create_workspace_rejects_name_too_long(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    provisioner = _GuidanceLayerProvisioner()
    service = OrganizationWorkspaceService(
        settings,
        guidance_layer_provisioner=provisioner,
    )

    payload = OrganizationWorkspaceCreateRequest.model_construct(name="x" * 129, description=None, template="blank")
    with pytest.raises(BadRequest) as exc:
        await service.create_workspace(
            organization_id=uuid4(),
            user_id=uuid4(),
            payload=payload,
        )

    assert exc.value.error == "WORKSPACE_NAME_TOO_LONG"
    assert provisioner.workspace_calls == []
