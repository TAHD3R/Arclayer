from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.exceptions import APIError, Conflict, NotFound
from src.core.exceptions.handlers import init_exception_handlers
from src.core.http.pagination import PageParams
from src.models.commerce.billing import ResourceLimitKind
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import (
    WorkspaceEntitlementAvailability,
    build_workspace_entitlement_availability,
    has_workspace_commerce_manage_access,
    require_workspace_commerce_manage_access,
)
from src.modules.commerce.entitlement_schema import EntitlementDecision
from src.modules.commerce.member_credit_read_service import MemberCreditReadScope, MemberCreditReadService
from src.modules.commerce.member_credit_router import (
    get_member_credit_configuration_service,
    get_member_credit_read_service,
    list_member_credit_usage,
    router,
    set_default_member_credit_limit,
    set_member_credit_override,
)
from src.modules.commerce.member_credit_schema import (
    MemberCreditConfigurationMutationOut,
    MemberCreditDefaultLimitWrite,
    MemberCreditLimitItemOut,
    MemberCreditLimitOut,
    MemberCreditLimitsPageOut,
    MemberCreditOverrideWrite,
    MemberCreditUsageItemOut,
    MemberCreditUsagePageOut,
)
from src.modules.commerce.member_credit_service import MemberCreditConfigurationService
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from src.modules.workspaces.http.service import get_workspace_context, require_workspace_member_access
from src.modules.workspaces.team.schema import WorkspaceTeamUserRefOut
from tests.utils.asgi_client import asgi_client


class _ReadService:
    def __init__(self, *, usage: MemberCreditUsagePageOut, limits: MemberCreditLimitsPageOut) -> None:
        self.usage = usage
        self.limits = limits
        self.usage_calls: list[dict[str, object]] = []
        self.limit_calls: list[dict[str, object]] = []

    async def list_usage(self, **kwargs: object) -> MemberCreditUsagePageOut:
        self.usage_calls.append(kwargs)
        return self.usage

    async def list_limits(self, **kwargs: object) -> MemberCreditLimitsPageOut:
        self.limit_calls.append(kwargs)
        return self.limits


class _ConfigurationService:
    def __init__(self, result: MemberCreditConfigurationMutationOut) -> None:
        self.result = result
        self.default_calls: list[dict[str, object]] = []
        self.override_calls: list[dict[str, object]] = []

    async def set_default_limit(self, **kwargs: object) -> MemberCreditConfigurationMutationOut:
        self.default_calls.append(kwargs)
        return self.result

    async def set_member_override(self, **kwargs: object) -> MemberCreditConfigurationMutationOut:
        self.override_calls.append(kwargs)
        return self.result


class _DeniedEntitlements:
    async def check(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> EntitlementDecision:
        _ = conn
        return EntitlementDecision(
            workspace_id=workspace_id,
            entitlement=entitlement,
            granted=False,
            reason="feature_excluded",
        )


def _context(workspace_id: UUID, membership_id: UUID, *, owner: bool = False) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=membership_id,
        is_workspace_owner=owner,
    )


def _outputs(
    workspace_id: UUID,
    membership_id: UUID,
) -> tuple[MemberCreditUsagePageOut, MemberCreditLimitsPageOut, MemberCreditConfigurationMutationOut]:
    now = datetime.now(UTC)
    period_end = now + timedelta(days=30)
    limit = MemberCreditLimitOut(limit_kind=ResourceLimitKind.LIMITED, limit_credits=50)
    user = WorkspaceTeamUserRefOut(user_id=uuid4(), username="member", display_name="Member")
    usage_item = MemberCreditUsageItemOut(
        membership_id=membership_id,
        user=user,
        is_owner=False,
        effective_limit=limit,
        reserved_credits=3,
        committed_credits=4,
        available_credits=43,
    )
    limit_item = MemberCreditLimitItemOut(**usage_item.model_dump(), override_limit=None)
    usage = MemberCreditUsagePageOut(
        items=[usage_item],
        total=1,
        page=1,
        size=20,
        pages=1,
        next=None,
        prev=None,
        period_start=now,
        period_end=period_end,
    )
    limits = MemberCreditLimitsPageOut(
        items=[limit_item],
        total=1,
        page=1,
        size=20,
        pages=1,
        next=None,
        prev=None,
        default_limit=limit,
        configuration_revision=2,
        period_start=now,
        period_end=period_end,
    )
    mutation = MemberCreditConfigurationMutationOut(
        workspace_id=workspace_id,
        membership_id=None,
        default_limit=limit,
        override_limit=None,
        effective_limit=limit,
        configuration_revision=2,
    )
    return usage, limits, mutation


def _app(
    *,
    ctx: WorkspaceContext,
    actor_user_id: UUID,
    can_manage: bool,
    read_service: _ReadService,
    configuration_service: _ConfigurationService,
) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_member_access] = lambda: ctx
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: ctx
    app.dependency_overrides[has_workspace_commerce_manage_access] = lambda: can_manage
    app.dependency_overrides[get_current_user_id] = lambda: actor_user_id
    app.dependency_overrides[get_member_credit_read_service] = lambda: read_service
    app.dependency_overrides[get_member_credit_configuration_service] = lambda: configuration_service
    return app


@pytest.mark.asyncio
async def test_member_credit_router_registers_canonical_paths_and_projects_self_or_all() -> None:
    workspace_id = uuid4()
    membership_id = uuid4()
    usage, limits, mutation = _outputs(workspace_id, membership_id)
    read_service = _ReadService(usage=usage, limits=limits)
    configuration_service = _ConfigurationService(mutation)
    ctx = _context(workspace_id, membership_id)
    app = _app(
        ctx=ctx,
        actor_user_id=uuid4(),
        can_manage=False,
        read_service=read_service,
        configuration_service=configuration_service,
    )

    async with asgi_client(app) as client:
        usage_response = await client.get(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/member-usage?page=2&size=5"
        )
        limits_response = await client.get(f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/member-limits")

    assert usage_response.status_code == 200
    assert usage_response.json()["data"]["items"][0]["availableCredits"] == 43
    assert usage_response.json()["data"]["items"][0]["membershipId"] == encode_uuid(membership_id)
    assert read_service.usage_calls[0]["scope"] is MemberCreditReadScope.SELF
    assert read_service.usage_calls[0]["actor_membership_id"] == membership_id
    assert cast(PageParams, read_service.usage_calls[0]["params"]).page == 2
    assert limits_response.status_code == 200
    assert read_service.limit_calls == [{"workspace_id": workspace_id, "params": read_service.limit_calls[0]["params"]}]
    paths = {path for route in app.routes if (path := getattr(route, "path", None)) is not None}
    assert {
        "/api/v1/workspaces/{workspace_id}/commerce/member-usage",
        "/api/v1/workspaces/{workspace_id}/commerce/member-limits",
        "/api/v1/workspaces/{workspace_id}/commerce/member-limits/default",
        "/api/v1/workspaces/{workspace_id}/commerce/member-limits/{membership_id}",
    }.issubset(paths)


@pytest.mark.asyncio
async def test_member_credit_usage_router_projects_all_for_authorized_manager() -> None:
    workspace_id = uuid4()
    membership_id = uuid4()
    usage, limits, _ = _outputs(workspace_id, membership_id)
    read_service = _ReadService(usage=usage, limits=limits)

    await list_member_credit_usage(
        ctx=_context(workspace_id, membership_id),
        can_manage_commerce=True,
        params=PageParams(),
        service=cast(MemberCreditReadService, read_service),
    )

    assert read_service.usage_calls[0]["scope"] is MemberCreditReadScope.ALL


@pytest.mark.asyncio
async def test_member_credit_limits_and_mutations_reject_ordinary_member() -> None:
    workspace_id = uuid4()
    membership_id = uuid4()
    actor_user_id = uuid4()
    usage, limits, mutation = _outputs(workspace_id, membership_id)
    read_service = _ReadService(usage=usage, limits=limits)
    configuration_service = _ConfigurationService(mutation)
    ctx = _context(workspace_id, membership_id)
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_workspace_context] = lambda: ctx
    app.dependency_overrides[get_current_user_id] = lambda: actor_user_id
    app.dependency_overrides[build_workspace_entitlement_availability] = lambda: cast(
        WorkspaceEntitlementAvailability,
        _DeniedEntitlements(),
    )
    app.dependency_overrides[get_member_credit_read_service] = lambda: read_service
    app.dependency_overrides[get_member_credit_configuration_service] = lambda: configuration_service

    async with asgi_client(app) as client:
        limits_response = await client.get(f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/member-limits")
        mutation_response = await client.put(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/member-limits/default",
            json={
                "limitKind": "limited",
                "limitCredits": 75,
                "expectedRevision": 1,
                "idempotencyKey": "denied-default",
            },
        )

    assert limits_response.status_code == 403
    assert limits_response.json()["error"] == "WORKSPACE_COMMERCE_MANAGE_REQUIRED"
    assert mutation_response.status_code == 403
    assert mutation_response.json()["error"] == "WORKSPACE_COMMERCE_MANAGE_REQUIRED"
    assert read_service.limit_calls == []
    assert configuration_service.default_calls == []


@pytest.mark.asyncio
async def test_member_credit_router_passes_mutation_actor_path_body_and_idempotency() -> None:
    workspace_id = uuid4()
    membership_id = uuid4()
    actor_user_id = uuid4()
    usage, limits, mutation = _outputs(workspace_id, membership_id)
    read_service = _ReadService(usage=usage, limits=limits)
    configuration_service = _ConfigurationService(mutation)
    app = _app(
        ctx=_context(workspace_id, membership_id),
        actor_user_id=actor_user_id,
        can_manage=True,
        read_service=read_service,
        configuration_service=configuration_service,
    )

    async with asgi_client(app) as client:
        default_response = await client.put(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/member-limits/default",
            json={
                "limitKind": "limited",
                "limitCredits": 75,
                "expectedRevision": 1,
                "idempotencyKey": "default-75",
            },
        )
        override_response = await client.put(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/member-limits/{encode_uuid(membership_id)}",
            json={
                "action": "clear",
                "expectedRevision": 2,
                "idempotencyKey": "clear-member",
            },
        )

    assert default_response.status_code == 200
    assert override_response.status_code == 200
    assert default_response.json()["data"]["workspaceId"] == encode_uuid(workspace_id)
    default_call = configuration_service.default_calls[0]
    assert default_call["workspace_id"] == workspace_id
    assert default_call["actor_user_id"] == actor_user_id
    assert cast(MemberCreditDefaultLimitWrite, default_call["command"]).idempotency_key == "default-75"
    override_call = configuration_service.override_calls[0]
    assert override_call["membership_id"] == membership_id
    assert cast(MemberCreditOverrideWrite, override_call["command"]).action == "clear"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "code"),
    [
        (
            Conflict(error="WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT"),
            "WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT",
        ),
        (Conflict(error="WORKSPACE_MEMBER_CREDIT_REVISION_STALE"), "WORKSPACE_MEMBER_CREDIT_REVISION_STALE"),
        (NotFound(error="WORKSPACE_MEMBER_NOT_FOUND"), "WORKSPACE_MEMBER_NOT_FOUND"),
    ],
)
async def test_member_credit_router_preserves_service_error_codes(error: APIError, code: str) -> None:
    workspace_id = uuid4()
    membership_id = uuid4()

    class _FailingService:
        async def set_default_limit(self, **_kwargs: object):
            raise error

        async def set_member_override(self, **_kwargs: object):
            raise error

    service = cast(MemberCreditConfigurationService, _FailingService())
    ctx = _context(workspace_id, membership_id)
    with pytest.raises(APIError) as captured:
        if isinstance(error, NotFound):
            await set_member_credit_override(
                membership_id=membership_id,
                payload=MemberCreditOverrideWrite(
                    action="clear",
                    expected_revision=1,
                    idempotency_key="invalid-target",
                ),
                actor_user_id=uuid4(),
                ctx=ctx,
                service=service,
            )
        else:
            await set_default_member_credit_limit(
                payload=MemberCreditDefaultLimitWrite(
                    limit_kind=ResourceLimitKind.LIMITED,
                    limit_credits=25,
                    expected_revision=1,
                    idempotency_key="conflict",
                ),
                actor_user_id=uuid4(),
                ctx=ctx,
                service=service,
            )
    assert captured.value.error == code
