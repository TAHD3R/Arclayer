from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

import orjson
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.i18n import t


class BuilderChangeSetPreviewTokenClaims(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    audience: Literal["builder_changeset_apply"] = "builder_changeset_apply"
    change_set_id: UUID
    workspace_id: UUID
    project_id: UUID
    site_id: UUID
    environment_id: UUID
    actor_user_id: UUID
    base_revision_id: UUID
    base_etag: str
    operations_hash: str
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def require_utc_expiry(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("expiresAt must include a timezone")
        return value.astimezone(UTC)


def build_builder_change_set_preview_token(
    settings: Settings,
    *,
    claims: BuilderChangeSetPreviewTokenClaims,
) -> str:
    raw = _serialize_claims(claims)
    body = _encode(raw)
    signature = hmac.new(_signing_secret(settings), raw, hashlib.sha256).digest()
    return f"{body}.{_encode(signature)}"


def verify_builder_change_set_preview_token(
    settings: Settings,
    *,
    token: str,
    now: datetime | None = None,
) -> BuilderChangeSetPreviewTokenClaims:
    body, signature = _split_token(token)
    raw = _decode(body)
    actual_signature = _decode(signature)
    expected_signature = hmac.new(_signing_secret(settings), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(actual_signature, expected_signature):
        _raise_conflict("CHANGE_SET_PREVIEW_REQUIRED")
    try:
        claims = BuilderChangeSetPreviewTokenClaims.model_validate_json(raw)
    except ValidationError as exc:
        raise Conflict(
            error="CHANGE_SET_PREVIEW_REQUIRED",
            message=t("errors", "CHANGE_SET_PREVIEW_REQUIRED"),
        ) from exc
    current = now or datetime.now(UTC)
    if claims.expires_at <= current:
        _raise_conflict("CHANGE_SET_EXPIRED")
    return claims


def builder_change_set_preview_token_hash(token: str) -> str:
    return f"sha256:{hashlib.sha256(token.encode('utf-8')).hexdigest()}"


def _serialize_claims(claims: BuilderChangeSetPreviewTokenClaims) -> bytes:
    return orjson.dumps(claims.model_dump(mode="json"), option=orjson.OPT_SORT_KEYS)


def _signing_secret(settings: Settings) -> bytes:
    secret = settings.auth.jwt_secret.get_secret_value().strip()
    if not secret:
        raise ServiceUnavailable(
            error="BUILDER_PREVIEW_SECRET_MISSING",
            message=t("errors", "BUILDER_PREVIEW_SECRET_MISSING"),
        )
    return secret.encode("utf-8")


def _split_token(token: str) -> tuple[str, str]:
    raw = token.strip()
    if raw.count(".") != 1:
        _raise_conflict("CHANGE_SET_PREVIEW_REQUIRED")
    body, signature = raw.split(".", 1)
    if not body or not signature:
        _raise_conflict("CHANGE_SET_PREVIEW_REQUIRED")
    return body, signature


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode((value + "=" * (-len(value) % 4)).encode("ascii"))
    except (binascii.Error, UnicodeEncodeError, ValueError) as exc:
        raise Conflict(
            error="CHANGE_SET_PREVIEW_REQUIRED",
            message=t("errors", "CHANGE_SET_PREVIEW_REQUIRED"),
        ) from exc


def _raise_conflict(code: str) -> None:
    raise Conflict(error=code, message=t("errors", code))
