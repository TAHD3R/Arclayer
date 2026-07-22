from __future__ import annotations

from typing import cast
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.services import BaseService
from src.models.storage.storage_profile import (
    StorageProfile,
    StorageProfileConfigSource,
    StorageProfileRouteRevision,
)
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.errors import StorageProfileRouteInvariantError
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_routes import (
    StorageProfileRoute,
    StorageProfileRouteBinding,
    build_storage_profile_config_from_route,
    build_storage_profile_route,
    storage_profile_route_hash,
    storage_profile_route_json,
)
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import (
    ENV_DEFAULT_PROFILE_KEY,
    build_env_storage_profile_config,
    build_storage_profile_config_from_record,
    validate_storage_profile_identity,
)
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class StorageProfileRouteUnavailableError(RuntimeError):
    """A new effect cannot bind the requested profile identity."""


class ResolvedStorageProfileRoute(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    binding: StorageProfileRouteBinding
    profile_key: str
    config: StorageProfileConfig
    is_tombstoned: bool


class StorageProfileRouteService(BaseService):
    """Materialize and resolve durable non-secret storage route identities."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: StorageProfileRouteRepository | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="storage-profile-routes")
        self.repository = repository or StorageProfileRouteRepository()

    async def materialize_by_key(self, *, profile_key: str) -> StorageProfileRouteBinding:
        normalized_key = profile_key.strip().lower()
        if not normalized_key:
            raise StorageProfileRouteUnavailableError("storage profile key cannot be blank")
        env_is_default = False
        if normalized_key == ENV_DEFAULT_PROFILE_KEY:
            from src.settings.runtime import get_effective_settings

            effective = await get_effective_settings(self.settings)
            env_is_default = effective.storage.default_profile_key == ENV_DEFAULT_PROFILE_KEY
        async with self.tx() as conn:
            profile = await self.repository.get_profile_by_key_for_update(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                profile_key=normalized_key,
                conn=conn,
            )
            if profile is None and normalized_key == ENV_DEFAULT_PROFILE_KEY:
                await self._create_env_default_identity(is_default=env_is_default, conn=conn)
                profile = await self.repository.get_profile_by_key_for_update(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    profile_key=normalized_key,
                    conn=conn,
                )
            if profile is not None:
                validate_storage_profile_identity(profile)
            if profile is None or profile.tombstoned_at is not None or not profile.is_active:
                raise StorageProfileRouteUnavailableError(
                    f"storage profile '{normalized_key}' is unavailable for new effects"
                )
            return await self.materialize_locked_profile(profile=profile, conn=conn)

    async def materialize_locked_profile(
        self,
        *,
        profile: StorageProfile,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteBinding:
        route = build_storage_profile_route(profile, settings=self.settings)
        if ObjectStorageProviderKind(str(profile.provider)) != ObjectStorageProviderKind(str(route.provider)):
            raise StorageProfileRouteInvariantError(
                f"storage profile {profile.id} provider identity requires an explicit hard-cut migration"
            )
        route_hash = storage_profile_route_hash(route)
        revision = await self.repository.get_route_revision_by_hash(
            profile_id=profile.id,
            route_hash=route_hash,
            conn=conn,
        )
        if revision is None:
            latest = await self.repository.get_latest_route_revision(profile_id=profile.id, conn=conn)
            revision = await self.repository.create_route_revision(
                profile_id=profile.id,
                revision_number=(latest.revision_number + 1) if latest is not None else 1,
                route=storage_profile_route_json(route),
                route_hash=route_hash,
                conn=conn,
            )
        persisted_route = self._validate_revision(revision)
        if persisted_route != route:
            raise StorageProfileRouteInvariantError(f"storage profile route hash collision for profile {profile.id}")
        return StorageProfileRouteBinding(
            profile_id=profile.id,
            profile_revision_id=revision.id,
            route_hash=revision.route_hash,
            route=persisted_route,
        )

    async def resolve(
        self,
        *,
        profile_id: UUID,
        revision_id: UUID,
    ) -> ResolvedStorageProfileRoute:
        async with self.tx() as conn:
            return await self.resolve_locked(
                profile_id=profile_id,
                revision_id=revision_id,
                conn=conn,
            )

    async def resolve_locked(
        self,
        *,
        profile_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ResolvedStorageProfileRoute:
        profile = await self.repository.get_profile_for_update(profile_id=profile_id, conn=conn)
        if profile is None:
            raise StorageProfileRouteInvariantError(f"storage profile {profile_id} no longer exists")
        revision = await self.repository.get_route_revision(
            profile_id=profile.id,
            revision_id=revision_id,
            conn=conn,
        )
        if revision is None:
            raise StorageProfileRouteInvariantError(f"storage profile revision {revision_id} no longer exists")
        route = self._validate_revision(revision)
        config = self._build_resolved_config(profile=profile, route=route)
        return ResolvedStorageProfileRoute(
            binding=StorageProfileRouteBinding(
                profile_id=profile.id,
                profile_revision_id=revision.id,
                route_hash=revision.route_hash,
                route=route,
            ),
            profile_key=profile.profile_key,
            config=config,
            is_tombstoned=profile.tombstoned_at is not None,
        )

    def validate_persisted_revision(self, revision: StorageProfileRouteRevision) -> StorageProfileRoute:
        return self._validate_revision(revision)

    def _build_resolved_config(
        self,
        *,
        profile: StorageProfile,
        route: StorageProfileRoute,
    ) -> StorageProfileConfig:
        credential_source = self.build_current_credential_config(profile=profile)
        try:
            profile_provider = ObjectStorageProviderKind(str(profile.provider))
            route_provider = ObjectStorageProviderKind(str(route.provider))
        except ValueError as exc:
            raise StorageProfileRouteInvariantError(
                f"storage profile {profile.id} has an invalid provider identity"
            ) from exc
        if profile_provider != route_provider:
            raise StorageProfileRouteInvariantError(
                f"storage profile {profile.id} provider identity requires an explicit hard-cut migration"
            )
        return build_storage_profile_config_from_route(
            credential_source,
            route,
        )

    def build_current_credential_config(self, *, profile: StorageProfile) -> StorageProfileConfig:
        try:
            profile_provider = ObjectStorageProviderKind(str(profile.provider))
            credential_source = build_storage_profile_config_from_record(profile, settings=self.settings)
            credential_provider = ObjectStorageProviderKind(str(credential_source.provider))
        except ValueError as exc:
            raise StorageProfileRouteInvariantError(
                f"storage profile {profile.id} has an invalid provider identity"
            ) from exc
        if profile_provider != credential_provider:
            raise StorageProfileRouteInvariantError(
                f"storage profile {profile.id} provider identity requires an explicit hard-cut migration"
            )
        return credential_source

    async def _create_env_default_identity(
        self,
        *,
        is_default: bool,
        conn: BaseDBAsyncClient,
    ) -> None:
        config = build_env_storage_profile_config(self.settings)
        values = self._env_profile_values(config, is_default=is_default)
        await self.repository.insert_profile_if_absent(
            values=values,
            conn=conn,
        )

    @staticmethod
    def _env_profile_values(
        config: StorageProfileConfig,
        *,
        is_default: bool,
    ) -> dict[str, object]:
        record_config: JsonObject = {
            "endpoint_url": config.endpoint_url,
            "region": config.region,
            "bucket": config.bucket,
            "public_bucket": config.public_bucket,
            "public_base_url": config.public_base_url,
            "public_delivery_mode": config.public_delivery_mode,
            "force_path_style": config.force_path_style,
            "presign_expires_seconds": config.presign_expires_seconds,
        }
        record_config = cast(JsonObject, {key: value for key, value in record_config.items() if value is not None})
        return {
            "profile_key": ENV_DEFAULT_PROFILE_KEY,
            "scope_type": SCOPE_TYPE_SYSTEM,
            "scope_id": SYSTEM_SCOPE_ID,
            "provider": ObjectStorageProviderKind(config.provider).value,
            "config_source": StorageProfileConfigSource.ENVIRONMENT,
            "display_name": config.display_name or "Environment Default",
            "config": record_config,
            "secret_ref": {},
            "is_active": True,
            "is_default": is_default,
        }

    @staticmethod
    def _validate_revision(revision: StorageProfileRouteRevision) -> StorageProfileRoute:
        try:
            route = StorageProfileRoute.model_validate(revision.route)
        except ValueError as exc:
            raise StorageProfileRouteInvariantError(f"storage profile route revision {revision.id} is invalid") from exc
        if revision.route != storage_profile_route_json(route):
            raise StorageProfileRouteInvariantError(
                f"storage profile route revision {revision.id} is not canonical JSON"
            )
        if storage_profile_route_hash(route) != revision.route_hash:
            raise StorageProfileRouteInvariantError(
                f"storage profile route revision {revision.id} hash does not match its route"
            )
        return route
