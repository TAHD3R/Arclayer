from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from asyncpg import exceptions as asyncpg_exceptions
from pydantic import ValidationError
from tortoise.exceptions import IntegrityError

import src.modules.assets.jobs.thumbnail_repository as thumbnail_repository_module
from src.models.assets.asset import AssetRecord
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailOutcomeMarker,
)
from src.modules.assets.jobs.thumbnail_repository import AssetThumbnailOutcomeWrite, TenantAssetThumbnailRepository
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.tenancy.schema import TenantContext

pytestmark = pytest.mark.unit


class _FailingConnection:
    def __init__(self, error: BaseException) -> None:
        self._error = error

    async def __aenter__(self) -> None:
        raise self._error

    async def __aexit__(self, *_args: object) -> None:
        return None


class _DatabaseClockConnection:
    async def execute_query_dict(self, _query: str) -> list[dict[str, object]]:
        return [{"database_time": datetime(2026, 7, 17, 12, tzinfo=UTC)}]


class _ExitFailingConnection:
    def __init__(self, error: Exception) -> None:
        self._error = error

    async def __aenter__(self) -> _DatabaseClockConnection:
        return _DatabaseClockConnection()

    async def __aexit__(self, *_args: object) -> None:
        raise self._error


class _StaticConnection:
    async def __aenter__(self) -> _DatabaseClockConnection:
        return _DatabaseClockConnection()

    async def __aexit__(self, *_args: object) -> None:
        return None


class _PersistableAsset:
    def __init__(self, *, asset_id: UUID, project_id: UUID, checksum: str) -> None:
        self.id = asset_id
        self.project_id = project_id
        self.checksum_sha256 = checksum
        self.deleted_at = None
        self.variants: dict[str, object] = {}
        self.meta: dict[str, object] = {}
        self.updated_at: datetime | None = None

    async def save(self, **_kwargs: object) -> None:
        return None


class _AssetQuery:
    def __init__(self, asset: _PersistableAsset) -> None:
        self._asset = asset

    def using_db(self, _connection: object) -> _AssetQuery:
        return self

    def select_for_update(self) -> _AssetQuery:
        return self

    async def first(self) -> _PersistableAsset:
        return self._asset


def _repository_with_connection_failure(
    monkeypatch: pytest.MonkeyPatch,
    *,
    project_id: UUID,
    error: BaseException,
) -> TenantAssetThumbnailRepository:
    class _FailingRouter:
        def __init__(self, _context: object) -> None:
            pass

        def connection(self) -> _FailingConnection:
            return _FailingConnection(error)

    monkeypatch.setattr(thumbnail_repository_module, "TenantDatabaseRouter", _FailingRouter)
    context = cast(TenantContext, SimpleNamespace(project_id=project_id))
    return TenantAssetThumbnailRepository(tenant_context_provider=lambda: context)


def _write(*, project_id: UUID, asset_id: UUID, source_revision: str = "a" * 64) -> AssetThumbnailOutcomeWrite:
    return AssetThumbnailOutcomeWrite(
        job_id=uuid4(),
        project_id=project_id,
        asset_id=asset_id,
        request_fingerprint="f" * 64,
        output_identity="d" * 64,
        source_revision=source_revision,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        produced_widths=(400,),
        variants={"thumbnails": []},
        meta={},
    )


def test_outcome_write_accepts_and_dumps_canonical_output_identity_alias() -> None:
    write = AssetThumbnailOutcomeWrite.model_validate({
        "jobId": str(uuid4()),
        "projectId": str(uuid4()),
        "assetId": str(uuid4()),
        "requestFingerprint": "f" * 64,
        "outputIdentity": "d" * 64,
        "sourceRevision": "a" * 64,
        "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
        "producedWidths": [400],
        "variants": {"thumbnails": []},
        "meta": {},
    })

    assert write.output_identity == "d" * 64
    assert write.model_dump(mode="json", by_alias=True)["outputIdentity"] == "d" * 64


def test_outcome_write_requires_output_identity() -> None:
    payload = _write(project_id=uuid4(), asset_id=uuid4()).model_dump(
        mode="json",
        by_alias=True,
    )
    del payload["outputIdentity"]

    with pytest.raises(ValidationError) as exc_info:
        AssetThumbnailOutcomeWrite.model_validate(payload)

    assert exc_info.value.errors()[0]["type"] == "missing"
    assert exc_info.value.errors()[0]["loc"] == ("outputIdentity",)


@pytest.mark.parametrize(
    "output_identity",
    ["D" * 64, "d" * 63, "g" * 64, f" {'d' * 64} "],
)
def test_outcome_write_rejects_noncanonical_output_identity(output_identity: str) -> None:
    payload = _write(project_id=uuid4(), asset_id=uuid4()).model_dump(
        mode="json",
        by_alias=True,
    )
    payload["outputIdentity"] = output_identity

    with pytest.raises(ValidationError):
        AssetThumbnailOutcomeWrite.model_validate(payload)


@pytest.mark.asyncio
async def test_get_source_translates_retryable_database_failure_to_persistence_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=asyncpg_exceptions.ConnectionDoesNotExistError("connection lost"),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await repository.get_source(project_id=project_id, asset_id=uuid4())

    assert exc_info.value.code == "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None
    assert exc_info.value.provider_retry_after_seconds is None


@pytest.mark.asyncio
async def test_get_outcome_marker_translates_retryable_database_failure_to_persistence_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=asyncpg_exceptions.QueryCanceledError("query cancelled by PostgreSQL"),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await repository.get_outcome_marker(project_id=project_id, asset_id=uuid4())

    assert exc_info.value.code == "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None
    assert exc_info.value.provider_retry_after_seconds is None


@pytest.mark.asyncio
async def test_get_outcome_marker_preserves_permanent_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    permanent_error = PermanentJobExecutionError(
        code="ASSET_THUMBNAIL_TARGET_NOT_FOUND",
        safe_message="The thumbnail target Asset is no longer available",
    )
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=permanent_error,
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await repository.get_outcome_marker(project_id=project_id, asset_id=uuid4())

    assert exc_info.value is permanent_error


@pytest.mark.asyncio
async def test_get_outcome_marker_preserves_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    cancellation = asyncio.CancelledError()
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=cancellation,
    )

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await repository.get_outcome_marker(project_id=project_id, asset_id=uuid4())

    assert exc_info.value is cancellation


@pytest.mark.asyncio
async def test_get_outcome_marker_rejects_stored_marker_without_output_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    asset_id = uuid4()
    asset = _PersistableAsset(asset_id=asset_id, project_id=project_id, checksum="a" * 64)
    marker = AssetThumbnailOutcomeMarker(
        job_id=uuid4(),
        request_fingerprint="f" * 64,
        output_identity="d" * 64,
        source_revision="a" * 64,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        produced_widths=(400,),
        completed_at=datetime(2026, 7, 17, 12, tzinfo=UTC),
    ).model_dump(mode="json", by_alias=True)
    del marker["outputIdentity"]
    asset.meta = {"thumbnail_generation": marker}

    class _StaticRouter:
        def __init__(self, _context: object) -> None:
            pass

        def connection(self) -> _StaticConnection:
            return _StaticConnection()

    def _filter(_model: type[AssetRecord], **_filters: object) -> _AssetQuery:
        return _AssetQuery(asset)

    monkeypatch.setattr(thumbnail_repository_module, "TenantDatabaseRouter", _StaticRouter)
    monkeypatch.setattr(AssetRecord, "filter", classmethod(_filter))
    context = cast(TenantContext, SimpleNamespace(project_id=project_id))
    repository = TenantAssetThumbnailRepository(tenant_context_provider=lambda: context)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await repository.get_outcome_marker(project_id=project_id, asset_id=asset_id)

    assert exc_info.value.code == "ASSET_THUMBNAIL_OUTCOME_INVALID"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_commit_outcome_translates_retryable_database_failure_to_persistence_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=asyncpg_exceptions.TransactionResolutionUnknownError("commit outcome is unknown"),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await repository.commit_outcome(write=_write(project_id=project_id, asset_id=uuid4()))

    assert exc_info.value.code == "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None
    assert exc_info.value.provider_retry_after_seconds is None


@pytest.mark.asyncio
async def test_commit_outcome_translates_transaction_exit_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    asset_id = uuid4()
    asset = _PersistableAsset(asset_id=asset_id, project_id=project_id, checksum="a" * 64)
    exit_error = asyncpg_exceptions.TransactionResolutionUnknownError("commit response was lost")

    class _ExitFailingRouter:
        def __init__(self, _context: object) -> None:
            pass

        def connection(self) -> _ExitFailingConnection:
            return _ExitFailingConnection(exit_error)

    def _filter(_model: type[AssetRecord], **_filters: object) -> _AssetQuery:
        return _AssetQuery(asset)

    monkeypatch.setattr(thumbnail_repository_module, "TenantDatabaseRouter", _ExitFailingRouter)
    monkeypatch.setattr(AssetRecord, "filter", classmethod(_filter))
    context = cast(TenantContext, SimpleNamespace(project_id=project_id))
    repository = TenantAssetThumbnailRepository(tenant_context_provider=lambda: context)

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await repository.commit_outcome(write=_write(project_id=project_id, asset_id=asset_id))

    assert exc_info.value.code == "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.__cause__ is exit_error


@pytest.mark.asyncio
async def test_get_source_does_not_translate_integrity_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    integrity_error = IntegrityError("schema invariant failed")
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=integrity_error,
    )

    with pytest.raises(IntegrityError) as exc_info:
        await repository.get_source(project_id=project_id, asset_id=uuid4())

    assert exc_info.value is integrity_error


@pytest.mark.asyncio
async def test_get_source_preserves_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    cancellation = asyncio.CancelledError()
    repository = _repository_with_connection_failure(
        monkeypatch,
        project_id=project_id,
        error=cancellation,
    )

    with pytest.raises(asyncio.CancelledError) as exc_info:
        await repository.get_source(project_id=project_id, asset_id=uuid4())

    assert exc_info.value is cancellation


class _RouterMustNotBeUsed:
    def __init__(self, _context: object) -> None:
        raise AssertionError("mismatched project scope must fail before database routing")


@pytest.mark.asyncio
async def test_get_outcome_marker_rejects_mismatched_project_scope_before_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context_project_id = uuid4()
    requested_project_id = uuid4()
    context = cast(TenantContext, SimpleNamespace(project_id=context_project_id))
    monkeypatch.setattr(thumbnail_repository_module, "TenantDatabaseRouter", _RouterMustNotBeUsed)
    repository = TenantAssetThumbnailRepository(tenant_context_provider=lambda: context)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await repository.get_outcome_marker(project_id=requested_project_id, asset_id=uuid4())

    assert exc_info.value.code == "ASSET_THUMBNAIL_TARGET_NOT_FOUND"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_commit_outcome_rejects_mismatched_project_scope_before_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context_project_id = uuid4()
    requested_project_id = uuid4()
    context = cast(TenantContext, SimpleNamespace(project_id=context_project_id))
    monkeypatch.setattr(thumbnail_repository_module, "TenantDatabaseRouter", _RouterMustNotBeUsed)
    repository = TenantAssetThumbnailRepository(tenant_context_provider=lambda: context)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await repository.commit_outcome(
            write=_write(project_id=requested_project_id, asset_id=uuid4()),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_TARGET_NOT_FOUND"
    assert exc_info.value.metadata is None
