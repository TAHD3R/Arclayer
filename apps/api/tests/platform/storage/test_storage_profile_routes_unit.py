from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import SecretStr, ValidationError

from src.config import Settings
from src.models.storage.storage_profile import StorageProfileRouteRevision
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_route_service import (
    StorageProfileRouteInvariantError,
    StorageProfileRouteService,
)
from src.platform.storage.profile_routes import (
    StorageProfileRoute,
    build_storage_profile_config_from_route,
    build_storage_profile_route_from_config,
    storage_profile_route_hash,
    storage_profile_route_json,
)
from src.platform.storage.profile_schema import StorageProfileConfig


def test_object_route_canonicalization_produces_one_explicit_hash_identity() -> None:
    first = StorageProfileRoute(
        provider=ObjectStorageProviderKind.AWS_S3,
        endpoint_url=" HTTPS://Storage.Example.COM:443/ ",
        region=" US-EAST-1 ",
        bucket=" assets-private ",
    )
    replay = StorageProfileRoute(
        provider=ObjectStorageProviderKind.AWS_S3,
        endpoint_url="https://storage.example.com",
        region="us-east-1",
        bucket="assets-private",
    )

    assert first == replay
    assert storage_profile_route_hash(first) == storage_profile_route_hash(replay)
    assert storage_profile_route_json(first) == {
        "schema_version": 1,
        "provider": "aws_s3",
        "endpoint_url": "https://storage.example.com",
        "region": "us-east-1",
        "bucket": "assets-private",
        "public_bucket": None,
        "force_path_style": False,
        "local_root_dir": None,
    }


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://user@storage.example.com",
        "https://user:password@storage.example.com",
        "https://storage.example.com?",
        "https://storage.example.com?credential=value",
        "https://storage.example.com#",
        "https://storage.example.com#secret",
        "https://storage.example.com/provider-prefix",
        "https://storage.exa mple.com",
        "https://storage.example.com\\bucket",
        "https://storage.exa\nmple.com",
        "https://storage.example.com:99999",
        "https://invalid_host.example.com",
        "https://-invalid.example.com",
        "https://invalid-.example.com",
        "https://127.0.0.01",
        "https://2130706433",
        "https://0x7f000001",
        "ftp://storage.example.com",
    ],
)
def test_object_route_rejects_ambiguous_or_sensitive_endpoint(endpoint: str) -> None:
    with pytest.raises(ValidationError):
        StorageProfileRoute(
            provider=ObjectStorageProviderKind.AWS_S3,
            endpoint_url=endpoint,
            bucket="assets",
        )


@pytest.mark.parametrize(
    "payload",
    [
        {
            "provider": ObjectStorageProviderKind.LOCAL,
            "local_root_dir": "/srv/uploads",
            "bucket": "must-not-exist",
        },
        {
            "provider": ObjectStorageProviderKind.AWS_S3,
            "bucket": "assets",
            "local_root_dir": "/srv/uploads",
        },
        {
            "provider": ObjectStorageProviderKind.AWS_S3,
            "endpoint_url": "https://s3.example.com",
        },
        {
            "provider": ObjectStorageProviderKind.MINIO,
            "bucket": "assets",
        },
    ],
)
def test_route_rejects_cross_variant_or_incomplete_locators(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        StorageProfileRoute.model_validate(payload)


def test_local_route_uses_canonical_absolute_root_only(tmp_path: Path) -> None:
    route = build_storage_profile_route_from_config(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "uploads" / ".." / "objects",
            local_tmp_dir=tmp_path / ".tmp",
            access_key_id="must-not-enter-route",
        )
    )

    assert route == StorageProfileRoute(
        provider=ObjectStorageProviderKind.LOCAL,
        local_root_dir=str((tmp_path / "objects").resolve()),
    )
    serialized = storage_profile_route_json(route)
    assert "access_key_id" not in serialized
    assert "secret_access_key" not in serialized
    assert "public_base_url" not in serialized
    assert "local_tmp_dir" not in serialized

    with pytest.raises(ValidationError, match="control characters"):
        StorageProfileRoute(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir="/srv/uploads\x00escape",
        )


def test_resolved_route_overlays_locator_onto_one_validated_credential_snapshot() -> None:
    credentials = StorageProfileConfig(
        provider=ObjectStorageProviderKind.AWS_S3,
        endpoint_url="https://current.example.com",
        region="us-west-2",
        bucket="current-bucket",
        public_bucket="current-public",
        public_base_url="https://cdn.example.com",
        public_delivery_mode="direct",
        force_path_style=False,
        access_key_id="current-access-key",
        secret_access_key=SecretStr("current-secret"),
        presign_expires_seconds=1800,
    )
    historical_route = StorageProfileRoute(
        provider=ObjectStorageProviderKind.AWS_S3,
        endpoint_url="https://historical.example.com",
        region="us-east-1",
        bucket="historical-bucket",
        public_bucket="historical-public",
        force_path_style=True,
    )

    resolved = build_storage_profile_config_from_route(credentials, historical_route)

    assert resolved.endpoint_url == "https://historical.example.com"
    assert resolved.region == "us-east-1"
    assert resolved.bucket == "historical-bucket"
    assert resolved.public_bucket == "historical-public"
    assert resolved.force_path_style is True
    assert resolved.access_key_id == "current-access-key"
    assert resolved.secret_access_key == SecretStr("current-secret")
    assert resolved.public_base_url == "https://cdn.example.com"
    assert resolved.public_delivery_mode == "direct"
    assert resolved.presign_expires_seconds == 1800


def test_non_aws_object_route_requires_endpoint() -> None:
    route = StorageProfileRoute(
        provider=ObjectStorageProviderKind.CLOUDFLARE_R2,
        endpoint_url="https://account.r2.cloudflarestorage.com",
        bucket="assets",
    )

    assert route.endpoint_url == "https://account.r2.cloudflarestorage.com"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schema_version", 1.0),
        ("schema_version", True),
        ("force_path_style", 0),
        ("force_path_style", "false"),
    ],
)
def test_route_rejects_coercible_but_noncanonical_json_types(field: str, value: object) -> None:
    payload: dict[str, object] = {
        "schema_version": 1,
        "provider": "aws_s3",
        "endpoint_url": None,
        "region": None,
        "bucket": "assets",
        "public_bucket": None,
        "force_path_style": False,
        "local_root_dir": None,
    }
    payload[field] = value

    with pytest.raises(ValidationError):
        StorageProfileRoute.model_validate(payload)


def test_persisted_revision_rejects_noncanonical_json_even_with_valid_hash() -> None:
    route = StorageProfileRoute(provider=ObjectStorageProviderKind.AWS_S3, bucket="assets")
    raw = storage_profile_route_json(route)
    raw["force_path_style"] = 0
    revision = StorageProfileRouteRevision(
        id=uuid4(),
        revision_number=1,
        route=raw,
        route_hash=storage_profile_route_hash(route),
    )

    with pytest.raises(StorageProfileRouteInvariantError, match="invalid"):
        StorageProfileRouteService(Settings()).validate_persisted_revision(revision)
