from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError

from src.config import StorageSettings
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.s3 import S3StorageProvider

pytestmark = pytest.mark.unit


def test_s3_client_deadlines_have_explicit_defaults() -> None:
    settings = StorageSettings()

    assert settings.s3_connect_timeout_seconds == 10.0
    assert settings.s3_read_timeout_seconds == 60.0


def test_s3_client_deadlines_accept_environment_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("STORAGE__S3_CONNECT_TIMEOUT_SECONDS", "8.5")
    monkeypatch.setenv("STORAGE__S3_READ_TIMEOUT_SECONDS", "55")

    settings = StorageSettings()

    assert settings.s3_connect_timeout_seconds == 8.5
    assert settings.s3_read_timeout_seconds == 55.0


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("s3_connect_timeout_seconds", 0),
        ("s3_connect_timeout_seconds", -1),
        ("s3_connect_timeout_seconds", float("inf")),
        ("s3_connect_timeout_seconds", float("nan")),
        ("s3_read_timeout_seconds", 0),
        ("s3_read_timeout_seconds", -1),
        ("s3_read_timeout_seconds", float("inf")),
        ("s3_read_timeout_seconds", float("nan")),
    ],
)
def test_s3_client_deadlines_require_positive_finite_values(
    field_name: str,
    invalid_value: float,
) -> None:
    with pytest.raises(ValidationError):
        StorageSettings.model_validate({field_name: invalid_value})


def test_s3_client_deadlines_accept_long_finite_operations() -> None:
    settings = StorageSettings(
        s3_connect_timeout_seconds=301,
        s3_read_timeout_seconds=900,
    )

    assert settings.s3_connect_timeout_seconds == 301.0
    assert settings.s3_read_timeout_seconds == 900.0


def test_s3_provider_applies_profile_deadlines_to_botocore_client() -> None:
    provider = S3StorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.AWS_S3,
            endpoint_url="https://s3.example.test",
            region="us-east-1",
            bucket="assets",
            access_key_id="test-access-key",
            secret_access_key=SecretStr("test-secret-key"),
            connect_timeout_seconds=4.5,
            read_timeout_seconds=35.0,
        )
    )

    client = provider._client()
    try:
        assert client.meta.config.connect_timeout == 4.5
        assert client.meta.config.read_timeout == 35.0
    finally:
        client.close()
