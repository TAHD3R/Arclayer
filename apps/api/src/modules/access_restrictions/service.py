from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Final, NoReturn, Protocol, cast
from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, Forbidden
from src.core.i18n import t
from src.core.services import BaseService
from src.models.system.access_restriction import (
    AccessRestrictionEntityType,
    AccessRestrictionRecord,
    AccessRestrictionState,
    AccessRestrictionType,
)
from src.modules.access_restrictions.repository import AccessRestrictionRepository
from src.modules.access_restrictions.schema import (
    AccessRestrictionAdminOut,
    AccessRestrictionEnforceRequest,
    AccessRestrictionLiftRequest,
    AccessRestrictionOut,
    recovery_actions_for,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event

_ERROR_CODE_BY_TYPE: Final = {
    AccessRestrictionType.USER_DISABLED: "USER_DISABLED",
    AccessRestrictionType.WORKSPACE_SUSPENDED: "WORKSPACE_SUSPENDED",
    AccessRestrictionType.WORKSPACE_ARCHIVED: "WORKSPACE_ARCHIVED",
    AccessRestrictionType.PROJECT_SUSPENDED: "PROJECT_SUSPENDED",
}


class _RestrictionLiftMutable(Protocol):
    state: AccessRestrictionState
    lifted_at: datetime | None
    lifted_by_user_id: UUID | None
    lift_note: str | None
    revision: int


def _fingerprint(payload: dict[str, object]) -> str:
    encoded = orjson.dumps(payload, option=orjson.OPT_SORT_KEYS)
    return hashlib.sha256(encoded).hexdigest()


def build_access_restriction_admin_out(record: AccessRestrictionRecord) -> AccessRestrictionAdminOut:
    restriction_type = AccessRestrictionType(record.restriction_type)
    return AccessRestrictionAdminOut(
        restriction_id=record.id,
        entity_type=record.entity_type,
        entity_id=record.entity_id,
        restriction_type=restriction_type,
        state=record.state,
        reason_category=record.reason_category,
        reason_code=record.reason_code,
        operator_note=record.operator_note,
        effective_at=record.effective_at,
        review_at=record.review_at,
        expires_at=record.expires_at,
        actor_user_id=record.actor_user_id,
        lifted_at=record.lifted_at,
        lifted_by_user_id=record.lifted_by_user_id,
        lift_note=record.lift_note,
        revision=record.revision,
        audit_event_id=record.audit_event_id,
        allowed_recovery_actions=recovery_actions_for(restriction_type),
    )


def _public_out(record: AccessRestrictionRecord) -> AccessRestrictionOut:
    return AccessRestrictionOut.model_validate(build_access_restriction_admin_out(record).model_dump())


class AccessRestrictionAuthority:
    def __init__(self, repository: AccessRestrictionRepository) -> None:
        self._repository = repository

    async def list_active(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_ids: list[UUID],
        restriction_types: list[AccessRestrictionType] | None = None,
    ) -> list[AccessRestrictionRecord]:
        return await self._repository.list_current(
            entity_type=entity_type,
            entity_ids=entity_ids,
            restriction_types=restriction_types,
            active_only=True,
        )

    async def list_current(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_ids: list[UUID],
        restriction_types: list[AccessRestrictionType] | None = None,
    ) -> list[AccessRestrictionRecord]:
        return await self._repository.list_current(
            entity_type=entity_type,
            entity_ids=entity_ids,
            restriction_types=restriction_types,
        )

    async def require_unrestricted(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_id: UUID,
        restriction_types: list[AccessRestrictionType],
    ) -> None:
        restrictions = await self.list_active(
            entity_type=entity_type,
            entity_ids=[entity_id],
            restriction_types=restriction_types,
        )
        if restrictions:
            raise_access_restriction(restrictions[0])


class AccessRestrictionService(BaseService):
    def __init__(self, settings: Settings, *, repository: AccessRestrictionRepository) -> None:
        super().__init__(settings)
        self._repository = repository

    async def enforce(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_id: UUID,
        restriction_type: AccessRestrictionType,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionEnforceRequest,
        organization_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> AccessRestrictionAdminOut:
        key = _normalize_idempotency_key(idempotency_key)
        request_fingerprint = _fingerprint({
            "command": "enforce",
            "entityType": entity_type.value,
            "entityId": str(entity_id),
            "restrictionType": restriction_type.value,
            **payload.model_dump(mode="json"),
        })
        async with self.tx(conn=conn) as tx_conn:
            replay = await self._require_replay_or_none(
                idempotency_key=key,
                request_fingerprint=request_fingerprint,
                conn=tx_conn,
            )
            if replay is not None:
                return replay

            current = await self._repository.get_current(
                entity_type=entity_type,
                entity_id=entity_id,
                restriction_type=restriction_type,
                conn=tx_conn,
                for_update=True,
            )
            actual_revision = int(current.revision) if current is not None else 0
            _require_revision(expected=payload.expected_revision, actual=actual_revision, current=current)
            if current is not None and current.state == AccessRestrictionState.ACTIVE:
                _raise_state_unchanged(current)

            now = datetime.now(UTC)
            if current is None:
                current = await self._repository.create_restriction(
                    values={
                        "entity_type": entity_type,
                        "entity_id": entity_id,
                        "restriction_type": restriction_type,
                        "state": AccessRestrictionState.ACTIVE,
                        "reason_category": payload.reason_category,
                        "reason_code": payload.reason_code,
                        "operator_note": payload.operator_note,
                        "effective_at": now,
                        "review_at": payload.review_at,
                        "expires_at": payload.expires_at,
                        "actor_user_id": actor_user_id,
                        "revision": 1,
                    },
                    conn=tx_conn,
                )
            else:
                current.state = AccessRestrictionState.ACTIVE
                current.reason_category = payload.reason_category
                current.reason_code = payload.reason_code
                current.operator_note = payload.operator_note
                current.effective_at = now
                current.review_at = payload.review_at
                current.expires_at = payload.expires_at
                current.actor_user_id = actor_user_id
                mutable_current = cast(_RestrictionLiftMutable, current)
                mutable_current.lifted_at = None
                mutable_current.lifted_by_user_id = None
                mutable_current.lift_note = None
                mutable_current.revision += 1
                await self._repository.save_restriction(
                    record=current,
                    update_fields=(
                        "state",
                        "reason_category",
                        "reason_code",
                        "operator_note",
                        "effective_at",
                        "review_at",
                        "expires_at",
                        "actor_user_id",
                        "lifted_at",
                        "lifted_by_user_id",
                        "lift_note",
                        "revision",
                    ),
                    conn=tx_conn,
                )

            out = await self._write_transition_evidence(
                record=current,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                request_fingerprint=request_fingerprint,
                command="enforce",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                conn=tx_conn,
            )
            return out

    async def lift(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_id: UUID,
        restriction_type: AccessRestrictionType,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionLiftRequest,
        organization_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> AccessRestrictionAdminOut:
        key = _normalize_idempotency_key(idempotency_key)
        request_fingerprint = _fingerprint({
            "command": "lift",
            "entityType": entity_type.value,
            "entityId": str(entity_id),
            "restrictionType": restriction_type.value,
            **payload.model_dump(mode="json"),
        })
        async with self.tx(conn=conn) as tx_conn:
            replay = await self._require_replay_or_none(
                idempotency_key=key,
                request_fingerprint=request_fingerprint,
                conn=tx_conn,
            )
            if replay is not None:
                return replay

            current = await self._repository.get_current(
                entity_type=entity_type,
                entity_id=entity_id,
                restriction_type=restriction_type,
                conn=tx_conn,
                for_update=True,
            )
            actual_revision = int(current.revision) if current is not None else 0
            _require_revision(expected=payload.expected_revision, actual=actual_revision, current=current)
            if current is None or current.state != AccessRestrictionState.ACTIVE:
                _raise_state_unchanged(current)

            mutable_current = cast(_RestrictionLiftMutable, current)
            mutable_current.state = AccessRestrictionState.LIFTED
            mutable_current.lifted_at = datetime.now(UTC)
            mutable_current.lifted_by_user_id = actor_user_id
            mutable_current.lift_note = payload.operator_note
            mutable_current.revision += 1
            await self._repository.save_restriction(
                record=current,
                update_fields=("state", "lifted_at", "lifted_by_user_id", "lift_note", "revision"),
                conn=tx_conn,
            )
            return await self._write_transition_evidence(
                record=current,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                request_fingerprint=request_fingerprint,
                command="lift",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                conn=tx_conn,
            )

    async def _require_replay_or_none(
        self,
        *,
        idempotency_key: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> AccessRestrictionAdminOut | None:
        command = await self._repository.get_command(idempotency_key=idempotency_key, conn=conn)
        if command is None:
            return None
        if command.request_fingerprint != request_fingerprint:
            raise Conflict(
                t("errors", "ACCESS_RESTRICTION_IDEMPOTENCY_CONFLICT"),
                error="ACCESS_RESTRICTION_IDEMPOTENCY_CONFLICT",
            )
        return AccessRestrictionAdminOut.model_validate(command.result_snapshot)

    async def _write_transition_evidence(
        self,
        *,
        record: AccessRestrictionRecord,
        actor_user_id: UUID,
        idempotency_key: str,
        request_fingerprint: str,
        command: str,
        organization_id: UUID | None,
        workspace_id: UUID | None,
        project_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> AccessRestrictionAdminOut:
        event = await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=("access_restriction.enforced" if command == "enforce" else "access_restriction.lifted"),
                actor_user_id=actor_user_id,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                subject_user_id=record.entity_id if record.entity_type == AccessRestrictionEntityType.USER else None,
                entity_type=record.entity_type,
                entity_id=record.entity_id,
                source="api",
                properties={
                    "restriction_type": str(record.restriction_type),
                    "state": str(record.state),
                    "reason_category": str(record.reason_category),
                    "reason_code": record.reason_code,
                    "revision": record.revision,
                    "idempotency_key": idempotency_key,
                },
            ),
            conn=conn,
        )
        record.audit_event_id = event.id
        await self._repository.save_restriction(
            record=record,
            update_fields=("audit_event_id",),
            conn=conn,
        )
        out = build_access_restriction_admin_out(record)
        await self._repository.create_command(
            values={
                "restriction_id": record.id,
                "entity_type": record.entity_type,
                "entity_id": record.entity_id,
                "restriction_type": record.restriction_type,
                "idempotency_key": idempotency_key,
                "request_fingerprint": request_fingerprint,
                "actor_user_id": actor_user_id,
                "resulting_revision": record.revision,
                "result_snapshot": out.model_dump(mode="json"),
            },
            conn=conn,
        )
        return out


def raise_access_restriction(record: AccessRestrictionRecord) -> NoReturn:
    restriction_type = AccessRestrictionType(record.restriction_type)
    error_code = _ERROR_CODE_BY_TYPE[restriction_type]
    public = _public_out(record)
    raise Forbidden(
        message=t("errors", error_code),
        error=error_code,
        meta={
            "restriction": public.model_dump(mode="json", by_alias=True),
        },
    )


def _normalize_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or len(normalized) > 128:
        raise Conflict(
            t("errors", "ACCESS_RESTRICTION_IDEMPOTENCY_INVALID"),
            error="ACCESS_RESTRICTION_IDEMPOTENCY_INVALID",
        )
    return normalized


def _require_revision(
    *,
    expected: int,
    actual: int,
    current: AccessRestrictionRecord | None,
) -> None:
    if expected == actual:
        return
    meta = {"currentRevision": actual}
    if current is not None:
        meta["current"] = build_access_restriction_admin_out(current).model_dump(mode="json", by_alias=True)
    raise Conflict(
        t("errors", "ACCESS_RESTRICTION_REVISION_CONFLICT"),
        error="ACCESS_RESTRICTION_REVISION_CONFLICT",
        meta=meta,
    )


def _raise_state_unchanged(current: AccessRestrictionRecord | None) -> NoReturn:
    meta = None
    if current is not None:
        meta = {"current": build_access_restriction_admin_out(current).model_dump(mode="json", by_alias=True)}
    raise Conflict(
        t("errors", "ACCESS_RESTRICTION_STATE_UNCHANGED"),
        error="ACCESS_RESTRICTION_STATE_UNCHANGED",
        meta=meta,
    )
