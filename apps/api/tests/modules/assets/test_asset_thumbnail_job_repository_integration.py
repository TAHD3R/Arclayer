from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.utils.public_ids import decode_public_id
from src.models.assets.asset import AssetPurpose, AssetRecord
from src.models.workspaces.workspace import Workspace
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailOutcomeMarker,
)
from src.modules.assets.jobs.thumbnail_repository import (
    AssetThumbnailOutcomeWrite,
    TenantAssetThumbnailRepository,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client

pytestmark = pytest.mark.integration

_POSTGRES_LOCK_TIMEOUT = "100ms"
_REPLAY_CLOCK_SEPARATION_SECONDS = 0.01


class _TwoConnectionBarrier:
    def __init__(self) -> None:
        self.backend_pids: set[int] = set()
        self._arrivals = 0
        self._ready = asyncio.Event()

    async def arrive(self, backend_pid: int) -> None:
        self.backend_pids.add(backend_pid)
        self._arrivals += 1
        if self._arrivals == 2:
            self._ready.set()
        await self._ready.wait()


class _RecordingTenantDatabaseRouter(TenantDatabaseRouter):
    def __init__(self, context: TenantContext, barrier: _TwoConnectionBarrier) -> None:
        super().__init__(context)
        self._barrier = barrier

    @asynccontextmanager
    async def connection(
        self,
        conn: BaseDBAsyncClient | None = None,
    ) -> AsyncIterator[BaseDBAsyncClient]:
        async with super().connection(conn) as tenant_conn:
            rows = await tenant_conn.execute_query_dict("SELECT pg_backend_pid() AS backend_pid")
            backend_pid = rows[0]["backend_pid"]
            assert isinstance(backend_pid, int)
            await self._barrier.arrive(backend_pid)
            yield tenant_conn


@pytest.mark.asyncio
async def test_outcome_lookup_reads_exact_marker_from_soft_deleted_tenant_asset(
    prepared_db,
    integration_valkey_settings,
) -> None:
    marker = AssetThumbnailOutcomeMarker(
        job_id=uuid4(),
        request_fingerprint="f" * 64,
        output_identity="d" * 64,
        source_revision="a" * 64,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        produced_widths=(400, 800),
        completed_at=datetime(2026, 7, 17, 6, tzinfo=UTC),
    )

    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        workspace = await Workspace.get(id=workspace_id)
        tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
        assert tenant is not None
        context = TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.JOB,
        )
        asset_id = uuid4()
        async with _tenant_conn(workspace_public_id) as conn:
            await AssetRecord.create(
                id=asset_id,
                project_id=project_id,
                purpose=AssetPurpose.LIBRARY,
                object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
                mime="image/png",
                ext="png",
                meta={
                    "thumbnail_generation": marker.model_dump(
                        mode="json",
                        by_alias=True,
                    )
                },
                deleted_at=datetime(2026, 7, 17, 6, 30, tzinfo=UTC),
                using_db=conn,
            )

        repository = TenantAssetThumbnailRepository(
            tenant_context_provider=lambda: context,
        )

        restored = await repository.get_outcome_marker(
            project_id=project_id,
            asset_id=asset_id,
        )

        assert restored == marker


@pytest.mark.asyncio
async def test_outcome_lookup_reports_missing_tenant_asset_as_permanent_target_failure(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        workspace = await Workspace.get(id=workspace_id)
        tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
        assert tenant is not None
        context = TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.JOB,
        )
        repository = TenantAssetThumbnailRepository(
            tenant_context_provider=lambda: context,
        )

        with pytest.raises(PermanentJobExecutionError) as exc_info:
            await repository.get_outcome_marker(
                project_id=project_id,
                asset_id=uuid4(),
            )

        assert exc_info.value.code == "ASSET_THUMBNAIL_TARGET_NOT_FOUND"
        assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_outcome_commit_atomically_merges_variants_meta_and_exact_marker(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        workspace = await Workspace.get(id=workspace_id)
        tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
        assert tenant is not None
        context = TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.JOB,
        )
        asset_id = uuid4()
        checksum = "a" * 64
        existing_thumbnail = {
            "name": "thumb_200",
            "width": 200,
            "height": 100,
            "mime": "image/jpeg",
            "ext": "jpg",
            "object_key": "existing/thumb-200.jpg",
            "size_bytes": 100,
        }
        incoming_thumbnail = {
            "name": "thumb_400",
            "width": 400,
            "height": 200,
            "mime": "image/jpeg",
            "ext": "jpg",
            "object_key": "generated/thumb-400.jpg",
            "size_bytes": 200,
        }
        async with _tenant_conn(workspace_public_id) as conn:
            await AssetRecord.create(
                id=asset_id,
                project_id=project_id,
                purpose=AssetPurpose.LIBRARY,
                object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
                mime="image/png",
                ext="png",
                checksum_sha256=checksum,
                variants={"thumbnails": [existing_thumbnail]},
                meta={"description": "preserve me", "image": {"width": 1000}},
                using_db=conn,
            )

        job_id = uuid4()
        repository = TenantAssetThumbnailRepository(
            tenant_context_provider=lambda: context,
        )
        marker = await repository.commit_outcome(
            write=AssetThumbnailOutcomeWrite(
                job_id=job_id,
                project_id=project_id,
                asset_id=asset_id,
                request_fingerprint="f" * 64,
                output_identity="d" * 64,
                source_revision=checksum,
                thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
                produced_widths=(400,),
                variants={"thumbnails": [incoming_thumbnail]},
                meta={"image": {"height": 500}, "document": {"preview_source": "first_page"}},
            )
        )

        async with _tenant_conn(workspace_public_id) as conn:
            persisted = await AssetRecord.get(id=asset_id, using_db=conn)

        assert marker.job_id == job_id
        assert marker.output_identity == "d" * 64
        assert marker.completed_at.tzinfo is not None
        assert persisted.variants == {
            "thumbnails": [existing_thumbnail, incoming_thumbnail],
        }
        assert persisted.meta == {
            "description": "preserve me",
            "image": {"width": 1000, "height": 500},
            "document": {"preview_source": "first_page"},
            "thumbnail_generation": marker.model_dump(mode="json", by_alias=True),
        }


@pytest.mark.asyncio
async def test_outcome_commit_maps_real_postgres_lock_timeout_to_retryable_persistence_failure(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        workspace = await Workspace.get(id=workspace_id)
        tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
        assert tenant is not None
        context = TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.JOB,
        )
        asset_id = uuid4()
        advisory_lock_key = int.from_bytes(asset_id.bytes[:8], signed=True)
        checksum = "a" * 64
        async with _tenant_conn(workspace_public_id) as conn:
            await AssetRecord.create(
                id=asset_id,
                project_id=project_id,
                purpose=AssetPurpose.LIBRARY,
                object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
                mime="image/png",
                ext="png",
                checksum_sha256=checksum,
                variants={},
                meta={},
                using_db=conn,
            )
            await conn.execute_script(
                f"""
                CREATE FUNCTION test_thumbnail_lock_timeout() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    PERFORM set_config('lock_timeout', '{_POSTGRES_LOCK_TIMEOUT}', true);
                    PERFORM pg_advisory_xact_lock({advisory_lock_key});
                    RETURN NEW;
                END;
                $$;
                CREATE TRIGGER test_thumbnail_lock_timeout
                BEFORE UPDATE ON assets
                FOR EACH ROW EXECUTE FUNCTION test_thumbnail_lock_timeout();
                """
            )

        repository = TenantAssetThumbnailRepository(
            tenant_context_provider=lambda: context,
        )
        write = AssetThumbnailOutcomeWrite(
            job_id=uuid4(),
            project_id=project_id,
            asset_id=asset_id,
            request_fingerprint="f" * 64,
            output_identity="d" * 64,
            source_revision=checksum,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=(400,),
            variants={"thumbnails": []},
            meta={},
        )

        lock_acquired = asyncio.Event()
        release_lock = asyncio.Event()

        async def _hold_advisory_lock() -> None:
            async with _tenant_conn(workspace_public_id) as lock_conn:
                await lock_conn.execute_query(
                    "SELECT pg_advisory_xact_lock($1)",
                    [advisory_lock_key],
                )
                lock_acquired.set()
                await release_lock.wait()

        lock_task = asyncio.create_task(_hold_advisory_lock())
        await lock_acquired.wait()
        try:
            with pytest.raises(TransientJobExecutionError) as exc_info:
                await repository.commit_outcome(write=write)
        finally:
            release_lock.set()
            await lock_task

        assert exc_info.value.code == "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
        assert exc_info.value.metadata is None
        assert exc_info.value.provider_retry_after_seconds is None
        async with _tenant_conn(workspace_public_id) as conn:
            persisted = await AssetRecord.get(id=asset_id, using_db=conn)
        assert persisted.variants == {}
        assert persisted.meta == {}


@pytest.mark.asyncio
async def test_outcome_commit_replays_exact_marker_without_changing_completion_time(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        workspace = await Workspace.get(id=workspace_id)
        tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
        assert tenant is not None
        context = TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.JOB,
        )
        asset_id = uuid4()
        checksum = "a" * 64
        thumbnail = {
            "name": "thumb_400",
            "width": 400,
            "height": 200,
            "mime": "image/jpeg",
            "ext": "jpg",
            "object_key": "generated/thumb-400.jpg",
            "size_bytes": 200,
        }
        async with _tenant_conn(workspace_public_id) as conn:
            await AssetRecord.create(
                id=asset_id,
                project_id=project_id,
                purpose=AssetPurpose.LIBRARY,
                object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
                mime="image/png",
                ext="png",
                checksum_sha256=checksum,
                variants={},
                meta={},
                using_db=conn,
            )

        repository = TenantAssetThumbnailRepository(tenant_context_provider=lambda: context)
        write = AssetThumbnailOutcomeWrite(
            job_id=uuid4(),
            project_id=project_id,
            asset_id=asset_id,
            request_fingerprint="f" * 64,
            output_identity="d" * 64,
            source_revision=checksum,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=(400,),
            variants={"thumbnails": [thumbnail]},
            meta={},
        )

        first = await repository.commit_outcome(write=write)
        await asyncio.sleep(_REPLAY_CLOCK_SEPARATION_SECONDS)
        replay = await repository.commit_outcome(write=write)

        with pytest.raises(PermanentJobExecutionError) as conflict_info:
            await repository.commit_outcome(
                write=write.model_copy(update={"output_identity": "e" * 64}),
            )

        async with _tenant_conn(workspace_public_id) as conn:
            persisted = await AssetRecord.get(id=asset_id, using_db=conn)
        assert replay == first
        assert replay.completed_at == first.completed_at
        assert conflict_info.value.code == "ASSET_THUMBNAIL_OUTCOME_INVALID"
        assert conflict_info.value.metadata is None
        assert persisted.variants == {"thumbnails": [thumbnail]}
        assert persisted.meta == {
            "thumbnail_generation": first.model_dump(mode="json", by_alias=True),
        }


@pytest.mark.asyncio
async def test_concurrent_duplicate_outcome_commits_use_two_connections_and_one_canonical_marker(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        workspace = await Workspace.get(id=workspace_id)
        tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
        assert tenant is not None
        context = TenantContext(
            identity=TenantIdentity(
                organization_id=workspace.organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            ),
            scope=TenantScope.JOB,
        )
        asset_id = uuid4()
        checksum = "a" * 64
        thumbnail = {
            "name": "thumb_400",
            "width": 400,
            "height": 200,
            "mime": "image/jpeg",
            "ext": "jpg",
            "object_key": "generated/thumb-400.jpg",
            "size_bytes": 200,
        }
        async with _tenant_conn(workspace_public_id) as conn:
            await AssetRecord.create(
                id=asset_id,
                project_id=project_id,
                purpose=AssetPurpose.LIBRARY,
                object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
                mime="image/png",
                ext="png",
                checksum_sha256=checksum,
                variants={},
                meta={},
                using_db=conn,
            )

        barrier = _TwoConnectionBarrier()

        def _router_factory(tenant_context: TenantContext) -> TenantDatabaseRouter:
            return _RecordingTenantDatabaseRouter(tenant_context, barrier)

        repository = TenantAssetThumbnailRepository(
            tenant_context_provider=lambda: context,
            router_factory=_router_factory,
        )
        write = AssetThumbnailOutcomeWrite(
            job_id=uuid4(),
            project_id=project_id,
            asset_id=asset_id,
            request_fingerprint="f" * 64,
            output_identity="d" * 64,
            source_revision=checksum,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=(400,),
            variants={"thumbnails": [thumbnail]},
            meta={},
        )

        first, second = await asyncio.gather(
            repository.commit_outcome(write=write),
            repository.commit_outcome(write=write),
        )

        async with _tenant_conn(workspace_public_id) as conn:
            persisted = await AssetRecord.get(id=asset_id, using_db=conn)
        assert len(barrier.backend_pids) == 2
        assert first == second
        assert persisted.variants == {"thumbnails": [thumbnail]}
        assert persisted.meta == {
            "thumbnail_generation": first.model_dump(mode="json", by_alias=True),
        }
