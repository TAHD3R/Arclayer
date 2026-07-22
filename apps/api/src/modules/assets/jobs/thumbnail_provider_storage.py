from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol, cast
from unicodedata import category
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.database.errors import is_retryable_postgres_failure
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE,
)
from src.modules.assets.jobs.thumbnail_pipeline import AssetThumbnailSource
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectManifestV1,
)
from src.modules.jobs.execution_errors import (
    JobExecutionStateInvariantError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.profile_route_service import (
    ResolvedStorageProfileRoute,
    StorageProfileRouteUnavailableError,
)
from src.platform.storage.profile_routes import (
    StorageProfileRoute,
    StorageProfileRouteBinding,
    build_storage_profile_route_from_config,
)
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import get_storage_profile_by_key
from src.platform.storage.providers.base import ObjectStorageProvider
from src.settings.runtime import get_effective_settings


class AssetThumbnailProviderRouteOperations(Protocol):
    """ProviderEffect route seams needed by the thumbnail storage boundary."""

    async def materialize_storage_profile_route(
        self,
        *,
        profile_key: str,
    ) -> StorageProfileRouteBinding: ...

    async def resolve_storage_profile_binding(
        self,
        *,
        binding: StorageProfileRouteBinding,
    ) -> ResolvedStorageProfileRoute: ...

    async def resolve_effect_route(
        self,
        *,
        effect_id: UUID,
    ) -> ResolvedStorageProfileRoute: ...


class AssetThumbnailSourceProfileLoader(Protocol):
    async def __call__(
        self,
        *,
        settings: Settings,
        profile_key: str,
    ) -> StorageProfileConfig: ...


type AssetThumbnailDefaultProfileKeyLoader = Callable[[Settings], Awaitable[str]]
type AssetThumbnailProviderBuilder = Callable[[StorageProfileConfig], ObjectStorageProvider]


class _StrictAssetThumbnailProviderStorage(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
        strict=True,
    )


class ResolvedAssetThumbnailSourceStorage(_StrictAssetThumbnailProviderStorage):
    """Existing-object read access; it is never evidence authorizing a new write."""

    provider: ObjectStorageProvider
    profile_key: str = Field(..., min_length=1, max_length=128)
    source_bucket: str | None = Field(default=None, max_length=255)


class AuthorizedAssetThumbnailOutputStorage(_StrictAssetThumbnailProviderStorage):
    """Active exact route authorized for registration before the first output write."""

    provider: ObjectStorageProvider
    route: StorageProfileRouteBinding
    target_bucket: str | None = Field(default=None, max_length=255)
    profile_key: str = Field(..., min_length=1, max_length=128)


class ResolvedAssetThumbnailEffectCleanupStorage(_StrictAssetThumbnailProviderStorage):
    """Historical exact route plus current credentials for one persisted Effect."""

    provider: ObjectStorageProvider
    route: StorageProfileRouteBinding
    target_bucket: str | None = Field(default=None, max_length=255)


class ExactAssetThumbnailProviderStorageResolver:
    """Keep existing reads, new-write authorization, and exact cleanup distinct."""

    __slots__ = (
        "_default_profile_key_loader",
        "_provider_builder",
        "_route_operations",
        "_settings",
        "_source_profile_loader",
    )

    def __init__(
        self,
        settings: Settings,
        *,
        route_operations: AssetThumbnailProviderRouteOperations,
        source_profile_loader: AssetThumbnailSourceProfileLoader | None = None,
        default_profile_key_loader: AssetThumbnailDefaultProfileKeyLoader | None = None,
        provider_builder: AssetThumbnailProviderBuilder = build_storage_provider,
    ) -> None:
        self._settings = settings
        self._route_operations = route_operations
        self._source_profile_loader = source_profile_loader or get_storage_profile_by_key
        self._default_profile_key_loader = default_profile_key_loader or _load_effective_default_profile_key
        self._provider_builder = provider_builder

    async def resolve_source_read(
        self,
        *,
        source: AssetThumbnailSource,
    ) -> ResolvedAssetThumbnailSourceStorage:
        try:
            profile_key = await self._resolve_profile_key(source)
            config = await self._source_profile_loader(
                settings=self._settings,
                profile_key=profile_key,
            )
            expected_provider = _source_provider(source)
            _validate_provider_match(
                expected=expected_provider,
                observed=config.provider,
                label="source credential profile",
            )
            source_bucket = _source_read_bucket(source=source, provider=expected_provider, config=config)
            provider = self._build_provider(
                config=config,
                expected_provider=expected_provider,
                bucket=source_bucket,
            )
            return ResolvedAssetThumbnailSourceStorage(
                provider=provider,
                profile_key=profile_key,
                source_bucket=source_bucket,
            )
        except Exception as exc:
            self._translate_resolution_error(
                exc,
                safe_message="The Asset storage configuration cannot read the thumbnail source",
            )
            raise

    async def authorize_output(
        self,
        *,
        source: AssetThumbnailSource,
    ) -> AuthorizedAssetThumbnailOutputStorage:
        try:
            profile_key = await self._resolve_profile_key(source)
            binding = await self._route_operations.materialize_storage_profile_route(
                profile_key=profile_key,
            )
            resolved = await self._route_operations.resolve_storage_profile_binding(binding=binding)
            _validate_exact_binding(binding=binding, resolved=resolved)
            if resolved.profile_key != profile_key:
                raise JobExecutionStateInvariantError("Thumbnail output route resolved a different Storage Profile key")
            expected_provider = _source_provider(source)
            _validate_provider_match(
                expected=expected_provider,
                observed=binding.route.provider,
                label="output route",
            )
            _validate_resolved_config(route=binding.route, config=resolved.config)
            target_bucket = _output_bucket(source=source, route=binding.route)
            provider = self._build_provider(
                config=resolved.config,
                expected_provider=expected_provider,
                bucket=target_bucket,
            )
            return AuthorizedAssetThumbnailOutputStorage(
                provider=provider,
                route=binding,
                target_bucket=target_bucket,
                profile_key=profile_key,
            )
        except Exception as exc:
            self._translate_resolution_error(
                exc,
                safe_message="The Asset storage configuration cannot authorize thumbnail outputs",
            )
            raise

    async def resolve_effect_cleanup(
        self,
        *,
        effect: ProviderEffectSnapshot,
        manifest: AssetThumbnailProviderEffectManifestV1,
    ) -> ResolvedAssetThumbnailEffectCleanupStorage:
        try:
            _validate_cleanup_effect(effect=effect, manifest=manifest)
            resolved = await self._route_operations.resolve_effect_route(effect_id=effect.id)
            _validate_effect_binding(effect=effect, resolved=resolved)
            _validate_resolved_config(route=resolved.binding.route, config=resolved.config)
            target_bucket = _cleanup_bucket(
                route=resolved.binding.route,
                recorded_target=manifest.target_bucket,
            )
            expected_provider = ObjectStorageProviderKind(resolved.binding.route.provider)
            provider = self._build_provider(
                config=resolved.config,
                expected_provider=expected_provider,
                bucket=target_bucket,
            )
            return ResolvedAssetThumbnailEffectCleanupStorage(
                provider=provider,
                route=resolved.binding,
                target_bucket=target_bucket,
            )
        except Exception as exc:
            self._translate_resolution_error(
                exc,
                safe_message="The recorded thumbnail storage configuration cannot clean its exact outputs",
            )
            raise

    async def _resolve_profile_key(self, source: AssetThumbnailSource) -> str:
        raw_key = source.storage_profile_key
        if raw_key is None:
            raw_key = await self._default_profile_key_loader(self._settings)
        if not isinstance(raw_key, str):
            raise ValueError("thumbnail storage profile key must be a string")
        normalized = raw_key.strip().lower()
        if not normalized:
            raise ValueError("thumbnail storage profile key cannot be blank")
        return normalized

    def _build_provider(
        self,
        *,
        config: StorageProfileConfig,
        expected_provider: ObjectStorageProviderKind,
        bucket: str | None,
    ) -> ObjectStorageProvider:
        provider = self._provider_builder(config)
        if expected_provider != ObjectStorageProviderKind.LOCAL:
            if bucket is None:
                raise ValueError("object thumbnail storage requires a target bucket")
            provider = provider.with_bucket(bucket)
        _validate_provider_match(
            expected=expected_provider,
            observed=provider.kind,
            label="constructed provider",
        )
        if expected_provider == ObjectStorageProviderKind.LOCAL:
            if provider.bucket is not None:
                raise ValueError("local thumbnail storage cannot resolve a bucket")
        elif provider.bucket != bucket:
            raise ValueError("constructed thumbnail provider differs from the authorized bucket")
        return provider

    @staticmethod
    def _translate_resolution_error(exc: Exception, *, safe_message: str) -> None:
        if isinstance(exc, JobExecutionStateInvariantError):
            return
        if isinstance(exc, (StorageProfileRouteUnavailableError, ValueError)):
            raise PermanentJobExecutionError(
                code=ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE,
                safe_message=safe_message,
            ) from exc
        if is_retryable_postgres_failure(exc):
            raise TransientJobExecutionError(
                code=ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
                safe_message="Asset thumbnail storage configuration is temporarily unavailable",
            ) from exc


async def _load_effective_default_profile_key(settings: Settings) -> str:
    effective = await get_effective_settings(settings)
    return effective.storage.default_profile_key


def _source_provider(source: AssetThumbnailSource) -> ObjectStorageProviderKind:
    return ObjectStorageProviderKind(source.storage_provider)


def _validate_provider_match(
    *,
    expected: ObjectStorageProviderKind,
    observed: str | ObjectStorageProviderKind,
    label: str,
) -> None:
    if ObjectStorageProviderKind(observed) != expected:
        raise ValueError(f"{label} differs from the Asset storage provider")


def _validate_exact_binding(
    *,
    binding: StorageProfileRouteBinding,
    resolved: ResolvedStorageProfileRoute,
) -> None:
    if resolved.binding != binding:
        raise JobExecutionStateInvariantError(
            "Thumbnail output authorization did not resolve the exact materialized route"
        )


def _validate_resolved_config(*, route: StorageProfileRoute, config: StorageProfileConfig) -> None:
    if build_storage_profile_route_from_config(config) != route:
        raise JobExecutionStateInvariantError("Thumbnail storage credentials do not preserve the exact immutable route")


def _source_read_bucket(
    *,
    source: AssetThumbnailSource,
    provider: ObjectStorageProviderKind,
    config: StorageProfileConfig,
) -> str | None:
    if provider == ObjectStorageProviderKind.LOCAL:
        if source.storage_bucket is not None:
            raise ValueError("local Asset storage cannot declare a bucket")
        return None
    selected = source.storage_bucket if source.storage_bucket is not None else config.bucket
    return _require_bucket(selected)


def _output_bucket(*, source: AssetThumbnailSource, route: StorageProfileRoute) -> str | None:
    provider = ObjectStorageProviderKind(route.provider)
    if provider == ObjectStorageProviderKind.LOCAL:
        if source.storage_bucket is not None:
            raise ValueError("local thumbnail output cannot declare a bucket")
        return None
    default_bucket = _require_bucket(route.bucket)
    selected = _require_bucket(source.storage_bucket) if source.storage_bucket is not None else default_bucket
    _require_allowed_bucket(selected=selected, route=route)
    return selected


def _cleanup_bucket(*, route: StorageProfileRoute, recorded_target: str | None) -> str | None:
    provider = ObjectStorageProviderKind(route.provider)
    if provider == ObjectStorageProviderKind.LOCAL:
        if recorded_target is not None:
            raise ValueError("local thumbnail Effect cannot record a target bucket")
        return None
    selected = _require_bucket(recorded_target)
    _require_allowed_bucket(selected=selected, route=route)
    return selected


def _require_bucket(value: str | None) -> str:
    if value is None or not value or value != value.strip():
        raise ValueError("thumbnail object storage bucket must be non-empty and canonical")
    if any(character.isspace() or category(character) in {"Cc", "Cf"} for character in value):
        raise ValueError("thumbnail object storage bucket cannot contain whitespace or control characters")
    return value


def _require_allowed_bucket(*, selected: str, route: StorageProfileRoute) -> None:
    allowed = {bucket for bucket in (route.bucket, route.public_bucket) if bucket is not None}
    if selected not in allowed:
        raise ValueError("thumbnail target bucket is outside the exact Storage Profile route")


def _validate_cleanup_effect(
    *,
    effect: ProviderEffectSnapshot,
    manifest: AssetThumbnailProviderEffectManifestV1,
) -> None:
    expected_contract = (
        ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
        ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    )
    if (effect.effect_type, effect.effect_key, effect.schema_version) != expected_contract:
        raise JobExecutionStateInvariantError(f"Provider effect {effect.id} is not the thumbnail v1 output contract")
    if effect.job_id != manifest.job_id:
        raise JobExecutionStateInvariantError(f"Provider effect {effect.id} belongs to another thumbnail Job")
    manifest_json = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
    if effect.manifest != manifest_json or effect.manifest_hash != hash_json(manifest_json):
        raise JobExecutionStateInvariantError(
            f"Provider effect {effect.id} differs from its canonical thumbnail manifest"
        )


def _validate_effect_binding(
    *,
    effect: ProviderEffectSnapshot,
    resolved: ResolvedStorageProfileRoute,
) -> None:
    binding = resolved.binding
    if binding.profile_id != effect.profile_id or binding.profile_revision_id != effect.profile_revision_id:
        raise JobExecutionStateInvariantError(
            f"Provider effect {effect.id} did not resolve its persisted Profile and Revision"
        )
