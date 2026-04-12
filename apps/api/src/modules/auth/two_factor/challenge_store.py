from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any, Final
from uuid import UUID

from src.infra.cache.valkey import ValkeyClientLike
from src.modules.auth.sessions.request_context import AuthRequestContext

_DEFAULT_CHALLENGE_TTL_SECONDS: Final[int] = 5 * 60
_DEFAULT_MAX_ATTEMPTS: Final[int] = 10


class TwoFactorChallengeStore:
    """
    Short-lived, one-time 2FA challenge store (Valkey).

    Use case:
    - Password/SSO succeeds -> issue challenge token
    - Client submits TOTP/backup code with challenge token -> consume challenge and issue session
    """

    def __init__(
        self,
        client: ValkeyClientLike,
        *,
        ttl_seconds: int = _DEFAULT_CHALLENGE_TTL_SECONDS,
        max_attempts: int = _DEFAULT_MAX_ATTEMPTS,
    ) -> None:
        self._client = client
        self.ttl_seconds = max(int(ttl_seconds), 60)
        self.max_attempts = max(int(max_attempts), 3)

    def _key(self, token: str) -> str:
        return f"auth:2fa:challenge:{token}"

    def _consumed_key(self, token: str) -> str:
        return f"auth:2fa:challenge:consumed:{token}"

    async def issue(
        self,
        *,
        user_id: UUID,
        request_context: AuthRequestContext | None = None,
        auth_method: str | None = None,
    ) -> tuple[str, int]:
        token = secrets.token_urlsafe(32)
        ttl = self.ttl_seconds
        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "user_id": str(user_id),
            "issued_at": now_ts,
            "expires_at": now_ts + ttl,
            "attempts": 0,
        }
        await self._client.set_json(self._key(token), record, ex=ttl)
        return token, ttl

    async def get(self, *, token: str) -> dict[str, Any] | None:
        raw = await self._client.get_json(self._key(token))
        return raw if isinstance(raw, dict) else None

    async def delete(self, *, token: str) -> None:
        await self._client.delete(self._key(token))

    async def try_mark_consumed(self, *, token: str) -> bool:
        ttl = await self._client.ttl(self._key(token))
        ex = ttl if ttl and ttl > 0 else self.ttl_seconds
        return await self._client.set(self._consumed_key(token), "1", ex=ex, nx=True)

    async def bump_attempts(self, *, token: str) -> int:
        record = await self.get(token=token)
        if not record:
            return 0
        tries = int(record.get("attempts") or 0) + 1
        record["attempts"] = tries
        ttl = await self._client.ttl(self._key(token))
        ex = ttl if ttl and ttl > 0 else None
        await self._client.set_json(self._key(token), record, ex=ex)
        return tries
