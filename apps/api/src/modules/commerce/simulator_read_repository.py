from __future__ import annotations

from collections.abc import Sequence
from typing import NamedTuple
from uuid import UUID

from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.payments import (
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceInvoice,
    CommercePaymentCorrection,
    CommerceRefund,
    CommerceTopUpSettlementApplication,
    CommerceTransaction,
)
from src.models.connectors.inbox import ConnectorEventInbox
from src.models.jobs.background_job import BackgroundJobRecord


class SimulatorStateRows(NamedTuple):
    checkouts: Sequence[CommerceCheckoutSession]
    commands: Sequence[CommerceCheckoutOutcomeCommand]
    inboxes: Sequence[ConnectorEventInbox]
    jobs: Sequence[BackgroundJobRecord]
    transactions: Sequence[CommerceTransaction]
    invoices: Sequence[CommerceInvoice]
    refunds: Sequence[CommerceRefund]
    applications: Sequence[CommerceTopUpSettlementApplication]
    corrections: Sequence[CommercePaymentCorrection]


class SimulatorReadRepository(TortoiseORMRepository[CommerceCheckoutSession]):
    def __init__(self) -> None:
        super().__init__(CommerceCheckoutSession)

    async def get_workspace_state(self, *, workspace_id: UUID) -> SimulatorStateRows:
        checkouts = await CommerceCheckoutSession.filter(workspace_id=workspace_id).order_by("-created_at", "-id")
        commands = await CommerceCheckoutOutcomeCommand.filter(workspace_id=workspace_id).order_by("-created_at", "-id")
        transactions = await CommerceTransaction.filter(workspace_id=workspace_id).order_by("-occurred_at", "-id")
        invoices = await CommerceInvoice.filter(workspace_id=workspace_id).order_by("-issued_at", "-id")
        refunds = await CommerceRefund.filter(transaction__workspace_id=workspace_id).order_by("-created_at", "-id")
        applications = await CommerceTopUpSettlementApplication.filter(workspace_id=workspace_id).order_by(
            "-provider_event_occurred_at", "-id"
        )
        corrections = await CommercePaymentCorrection.filter(workspace_id=workspace_id).order_by(
            "-provider_event_occurred_at", "-id"
        )
        inboxes = await self._list_inboxes(commands=commands, applications=applications)
        jobs = await self._list_jobs(commands=commands, inboxes=inboxes)
        return SimulatorStateRows(
            checkouts=checkouts,
            commands=commands,
            inboxes=inboxes,
            jobs=jobs,
            transactions=transactions,
            invoices=invoices,
            refunds=refunds,
            applications=applications,
            corrections=corrections,
        )

    async def _list_inboxes(
        self,
        *,
        commands: Sequence[CommerceCheckoutOutcomeCommand],
        applications: Sequence[CommerceTopUpSettlementApplication],
    ) -> Sequence[ConnectorEventInbox]:
        inbox_ids = [command.accepted_inbox_id for command in commands if command.accepted_inbox_id is not None]
        predicates = [Q(id__in=inbox_ids)] if inbox_ids else []
        predicates.extend(
            Q(
                provider=application.provider,
                provider_mode=str(application.provider_mode),
                provider_account_id=application.provider_account_id,
                provider_event_id=application.provider_event_id,
            )
            for application in applications
        )
        if not predicates:
            return ()
        query = predicates[0]
        for predicate in predicates[1:]:
            query |= predicate
        return await ConnectorEventInbox.filter(query).order_by("-created_at", "-id")

    async def _list_jobs(
        self,
        *,
        commands: Sequence[CommerceCheckoutOutcomeCommand],
        inboxes: Sequence[ConnectorEventInbox],
    ) -> Sequence[BackgroundJobRecord]:
        job_ids = {command.accepted_job_id for command in commands if command.accepted_job_id is not None}
        job_ids.update(inbox.job_id for inbox in inboxes if inbox.job_id is not None)
        if not job_ids:
            return ()
        return await BackgroundJobRecord.filter(id__in=tuple(job_ids)).order_by("-created_at", "-id")
