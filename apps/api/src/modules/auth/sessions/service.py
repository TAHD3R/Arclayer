from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.src.core.i18n import t
from apps.api.src.infra.cache.valkey import ValkeyClientLike
from apps.api.src.modules.auth.repository import RefreshTokenStore
from apps.api.src.modules.auth.sessions.device_label import build_device_label
from apps.api.src.modules.auth.sessions.location_lookup import AuthSessionLocationLookup
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
        self._location_lookup = AuthSessionLocationLookup(settings)

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    def _require_store(self) -> RefreshTokenStore:
        if self._store is None:
            raise ServiceUnavailable(
                message=self._ta("REFRESH_STORE_UNAVAILABLE", "刷新令牌服务不可用"),
                error="REFRESH_STORE_UNAVAILABLE",
            )
        return self._store

    async def _lookup_location_label(self, *, ip_address: str | None) -> str | None:
        return self._location_lookup.lookup(ip_address=ip_address)

    async def _build_session_out(
        self, *, record: dict[str, object], current_session_id: str | None, fallback_session_id: str
    ) -> AuthSessionOut | None:
        session_id = _parse_sid(record.get("sid")) or fallback_session_id
        issued_at = _parse_ts(record.get("issued_at"))
        if issued_at is None:
            return None
        last_used_at = _parse_ts(record.get("last_used_at"))
        current = bool(current_session_id and current_session_id == session_id)
        ip_address = record.get("ip_address") if isinstance(record.get("ip_address"), str) else None
        user_agent = record.get("user_agent") if isinstance(record.get("user_agent"), str) else None
        device_label = record.get("device_label") if isinstance(record.get("device_label"), str) else None
        location_label = record.get("location_label") if isinstance(record.get("location_label"), str) else None
        auth_method = record.get("auth_method") if isinstance(record.get("auth_method"), str) else None
        if location_label is None:
            location_label = await self._lookup_location_label(ip_address=ip_address)
        return AuthSessionOut(
            session_id=session_id,
            issued_at=issued_at,
            last_used_at=last_used_at,
            current=current,
            ip_address=ip_address,
            user_agent=user_agent,
            device_label=device_label or build_device_label(user_agent),
            location_label=location_label,
            auth_method=auth_method,
            revocable=not current,
        )

    async def list_sessions(self, *, user_id: UUID, current_session_id: str | None) -> AuthSessionListOut:
        store = self._require_store()
        jtis = await store.list_active(user_id)

        items: list[AuthSessionOut] = []
        for jti in jtis:
            record = await store.get(jti)
            if not isinstance(record, dict):
                continue
            item = await self._build_session_out(
                record=record,
                current_session_id=current_session_id,
                fallback_session_id=jti,
            )
            if item is None:
                continue
            items.append(item)

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
