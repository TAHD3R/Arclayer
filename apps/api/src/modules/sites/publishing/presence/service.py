from __future__ import annotations

from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import ServiceUnavailable
from src.modules.sites.repository import SitesRepository
from src.modules.sites.schema import (
    SitePresenceHeartbeatIn,
    SitePresenceHeartbeatOut,
    SitePresenceListOut,
    SitePresenceRecordOut,
)
from src.modules.sites.stores.service import PresenceStore


class PublishingPresenceService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        presence: PresenceStore | None,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._presence = presence

    async def heartbeat_presence(
        self,
        *,
        site_id: UUID,
        payload: SitePresenceHeartbeatIn,
    ) -> SitePresenceHeartbeatOut:
        if self._presence is None:
            raise ServiceUnavailable("Presence requires Valkey", error="PRESENCE_VALKEY_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        expires_at_ms = await self._presence.heartbeat(
            site_id=site_id,
            doc_key=payload.doc_key,
            client_id=payload.client_id,
            actor=payload.actor,
        )
        return SitePresenceHeartbeatOut(expires_at_ms=expires_at_ms)

    async def list_presence(self, *, site_id: UUID, doc_key: str) -> SitePresenceListOut:
        if self._presence is None:
            raise ServiceUnavailable("Presence requires Valkey", error="PRESENCE_VALKEY_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        items = await self._presence.list(site_id=site_id, doc_key=doc_key)
        records: list[SitePresenceRecordOut] = []
        for rec in items:
            raw_actor = rec.get("actor")
            actor = {str(k): str(v) for k, v in raw_actor.items()} if isinstance(raw_actor, dict) else None
            raw_updated = rec.get("updated_at_ms")
            updated_at_ms = int(raw_updated) if isinstance(raw_updated, (int, str)) else 0
            records.append(
                SitePresenceRecordOut(
                    client_id=str(rec.get("client_id") or ""),
                    updated_at_ms=updated_at_ms,
                    actor=actor,
                )
            )
        return SitePresenceListOut(doc_key=doc_key, items=records)
