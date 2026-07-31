from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.core.exceptions import Forbidden
from src.modules.commerce.feature_access.contracts import (
    FEATURE_ACCESS_MANAGE_PERMISSION,
    FeatureAccessActor,
    LimitedFeatureAccessCapacity,
)
from src.modules.commerce.feature_access.read_contracts import (
    FeatureAccessCapabilityMetadata,
    FeatureAccessCapabilityState,
    FeatureAccessReadSnapshot,
    ManagerFeatureAccessCapability,
    MemberFeatureAccessCapability,
)
from src.modules.commerce.feature_access.read_service import FeatureAccessReadService


class _ReadService(FeatureAccessReadService):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn or cast(BaseDBAsyncClient, object())


class _ActorAuthority:
    def __init__(self, actor: FeatureAccessActor | None) -> None:
        self.actor = actor

    async def resolve_actor(self, **kwargs) -> FeatureAccessActor | None:
        _ = kwargs
        return self.actor


class _ReadPersistence:
    def __init__(self, snapshot: FeatureAccessReadSnapshot | None) -> None:
        self.snapshot = snapshot

    async def read_workspace_feature_access(self, **kwargs) -> FeatureAccessReadSnapshot | None:
        _ = kwargs
        return self.snapshot


def _snapshot(workspace_id: UUID, membership_id: UUID, *, role_management: bool) -> FeatureAccessReadSnapshot:
    assigned_membership_id = uuid4()
    return FeatureAccessReadSnapshot(
        workspace_id=workspace_id,
        actor_membership_id=membership_id,
        role_management_included=role_management,
        capabilities=(
            FeatureAccessCapabilityState(
                entitlement_key="agents.member-access",
                metadata=FeatureAccessCapabilityMetadata(
                    entitlement_key="agents.member-access",
                    name_i18n_key="featureAccess:AGENT_ACCESS_NAME",
                    description_i18n_key="featureAccess:AGENT_ACCESS_DESCRIPTION",
                ),
                capacity=LimitedFeatureAccessCapacity(limit=3),
                revision=4,
                assigned_membership_ids=(membership_id, assigned_membership_id),
            ),
        ),
    )


async def test_active_member_receives_redacted_capacity_and_own_assignment_only() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    membership_id = uuid4()
    service = _ReadService(
        get_settings(),
        persistence=_ReadPersistence(_snapshot(workspace_id, membership_id, role_management=True)),
        actor_authority=_ActorAuthority(
            FeatureAccessActor(
                user_id=user_id,
                active_member=True,
                is_workspace_owner=False,
                workspace_permissions=(),
            )
        ),
    )

    result = await service.read(workspace_id=workspace_id, actor_user_id=user_id)

    capability = result.capabilities[0]
    assert isinstance(capability, MemberFeatureAccessCapability)
    assert capability.assigned_count == 2
    assert capability.available_count == 1
    assert capability.current_membership_assigned is True
    assert "assigned_membership_ids" not in capability.model_fields_set


@pytest.mark.parametrize("is_owner,role_management", [(True, False), (False, True)])
async def test_owner_or_exact_manager_receives_full_assignment_membership_ids(
    is_owner: bool,
    role_management: bool,
) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    membership_id = uuid4()
    permissions = () if is_owner else (FEATURE_ACCESS_MANAGE_PERMISSION,)
    service = _ReadService(
        get_settings(),
        persistence=_ReadPersistence(_snapshot(workspace_id, membership_id, role_management=role_management)),
        actor_authority=_ActorAuthority(
            FeatureAccessActor(
                user_id=user_id,
                active_member=True,
                is_workspace_owner=is_owner,
                workspace_permissions=permissions,
            )
        ),
    )

    result = await service.read(workspace_id=workspace_id, actor_user_id=user_id)

    capability = result.capabilities[0]
    assert isinstance(capability, ManagerFeatureAccessCapability)
    assert membership_id in capability.assigned_membership_ids


async def test_exact_permission_without_role_management_remains_member_projection() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    membership_id = uuid4()
    service = _ReadService(
        get_settings(),
        persistence=_ReadPersistence(_snapshot(workspace_id, membership_id, role_management=False)),
        actor_authority=_ActorAuthority(
            FeatureAccessActor(
                user_id=user_id,
                active_member=True,
                is_workspace_owner=False,
                workspace_permissions=(FEATURE_ACCESS_MANAGE_PERMISSION,),
            )
        ),
    )

    result = await service.read(workspace_id=workspace_id, actor_user_id=user_id)

    assert isinstance(result.capabilities[0], MemberFeatureAccessCapability)


async def test_non_active_actor_is_forbidden_without_fallback_projection() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    membership_id = uuid4()
    service = _ReadService(
        get_settings(),
        persistence=_ReadPersistence(_snapshot(workspace_id, membership_id, role_management=True)),
        actor_authority=_ActorAuthority(
            FeatureAccessActor(
                user_id=user_id,
                active_member=False,
                is_workspace_owner=False,
                workspace_permissions=(),
            )
        ),
    )

    with pytest.raises(Forbidden) as exc:
        await service.read(workspace_id=workspace_id, actor_user_id=user_id)

    assert exc.value.error == "WORKSPACE_MEMBERSHIP_REQUIRED"
