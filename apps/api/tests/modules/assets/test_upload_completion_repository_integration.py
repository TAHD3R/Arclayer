from __future__ import annotations

import asyncio
from datetime import timedelta
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.modules.assets.admin.uploads.repository import (
    UploadCompletionInvariantError,
    UploadCompletionLease,
    UploadsRepository,
)
from src.modules.assets.scope import AssetScope

pytestmark = pytest.mark.integration

LEASE_DURATION = timedelta(seconds=30)
CHECKSUM = "a" * 64


async def _create_upload(
    *,
    scope: AssetScope,
    expires_in: timedelta = timedelta(hours=1),
) -> UploadSessionRecord:
    repository = UploadsRepository()
    async with in_transaction() as conn:
        database_time = await repository.get_database_time(conn=conn)
        return await UploadSessionRecord.create(
            using_db=conn,
            workspace_id=scope.id,
            actor_user_id=uuid4(),
            purpose="library",
            filename="asset.bin",
            size_bytes=3,
            chunk_size=3,
            total_parts=1,
            status=UploadStatus.UPLOADING,
            expires_at=database_time + expires_in,
            reserved_asset_id=uuid4(),
            object_key=f"assets/{uuid4()}/asset.bin",
            storage_provider="local",
        )


@pytest.mark.asyncio
async def test_concurrent_fresh_claim_has_one_generation_winner(db_schema) -> None:
    _ = db_schema
    repository = UploadsRepository()
    scope = AssetScope(type=ASSET_SCOPE_WORKSPACE, id=uuid4())
    session = await _create_upload(scope=scope)

    async def claim() -> UploadCompletionLease | None:
        async with in_transaction() as conn:
            return await repository.try_claim_completion(
                upload_id=session.id,
                scope=scope,
                expected_generation=0,
                new_claim_token=uuid4(),
                lease_duration=LEASE_DURATION,
                conn=conn,
            )

    claims = await asyncio.gather(claim(), claim())

    winners = [claim for claim in claims if claim is not None]
    assert len(winners) == 1
    assert winners[0].generation == 1
    await session.refresh_from_db()
    assert session.status == UploadStatus.COMPLETING
    assert session.completion_claim_token == winners[0].claim_token
    assert session.completion_generation == 1


@pytest.mark.asyncio
async def test_relinquished_finalized_takeover_preserves_evidence_and_fences_stale_committer(db_schema) -> None:
    _ = db_schema
    repository = UploadsRepository()
    scope = AssetScope(type=ASSET_SCOPE_WORKSPACE, id=uuid4())
    session = await _create_upload(scope=scope)
    first_token = uuid4()

    async with in_transaction() as conn:
        first_claim = await repository.try_claim_completion(
            upload_id=session.id,
            scope=scope,
            expected_generation=0,
            new_claim_token=first_token,
            lease_duration=LEASE_DURATION,
            conn=conn,
        )
    assert first_claim is not None

    async with in_transaction() as conn:
        finalized = await repository.mark_storage_finalized(
            upload_id=session.id,
            scope=scope,
            claim_token=first_token,
            generation=first_claim.generation,
            asset_id=session.reserved_asset_id,
            object_key=str(session.object_key),
            storage_checksum_sha256=CHECKSUM,
            storage_bucket=None,
            lease_duration=LEASE_DURATION,
            conn=conn,
        )
    async with in_transaction() as conn:
        relinquished = await repository.relinquish_storage_finalized_completion(
            upload_id=session.id,
            scope=scope,
            claim_token=first_token,
            generation=first_claim.generation,
            conn=conn,
        )

    second_token = uuid4()
    async with in_transaction() as conn:
        second_claim = await repository.try_reclaim_completion(
            upload_id=session.id,
            scope=scope,
            expected_claim_token=first_token,
            expected_generation=first_claim.generation,
            new_claim_token=second_token,
            lease_duration=LEASE_DURATION,
            conn=conn,
        )

    assert second_claim is not None
    assert second_claim.generation == first_claim.generation + 1
    assert second_claim.status == UploadStatus.STORAGE_FINALIZED
    assert relinquished.status == UploadStatus.STORAGE_FINALIZED
    assert relinquished.completion_claim_token == first_token
    assert relinquished.completion_generation == first_claim.generation
    assert relinquished.completion_heartbeat_at == finalized.completion_heartbeat_at
    assert finalized.storage_finalized_at is not None
    assert relinquished.storage_finalized_at == finalized.storage_finalized_at
    assert finalized.storage_checksum_sha256 == CHECKSUM
    assert relinquished.storage_checksum_sha256 == CHECKSUM

    with pytest.raises(UploadCompletionInvariantError, match="claim fence mismatch"):
        async with in_transaction() as conn:
            await repository.mark_completed(
                upload_id=session.id,
                scope=scope,
                claim_token=first_token,
                generation=first_claim.generation,
                asset_id=session.reserved_asset_id,
                conn=conn,
            )

    async with in_transaction() as conn:
        completed = await repository.mark_completed(
            upload_id=session.id,
            scope=scope,
            claim_token=second_token,
            generation=second_claim.generation,
            asset_id=session.reserved_asset_id,
            conn=conn,
        )

    assert completed.status == UploadStatus.COMPLETED
    assert completed.asset_id == session.reserved_asset_id
    assert completed.completion_claim_token is None
    assert completed.completion_heartbeat_at is None
    assert completed.completion_lease_until is None
    assert completed.completion_generation == second_claim.generation
    assert completed.storage_finalized_at is not None
    assert completed.storage_checksum_sha256 == CHECKSUM


@pytest.mark.asyncio
async def test_expiration_reads_database_clock_after_waiting_for_row_lock(db_schema) -> None:
    _ = db_schema
    repository = UploadsRepository()
    scope = AssetScope(type=ASSET_SCOPE_WORKSPACE, id=uuid4())
    session = await _create_upload(scope=scope, expires_in=timedelta(milliseconds=250))
    lock_acquired = asyncio.Event()
    release_lock = asyncio.Event()

    async def hold_lock() -> None:
        async with in_transaction() as conn:
            locked = await repository.get_session_for_update(
                upload_id=session.id,
                scope=scope,
                conn=conn,
            )
            assert locked is not None
            lock_acquired.set()
            await release_lock.wait()

    async def mark_expired_after_lock() -> UploadSessionRecord:
        async with in_transaction() as conn:
            return await repository.mark_expired(
                upload_id=session.id,
                scope=scope,
                conn=conn,
            )

    holder = asyncio.create_task(hold_lock())
    await lock_acquired.wait()
    expirer = asyncio.create_task(mark_expired_after_lock())
    await asyncio.sleep(0.4)
    release_lock.set()
    await holder
    expired = await expirer

    assert expired.status == UploadStatus.EXPIRED
