from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.http.pagination import PageParams
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityTarget,
    HostingDeliveryOperationAction,
    HostingDeliveryOperationState,
    HostingDeliveryOperationTargetType,
    HostingDeliveryOperationVerificationState,
)
from src.models.storage.storage_profile import StorageProfile, StorageProfileTestState
from src.modules.platform_site_delivery.dossier_service import PlatformSiteDeliveryDossierService
from src.modules.platform_site_delivery.operation_repository import HostingDeliveryOperationRepository
from src.modules.platform_site_delivery.schema import PlatformDeliveryIssueListQuery
from src.modules.platform_site_delivery.service import PlatformSiteDeliveryService


@pytest.mark.usefixtures("db")
async def test_hosting_issue_dossier_remains_addressable_after_source_recovery() -> None:
    operations = HostingDeliveryOperationRepository()
    projection = await HostingCommercialAccessProjection.create(
        workspace_id=uuid4(),
        state=HostingCommercialAccessState.PARTIAL,
        source_identity=f"hosting:dossier-{uuid4()}",
    )
    await HostingContinuityTarget.create(
        projection_id=projection.id,
        site_id=uuid4(),
        runtime_id=uuid4(),
    )
    service = PlatformSiteDeliveryService(settings=get_settings(), operations=operations)

    issues = await service.list_issues(
        params=PageParams(page=1, size=20),
        query=PlatformDeliveryIssueListQuery(kind="hosting_continuity"),
    )

    assert [issue.id for issue in issues.items] == [projection.id]

    projection.state = HostingCommercialAccessState.RESTORED
    await projection.save()
    dossier = await PlatformSiteDeliveryDossierService(
        settings=get_settings(),
        operations=operations,
    ).get_issue(issue_id=projection.id)

    retry = next(
        action
        for action in dossier.actions
        if action.action is HostingDeliveryOperationAction.RETRY
    )
    assert dossier.state == HostingCommercialAccessState.RESTORED
    assert not dossier.retryable
    assert not retry.available
    assert dossier.evidence[0].status == HostingCommercialAccessState.RESTORED


@pytest.mark.usefixtures("db")
async def test_storage_dossier_uses_persisted_test_state_and_exposes_operation_history() -> None:
    operations = HostingDeliveryOperationRepository()
    profile = await StorageProfile.create(
        profile_key=f"dossier-storage-{uuid4().hex}",
        provider="local",
        display_name="Dossier storage",
        last_test_status="passed",
        last_tested_at=datetime.now(UTC),
    )
    test_state = await StorageProfileTestState.create(
        profile_key=profile.profile_key,
        last_test_status="failed",
        last_test_message="Connection was refused",
        last_tested_at=datetime.now(UTC),
    )
    operation, replayed = await operations.start(
        target_type=HostingDeliveryOperationTargetType.STORAGE_PROFILE,
        target_id=profile.id,
        action=HostingDeliveryOperationAction.TEST_READINESS,
        actor_user_id=uuid4(),
        idempotency_key=f"dossier-storage-operation-{uuid4().hex}",
        source_revision=test_state.updated_at,
        before_state="not_tested",
    )
    assert not replayed
    completed = await operations.complete(
        operation_id=operation.id,
        state=HostingDeliveryOperationState.SOURCE_CONFIRMED,
        verification_state=HostingDeliveryOperationVerificationState.NOT_CONFIRMED,
        resulting_state="failed",
        source_operation_identity=None,
        result_reference_id=profile.id,
        failed_target_count=0,
        evidence={"status": "failed"},
    )
    service = PlatformSiteDeliveryDossierService(settings=get_settings(), operations=operations)

    dossier = await service.get_storage(profile_id=profile.id)
    history = await service.list_operations(
        target_type=HostingDeliveryOperationTargetType.STORAGE_PROFILE,
        target_id=profile.id,
        params=PageParams(page=1, size=20),
    )

    assert dossier.readiness == "failed"
    assert dossier.last_test_status == "failed"
    assert dossier.evidence[0].details == {"message": "Connection was refused"}
    assert [record.id for record in dossier.operations] == [completed.id]
    assert [record.id for record in history.items] == [completed.id]
    assert history.total == 1
