from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.core.http.pagination import PageParams
from src.models.analytics.audit_event import AuditEvent
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAuthorityMode,
    JobInternalStatus,
    JobRetryClass,
    JobWorkloadClass,
)
from src.models.operations_signals import (
    OperationalSignalProjection,
    OperationalSignalProjectionSeverity,
    OperationalSignalTriage,
    OperationalSignalTriageAction,
    OperationalSignalTriageHistory,
    OperationalSignalTriageState,
)
from src.models.organization.user import User, UserStatus
from src.models.platform_identity.identity import PlatformInstanceOwnership, PlatformOperator, PlatformOperatorStatus
from src.modules.operational_signals.projection_writer import (
    OperationalSignalProjectionInput,
    OperationalSignalProjectionResolution,
    TortoiseOperationalSignalProjectionWriter,
)
from src.modules.operational_signals.schema import OperationalSignalListQuery, OperationalSignalSourceLifecycle
from src.modules.operational_signals.service import OperationalSignalService
from src.modules.platform_identity.permissions import PlatformPermissionCode

pytestmark = pytest.mark.integration

_ALL_PERMISSIONS = frozenset(permission.value for permission in PlatformPermissionCode)


async def _failed_job() -> BackgroundJobRecord:
    token = uuid4().hex
    now = datetime.now(UTC)
    return await BackgroundJobRecord.create(
        job_type="platform.delivery.reconcile",
        job_type_version=1,
        task_name="platform.delivery.reconcile",
        workload_class=JobWorkloadClass.MAINTENANCE,
        internal_status=JobInternalStatus.FAILED,
        retry_class=JobRetryClass.NONE,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        workspace_id=uuid4(),
        project_id=uuid4(),
        site_id=uuid4(),
        target_descriptor={},
        idempotency_scope_key=f"operations-signal:{token}",
        idempotency_key_hash=token.ljust(64, "0")[:64],
        request_fingerprint=token.rjust(64, "0")[:64],
        correlation_id=f"operations-signal-{token}",
        status_key="jobs:DELIVERY_RECONCILIATION_FAILED",
        attempt_count=3,
        retry_policy={"maxAttempts": 3, "baseDelaySeconds": 1, "maxDelaySeconds": 10},
        lease_seconds=60,
        heartbeat_seconds=10,
        completed_at=now,
        error_code="DELIVERY_PROVIDER_UNAVAILABLE",
        error_message="sensitive provider response",
        error_metadata={"providerPayload": "must not be projected"},
    )


def _job_signal(job: BackgroundJobRecord) -> OperationalSignalProjectionInput:
    detected_at = job.completed_at or job.updated_at
    return OperationalSignalProjectionInput(
        source_domain="jobs",
        signal_type="background_job_failed",
        source_reference_type="background_job",
        source_reference_id=job.id,
        signal_id=job.id,
        severity=OperationalSignalProjectionSeverity.HIGH,
        detected_at=detected_at,
        source_observed_at=job.updated_at,
        priority_rank=300,
        priority_reason_keys=("inbox:BACKGROUND_JOB_FAILED_PRIORITY",),
        title_key="inbox:BACKGROUND_JOB_FAILED_TITLE",
        explanation_key="inbox:BACKGROUND_JOB_FAILED_EXPLANATION",
        impact_key="inbox:BACKGROUND_JOB_FAILED_IMPACT",
        sanitized_evidence={
            "jobType": job.job_type,
            "workloadClass": job.workload_class,
            "attemptCount": job.attempt_count,
            "errorCode": job.error_code,
            "statusKey": job.status_key,
        },
        required_permission=PlatformPermissionCode.JOBS_MANAGE,
        destination_target="operations.jobs",
        affected_scope={
            "workspaceId": str(job.workspace_id),
            "projectId": str(job.project_id),
            "siteId": str(job.site_id),
        },
        workspace_id=job.workspace_id,
        project_id=job.project_id,
        site_id=job.site_id,
        resolution_condition_key="inbox:BACKGROUND_JOB_RESOLUTION_CONDITION",
        policy_id="jobs.background_job_failed",
        policy_revision=1,
    )


@pytest.mark.asyncio
async def test_projection_triage_reminder_return_and_source_resolution(prepared_db) -> None:
    _ = prepared_db
    owner = await User.create(username=f"operations-owner-{uuid4().hex}", status=UserStatus.ACTIVE)
    operator = await User.create(username=f"operations-operator-{uuid4().hex}", status=UserStatus.ACTIVE)
    inactive = await User.create(username=f"operations-inactive-{uuid4().hex}", status=UserStatus.DISABLED)
    await PlatformInstanceOwnership.create(owner_user_id=owner.id)
    operator_record = await PlatformOperator.create(
        user_id=operator.id,
        status=PlatformOperatorStatus.ACTIVE,
        activated_at=datetime.now(UTC),
    )
    await PlatformOperator.create(user_id=inactive.id, status=PlatformOperatorStatus.DEACTIVATED)
    job = await _failed_job()
    service = OperationalSignalService(get_settings())
    writer = TortoiseOperationalSignalProjectionWriter()
    signal_id = await writer.upsert(signal=_job_signal(job))
    assert signal_id == job.id
    assert await writer.upsert(signal=_job_signal(job)) == signal_id
    assert await OperationalSignalProjection.filter(id=signal_id).count() == 1
    stale_observed_at = job.updated_at - timedelta(seconds=1)
    assert (
        await writer.resolve(
            signal=OperationalSignalProjectionResolution(
                source_domain="jobs",
                signal_type="background_job_failed",
                source_reference_type="background_job",
                source_reference_id=job.id,
                resolved_at=stale_observed_at,
                source_observed_at=stale_observed_at,
            )
        )
        == signal_id
    )
    assert (await OperationalSignalProjection.get(id=signal_id)).source_lifecycle.value == "unresolved"

    page = await service.list_signals(
        filters=OperationalSignalListQuery(),
        params=PageParams(),
        permission_codes=_ALL_PERMISSIONS,
    )
    assert page.total == 1
    projected = page.items[0]
    assert projected.id == signal_id
    assert projected.source_reference.type == "background_job"
    assert projected.source_reference.id == signal_id
    assert projected.source_lifecycle == OperationalSignalSourceLifecycle.UNRESOLVED
    assert projected.required_permission == PlatformPermissionCode.JOBS_MANAGE
    assert projected.copy_keys.title_key == "inbox:BACKGROUND_JOB_FAILED_TITLE"
    assert projected.priority.reason_keys == ("inbox:BACKGROUND_JOB_FAILED_PRIORITY",)
    assert projected.destination.route_target == "operations.jobs"
    assert projected.destination.authorized is True
    assert projected.resolution_condition_key == "inbox:BACKGROUND_JOB_RESOLUTION_CONDITION"
    assert projected.policy_id == "jobs.background_job_failed"
    assert projected.policy_revision == 1
    assert "copy" in projected.model_dump(mode="json", by_alias=True)
    assert "copyKeys" not in projected.model_dump(mode="json", by_alias=True)
    assert projected.triage.revision == 0
    assert projected.triage.state == OperationalSignalTriageState.UNCLAIMED
    assert projected.allowed_triage_actions == (
        OperationalSignalTriageAction.CLAIM,
        OperationalSignalTriageAction.ASSIGN,
        OperationalSignalTriageAction.REMIND_LATER,
        OperationalSignalTriageAction.NOTE_ADDED,
    )
    assert projected.evidence.summary["errorCode"] == "DELIVERY_PROVIDER_UNAVAILABLE"
    assert "sensitive" not in projected.model_dump_json()
    assert "providerPayload" not in projected.model_dump_json()

    eligible_assignees = await service.list_eligible_assignees()
    assert {assignee.user_id for assignee in eligible_assignees} == {owner.id, operator.id}

    claimed = await service.claim(
        signal_id=signal_id,
        actor_user_id=owner.id,
        expected_revision=0,
        permission_codes=_ALL_PERMISSIONS,
    )
    assert claimed.id == signal_id
    assert claimed.triage.revision == 1
    assert claimed.triage.assignee_user_id == owner.id
    with pytest.raises(Conflict, match="OPERATIONAL_SIGNAL_TRIAGE_REVISION_CONFLICT"):
        await service.assign(
            signal_id=signal_id,
            actor_user_id=owner.id,
            assignee_user_id=operator.id,
            expected_revision=0,
            permission_codes=_ALL_PERMISSIONS,
        )
    with pytest.raises(Conflict, match="OPERATIONAL_SIGNAL_ASSIGNEE_INELIGIBLE"):
        await service.assign(
            signal_id=signal_id,
            actor_user_id=owner.id,
            assignee_user_id=inactive.id,
            expected_revision=1,
            permission_codes=_ALL_PERMISSIONS,
        )

    assigned = await service.assign(
        signal_id=signal_id,
        actor_user_id=owner.id,
        assignee_user_id=operator.id,
        expected_revision=1,
        permission_codes=_ALL_PERMISSIONS,
    )
    assert assigned.triage.revision == 2
    in_progress = await service.mark_in_progress(
        signal_id=signal_id,
        actor_user_id=operator.id,
        expected_revision=2,
        permission_codes=_ALL_PERMISSIONS,
    )
    assert in_progress.triage.state == OperationalSignalTriageState.IN_PROGRESS
    assert in_progress.triage.revision == 3

    noted = await service.add_note(
        signal_id=signal_id,
        actor_user_id=operator.id,
        expected_revision=3,
        body="Wait for the provider recovery window",
        permission_codes=_ALL_PERMISSIONS,
    )
    assert noted.triage.revision == 4
    assert noted.notes[0].body == "Wait for the provider recovery window"
    assert noted.notes[0].actor_user_id == operator.id

    reminded = await service.remind_later(
        signal_id=signal_id,
        actor_user_id=operator.id,
        expected_revision=4,
        reminder_at=datetime.now(UTC) + timedelta(hours=1),
        reason="Wait for the provider recovery window",
        permission_codes=_ALL_PERMISSIONS,
    )
    assert reminded.triage.state == OperationalSignalTriageState.WAITING
    default_page = await service.list_signals(
        filters=OperationalSignalListQuery(),
        params=PageParams(),
        permission_codes=_ALL_PERMISSIONS,
    )
    reminded_page = await service.list_signals(
        filters=OperationalSignalListQuery(include_reminded=True),
        params=PageParams(),
        permission_codes=_ALL_PERMISSIONS,
    )
    assert default_page.total == 0
    assert reminded_page.total == 1

    triage = await OperationalSignalTriage.get(projection_id=signal_id)
    triage.reminder_at = datetime.now(UTC) - timedelta(seconds=1)
    await triage.save(update_fields=["reminder_at"])
    returned = await service.get_signal(signal_id=signal_id, permission_codes=_ALL_PERMISSIONS)
    assert returned.id == signal_id
    assert returned.triage.state == OperationalSignalTriageState.UNCLAIMED
    assert returned.triage.revision == 6
    assert returned.triage.reminder_at is None
    history = await OperationalSignalTriageHistory.filter(triage_id=triage.id).order_by("revision")
    assert [row.action for row in history] == [
        OperationalSignalTriageAction.CLAIM,
        OperationalSignalTriageAction.TRANSFER,
        OperationalSignalTriageAction.IN_PROGRESS,
        OperationalSignalTriageAction.NOTE_ADDED,
        OperationalSignalTriageAction.REMIND_LATER,
        OperationalSignalTriageAction.REMINDER_RETURNED,
    ]
    assert history[-1].reminder_reason == "Wait for the provider recovery window"
    reminder_audit = await AuditEvent.get(event_name="platform.operational_signal.reminder_returned")
    assert reminder_audit.actor_user_id is None
    assert "reason" not in (reminder_audit.properties or {})
    note_audit = await AuditEvent.get(event_name="platform.operational_signal.note_added")
    assert "body" not in (note_audit.properties or {})

    resolved_at = datetime.now(UTC)
    assert (
        await writer.resolve(
            signal=OperationalSignalProjectionResolution(
                source_domain="jobs",
                signal_type="background_job_failed",
                source_reference_type="background_job",
                source_reference_id=job.id,
                resolved_at=resolved_at,
                source_observed_at=resolved_at,
            )
        )
        == signal_id
    )
    assert (
        await writer.resolve(
            signal=OperationalSignalProjectionResolution(
                source_domain="jobs",
                signal_type="background_job_failed",
                source_reference_type="background_job",
                source_reference_id=job.id,
                resolved_at=resolved_at,
                source_observed_at=resolved_at,
            )
        )
        == signal_id
    )
    resolved = await service.get_signal(signal_id=signal_id, permission_codes=_ALL_PERMISSIONS)
    assert resolved.source_lifecycle == OperationalSignalSourceLifecycle.RESOLVED
    assert resolved.triage.state == OperationalSignalTriageState.SOURCE_RECOVERED
    assert resolved.resolved_at is not None
    assert resolved.triage.assignee_user_id == operator.id
    assert resolved.allowed_triage_actions == ()
    assert await writer.upsert(signal=_job_signal(job)) == signal_id
    assert (await OperationalSignalProjection.get(id=signal_id)).source_lifecycle.value == "resolved"
    resolved_page = await service.list_signals(
        filters=OperationalSignalListQuery(source_lifecycle=OperationalSignalSourceLifecycle.RESOLVED),
        params=PageParams(),
        permission_codes=_ALL_PERMISSIONS,
    )
    assert resolved_page.total == 1
    assert resolved_page.items[0].id == signal_id
    recovered_coordination_page = await service.list_signals(
        filters=OperationalSignalListQuery(
            source_lifecycle=OperationalSignalSourceLifecycle.ALL,
            coordination_state=OperationalSignalTriageState.SOURCE_RECOVERED,
        ),
        params=PageParams(),
        permission_codes=_ALL_PERMISSIONS,
    )
    assert recovered_coordination_page.total == 1
    assert recovered_coordination_page.items[0].triage.state == OperationalSignalTriageState.SOURCE_RECOVERED
    unclaimed_all_page = await service.list_signals(
        filters=OperationalSignalListQuery(
            source_lifecycle=OperationalSignalSourceLifecycle.ALL,
            coordination_state=OperationalSignalTriageState.UNCLAIMED,
        ),
        params=PageParams(),
        permission_codes=_ALL_PERMISSIONS,
    )
    assert unclaimed_all_page.total == 0
    with pytest.raises(Conflict, match="OPERATIONAL_SIGNAL_SOURCE_RESOLVED"):
        await service.mark_needs_attention(
            signal_id=signal_id,
            actor_user_id=operator.id,
            expected_revision=6,
            permission_codes=_ALL_PERMISSIONS,
        )

    operator_after = await PlatformOperator.get(id=operator_record.id)
    assert operator_after.status == PlatformOperatorStatus.ACTIVE
    assert operator_after.revision == operator_record.revision

    unassigned_job = await _failed_job()
    unassigned_signal_id = await writer.upsert(signal=_job_signal(unassigned_job))
    unassigned_reminder = await service.remind_later(
        signal_id=unassigned_signal_id,
        actor_user_id=owner.id,
        expected_revision=0,
        reminder_at=datetime.now(UTC) + timedelta(hours=1),
        reason="Keep this reminder while another operator claims the work",
        permission_codes=_ALL_PERMISSIONS,
    )
    claimed_reminder = await service.claim(
        signal_id=unassigned_signal_id,
        actor_user_id=owner.id,
        expected_revision=unassigned_reminder.triage.revision,
        permission_codes=_ALL_PERMISSIONS,
    )
    assert claimed_reminder.triage.state == OperationalSignalTriageState.WAITING
    assert claimed_reminder.triage.reminder_at == unassigned_reminder.triage.reminder_at
    assert claimed_reminder.triage.reminder_reason == unassigned_reminder.triage.reminder_reason
