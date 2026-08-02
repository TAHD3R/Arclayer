from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Forbidden
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_identity.sessions import ensure_platform_permission


class _PermissionRepository:
    def __init__(self, *, granted: bool) -> None:
        self.granted = granted
        self.requested_permissions: list[str] = []

    async def operator_has_permission(self, *, operator_id: UUID, permission_code: str, at: datetime) -> bool:
        _ = operator_id, at
        self.requested_permissions.append(permission_code)
        return self.granted


def _principal(*, is_instance_owner: bool) -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=None if is_instance_owner else uuid4(),
        is_instance_owner=is_instance_owner,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_workspace_capability_rollout_apply_permission_is_recognized_and_enforced() -> None:
    repository = _PermissionRepository(granted=True)

    await ensure_platform_permission(
        permission_code=PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY,
        principal=_principal(is_instance_owner=False),
        repository=repository,  # type: ignore[arg-type]
    )

    assert PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY == "platform:workspace-capability-rollout:apply"
    assert repository.requested_permissions == [PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY]


@pytest.mark.asyncio
async def test_workspace_capability_rollout_apply_denies_operator_without_exact_permission() -> None:
    repository = _PermissionRepository(granted=False)

    with pytest.raises(Forbidden, match="PLATFORM_PERMISSION_DENIED"):
        await ensure_platform_permission(
            permission_code=PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY,
            principal=_principal(is_instance_owner=False),
            repository=repository,  # type: ignore[arg-type]
        )

    assert repository.requested_permissions == [PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY]


@pytest.mark.asyncio
async def test_workspace_capability_rollout_apply_keeps_instance_owner_implicit_authority() -> None:
    repository = _PermissionRepository(granted=False)

    await ensure_platform_permission(
        permission_code=PlatformPermissionCode.WORKSPACE_CAPABILITY_ROLLOUT_APPLY,
        principal=_principal(is_instance_owner=True),
        repository=repository,  # type: ignore[arg-type]
    )

    assert repository.requested_permissions == []
