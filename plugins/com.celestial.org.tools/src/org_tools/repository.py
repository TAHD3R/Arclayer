from __future__ import annotations

from apps.api.common.repositories import BaseRepository
from org_tools.models import OrgChangeLog


class OrgToolsRepository(BaseRepository):
    async def log_change(
        self,
        *,
        actor_user_id,
        action: str,
        entity_type: str | None,
        entity_id,
        payload: dict | None,
    ) -> OrgChangeLog:
        return await OrgChangeLog.create(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload,
        )
