from __future__ import annotations

from typing import Protocol, cast
from uuid import NAMESPACE_URL, UUID, uuid5

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.i18n import t
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    CommercePlanRevision,
    CommerceProviderEventApplication,
    CommercialAccessTransition,
    WorkspaceCommercialAccess,
    WorkspaceSubscription,
)
from src.modules.commerce.access_state.schema import (
    CommercialAccessMemberView,
    CommercialAccessProjection,
    CommercialAccessRecoveryView,
    CommercialAccessState,
    CommercialAccessStateApplyResult,
    CommercialAccessTransitionFact,
    CommercialAccessTransitionWrite,
    CommercialLifecycleNotificationFact,
    HostingCommercialAccessHandoffFact,
    PaymentRecoveryGrantDecision,
    PaymentRecoveryGrantWrite,
)

_RECOVERY_GRANT_RECEIPT_CODE = "commerce.recovery_grant.decided"


class _AccessIdentifiers(Protocol):
    workspace_id: UUID
    subscription_id: UUID


class CommercialAccessFactOutbox(Protocol):
    """Records Commerce-owned facts for downstream Notifications and Hosting consumers."""

    async def append_access_result(
        self,
        *,
        result: CommercialAccessStateApplyResult,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class TortoiseCommercialAccessStateRepository(TortoiseORMRepository[WorkspaceCommercialAccess]):
    """Tortoise persistence for the current access projection and immutable receipts."""

    def __init__(self, *, outbox: CommercialAccessFactOutbox | None = None) -> None:
        super().__init__(WorkspaceCommercialAccess)
        self._outbox = outbox

    async def get_transition_receipt(
        self, *, provider: str, provider_event_id: str
    ) -> CommercialAccessStateApplyResult | None:
        async with in_transaction() as conn:
            return await self._load_transition_receipt(
                provider=provider,
                provider_event_id=provider_event_id,
                conn=conn,
            )

    async def get_projection(self, *, workspace_id: UUID) -> CommercialAccessProjection | None:
        access = await self._load_access(workspace_id=workspace_id)
        if access is None:
            return None
        period_id = await self._current_provider_period_id(access=access)
        return self._projection(access=access, provider_period_id=period_id)

    async def get_member_view(self, *, workspace_id: UUID) -> CommercialAccessMemberView | None:
        access = await self._load_access(workspace_id=workspace_id)
        if access is None:
            return None
        restricted = self._state(access) == CommercialAccessState.PAYMENT_RESTRICTED
        return CommercialAccessMemberView(
            workspace_id=workspace_id,
            state=self._state(access),
            explanation_key="commerce:PAYMENT_RESTRICTED" if restricted else None,
            billing_contact_required=restricted,
        )

    async def get_recovery_view(self, *, workspace_id: UUID) -> CommercialAccessRecoveryView | None:
        access = await self._load_access(workspace_id=workspace_id)
        if access is None:
            return None
        state = self._state(access)
        recoverable = state in {
            CommercialAccessState.PAYMENT_GRACE,
            CommercialAccessState.PAYMENT_RESTRICTED,
        }
        return CommercialAccessRecoveryView(
            workspace_id=workspace_id,
            state=state,
            explanation_key="commerce:PAYMENT_RESTRICTED" if recoverable else None,
            billing_contact_required=False,
            recovery_deadline=access.deadline_at if state == CommercialAccessState.PAYMENT_GRACE else None,
            permitted_recovery_action="open_payment_recovery" if recoverable else None,
        )

    async def compare_and_append(self, *, write: CommercialAccessTransitionWrite) -> CommercialAccessStateApplyResult:
        outbox = self._require_outbox()
        async with in_transaction() as conn:
            access = await self._load_access(
                workspace_id=write.projection.workspace_id,
                conn=conn,
                for_update=True,
            )
            if access is None:
                raise self._unavailable("COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
            self._require_current_access(access=access, write=write)
            await self._require_provider_application(write=write, access=access, conn=conn)
            try:
                async with conn._in_transaction() as savepoint_conn:
                    await self.update_fields(
                        access,
                        fields={
                            "state": write.projection.state,
                            "deadline_at": write.projection.recovery_deadline,
                            "state_revision": write.projection.access_revision,
                            "source_identity": write.result.transition.transition_identity,
                        },
                        conn=savepoint_conn,
                    )
                    await self.create_record(
                        CommercialAccessTransition,
                        access_id=access.id,
                        from_state=write.result.transition.from_state,
                        to_state=write.result.transition.to_state,
                        deadline_at=write.result.transition.recovery_deadline,
                        source_identity=write.result.transition.transition_identity,
                        correlation_id=uuid5(NAMESPACE_URL, write.result.transition.transition_identity),
                        conn=savepoint_conn,
                    )
            except IntegrityError as exc:
                receipt = await self._load_transition_receipt(
                    provider=write.source.provider,
                    provider_event_id=write.source.provider_event_id,
                    conn=conn,
                )
                if receipt is None:
                    raise
                return receipt
            await outbox.append_access_result(result=write.result, conn=conn)
            return write.result

    async def get_decision(
        self,
        *,
        workspace_id: UUID,
        provider: str,
        provider_period_id: str,
        subscription_revision_id: UUID,
    ) -> PaymentRecoveryGrantDecision | None:
        application = (
            await CommerceProviderEventApplication
            .filter(
                workspace_id=workspace_id,
                provider=provider,
                provider_period_identity=provider_period_id,
                plan_revision_id=subscription_revision_id,
                result_code=_RECOVERY_GRANT_RECEIPT_CODE,
            )
            .order_by("created_at")
            .first()
        )
        if application is None:
            return None
        return self._recovery_decision(
            workspace_id=workspace_id,
            provider=provider,
            provider_period_id=provider_period_id,
            subscription_revision_id=subscription_revision_id,
            source_event_id=application.provider_event_id,
        )

    async def compare_and_decide(self, *, command: PaymentRecoveryGrantWrite) -> PaymentRecoveryGrantDecision:
        decision = command.decision
        async with in_transaction() as conn:
            access = await self._load_access(
                workspace_id=decision.workspace_id,
                conn=conn,
                for_update=True,
            )
            if access is None:
                raise self._unavailable("COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
            if access.state_revision != command.expected_access_revision:
                raise self._conflict("COMMERCIAL_ACCESS_STATE_REVISION_STALE")
            existing = await self._get_decision_for_update(decision=decision, conn=conn)
            if existing is not None:
                return existing
            application = await self._load_recovery_application(decision=decision, conn=conn)
            if application is None:
                raise self._unavailable("COMMERCIAL_PROVIDER_EVENT_APPLICATION_UNAVAILABLE")
            if application.result_code not in {None, _RECOVERY_GRANT_RECEIPT_CODE}:
                raise self._conflict("COMMERCIAL_PROVIDER_EVENT_APPLICATION_RESULT_CONFLICT")
            await self.update_fields(
                application,
                fields={"result_code": _RECOVERY_GRANT_RECEIPT_CODE},
                conn=conn,
            )
            return decision

    async def _load_access(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> WorkspaceCommercialAccess | None:
        query = WorkspaceCommercialAccess.filter(workspace_id=workspace_id)
        if for_update:
            query = query.select_for_update()
        access = await self.using_db(query, conn).first()
        if access is not None:
            await self._load_access_relations(
                access=access,
                conn=conn,
                lock_subscription=for_update,
            )
        return access

    async def _current_provider_period_id(self, *, access: WorkspaceCommercialAccess) -> str:
        application = (
            await CommerceProviderEventApplication
            .filter(
                workspace_id=self._workspace_id(access),
                subscription_id=self._subscription_id(access),
                plan_revision_id=self._plan_revision_id(access),
                provider_period_identity__not_isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if application is None or application.provider_period_identity is None:
            raise self._unavailable("COMMERCIAL_PROVIDER_PERIOD_UNAVAILABLE")
        return application.provider_period_identity

    async def _load_transition_receipt(
        self,
        *,
        provider: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommercialAccessStateApplyResult | None:
        identity = self._source_identity(provider=provider, provider_event_id=provider_event_id)
        transition = await self.using_db(
            CommercialAccessTransition.filter(source_identity=identity),
            conn,
        ).first()
        if transition is None:
            return None
        await transition.fetch_related("access", using_db=conn)
        access = transition.access
        await self._load_access_relations(access=access, conn=conn)
        if access.source_identity != identity:
            raise self._unavailable("COMMERCIAL_ACCESS_RECEIPT_SUPERSEDED")
        application = await self.using_db(
            CommerceProviderEventApplication.filter(
                workspace_id=self._workspace_id(access),
                provider=provider,
                provider_event_id=provider_event_id,
                provider_period_identity__not_isnull=True,
            ).order_by("-created_at"),
            conn,
        ).first()
        if application is None or application.provider_period_identity is None:
            raise self._unavailable("COMMERCIAL_PROVIDER_PERIOD_UNAVAILABLE")
        projection = self._projection(access=access, provider_period_id=application.provider_period_identity)
        transition_fact = CommercialAccessTransitionFact(
            workspace_id=self._workspace_id(access),
            transition_identity=identity,
            source_event_id=provider_event_id,
            from_state=CommercialAccessState(transition.from_state),
            to_state=CommercialAccessState(transition.to_state),
            effective_at=transition.created_at,
            recovery_deadline=transition.deadline_at,
        )
        transitioned_state = CommercialAccessState(transition.to_state)
        milestone = self._milestone(state=transitioned_state)
        notification = CommercialLifecycleNotificationFact(
            workspace_id=self._workspace_id(access),
            transition_identity=identity,
            milestone=milestone,
            effective_at=transition.created_at,
            recovery_deadline=transition.deadline_at,
        )
        handoff = (
            HostingCommercialAccessHandoffFact(
                workspace_id=self._workspace_id(access),
                transition_identity=identity,
                state=CommercialAccessState.PAYMENT_RESTRICTED,
                cause="provider_final_unpaid",
                effective_at=transition.created_at,
            )
            if transitioned_state == CommercialAccessState.PAYMENT_RESTRICTED
            else None
        )
        return CommercialAccessStateApplyResult(
            projection=projection,
            transition=transition_fact,
            notification=notification,
            hosting_handoff=handoff,
        )

    async def _require_provider_application(
        self,
        *,
        write: CommercialAccessTransitionWrite,
        access: WorkspaceCommercialAccess,
        conn: BaseDBAsyncClient,
    ) -> None:
        application = await self.using_db(
            CommerceProviderEventApplication.filter(
                provider=write.source.provider,
                provider_event_id=write.source.provider_event_id,
                workspace_id=self._workspace_id(access),
                subscription_id=self._subscription_id(access),
                plan_revision_id=self._plan_revision_id(access),
                provider_period_identity=write.source.provider_period_id,
            ),
            conn,
        ).first()
        if application is None:
            raise self._unavailable("COMMERCIAL_PROVIDER_EVENT_APPLICATION_UNAVAILABLE")

    async def _get_decision_for_update(
        self,
        *,
        decision: PaymentRecoveryGrantDecision,
        conn: BaseDBAsyncClient,
    ) -> PaymentRecoveryGrantDecision | None:
        application = await self.using_db(
            CommerceProviderEventApplication.filter(
                workspace_id=decision.workspace_id,
                provider=decision.provider,
                provider_period_identity=decision.provider_period_id,
                plan_revision_id=decision.subscription_revision_id,
                result_code=_RECOVERY_GRANT_RECEIPT_CODE,
            ).select_for_update(),
            conn,
        ).first()
        if application is None:
            return None
        return self._recovery_decision(
            workspace_id=decision.workspace_id,
            provider=decision.provider,
            provider_period_id=decision.provider_period_id,
            subscription_revision_id=decision.subscription_revision_id,
            source_event_id=application.provider_event_id,
        )

    async def _load_recovery_application(
        self,
        *,
        decision: PaymentRecoveryGrantDecision,
        conn: BaseDBAsyncClient,
    ) -> CommerceProviderEventApplication | None:
        query = CommerceProviderEventApplication.filter(
            workspace_id=decision.workspace_id,
            provider=decision.provider,
            provider_event_id=decision.source_event_id,
            provider_period_identity=decision.provider_period_id,
            plan_revision_id=decision.subscription_revision_id,
        ).select_for_update()
        return await self.using_db(query, conn).first()

    @staticmethod
    def _projection(*, access: WorkspaceCommercialAccess, provider_period_id: str) -> CommercialAccessProjection:
        return CommercialAccessProjection(
            workspace_id=TortoiseCommercialAccessStateRepository._workspace_id(access),
            subscription_revision_id=TortoiseCommercialAccessStateRepository._plan_revision_id(access),
            provider=access.subscription.billing_provider,
            provider_period_id=provider_period_id,
            state=TortoiseCommercialAccessStateRepository._state(access),
            recovery_deadline=access.deadline_at,
            access_revision=access.state_revision,
            source_event_id=access.source_identity.rsplit(":", maxsplit=1)[-1],
            effective_at=access.updated_at,
        )

    @staticmethod
    def _state(access: WorkspaceCommercialAccess) -> CommercialAccessState:
        return CommercialAccessState(access.state)

    @staticmethod
    def _workspace_id(access: WorkspaceCommercialAccess) -> UUID:
        return cast(_AccessIdentifiers, access).workspace_id

    @staticmethod
    def _subscription_id(access: WorkspaceCommercialAccess) -> UUID:
        return cast(_AccessIdentifiers, access).subscription_id

    async def _load_access_relations(
        self,
        *,
        access: WorkspaceCommercialAccess,
        conn: BaseDBAsyncClient | None,
        lock_subscription: bool = False,
    ) -> None:
        subscription_query = WorkspaceSubscription.filter(id=self._subscription_id(access))
        if lock_subscription:
            subscription_query = subscription_query.select_for_update()
        subscription = await self.using_db(subscription_query, conn).first()
        if subscription is None:
            raise self._unavailable("COMMERCIAL_SUBSCRIPTION_UNAVAILABLE")
        await subscription.fetch_related("plan_revision", using_db=conn)
        access.subscription = subscription

    @staticmethod
    def _plan_revision_id(access: WorkspaceCommercialAccess) -> UUID:
        return cast(CommercePlanRevision, access.subscription.plan_revision).id

    @staticmethod
    def _source_identity(*, provider: str, provider_event_id: str) -> str:
        return f"provider:{provider}:{provider_event_id}"

    @staticmethod
    def _milestone(*, state: CommercialAccessState) -> str:
        return {
            CommercialAccessState.PAYMENT_GRACE: "payment_grace_started",
            CommercialAccessState.PAYMENT_RESTRICTED: "payment_restricted",
            CommercialAccessState.NORMAL: "payment_recovered",
        }[state]

    @staticmethod
    def _recovery_decision(
        *,
        workspace_id: UUID,
        provider: str,
        provider_period_id: str,
        subscription_revision_id: UUID,
        source_event_id: str,
    ) -> PaymentRecoveryGrantDecision:
        return PaymentRecoveryGrantDecision(
            workspace_id=workspace_id,
            provider=provider,
            provider_period_id=provider_period_id,
            subscription_revision_id=subscription_revision_id,
            source_event_id=source_event_id,
            grant_required=True,
            decision_identity=(f"provider-period:{provider}:{provider_period_id}:{subscription_revision_id}"),
        )

    @staticmethod
    def _require_current_access(*, access: WorkspaceCommercialAccess, write: CommercialAccessTransitionWrite) -> None:
        if access.state_revision != write.expected_access_revision:
            raise TortoiseCommercialAccessStateRepository._conflict("COMMERCIAL_ACCESS_STATE_REVISION_STALE")
        if TortoiseCommercialAccessStateRepository._plan_revision_id(access) != write.source.subscription_revision_id:
            raise TortoiseCommercialAccessStateRepository._conflict("COMMERCIAL_ACCESS_SUBSCRIPTION_REVISION_CHANGED")
        if access.subscription.billing_provider != write.source.provider:
            raise TortoiseCommercialAccessStateRepository._conflict("COMMERCIAL_ACCESS_PROVIDER_CHANGED")

    def _require_outbox(self) -> CommercialAccessFactOutbox:
        if self._outbox is None:
            raise self._unavailable("COMMERCIAL_ACCESS_FACT_OUTBOX_UNAVAILABLE")
        return self._outbox

    @staticmethod
    def _conflict(error: str) -> Conflict:
        return Conflict(message=t("errors", "BAD_REQUEST"), error=error)

    @staticmethod
    def _unavailable(error: str) -> ServiceUnavailable:
        return ServiceUnavailable(message=t("errors", "BAD_REQUEST"), error=error)
