from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.models.storage.storage_profile import (
    StorageProfile,
    StorageProfileConfigSource,
    StorageProfileRouteRevision,
)
from src.modules.system.storage_profiles.schema import (
    StorageProfileConfigPayload,
    StorageProfileCreateRequest,
    StorageProfileUpdateRequest,
)
from src.modules.system.storage_profiles.service import StorageProfilesService
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import (
    StorageProfileRouteInvariantError,
    StorageProfileRouteService,
)
from src.platform.storage.profiles import (
    ENV_DEFAULT_PROFILE_KEY,
    build_storage_profile_config_from_record,
    get_storage_profile_by_key,
)

pytestmark = pytest.mark.integration

LOCK_PROBE_TIMEOUT_SECONDS = 5.0


class ConcurrentEnvironmentRepository(StorageProfileRouteRepository):
    def __init__(self) -> None:
        super().__init__()
        self._entry_count = 0
        self._entry_lock = asyncio.Lock()
        self.both_inserts_entered = asyncio.Event()
        self.revision_created = asyncio.Event()
        self.release_revision = asyncio.Event()
        self.backend_pids: set[int] = set()
        self.revision_backend_pid: int | None = None

    async def insert_profile_if_absent(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ):
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        async with self._entry_lock:
            self._entry_count += 1
            if self._entry_count == 2:
                self.both_inserts_entered.set()
        await self.both_inserts_entered.wait()
        return await super().insert_profile_if_absent(values=values, conn=conn)

    async def create_route_revision(self, **kwargs):  # type: ignore[no-untyped-def]
        conn = kwargs["conn"]
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.revision_backend_pid = int(rows[0]["pid"])
        revision = await super().create_route_revision(**kwargs)
        self.revision_created.set()
        await self.release_revision.wait()
        return revision


async def _wait_for_postgres_lock_wait(*, backend_pid: int) -> None:
    for _ in range(500):
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
                [backend_pid],
            )
        if rows and rows[0].get("wait_event_type") == "Lock":
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"PostgreSQL backend {backend_pid} never entered a lock wait")


async def test_legacy_revision_lazy_materialization_converges_on_one_identity(db_schema) -> None:
    _ = db_schema
    settings = get_settings()
    profile = await StorageProfile.create(
        profile_key=f"legacy-{uuid4().hex}",
        provider=ObjectStorageProviderKind.LOCAL.value,
        display_name="Legacy Local",
        config={},
        secret_ref={},
        is_active=True,
        is_default=False,
    )

    first, second = await asyncio.gather(
        StorageProfileRouteService(settings).materialize_by_key(profile_key=profile.profile_key),
        StorageProfileRouteService(settings).materialize_by_key(profile_key=profile.profile_key),
    )

    assert first == second
    assert await StorageProfileRouteRevision.filter(profile_id=profile.id).count() == 1


async def test_environment_identity_concurrent_materialization_uses_one_profile_and_revision(db_schema) -> None:
    _ = db_schema
    settings = get_settings()
    repository = ConcurrentEnvironmentRepository()
    first_task = asyncio.create_task(
        StorageProfileRouteService(settings, repository=repository).materialize_by_key(
            profile_key=ENV_DEFAULT_PROFILE_KEY
        )
    )
    second_task = asyncio.create_task(
        StorageProfileRouteService(settings, repository=repository).materialize_by_key(
            profile_key=ENV_DEFAULT_PROFILE_KEY
        )
    )
    await asyncio.wait_for(repository.revision_created.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    assert len(repository.backend_pids) == 2
    assert repository.revision_backend_pid is not None
    waiting_pid = next(iter(repository.backend_pids - {repository.revision_backend_pid}))
    await _wait_for_postgres_lock_wait(backend_pid=waiting_pid)

    repository.release_revision.set()
    first, second = await asyncio.gather(first_task, second_task)
    assert first == second
    assert await StorageProfile.filter(profile_key=ENV_DEFAULT_PROFILE_KEY).count() == 1
    assert await StorageProfileRouteRevision.filter(profile_id=first.profile_id).count() == 1


async def test_environment_identity_is_real_non_secret_and_uses_current_restart_credentials(db_schema) -> None:
    _ = db_schema
    first_settings = Settings(
        storage={
            "provider": "s3",
            "s3_endpoint_url": "https://storage.example.com",
            "s3_region": "us-east-1",
            "s3_bucket": "environment-assets",
            "s3_access_key_id": "old-access-key",
            "s3_secret_access_key": "old-secret",
        }
    )
    binding = await StorageProfileRouteService(first_settings).materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
    profile = await StorageProfile.get(id=binding.profile_id)
    revision = await StorageProfileRouteRevision.get(id=binding.profile_revision_id)

    assert profile.id.int != 0
    assert profile.config_source == StorageProfileConfigSource.ENVIRONMENT
    assert profile.secret_ref == {}
    assert "old-access-key" not in str(profile.config)
    assert "old-secret" not in str(profile.config)
    assert "old-access-key" not in str(revision.route)
    assert "old-secret" not in str(revision.route)

    restarted_settings = Settings(
        storage={
            "provider": "s3",
            "s3_endpoint_url": "https://storage.example.com",
            "s3_region": "us-east-1",
            "s3_bucket": "environment-assets",
            "s3_access_key_id": "rotated-access-key",
            "s3_secret_access_key": "rotated-secret",
        }
    )
    runtime = build_storage_profile_config_from_record(profile, settings=restarted_settings)
    resolved = await StorageProfileRouteService(restarted_settings).resolve(
        profile_id=profile.id,
        revision_id=revision.id,
    )

    assert runtime.access_key_id == "rotated-access-key"
    assert runtime.secret_access_key is not None
    assert runtime.secret_access_key.get_secret_value() == "rotated-secret"
    assert resolved.config.access_key_id == "rotated-access-key"
    assert resolved.config.secret_access_key is not None
    assert resolved.config.secret_access_key.get_secret_value() == "rotated-secret"
    assert resolved.binding == binding


async def test_environment_route_change_appends_revision_and_old_route_uses_current_credentials(db_schema) -> None:
    _ = db_schema
    first_settings = Settings(
        storage={
            "provider": "s3",
            "s3_endpoint_url": "https://old-storage.example.com",
            "s3_region": "us-east-1",
            "s3_bucket": "old-assets",
            "s3_access_key_id": "old-access",
            "s3_secret_access_key": "old-secret",
        }
    )
    first = await StorageProfileRouteService(first_settings).materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
    next_settings = Settings(
        storage={
            "provider": "s3",
            "s3_endpoint_url": "https://new-storage.example.com",
            "s3_region": "us-east-1",
            "s3_bucket": "new-assets",
            "s3_access_key_id": "rotated-access",
            "s3_secret_access_key": "rotated-secret",
        }
    )
    second = await StorageProfileRouteService(next_settings).materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
    old_route = await StorageProfileRouteService(next_settings).resolve(
        profile_id=first.profile_id,
        revision_id=first.profile_revision_id,
    )

    assert second.profile_id == first.profile_id
    assert second.profile_revision_id != first.profile_revision_id
    assert await StorageProfileRouteRevision.filter(profile_id=first.profile_id).count() == 2
    assert old_route.binding.route.endpoint_url == "https://old-storage.example.com"
    assert old_route.binding.route.bucket == "old-assets"
    assert old_route.config.access_key_id == "rotated-access"
    assert old_route.config.secret_access_key is not None
    assert old_route.config.secret_access_key.get_secret_value() == "rotated-secret"


async def test_environment_provider_family_change_rejects_old_effect_route_resolution(db_schema) -> None:
    _ = db_schema
    first_settings = Settings(
        storage={
            "provider": "s3",
            "s3_endpoint_url": "https://storage.example.com",
            "s3_region": "us-east-1",
            "s3_bucket": "environment-assets",
            "s3_access_key_id": "old-access",
            "s3_secret_access_key": "old-secret",
        }
    )
    binding = await StorageProfileRouteService(first_settings).materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)

    changed_provider_settings = Settings(storage={"provider": "local"})
    with pytest.raises(StorageProfileRouteInvariantError, match="provider identity"):
        await StorageProfileRouteService(changed_provider_settings).resolve(
            profile_id=binding.profile_id,
            revision_id=binding.profile_revision_id,
        )
    with pytest.raises(StorageProfileRouteInvariantError, match="provider identity"):
        await StorageProfilesService(changed_provider_settings).test_profile(profile_id=binding.profile_id)
    with pytest.raises(StorageProfileRouteInvariantError, match="provider identity"):
        await StorageProfilesService(changed_provider_settings).test_profile_by_key(
            profile_key=ENV_DEFAULT_PROFILE_KEY,
        )
    profile = await StorageProfile.get(id=binding.profile_id)
    revision = await StorageProfileRouteRevision.get(id=binding.profile_revision_id)
    assert profile.provider == ObjectStorageProviderKind.AWS_S3
    assert revision.route == binding.route.model_dump(mode="json")
    assert profile.secret_ref == {}


async def test_existing_database_env_default_collision_fails_closed(db_schema) -> None:
    _ = db_schema
    profile = await StorageProfile.create(
        profile_key=ENV_DEFAULT_PROFILE_KEY,
        provider=ObjectStorageProviderKind.LOCAL.value,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name="Legacy Collision",
        config={},
        secret_ref={"secret_access_key": "must-not-overwrite"},
        is_active=True,
        is_default=False,
    )

    with pytest.raises(StorageProfileRouteInvariantError, match="reserved"):
        await StorageProfileRouteService(get_settings()).materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
    with pytest.raises(StorageProfileRouteInvariantError, match="reserved"):
        await StorageProfilesService(get_settings()).test_profile(profile_id=profile.id)
    with pytest.raises(StorageProfileRouteInvariantError, match="reserved"):
        await StorageProfilesService(get_settings()).test_profile_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
    with pytest.raises(StorageProfileRouteInvariantError, match="reserved"):
        await StorageProfilesService(get_settings()).update_profile(
            profile_id=profile.id,
            payload=StorageProfileUpdateRequest(display_name="Must not overwrite"),
        )
    with pytest.raises(StorageProfileRouteInvariantError, match="reserved"):
        await StorageProfilesService(get_settings()).delete_profile(profile_id=profile.id)
    with pytest.raises(StorageProfileRouteInvariantError, match="reserved"):
        await get_storage_profile_by_key(settings=get_settings(), profile_key=ENV_DEFAULT_PROFILE_KEY)
    await profile.refresh_from_db()
    assert profile.display_name == "Legacy Collision"
    assert profile.config_source == StorageProfileConfigSource.DATABASE
    assert profile.secret_ref == {"secret_access_key": "must-not-overwrite"}
    assert profile.is_active is True
    assert profile.tombstoned_at is None


async def test_admin_partial_updates_preserve_route_and_unsubmitted_config(db_schema) -> None:
    _ = db_schema
    settings = get_settings()
    service = StorageProfilesService(settings)
    profile_key = f"partial-{uuid4().hex}"
    created = await service.create_profile(
        payload=StorageProfileCreateRequest(
            profile_key=profile_key,
            provider=ObjectStorageProviderKind.MINIO,
            display_name="Partial Update",
            config=StorageProfileConfigPayload(
                endpoint_url="https://minio.example.com",
                region="us-east-1",
                bucket="assets",
                public_delivery_mode="direct",
                force_path_style=True,
                access_key_id="access-1",
                secret_access_key="secret-1",
                presign_expires_seconds=1800,
            ),
        ),
    )
    profile = await StorageProfile.get(id=created.id)
    initial_revision = await StorageProfileRouteRevision.get(profile_id=profile.id)

    await service.update_profile(
        profile_id=profile.id,
        payload=StorageProfileUpdateRequest(display_name="Renamed"),
    )
    await service.update_profile(
        profile_id=profile.id,
        payload=StorageProfileUpdateRequest(
            config=StorageProfileConfigPayload(secret_access_key="secret-2"),
        ),
    )
    await service.update_profile(
        profile_id=profile.id,
        payload=StorageProfileUpdateRequest(
            config=StorageProfileConfigPayload(public_delivery_mode="presign"),
        ),
    )

    await profile.refresh_from_db()
    assert profile.display_name == "Renamed"
    assert profile.config["endpoint_url"] == "https://minio.example.com"
    assert profile.config["bucket"] == "assets"
    assert profile.config["force_path_style"] is True
    assert profile.config["presign_expires_seconds"] == 1800
    assert profile.config["public_delivery_mode"] == "presign"
    assert profile.secret_ref == {"secret_access_key": "secret-2"}
    assert await StorageProfileRouteRevision.filter(profile_id=profile.id).count() == 1
    assert (await StorageProfileRouteRevision.get(profile_id=profile.id)).id == initial_revision.id


async def test_admin_boundary_uses_explicit_environment_reserved_and_invalid_codes(db_schema) -> None:
    _ = db_schema
    service = StorageProfilesService(get_settings())
    with pytest.raises(BadRequest) as reserved:
        await service.create_profile(
            payload=StorageProfileCreateRequest(
                profile_key=ENV_DEFAULT_PROFILE_KEY,
                provider=ObjectStorageProviderKind.LOCAL,
                display_name="Reserved",
                config=StorageProfileConfigPayload(),
            ),
        )
    assert reserved.value.error == "STORAGE_PROFILE_KEY_RESERVED"

    invalid_key = f"invalid-{uuid4().hex}"
    with pytest.raises(BadRequest) as invalid:
        await service.create_profile(
            payload=StorageProfileCreateRequest(
                profile_key=invalid_key,
                provider=ObjectStorageProviderKind.MINIO,
                display_name="Invalid",
                config=StorageProfileConfigPayload(bucket="assets"),
            ),
        )
    assert invalid.value.error == "STORAGE_PROFILE_CONFIG_INVALID"
    assert await StorageProfile.filter(profile_key=invalid_key).count() == 0

    binding = await StorageProfileRouteService(get_settings()).materialize_by_key(profile_key=ENV_DEFAULT_PROFILE_KEY)
    with pytest.raises(BadRequest) as update_error:
        await service.update_profile(
            profile_id=binding.profile_id,
            payload=StorageProfileUpdateRequest(display_name="Cannot Rename"),
        )
    assert update_error.value.error == "STORAGE_PROFILE_ENVIRONMENT_MANAGED"
    with pytest.raises(BadRequest) as delete_error:
        await service.delete_profile(profile_id=binding.profile_id)
    assert delete_error.value.error == "STORAGE_PROFILE_ENVIRONMENT_MANAGED"


async def test_tombstone_hides_profile_preserves_key_and_is_idempotent(db_schema) -> None:
    _ = db_schema
    service = StorageProfilesService(get_settings())
    profile_key = f"tombstone-{uuid4().hex}"
    payload = StorageProfileCreateRequest(
        profile_key=profile_key,
        provider=ObjectStorageProviderKind.LOCAL,
        display_name="Tombstone",
        config=StorageProfileConfigPayload(),
    )
    created = await service.create_profile(payload=payload)

    first = await service.delete_profile(profile_id=created.id)
    profile = await StorageProfile.get(id=created.id)
    original_tombstone = profile.tombstoned_at
    second = await service.delete_profile(profile_id=created.id)
    await profile.refresh_from_db()

    assert first == second
    assert profile.tombstoned_at == original_tombstone
    assert profile.tombstoned_at is not None
    assert profile.tombstoned_at.utcoffset() is not None
    assert profile.is_active is False
    assert profile_key not in {item.profile_key for item in (await service.list_profiles()).items}
    with pytest.raises(BadRequest) as replay:
        await service.create_profile(payload=payload)
    assert replay.value.error == "STORAGE_PROFILE_KEY_EXISTS"
