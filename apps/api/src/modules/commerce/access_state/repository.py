from __future__ import annotations

from datetime import datetime
from typing import Protocol, cast
from uuid import NAMESPACE_URL, UUID, uuid5

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.i18n import t
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    CommerceDunningPolicy,
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
    dunning_policy_id: UUID | None


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
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyResult | None:
        if conn is not None:
            return await self._load_transition_receipt(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=provider_event_id,
                conn=conn,
            )
        async with in_transaction() as transaction:
            return await self._load_transition_receipt(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=provider_event_id,
                conn=transaction,
            )

    async def get_projection(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> CommercialAccessProjection | None:
        access = await self._load_access(
            workspace_id=workspace_id,
            conn=conn,
            for_update=for_update,
        )
        if access is None:
            return None
        period_id = access.provider_period_identity
        period_start = access.provider_period_start
        period_end = access.provider_period_end
        if period_id is None:
            period_id, period_start, period_end = await self._current_provider_period(access=access, conn=conn)
        return self._projection(
            access=access,
            provider_period_id=period_id,
            provider_period_start=period_start,
            provider_period_end=period_end,
        )

    async def get_current_result(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyResult | None:
        if conn is None:
            async with in_transaction() as transaction_conn:
                return await self.get_current_result(workspace_id=workspace_id, conn=transaction_conn)
        access = await self._load_access(workspace_id=workspace_id, conn=conn)
        if access is None or not access.source_identity.startswith(("provider:", "provider-event:")):
            return None
        transaction = await self.using_db(
            CommercialAccessTransition.filter(
                access_id=access.id,
                resulting_state_revision=access.state_revision,
            ),
            conn,
        ).first()
        if transaction is None:
            raise self._unavailable("COMMERCIAL_ACCESS_CURRENT_TRANSITION_UNAVAILABLE")
        return await self._transition_receipt(transition=transaction, conn=conn)

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

    async def compare_and_append(
        self,
        *,
        write: CommercialAccessTransitionWrite,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyResult:
        if conn is not None:
            return await self._compare_and_append(write=write, conn=conn)
        async with in_transaction() as transaction:
            return await self._compare_and_append(write=write, conn=transaction)

    async def _compare_and_append(
        self,
        *,
        write: CommercialAccessTransitionWrite,
        conn: BaseDBAsyncClient,
    ) -> CommercialAccessStateApplyResult:
        outbox = self._require_outbox()
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
                        "provider_period_identity": write.source.provider_period_id,
                        "provider_period_start": write.source.provider_period_start,
                        "provider_period_end": write.source.provider_period_end,
                        "source_occurred_at": write.source.occurred_at,
                        "dunning_policy_id": write.policy.policy_id,
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
                    provider=write.source.provider,
                    provider_mode=write.source.provider_mode,
                    provider_account_id=write.source.provider_account_id,
                    provider_event_id=write.source.provider_event_id,
                    subscription_revision_identity=write.source.subscription_revision_id,
                    provider_period_identity=write.source.provider_period_id,
                    provider_period_start=write.source.provider_period_start,
                    provider_period_end=write.source.provider_period_end,
                    source_occurred_at=write.source.occurred_at,
                    resulting_state_revision=write.projection.access_revision,
                    dunning_policy_revision=write.policy.revision,
                    dunning_policy_id=write.policy.policy_id,
                    source_identity=write.result.transition.transition_identity,
                    correlation_id=uuid5(NAMESPACE_URL, write.result.transition.transition_identity),
                    conn=savepoint_conn,
                )
        except IntegrityError:
            receipt = await self._load_transition_receipt(
                provider=write.source.provider,
                provider_mode=write.source.provider_mode,
                provider_account_id=write.source.provider_account_id,
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
        locked_subscription = None
        if for_update:
            locked_subscription = await self.using_db(
                WorkspaceSubscription.filter(workspace_id=workspace_id).select_for_update(),
                conn,
            ).first()
            if locked_subscription is None:
                raise self._unavailable("COMMERCIAL_SUBSCRIPTION_UNAVAILABLE")
        query = WorkspaceCommercialAccess.filter(workspace_id=workspace_id)
        if for_update:
            query = query.select_for_update()
        access = await self.using_db(query, conn).first()
        if access is not None:
            await self._load_access_relations(
                access=access,
                conn=conn,
                subscription=locked_subscription,
            )
        return access

    async def _current_provider_period(
        self,
        *,
        access: WorkspaceCommercialAccess,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[str, datetime, datetime]:
        application = await self.using_db(
            CommerceProviderEventApplication.filter(
                workspace_id=self._workspace_id(access),
                subscription_id=self._subscription_id(access),
                plan_revision_id=self._plan_revision_id(access),
                provider_period_identity__not_isnull=True,
                applied_at__not_isnull=True,
            ).order_by("-created_at"),
            conn,
        ).first()
        if application is None or application.provider_period_identity is None:
            subscription_identity = access.subscription.external_subscription_id or str(access.subscription.id)
            return (
                f"subscription:{subscription_identity}:{access.subscription.current_period_start.isoformat()}",
                access.subscription.current_period_start,
                access.subscription.current_period_end,
            )
        return (
            application.provider_period_identity,
            access.subscription.current_period_start,
            access.subscription.current_period_end,
        )

    async def _load_transition_receipt(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommercialAccessStateApplyResult | None:
        transition = await self.using_db(
            CommercialAccessTransition.filter(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=provider_event_id,
            ),
            conn,
        ).first()
        if transition is None:
            return None
        return await self._transition_receipt(transition=transition, conn=conn)

    async def _transition_receipt(
        self,
        *,
        transition: CommercialAccessTransition,
        conn: BaseDBAsyncClient,
    ) -> CommercialAccessStateApplyResult:
        await transition.fetch_related("access", using_db=conn)
        access = transition.access
        if transition.provider_period_identity is None or transition.resulting_state_revision is None:
            raise self._unavailable("COMMERCIAL_PROVIDER_PERIOD_UNAVAILABLE")
        identity = transition.source_identity
        projection = CommercialAccessProjection(
            workspace_id=self._workspace_id(access),
            subscription_revision_id=transition.subscription_revision_identity,
            provider=transition.provider,
            provider_mode=transition.provider_mode,
            provider_period_id=transition.provider_period_identity,
            provider_period_start=transition.provider_period_start,
            provider_period_end=transition.provider_period_end,
            state=CommercialAccessState(transition.to_state),
            recovery_deadline=transition.deadline_at,
            access_revision=int(transition.resulting_state_revision),
            source_event_id=transition.provider_event_id,
            source_occurred_at=transition.source_occurred_at,
            dunning_policy_revision=transition.dunning_policy_revision,
            effective_at=transition.created_at,
        )
        transition_fact = CommercialAccessTransitionFact(
            workspace_id=self._workspace_id(access),
            transition_identity=identity,
            source_event_id=transition.provider_event_id,
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
                provider_mode=write.source.provider_mode,
                provider_account_id=write.source.provider_account_id,
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
    def _projection(
        *,
        access: WorkspaceCommercialAccess,
        provider_period_id: str,
        provider_period_start: datetime | None,
        provider_period_end: datetime | None,
    ) -> CommercialAccessProjection:
        policy_revision = (
            None
            if cast(_AccessIdentifiers, access).dunning_policy_id is None
            else int(cast(CommerceDunningPolicy, access.dunning_policy).revision)
        )
        return CommercialAccessProjection(
            workspace_id=TortoiseCommercialAccessStateRepository._workspace_id(access),
            subscription_revision_id=TortoiseCommercialAccessStateRepository._plan_revision_id(access),
            provider=access.subscription.billing_provider,
            provider_mode=(
                str(access.subscription.provider_mode) if access.subscription.provider_mode is not None else None
            ),
            provider_period_id=provider_period_id,
            provider_period_start=provider_period_start,
            provider_period_end=provider_period_end,
            state=TortoiseCommercialAccessStateRepository._state(access),
            recovery_deadline=access.deadline_at,
            access_revision=access.state_revision,
            source_event_id=access.source_identity.rsplit(":", maxsplit=1)[-1],
            source_occurred_at=access.source_occurred_at,
            dunning_policy_revision=policy_revision,
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
        subscription: WorkspaceSubscription | None = None,
    ) -> None:
        if subscription is None:
            subscription = await self.using_db(
                WorkspaceSubscription.filter(id=self._subscription_id(access)),
                conn,
            ).first()
        if subscription is None:
            raise self._unavailable("COMMERCIAL_SUBSCRIPTION_UNAVAILABLE")
        if subscription.id != self._subscription_id(access):
            raise self._conflict("COMMERCIAL_ACCESS_SUBSCRIPTION_CHANGED")
        await subscription.fetch_related("plan_revision", using_db=conn)
        access.subscription = subscription
        if cast(_AccessIdentifiers, access).dunning_policy_id is not None:
            await access.fetch_related("dunning_policy", using_db=conn)

    @staticmethod
    def _plan_revision_id(access: WorkspaceCommercialAccess) -> UUID:
        return cast(CommercePlanRevision, access.subscription.plan_revision).id

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
        if str(access.subscription.provider_mode) != write.source.provider_mode:
            raise TortoiseCommercialAccessStateRepository._conflict("COMMERCIAL_ACCESS_PROVIDER_MODE_CHANGED")

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
