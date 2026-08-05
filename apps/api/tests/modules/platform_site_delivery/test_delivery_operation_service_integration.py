from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.models.hosting.commercial_access import (
    HostingDeliveryOperation,
    HostingDeliveryOperationState,
    HostingDeliveryOperationVerificationState,
)
from src.models.storage.storage_profile import StorageProfile, StorageProfileTestState
from src.modules.platform_site_delivery.operation_repository import HostingDeliveryOperationRepository
from src.modules.platform_site_delivery.schema import PlatformDeliveryOperationRequestIn
from src.modules.platform_site_delivery.service import PlatformSiteDeliveryService
from src.modules.system.storage_profiles.schema import StorageProfileTestResultOut
from src.modules.system.storage_profiles.service import StorageProfilesService


@pytest.mark.usefixtures("db")
async def test_storage_readiness_operation_is_idempotent_revision_bound_and_source_confirmed(monkeypatch) -> None:
    profile = await StorageProfile.create(
        profile_key="hosting-operation-storage",
        provider="local",
        display_name="Hosting operation storage",
    )

    async def test_profile(_service: StorageProfilesService, *, profile_id):
        assert profile_id == profile.id
        await StorageProfileTestState.create(
            profile_key=profile.profile_key,
            last_test_status="passed",
            last_test_message="Connectivity check passed",
            last_tested_at=datetime.now(UTC),
        )
        return StorageProfileTestResultOut(ok=True, status="passed", message="Connectivity check passed")

    monkeypatch.setattr(StorageProfilesService, "test_profile", test_profile)
    service = PlatformSiteDeliveryService(settings=get_settings(), operations=HostingDeliveryOperationRepository())
    actor_user_id = uuid4()
    payload = PlatformDeliveryOperationRequestIn(
        expected_revision=profile.updated_at,
        idempotency_key="hosting-storage-test-operation",
    )

    result = await service.test_storage_readiness(
        profile_id=profile.id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    replay = await service.test_storage_readiness(
        profile_id=profile.id,
        actor_user_id=actor_user_id,
        payload=payload,
    )

    assert result.state is HostingDeliveryOperationState.SOURCE_CONFIRMED
    assert result.verification_state is HostingDeliveryOperationVerificationState.CONFIRMED
    assert result.resulting_state == "passed"
    assert result.evidence["ok"] is True
    assert replay.id == result.id
    assert replay.replayed


@pytest.mark.usefixtures("db")
async def test_storage_readiness_operation_replays_for_the_same_actor_and_records_unknown_source_outcome(
    monkeypatch,
) -> None:
    actor_user_id = uuid4()
    profile = await StorageProfile.create(
        profile_key="hosting-operation-replay",
        provider="local",
        display_name="Hosting operation replay",
    )
    failing_profile = await StorageProfile.create(
        profile_key="hosting-operation-unknown",
        provider="local",
        display_name="Hosting operation unknown",
    )

    async def test_profile(_service: StorageProfilesService, *, profile_id):
        if profile_id == failing_profile.id:
            raise ServiceUnavailable(error="STORAGE_PROVIDER_UNAVAILABLE")
        await StorageProfileTestState.create(
            profile_key=profile.profile_key,
            last_test_status="passed",
            last_test_message="Connectivity check passed",
            last_tested_at=datetime.now(UTC),
        )
        return StorageProfileTestResultOut(ok=True, status="passed", message="Connectivity check passed")

    monkeypatch.setattr(StorageProfilesService, "test_profile", test_profile)
    service = PlatformSiteDeliveryService(settings=get_settings(), operations=HostingDeliveryOperationRepository())
    payload = PlatformDeliveryOperationRequestIn(
        expected_revision=profile.updated_at,
        idempotency_key="hosting-storage-replay-operation",
    )
    completed = await service.test_storage_readiness(
        profile_id=profile.id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    replay = await service.test_storage_readiness(
        profile_id=profile.id,
        actor_user_id=actor_user_id,
        payload=payload,
    )

    assert replay.id == completed.id
    assert replay.replayed

    with pytest.raises(Conflict, match="HOSTING_DELIVERY_REVISION_STALE"):
        await service.test_storage_readiness(
            profile_id=profile.id,
            actor_user_id=actor_user_id,
            payload=PlatformDeliveryOperationRequestIn(
                expected_revision=profile.updated_at,
                idempotency_key="hosting-storage-stale-operation",
            ),
        )

    with pytest.raises(ServiceUnavailable, match="STORAGE_PROVIDER_UNAVAILABLE"):
        await service.test_storage_readiness(
            profile_id=failing_profile.id,
            actor_user_id=actor_user_id,
            payload=PlatformDeliveryOperationRequestIn(
                expected_revision=failing_profile.updated_at,
                idempotency_key="hosting-storage-unknown-operation",
            ),
        )

    unknown = await HostingDeliveryOperation.get(
        actor_user_id=actor_user_id,
        idempotency_key="hosting-storage-unknown-operation",
    )
    assert unknown.state is HostingDeliveryOperationState.OUTCOME_UNKNOWN
    assert unknown.verification_state is HostingDeliveryOperationVerificationState.PENDING
    assert unknown.failure_code == "STORAGE_PROVIDER_UNAVAILABLE"
