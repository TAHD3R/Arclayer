from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.modules.assets.admin.uploads.repository import (
    UploadCompletionInvariantError,
    UploadCompletionLease,
    UploadsRepository,
)
from src.modules.assets.scope import AssetScope

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)
LEASE_DURATION = timedelta(seconds=60)
CHECKSUM = "a" * 64


class _FakeUploadSession:
    def __init__(
        self,
        *,
        status: UploadStatus = UploadStatus.UPLOADING,
        completion_generation: int = 0,
        completion_claim_token: UUID | None = None,
        completion_heartbeat_at: datetime | None = None,
        completion_lease_until: datetime | None = None,
        storage_finalized_at: datetime | None = None,
        storage_checksum_sha256: str | None = None,
        finalized_storage_bucket: str | None = None,
        expires_at: datetime = NOW + timedelta(hours=1),
        storage_provider: str = "local",
    ) -> None:
        self.id = uuid4()
        self.status = status
        self.asset_id: UUID | None = None
        self.reserved_asset_id = uuid4()
        self.object_key = f"assets/{self.reserved_asset_id}/asset.bin"
        self.storage_provider = storage_provider
        self.expires_at = expires_at
        self.completion_generation = completion_generation
        self.completion_claim_token = completion_claim_token
        self.completion_heartbeat_at = completion_heartbeat_at
        self.completion_lease_until = completion_lease_until
        self.storage_finalized_at = storage_finalized_at
        self.storage_checksum_sha256 = storage_checksum_sha256
        self.finalized_storage_bucket = finalized_storage_bucket
        self.updated_at = NOW - timedelta(hours=1)
        self.save_calls: list[tuple[tuple[str, ...], BaseDBAsyncClient]] = []

    async def save(
        self,
        *,
        update_fields: list[str],
        using_db: BaseDBAsyncClient,
    ) -> None:
        self.save_calls.append((tuple(update_fields), using_db))


class _UnitUploadsRepository(UploadsRepository):
    def __init__(self, session: _FakeUploadSession | None, *database_times: datetime) -> None:
        self.session = session
        self.database_times = iter(database_times or (NOW,))

    async def get_session_for_update(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord | None:
        _ = (scope, conn)
        if self.session is None or self.session.id != upload_id:
            return None
        return cast(UploadSessionRecord, self.session)

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        _ = conn
        return next(self.database_times)

    async def _apply_fenced_transition(
        self,
        *,
        session: UploadSessionRecord,
        scope: AssetScope,
        operation: str,
        expected_status: UploadStatus,
        expected_claim_token: UUID | None,
        expected_generation: int,
        update_fields: dict[str, object],
        database_time: datetime,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        _ = (scope, operation)
        assert session is self.session
        assert session.status == expected_status
        assert session.completion_claim_token == expected_claim_token
        assert session.completion_generation == expected_generation
        for field, value in update_fields.items():
            setattr(session, field, value)
        session.updated_at = database_time
        await cast(_FakeUploadSession, session).save(
            update_fields=[*update_fields, "updated_at"],
            using_db=conn,
        )
        return session


def _scope() -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_WORKSPACE, id=uuid4())


def _conn() -> BaseDBAsyncClient:
    return cast(BaseDBAsyncClient, SimpleNamespace())


def _finalized_session(
    *,
    claim_token: UUID | None = None,
    generation: int = 1,
    lease_until: datetime = NOW + LEASE_DURATION,
) -> _FakeUploadSession:
    return _FakeUploadSession(
        status=UploadStatus.STORAGE_FINALIZED,
        completion_generation=generation,
        completion_claim_token=claim_token or uuid4(),
        completion_heartbeat_at=NOW,
        completion_lease_until=lease_until,
        storage_finalized_at=NOW,
        storage_checksum_sha256=CHECKSUM,
    )


def test_upload_completion_model_exposes_explicit_state_and_fence_fields() -> None:
    fields = UploadSessionRecord._meta.fields_map

    assert UploadStatus.STORAGE_FINALIZED.value == "storage_finalized"
    assert fields["completion_claim_token"].unique is True
    assert fields["completion_generation"].default == 0
    assert ("completion_lease_until",) in UploadSessionRecord._meta.indexes
    assert cast(Any, fields["storage_checksum_sha256"]).max_length == 64
    assert cast(Any, fields["finalized_storage_bucket"]).max_length == 255


def test_upload_completion_lease_is_frozen_and_forbids_extra_fields() -> None:
    values = {
        "claim_token": uuid4(),
        "generation": 1,
        "status": UploadStatus.COMPLETING,
        "heartbeat_at": NOW,
        "lease_until": NOW + LEASE_DURATION,
    }
    lease = UploadCompletionLease.model_validate(values)

    with pytest.raises(ValidationError, match="frozen"):
        lease.generation = 2
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        UploadCompletionLease.model_validate({**values, "unexpected": True})
    with pytest.raises(ValidationError, match="greater than or equal to 1"):
        UploadCompletionLease.model_validate({**values, "generation": 0})
    with pytest.raises(ValidationError, match="timezone-aware"):
        UploadCompletionLease.model_validate({
            **values,
            "heartbeat_at": NOW.replace(tzinfo=None),
        })
    with pytest.raises(ValidationError, match="must end after"):
        UploadCompletionLease.model_validate({**values, "lease_until": NOW})


@pytest.mark.asyncio
async def test_fresh_claim_binds_token_and_increments_expected_generation() -> None:
    session = _FakeUploadSession(completion_generation=4)
    repository = _UnitUploadsRepository(session, NOW)
    claim_token = uuid4()
    conn = _conn()

    lease = await repository.try_claim_completion(
        upload_id=session.id,
        scope=_scope(),
        expected_generation=4,
        new_claim_token=claim_token,
        lease_duration=LEASE_DURATION,
        conn=conn,
    )

    assert lease is not None
    assert lease.claim_token == claim_token
    assert lease.generation == 5
    assert lease.status == UploadStatus.COMPLETING
    assert lease.heartbeat_at == NOW
    assert lease.lease_until == NOW + LEASE_DURATION
    assert session.completion_generation == 5
    assert session.save_calls[0][1] is conn


@pytest.mark.asyncio
async def test_fresh_claim_returns_none_for_stale_expected_generation_without_mutation() -> None:
    session = _FakeUploadSession(completion_generation=2)
    repository = _UnitUploadsRepository(session)

    lease = await repository.try_claim_completion(
        upload_id=session.id,
        scope=_scope(),
        expected_generation=1,
        new_claim_token=uuid4(),
        lease_duration=LEASE_DURATION,
        conn=_conn(),
    )

    assert lease is None
    assert session.status == UploadStatus.UPLOADING
    assert session.completion_generation == 2
    assert session.save_calls == []


@pytest.mark.asyncio
async def test_fresh_claim_rejects_session_expired_by_database_clock() -> None:
    session = _FakeUploadSession(expires_at=NOW - timedelta(microseconds=1))
    repository = _UnitUploadsRepository(session, NOW)

    with pytest.raises(UploadCompletionInvariantError, match="expired at database time"):
        await repository.try_claim_completion(
            upload_id=session.id,
            scope=_scope(),
            expected_generation=0,
            new_claim_token=uuid4(),
            lease_duration=LEASE_DURATION,
            conn=_conn(),
        )

    assert session.status == UploadStatus.UPLOADING
    assert session.save_calls == []


@pytest.mark.asyncio
async def test_reclaim_finalized_session_rotates_fence_and_preserves_storage_evidence() -> None:
    original_token = uuid4()
    session = _finalized_session(
        claim_token=original_token,
        generation=7,
        lease_until=NOW - timedelta(seconds=1),
    )
    repository = _UnitUploadsRepository(session, NOW)
    new_token = uuid4()

    lease = await repository.try_reclaim_completion(
        upload_id=session.id,
        scope=_scope(),
        expected_claim_token=original_token,
        expected_generation=7,
        new_claim_token=new_token,
        lease_duration=LEASE_DURATION,
        conn=_conn(),
    )

    assert lease is not None
    assert lease.claim_token == new_token
    assert lease.generation == 8
    assert lease.status == UploadStatus.STORAGE_FINALIZED
    assert session.storage_finalized_at == NOW
    assert session.storage_checksum_sha256 == CHECKSUM
    assert session.finalized_storage_bucket is None


@pytest.mark.asyncio
async def test_reclaim_returns_none_while_current_database_lease_is_active() -> None:
    original_token = uuid4()
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETING,
        completion_generation=1,
        completion_claim_token=original_token,
        completion_heartbeat_at=NOW,
        completion_lease_until=NOW + timedelta(seconds=1),
    )
    repository = _UnitUploadsRepository(session, NOW)

    lease = await repository.try_reclaim_completion(
        upload_id=session.id,
        scope=_scope(),
        expected_claim_token=original_token,
        expected_generation=1,
        new_claim_token=uuid4(),
        lease_duration=LEASE_DURATION,
        conn=_conn(),
    )

    assert lease is None
    assert session.completion_claim_token == original_token
    assert session.completion_generation == 1
    assert session.save_calls == []


@pytest.mark.asyncio
async def test_heartbeat_requires_exact_live_fence_and_uses_database_time() -> None:
    claim_token = uuid4()
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETING,
        completion_generation=3,
        completion_claim_token=claim_token,
        completion_heartbeat_at=NOW - timedelta(seconds=10),
        completion_lease_until=NOW + timedelta(seconds=1),
    )
    heartbeat_at = NOW + timedelta(milliseconds=250)
    repository = _UnitUploadsRepository(session, heartbeat_at)

    lease = await repository.heartbeat_completion(
        upload_id=session.id,
        scope=_scope(),
        claim_token=claim_token,
        generation=3,
        lease_duration=LEASE_DURATION,
        conn=_conn(),
    )

    assert lease.heartbeat_at == heartbeat_at
    assert lease.lease_until == heartbeat_at + LEASE_DURATION


@pytest.mark.asyncio
async def test_heartbeat_rejects_stale_generation_without_mutation() -> None:
    claim_token = uuid4()
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETING,
        completion_generation=3,
        completion_claim_token=claim_token,
        completion_heartbeat_at=NOW,
        completion_lease_until=NOW + LEASE_DURATION,
    )
    repository = _UnitUploadsRepository(session, NOW)

    with pytest.raises(UploadCompletionInvariantError, match="heartbeat.*fence"):
        await repository.heartbeat_completion(
            upload_id=session.id,
            scope=_scope(),
            claim_token=claim_token,
            generation=2,
            lease_duration=LEASE_DURATION,
            conn=_conn(),
        )

    assert session.save_calls == []


@pytest.mark.asyncio
async def test_storage_finalization_then_completion_preserves_evidence_and_clears_active_claim() -> None:
    claim_token = uuid4()
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETING,
        completion_generation=1,
        completion_claim_token=claim_token,
        completion_heartbeat_at=NOW - timedelta(seconds=1),
        completion_lease_until=NOW + timedelta(seconds=1),
    )
    completed_at = NOW + timedelta(milliseconds=250)
    repository = _UnitUploadsRepository(session, NOW, completed_at)
    scope = _scope()
    conn = _conn()

    finalized = await repository.mark_storage_finalized(
        upload_id=session.id,
        scope=scope,
        claim_token=claim_token,
        generation=1,
        asset_id=session.reserved_asset_id,
        object_key=session.object_key,
        storage_checksum_sha256=CHECKSUM,
        storage_bucket=None,
        lease_duration=LEASE_DURATION,
        conn=conn,
    )
    completed = await repository.mark_completed(
        upload_id=session.id,
        scope=scope,
        claim_token=claim_token,
        generation=1,
        asset_id=session.reserved_asset_id,
        conn=conn,
    )

    assert finalized is completed
    assert completed.status == UploadStatus.COMPLETED
    assert completed.asset_id == completed.reserved_asset_id
    assert completed.completion_claim_token is None
    assert completed.completion_heartbeat_at is None
    assert completed.completion_lease_until is None
    assert completed.completion_generation == 1
    assert completed.storage_finalized_at == NOW
    assert completed.storage_checksum_sha256 == CHECKSUM


@pytest.mark.asyncio
async def test_storage_finalization_rejects_noncanonical_checksum() -> None:
    claim_token = uuid4()
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETING,
        completion_generation=1,
        completion_claim_token=claim_token,
        completion_heartbeat_at=NOW,
        completion_lease_until=NOW + LEASE_DURATION,
    )
    repository = _UnitUploadsRepository(session)

    with pytest.raises(UploadCompletionInvariantError, match="canonical lowercase"):
        await repository.mark_storage_finalized(
            upload_id=session.id,
            scope=_scope(),
            claim_token=claim_token,
            generation=1,
            asset_id=session.reserved_asset_id,
            object_key=session.object_key,
            storage_checksum_sha256="A" * 64,
            storage_bucket=None,
            lease_duration=LEASE_DURATION,
            conn=_conn(),
        )

    assert session.status == UploadStatus.COMPLETING
    assert session.save_calls == []


@pytest.mark.asyncio
async def test_release_is_only_allowed_before_storage_finalization() -> None:
    claim_token = uuid4()
    session = _finalized_session(claim_token=claim_token)
    repository = _UnitUploadsRepository(session, NOW)

    with pytest.raises(UploadCompletionInvariantError, match="release.*STORAGE_FINALIZED"):
        await repository.release_uncommitted_completion(
            upload_id=session.id,
            scope=_scope(),
            claim_token=claim_token,
            generation=1,
            conn=_conn(),
        )

    assert session.status == UploadStatus.STORAGE_FINALIZED
    assert session.storage_checksum_sha256 == CHECKSUM
    assert session.save_calls == []


@pytest.mark.asyncio
async def test_release_uncommitted_claim_clears_lease_but_preserves_generation() -> None:
    claim_token = uuid4()
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETING,
        completion_generation=4,
        completion_claim_token=claim_token,
        completion_heartbeat_at=NOW,
        completion_lease_until=NOW + LEASE_DURATION,
    )
    repository = _UnitUploadsRepository(session, NOW)

    released = await repository.release_uncommitted_completion(
        upload_id=session.id,
        scope=_scope(),
        claim_token=claim_token,
        generation=4,
        conn=_conn(),
    )

    assert released.status == UploadStatus.UPLOADING
    assert released.completion_claim_token is None
    assert released.completion_heartbeat_at is None
    assert released.completion_lease_until is None
    assert released.completion_generation == 4


@pytest.mark.asyncio
async def test_relinquish_finalized_claim_makes_lease_immediately_reclaimable_without_changing_evidence() -> None:
    claim_token = uuid4()
    session = _finalized_session(claim_token=claim_token, generation=5)
    relinquished_at = NOW + timedelta(seconds=1)
    repository = _UnitUploadsRepository(session, relinquished_at)
    original_heartbeat = session.completion_heartbeat_at
    original_finalized_at = session.storage_finalized_at

    relinquished = await repository.relinquish_storage_finalized_completion(
        upload_id=session.id,
        scope=_scope(),
        claim_token=claim_token,
        generation=5,
        conn=_conn(),
    )

    assert relinquished.status == UploadStatus.STORAGE_FINALIZED
    assert relinquished.completion_claim_token == claim_token
    assert relinquished.completion_generation == 5
    assert relinquished.completion_heartbeat_at == original_heartbeat
    assert relinquished.completion_lease_until == relinquished_at
    assert relinquished.storage_finalized_at == original_finalized_at
    assert relinquished.storage_checksum_sha256 == CHECKSUM
    assert relinquished.finalized_storage_bucket is None


@pytest.mark.parametrize(
    ("session", "claim_token", "generation", "message"),
    [
        (
            _FakeUploadSession(
                status=UploadStatus.COMPLETING,
                completion_generation=1,
                completion_claim_token=UUID(int=1),
                completion_heartbeat_at=NOW,
                completion_lease_until=NOW + LEASE_DURATION,
            ),
            UUID(int=1),
            1,
            "STORAGE_FINALIZED",
        ),
        (
            _FakeUploadSession(status=UploadStatus.COMPLETED),
            UUID(int=2),
            1,
            "COMPLETED",
        ),
        (
            _finalized_session(claim_token=UUID(int=3), generation=2),
            UUID(int=4),
            2,
            "claim fence mismatch",
        ),
        (
            _finalized_session(
                claim_token=UUID(int=5),
                generation=3,
                lease_until=NOW - timedelta(microseconds=1),
            ),
            UUID(int=5),
            3,
            "lease expired",
        ),
    ],
)
@pytest.mark.asyncio
async def test_relinquish_rejects_nonfinalized_stale_or_expired_owner_without_mutation(
    session: _FakeUploadSession,
    claim_token: UUID,
    generation: int,
    message: str,
) -> None:
    repository = _UnitUploadsRepository(session, NOW)
    original_lease = session.completion_lease_until

    with pytest.raises(UploadCompletionInvariantError, match=message):
        await repository.relinquish_storage_finalized_completion(
            upload_id=session.id,
            scope=_scope(),
            claim_token=claim_token,
            generation=generation,
            conn=_conn(),
        )

    assert session.completion_lease_until == original_lease
    assert session.save_calls == []


@pytest.mark.asyncio
async def test_mark_expired_requires_database_clock_to_pass_expiry() -> None:
    session = _FakeUploadSession(expires_at=NOW + timedelta(seconds=1))
    repository = _UnitUploadsRepository(session, NOW)

    with pytest.raises(UploadCompletionInvariantError, match="has not expired"):
        await repository.mark_expired(
            upload_id=session.id,
            scope=_scope(),
            conn=_conn(),
        )

    assert session.status == UploadStatus.UPLOADING
    assert session.save_calls == []


@pytest.mark.parametrize("method_name", ["mark_uploading", "mark_expired", "mark_aborted"])
@pytest.mark.asyncio
async def test_completed_is_absolute_terminal_for_named_transitions(method_name: str) -> None:
    session = _FakeUploadSession(
        status=UploadStatus.COMPLETED,
        expires_at=NOW - timedelta(seconds=1),
    )
    session.asset_id = session.reserved_asset_id
    repository = _UnitUploadsRepository(session, NOW)
    method = getattr(repository, method_name)

    with pytest.raises(UploadCompletionInvariantError, match="COMPLETED"):
        await method(upload_id=session.id, scope=_scope(), conn=_conn())

    assert session.status == UploadStatus.COMPLETED
    assert session.asset_id == session.reserved_asset_id
    assert session.save_calls == []
