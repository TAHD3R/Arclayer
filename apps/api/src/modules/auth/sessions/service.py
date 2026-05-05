from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from src.core.i18n import t
from src.core.services import BaseService
from src.models.organization.org_membership import OrgMembership
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.repository import RefreshTokenStore
from src.modules.auth.sessions.device_label import build_device_label
from src.modules.auth.sessions.location_lookup import AuthSessionLocationLookup
from src.modules.auth.sessions.schema import AuthSessionListOut, AuthSessionOut
from src.platform.cache.valkey import ValkeyClientLike


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

    async def _write_session_activity_event(
        self,
        *,
        name: str,
        user_id: UUID,
        actor_user_id: UUID | None = None,
        subject_user_id: UUID | None = None,
        properties: JsonObject | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        query = OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id")
        orgm = await (query.using_db(conn).first() if conn is not None else query.first())
        org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id)) if orgm is not None else None
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=name,
                organization_id=org_id,
                actor_user_id=actor_user_id,
                subject_user_id=subject_user_id,
                entity_type="auth_session",
                source="api",
                properties=properties or {},
            ),
            conn=conn,
        )

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
        raw_ip_address = record.get("ip_address")
        ip_address = raw_ip_address if isinstance(raw_ip_address, str) else None
        raw_user_agent = record.get("user_agent")
        user_agent = raw_user_agent if isinstance(raw_user_agent, str) else None
        raw_device_label = record.get("device_label")
        device_label = raw_device_label if isinstance(raw_device_label, str) else None
        raw_location_label = record.get("location_label")
        location_label = raw_location_label if isinstance(raw_location_label, str) else None
        raw_auth_method = record.get("auth_method")
        auth_method = raw_auth_method if isinstance(raw_auth_method, str) else None
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
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_SESSION_ID")

        jtis = await store.list_active(user_id)
        for jti in jtis:
            record = await store.get(jti)
            if not isinstance(record, dict):
                continue
            record_sid = _parse_sid(record.get("sid")) or jti
            if record_sid != desired:
                continue
            previous_record = dict(record)
            await store.revoke(jti)
            try:
                await self._write_session_activity_event(
                    name="auth.session.revoked",
                    user_id=user_id,
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    properties={"session_id": record_sid, "scope": "current"},
                )
            except BaseException:
                await store.restore_active(jti, previous_record=previous_record)
                raise
            return

        raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

    async def revoke_other_sessions(self, *, user_id: UUID, current_session_id: str) -> int:
        store = self._require_store()
        desired = str(current_session_id or "").strip()
        if not desired:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="CURRENT_SESSION_MISSING")

        revoked = 0
        revoked_records: list[tuple[str, dict[str, object], str]] = []
        jtis = await store.list_active(user_id)
        for jti in jtis:
            record = await store.get(jti)
            if not isinstance(record, dict):
                continue
            record_sid = _parse_sid(record.get("sid")) or jti
            if record_sid == desired:
                continue
            revoked_records.append((jti, dict(record), record_sid))
            await store.revoke(jti)
            revoked += 1
        try:
            await self._write_session_activity_event(
                name="auth.session.revoked",
                user_id=user_id,
                actor_user_id=user_id,
                subject_user_id=user_id,
                properties={"scope": "others", "revoked_count": revoked},
            )
        except BaseException:
            for jti, record, _record_sid in revoked_records:
                await store.restore_active(jti, previous_record=record)
            raise
        return revoked
