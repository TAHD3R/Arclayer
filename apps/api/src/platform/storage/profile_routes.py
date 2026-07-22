from __future__ import annotations

import ipaddress
import re
from hashlib import sha256
from pathlib import Path
from typing import Literal, cast
from urllib.parse import SplitResult, urlsplit, urlunsplit
from uuid import UUID

from orjson import OPT_SORT_KEYS, dumps
from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.storage.storage_profile import StorageProfile
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import build_storage_profile_config_from_record


class StorageProfileRoute(BaseSchema):
    """Canonical non-secret locator for one immutable storage route revision."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    provider: ObjectStorageProviderKind
    endpoint_url: str | None = None
    region: str | None = None
    bucket: str | None = None
    public_bucket: str | None = None
    force_path_style: bool = False
    local_root_dir: str | None = None

    @field_validator("schema_version", mode="before")
    @classmethod
    def require_integer_schema_version(cls, value: object) -> object:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("schemaVersion must be integer 1")
        return value

    @field_validator("force_path_style", mode="before")
    @classmethod
    def require_boolean_path_style(cls, value: object) -> object:
        if not isinstance(value, bool):
            raise ValueError("forcePathStyle must be a boolean")
        return value

    @field_validator("endpoint_url", mode="before")
    @classmethod
    def normalize_url(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("storage route URLs must be strings")
        normalized = value.strip()
        if not normalized:
            return None
        return normalize_storage_route_endpoint(normalized)

    @field_validator("region", "bucket", "public_bucket", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("storage route locator values must be strings")
        normalized = value.strip()
        if normalized and any(
            character.isspace() or ord(character) < 32 or ord(character) == 127 for character in normalized
        ):
            raise ValueError("storage route locator values cannot contain whitespace or control characters")
        return normalized or None

    @field_validator("region")
    @classmethod
    def normalize_region(cls, value: str | None) -> str | None:
        return value.lower() if value is not None else None

    @field_validator("local_root_dir", mode="before")
    @classmethod
    def normalize_local_root(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, Path):
            value = str(value)
        if not isinstance(value, str):
            raise ValueError("localRootDir must be a path string")
        normalized = value.strip()
        if not normalized:
            return None
        if any(ord(character) < 32 or ord(character) == 127 for character in normalized):
            raise ValueError("localRootDir cannot contain control characters")
        path = Path(normalized).expanduser()
        if not path.is_absolute():
            raise ValueError("localRootDir must be absolute")
        return str(path.resolve(strict=False))

    @model_validator(mode="after")
    def validate_provider_variant(self) -> StorageProfileRoute:
        if self.provider == ObjectStorageProviderKind.LOCAL:
            if self.local_root_dir is None:
                raise ValueError("local storage routes require localRootDir")
            if any(value is not None for value in (self.endpoint_url, self.region, self.bucket, self.public_bucket)):
                raise ValueError("local storage routes cannot contain object-storage locators")
            if self.force_path_style:
                raise ValueError("local storage routes cannot enable forcePathStyle")
            return self

        if self.local_root_dir is not None:
            raise ValueError("object-storage routes cannot contain localRootDir")
        if self.bucket is None:
            raise ValueError("object-storage routes require bucket")
        if self.provider != ObjectStorageProviderKind.AWS_S3 and self.endpoint_url is None:
            raise ValueError(f"{self.provider} storage routes require endpointUrl")
        return self


class StorageProfileRouteBinding(BaseSchema):
    """Persisted profile/revision identity returned before an effect registration."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    profile_id: UUID
    profile_revision_id: UUID
    route_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    route: StorageProfileRoute


def build_storage_profile_route(
    record: StorageProfile,
    *,
    settings: Settings,
) -> StorageProfileRoute:
    config = build_storage_profile_config_from_record(record, settings=settings)
    return build_storage_profile_route_from_config(config)


def build_storage_profile_route_from_config(config: StorageProfileConfig) -> StorageProfileRoute:
    if config.provider == ObjectStorageProviderKind.LOCAL:
        return StorageProfileRoute(
            provider=config.provider,
            local_root_dir=str(config.local_root_dir) if config.local_root_dir is not None else None,
        )
    return StorageProfileRoute(
        provider=config.provider,
        endpoint_url=config.endpoint_url,
        region=config.region,
        bucket=config.bucket,
        public_bucket=config.public_bucket,
        force_path_style=config.force_path_style,
    )


def storage_profile_route_json(route: StorageProfileRoute) -> JsonObject:
    return cast(JsonObject, route.model_dump(mode="json"))


def storage_profile_route_hash(route: StorageProfileRoute) -> str:
    return sha256(dumps(storage_profile_route_json(route), option=OPT_SORT_KEYS)).hexdigest()


def build_storage_profile_config_from_route(
    credential_source: StorageProfileConfig,
    route: StorageProfileRoute,
) -> StorageProfileConfig:
    return credential_source.model_copy(
        update={
            "provider": route.provider,
            "endpoint_url": route.endpoint_url,
            "region": route.region,
            "bucket": route.bucket,
            "public_bucket": route.public_bucket,
            "force_path_style": route.force_path_style,
            "local_root_dir": Path(route.local_root_dir) if route.local_root_dir is not None else None,
        }
    )


def storage_profile_route_transition_is_destructive(
    *,
    current: StorageProfileRoute,
    updated: StorageProfileRoute,
) -> bool:
    if current.provider != updated.provider:
        return True
    locator_fields = (
        "endpoint_url",
        "region",
        "bucket",
        "public_bucket",
        "local_root_dir",
    )
    return any(getattr(current, field) is not None and getattr(updated, field) is None for field in locator_fields)


def normalize_storage_route_endpoint(value: str) -> str:
    if "?" in value or "#" in value:
        raise ValueError("storage route URL cannot contain a query or fragment delimiter")
    if "\\" in value or any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("storage route URL cannot contain whitespace, control characters, or backslashes")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("storage route URL is invalid") from exc
    if parsed.scheme.lower() not in {"http", "https"} or parsed.hostname is None:
        raise ValueError("storage route URL must use http or https and include a host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("storage route URL cannot contain userinfo")
    if parsed.path not in {"", "/"}:
        raise ValueError("storage route endpoint URL cannot contain a path")
    host = _canonical_url_host(parsed)
    default_port = (parsed.scheme.lower() == "http" and port == 80) or (
        parsed.scheme.lower() == "https" and port == 443
    )
    netloc = host if port is None or default_port else f"{host}:{port}"
    return urlunsplit((parsed.scheme.lower(), netloc, "", "", ""))


def _canonical_url_host(parsed: SplitResult) -> str:
    hostname = cast(str, parsed.hostname)
    if hostname.endswith(".") or "%" in hostname:
        raise ValueError("storage route URL host is ambiguous")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        if re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+(?:\.[0-9]+)*)", hostname, flags=re.IGNORECASE):
            raise ValueError("storage route URL host uses an ambiguous numeric form")
        ascii_hostname = hostname.encode("idna").decode("ascii").lower()
        labels = ascii_hostname.split(".")
        if len(ascii_hostname) > 253 or any(
            not label
            or len(label) > 63
            or not label[0].isalnum()
            or not label[-1].isalnum()
            or any(not (character.isalnum() or character == "-") for character in label)
            for label in labels
        ):
            raise ValueError("storage route URL host is invalid")
        return ascii_hostname
    return f"[{address.compressed}]" if address.version == 6 else address.compressed
