from __future__ import annotations

from datetime import UTC, datetime
from email.utils import format_datetime
from typing import Any

import pytest
from boto3.session import Session
from botocore.exceptions import (
    ConnectionClosedError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
)
from botocore.stub import Stubber
from pydantic import SecretStr

from src.platform.storage import s3 as s3_module
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.errors import (
    StorageAccessDeniedError,
    StorageObjectNotFoundError,
    StorageRateLimitedError,
    StorageTemporarilyUnavailableError,
)
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.s3 import S3StorageProvider

pytestmark = pytest.mark.unit


class _RaisingS3Client:
    def __init__(self, error: BaseException) -> None:
        self.error = error

    def get_object(self, **_kwargs: object) -> object:
        raise self.error

    def put_object(self, **_kwargs: object) -> object:
        raise self.error

    def delete_object(self, **_kwargs: object) -> object:
        raise self.error

    def close(self) -> None:
        return


class _FailingBody:
    def __init__(self, error: BaseException) -> None:
        self.error = error
        self.closed = False

    def read(self, _size: int) -> bytes:
        raise self.error

    def close(self) -> None:
        self.closed = True


class _ObjectResponseClient:
    def __init__(self, body: _FailingBody) -> None:
        self.body = body

    def get_object(self, **_kwargs: object) -> dict[str, object]:
        return {
            "Body": self.body,
            "ContentLength": 9,
            "ContentType": "image/png",
            "ETag": '"source-etag"',
        }

    def close(self) -> None:
        return


def _stubbed_provider(monkeypatch: pytest.MonkeyPatch) -> tuple[S3StorageProvider, Any, Stubber]:
    client = Session().client(
        "s3",
        endpoint_url="https://s3.example.test",
        region_name="us-east-1",
        aws_access_key_id="test-access-key",
        aws_secret_access_key="test-secret-key",
    )
    provider = S3StorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.AWS_S3,
            endpoint_url="https://s3.example.test",
            region="us-east-1",
            bucket="assets",
            access_key_id="test-access-key",
            secret_access_key=SecretStr("test-secret-key"),
        )
    )
    monkeypatch.setattr(provider, "_client", lambda: client)
    return provider, client, Stubber(client)


@pytest.mark.parametrize(
    ("service_error_code", "http_status_code"),
    [("NoSuchKey", 400), ("UnexpectedMissingObject", 404)],
)
@pytest.mark.asyncio
async def test_download_translates_missing_object_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    service_error_code: str,
    http_status_code: int,
) -> None:
    provider, _, stubber = _stubbed_provider(monkeypatch)
    stubber.add_client_error(
        "get_object",
        service_error_code=service_error_code,
        service_message="The specified key does not exist.",
        http_status_code=http_status_code,
        expected_params={"Bucket": "assets", "Key": "sources/missing.png"},
    )

    with stubber, pytest.raises(StorageObjectNotFoundError) as exc_info:
        await provider.download_object_to_path(
            object_key="sources/missing.png",
            out_path=tmp_path / "missing.png",
        )

    assert exc_info.value.provider == ObjectStorageProviderKind.AWS_S3.value
    assert exc_info.value.object_key == "sources/missing.png"


@pytest.mark.parametrize(
    ("service_error_code", "http_status_code"),
    [("SlowDown", 400), ("Throttling", 400), ("UnexpectedRateLimit", 429)],
)
@pytest.mark.asyncio
async def test_upload_translates_rate_limit_and_preserves_retry_after(
    monkeypatch: pytest.MonkeyPatch,
    service_error_code: str,
    http_status_code: int,
) -> None:
    provider, _, stubber = _stubbed_provider(monkeypatch)
    stubber.add_client_error(
        "put_object",
        service_error_code=service_error_code,
        service_message="Reduce your request rate.",
        http_status_code=http_status_code,
        expected_params={
            "Bucket": "assets",
            "Key": "thumbnails/preview.jpg",
            "Body": b"thumbnail",
            "ContentType": "image/jpeg",
        },
        response_meta={"HTTPHeaders": {"retry-after": "17"}},
    )

    with stubber, pytest.raises(StorageRateLimitedError) as exc_info:
        await provider.put_object_bytes(
            object_key="thumbnails/preview.jpg",
            data=b"thumbnail",
            content_type="image/jpeg",
        )

    assert exc_info.value.provider == ObjectStorageProviderKind.AWS_S3.value
    assert exc_info.value.object_key == "thumbnails/preview.jpg"
    assert exc_info.value.operation == "put_object_bytes"
    assert exc_info.value.retry_after_seconds == 17


@pytest.mark.asyncio
async def test_upload_parses_retry_after_http_date(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider, _, stubber = _stubbed_provider(monkeypatch)
    observed_at = datetime(2026, 7, 17, 6, 30, tzinfo=UTC)
    retry_at = datetime(2026, 7, 17, 6, 30, 37, tzinfo=UTC)
    monkeypatch.setattr(s3_module, "_utc_now", lambda: observed_at)
    stubber.add_client_error(
        "put_object",
        service_error_code="SlowDown",
        service_message="Reduce your request rate.",
        http_status_code=400,
        expected_params={
            "Bucket": "assets",
            "Key": "thumbnails/preview.jpg",
            "Body": b"thumbnail",
        },
        response_meta={"HTTPHeaders": {"Retry-After": format_datetime(retry_at, usegmt=True)}},
    )

    with stubber, pytest.raises(StorageRateLimitedError) as exc_info:
        await provider.put_object_bytes(
            object_key="thumbnails/preview.jpg",
            data=b"thumbnail",
            content_type=None,
        )

    assert exc_info.value.retry_after_seconds == 37


@pytest.mark.parametrize(
    ("service_error_code", "http_status_code"),
    [("InternalError", 503), ("RequestTimeout", 400), ("RequestTimeoutException", 400)],
)
@pytest.mark.asyncio
async def test_delete_translates_provider_temporary_failure(
    monkeypatch: pytest.MonkeyPatch,
    service_error_code: str,
    http_status_code: int,
) -> None:
    provider, _, stubber = _stubbed_provider(monkeypatch)
    stubber.add_client_error(
        "delete_object",
        service_error_code=service_error_code,
        service_message="We encountered an internal error.",
        http_status_code=http_status_code,
        expected_params={"Bucket": "assets", "Key": "thumbnails/preview.jpg"},
    )

    with stubber, pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.delete_object(object_key="thumbnails/preview.jpg")

    assert exc_info.value.provider == ObjectStorageProviderKind.AWS_S3.value
    assert exc_info.value.object_key == "thumbnails/preview.jpg"
    assert exc_info.value.operation == "delete_object"


@pytest.mark.parametrize("error_type", [ConnectTimeoutError, EndpointConnectionError])
@pytest.mark.asyncio
async def test_download_translates_connection_establishment_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    error_type: type[ConnectTimeoutError] | type[EndpointConnectionError],
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    provider_error = error_type(endpoint_url="https://s3.example.test")
    monkeypatch.setattr(provider, "_client", lambda: _RaisingS3Client(provider_error))

    with pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.download_object_to_path(
            object_key="sources/image.png",
            out_path=tmp_path / "image.png",
        )

    assert exc_info.value.operation == "download_object_to_path"
    assert exc_info.value.__cause__ is provider_error


@pytest.mark.asyncio
async def test_upload_translates_read_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    provider_error = ReadTimeoutError(endpoint_url="https://s3.example.test")
    monkeypatch.setattr(provider, "_client", lambda: _RaisingS3Client(provider_error))

    with pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.put_object_bytes(
            object_key="thumbnails/preview.jpg",
            data=b"thumbnail",
            content_type="image/jpeg",
        )

    assert exc_info.value.operation == "put_object_bytes"
    assert exc_info.value.__cause__ is provider_error


@pytest.mark.asyncio
async def test_upload_translates_connect_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    provider_error = ConnectTimeoutError(endpoint_url="https://s3.example.test")
    monkeypatch.setattr(provider, "_client", lambda: _RaisingS3Client(provider_error))

    with pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.put_object_bytes(
            object_key="thumbnails/preview.jpg",
            data=b"thumbnail",
            content_type="image/jpeg",
        )

    assert exc_info.value.operation == "put_object_bytes"
    assert exc_info.value.__cause__ is provider_error


@pytest.mark.asyncio
async def test_download_translates_stream_read_timeout(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    provider_error = ReadTimeoutError(endpoint_url="https://s3.example.test")
    body = _FailingBody(provider_error)
    monkeypatch.setattr(provider, "_client", lambda: _ObjectResponseClient(body))

    with pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.download_object_to_path(
            object_key="sources/image.png",
            out_path=tmp_path / "image.png",
        )

    assert exc_info.value.operation == "download_object_to_path"
    assert exc_info.value.__cause__ is provider_error
    assert body.closed is True


@pytest.mark.asyncio
async def test_delete_translates_connection_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    provider_error = ConnectionClosedError(endpoint_url="https://s3.example.test")
    monkeypatch.setattr(provider, "_client", lambda: _RaisingS3Client(provider_error))

    with pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.delete_object(object_key="thumbnails/preview.jpg")

    assert exc_info.value.operation == "delete_object"
    assert exc_info.value.__cause__ is provider_error


@pytest.mark.asyncio
async def test_delete_translates_read_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    provider_error = ReadTimeoutError(endpoint_url="https://s3.example.test")
    monkeypatch.setattr(provider, "_client", lambda: _RaisingS3Client(provider_error))

    with pytest.raises(StorageTemporarilyUnavailableError) as exc_info:
        await provider.delete_object(object_key="thumbnails/preview.jpg")

    assert exc_info.value.operation == "delete_object"
    assert exc_info.value.__cause__ is provider_error


@pytest.mark.parametrize(
    ("service_error_code", "http_status_code"),
    [("AccessDenied", 400), ("InvalidAccessKey", 400), ("UnexpectedAuthenticationError", 401), ("Unknown", 403)],
)
@pytest.mark.asyncio
async def test_upload_translates_access_denied(
    monkeypatch: pytest.MonkeyPatch,
    service_error_code: str,
    http_status_code: int,
) -> None:
    provider, _, stubber = _stubbed_provider(monkeypatch)
    stubber.add_client_error(
        "put_object",
        service_error_code=service_error_code,
        service_message="Access Denied",
        http_status_code=http_status_code,
        expected_params={
            "Bucket": "assets",
            "Key": "thumbnails/preview.jpg",
            "Body": b"thumbnail",
            "ContentType": "image/jpeg",
        },
    )

    with stubber, pytest.raises(StorageAccessDeniedError) as exc_info:
        await provider.put_object_bytes(
            object_key="thumbnails/preview.jpg",
            data=b"thumbnail",
            content_type="image/jpeg",
        )

    assert exc_info.value.provider == ObjectStorageProviderKind.AWS_S3.value
    assert exc_info.value.object_key == "thumbnails/preview.jpg"
    assert exc_info.value.operation == "put_object_bytes"


@pytest.mark.asyncio
async def test_unknown_programming_error_is_not_translated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider, _, _ = _stubbed_provider(monkeypatch)
    programming_error = ValueError("invalid SDK invocation")
    monkeypatch.setattr(provider, "_client", lambda: _RaisingS3Client(programming_error))

    with pytest.raises(ValueError) as exc_info:
        await provider.put_object_bytes(
            object_key="thumbnails/preview.jpg",
            data=b"thumbnail",
            content_type="image/jpeg",
        )

    assert exc_info.value is programming_error
