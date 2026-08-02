from __future__ import annotations

from datetime import datetime
from math import ceil
from typing import Literal
from uuid import UUID

from tortoise import connections
from tortoise.expressions import Q

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import APIError, BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.content._enums import PublishJobStatus
from src.models.content.publish_job import PublishJobRecord
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityTarget,
    HostingDeliveryOperation,
    HostingDeliveryOperationAction,
    HostingDeliveryOperationState,
    HostingDeliveryOperationTargetType,
    HostingDeliveryOperationVerificationState,
)
from src.models.storage.storage_profile import StorageProfile, StorageProfileTestState
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.domains.service import DomainBindingService
from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer
from src.modules.platform_site_delivery.operation_presentation import present_delivery_operation
from src.modules.platform_site_delivery.operation_repository import HostingDeliveryOperationRepository
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryDomainOut,
    PlatformDeliveryDomainPage,
    PlatformDeliveryIssueListQuery,
    PlatformDeliveryIssueOut,
    PlatformDeliveryIssuePage,
    PlatformDeliveryOperationOut,
    PlatformDeliveryOperationRequestIn,
    PlatformDeliveryRuleOut,
    PlatformDeliveryRulePage,
    PlatformDeliveryStorageOut,
    PlatformDeliveryStoragePage,
)
from src.modules.projects.publish.jobs.service import PublishJobService
from src.modules.sites.delivery.hosting import SitesHostingDeliveryAdapter
from src.modules.system.storage_profiles.service import StorageProfilesService
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

_HostingIssueAction = Literal[
    HostingDeliveryOperationAction.RETRY,
    HostingDeliveryOperationAction.RECONCILE,
    HostingDeliveryOperationAction.RESTORE,
]


class PlatformSiteDeliveryService(BaseService):
    """Expose delivery facts and source-confirmed Hosting recovery operations."""

    def __init__(
        self,
        *,
        settings: Settings,
        operations: HostingDeliveryOperationRepository,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._operations = operations

    async def list_issues(
        self,
        *,
        params: PageParams,
        query: PlatformDeliveryIssueListQuery,
    ) -> PlatformDeliveryIssuePage:
        source_sql = _issue_source_sql(query.kind)
        if source_sql is None:
            return _page(items=(), total=0, params=params)
        connection = connections.get("default")
        count_rows = await connection.execute_query_dict(f"SELECT COUNT(*) AS total FROM ({source_sql}) issues")
        total = int(count_rows[0]["total"]) if count_rows else 0
        rows = await connection.execute_query_dict(
            "SELECT * FROM ("
            f"{source_sql}"
            ") issues "
            "ORDER BY occurred_at DESC, id DESC "
            "LIMIT $1 OFFSET $2",
            [params.limit, params.offset],
        )
        items = tuple(
            PlatformDeliveryIssueOut(
                id=row["id"],
                kind=str(row["kind"]),
                workspace_id=row["workspace_id"],
                project_id=row.get("project_id"),
                site_id=row.get("site_id"),
                state=str(row["state"]),
                visitor_effect=str(row["visitor_effect"]),
                summary_key=str(row["summary_key"]),
                retryable=bool(row["retryable"]),
                occurred_at=row["occurred_at"],
                correlation_id=row.get("correlation_id"),
            )
            for row in rows
        )
        return _page(items=items, total=total, params=params)

    async def list_domains(self, *, params: PageParams) -> PlatformDeliveryDomainPage:
        query = DomainBindingRecord.filter(is_active=True).filter(Q(is_verified=False) | Q(certificate_status="error"))
        total = int(await query.count())
        rows = await query.order_by("-updated_at", "-id").offset(params.offset).limit(params.limit)
        items = tuple(
            PlatformDeliveryDomainOut(
                id=row.id,
                workspace_id=row.workspace_id,
                project_id=row.project_id,
                site_id=row.site_id,
                hostname=row.hostname,
                source=str(row.source),
                is_verified=row.is_verified,
                is_active=row.is_active,
                certificate_status=str(row.certificate_status),
                readiness="certificate_error" if str(row.certificate_status) == "error" else "verification_required",
                updated_at=row.updated_at,
            )
            for row in rows
        )
        return _page(items=items, total=total, params=params)

    async def list_storage(self, *, params: PageParams) -> PlatformDeliveryStoragePage:
        query = (
            StorageProfile.filter(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                tombstoned_at=None,
            )
            .order_by("-updated_at", "-id")
        )
        total = int(await query.count())
        profiles = await query.offset(params.offset).limit(params.limit)
        test_states = (
            await StorageProfileTestState.filter(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                profile_key__in=[profile.profile_key for profile in profiles],
            )
            if profiles
            else []
        )
        states_by_key = {state.profile_key: state for state in test_states}
        items = tuple(
            PlatformDeliveryStorageOut(
                id=profile.id,
                profile_key=profile.profile_key,
                display_name=profile.display_name,
                provider=profile.provider,
                is_active=profile.is_active,
                is_default=profile.is_default,
                last_test_status=(
                    states_by_key[profile.profile_key].last_test_status
                    if profile.profile_key in states_by_key
                    else None
                ),
                last_tested_at=(
                    states_by_key[profile.profile_key].last_tested_at
                    if profile.profile_key in states_by_key
                    else None
                ),
            )
            for profile in profiles
        )
        return _page(items=items, total=total, params=params)

    async def list_rules(self, *, params: PageParams) -> PlatformDeliveryRulePage:
        query = HostingCommercialAccessProjection.all().order_by("-updated_at", "-id")
        total = int(await query.count())
        projections = await query.offset(params.offset).limit(params.limit)
        targets = (
            await HostingContinuityTarget.filter(projection_id__in=[projection.id for projection in projections])
            if projections
            else []
        )
        preserved_releases_by_projection: dict[UUID, set[UUID]] = {}
        for target in targets:
            if target.preserved_release_id is None:
                continue
            preserved_releases_by_projection.setdefault(target.projection_id, set()).add(target.preserved_release_id)
        items = tuple(
            PlatformDeliveryRuleOut(
                id=projection.id,
                workspace_id=projection.workspace_id,
                state=projection.state,
                preserved_release_id=(
                    next(iter(preserved_releases_by_projection[projection.id]))
                    if len(preserved_releases_by_projection.get(projection.id, set())) == 1
                    else None
                ),
                preserved_release_count=len(preserved_releases_by_projection.get(projection.id, set())),
                source_identity=projection.source_identity,
                updated_at=projection.updated_at,
            )
            for projection in projections
        )
        return _page(items=items, total=total, params=params)

    async def retry_issue(
        self,
        *,
        issue_id: UUID,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
    ) -> PlatformDeliveryOperationOut:
        job = await PublishJobRecord.get_or_none(id=issue_id)
        if job is not None:
            return await self._retry_publish_job(job=job, actor_user_id=actor_user_id, payload=payload)
        projection = await self._hosting_projection(issue_id=issue_id)
        return await self._run_hosting_issue_operation(
            projection=projection,
            actor_user_id=actor_user_id,
            payload=payload,
            action=HostingDeliveryOperationAction.RETRY,
        )

    async def reconcile_issue(
        self,
        *,
        issue_id: UUID,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
    ) -> PlatformDeliveryOperationOut:
        return await self._run_hosting_issue_operation(
            projection=await self._hosting_projection(issue_id=issue_id),
            actor_user_id=actor_user_id,
            payload=payload,
            action=HostingDeliveryOperationAction.RECONCILE,
        )

    async def restore_issue(
        self,
        *,
        issue_id: UUID,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
    ) -> PlatformDeliveryOperationOut:
        return await self._run_hosting_issue_operation(
            projection=await self._hosting_projection(issue_id=issue_id),
            actor_user_id=actor_user_id,
            payload=payload,
            action=HostingDeliveryOperationAction.RESTORE,
        )

    async def recover_domain_ownership(
        self,
        *,
        binding_id: UUID,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
    ) -> PlatformDeliveryOperationOut:
        binding = await self._domain_binding(binding_id=binding_id)
        replay = await self._operations.find_replay(
            target_type=HostingDeliveryOperationTargetType.DOMAIN_BINDING,
            target_id=binding.id,
            action=HostingDeliveryOperationAction.VERIFY_OWNERSHIP,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=payload.expected_revision,
        )
        if replay is not None:
            replayed_operation, replayed = replay
            return present_delivery_operation(replayed_operation, replayed=replayed)
        self._require_domain_recovery(binding)
        self._require_revision(expected=payload.expected_revision, actual=binding.updated_at)
        operation, replayed = await self._operations.start(
            target_type=HostingDeliveryOperationTargetType.DOMAIN_BINDING,
            target_id=binding.id,
            action=HostingDeliveryOperationAction.VERIFY_OWNERSHIP,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=binding.updated_at,
            before_state=_domain_state(binding),
        )
        if replayed:
            return present_delivery_operation(operation, replayed=True)
        try:
            verified, observed = await DomainBindingService(self._settings).verify_custom_binding(
                project_id=binding.project_id,
                binding_id=binding.id,
            )
        except Exception as exc:
            await self._mark_outcome_unknown(
                operation=operation,
                actor_user_id=actor_user_id,
                workspace_id=binding.workspace_id,
                exc=exc,
            )
            raise
        evidence: JsonObject = {
            "hostname": verified.hostname,
            "is_verified": verified.is_verified,
            "certificate_status": str(verified.certificate_status),
            "observed_txt_values": list(observed),
        }
        return await self._complete_operation(
            operation=operation,
            actor_user_id=actor_user_id,
            workspace_id=verified.workspace_id,
            state=HostingDeliveryOperationState.SOURCE_CONFIRMED,
            verification_state=(
                HostingDeliveryOperationVerificationState.CONFIRMED
                if verified.is_verified
                else HostingDeliveryOperationVerificationState.NOT_CONFIRMED
            ),
            resulting_state=_domain_state(verified),
            source_operation_identity=None,
            result_reference_id=verified.id,
            failed_target_count=0,
            evidence=evidence,
        )

    async def test_storage_readiness(
        self,
        *,
        profile_id: UUID,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
    ) -> PlatformDeliveryOperationOut:
        profile = await self._storage_profile(profile_id=profile_id)
        test_state = await self._storage_test_state(profile=profile)
        replay = await self._operations.find_replay(
            target_type=HostingDeliveryOperationTargetType.STORAGE_PROFILE,
            target_id=profile.id,
            action=HostingDeliveryOperationAction.TEST_READINESS,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=payload.expected_revision,
        )
        if replay is not None:
            replayed_operation, replayed = replay
            return present_delivery_operation(replayed_operation, replayed=replayed)
        if profile.tombstoned_at is not None:
            raise BadRequest(error="STORAGE_PROFILE_TEST_UNAVAILABLE")
        source_revision = _storage_revision(profile=profile, test_state=test_state)
        self._require_revision(expected=payload.expected_revision, actual=source_revision)
        operation, replayed = await self._operations.start(
            target_type=HostingDeliveryOperationTargetType.STORAGE_PROFILE,
            target_id=profile.id,
            action=HostingDeliveryOperationAction.TEST_READINESS,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=source_revision,
            before_state=test_state.last_test_status if test_state is not None else "not_tested",
        )
        if replayed:
            return present_delivery_operation(operation, replayed=True)
        try:
            result = await StorageProfilesService(self._settings).test_profile(profile_id=profile.id)
        except Exception as exc:
            await self._mark_outcome_unknown(operation=operation, actor_user_id=actor_user_id, workspace_id=None, exc=exc)
            raise
        refreshed = await self._storage_profile(profile_id=profile.id)
        refreshed_test_state = await self._storage_test_state(profile=refreshed)
        evidence: JsonObject = {
            "profile_key": refreshed.profile_key,
            "provider": refreshed.provider,
            "status": result.status,
            "ok": result.ok,
            "message": result.message,
            "tested_at": (
                refreshed_test_state.last_tested_at.isoformat() if refreshed_test_state is not None else None
            ),
        }
        return await self._complete_operation(
            operation=operation,
            actor_user_id=actor_user_id,
            workspace_id=None,
            state=HostingDeliveryOperationState.SOURCE_CONFIRMED,
            verification_state=(
                HostingDeliveryOperationVerificationState.CONFIRMED
                if result.ok
                else HostingDeliveryOperationVerificationState.NOT_CONFIRMED
            ),
            resulting_state=result.status,
            source_operation_identity=None,
            result_reference_id=refreshed.id,
            failed_target_count=0,
            evidence=evidence,
        )

    async def _retry_publish_job(
        self,
        *,
        job: PublishJobRecord,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
    ) -> PlatformDeliveryOperationOut:
        replay = await self._operations.find_replay(
            target_type=HostingDeliveryOperationTargetType.PUBLISH_JOB,
            target_id=job.id,
            action=HostingDeliveryOperationAction.RETRY,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=payload.expected_revision,
        )
        if replay is not None:
            replayed_operation, replayed = replay
            return present_delivery_operation(replayed_operation, replayed=replayed)
        if job.status is not PublishJobStatus.FAILED or job.release_id is None:
            raise BadRequest(error="PUBLISH_JOB_RETRY_UNAVAILABLE")
        self._require_revision(expected=payload.expected_revision, actual=job.updated_at)
        operation, replayed = await self._operations.start(
            target_type=HostingDeliveryOperationTargetType.PUBLISH_JOB,
            target_id=job.id,
            action=HostingDeliveryOperationAction.RETRY,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=job.updated_at,
            before_state=str(job.status),
        )
        if replayed:
            return present_delivery_operation(operation, replayed=True)
        try:
            retried = await PublishJobService().retry_publish_job(job_id=job.id)
        except Exception as exc:
            await self._mark_outcome_unknown(
                operation=operation,
                actor_user_id=actor_user_id,
                workspace_id=job.workspace_id,
                exc=exc,
            )
            raise
        succeeded = retried.status is PublishJobStatus.COMPLETED
        evidence: JsonObject = {
            "source_job_id": str(job.id),
            "result_job_id": str(retried.id),
            "result_status": str(retried.status),
            "result_updated_at": retried.updated_at.isoformat(),
            "error_message": retried.error_message,
        }
        return await self._complete_operation(
            operation=operation,
            actor_user_id=actor_user_id,
            workspace_id=job.workspace_id,
            state=HostingDeliveryOperationState.SOURCE_CONFIRMED,
            verification_state=(
                HostingDeliveryOperationVerificationState.CONFIRMED
                if succeeded
                else HostingDeliveryOperationVerificationState.NOT_CONFIRMED
            ),
            resulting_state=str(retried.status),
            source_operation_identity=str(retried.id),
            result_reference_id=retried.id,
            failed_target_count=0 if succeeded else 1,
            evidence=evidence,
        )

    async def _run_hosting_issue_operation(
        self,
        *,
        projection: HostingCommercialAccessProjection,
        actor_user_id: UUID,
        payload: PlatformDeliveryOperationRequestIn,
        action: _HostingIssueAction,
    ) -> PlatformDeliveryOperationOut:
        replay = await self._operations.find_replay(
            target_type=HostingDeliveryOperationTargetType.HOSTING_CONTINUITY,
            target_id=projection.id,
            action=action,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=payload.expected_revision,
        )
        if replay is not None:
            replayed_operation, replayed = replay
            return present_delivery_operation(replayed_operation, replayed=replayed)
        self._require_hosting_action(projection=projection, action=action)
        self._require_revision(expected=payload.expected_revision, actual=projection.updated_at)
        operation, replayed = await self._operations.start(
            target_type=HostingDeliveryOperationTargetType.HOSTING_CONTINUITY,
            target_id=projection.id,
            action=action,
            actor_user_id=actor_user_id,
            idempotency_key=payload.idempotency_key,
            source_revision=projection.updated_at,
            before_state=str(projection.state),
        )
        if replayed:
            return present_delivery_operation(operation, replayed=True)
        try:
            state = await self._execute_hosting_action(projection=projection, action=action)
        except Exception as exc:
            await self._mark_outcome_unknown(
                operation=operation,
                actor_user_id=actor_user_id,
                workspace_id=projection.workspace_id,
                exc=exc,
            )
            raise
        refreshed = await self._hosting_projection(issue_id=projection.id)
        targets = await HostingContinuityTarget.filter(projection_id=refreshed.id).order_by("site_id", "runtime_id")
        failed_target_count = sum(target.failure_code is not None for target in targets)
        operation_state = (
            HostingDeliveryOperationState.PARTIAL
            if state is HostingCommercialAccessState.PARTIAL or failed_target_count > 0
            else HostingDeliveryOperationState.SOURCE_CONFIRMED
        )
        return await self._complete_operation(
            operation=operation,
            actor_user_id=actor_user_id,
            workspace_id=refreshed.workspace_id,
            state=operation_state,
            verification_state=_hosting_verification_state(
                action=action,
                state=state,
                targets=targets,
                failed_target_count=failed_target_count,
            ),
            resulting_state=str(state),
            source_operation_identity=_hosting_source_identity(projection=refreshed, action=action),
            result_reference_id=refreshed.id,
            failed_target_count=failed_target_count,
            evidence=_hosting_operation_evidence(
                projection=refreshed,
                targets=targets,
                resulting_state=state,
            ),
        )

    async def _execute_hosting_action(
        self,
        *,
        projection: HostingCommercialAccessProjection,
        action: _HostingIssueAction,
    ) -> HostingCommercialAccessState:
        consumer = self._consumer()
        if action in {HostingDeliveryOperationAction.RETRY, HostingDeliveryOperationAction.RECONCILE}:
            if projection.state is HostingCommercialAccessState.SUSPENDED:
                return await consumer.suspend_due(workspace_id=projection.workspace_id)
            return await consumer.consume(source_identity=projection.source_identity)
        source_identity = projection.restoration_source_identity
        if source_identity is None:
            raise BadRequest(error="HOSTING_RESTORATION_SOURCE_UNAVAILABLE")
        return await consumer.consume(source_identity=source_identity)

    async def _complete_operation(
        self,
        *,
        operation: HostingDeliveryOperation,
        actor_user_id: UUID,
        workspace_id: UUID | None,
        state: HostingDeliveryOperationState,
        verification_state: HostingDeliveryOperationVerificationState,
        resulting_state: str,
        source_operation_identity: str | None,
        result_reference_id: UUID | None,
        failed_target_count: int,
        evidence: JsonObject,
    ) -> PlatformDeliveryOperationOut:
        completed = await self._operations.complete(
            operation_id=operation.id,
            state=state,
            verification_state=verification_state,
            resulting_state=resulting_state,
            source_operation_identity=source_operation_identity,
            result_reference_id=result_reference_id,
            failed_target_count=failed_target_count,
            evidence=evidence,
        )
        await self._write_operation_audit(
            operation=completed,
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
        )
        return present_delivery_operation(completed)

    async def _mark_outcome_unknown(
        self,
        *,
        operation: HostingDeliveryOperation,
        actor_user_id: UUID,
        workspace_id: UUID | None,
        exc: Exception,
    ) -> None:
        failure_code = _failure_code(exc)
        unknown = await self._operations.mark_outcome_unknown(
            operation_id=operation.id,
            failure_code=failure_code,
            failure_message=str(exc)[:512],
            evidence={
                "outcome": "unknown",
                "source_error_code": failure_code,
                "source_error_type": type(exc).__name__,
            },
        )
        await self._write_operation_audit(
            operation=unknown,
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
        )

    async def _write_operation_audit(
        self,
        *,
        operation: HostingDeliveryOperation,
        actor_user_id: UUID,
        workspace_id: UUID | None,
    ) -> None:
        await write_required_activity_event(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name=f"platform.hosting.delivery_operation.{operation.action}.{operation.state}",
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                entity_type=str(operation.target_type),
                entity_id=operation.target_id,
                source="platform",
                properties={
                    "operation_id": str(operation.id),
                    "target_type": str(operation.target_type),
                    "target_id": str(operation.target_id),
                    "action": str(operation.action),
                    "before_state": operation.before_state,
                    "resulting_state": operation.resulting_state,
                    "operation_state": str(operation.state),
                    "verification_state": str(operation.verification_state),
                    "failed_target_count": operation.failed_target_count,
                    "source_operation_identity": operation.source_operation_identity,
                    "evidence": operation.evidence,
                },
            ),
        )

    def _consumer(self) -> HostingCommercialAccessConsumer:
        return HostingCommercialAccessConsumer(delivery=SitesHostingDeliveryAdapter(settings=self._settings))

    @staticmethod
    async def _hosting_projection(*, issue_id: UUID) -> HostingCommercialAccessProjection:
        projection = await HostingCommercialAccessProjection.get_or_none(id=issue_id)
        if projection is None:
            raise NotFound(error="HOSTING_DELIVERY_ISSUE_NOT_FOUND")
        return projection

    @staticmethod
    async def _domain_binding(*, binding_id: UUID) -> DomainBindingRecord:
        binding = await DomainBindingRecord.get_or_none(id=binding_id)
        if binding is None:
            raise NotFound(error="DOMAIN_BINDING_NOT_FOUND")
        return binding

    @staticmethod
    async def _storage_profile(*, profile_id: UUID) -> StorageProfile:
        profile = await StorageProfile.get_or_none(
            id=profile_id,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        if profile is None:
            raise NotFound(error="STORAGE_PROFILE_NOT_FOUND")
        return profile

    @staticmethod
    async def _storage_test_state(*, profile: StorageProfile) -> StorageProfileTestState | None:
        return await StorageProfileTestState.get_or_none(
            scope_type=profile.scope_type,
            scope_id=profile.scope_id,
            profile_key=profile.profile_key,
        )

    @staticmethod
    def _require_revision(*, expected: datetime, actual: datetime) -> None:
        if expected != actual:
            raise Conflict(
                error="HOSTING_DELIVERY_REVISION_STALE",
                meta={"expectedRevision": expected.isoformat(), "currentRevision": actual.isoformat()},
            )

    @staticmethod
    def _require_domain_recovery(binding: DomainBindingRecord) -> None:
        if binding.source != DomainBindingSource.CUSTOM or not binding.is_active or binding.is_verified:
            raise BadRequest(error="DOMAIN_CERTIFICATE_RECOVERY_UNAVAILABLE")

    @staticmethod
    def _require_hosting_action(
        *,
        projection: HostingCommercialAccessProjection,
        action: _HostingIssueAction,
    ) -> None:
        recoverable_states = {
            HostingCommercialAccessState.CONTINUITY_REQUIRED,
            HostingCommercialAccessState.SUSPENDED,
            HostingCommercialAccessState.PARTIAL,
            HostingCommercialAccessState.RESTORATION_REQUIRED,
        }
        if action in {HostingDeliveryOperationAction.RETRY, HostingDeliveryOperationAction.RECONCILE}:
            if projection.state not in recoverable_states:
                raise BadRequest(error="HOSTING_DELIVERY_ACTION_UNAVAILABLE")
            return
        if (
            projection.state is not HostingCommercialAccessState.RESTORATION_REQUIRED
            or projection.restoration_source_identity is None
        ):
            raise BadRequest(error="HOSTING_RESTORATION_UNAVAILABLE")


def _domain_state(binding: DomainBindingRecord) -> str:
    if binding.is_verified:
        return "verified"
    if str(binding.certificate_status) == "error":
        return "certificate_error"
    return "verification_required"


def _failure_code(exc: Exception) -> str:
    if isinstance(exc, APIError) and exc.error is not None:
        return exc.error
    return "HOSTING_DELIVERY_SOURCE_OUTCOME_UNKNOWN"


def _hosting_source_identity(
    *,
    projection: HostingCommercialAccessProjection,
    action: _HostingIssueAction,
) -> str:
    if action is HostingDeliveryOperationAction.RESTORE and projection.restoration_source_identity is not None:
        return projection.restoration_source_identity
    return projection.source_identity


def _hosting_verification_state(
    *,
    action: _HostingIssueAction,
    state: HostingCommercialAccessState,
    targets: list[HostingContinuityTarget],
    failed_target_count: int,
) -> HostingDeliveryOperationVerificationState:
    if failed_target_count > 0 or state is HostingCommercialAccessState.PARTIAL:
        return HostingDeliveryOperationVerificationState.NOT_CONFIRMED
    if action is HostingDeliveryOperationAction.RESTORE:
        all_verified = bool(targets) and all(target.verified_at is not None for target in targets)
        return (
            HostingDeliveryOperationVerificationState.CONFIRMED
            if state is HostingCommercialAccessState.RESTORED and all_verified
            else HostingDeliveryOperationVerificationState.NOT_CONFIRMED
        )
    return HostingDeliveryOperationVerificationState.CONFIRMED


def _hosting_operation_evidence(
    *,
    projection: HostingCommercialAccessProjection,
    targets: list[HostingContinuityTarget],
    resulting_state: HostingCommercialAccessState,
) -> JsonObject:
    return {
        "source_identity": projection.source_identity,
        "resulting_state": str(resulting_state),
        "targets": [
            {
                "site_id": str(target.site_id),
                "runtime_id": str(target.runtime_id),
                "gate": str(target.gate),
                "restoration_state": str(target.restoration_state),
                "source_operation_identity": target.operation_identity,
                "verified_at": target.verified_at.isoformat() if target.verified_at is not None else None,
                "failure_code": target.failure_code,
            }
            for target in targets
        ],
    }


def _storage_revision(*, profile: StorageProfile, test_state: StorageProfileTestState | None) -> datetime:
    if test_state is None or profile.updated_at >= test_state.updated_at:
        return profile.updated_at
    return test_state.updated_at


def _issue_source_sql(kind: str | None) -> str | None:
    publish_jobs = """
        SELECT
            id,
            'publish_job'::text AS kind,
            workspace_id,
            project_id,
            site_id,
            status::text AS state,
            'site_unavailable'::text AS visitor_effect,
            'siteDelivery:PUBLISH_FAILED'::text AS summary_key,
            (release_id IS NOT NULL) AS retryable,
            updated_at AS occurred_at,
            NULL::text AS correlation_id
        FROM publish_jobs
        WHERE status = 'failed'
    """
    continuity = """
        SELECT
            id,
            'hosting_continuity'::text AS kind,
            workspace_id,
            NULL::uuid AS project_id,
            NULL::uuid AS site_id,
            state::text AS state,
            CASE
                WHEN state IN ('suspended', 'partial') THEN 'site_unavailable'
                ELSE 'delivery_recovery_pending'
            END AS visitor_effect,
            'siteDelivery:HOSTING_CONTINUITY_RECOVERY_REQUIRED'::text AS summary_key,
            TRUE AS retryable,
            updated_at AS occurred_at,
            source_identity AS correlation_id
        FROM hosting_commercial_access_projections
        WHERE state NOT IN ('serving', 'restored')
    """
    if kind is None:
        return f"{publish_jobs} UNION ALL {continuity}"
    if kind == "publish_job":
        return publish_jobs
    if kind == "hosting_continuity":
        return continuity
    return None


def _page[T](
    *,
    items: tuple[T, ...],
    total: int,
    params: PageParams,
) -> PageData[T]:
    pages = ceil(total / params.size) if total else 0
    return PageData(
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=params.page + 1 if params.page < pages else None,
        prev=min(params.page - 1, pages) if params.page > 1 and pages else None,
    )
