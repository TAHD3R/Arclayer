from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.assets.asset import AssetRecord
from src.models.assets.upload import UploadSessionRecord
from src.models.storage.storage_profile import StorageProfileRecord, StorageProfileTestStateRecord
from src.models.system.setting import SettingRecord
from src.modules.system.storage_profiles.schema import (
    StorageProfileConfigPayload,
    StorageProfileCreateRequest,
    StorageProfileDeleteOut,
    StorageProfileListOut,
    StorageProfileOut,
    StorageProfileSecretsOut,
    StorageProfileTestResultOut,
    StorageProfileUpdateRequest,
)
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import (
    ENV_DEFAULT_PROFILE_KEY,
    build_env_storage_profile_config,
    build_storage_profile_config_from_record,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from src.settings.validation import merge_deep


def _ts(key: str) -> str:
    return t("errors", key)


class StorageProfilesService(BaseService):
    async def list_profiles(self) -> StorageProfileListOut:
        records = await StorageProfileRecord.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        ).order_by("-is_default", "display_name", "created_at")
        test_states = await self._load_test_states()
        items = [self._to_out(record, test_states.get(record.profile_key)) for record in records]
        if not any(item.profile_key == ENV_DEFAULT_PROFILE_KEY for item in items):
            items.append(self._build_env_default_out(test_states.get(ENV_DEFAULT_PROFILE_KEY)))
        return StorageProfileListOut(items=items)

    async def create_profile(
        self,
        *,
        payload: StorageProfileCreateRequest,
        updated_by: UUID | None,
    ) -> StorageProfileOut:
        exists = await StorageProfileRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            profile_key=payload.profile_key,
        )
        if exists is not None:
            raise BadRequest(message=_ts("STORAGE_PROFILE_KEY_EXISTS"), error="STORAGE_PROFILE_KEY_EXISTS")

        record = await StorageProfileRecord.create(
            profile_key=payload.profile_key,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            provider=payload.provider,
            display_name=payload.display_name,
            config=self._config_to_record(payload.config),
            secret_ref=self._secrets_to_record(payload.config),
            is_active=payload.is_active,
            is_default=payload.is_default,
        )
        if payload.is_default:
            await self._set_default_profile(record)
            await self._set_runtime_default_profile_key(record.profile_key, updated_by=updated_by)
            record = await StorageProfileRecord.get(id=record.id)
        return self._to_out(record)

    async def update_profile(
        self,
        *,
        profile_id: UUID,
        payload: StorageProfileUpdateRequest,
        updated_by: UUID | None,
    ) -> StorageProfileOut:
        record = await StorageProfileRecord.get_or_none(
            id=profile_id,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        if record is None:
            raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")

        if payload.display_name is not None:
            record.display_name = payload.display_name
        if payload.config is not None:
            merged_config = merge_deep(
                record.config if isinstance(record.config, dict) else {}, self._config_to_record(payload.config)
            )
            secrets = dict(record.secret_ref if isinstance(record.secret_ref, dict) else {})
            next_secret = self._secrets_to_record(payload.config)
            if next_secret:
                secrets.update(next_secret)
            record.config = merged_config
            record.secret_ref = secrets
        if payload.is_active is not None:
            record.is_active = payload.is_active
        if payload.is_default is not None:
            record.is_default = payload.is_default

        await record.save()

        if payload.is_default:
            await self._set_default_profile(record)
            await self._set_runtime_default_profile_key(record.profile_key, updated_by=updated_by)
            record = await StorageProfileRecord.get(id=record.id)
        elif payload.is_default is False and record.profile_key == await self._get_runtime_default_profile_key():
            await self._set_runtime_default_profile_key(None, updated_by=updated_by)

        return self._to_out(record)

    async def test_profile(self, *, profile_id: UUID) -> StorageProfileTestResultOut:
        record = await StorageProfileRecord.get_or_none(
            id=profile_id,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        if record is None:
            raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")

        return await self._test_record(record)

    async def test_profile_by_key(self, *, profile_key: str) -> StorageProfileTestResultOut:
        normalized_key = profile_key.strip().lower()
        record = await StorageProfileRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            profile_key=normalized_key,
        )
        if record is not None:
            return await self._test_record(record)
        if normalized_key != ENV_DEFAULT_PROFILE_KEY:
            raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")

        config = build_env_storage_profile_config(self.settings)
        result = await self._test_config(config)
        await self._remember_test_state(
            profile_key=ENV_DEFAULT_PROFILE_KEY,
            status=result.status,
            message=result.message,
        )
        return result

    async def _test_record(self, record: StorageProfileRecord) -> StorageProfileTestResultOut:
        result = await self._test_config(build_storage_profile_config_from_record(record, settings=self.settings))
        await self._remember_test_state(
            profile_key=record.profile_key,
            status=result.status,
            message=result.message,
        )
        return result

    async def _test_config(self, config: StorageProfileConfig) -> StorageProfileTestResultOut:
        try:
            provider = build_storage_provider(config)
            if provider.capabilities.supports_bucket_create:
                await provider.ensure_bucket()
            elif provider.provider == "local":
                self.settings.storage.local_root_dir.mkdir(parents=True, exist_ok=True)
            else:
                await provider.head_bucket()
        except Exception as exc:
            return StorageProfileTestResultOut(ok=False, status="failed", message=str(exc))

        return StorageProfileTestResultOut(ok=True, status="passed", message="Connectivity check passed")

    async def delete_profile(self, *, profile_id: UUID, updated_by: UUID | None) -> StorageProfileDeleteOut:
        record = await StorageProfileRecord.get_or_none(
            id=profile_id,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        if record is None:
            raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")

        if await self._is_profile_referenced(record.profile_key):
            raise BadRequest(
                message=_ts("STORAGE_PROFILE_IN_USE"),
                error="STORAGE_PROFILE_IN_USE",
            )

        if record.profile_key == await self._get_runtime_default_profile_key():
            await self._set_runtime_default_profile_key(None, updated_by=updated_by)

        profile_id = record.id
        await record.delete()
        return StorageProfileDeleteOut(id=profile_id, deleted=True)

    async def _remember_test_state(
        self,
        *,
        profile_key: str,
        status: Literal["passed", "failed"],
        message: str | None,
    ) -> None:
        now = datetime.now(tz=UTC)
        record, _created = await StorageProfileTestStateRecord.get_or_create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            profile_key=profile_key,
            defaults={
                "last_test_status": status,
                "last_test_message": message,
                "last_tested_at": now,
            },
        )
        record.last_test_status = status
        record.last_test_message = message
        record.last_tested_at = now
        await record.save(update_fields=["last_test_status", "last_test_message", "last_tested_at", "updated_at"])

    async def _load_test_states(self) -> dict[str, StorageProfileTestStateRecord]:
        states = await StorageProfileTestStateRecord.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        return {state.profile_key: state for state in states}

    def _build_env_default_out(
        self,
        test_state: StorageProfileTestStateRecord | None = None,
    ) -> StorageProfileOut:
        config = build_env_storage_profile_config(self.settings)
        return StorageProfileOut(
            id=UUID(int=0),
            created_at=datetime.now(tz=UTC),
            updated_at=datetime.now(tz=UTC),
            profile_key=ENV_DEFAULT_PROFILE_KEY,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            provider=config.provider,
            display_name=config.display_name or "Environment Default",
            config=self._payload_from_runtime_config(config),
            secrets=StorageProfileSecretsOut(secret_access_key=config.secret_access_key is not None),
            is_active=True,
            is_default=False,
            last_test_status=cast(Literal["passed", "failed"] | None, test_state.last_test_status)
            if test_state
            else None,
            last_test_message=test_state.last_test_message if test_state else None,
            last_tested_at=test_state.last_tested_at if test_state else None,
        )

    def _to_out(
        self,
        record: StorageProfileRecord,
        test_state: StorageProfileTestStateRecord | None = None,
    ) -> StorageProfileOut:
        config = build_storage_profile_config_from_record(record, settings=self.settings)
        return StorageProfileOut(
            id=record.id,
            created_at=record.created_at,
            updated_at=record.updated_at,
            profile_key=record.profile_key,
            scope_type=record.scope_type,
            scope_id=record.scope_id,
            provider=config.provider,
            display_name=record.display_name,
            config=self._payload_from_runtime_config(config),
            secrets=StorageProfileSecretsOut(
                secret_access_key=bool((record.secret_ref or {}).get("secret_access_key"))
            ),
            is_active=record.is_active,
            is_default=record.is_default,
            last_test_status=cast(Literal["passed", "failed"] | None, test_state.last_test_status)
            if test_state
            else None,
            last_test_message=test_state.last_test_message if test_state else None,
            last_tested_at=test_state.last_tested_at if test_state else None,
        )

    @staticmethod
    def _payload_from_runtime_config(config) -> StorageProfileConfigPayload:
        return StorageProfileConfigPayload(
            endpoint_url=config.endpoint_url,
            region=config.region,
            bucket=config.bucket,
            public_bucket=config.public_bucket,
            public_base_url=config.public_base_url,
            public_delivery_mode=config.public_delivery_mode,
            force_path_style=config.force_path_style,
            access_key_id=config.access_key_id,
            presign_expires_seconds=config.presign_expires_seconds,
        )

    @staticmethod
    def _config_to_record(payload: StorageProfileConfigPayload) -> dict[str, Any]:
        data = payload.model_dump(exclude_none=True, exclude={"secret_access_key"})
        if "public_delivery_mode" not in data:
            data["public_delivery_mode"] = payload.public_delivery_mode
        return data

    @staticmethod
    def _secrets_to_record(payload: StorageProfileConfigPayload) -> dict[str, Any]:
        secret = (payload.secret_access_key or "").strip()
        if not secret:
            return {}
        return {"secret_access_key": secret}

    async def _set_default_profile(self, record: StorageProfileRecord) -> None:
        await (
            StorageProfileRecord
            .filter(
                scope_type=record.scope_type,
                scope_id=record.scope_id,
                is_default=True,
            )
            .exclude(id=record.id)
            .update(is_default=False)
        )
        if not record.is_default:
            record.is_default = True
            await record.save(update_fields=["is_default", "updated_at"])

    async def _is_profile_referenced(self, profile_key: str) -> bool:
        runtime_default = await self._get_runtime_default_profile_key()
        if runtime_default == profile_key:
            return True
        asset_referenced = await AssetRecord.filter(storage_profile_key=profile_key).exists()
        if asset_referenced:
            return True
        upload_referenced = await UploadSessionRecord.filter(storage_profile_key=profile_key).exists()
        return bool(upload_referenced)

    async def _get_runtime_default_profile_key(self) -> str | None:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        value = record.value if record and isinstance(record.value, dict) else {}
        storage = value.get("storage") if isinstance(value, dict) else None
        if not isinstance(storage, dict):
            return None
        key = storage.get("default_profile_key")
        return str(key).strip() or None if isinstance(key, str) else None

    async def _set_runtime_default_profile_key(self, profile_key: str | None, *, updated_by: UUID | None) -> None:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        current_raw = record.value if record and isinstance(record.value, dict) else {}
        current = cast(JsonObject, current_raw)
        patch: JsonObject = {"storage": {"default_profile_key": profile_key}}
        merged = merge_deep(current, patch)
        if record is None:
            await SettingRecord.create(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
                value=merged or None,
                updated_by=updated_by,
            )
            return
        record.value = merged or None
        record.updated_by = updated_by
        await record.save(update_fields=["value", "updated_by", "updated_at"])
