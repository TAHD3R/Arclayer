from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.src.core.i18n import t
from apps.api.src.infra.cache.valkey import ValkeyClientLike
from apps.api.src.modules.auth.repository import RefreshTokenStore
from apps.api.src.modules.auth.sessions.schema import AuthSessionListOut, AuthSessionOut


def _parse_ts(raw: object | None) -> datetime | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        value = raw
    elif isinstance(raw, str):
        try:
            value = int(raw.strip() or "0")
        except ValueError:
            return None
    else:
        return None
    if value <= 0:
        return None
    return datetime.fromtimestamp(value, tz=UTC)


def _parse_sid(raw: object | None) -> str | None:
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    return value or None


class AuthSessionService(BaseService):
    def __init__(self, settings: Settings, *, valkey: ValkeyClientLike | None) -> None:
        super().__init__(settings)
        self._store = RefreshTokenStore(valkey, settings.auth) if valkey else None

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    def _require_store(self) -> RefreshTokenStore:
        if self._store is None:
            raise ServiceUnavailable(
                message=self._ta("REFRESH_STORE_UNAVAILABLE", "刷新令牌服务不可用"),
                error="REFRESH_STORE_UNAVAILABLE",
            )
        return self._store

    async def list_sessions(self, *, user_id: UUID, current_session_id: str | None) -> AuthSessionListOut:
        store = self._require_store()
        jtis = await store.list_active(user_id)

        items: list[AuthSessionOut] = []
        for jti in jtis:
            record = await store.get(jti)
            if not isinstance(record, dict):
                continue

            session_id = _parse_sid(record.get("sid")) or jti
            issued_at = _parse_ts(record.get("issued_at"))
            if issued_at is None:
                continue
            last_used_at = _parse_ts(record.get("last_used_at"))

            items.append(
                AuthSessionOut(
                    session_id=session_id,
                    issued_at=issued_at,
                    last_used_at=last_used_at,
                    current=bool(current_session_id and current_session_id == session_id),
                )
            )

        items.sort(key=lambda s: s.last_used_at or s.issued_at, reverse=True)
        return AuthSessionListOut(items=items, total=len(items))

    async def revoke_session(self, *, user_id: UUID, session_id: str) -> None:
        store = self._require_store()
        desired = str(session_id or "").strip()
        if not desired:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_SESSION_ID")

        jtis = await store.list_active(user_id)
        for jti in jtis:
            record = await store.get(jti)
            if not isinstance(record, dict):
                continue
            record_sid = _parse_sid(record.get("sid")) or jti
            if record_sid != desired:
                continue
            await store.revoke(jti)
            return

        raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

    async def revoke_other_sessions(self, *, user_id: UUID, current_session_id: str) -> int:
        store = self._require_store()
        desired = str(current_session_id or "").strip()
        if not desired:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="CURRENT_SESSION_MISSING")

        revoked = 0
        jtis = await store.list_active(user_id)
        for jti in jtis:
            record = await store.get(jti)
            if not isinstance(record, dict):
                continue
            record_sid = _parse_sid(record.get("sid")) or jti
            if record_sid == desired:
                continue
            await store.revoke(jti)
            revoked += 1
        return revoked
