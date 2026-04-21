from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.common.services import BaseService
from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.i18n import t
from src.models.projects.api_key import ApiKeyFamily, ApiKeyRecord, DeliveryKeyPerspective
from src.modules.projects.api_keys.repository import ProjectApiKeysRepository
from src.modules.projects.api_keys.schema import (
    ApiKeyCreateOut,
    ApiKeyListOut,
    ApiKeyOut,
    PersonalApiKeyCreateIn,
    ProjectApiKeyCreateIn,
)
from src.modules.projects.api_keys.scopes import ApiKeyScope, normalize_api_key_scopes
from src.modules.projects.api_keys.security import GeneratedApiKey, mint_api_key
from src.settings.crypto import ensure_master_key, master_key_exists


class ProjectApiKeysService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = ProjectApiKeysRepository()

    async def list_personal_keys_out(self, *, owner_user_id: UUID) -> ApiKeyListOut:
        rows = await self.repo.list_personal_keys(owner_user_id=owner_user_id)
        return ApiKeyListOut(items=[self._to_out(row) for row in rows])

    async def create_personal_key_out(
        self,
        *,
        owner_user_id: UUID,
        payload: PersonalApiKeyCreateIn,
    ) -> ApiKeyCreateOut:
        scopes = self._normalize_scopes(payload.scopes)
        self._require_personal_scopes(scopes)
        generated = self._mint_key(ApiKeyFamily.PERSONAL_MANAGEMENT)
        record = await self.repo.create_key(
            owner_user_id=owner_user_id,
            workspace_id=None,
            site_id=None,
            key_family=ApiKeyFamily.PERSONAL_MANAGEMENT,
            delivery_perspective=None,
            name=payload.name,
            description=payload.description,
            token_public_id=generated.public_id,
            token_hash=generated.token_hash,
            token_mask=generated.token_mask,
            scopes=[scope.value for scope in scopes],
            created_by_user_id=owner_user_id,
            expires_at=self._normalize_expires_at(payload.expires_at),
        )
        self.logger.info(
            "Personal API key created",
            actor_user_id=str(owner_user_id),
            key_family=ApiKeyFamily.PERSONAL_MANAGEMENT.value,
            key_id=str(record.id),
            scopes=[scope.value for scope in scopes],
        )
        return ApiKeyCreateOut(key=self._to_out(record), secret_token=generated.token)

    async def get_personal_key_out(self, *, owner_user_id: UUID, key_id: UUID) -> ApiKeyOut:
        record = await self.repo.get_personal_key(owner_user_id=owner_user_id, key_id=key_id)
        return self._to_out(self._require_record(record, error="API_KEY_NOT_FOUND"))

    async def revoke_personal_key_out(self, *, owner_user_id: UUID, key_id: UUID) -> ApiKeyOut:
        record = await self.repo.get_personal_key(owner_user_id=owner_user_id, key_id=key_id)
        row = self._require_record(record, error="API_KEY_NOT_FOUND")
        self._ensure_not_revoked(row)
        updated = await self.repo.update_key(row, fields={"revoked_at": datetime.now(tz=UTC)})
        self.logger.info(
            "Personal API key revoked",
            actor_user_id=str(owner_user_id),
            key_family=str(updated.key_family),
            key_id=str(updated.id),
        )
        return self._to_out(updated)

    async def rotate_personal_key_out(self, *, owner_user_id: UUID, key_id: UUID) -> ApiKeyCreateOut:
        record = await self.repo.get_personal_key(owner_user_id=owner_user_id, key_id=key_id)
        row = self._require_record(record, error="API_KEY_NOT_FOUND")
        self._ensure_not_revoked(row)
        generated = self._mint_key(ApiKeyFamily.PERSONAL_MANAGEMENT)
        updated = await self.repo.update_key(
            row,
            fields={
                "token_public_id": generated.public_id,
                "token_hash": generated.token_hash,
                "token_mask": generated.token_mask,
                "last_used_at": None,
            },
        )
        self.logger.info(
            "Personal API key rotated",
            actor_user_id=str(owner_user_id),
            key_family=str(updated.key_family),
            key_id=str(updated.id),
            new_token_public_id=updated.token_public_id,
        )
        return ApiKeyCreateOut(key=self._to_out(updated), secret_token=generated.token)

    async def list_project_site_keys_out(self, *, workspace_id: UUID, site_id: UUID) -> ApiKeyListOut:
        rows = await self.repo.list_project_site_keys(workspace_id=workspace_id, site_id=site_id)
        return ApiKeyListOut(items=[self._to_out(row) for row in rows])

    async def create_project_site_key_out(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        actor_user_id: UUID,
        payload: ProjectApiKeyCreateIn,
    ) -> ApiKeyCreateOut:
        family = ApiKeyFamily(str(payload.family))
        if family == ApiKeyFamily.PERSONAL_MANAGEMENT:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_FAMILY_INVALID")
        scopes = self._normalize_scopes(payload.scopes)
        requested_perspective = (
            DeliveryKeyPerspective(str(payload.delivery_perspective))
            if payload.delivery_perspective is not None
            else None
        )
        delivery_perspective = self._validate_workspace_key_family(
            family=family,
            scopes=scopes,
            delivery_perspective=requested_perspective,
        )
        generated = self._mint_key(family)
        record = await self.repo.create_key(
            owner_user_id=None,
            workspace_id=workspace_id,
            site_id=site_id,
            key_family=family,
            delivery_perspective=delivery_perspective.value if delivery_perspective is not None else None,
            name=payload.name,
            description=payload.description,
            token_public_id=generated.public_id,
            token_hash=generated.token_hash,
            token_mask=generated.token_mask,
            scopes=[scope.value for scope in scopes],
            created_by_user_id=actor_user_id,
            expires_at=self._normalize_expires_at(payload.expires_at),
        )
        self.logger.info(
            "Project site API key created",
            actor_user_id=str(actor_user_id),
            delivery_perspective=delivery_perspective.value if delivery_perspective is not None else None,
            key_family=family.value,
            key_id=str(record.id),
            scopes=[scope.value for scope in scopes],
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        return ApiKeyCreateOut(key=self._to_out(record), secret_token=generated.token)

    async def get_project_site_key_out(self, *, workspace_id: UUID, site_id: UUID, key_id: UUID) -> ApiKeyOut:
        record = await self.repo.get_project_site_key(workspace_id=workspace_id, site_id=site_id, key_id=key_id)
        return self._to_out(self._require_record(record, error="API_KEY_NOT_FOUND"))

    async def revoke_project_site_key_out(self, *, workspace_id: UUID, site_id: UUID, key_id: UUID) -> ApiKeyOut:
        record = await self.repo.get_project_site_key(workspace_id=workspace_id, site_id=site_id, key_id=key_id)
        row = self._require_record(record, error="API_KEY_NOT_FOUND")
        self._ensure_not_revoked(row)
        updated = await self.repo.update_key(row, fields={"revoked_at": datetime.now(tz=UTC)})
        self.logger.info(
            "Project site API key revoked",
            key_family=str(updated.key_family),
            key_id=str(updated.id),
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        return self._to_out(updated)

    async def rotate_project_site_key_out(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        key_id: UUID,
    ) -> ApiKeyCreateOut:
        record = await self.repo.get_project_site_key(workspace_id=workspace_id, site_id=site_id, key_id=key_id)
        row = self._require_record(record, error="API_KEY_NOT_FOUND")
        self._ensure_not_revoked(row)
        generated = self._mint_key(ApiKeyFamily(str(row.key_family)))
        updated = await self.repo.update_key(
            row,
            fields={
                "token_public_id": generated.public_id,
                "token_hash": generated.token_hash,
                "token_mask": generated.token_mask,
                "last_used_at": None,
            },
        )
        self.logger.info(
            "Project site API key rotated",
            key_family=str(updated.key_family),
            key_id=str(updated.id),
            new_token_public_id=updated.token_public_id,
            site_id=str(site_id),
            workspace_id=str(workspace_id),
        )
        return ApiKeyCreateOut(key=self._to_out(updated), secret_token=generated.token)

    def _mint_key(self, family: ApiKeyFamily) -> GeneratedApiKey:
        pepper = self._load_api_key_pepper()
        return mint_api_key(family=family, pepper=pepper)

    def _load_api_key_pepper(self) -> bytes:
        key_path = self.settings.security.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(message=t("settings", "MASTER_KEY_MISSING"), error="MASTER_KEY_MISSING")
        try:
            key, _fingerprint = ensure_master_key(key_path)
            return key
        except ValueError as exc:
            raise ServiceUnavailable(
                message=t("auth", "MASTER_KEY_INVALID"),
                error="MASTER_KEY_INVALID",
            ) from exc
        except OSError as exc:
            raise ServiceUnavailable(
                message=t("auth", "TWO_FACTOR_SETUP_UNAVAILABLE"),
                error="API_KEY_HASHING_UNAVAILABLE",
            ) from exc

    @staticmethod
    def _normalize_scopes(raw_scopes: list[ApiKeyScope]) -> tuple[ApiKeyScope, ...]:
        try:
            return normalize_api_key_scopes(raw_scopes)
        except ValueError as exc:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_SCOPE_INVALID") from exc

    @staticmethod
    def _require_personal_scopes(scopes: tuple[ApiKeyScope, ...]) -> None:
        invalid = {ApiKeyScope.DELIVERY_READ, ApiKeyScope.GRAPHQL_READ} & set(scopes)
        if invalid:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_SCOPE_INVALID_FOR_PERSONAL")

    @staticmethod
    def _validate_workspace_key_family(
        *,
        family: ApiKeyFamily,
        scopes: tuple[ApiKeyScope, ...],
        delivery_perspective: DeliveryKeyPerspective | None,
    ) -> DeliveryKeyPerspective | None:
        scope_set = set(scopes)
        if family == ApiKeyFamily.WORKSPACE_SERVICE:
            if ApiKeyScope.DELIVERY_READ in scope_set or ApiKeyScope.GRAPHQL_READ in scope_set:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_SCOPE_INVALID_FOR_WORKSPACE")
            if delivery_perspective is not None:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="DELIVERY_KEY_PERSPECTIVE_INVALID")
            return None

        if family == ApiKeyFamily.DELIVERY:
            if not scope_set or not scope_set <= {ApiKeyScope.DELIVERY_READ, ApiKeyScope.GRAPHQL_READ}:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_SCOPE_INVALID_FOR_DELIVERY")
            if delivery_perspective is None:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="DELIVERY_KEY_PERSPECTIVE_REQUIRED")
            return delivery_perspective

        raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_FAMILY_INVALID")

    @staticmethod
    def _normalize_expires_at(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        normalized = value.astimezone(UTC)
        if normalized <= datetime.now(tz=UTC):
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="API_KEY_EXPIRES_AT_INVALID")
        return normalized

    @staticmethod
    def _ensure_not_revoked(record: ApiKeyRecord) -> None:
        if record.revoked_at is not None:
            raise Conflict(message=t("errors", "BAD_REQUEST"), error="API_KEY_REVOKED")

    @staticmethod
    def _require_record(record: ApiKeyRecord | None, *, error: str) -> ApiKeyRecord:
        if record is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error=error)
        return record

    @staticmethod
    def _to_out(record: ApiKeyRecord) -> ApiKeyOut:
        raw_scopes = record.scopes if isinstance(record.scopes, list) else []
        scopes = [ApiKeyScope(str(scope)) for scope in raw_scopes]
        return ApiKeyOut(
            id=record.id,
            owner_user_id=encode_uuid(record.owner_user_id) if record.owner_user_id is not None else None,
            workspace_id=encode_uuid(record.workspace_id) if record.workspace_id is not None else None,
            site_id=encode_uuid(record.site_id) if record.site_id is not None else None,
            family=ApiKeyFamily(str(record.key_family)),
            delivery_perspective=(
                DeliveryKeyPerspective(str(record.delivery_perspective))
                if record.delivery_perspective is not None
                else None
            ),
            name=record.name,
            description=record.description,
            token_public_id=record.token_public_id,
            token_mask=record.token_mask,
            scopes=scopes,
            created_by_user_id=(
                encode_uuid(record.created_by_user_id) if record.created_by_user_id is not None else None
            ),
            last_used_at=record.last_used_at,
            expires_at=record.expires_at,
            revoked_at=record.revoked_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
