from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from starlette.requests import Request

from src.config import Settings
from src.core.exceptions import Forbidden, ServiceUnavailable
from src.core.services import BaseService
from src.models.projects.api_key import ApiKeyFamily, DeliveryKeyPerspective
from src.modules.projects.api_keys.repository import ProjectApiKeysRepository
from src.modules.projects.api_keys.scopes import build_api_key_access_profile
from src.modules.projects.api_keys.security import split_api_key_token, verify_api_key_token
from src.settings.crypto import ensure_master_key, master_key_exists


class ContentApiCredential(BaseModel):
    model_config = ConfigDict(frozen=True)
    record: object
    granted_actions: frozenset[str]
    delivery_read: bool
    graphql_read: bool


def extract_content_api_token(request: Request) -> str | None:
    explicit = request.headers.get("x-api-key")
    authorization = request.headers.get("authorization")
    bearer = None
    if isinstance(authorization, str) and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    tokens = [value.strip() for value in (explicit, bearer) if isinstance(value, str) and value.strip()]
    if not tokens:
        return None
    if len(tokens) == 2 and tokens[0] != tokens[1]:
        raise Forbidden("Conflicting API key headers", error="API_KEY_CONFLICT")
    return tokens[0]


class ContentApiAuthService(BaseService):
    def __init__(self, settings: Settings, *, repo: ProjectApiKeysRepository | None = None) -> None:
        super().__init__(settings)
        self._settings = settings
        self._repo = repo or ProjectApiKeysRepository()

    async def authenticate_optional_delivery_key(
        self,
        *,
        request: Request,
        site_id: UUID,
        required_action: str | None = None,
        delivery_perspective: DeliveryKeyPerspective | None = None,
    ) -> ContentApiCredential | None:
        token = extract_content_api_token(request)
        if token is None:
            return None
        return await self.authenticate_delivery_key(
            token=token,
            site_id=site_id,
            required_action=required_action,
            delivery_perspective=delivery_perspective,
        )

    async def authenticate_delivery_key(
        self,
        *,
        token: str,
        site_id: UUID,
        required_action: str | None = None,
        delivery_perspective: DeliveryKeyPerspective | None = None,
    ) -> ContentApiCredential:
        try:
            family, public_id, _secret = split_api_key_token(token)
        except ValueError as exc:
            raise Forbidden("Invalid API key token", error="API_KEY_INVALID") from exc
        if family != ApiKeyFamily.DELIVERY:
            raise Forbidden("Delivery API key required", error="API_KEY_FAMILY_FORBIDDEN")

        record = await self._repo.get_key_by_public_id(token_public_id=public_id)
        if record is None:
            raise Forbidden("API key not found", error="API_KEY_NOT_FOUND")
        if UUID(str(record.site_id)) != site_id:
            raise Forbidden("API key site mismatch", error="API_KEY_SITE_MISMATCH")
        if record.revoked_at is not None:
            raise Forbidden("API key revoked", error="API_KEY_REVOKED")
        if record.expires_at is not None and record.expires_at <= datetime.now(tz=UTC):
            raise Forbidden("API key expired", error="API_KEY_EXPIRED")
        if delivery_perspective is not None and record.delivery_perspective != delivery_perspective:
            raise Forbidden("Delivery key perspective forbidden", error="DELIVERY_KEY_PERSPECTIVE_FORBIDDEN")

        if not verify_api_key_token(token=token, pepper=self._load_api_key_pepper(), expected_hash=record.token_hash):
            raise Forbidden("API key invalid", error="API_KEY_INVALID")

        profile = build_api_key_access_profile(record.scopes if isinstance(record.scopes, list) else [])
        if required_action is not None and required_action not in profile.granted_actions:
            raise Forbidden("Delivery API key scope required", error="DELIVERY_SCOPE_REQUIRED")

        updated = await self._repo.update_key(record, fields={"last_used_at": datetime.now(tz=UTC)})
        return ContentApiCredential(
            record=updated,
            granted_actions=profile.granted_actions,
            delivery_read=profile.delivery_read,
            graphql_read=profile.graphql_read,
        )

    def _load_api_key_pepper(self) -> bytes:
        key_path = self._settings.security.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable("Master key missing", error="MASTER_KEY_MISSING")
        try:
            key, _fingerprint = ensure_master_key(key_path)
            return key
        except ValueError as exc:
            raise ServiceUnavailable("Master key invalid", error="MASTER_KEY_INVALID") from exc
        except OSError as exc:
            raise ServiceUnavailable("API key hashing unavailable", error="API_KEY_HASHING_UNAVAILABLE") from exc
