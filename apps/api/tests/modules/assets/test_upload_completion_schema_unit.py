from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.common.constants.assets import ASSET_SCOPE_PROJECT
from src.models.assets.upload import UploadStatus
from src.modules.assets.admin.uploads.completion_schema import (
    _UploadCompletionClaim,
    _UploadCompletionClaimDisposition,
    _UploadCompletionClaimResult,
    _UploadPartSnapshot,
    _UploadSessionSnapshot,
)


def _session_snapshot(*, size_bytes: int = 3) -> _UploadSessionSnapshot:
    project_id = uuid4()
    return _UploadSessionSnapshot(
        id=uuid4(),
        project_id=project_id,
        actor_user_id=uuid4(),
        purpose="library",
        filename="asset.png",
        mime="image/png",
        size_bytes=size_bytes,
        expected_sha256=None,
        total_parts=1,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        reserved_asset_id=uuid4(),
        storage_provider="local",
        storage_profile_key="env-default",
        visibility="private",
        indexable=False,
        resolved_slug="asset",
        resolved_ext="png",
        object_key=f"projects/{project_id}/assets/{uuid4()}.png",
    )


def _local_claim(*, status: UploadStatus = UploadStatus.COMPLETING) -> _UploadCompletionClaim:
    session = _session_snapshot()
    now = datetime.now(UTC)
    checksum = "a" * 64
    return _UploadCompletionClaim(
        scope=session.scope(),
        session=session,
        parts=(
            _UploadPartSnapshot(
                part_number=1,
                object_key=f"projects/{session.project_id}/uploads/{session.id}/part-000001",
                size_bytes=3,
                checksum_sha256=checksum,
            ),
        ),
        claim_token=uuid4(),
        generation=1,
        status=status,
        heartbeat_at=now,
        lease_until=now + timedelta(minutes=5),
        storage_finalized_at=now if status == UploadStatus.STORAGE_FINALIZED else None,
        storage_checksum_sha256=checksum if status == UploadStatus.STORAGE_FINALIZED else None,
    )


def test_completion_claim_is_frozen_and_binds_scope_parts_and_lease() -> None:
    claim = _local_claim()

    assert claim.scope.type == ASSET_SCOPE_PROJECT
    assert claim.scope.id == claim.session.project_id
    assert claim.parts[0].checksum_sha256 == "a" * 64

    with pytest.raises(ValidationError):
        claim.generation = 2


def test_local_completion_claim_rejects_a_part_without_persisted_checksum() -> None:
    claim = _local_claim()

    with pytest.raises(ValidationError, match="checksum for every part"):
        _UploadCompletionClaim(
            **claim.model_dump(exclude={"parts"}),
            parts=(claim.parts[0].model_copy(update={"checksum_sha256": None}),),
        )


def test_storage_finalized_claim_requires_provider_specific_durable_evidence() -> None:
    claim = _local_claim(status=UploadStatus.STORAGE_FINALIZED)
    assert claim.storage_finalized_at is not None

    with pytest.raises(ValidationError, match="requires a checksum"):
        _UploadCompletionClaim(**claim.model_dump(exclude={"storage_checksum_sha256"}))


def test_claim_result_disposition_rejects_ambiguous_payloads() -> None:
    with pytest.raises(ValidationError, match="cannot carry"):
        _UploadCompletionClaimResult(
            disposition=_UploadCompletionClaimDisposition.BUSY,
            asset_id=uuid4(),
        )
