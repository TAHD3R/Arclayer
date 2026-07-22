from __future__ import annotations

import asyncio
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, Self, cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.models.assets.upload import UploadStatus
from src.modules.assets.admin.uploads.completion_schema import (
    _UploadCompletionClaim,
    _UploadPartSnapshot,
    _UploadSessionSnapshot,
)
from src.modules.assets.admin.uploads.completion_storage import (
    UploadCompletionPreEffectFailure,
    UploadCompletionStorageFinalizer,
)
from src.modules.assets.admin.uploads.repository import UploadCompletionInvariantError, UploadsRepository
from src.modules.assets.scope import AssetScope
from src.platform.storage.errors import StorageObjectNotFoundError
from src.platform.storage.providers.base import ObjectHead
from src.platform.storage.s3 import S3StorageProvider

pytestmark = pytest.mark.unit


class _FakeRemoteProvider:
    def __init__(
        self,
        *,
        head_results: list[ObjectHead | BaseException],
        completion_error: BaseException | None = None,
    ) -> None:
        self._head_results = list(head_results)
        self._completion_error = completion_error
        self.bucket: str | None = None
        self.events: list[str] = []
        self.completion_calls: list[dict[str, object]] = []

    def with_bucket(self, bucket: str) -> Self:
        self.bucket = bucket
        return self

    async def head_object(self, *, object_key: str) -> ObjectHead:
        self.events.append(f"head:{object_key}")
        result = self._head_results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result

    async def complete_multipart_upload(
        self,
        *,
        object_key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> None:
        self.events.append(f"complete:{object_key}")
        self.completion_calls.append({
            "object_key": object_key,
            "upload_id": upload_id,
            "parts": parts,
        })
        if self._completion_error is not None:
            raise self._completion_error


class _BlockingThreadRemoteProvider(_FakeRemoteProvider):
    def __init__(self, *, head: ObjectHead) -> None:
        super().__init__(head_results=[head])
        self.head_started = asyncio.Event()
        self.release_head = threading.Event()
        self.head_finished = threading.Event()

    async def head_object(self, *, object_key: str) -> ObjectHead:
        self.events.append(f"head:{object_key}")
        self.head_started.set()
        await asyncio.to_thread(self.release_head.wait)
        self.head_finished.set()
        result = self._head_results.pop(0)
        assert isinstance(result, ObjectHead)
        return result


class _FakeRepository:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.finalized_calls: list[dict[str, object]] = []

    @asynccontextmanager
    async def connection(
        self,
        *,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> AsyncIterator[BaseDBAsyncClient | None]:
        _ = scope
        yield conn

    async def heartbeat_completion(self, **kwargs: object) -> None:
        self.events.append("heartbeat")
        assert kwargs["conn"] is not None

    async def mark_storage_finalized(self, **kwargs: object) -> None:
        self.events.append("storage_finalized")
        self.finalized_calls.append(dict(kwargs))


class _FailingHeartbeatRepository(_FakeRepository):
    def __init__(self) -> None:
        super().__init__()
        self.heartbeat_started = asyncio.Event()

    async def heartbeat_completion(self, **kwargs: object) -> None:
        _ = kwargs
        self.events.append("heartbeat")
        self.heartbeat_started.set()
        raise RuntimeError("heartbeat database unavailable")


class _UnitStorageFinalizer(UploadCompletionStorageFinalizer):
    @asynccontextmanager
    async def tx(
        self,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn or cast(BaseDBAsyncClient, object())


def _remote_claim() -> _UploadCompletionClaim:
    project_id = uuid4()
    upload_id = uuid4()
    session = _UploadSessionSnapshot(
        id=upload_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        purpose="library",
        filename="asset.png",
        mime="image/png",
        size_bytes=3,
        total_parts=1,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        reserved_asset_id=uuid4(),
        storage_provider="aws_s3",
        storage_profile_key="s3-main",
        visibility="private",
        indexable=False,
        resolved_slug="asset",
        resolved_ext="png",
        object_key=f"projects/{project_id}/assets/{uuid4()}.png",
        multipart_upload_id="multipart-123",
        s3_bucket="asset-bucket",
    )
    now = datetime.now(UTC)
    return _UploadCompletionClaim(
        scope=session.scope(),
        session=session,
        parts=(
            _UploadPartSnapshot(
                part_number=1,
                object_key=f"projects/{project_id}/uploads/{upload_id}/part-000001",
                size_bytes=3,
                etag="part-etag",
            ),
        ),
        claim_token=uuid4(),
        generation=1,
        status=UploadStatus.COMPLETING,
        heartbeat_at=now,
        lease_until=now + timedelta(minutes=5),
    )


def _finalizer(
    *,
    provider: _FakeRemoteProvider,
    repository: _FakeRepository,
) -> UploadCompletionStorageFinalizer:
    async def build_remote_provider(
        *,
        profile_key: str,
        scope: AssetScope,
        action: str,
        upload_id: UUID | None = None,
        part_number: int | None = None,
    ) -> S3StorageProvider:
        _ = profile_key, scope, action, upload_id, part_number
        return cast(S3StorageProvider, provider)

    return _UnitStorageFinalizer(
        Settings(),
        repository=cast(UploadsRepository, repository),
        remote_provider_builder=build_remote_provider,
    )


@pytest.mark.asyncio
async def test_matching_remote_head_is_recorded_without_repeating_multipart_completion() -> None:
    claim = _remote_claim()
    provider = _FakeRemoteProvider(
        head_results=[ObjectHead(size_bytes=3, content_type="image/png", etag="object-etag")]
    )
    repository = _FakeRepository()

    outcome = await _finalizer(provider=provider, repository=repository).finalize(claim=claim)

    assert outcome.asset_id == claim.session.reserved_asset_id
    assert outcome.object_key == claim.session.object_key
    assert outcome.storage_bucket == "asset-bucket"
    assert provider.bucket == "asset-bucket"
    assert provider.events == [f"head:{claim.session.object_key}"]
    assert provider.completion_calls == []
    assert repository.events == ["heartbeat", "storage_finalized"]
    assert len(repository.finalized_calls) == 1


@pytest.mark.asyncio
async def test_typed_remote_not_found_completes_multipart_before_recording_final_object() -> None:
    claim = _remote_claim()
    provider = _FakeRemoteProvider(
        head_results=[
            StorageObjectNotFoundError(provider="aws_s3", object_key=claim.session.object_key),
            ObjectHead(size_bytes=3, content_type="image/png", etag="object-etag"),
        ]
    )
    repository = _FakeRepository()

    outcome = await _finalizer(provider=provider, repository=repository).finalize(claim=claim)

    assert outcome.asset_id == claim.session.reserved_asset_id
    assert provider.events == [
        f"head:{claim.session.object_key}",
        f"complete:{claim.session.object_key}",
        f"head:{claim.session.object_key}",
    ]
    assert provider.completion_calls == [
        {
            "object_key": claim.session.object_key,
            "upload_id": "multipart-123",
            "parts": [{"ETag": '"part-etag"', "PartNumber": 1}],
        }
    ]
    assert repository.events == ["heartbeat", "storage_finalized"]


@pytest.mark.asyncio
async def test_ambiguous_multipart_completion_succeeds_when_final_head_proves_the_object() -> None:
    claim = _remote_claim()
    completion_error = RuntimeError("provider response was lost")
    provider = _FakeRemoteProvider(
        head_results=[
            StorageObjectNotFoundError(provider="aws_s3", object_key=claim.session.object_key),
            ObjectHead(size_bytes=3, content_type="image/png", etag="object-etag"),
        ],
        completion_error=completion_error,
    )
    repository = _FakeRepository()

    outcome = await _finalizer(provider=provider, repository=repository).finalize(claim=claim)

    assert outcome.object_key == claim.session.object_key
    assert provider.events == [
        f"head:{claim.session.object_key}",
        f"complete:{claim.session.object_key}",
        f"head:{claim.session.object_key}",
    ]
    assert len(provider.completion_calls) == 1
    assert repository.events == ["heartbeat", "storage_finalized"]


@pytest.mark.asyncio
async def test_untyped_initial_head_failure_never_starts_a_storage_write() -> None:
    claim = _remote_claim()
    head_error = RuntimeError("provider transport failed")
    provider = _FakeRemoteProvider(head_results=[head_error])
    repository = _FakeRepository()

    with pytest.raises(UploadCompletionPreEffectFailure) as exc_info:
        await _finalizer(provider=provider, repository=repository).finalize(claim=claim)

    assert exc_info.value.error is head_error
    assert provider.events == [f"head:{claim.session.object_key}"]
    assert provider.completion_calls == []
    assert repository.events == []
    assert repository.finalized_calls == []


@pytest.mark.asyncio
async def test_cancelling_remote_probe_waits_for_real_thread_before_propagating() -> None:
    claim = _remote_claim()
    provider = _BlockingThreadRemoteProvider(
        head=ObjectHead(size_bytes=3, content_type="image/png", etag="object-etag"),
    )
    repository = _FakeRepository()
    completion = asyncio.create_task(_finalizer(provider=provider, repository=repository).finalize(claim=claim))

    await asyncio.wait_for(provider.head_started.wait(), timeout=1)
    completion.cancel()
    await asyncio.sleep(0)
    propagated_before_thread_settled = completion.done()
    provider.release_head.set()
    with pytest.raises(asyncio.CancelledError):
        await completion

    assert propagated_before_thread_settled is False
    assert provider.head_finished.is_set()
    assert provider.events == [f"head:{claim.session.object_key}"]
    assert provider.completion_calls == []
    assert repository.events == []
    assert repository.finalized_calls == []


@pytest.mark.asyncio
async def test_heartbeat_failure_waits_for_real_thread_before_propagating() -> None:
    claim = _remote_claim()
    provider = _BlockingThreadRemoteProvider(
        head=ObjectHead(size_bytes=3, content_type="image/png", etag="object-etag"),
    )
    repository = _FailingHeartbeatRepository()
    finalizer = _finalizer(provider=provider, repository=repository)
    finalizer._heartbeat_interval = 0.01
    completion = asyncio.create_task(finalizer.finalize(claim=claim))

    await asyncio.wait_for(provider.head_started.wait(), timeout=1)
    await asyncio.wait_for(repository.heartbeat_started.wait(), timeout=1)
    propagated_before_thread_settled = completion.done()
    provider.release_head.set()
    with pytest.raises(UploadCompletionInvariantError, match="heartbeat failed"):
        await completion

    assert propagated_before_thread_settled is False
    assert provider.head_finished.is_set()
    assert repository.events == ["heartbeat"]
    assert repository.finalized_calls == []
