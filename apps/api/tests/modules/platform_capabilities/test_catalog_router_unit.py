from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.config import get_settings
from src.core.exceptions import ServiceUnavailable, init_exception_handlers
from src.core.registry import create_app, create_platform_app
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityRolloutApplyReceipt,
    WorkspaceCapabilityRolloutApplyRequest,
    WorkspaceCapabilityRolloutImpactSummary,
    WorkspaceCapabilityRolloutPolicy,
    WorkspaceCapabilityRolloutPreview,
    WorkspaceCapabilityRolloutPreviewRequest,
    WorkspaceCapabilityRolloutStage,
)
from src.modules.platform_capabilities.rollout_service import WorkspaceCapabilityEligibilityRegistry
from src.modules.platform_capabilities.router import get_workspace_capability_rollout_service, router
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from tests.utils.asgi_client import asgi_client


class _PermissionRepository:
    async def list_effective_permission_codes(self, **_kwargs: object) -> frozenset[str]:
        return frozenset({PlatformPermissionCode.TENANT_WORKSPACES_READ.value})


def _operator_principal() -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )


def _owner_principal() -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=None,
        is_instance_owner=True,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )


class _RolloutService:
    def __init__(self) -> None:
        self.preview_request: WorkspaceCapabilityRolloutPreviewRequest | None = None
        self.apply_request: WorkspaceCapabilityRolloutApplyRequest | None = None

    async def create_preview(
        self, *, capability_id: str, request: WorkspaceCapabilityRolloutPreviewRequest
    ) -> WorkspaceCapabilityRolloutPreview:
        self.preview_request = request
        return WorkspaceCapabilityRolloutPreview(
            id=uuid4(),
            capability_id=capability_id,
            source_policy=WorkspaceCapabilityRolloutPolicy(
                capability_id=capability_id,
                stage=WorkspaceCapabilityRolloutStage.NOT_AVAILABLE,
                revision=0,
                selection_revision=0,
                selected_workspace_ids=(),
            ),
            proposed_stage=request.proposed_stage,
            proposed_selected_workspace_ids=request.selected_workspace_ids,
            capability_revision=1,
            eligibility_revision=1,
            eligibility_snapshot_hash="test",
            operational_consequences=(),
            workspaces=(),
            expires_at=datetime.now(UTC),
            summary=WorkspaceCapabilityRolloutImpactSummary(
                affected_workspace_count=0,
                eligible_workspace_count=0,
                ineligible_workspace_count=0,
                selected_workspace_count=0,
                newly_available_workspace_ids=(),
                no_longer_available_workspace_ids=(),
                blocked_workspace_count=0,
            ),
        )

    async def apply(
        self, *, principal: PlatformSessionPrincipal, request: WorkspaceCapabilityRolloutApplyRequest
    ) -> WorkspaceCapabilityRolloutApplyReceipt:
        _ = principal
        self.apply_request = request
        return WorkspaceCapabilityRolloutApplyReceipt(
            capability_id="tenant-governance",
            rollout_revision=1,
            selection_revision=0,
            applied_at=datetime.now(UTC),
        )


@pytest.mark.asyncio
async def test_catalog_requires_platform_session() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router)

    async with asgi_client(app) as client:
        response = await client.get("/capabilities")

    assert response.status_code == 401
    assert response.json()["error"] == "PLATFORM_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_operator_catalog_is_camel_case_and_permission_filtered() -> None:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_platform_session] = _operator_principal
    app.dependency_overrides[get_platform_identity_repository] = _PermissionRepository

    async with asgi_client(app) as client:
        response = await client.get("/capabilities")

    assert response.status_code == 200
    assert response.json()["data"]["items"] == [
        {
            "capabilityId": "tenant-governance",
            "domain": "tenant_governance",
            "nameI18nKey": "navigation:WORKSPACES",
            "descriptionI18nKey": "tenants:WORKSPACES_DESCRIPTION",
            "supportState": "supported",
            "enablementState": "enabled",
            "readinessState": "ready",
            "missingPrerequisiteCodes": [],
            "runtimeHealth": "not_reported",
            "routeTarget": "tenants.workspaces",
            "navigationTargets": [
                {
                    "routeTarget": "tenants.workspaces",
                    "requiredViewPermissions": ["platform:tenant-workspaces:read"],
                    "viewPermissionMatch": "all",
                }
            ],
            "requiredViewPermissions": ["platform:tenant-workspaces:read"],
            "viewPermissionMatch": "all",
            "requiredManagePermissions": ["platform:tenant-workspaces:manage"],
            "managePermissionMatch": "all",
            "canManage": False,
            "navigationCandidate": True,
            "activationAvailable": False,
        }
    ]


def test_catalog_route_is_mounted_only_in_platform_composition() -> None:
    product_paths = {route.path for route in create_app().routes if isinstance(route, APIRoute)}
    platform_paths = {route.path for route in create_platform_app().routes if isinstance(route, APIRoute)}

    assert "/platform-api/v1/capabilities" in platform_paths
    assert "/platform-api/v1/capabilities" not in product_paths


def test_workspace_capability_rollout_composition_retires_ai_services_eligibility() -> None:
    service = get_workspace_capability_rollout_service(
        settings=get_settings(),
        identity_repository=cast(PlatformIdentityRepository, _PermissionRepository()),
    )
    eligibility = cast(WorkspaceCapabilityEligibilityRegistry, service._eligibility)

    assert "ai-services" not in service._rollout_capability_ids
    with pytest.raises(ServiceUnavailable, match="WORKSPACE_CAPABILITY_ELIGIBILITY_UNREGISTERED"):
        eligibility._registered("ai-services")


@pytest.mark.asyncio
async def test_workspace_capability_rollout_routes_use_platform_authority_and_typed_contracts() -> None:
    app = FastAPI()
    app.include_router(router)
    rollout_service = _RolloutService()
    app.dependency_overrides[get_current_platform_session] = _owner_principal
    app.dependency_overrides[get_workspace_capability_rollout_service] = lambda: rollout_service

    async with asgi_client(app) as client:
        preview = await client.post(
            "/capabilities/tenant-governance/rollout/previews",
            json={"proposedStage": "all_eligible", "selectedWorkspaceIds": []},
        )
        apply = await client.post(
            "/capabilities/rollout/applies",
            json={
                "previewId": preview.json()["data"]["id"],
                "idempotencyKey": "rollout-apply-1",
                "reason": "Controlled adoption",
            },
        )

    assert preview.status_code == 200
    assert apply.status_code == 200
    assert rollout_service.preview_request is not None
    assert rollout_service.preview_request.proposed_stage is WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE
    assert rollout_service.apply_request is not None
    assert rollout_service.apply_request.idempotency_key == "rollout-apply-1"
