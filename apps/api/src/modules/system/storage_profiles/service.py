from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import UUID

from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.assets.asset import AssetRecord
from src.models.assets.upload import UploadSessionRecord
from src.models.storage.storage_profile import (
    StorageProfile,
    StorageProfileConfigSource,
    StorageProfileTestState,
)
from src.models.system.setting import SettingRecord
from src.modules.jobs.provider_effect_repository import ProviderEffectRepository
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
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import StorageProfileRouteService
from src.platform.storage.profile_routes import (
    StorageProfileRoute,
    StorageProfileRouteBinding,
    build_storage_profile_route,
    storage_profile_route_transition_is_destructive,
)
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import (
    ENV_DEFAULT_PROFILE_KEY,
    build_env_storage_profile_config,
    build_storage_profile_config_from_record,
    validate_storage_profile_identity,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from src.settings.validation import merge_deep


def _ts(key: str) -> str:
    return t("errors", key)


class StorageProfilesService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        route_repository: StorageProfileRouteRepository | None = None,
        effect_repository: ProviderEffectRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.route_repository = route_repository or StorageProfileRouteRepository()
        self.effect_repository = effect_repository or ProviderEffectRepository()
        self.route_service = StorageProfileRouteService(settings, repository=self.route_repository)

    async def list_profiles(self) -> StorageProfileListOut:
        await self.route_service.materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
        records = await StorageProfile.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            tombstoned_at__isnull=True,
        ).order_by("-is_default", "display_name", "created_at")
        test_states = await self._load_test_states()
        from src.settings.runtime import get_effective_settings

        effective_default = (await get_effective_settings(self.settings)).storage.default_profile_key
        items = [
            self._to_out(
                record,
                test_states.get(record.profile_key),
                is_default=record.profile_key == effective_default,
            )
            for record in records
        ]
        items.sort(key=lambda item: (not item.is_default, item.display_name.casefold(), item.profile_key))
        return StorageProfileListOut(items=items)

    async def create_profile(
        self,
        *,
        payload: StorageProfileCreateRequest,
    ) -> StorageProfileOut:
        if payload.profile_key == ENV_DEFAULT_PROFILE_KEY:
            raise BadRequest(
                message=_ts("STORAGE_PROFILE_KEY_RESERVED"),
                error="STORAGE_PROFILE_KEY_RESERVED",
            )
        values: dict[str, object] = {
            "profile_key": payload.profile_key,
            "scope_type": SCOPE_TYPE_SYSTEM,
            "scope_id": SYSTEM_SCOPE_ID,
            "provider": payload.provider,
            "config_source": StorageProfileConfigSource.DATABASE,
            "display_name": payload.display_name,
            "config": self._config_to_record(payload.config),
            "secret_ref": self._secrets_to_record(payload.config),
            "is_active": payload.is_active,
            "is_default": False,
        }
        async with self.tx() as conn:
            candidate_id = await self.route_repository.insert_profile_if_absent(values=values, conn=conn)
            record = await self.route_repository.get_profile_by_key_for_update(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                profile_key=payload.profile_key,
                conn=conn,
            )
            if record is None:
                raise RuntimeError("Storage profile insert did not produce a canonical row")
            if record.id != candidate_id:
                raise BadRequest(message=_ts("STORAGE_PROFILE_KEY_EXISTS"), error="STORAGE_PROFILE_KEY_EXISTS")
            await self._materialize_admin_route(profile=record, conn=conn)
        return self._to_out(
            record,
            is_default=record.profile_key == await self._get_effective_default_profile_key(),
        )

    async def update_profile(
        self,
        *,
        profile_id: UUID,
        payload: StorageProfileUpdateRequest,
    ) -> StorageProfileOut:
        async with self.tx() as conn:
            record = await self.route_repository.get_profile_for_update(profile_id=profile_id, conn=conn)
            if (
                record is None
                or record.scope_type != SCOPE_TYPE_SYSTEM
                or record.scope_id != SYSTEM_SCOPE_ID
                or record.tombstoned_at is not None
            ):
                raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")
            validate_storage_profile_identity(record)
            if record.config_source == StorageProfileConfigSource.ENVIRONMENT:
                raise BadRequest(
                    message=_ts("STORAGE_PROFILE_ENVIRONMENT_MANAGED"),
                    error="STORAGE_PROFILE_ENVIRONMENT_MANAGED",
                )

            current_route = self._build_admin_route(record)
            if payload.display_name is not None:
                record.display_name = payload.display_name
            if payload.config is not None:
                merged_config = merge_deep(
                    record.config if isinstance(record.config, dict) else {},
                    self._config_to_record(payload.config, partial=True),
                )
                secrets = dict(record.secret_ref if isinstance(record.secret_ref, dict) else {})
                next_secret = self._secrets_to_record(payload.config)
                if next_secret:
                    secrets.update(next_secret)
                record.config = merged_config
                record.secret_ref = secrets
            if payload.is_active is not None:
                record.is_active = payload.is_active
            effective_default = await self._get_effective_default_profile_key(conn=conn)
            if record.profile_key == effective_default and not record.is_active:
                raise BadRequest(
                    message=_ts("STORAGE_PROFILE_DEFAULT_INACTIVE"),
                    error="STORAGE_PROFILE_DEFAULT_INACTIVE",
                )

            updated_route = self._build_admin_route(record)
            if storage_profile_route_transition_is_destructive(
                current=current_route,
                updated=updated_route,
            ) and await self.effect_repository.has_active_effects_for_profile(
                profile_id=record.id,
                conn=conn,
            ):
                raise BadRequest(message=_ts("STORAGE_PROFILE_IN_USE"), error="STORAGE_PROFILE_IN_USE")

            await self._materialize_admin_route(profile=record, conn=conn)
            await record.save(using_db=conn)
        return self._to_out(
            record,
            is_default=record.profile_key == await self._get_effective_default_profile_key(),
        )

    async def test_profile(self, *, profile_id: UUID) -> StorageProfileTestResultOut:
        record = await StorageProfile.get_or_none(
            id=profile_id,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            tombstoned_at__isnull=True,
        )
        if record is None:
            raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")

        return await self._test_record(record)

    async def test_profile_by_key(self, *, profile_key: str) -> StorageProfileTestResultOut:
        normalized_key = profile_key.strip().lower()
        record = await StorageProfile.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            profile_key=normalized_key,
            tombstoned_at__isnull=True,
        )
        if record is not None:
            return await self._test_record(record)
        tombstoned = await StorageProfile.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            profile_key=normalized_key,
            tombstoned_at__isnull=False,
        ).exists()
        if tombstoned:
            raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")
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

    async def _test_record(self, record: StorageProfile) -> StorageProfileTestResultOut:
        result = await self._test_config(self.route_service.build_current_credential_config(profile=record))
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

    async def delete_profile(self, *, profile_id: UUID) -> StorageProfileDeleteOut:
        async with self.tx() as conn:
            record = await self.route_repository.get_profile_for_update(profile_id=profile_id, conn=conn)
            if record is None or record.scope_type != SCOPE_TYPE_SYSTEM or record.scope_id != SYSTEM_SCOPE_ID:
                raise NotFound(message=_ts("STORAGE_PROFILE_NOT_FOUND"), error="STORAGE_PROFILE_NOT_FOUND")
            validate_storage_profile_identity(record)
            if record.tombstoned_at is not None:
                return StorageProfileDeleteOut(id=record.id, deleted=True)
            if record.config_source == StorageProfileConfigSource.ENVIRONMENT:
                raise BadRequest(
                    message=_ts("STORAGE_PROFILE_ENVIRONMENT_MANAGED"),
                    error="STORAGE_PROFILE_ENVIRONMENT_MANAGED",
                )

            referenced = await self._is_profile_referenced(record.profile_key, conn=conn)
            if referenced:
                raise BadRequest(
                    message=_ts("STORAGE_PROFILE_IN_USE"),
                    error="STORAGE_PROFILE_IN_USE",
                )

            record.tombstoned_at = await self.route_repository.get_database_time(conn=conn)
            record.is_active = False
            record.is_default = False
            await record.save(
                update_fields=["tombstoned_at", "is_active", "is_default", "updated_at"],
                using_db=conn,
            )
            return StorageProfileDeleteOut(id=record.id, deleted=True)

    async def _remember_test_state(
        self,
        *,
        profile_key: str,
        status: Literal["passed", "failed"],
        message: str | None,
    ) -> None:
        now = datetime.now(tz=UTC)
        record, _created = await StorageProfileTestState.get_or_create(
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
        cast(Any, record).last_test_message = message
        record.last_tested_at = now
        await record.save(update_fields=["last_test_status", "last_test_message", "last_tested_at", "updated_at"])

    def _build_admin_route(self, record: StorageProfile) -> StorageProfileRoute:
        try:
            return build_storage_profile_route(record, settings=self.settings)
        except ValidationError as exc:
            raise BadRequest(
                message=_ts("STORAGE_PROFILE_CONFIG_INVALID"),
                error="STORAGE_PROFILE_CONFIG_INVALID",
            ) from exc

    async def _materialize_admin_route(
        self,
        *,
        profile: StorageProfile,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteBinding:
        try:
            return await self.route_service.materialize_locked_profile(profile=profile, conn=conn)
        except ValidationError as exc:
            raise BadRequest(
                message=_ts("STORAGE_PROFILE_CONFIG_INVALID"),
                error="STORAGE_PROFILE_CONFIG_INVALID",
            ) from exc

    async def _load_test_states(self) -> dict[str, StorageProfileTestState]:
        states = await StorageProfileTestState.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        return {state.profile_key: state for state in states}

    def _to_out(
        self,
        record: StorageProfile,
        test_state: StorageProfileTestState | None = None,
        *,
        is_default: bool,
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
            config_source=record.config_source,
            display_name=record.display_name,
            config=self._payload_from_runtime_config(config),
            secrets=StorageProfileSecretsOut(
                secret_access_key=(
                    config.secret_access_key is not None
                    if record.config_source == StorageProfileConfigSource.ENVIRONMENT
                    else bool((record.secret_ref or {}).get("secret_access_key"))
                )
            ),
            is_active=record.is_active,
            is_default=is_default,
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
    def _config_to_record(
        payload: StorageProfileConfigPayload,
        *,
        partial: bool = False,
    ) -> dict[str, Any]:
        data = payload.model_dump(
            exclude_none=not partial,
            exclude_unset=partial,
            exclude={"secret_access_key"},
        )
        if not partial and "public_delivery_mode" not in data:
            data["public_delivery_mode"] = payload.public_delivery_mode
        return data

    @staticmethod
    def _secrets_to_record(payload: StorageProfileConfigPayload) -> dict[str, Any]:
        secret = (payload.secret_access_key or "").strip()
        if not secret:
            return {}
        return {"secret_access_key": secret}

    async def _is_profile_referenced(
        self,
        profile_key: str,
        *,
        conn: BaseDBAsyncClient,
    ) -> bool:
        runtime_default = await self._get_effective_default_profile_key(conn=conn)
        if runtime_default == profile_key:
            return True
        asset_referenced = await AssetRecord.filter(storage_profile_key=profile_key).using_db(conn).exists()
        if asset_referenced:
            return True
        upload_referenced = await UploadSessionRecord.filter(storage_profile_key=profile_key).using_db(conn).exists()
        return bool(upload_referenced)

    async def _get_runtime_default_profile_key(
        self,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> str | None:
        query = SettingRecord.filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        record = await (query.using_db(conn) if conn is not None else query).first()
        value = record.value if record and isinstance(record.value, dict) else {}
        storage = value.get("storage") if isinstance(value, dict) else None
        if not isinstance(storage, dict):
            return None
        key = storage.get("default_profile_key")
        return str(key).strip() or None if isinstance(key, str) else None

    async def _get_effective_default_profile_key(
        self,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> str:
        runtime_default = await self._get_runtime_default_profile_key(conn=conn)
        return runtime_default or self.settings.storage.default_profile_key
