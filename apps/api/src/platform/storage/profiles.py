from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr

from src.config import Settings
from src.models.storage.storage_profile import StorageProfileRecord
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import PublicAssetDeliveryMode, StorageProfileConfig

ENV_DEFAULT_PROFILE_KEY = "env-default"


def _read_secret_ref(secret_ref: object, key: str) -> str | None:
    if not isinstance(secret_ref, dict):
        return None
    value = secret_ref.get(key)
    return str(value).strip() or None if isinstance(value, str) else None


def build_storage_profile_config_from_record(
    record: StorageProfileRecord,
    *,
    settings: Settings,
) -> StorageProfileConfig:
    raw = record.config if isinstance(record.config, dict) else {}
    secret_access_key = _read_secret_ref(record.secret_ref, "secret_access_key")

    return StorageProfileConfig(
        provider=ObjectStorageProviderKind(str(record.provider)),
        display_name=record.display_name,
        endpoint_url=str(raw.get("endpoint_url")).strip() if isinstance(raw.get("endpoint_url"), str) else None,
        region=str(raw.get("region")).strip() if isinstance(raw.get("region"), str) else None,
        bucket=str(raw.get("bucket")).strip() if isinstance(raw.get("bucket"), str) else None,
        public_bucket=str(raw.get("public_bucket")).strip() if isinstance(raw.get("public_bucket"), str) else None,
        public_base_url=str(raw.get("public_base_url")).strip()
        if isinstance(raw.get("public_base_url"), str)
        else None,
        public_delivery_mode=str(raw.get("public_delivery_mode") or PublicAssetDeliveryMode.AUTO),
        force_path_style=bool(raw.get("force_path_style")),
        access_key_id=str(raw.get("access_key_id")).strip() if isinstance(raw.get("access_key_id"), str) else None,
        secret_access_key=SecretStr(secret_access_key) if secret_access_key else None,
        secret_access_key_ref=f"record:{record.id}:secret_access_key" if secret_access_key else None,
        presign_expires_seconds=int(raw.get("presign_expires_seconds") or 900),
        local_root_dir=settings.storage.local_root_dir,
        local_tmp_dir=settings.storage.local_tmp_dir,
    )


def build_env_storage_profile_config(settings: Settings) -> StorageProfileConfig:
    provider_name = str(getattr(settings.storage, "provider", ObjectStorageProviderKind.LOCAL) or "local").strip()
    if provider_name == "s3":
        provider = ObjectStorageProviderKind.AWS_S3
    else:
        provider = ObjectStorageProviderKind.LOCAL

    secret = getattr(settings.storage, "s3_secret_access_key", None)
    secret_value = secret.get_secret_value() if secret is not None else None
    access_key = getattr(settings.storage, "s3_access_key_id", None)
    endpoint_url = getattr(settings.storage, "s3_endpoint_url", None)
    region = getattr(settings.storage, "s3_region", None)
    bucket = getattr(settings.storage, "s3_bucket", None)
    public_bucket = getattr(settings.storage, "s3_public_bucket", None)
    public_base_url = getattr(settings.storage, "public_base_url", None)
    public_delivery_mode = getattr(settings.storage, "public_delivery_mode", PublicAssetDeliveryMode.AUTO)
    force_path_style = bool(getattr(settings.storage, "s3_force_path_style", False))
    presign_expires_seconds = int(getattr(settings.storage, "s3_presign_expires_seconds", 900) or 900)

    return StorageProfileConfig(
        provider=provider,
        display_name="Environment Default",
        endpoint_url=str(endpoint_url).strip() if isinstance(endpoint_url, str) else None,
        region=str(region).strip() if isinstance(region, str) else None,
        bucket=str(bucket).strip() if isinstance(bucket, str) else None,
        public_bucket=str(public_bucket).strip() if isinstance(public_bucket, str) else None,
        public_base_url=str(public_base_url).strip() if isinstance(public_base_url, str) else None,
        public_delivery_mode=str(public_delivery_mode or PublicAssetDeliveryMode.AUTO),
        force_path_style=force_path_style,
        access_key_id=str(access_key).strip() if isinstance(access_key, str) else None,
        secret_access_key=SecretStr(secret_value) if isinstance(secret_value, str) and secret_value.strip() else None,
        presign_expires_seconds=presign_expires_seconds,
        local_root_dir=Path(settings.storage.local_root_dir),
        local_tmp_dir=Path(settings.storage.local_tmp_dir),
    )


async def get_storage_profile_by_key(*, settings: Settings, profile_key: str) -> StorageProfileConfig:
    record = await StorageProfileRecord.get_or_none(profile_key=profile_key)
    if record is not None:
        return build_storage_profile_config_from_record(record, settings=settings)
    if profile_key == ENV_DEFAULT_PROFILE_KEY:
        return build_env_storage_profile_config(settings)
    raise ValueError(f"unknown storage profile key: {profile_key}")


async def get_effective_storage_profile(settings: Settings) -> tuple[str, StorageProfileConfig]:
    from src.settings.runtime import get_effective_settings

    effective = await get_effective_settings(settings)
    profile_key = str(
        getattr(effective.storage, "default_profile_key", ENV_DEFAULT_PROFILE_KEY) or ENV_DEFAULT_PROFILE_KEY
    )
    return profile_key, await get_storage_profile_by_key(settings=effective, profile_key=profile_key)


def is_local_storage_provider(provider: str | ObjectStorageProviderKind) -> bool:
    return str(provider) == ObjectStorageProviderKind.LOCAL.value
