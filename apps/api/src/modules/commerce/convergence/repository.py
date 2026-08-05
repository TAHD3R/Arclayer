"""Tortoise persistence for revision-bound Plan Access Convergence."""

from __future__ import annotations

import hashlib
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.rbac import WORKSPACE_COMMERCE_MANAGE, WORKSPACE_FEATURE_SEATS_MANAGE
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.models.commerce.billing import (
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    EntitlementAllocationMode,
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    PlanAccessConvergence,
    PlanAccessConvergenceFeatureOutcome,
    PlanRevisionStatus,
    ResourceLimitKind,
    SubscriptionTransitionStatus,
    WorkspaceSubscription,
)
from src.models.jobs.background_job import BackgroundJobRecord, JobAuthorityMode, JobInternalStatus
from src.models.system.rbac import SystemRole, SystemRolePermission
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.models.workspaces.workspace_invite import WorkspaceEmailInvite, WorkspaceInviteLink
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.convergence.schema import (
    ConvergenceAuditEvent,
    ConvergenceImpactSnapshot,
    ConvergencePreview,
    ConvergenceReceipt,
    CustomRoleImpact,
    FeatureAccessScopeRevisionImpact,
    FeatureSeatAssignmentImpact,
    InvitationImpact,
    MemberImpact,
    PlanRevisionRef,
    ProviderConfirmedConvergenceApplication,
    QueuedEffectImpact,
    RoleResponsibilityImpact,
)
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT
from src.modules.commerce.feature_access.read_contracts import (
    EMPTY_FEATURE_ACCESS_METADATA_REGISTRY,
    FeatureAccessMetadataRegistry,
)

type ActivityWriter = Callable[..., Awaitable[object]]


class _ConvergenceRow(Protocol):
    id: UUID
    workspace_id: UUID
    source_plan_revision_id: UUID
    target_plan_revision_id: UUID
    effective_at: datetime
    status: SubscriptionTransitionStatus
    revision: int
    updated_at: datetime

    async def save(self, *, update_fields: list[str], using_db: BaseDBAsyncClient) -> None: ...


class _FeatureOutcomeRow(Protocol):
    assignment_id: UUID
    is_retained: bool


class _RoleAssignmentRow(Protocol):
    id: UUID
    membership_id: UUID
    role_id: UUID
    membership: WorkspaceMembership
    role: SystemRole


class TortoisePlanAccessConvergenceRepository:
    """Locks all current authority inputs before previewing or applying a downgrade."""

    def __init__(
        self,
        settings: Settings,
        *,
        metadata_registry: FeatureAccessMetadataRegistry = EMPTY_FEATURE_ACCESS_METADATA_REGISTRY,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        self._settings = settings
        self._metadata_registry = metadata_registry
        self._activity_writer = activity_writer

    async def requires_transition_convergence(
        self,
        *,
        workspace_id: UUID,
        source_revision_id: UUID,
        target_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool:
        source = await self._lock_published_revision(revision_id=source_revision_id, conn=conn)
        target = await self._lock_published_revision(revision_id=target_revision_id, conn=conn)
        members = await self._active_members(workspace_id=workspace_id, conn=conn)
        assignments = await self._feature_assignments(workspace_id=workspace_id, members=members, conn=conn)
        return _requires_convergence(
            source_revision=await self._revision_ref(revision=source, conn=conn),
            target_revision=await self._revision_ref(revision=target, conn=conn),
            assignments=assignments,
        )

    async def capture_impact_snapshot(
        self,
        *,
        workspace_id: UUID,
        source_revision_id: UUID,
        target_revision_id: UUID,
        effective_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> ConvergenceImpactSnapshot:
        _ = effective_at
        workspace = await self._lock_workspace(workspace_id=workspace_id, conn=conn)
        subscription = await self._lock_subscription(workspace_id=workspace_id, conn=conn)
        if UUID(str(subscription.plan_revision_id)) != source_revision_id:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_REVISION_STALE")
        source = await self._lock_published_revision(revision_id=source_revision_id, conn=conn)
        target = await self._lock_published_revision(revision_id=target_revision_id, conn=conn)
        return await self._build_snapshot(
            workspace=workspace,
            subscription=subscription,
            source=source,
            target=target,
            conn=conn,
        )

    async def save_preview(
        self, *, preview: ConvergencePreview, audit: ConvergenceAuditEvent, conn: BaseDBAsyncClient
    ) -> None:
        convergence = await PlanAccessConvergence.create(
            id=preview.id,
            workspace_id=preview.snapshot.workspace_id,
            source_plan_revision_id=preview.snapshot.source_revision.id,
            target_plan_revision_id=preview.snapshot.target_revision.id,
            preview_token_hash=_preview_token_hash(preview.id),
            effective_at=preview.effective_at,
            status=SubscriptionTransitionStatus.SCHEDULED,
            revision=preview.preview_revision,
            using_db=conn,
        )
        await PlanAccessConvergenceFeatureOutcome.bulk_create(
            [
                PlanAccessConvergenceFeatureOutcome(
                    convergence_id=convergence.id,
                    assignment_id=assignment.assignment_id,
                    is_retained=assignment.assignment_id in set(preview.retained_assignment_ids),
                )
                for assignment in preview.snapshot.feature_assignments
            ],
            using_db=conn,
        )
        await self._write_audit(audit=audit, entity_id=convergence.id, conn=conn)

    async def load_preview_for_update(self, *, preview_id: UUID, conn: BaseDBAsyncClient) -> ConvergencePreview:
        raw_convergence = await PlanAccessConvergence.filter(id=preview_id).using_db(conn).select_for_update().first()
        if raw_convergence is None:
            raise NotFound(error="PLAN_ACCESS_CONVERGENCE_NOT_FOUND")
        convergence = cast(_ConvergenceRow, raw_convergence)
        if convergence.status not in {SubscriptionTransitionStatus.SCHEDULED, SubscriptionTransitionStatus.APPLIED}:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_NOT_APPLICABLE")
        workspace = await self._lock_workspace(workspace_id=UUID(str(convergence.workspace_id)), conn=conn)
        subscription = await self._lock_subscription(workspace_id=UUID(str(convergence.workspace_id)), conn=conn)
        is_applied = convergence.status == SubscriptionTransitionStatus.APPLIED
        if not is_applied and UUID(str(subscription.plan_revision_id)) != UUID(
            str(convergence.source_plan_revision_id)
        ):
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_REVISION_STALE")
        source = await self._lock_published_revision(
            revision_id=UUID(str(convergence.source_plan_revision_id)), conn=conn
        )
        target = await self._lock_published_revision(
            revision_id=UUID(str(convergence.target_plan_revision_id)), conn=conn
        )
        outcomes = await (
            PlanAccessConvergenceFeatureOutcome
            .filter(convergence_id=convergence.id)
            .using_db(conn)
            .select_for_update()
            .order_by("assignment_id")
            .all()
        )
        snapshot = await self._build_snapshot(
            workspace=workspace,
            subscription=subscription,
            source=source,
            target=target,
            conn=conn,
        )
        active_assignment_ids = {assignment.assignment_id for assignment in snapshot.feature_assignments}
        reviewed_outcomes = tuple(cast(_FeatureOutcomeRow, outcome) for outcome in outcomes)
        reviewed_assignment_ids = {UUID(str(outcome.assignment_id)) for outcome in reviewed_outcomes}
        if not is_applied and active_assignment_ids != reviewed_assignment_ids:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_ASSIGNMENTS_STALE")
        retained_assignment_ids = tuple(
            UUID(str(outcome.assignment_id)) for outcome in reviewed_outcomes if outcome.is_retained
        )
        return ConvergencePreview(
            id=UUID(str(convergence.id)),
            preview_revision=int(convergence.revision),
            snapshot_hash=_snapshot_hash(snapshot=snapshot),
            effective_at=convergence.effective_at,
            snapshot=snapshot,
            retained_assignment_ids=retained_assignment_ids,
            idempotency_key=_preview_token_hash(convergence.id),
            correlation_id=UUID(str(convergence.id)),
            is_applied=is_applied,
        )

    async def apply_convergence(
        self,
        *,
        preview: ConvergencePreview,
        request: ProviderConfirmedConvergenceApplication,
        applied_at: datetime,
        audit: ConvergenceAuditEvent,
        conn: BaseDBAsyncClient,
    ) -> ConvergenceReceipt:
        raw_convergence = await PlanAccessConvergence.filter(id=preview.id).using_db(conn).select_for_update().first()
        if raw_convergence is None:
            raise NotFound(error="PLAN_ACCESS_CONVERGENCE_NOT_FOUND")
        convergence = cast(_ConvergenceRow, raw_convergence)
        if convergence.status == SubscriptionTransitionStatus.APPLIED:
            return ConvergenceReceipt(
                preview_id=preview.id,
                workspace_id=UUID(str(convergence.workspace_id)),
                applied_at=convergence.updated_at,
                replayed=True,
                correlation_id=request.correlation_id,
            )
        if (
            convergence.status != SubscriptionTransitionStatus.SCHEDULED
            or convergence.revision != preview.preview_revision
        ):
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_PREVIEW_STALE")
        subscription = await self._lock_subscription(workspace_id=UUID(str(convergence.workspace_id)), conn=conn)
        if (
            UUID(str(subscription.plan_revision_id)) != UUID(str(convergence.source_plan_revision_id))
            or subscription.revision != preview.snapshot.subscription_revision
        ):
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_SUBSCRIPTION_STALE")
        subscription.plan_revision_id = convergence.target_plan_revision_id
        subscription.revision += 1
        await subscription.save(update_fields=["plan_revision_id", "revision", "updated_at"], using_db=conn)
        convergence.status = SubscriptionTransitionStatus.APPLIED
        convergence.revision += 1
        await convergence.save(update_fields=["status", "revision", "updated_at"], using_db=conn)
        await self._write_audit(audit=audit, entity_id=convergence.id, conn=conn)
        return ConvergenceReceipt(
            preview_id=preview.id,
            workspace_id=UUID(str(convergence.workspace_id)),
            applied_at=applied_at,
            correlation_id=request.correlation_id,
        )

    async def _build_snapshot(
        self,
        *,
        workspace: Workspace,
        subscription: WorkspaceSubscription,
        source: CommercePlanRevision,
        target: CommercePlanRevision,
        conn: BaseDBAsyncClient,
    ) -> ConvergenceImpactSnapshot:
        members = await self._active_members(workspace_id=UUID(str(workspace.id)), conn=conn)
        feature_assignments = await self._feature_assignments(
            workspace_id=UUID(str(workspace.id)), members=members, conn=conn
        )
        source_revision = await self._revision_ref(revision=source, conn=conn)
        target_revision = await self._revision_ref(revision=target, conn=conn)
        return ConvergenceImpactSnapshot(
            workspace_id=UUID(str(workspace.id)),
            owner_user_id=UUID(str(workspace.owner_user_id)),
            subscription_revision=int(subscription.revision),
            source_revision=source_revision,
            target_revision=target_revision,
            requires_convergence=_requires_convergence(
                source_revision=source_revision,
                target_revision=target_revision,
                assignments=feature_assignments,
            ),
            active_members=tuple(members.values()),
            role_responsibilities=await self._role_responsibilities(workspace_id=UUID(str(workspace.id)), conn=conn),
            custom_roles=await self._custom_roles(workspace_id=UUID(str(workspace.id)), conn=conn),
            billing_managers=await self._permission_holders(
                workspace_id=UUID(str(workspace.id)), permission=WORKSPACE_COMMERCE_MANAGE, members=members, conn=conn
            ),
            feature_seat_managers=await self._permission_holders(
                workspace_id=UUID(str(workspace.id)),
                permission=WORKSPACE_FEATURE_SEATS_MANAGE,
                members=members,
                conn=conn,
            ),
            feature_assignments=feature_assignments,
            feature_allocation_scope_revisions=await self._feature_scope_revisions(
                workspace_id=UUID(str(workspace.id)), assignments=feature_assignments, conn=conn
            ),
            email_invitations=await self._email_invitations(workspace_id=UUID(str(workspace.id)), conn=conn),
            reusable_invitation_links=await self._invite_links(workspace_id=UUID(str(workspace.id)), conn=conn),
            queued_effects=await self._queued_actor_effects(workspace_id=UUID(str(workspace.id)), conn=conn),
        )

    @staticmethod
    async def _lock_workspace(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace:
        workspace = await Workspace.filter(id=workspace_id, deleted_at=None).using_db(conn).select_for_update().first()
        if workspace is None:
            raise NotFound(error="WORKSPACE_NOT_FOUND")
        return workspace

    @staticmethod
    async def _lock_subscription(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceSubscription:
        subscription = (
            await WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if subscription is None:
            raise Conflict(error="WORKSPACE_SUBSCRIPTION_REQUIRED")
        return subscription

    @staticmethod
    async def _lock_published_revision(*, revision_id: UUID, conn: BaseDBAsyncClient) -> CommercePlanRevision:
        revision = await (
            CommercePlanRevision
            .filter(
                id=revision_id,
                status=PlanRevisionStatus.PUBLISHED,
                published_at__not_isnull=True,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if revision is None:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_REVISION_INVALID")
        await revision.fetch_related("plan")
        return revision

    @staticmethod
    async def _revision_ref(*, revision: CommercePlanRevision, conn: BaseDBAsyncClient) -> PlanRevisionRef:
        decisions = await (
            CommercePlanRevisionEntitlement
            .filter(plan_revision_id=revision.id)
            .using_db(conn)
            .select_for_update()
            .all()
        )
        for decision in decisions:
            await decision.fetch_related("entitlement", using_db=conn)
        role_decisions = [
            decision for decision in decisions if decision.entitlement.key == WORKSPACE_ROLES_MANAGE_ENTITLEMENT
        ]
        if len(role_decisions) != 1:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_ROLE_ENTITLEMENT_INVALID")
        role_decision = role_decisions[0]
        member_seat_limits: dict[str, int | None] = {}
        for decision in decisions:
            if not decision.is_included or decision.allocation_mode != EntitlementAllocationMode.MEMBER_SEAT:
                continue
            if decision.seat_limit_kind == ResourceLimitKind.LIMITED and decision.seat_limit_value is not None:
                member_seat_limits[decision.entitlement.key] = int(decision.seat_limit_value)
            elif decision.seat_limit_kind == ResourceLimitKind.UNLIMITED and decision.seat_limit_value is None:
                member_seat_limits[decision.entitlement.key] = None
            else:
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_MEMBER_SEAT_TERMS_INVALID")
        return PlanRevisionRef(
            id=UUID(str(revision.id)),
            plan_id=UUID(str(revision.plan_id)),
            code=revision.plan.code,
            is_free=revision.plan.code == "free",
            roles_manage_included=bool(role_decision.is_included),
            member_seat_limits=member_seat_limits,
        )

    @staticmethod
    async def _active_members(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> dict[UUID, MemberImpact]:
        memberships = await (
            WorkspaceMembership
            .filter(workspace_id=workspace_id, status=WorkspaceMembershipStatus.ACTIVE)
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        for membership in memberships:
            await membership.fetch_related("user", using_db=conn)
        return {
            UUID(str(membership.id)): MemberImpact(
                membership_id=UUID(str(membership.id)),
                user_id=UUID(str(membership.user_id)),
                display_name=membership.user.display_name or membership.user.username,
            )
            for membership in memberships
        }

    @staticmethod
    async def _role_responsibilities(
        *, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> tuple[RoleResponsibilityImpact, ...]:
        assignments = await (
            WorkspaceMembershipRole
            .filter(
                membership__workspace_id=workspace_id,
                membership__status=WorkspaceMembershipStatus.ACTIVE,
                ended_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        for assignment in assignments:
            await assignment.fetch_related("membership__user", "role", using_db=conn)
        return tuple(
            RoleResponsibilityImpact(
                assignment_id=UUID(str(assignment.id)),
                membership_id=UUID(str(assignment.membership_id)),
                user_id=UUID(str(assignment.membership.user_id)),
                role_id=UUID(str(assignment.role_id)),
                role_name=assignment.role.name,
            )
            for raw_assignment in assignments
            for assignment in (cast(_RoleAssignmentRow, raw_assignment),)
        )

    @staticmethod
    async def _custom_roles(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> tuple[CustomRoleImpact, ...]:
        roles = await (
            SystemRole
            .filter(workspace_id=workspace_id, is_system=False, ended_at=None)
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        return tuple(CustomRoleImpact(role_id=UUID(str(role.id)), role_name=role.name) for role in roles)

    @staticmethod
    async def _permission_holders(
        *, workspace_id: UUID, permission: str, members: dict[UUID, MemberImpact], conn: BaseDBAsyncClient
    ) -> tuple[MemberImpact, ...]:
        role_ids = await (
            SystemRolePermission
            .filter(
                permission__code=permission,
                role__workspace_id=workspace_id,
                role__ended_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .values_list("role_id", flat=True)
        )
        if not role_ids:
            return ()
        membership_ids = await (
            WorkspaceMembershipRole
            .filter(
                role_id__in=role_ids,
                membership__workspace_id=workspace_id,
                membership__status=WorkspaceMembershipStatus.ACTIVE,
                ended_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .values_list("membership_id", flat=True)
        )
        return tuple(
            members[membership_id]
            for membership_id in sorted({UUID(str(value)) for value in membership_ids})
            if membership_id in members
        )

    async def _feature_assignments(
        self, *, workspace_id: UUID, members: dict[UUID, MemberImpact], conn: BaseDBAsyncClient
    ) -> tuple[FeatureSeatAssignmentImpact, ...]:
        assignments = await (
            FeatureAccessAssignment
            .filter(workspace_id=workspace_id, ended_at=None)
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        for assignment in assignments:
            await assignment.fetch_related("entitlement", using_db=conn)
        impacts: list[FeatureSeatAssignmentImpact] = []
        for assignment in assignments:
            membership = members.get(UUID(str(assignment.membership_id)))
            if membership is None:
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_ASSIGNMENT_MEMBERSHIP_INVALID")
            try:
                metadata = self._metadata_registry.require(assignment.entitlement.key)
            except KeyError as exc:
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_FEATURE_METADATA_INVALID") from exc
            impacts.append(
                FeatureSeatAssignmentImpact(
                    assignment_id=UUID(str(assignment.id)),
                    membership_id=membership.membership_id,
                    user_id=membership.user_id,
                    entitlement_key=assignment.entitlement.key,
                    name_i18n_key=metadata.name_i18n_key,
                    description_i18n_key=metadata.description_i18n_key,
                )
            )
        return tuple(impacts)

    @staticmethod
    async def _feature_scope_revisions(
        *,
        workspace_id: UUID,
        assignments: tuple[FeatureSeatAssignmentImpact, ...],
        conn: BaseDBAsyncClient,
    ) -> tuple[FeatureAccessScopeRevisionImpact, ...]:
        entitlement_keys = {assignment.entitlement_key for assignment in assignments}
        if not entitlement_keys:
            return ()
        scopes = await (
            FeatureAccessAllocationScope
            .filter(
                workspace_id=workspace_id,
                entitlement__key__in=entitlement_keys,
            )
            .using_db(conn)
            .select_for_update()
            .order_by("entitlement__key")
            .all()
        )
        for scope in scopes:
            await scope.fetch_related("entitlement", using_db=conn)
        by_key = {scope.entitlement.key: scope for scope in scopes}
        if set(by_key) != entitlement_keys:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_ASSIGNMENT_SCOPE_INVALID")
        return tuple(
            FeatureAccessScopeRevisionImpact(entitlement_key=key, revision=int(by_key[key].revision))
            for key in sorted(by_key)
        )

    @staticmethod
    async def _email_invitations(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> tuple[InvitationImpact, ...]:
        invitations = await (
            WorkspaceEmailInvite
            .filter(
                workspace_id=workspace_id,
                accepted_at=None,
                revoked_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        return tuple(
            InvitationImpact(
                invitation_id=UUID(str(invitation.id)),
                recipient_label=invitation.email,
                role_id=None,
            )
            for invitation in invitations
        )

    @staticmethod
    async def _invite_links(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> tuple[InvitationImpact, ...]:
        links = await (
            WorkspaceInviteLink
            .filter(workspace_id=workspace_id, disabled_at=None)
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        return tuple(
            InvitationImpact(invitation_id=UUID(str(link.id)), recipient_label=link.display_code, role_id=None)
            for link in links
        )

    @staticmethod
    async def _queued_actor_effects(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> tuple[QueuedEffectImpact, ...]:
        effects = await (
            BackgroundJobRecord
            .filter(
                workspace_id=workspace_id,
                authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
                actor_user_id__not_isnull=True,
                internal_status__in=(
                    JobInternalStatus.PENDING_DISPATCH,
                    JobInternalStatus.QUEUED,
                    JobInternalStatus.RUNNING,
                    JobInternalStatus.RETRY_SCHEDULED,
                    JobInternalStatus.WAITING_FOR_USER,
                ),
            )
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        return tuple(
            QueuedEffectImpact(
                effect_id=UUID(str(effect.id)),
                actor_user_id=UUID(str(effect.actor_user_id)),
                effect_type=effect.job_type,
            )
            for effect in effects
        )

    async def _write_audit(self, *, audit: ConvergenceAuditEvent, entity_id: UUID, conn: BaseDBAsyncClient) -> None:
        await self._activity_writer(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name=audit.event_name,
                workspace_id=audit.workspace_id,
                entity_type="plan_access_convergence",
                entity_id=entity_id,
                properties={
                    "correlation_id": str(audit.correlation_id),
                    "idempotency_key": audit.idempotency_key,
                },
            ),
            conn=conn,
        )


def _preview_token_hash(preview_id: UUID) -> str:
    return hashlib.sha256(str(preview_id).encode()).hexdigest()


def _snapshot_hash(*, snapshot: ConvergenceImpactSnapshot) -> str:
    assignments = Counter(
        f"{assignment.assignment_id}:{assignment.entitlement_key}" for assignment in snapshot.feature_assignments
    )
    assignment_part = ",".join(sorted(assignments.elements()))
    return ":".join((
        str(snapshot.workspace_id),
        str(snapshot.subscription_revision),
        str(snapshot.source_revision.id),
        str(snapshot.target_revision.id),
        assignment_part,
    ))


def _requires_convergence(
    *,
    source_revision: PlanRevisionRef,
    target_revision: PlanRevisionRef,
    assignments: tuple[FeatureSeatAssignmentImpact, ...],
) -> bool:
    if source_revision.roles_manage_included and not target_revision.roles_manage_included:
        return True
    assigned_by_entitlement = Counter(assignment.entitlement_key for assignment in assignments)
    for entitlement_key, source_limit in source_revision.member_seat_limits.items():
        target_limit = target_revision.member_seat_limits.get(entitlement_key)
        if entitlement_key not in target_revision.member_seat_limits:
            return True
        if source_limit is None:
            if target_limit is not None and assigned_by_entitlement[entitlement_key] > target_limit:
                return True
            continue
        if (
            target_limit is not None
            and target_limit < source_limit
            and assigned_by_entitlement[entitlement_key] > target_limit
        ):
            return True
    return False
