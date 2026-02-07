from __future__ import annotations

import time
from uuid import UUID

from apps.api.infra.cache.valkey import ValkeyClientLike


class PreviewTokenStore:
    """
    Preview token store backed by Valkey (TTL-based).

    Notes:
    - For Sprint 3, we only validate token existence and TTL; binding to user/session
      will be added once the editor has real authentication and permission checks.
    """

    def __init__(self, client: ValkeyClientLike) -> None:
        self._client = client

    def _key(self, *, site_id: UUID, token: str) -> str:
        return f"sites:preview:{site_id}:{token}"

    async def issue(self, *, site_id: UUID, token: str, ttl_seconds: int, expires_at_ms: int) -> None:
        record = {"siteId": str(site_id), "token": token, "expiresAtMs": expires_at_ms}
        await self._client.set_json(self._key(site_id=site_id, token=token), record, ex=ttl_seconds)

    async def validate(self, *, site_id: UUID, token: str) -> bool:
        if not token.strip():
            return False
        data = await self._client.get_json(self._key(site_id=site_id, token=token))
        return isinstance(data, dict) and data.get("token") == token


class PresenceStore:
    """
    Presence store backed by Valkey (TTL-based).

    Storage model:
    - A presence set per document: `sites:presence:<siteId>:<docKey>:clients` (set of clientIds)
    - A record per clientId: `sites:presence:<siteId>:<docKey>:client:<clientId>` (json)
    """

    _TTL_SECONDS = 20

    def __init__(self, client: ValkeyClientLike) -> None:
        self._client = client

    def _set_key(self, *, site_id: UUID, doc_key: str) -> str:
        return f"sites:presence:{site_id}:{doc_key}:clients"

    def _record_key(self, *, site_id: UUID, doc_key: str, client_id: str) -> str:
        return f"sites:presence:{site_id}:{doc_key}:client:{client_id}"

    async def heartbeat(
        self,
        *,
        site_id: UUID,
        doc_key: str,
        client_id: str,
        actor: dict[str, str] | None,
    ) -> int:
        now_ms = int(time.time() * 1000)
        expires_at_ms = now_ms + self._TTL_SECONDS * 1000

        # Track client ids for listing.
        await self._client.sadd(self._set_key(site_id=site_id, doc_key=doc_key), client_id)
        await self._client.expire(self._set_key(site_id=site_id, doc_key=doc_key), self._TTL_SECONDS)

        record = {"client_id": client_id, "updated_at_ms": now_ms, "actor": actor}
        await self._client.set_json(
            self._record_key(site_id=site_id, doc_key=doc_key, client_id=client_id),
            record,
            ex=self._TTL_SECONDS,
        )
        return expires_at_ms

    async def list(self, *, site_id: UUID, doc_key: str) -> list[dict[str, object]]:
        key = self._set_key(site_id=site_id, doc_key=doc_key)
        client_ids = sorted(await self._client.smembers(key))
        results: list[dict[str, object]] = []
        stale: list[str] = []
        for cid in client_ids:
            data = await self._client.get_json(self._record_key(site_id=site_id, doc_key=doc_key, client_id=cid))
            if not isinstance(data, dict):
                stale.append(cid)
                continue
            # Defensive shaping: keep contract stable.
            rec = {
                "client_id": str(data.get("client_id") or cid),
                "updated_at_ms": int(data.get("updated_at_ms") or 0),
                "actor": data.get("actor") if isinstance(data.get("actor"), dict) else None,
            }
            results.append(rec)

        if stale:
            await self._client.srem(key, *stale)

        return results


class RouteTemplateVersionStore:
    """
    Cross-instance route template cache version store.

    Storage model:
    - `sites:route-templates:<siteId>:version` => int (as string)

    Notes:
    - We intentionally use a simple get/set surface area to stay compatible with ValkeyClientLike.
    - Version value does not have to be sequential; it only needs to change on mutations.
    """

    def __init__(self, client: ValkeyClientLike) -> None:
        self._client = client

    def _key(self, *, site_id: UUID) -> str:
        return f"sites:route-templates:{site_id}:version"

    async def get(self, *, site_id: UUID) -> int | None:
        raw = await self._client.get(self._key(site_id=site_id))
        if raw is None:
            return None
        try:
            v = int(raw)
        except Exception:
            return None
        return v if v >= 0 else None

    async def set(self, *, site_id: UUID, version: int) -> None:
        await self._client.set(self._key(site_id=site_id), str(int(version)))
