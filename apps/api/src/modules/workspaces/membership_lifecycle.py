from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings


class WorkspaceMembershipEndParticipant(Protocol):
    async def release_for_membership_end(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        lifecycle_idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> object: ...


def build_workspace_membership_end_participant(settings: Settings) -> WorkspaceMembershipEndParticipant:
    from src.modules.commerce.feature_access.repository import TortoiseFeatureAccessRepository
    from src.modules.commerce.feature_access.service import FeatureAccessMembershipReleaseParticipant

    return FeatureAccessMembershipReleaseParticipant(TortoiseFeatureAccessRepository(settings))
