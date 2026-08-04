from __future__ import annotations

import inspect
from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.modules.analytics.system import router as analytics_router
from src.modules.commerce import platform_router as commerce_router
from src.modules.feedback import system_router as feedback_router
from src.modules.observability import system_router as observability_router
from src.modules.platform_capabilities import router as platform_capabilities_router
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.agents import router as agents_router
from src.modules.system.ai_providers import router as ai_providers_router
from src.modules.system.mail import router as mail_router
from src.modules.system.skills import router as skills_router
from src.modules.system.storage_profiles import router as storage_router
from tests.utils.asgi_client import asgi_client


def _route_permissions(routes: Iterable[APIRoute]) -> dict[str, PlatformPermissionCode]:
    permissions: dict[str, PlatformPermissionCode] = {}
    for route in routes:
        dependencies = list(route.dependant.dependencies)
        while dependencies:
            dependency = dependencies.pop()
            dependencies.extend(dependency.dependencies)
            if not inspect.isfunction(dependency.call):
                continue
            permission_code = inspect.getclosurevars(dependency.call).nonlocals.get("permission_code")
            if permission_code is not None:
                endpoint_name = getattr(route.endpoint, "__name__", None)
                assert isinstance(endpoint_name, str)
                permissions[endpoint_name] = PlatformPermissionCode(permission_code)
    return permissions


@pytest.mark.parametrize(
    ("routes", "expected"),
    [
        (
            analytics_router.router.routes,
            {
                "list_activity": PlatformPermissionCode.MONITORING_AUDIT_READ,
                "get_activity_detail": PlatformPermissionCode.MONITORING_AUDIT_READ,
            },
        ),
        (
            observability_router.router.routes,
            {
                "get_platform_observability_trend": PlatformPermissionCode.MONITORING_REQUESTS_READ,
                "list_platform_http_request_groups": PlatformPermissionCode.MONITORING_REQUESTS_READ,
                "list_platform_http_request_records": PlatformPermissionCode.MONITORING_REQUESTS_READ,
                "list_platform_ai_usage_groups": PlatformPermissionCode.MONITORING_REQUESTS_READ,
            },
        ),
        (
            commerce_router.router.routes,
            {
                "list_commerce_plans": PlatformPermissionCode.COMMERCE_READ,
                "list_commerce_plan_revisions": PlatformPermissionCode.COMMERCE_READ,
                "list_platform_commerce_subscriptions": PlatformPermissionCode.COMMERCE_READ,
                "create_commerce_plan": PlatformPermissionCode.COMMERCE_CATALOG_MANAGE,
                "create_plan_revision": PlatformPermissionCode.COMMERCE_CATALOG_MANAGE,
                "update_plan_revision": PlatformPermissionCode.COMMERCE_CATALOG_MANAGE,
                "publish_plan_revision": PlatformPermissionCode.COMMERCE_CATALOG_MANAGE,
                "get_workspace_commerce_overview": PlatformPermissionCode.COMMERCE_READ,
                "get_platform_commerce_subscription": PlatformPermissionCode.COMMERCE_READ,
                "preview_subscription_revision_transition": PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE,
                "schedule_subscription_revision_transition": PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE,
                "get_subscription_revision_transition": PlatformPermissionCode.COMMERCE_READ,
                "cancel_subscription_revision_transition": PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE,
                "preview_workspace_subscription_correction": PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE,
                "apply_workspace_subscription_correction": PlatformPermissionCode.COMMERCE_SUBSCRIPTIONS_MANAGE,
                "get_commerce_provider": PlatformPermissionCode.COMMERCE_READ,
                "put_commerce_provider": PlatformPermissionCode.COMMERCE_PROVIDER_MANAGE,
                "get_commerce_dunning_policy": PlatformPermissionCode.COMMERCE_READ,
                "put_commerce_dunning_policy": PlatformPermissionCode.COMMERCE_PROVIDER_MANAGE,
                "list_commerce_provider_events": PlatformPermissionCode.COMMERCE_READ,
                "reconcile_commerce_provider_event": PlatformPermissionCode.COMMERCE_EVENTS_RECONCILE,
                "adjust_workspace_credits": PlatformPermissionCode.COMMERCE_CREDITS_ADJUST,
            },
        ),
        (
            feedback_router.router.routes,
            {
                "list_platform_feedback": PlatformPermissionCode.MESSAGES_FEEDBACK_READ,
                "get_platform_feedback_detail": PlatformPermissionCode.MESSAGES_FEEDBACK_READ,
                "update_platform_feedback": PlatformPermissionCode.MESSAGES_FEEDBACK_MANAGE,
                "add_platform_feedback_message": PlatformPermissionCode.MESSAGES_FEEDBACK_MANAGE,
                "retry_platform_feedback_reply_delivery": PlatformPermissionCode.MESSAGES_DELIVERY_RETRY,
            },
        ),
        (
            ai_providers_router.router.routes,
            {
                "list_system_ai_providers": PlatformPermissionCode.AI_PROVIDERS_READ,
                "create_system_ai_provider": PlatformPermissionCode.AI_PROVIDERS_MANAGE,
                "update_system_ai_provider": PlatformPermissionCode.AI_PROVIDERS_MANAGE,
                "delete_system_ai_provider": PlatformPermissionCode.AI_PROVIDERS_MANAGE,
                "preview_system_ai_provider_availability": PlatformPermissionCode.AI_PROVIDERS_MANAGE,
                "apply_system_ai_provider_availability": PlatformPermissionCode.AI_PROVIDERS_MANAGE,
                "test_system_ai_provider_readiness": PlatformPermissionCode.AI_PROVIDERS_MANAGE,
            },
        ),
        (
            agents_router.router.routes,
            {
                "get_system_agent_capabilities": PlatformPermissionCode.AI_AGENTS_READ,
                "list_system_agents": PlatformPermissionCode.AI_AGENTS_READ,
                "create_system_agent": PlatformPermissionCode.AI_AGENTS_MANAGE,
                "get_system_agent": PlatformPermissionCode.AI_AGENTS_READ,
                "update_system_agent": PlatformPermissionCode.AI_AGENTS_MANAGE,
                "list_system_agent_versions": PlatformPermissionCode.AI_AGENTS_READ,
                "create_system_agent_version": PlatformPermissionCode.AI_AGENTS_MANAGE,
                "retire_system_agent_version": PlatformPermissionCode.AI_AGENTS_MANAGE,
            },
        ),
        (
            agents_router.assignments_router.routes,
            {
                "list_system_agent_assignments": PlatformPermissionCode.AI_ASSIGNMENTS_READ,
            },
        ),
        (
            skills_router.router.routes,
            {
                "list_platform_skills": PlatformPermissionCode.AI_SKILLS_READ,
                "create_platform_skill": PlatformPermissionCode.AI_SKILLS_MANAGE,
                "get_platform_skill_capabilities": PlatformPermissionCode.AI_SKILLS_READ,
                "import_platform_skill_zip": PlatformPermissionCode.AI_SKILLS_MANAGE,
                "import_platform_skill_github": PlatformPermissionCode.AI_SKILLS_MANAGE,
                "get_platform_skill": PlatformPermissionCode.AI_SKILLS_READ,
                "update_platform_skill": PlatformPermissionCode.AI_SKILLS_MANAGE,
                "replace_platform_skill": PlatformPermissionCode.AI_SKILLS_MANAGE,
                "create_platform_skill_version": PlatformPermissionCode.AI_SKILLS_MANAGE,
                "archive_platform_skill": PlatformPermissionCode.AI_SKILLS_MANAGE,
            },
        ),
        (
            storage_router.router.routes,
            {
                "list_storage_profiles": PlatformPermissionCode.SITE_STORAGE_READ,
                "create_storage_profile": PlatformPermissionCode.SITE_STORAGE_MANAGE,
                "update_storage_profile": PlatformPermissionCode.SITE_STORAGE_MANAGE,
                "test_storage_profile": PlatformPermissionCode.SITE_STORAGE_MANAGE,
                "test_storage_profile_by_key": PlatformPermissionCode.SITE_STORAGE_MANAGE,
                "delete_storage_profile": PlatformPermissionCode.SITE_STORAGE_MANAGE,
            },
        ),
        (
            mail_router.router.routes,
            {
                "get_mail_service_profile": PlatformPermissionCode.MESSAGES_MAIL_READ,
                "update_mail_service_profile": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "write_mail_service_credentials": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "rotate_mail_service_credentials": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "test_mail_service_profile": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "disable_mail_service_profile": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "recover_mail_service_profile": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "send_test_email": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "list_mail_providers": PlatformPermissionCode.MESSAGES_MAIL_READ,
                "switch_mail_provider": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "list_email_templates": PlatformPermissionCode.MESSAGES_MAIL_READ,
                "preview_email_template": PlatformPermissionCode.MESSAGES_MAIL_READ,
                "get_email_template_revision": PlatformPermissionCode.MESSAGES_MAIL_READ,
                "list_email_template_history": PlatformPermissionCode.MESSAGES_MAIL_READ,
                "create_email_template": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "update_email_template": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "delete_email_template": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "restore_default_email_template": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "test_send_email_template": PlatformPermissionCode.MESSAGES_MAIL_MANAGE,
                "get_email_template": PlatformPermissionCode.MESSAGES_MAIL_READ,
            },
        ),
        (
            platform_capabilities_router.router.routes,
            {
                "preview_workspace_capability_rollout": PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY,
                "apply_workspace_capability_rollout": PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY,
            },
        ),
    ],
)
def test_platform_routes_require_one_exact_permission(
    routes: list[APIRoute],
    expected: dict[str, PlatformPermissionCode],
) -> None:
    assert _route_permissions(routes) == expected


class _DeniedRepository:
    def __init__(self) -> None:
        self.requested_permissions: list[str] = []

    async def operator_has_permission(self, *, permission_code: str, **_kwargs: object) -> bool:
        self.requested_permissions.append(permission_code)
        return False


@pytest.mark.asyncio
async def test_platform_route_denies_operator_without_its_exact_permission() -> None:
    repository = _DeniedRepository()
    principal = PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )

    async def _platform_principal() -> PlatformSessionPrincipal:
        return principal

    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(analytics_router.router, prefix="/activity")
    app.dependency_overrides[get_current_platform_session] = _platform_principal
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository

    async with asgi_client(app) as client:
        response = await client.get("/activity")

    assert response.status_code == 403
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"
    assert repository.requested_permissions == [PlatformPermissionCode.MONITORING_AUDIT_READ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/capabilities/tenant-governance/rollout/previews", {"proposedStage": "all_eligible"}),
        (
            "/capabilities/rollout/applies",
            {"previewId": str(uuid4()), "idempotencyKey": "rollout-apply", "reason": "Controlled adoption"},
        ),
    ],
)
async def test_workspace_capability_rollout_routes_deny_operator_without_apply_permission(
    path: str, payload: dict[str, str]
) -> None:
    repository = _DeniedRepository()
    principal = PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )

    async def _platform_principal() -> PlatformSessionPrincipal:
        return principal

    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(platform_capabilities_router.router)
    app.dependency_overrides[get_current_platform_session] = _platform_principal
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository

    async with asgi_client(app) as client:
        response = await client.post(path, json=payload)

    assert response.status_code == 403
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"
    assert repository.requested_permissions == [PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY]
