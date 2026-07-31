from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.core.registry import create_app, create_platform_app
from src.modules.operational_signals.router import router
from src.modules.platform_identity.http import get_current_platform_session, get_platform_identity_repository
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.unit


class _DeniedPermissionRepository:
    def __init__(self) -> None:
        self.permission_codes: list[str] = []

    async def operator_has_permission(self, *, operator_id, permission_code: str, at: datetime) -> bool:
        _ = operator_id, at
        self.permission_codes.append(permission_code)
        return False


def _app() -> tuple[FastAPI, _DeniedPermissionRepository]:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router)
    repository = _DeniedPermissionRepository()

    async def principal() -> PlatformSessionPrincipal:
        return PlatformSessionPrincipal(
            actor_id=uuid4(),
            session_id=uuid4(),
            operator_id=uuid4(),
            is_instance_owner=False,
            policy_revision=1,
            absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
        )

    app.dependency_overrides[get_current_platform_session] = principal
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository
    return app, repository


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "suffix", "payload", "expected_permission"),
    [
        ("get", "", None, PlatformPermissionCode.OPERATIONS_SIGNALS_READ),
        (
            "get",
            "/eligible-assignees",
            None,
            PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN,
        ),
        ("get", f"/{encode_uuid(uuid4())}", None, PlatformPermissionCode.OPERATIONS_SIGNALS_READ),
        (
            "post",
            f"/{encode_uuid(uuid4())}/claim",
            {"expectedRevision": 0},
            PlatformPermissionCode.OPERATIONS_SIGNALS_CLAIM,
        ),
        (
            "post",
            f"/{encode_uuid(uuid4())}/assign",
            {"expectedRevision": 0, "assigneeUserId": encode_uuid(uuid4())},
            PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN,
        ),
        (
            "post",
            f"/{encode_uuid(uuid4())}/in-progress",
            {"expectedRevision": 1},
            PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE,
        ),
        (
            "post",
            f"/{encode_uuid(uuid4())}/remind-later",
            {
                "expectedRevision": 1,
                "reminderAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                "reason": "Wait for the owning domain recovery window",
            },
            PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE,
        ),
        (
            "post",
            f"/{encode_uuid(uuid4())}/needs-attention",
            {"expectedRevision": 1},
            PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE,
        ),
    ],
)
async def test_each_route_denies_the_exact_missing_permission(
    method: str,
    suffix: str,
    payload: dict[str, object] | None,
    expected_permission: PlatformPermissionCode,
) -> None:
    app, repository = _app()
    async with asgi_client(app) as client:
        response = await client.request(method, f"/operational-signals{suffix}", json=payload)

    assert response.status_code == 403
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"
    assert repository.permission_codes == [expected_permission]


def test_router_exposes_only_the_canonical_triage_commands() -> None:
    paths = {route.path for route in router.routes if isinstance(route, APIRoute)}

    assert paths == {
        "/operational-signals",
        "/operational-signals/eligible-assignees",
        "/operational-signals/{signal_id}",
        "/operational-signals/{signal_id}/claim",
        "/operational-signals/{signal_id}/assign",
        "/operational-signals/{signal_id}/in-progress",
        "/operational-signals/{signal_id}/remind-later",
        "/operational-signals/{signal_id}/needs-attention",
    }
    assert not any(command in path for path in paths for command in ("dismiss", "close", "resolve"))


def test_compositions_mount_operational_signals_only_on_platform_api() -> None:
    product_paths = {route.path for route in create_app().routes if isinstance(route, APIRoute)}
    platform_paths = {route.path for route in create_platform_app().routes if isinstance(route, APIRoute)}
    product_signal_paths = {path for path in product_paths if "operational-signals" in path}
    platform_signal_paths = {path for path in platform_paths if "operational-signals" in path}

    assert product_signal_paths == set()
    assert platform_signal_paths == {
        "/platform-api/v1/operational-signals",
        "/platform-api/v1/operational-signals/eligible-assignees",
        "/platform-api/v1/operational-signals/{signal_id}",
        "/platform-api/v1/operational-signals/{signal_id}/claim",
        "/platform-api/v1/operational-signals/{signal_id}/assign",
        "/platform-api/v1/operational-signals/{signal_id}/in-progress",
        "/platform-api/v1/operational-signals/{signal_id}/remind-later",
        "/platform-api/v1/operational-signals/{signal_id}/needs-attention",
    }
