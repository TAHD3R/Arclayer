from __future__ import annotations

from datetime import datetime
from math import ceil
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.content._enums import PublishJobStatus
from src.models.content.publish_job import PublishJobRecord
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityTarget,
    HostingDeliveryOperationAction,
    HostingDeliveryOperationTargetType,
)
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import StorageProfile, StorageProfileRouteRevision, StorageProfileTestState
from src.modules.platform_site_delivery.operation_presentation import present_delivery_operation
from src.modules.platform_site_delivery.operation_repository import HostingDeliveryOperationRepository
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryActionAvailabilityOut,
    PlatformDeliveryDependencyOut,
    PlatformDeliveryDomainDossierOut,
    PlatformDeliveryEvidenceOut,
    PlatformDeliveryIssueDossierOut,
    PlatformDeliveryOperationOut,
    PlatformDeliveryOperationPage,
    PlatformDeliveryScopeOut,
    PlatformDeliveryStorageDossierOut,
)
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

_DOSSIER_OPERATION_LIMIT = 20


class PlatformSiteDeliveryDossierService(BaseService):
    """Read stable Hosting dossiers from source records and durable command evidence."""

    def __init__(
        self,
        *,
        settings: Settings,
        operations: HostingDeliveryOperationRepository,
    ) -> None:
        super().__init__(settings)
        self._operations = operations

    async def get_issue(self, *, issue_id: UUID) -> PlatformDeliveryIssueDossierOut:
        publish_job = await PublishJobRecord.get_or_none(id=issue_id)
        if publish_job is not None:
            return await self._publish_job_dossier(publish_job)
        projection = await HostingCommercialAccessProjection.get_or_none(id=issue_id)
        if projection is not None:
            return await self._hosting_continuity_dossier(projection)
        raise NotFound(error="HOSTING_DELIVERY_ISSUE_NOT_FOUND")

    async def get_domain(self, *, binding_id: UUID) -> PlatformDeliveryDomainDossierOut:
        binding = await DomainBindingRecord.get_or_none(id=binding_id)
        if binding is None:
            raise NotFound(error="DOMAIN_BINDING_NOT_FOUND")
        actions = (
            PlatformDeliveryActionAvailabilityOut(
                action=HostingDeliveryOperationAction.VERIFY_OWNERSHIP,
                available=(
                    binding.source == DomainBindingSource.CUSTOM and binding.is_active and not binding.is_verified
                ),
                reason_code=_domain_action_reason(binding),
            ),
        )
        evidence = (
            PlatformDeliveryEvidenceOut(
                code="domain_ownership",
                status="verified" if binding.is_verified else "verification_required",
                observed_at=binding.verified_at or binding.updated_at,
                subject_id=binding.id,
                details={"source": str(binding.source)},
            ),
            PlatformDeliveryEvidenceOut(
                code="certificate",
                status=str(binding.certificate_status),
                observed_at=binding.updated_at,
                subject_id=binding.id,
            ),
        )
        dependencies = tuple(
            dependency
            for dependency in (
                _dependency("workspace", "workspace", binding.workspace_id),
                _dependency("project", "project", binding.project_id),
                _dependency("site", "site", binding.site_id),
                _dependency("runtime", "runtime", binding.runtime_id),
            )
            if dependency is not None
        )
        return PlatformDeliveryDomainDossierOut(
            id=binding.id,
            hostname=binding.hostname,
            revision=binding.updated_at,
            source=str(binding.source),
            is_verified=binding.is_verified,
            is_active=binding.is_active,
            certificate_status=str(binding.certificate_status),
            readiness=_domain_readiness(binding),
            scope=PlatformDeliveryScopeOut(
                workspace_id=binding.workspace_id,
                project_id=binding.project_id,
                site_id=binding.site_id,
                runtime_id=binding.runtime_id,
            ),
            dependencies=dependencies,
            evidence=evidence,
            actions=actions,
            operations=await self._operations_for(
                target_type=HostingDeliveryOperationTargetType.DOMAIN_BINDING,
                target_id=binding.id,
            ),
        )

    async def get_storage(self, *, profile_id: UUID) -> PlatformDeliveryStorageDossierOut:
        profile = await StorageProfile.get_or_none(
            id=profile_id,
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
        )
        if profile is None:
            raise NotFound(error="STORAGE_PROFILE_NOT_FOUND")
        test_state = await _storage_test_state(profile)
        revisions = await StorageProfileRouteRevision.filter(profile_id=profile.id).order_by("-revision_number", "-id")
        active_effect_count = await ProviderEffectRecord.filter(
            profile_id=profile.id,
            disposition=ProviderEffectDisposition.ACTIVE,
        ).count()
        evidence = (
            PlatformDeliveryEvidenceOut(
                code="storage_connection",
                status=test_state.last_test_status if test_state is not None else "not_tested",
                observed_at=test_state.last_tested_at if test_state is not None else None,
                subject_id=profile.id,
                details={"message": test_state.last_test_message} if test_state is not None else {},
            ),
            PlatformDeliveryEvidenceOut(
                code="storage_profile",
                status=_storage_readiness(profile, test_state),
                observed_at=profile.tombstoned_at or profile.updated_at,
                subject_id=profile.id,
                details={
                    "config_source": str(profile.config_source),
                    "active_effect_count": active_effect_count,
                },
            ),
        )
        dependencies = tuple(
            dependency
            for revision in revisions
            if (
                dependency := _dependency(
                    "route_revision",
                    "storage_profile_route_revision",
                    revision.id,
                    state=str(revision.revision_number),
                )
            )
            is not None
        )
        return PlatformDeliveryStorageDossierOut(
            id=profile.id,
            profile_key=profile.profile_key,
            display_name=profile.display_name,
            revision=_storage_revision(profile, test_state),
            provider=profile.provider,
            config_source=str(profile.config_source),
            is_active=profile.is_active,
            is_default=profile.is_default,
            readiness=_storage_readiness(profile, test_state),
            last_test_status=test_state.last_test_status if test_state is not None else None,
            last_tested_at=test_state.last_tested_at if test_state is not None else None,
            tombstoned_at=profile.tombstoned_at,
            scope=PlatformDeliveryScopeOut(),
            dependencies=dependencies,
            evidence=evidence,
            actions=(
                PlatformDeliveryActionAvailabilityOut(
                    action=HostingDeliveryOperationAction.TEST_READINESS,
                    available=profile.tombstoned_at is None,
                    reason_code=_storage_action_reason(profile),
                ),
            ),
            operations=await self._operations_for(
                target_type=HostingDeliveryOperationTargetType.STORAGE_PROFILE,
                target_id=profile.id,
            ),
        )

    async def list_operations(
        self,
        *,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
        params: PageParams,
    ) -> PlatformDeliveryOperationPage:
        records, total = await self._operations.list_page_for_target(
            target_type=target_type,
            target_id=target_id,
            offset=params.offset,
            limit=params.limit,
        )
        items = tuple(present_delivery_operation(record) for record in records)
        return _operation_page(items=items, total=total, params=params)

    async def get_operation(self, *, operation_id: UUID) -> PlatformDeliveryOperationOut:
        return present_delivery_operation(await self._operations.get(operation_id=operation_id))

    async def _publish_job_dossier(self, job: PublishJobRecord) -> PlatformDeliveryIssueDossierOut:
        can_retry = job.status is PublishJobStatus.FAILED and job.release_id is not None
        dependencies = tuple(
            dependency
            for dependency in (
                _dependency("workspace", "workspace", job.workspace_id),
                _dependency("project", "project", job.project_id),
                _dependency("site", "site", job.site_id),
                _dependency("release", "content_release", job.release_id),
            )
            if dependency is not None
        )
        evidence: list[PlatformDeliveryEvidenceOut] = [
            PlatformDeliveryEvidenceOut(
                code="publish_job",
                status=str(job.status),
                observed_at=job.updated_at,
                subject_id=job.id,
            )
        ]
        if job.error_message:
            evidence.append(
                PlatformDeliveryEvidenceOut(
                    code="publish_failure",
                    status="reported",
                    observed_at=job.updated_at,
                    subject_id=job.id,
                    details={"message": job.error_message},
                )
            )
        return PlatformDeliveryIssueDossierOut(
            id=job.id,
            kind="publish_job",
            revision=job.updated_at,
            state=str(job.status),
            visitor_effect="site_unavailable" if job.status is PublishJobStatus.FAILED else "delivery_recovery_pending",
            summary_key="siteDelivery:PUBLISH_FAILED",
            retryable=can_retry,
            occurred_at=job.updated_at,
            source_identity=None,
            scope=PlatformDeliveryScopeOut(
                workspace_id=job.workspace_id,
                project_id=job.project_id,
                site_id=job.site_id,
                release_id=job.release_id,
            ),
            dependencies=dependencies,
            evidence=tuple(evidence),
            actions=(
                PlatformDeliveryActionAvailabilityOut(
                    action=HostingDeliveryOperationAction.RETRY,
                    available=can_retry,
                    reason_code=None if can_retry else "PUBLISH_RETRY_UNAVAILABLE",
                ),
            ),
            operations=await self._operations_for(
                target_type=HostingDeliveryOperationTargetType.PUBLISH_JOB,
                target_id=job.id,
            ),
        )

    async def _hosting_continuity_dossier(
        self,
        projection: HostingCommercialAccessProjection,
    ) -> PlatformDeliveryIssueDossierOut:
        targets = await HostingContinuityTarget.filter(projection_id=projection.id).order_by("site_id", "runtime_id")
        dependencies: list[PlatformDeliveryDependencyOut] = [
            PlatformDeliveryDependencyOut(
                code="workspace",
                entity_type="workspace",
                entity_id=projection.workspace_id,
            )
        ]
        evidence: list[PlatformDeliveryEvidenceOut] = [
            PlatformDeliveryEvidenceOut(
                code="hosting_projection",
                status=str(projection.state),
                observed_at=projection.updated_at,
                subject_id=projection.id,
                details=_projection_evidence(projection),
            )
        ]
        for target in targets:
            dependencies.extend(
                dependency
                for dependency in (
                    _dependency("site", "site", target.site_id, state=str(target.gate)),
                    _dependency("runtime", "project_runtime", target.runtime_id),
                    _dependency("release", "content_release", target.preserved_release_id),
                )
                if dependency is not None
            )
            evidence.append(
                PlatformDeliveryEvidenceOut(
                    code="delivery_target",
                    status=_target_evidence_status(target),
                    observed_at=target.verified_at or target.updated_at,
                    subject_id=target.site_id,
                    details=_target_evidence(target),
                )
            )
        actions = _hosting_actions(projection)
        return PlatformDeliveryIssueDossierOut(
            id=projection.id,
            kind="hosting_continuity",
            revision=projection.updated_at,
            state=str(projection.state),
            visitor_effect=_visitor_effect(projection.state),
            summary_key="siteDelivery:HOSTING_CONTINUITY_RECOVERY_REQUIRED",
            retryable=next(
                action.available for action in actions if action.action is HostingDeliveryOperationAction.RETRY
            ),
            occurred_at=projection.updated_at,
            source_identity=projection.source_identity,
            scope=PlatformDeliveryScopeOut(workspace_id=projection.workspace_id),
            dependencies=tuple(dependencies),
            evidence=tuple(evidence),
            actions=actions,
            operations=await self._operations_for(
                target_type=HostingDeliveryOperationTargetType.HOSTING_CONTINUITY,
                target_id=projection.id,
            ),
        )

    async def _operations_for(
        self,
        *,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
    ) -> tuple[PlatformDeliveryOperationOut, ...]:
        records = await self._operations.list_for_target(
            target_type=target_type,
            target_id=target_id,
            limit=_DOSSIER_OPERATION_LIMIT,
        )
        return tuple(present_delivery_operation(record) for record in records)


def _dependency(
    code: str,
    entity_type: str,
    entity_id: UUID | None,
    *,
    state: str | None = None,
) -> PlatformDeliveryDependencyOut | None:
    if entity_id is None:
        return None
    return PlatformDeliveryDependencyOut(
        code=code,
        entity_type=entity_type,
        entity_id=entity_id,
        state=state,
    )


def _domain_readiness(binding: DomainBindingRecord) -> str:
    if not binding.is_active:
        return "inactive"
    if not binding.is_verified:
        return "verification_required"
    if str(binding.certificate_status) == "error":
        return "certificate_error"
    if str(binding.certificate_status) != "issued":
        return "certificate_pending"
    return "serving"


def _domain_action_reason(binding: DomainBindingRecord) -> str | None:
    if binding.source != DomainBindingSource.CUSTOM:
        return "DOMAIN_NOT_CUSTOM"
    if not binding.is_active:
        return "DOMAIN_INACTIVE"
    if binding.is_verified:
        return "DOMAIN_ALREADY_VERIFIED"
    return None


async def _storage_test_state(profile: StorageProfile) -> StorageProfileTestState | None:
    return await StorageProfileTestState.get_or_none(
        scope_type=profile.scope_type,
        scope_id=profile.scope_id,
        profile_key=profile.profile_key,
    )


def _storage_revision(profile: StorageProfile, test_state: StorageProfileTestState | None) -> datetime:
    if test_state is None or profile.updated_at >= test_state.updated_at:
        return profile.updated_at
    return test_state.updated_at


def _storage_readiness(profile: StorageProfile, test_state: StorageProfileTestState | None) -> str:
    if profile.tombstoned_at is not None:
        return "tombstoned"
    if not profile.is_active:
        return "inactive"
    if test_state is None:
        return "not_tested"
    return test_state.last_test_status


def _storage_action_reason(profile: StorageProfile) -> str | None:
    if profile.scope_type != SCOPE_TYPE_SYSTEM or profile.scope_id != SYSTEM_SCOPE_ID:
        return "STORAGE_PROFILE_SCOPE_UNSUPPORTED"
    if profile.tombstoned_at is not None:
        return "STORAGE_PROFILE_TOMBSTONED"
    return None


def _projection_evidence(projection: HostingCommercialAccessProjection) -> JsonObject:
    result: JsonObject = {"source_identity": projection.source_identity}
    if projection.continuity_deadline is not None:
        result["continuity_deadline"] = projection.continuity_deadline.isoformat()
    if projection.policy_revision is not None:
        result["policy_revision"] = int(projection.policy_revision)
    if projection.delivery_error_code is not None:
        result["delivery_error_code"] = projection.delivery_error_code
    if projection.delivery_error_message is not None:
        result["delivery_error_message"] = projection.delivery_error_message
    return result


def _target_evidence(target: HostingContinuityTarget) -> JsonObject:
    result: JsonObject = {
        "runtime_id": str(target.runtime_id),
        "gate": str(target.gate),
        "restoration_state": str(target.restoration_state),
    }
    if target.preserved_release_id is not None:
        result["preserved_release_id"] = str(target.preserved_release_id)
    if target.operation_identity is not None:
        result["source_operation_identity"] = target.operation_identity
    if target.verification_evidence is not None:
        result["verification_evidence"] = target.verification_evidence
    if target.failure_code is not None:
        result["failure_code"] = target.failure_code
    if target.failure_message is not None:
        result["failure_message"] = target.failure_message
    return result


def _target_evidence_status(target: HostingContinuityTarget) -> str:
    if target.verified_at is not None:
        return "verified"
    if target.failure_code is not None:
        return "failed"
    return "pending"


def _hosting_actions(
    projection: HostingCommercialAccessProjection,
) -> tuple[PlatformDeliveryActionAvailabilityOut, ...]:
    retry_available = projection.state in {
        HostingCommercialAccessState.CONTINUITY_REQUIRED,
        HostingCommercialAccessState.SUSPENDED,
        HostingCommercialAccessState.PARTIAL,
        HostingCommercialAccessState.RESTORATION_REQUIRED,
    }
    reconcile_available = retry_available
    restore_available = (
        projection.state is HostingCommercialAccessState.RESTORATION_REQUIRED
        and projection.restoration_source_identity is not None
    )
    return (
        PlatformDeliveryActionAvailabilityOut(
            action=HostingDeliveryOperationAction.RETRY,
            available=retry_available,
            reason_code=None if retry_available else "HOSTING_RETRY_UNAVAILABLE",
        ),
        PlatformDeliveryActionAvailabilityOut(
            action=HostingDeliveryOperationAction.RECONCILE,
            available=reconcile_available,
            reason_code=None if reconcile_available else "HOSTING_RECONCILIATION_UNAVAILABLE",
        ),
        PlatformDeliveryActionAvailabilityOut(
            action=HostingDeliveryOperationAction.RESTORE,
            available=restore_available,
            reason_code=None if restore_available else "HOSTING_RESTORATION_UNAVAILABLE",
        ),
    )


def _visitor_effect(state: HostingCommercialAccessState) -> str:
    if state in {HostingCommercialAccessState.SUSPENDED, HostingCommercialAccessState.PARTIAL}:
        return "site_unavailable"
    return "delivery_recovery_pending"


def _operation_page(
    *,
    items: tuple[PlatformDeliveryOperationOut, ...],
    total: int,
    params: PageParams,
) -> PlatformDeliveryOperationPage:
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
