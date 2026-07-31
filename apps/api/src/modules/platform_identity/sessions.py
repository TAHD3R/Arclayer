from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

from src.common.utils.ids import uuid7
from src.core.exceptions import Forbidden, Unauthorized
from src.models.platform_identity.operations import PlatformSession, PlatformVerificationAssurance
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionCredential, PlatformSessionPrincipal
from src.modules.platform_identity.tokens import build_platform_access_token, decode_platform_access_token
from src.settings.env_models import PlatformAuthSettings


def _now() -> datetime:
    return datetime.now(UTC)


def _unauthorized(error: str) -> Unauthorized:
    return Unauthorized(message=error, error=error)


def _forbidden(error: str) -> Forbidden:
    return Forbidden(message=error, error=error)


def _claim_uuid(payload: dict[str, object], key: str) -> UUID:
    try:
        return UUID(str(payload[key]))
    except (KeyError, TypeError, ValueError) as exc:
        raise _unauthorized("PLATFORM_TOKEN_CLAIMS_INVALID") from exc


def platform_session_identifier_hash(session_id: UUID) -> str:
    """Return the persisted digest for the opaque bearer session identifier."""

    return sha256(str(session_id).encode()).hexdigest()


def _inactivity_deadline(*, now: datetime, absolute_expires_at: datetime, settings: PlatformAuthSettings) -> datetime:
    return min(now + timedelta(seconds=settings.device_session.inactivity_ttl_seconds), absolute_expires_at)


async def issue_platform_session(
    *,
    actor_id: UUID,
    assurance: PlatformVerificationAssurance,
    device_label: str | None,
    settings: PlatformAuthSettings,
    repository: PlatformIdentityRepository,
    now: datetime | None = None,
) -> PlatformSessionCredential:
    """Issue one MFA-backed device session after checking current Platform membership."""

    issued_at = now or _now()
    is_owner = await repository.is_instance_owner(user_id=actor_id)
    operator = None if is_owner else await repository.get_active_operator_by_user_id(user_id=actor_id)
    if not is_owner and operator is None:
        raise _forbidden("PLATFORM_ACCESS_REQUIRED")

    session_id = uuid7()
    absolute_expires_at = issued_at + timedelta(seconds=settings.device_session.absolute_ttl_seconds)
    session = await PlatformSession.create(
        id=session_id,
        actor_user_id=actor_id,
        operator_id=None if operator is None else operator.id,
        session_identifier_hash=platform_session_identifier_hash(session_id),
        device_label=device_label,
        recent_activity_at=issued_at,
        inactivity_expires_at=_inactivity_deadline(
            now=issued_at,
            absolute_expires_at=absolute_expires_at,
            settings=settings,
        ),
        absolute_expires_at=absolute_expires_at,
        policy_revision=settings.device_session.policy_revision,
        token_version=1,
        assurance=assurance,
    )
    token, expires_in = build_platform_access_token(
        actor_id=actor_id,
        session_id=session_id,
        token_version=session.token_version,
        settings=settings,
    )
    return PlatformSessionCredential(
        access_token=token,
        expires_in=expires_in,
        session=PlatformSessionPrincipal(
            actor_id=actor_id,
            session_id=session_id,
            operator_id=session.operator_id,
            is_instance_owner=is_owner,
            policy_revision=session.policy_revision,
            absolute_expires_at=absolute_expires_at,
        ),
    )


async def resolve_platform_session(
    *,
    token: str,
    settings: PlatformAuthSettings,
    repository: PlatformIdentityRepository,
    now: datetime | None = None,
) -> PlatformSessionPrincipal:
    """Decode and revalidate a Platform bearer against durable current authority."""

    checked_at = now or _now()
    payload = decode_platform_access_token(token, settings)
    actor_id = _claim_uuid(payload, "sub")
    session_id = _claim_uuid(payload, "sid")
    session = await repository.get_platform_session_by_identifier_hash(
        session_identifier_hash=platform_session_identifier_hash(session_id)
    )
    if session is None or UUID(str(session.id)) != session_id:
        raise _unauthorized("PLATFORM_SESSION_INVALID")
    if UUID(str(session.actor_user_id)) != actor_id or session.token_version != payload.get("ver"):
        raise _unauthorized("PLATFORM_SESSION_STALE")
    if session.policy_revision != settings.device_session.policy_revision:
        raise _unauthorized("PLATFORM_SESSION_POLICY_STALE")
    if checked_at >= session.inactivity_expires_at or checked_at >= session.absolute_expires_at:
        raise _unauthorized("PLATFORM_SESSION_EXPIRED")

    is_owner = await repository.is_instance_owner(user_id=actor_id)
    operator = None if is_owner else await repository.get_active_operator_by_user_id(user_id=actor_id)
    if (is_owner and session.operator_id is not None) or (
        not is_owner and (operator is None or session.operator_id != operator.id)
    ):
        raise _unauthorized("PLATFORM_SESSION_ACCESS_REVOKED")

    session.recent_activity_at = checked_at
    session.inactivity_expires_at = _inactivity_deadline(
        now=checked_at,
        absolute_expires_at=session.absolute_expires_at,
        settings=settings,
    )
    await session.save(update_fields=["recent_activity_at", "inactivity_expires_at"])
    return PlatformSessionPrincipal(
        actor_id=actor_id,
        session_id=session_id,
        operator_id=None if operator is None else operator.id,
        is_instance_owner=is_owner,
        policy_revision=session.policy_revision,
        absolute_expires_at=session.absolute_expires_at,
    )


async def ensure_platform_permission(
    *,
    permission_code: str,
    principal: PlatformSessionPrincipal,
    repository: PlatformIdentityRepository,
    now: datetime | None = None,
) -> None:
    """Require one exact current Platform permission, without a session permission cache."""

    if principal.is_instance_owner:
        return
    if principal.operator_id is None or not await repository.operator_has_permission(
        operator_id=principal.operator_id,
        permission_code=permission_code,
        at=now or _now(),
    ):
        raise _forbidden("PLATFORM_PERMISSION_DENIED")
