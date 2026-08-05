from __future__ import annotations

from datetime import datetime
from json import dumps
from typing import Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict
from src.core.services import BaseService
from src.models.commerce.billing import (
    BillingProviderMode,
    CommercePlanRevision,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
)
from src.models.commerce.credit_allocation import (
    CommercePlanPeriodGrant,
    CreditGrantSource,
    CreditLotMutationKind,
    PlanPeriodGrantReason,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotMutation,
)


class ProviderPeriodCreditCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    subscription_id: UUID
    plan_revision_id: UUID
    application_id: UUID
    provider: str
    provider_mode: BillingProviderMode
    provider_account_id: str
    provider_event_id: str
    provider_period_identity: str
    period_start: datetime
    period_end: datetime
    reason: PlanPeriodGrantReason | None


class ProviderPeriodCreditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    grant_identity: str | None
    granted_credits: int
    expired_credits: int
    replayed: bool


class ProviderPeriodCreditStore(Protocol):
    async def get_receipt(self, *, grant_identity: str, conn: BaseDBAsyncClient) -> CommercePlanPeriodGrant | None: ...

    async def lock_plan_lots(self, *, account_id: UUID, conn: BaseDBAsyncClient) -> list[WorkspaceCreditGrantLot]: ...

    async def create_ledger(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> WorkspaceCreditLedger: ...

    async def create_lot(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> WorkspaceCreditGrantLot: ...

    async def create_mutation(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> None: ...

    async def create_receipt(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> None: ...


class TortoiseProviderPeriodCreditStore:
    async def get_receipt(self, *, grant_identity: str, conn: BaseDBAsyncClient) -> CommercePlanPeriodGrant | None:
        return await (
            CommercePlanPeriodGrant.filter(grant_identity=grant_identity).using_db(conn).select_for_update().first()
        )

    async def lock_plan_lots(self, *, account_id: UUID, conn: BaseDBAsyncClient) -> list[WorkspaceCreditGrantLot]:
        return await (
            WorkspaceCreditGrantLot
            .filter(
                account_id=account_id,
                source=CreditGrantSource.PLAN_PERIOD,
                remaining_credits__gt=0,
            )
            .using_db(conn)
            .select_for_update()
            .prefetch_related("plan_revision")
            .all()
        )

    async def create_ledger(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> WorkspaceCreditLedger:
        return await WorkspaceCreditLedger.create(using_db=conn, **values)

    async def create_lot(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> WorkspaceCreditGrantLot:
        return await WorkspaceCreditGrantLot.create(using_db=conn, **values)

    async def create_mutation(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> None:
        await WorkspaceCreditLotMutation.create(using_db=conn, **values)

    async def create_receipt(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> None:
        await CommercePlanPeriodGrant.create(using_db=conn, **values)


class ProviderPeriodCreditGrantService(BaseService):
    """Reconciles exact Provider periods and grants earned Plan Credits once."""

    def __init__(self, *, store: ProviderPeriodCreditStore, settings: Settings | None = None) -> None:
        super().__init__(settings)
        self._store = store

    async def apply(
        self,
        *,
        command: ProviderPeriodCreditCommand,
        account: WorkspaceCreditAccount,
        revision: CommercePlanRevision,
        conn: BaseDBAsyncClient,
    ) -> ProviderPeriodCreditResult:
        self._validate_scope(command=command, account=account, revision=revision)
        account_period_identity = provider_credit_period_identity(command=command)
        period_changed = self._period_changed(
            account=account,
            command=command,
            account_period_identity=account_period_identity,
        )
        if period_changed and int(account.reserved_credits) != 0:
            raise Conflict(error="COMMERCIAL_CREDIT_PERIOD_RESERVATIONS_PENDING")
        expired = await self._expire_superseded_plan_lots(
            command=command,
            account=account,
            revision=revision,
            period_changed=period_changed,
            conn=conn,
        )
        account_changed = expired > 0 or period_changed
        if period_changed:
            account.plan_revision_id = command.plan_revision_id
            account.period_start = command.period_start
            account.period_end = command.period_end
            account.period_identity = account_period_identity
        if command.reason is None:
            await self._save_account_if_changed(account=account, changed=account_changed, conn=conn)
            return ProviderPeriodCreditResult(
                grant_identity=None,
                granted_credits=0,
                expired_credits=expired,
                replayed=False,
            )

        grant_identity = self._grant_identity(command=command, revision=revision)
        receipt = await self._store.get_receipt(grant_identity=grant_identity, conn=conn)
        if receipt is not None:
            self._validate_receipt(receipt=receipt, command=command, revision=revision)
            await self._save_account_if_changed(account=account, changed=account_changed, conn=conn)
            return ProviderPeriodCreditResult(
                grant_identity=grant_identity,
                granted_credits=0,
                expired_credits=expired,
                replayed=True,
            )

        granted = int(revision.credit_grant_amount)
        account.balance_credits += granted
        ledger = await self._create_grant_ledger(
            command=command,
            account=account,
            revision=revision,
            grant_identity=grant_identity,
            granted=granted,
            conn=conn,
        )
        lot = await self._create_grant_lot(
            command=command,
            account=account,
            revision=revision,
            grant_identity=grant_identity,
            granted=granted,
            conn=conn,
        )
        await self._store.create_receipt(
            values={
                "workspace_id": command.workspace_id,
                "account_id": account.id,
                "subscription_id": command.subscription_id,
                "plan_revision_id": command.plan_revision_id,
                "application_id": command.application_id,
                "ledger_entry_id": ledger.id,
                "grant_lot_id": None if lot is None else lot.id,
                "grant_identity": grant_identity,
                "reason": command.reason,
                "provider": command.provider,
                "provider_mode": command.provider_mode,
                "provider_account_id": command.provider_account_id,
                "provider_event_id": command.provider_event_id,
                "provider_period_identity": command.provider_period_identity,
                "period_start": command.period_start,
                "period_end": command.period_end,
                "granted_credits": granted,
            },
            conn=conn,
        )
        await self._save_account_if_changed(account=account, changed=True, conn=conn)
        return ProviderPeriodCreditResult(
            grant_identity=grant_identity,
            granted_credits=granted,
            expired_credits=expired,
            replayed=False,
        )

    async def _expire_superseded_plan_lots(
        self,
        *,
        command: ProviderPeriodCreditCommand,
        account: WorkspaceCreditAccount,
        revision: CommercePlanRevision,
        period_changed: bool,
        conn: BaseDBAsyncClient,
    ) -> int:
        if not period_changed:
            return 0
        expired = 0
        for lot in await self._store.lock_plan_lots(account_id=UUID(str(account.id)), conn=conn):
            superseded = (
                lot.plan_revision_id != command.plan_revision_id
                or revision.credit_refresh_interval is not CreditRefreshInterval.NONE
            )
            if not superseded:
                continue
            if int(lot.reserved_credits) != 0:
                raise Conflict(error="COMMERCIAL_CREDIT_PERIOD_RESERVATIONS_PENDING")
            amount = int(lot.remaining_credits)
            if amount == 0:
                continue
            account.balance_credits -= amount
            if int(account.balance_credits) < int(account.reserved_credits):
                raise RuntimeError("Credit period expiration would underfund reserved Credits")
            expiration_identity = self._expiration_identity(command=command, lot_id=UUID(str(lot.id)))
            ledger = await self._store.create_ledger(
                values=self._ledger_values(
                    command=command,
                    account=account,
                    plan_revision_id=UUID(str(lot.plan_revision_id)),
                    credit_value_micros=int(lot.plan_revision.credit_value_micros),
                    entry_type=CreditLedgerEntryType.EXPIRATION,
                    delta_balance=-amount,
                    idempotency_key=f"commerce:plan-period-expiration:{expiration_identity}",
                    description_key="LEDGER_PLAN_PERIOD_EXPIRATION",
                ),
                conn=conn,
            )
            lot.remaining_credits = 0
            await lot.save(using_db=conn, update_fields=["remaining_credits", "updated_at"])
            await self._store.create_mutation(
                values={
                    "lot_id": lot.id,
                    "ledger_entry_id": ledger.id,
                    "kind": CreditLotMutationKind.EXPIRATION,
                    "delta_remaining_credits": -amount,
                    "source_identity": f"plan-period-expiration:{expiration_identity}",
                    "actor_user_id": None,
                    "reason": "provider_period_advanced",
                    "evidence_reference": command.provider_event_id,
                    "occurred_at": command.period_start,
                },
                conn=conn,
            )
            expired += amount
        return expired

    async def _create_grant_ledger(
        self,
        *,
        command: ProviderPeriodCreditCommand,
        account: WorkspaceCreditAccount,
        revision: CommercePlanRevision,
        grant_identity: str,
        granted: int,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditLedger:
        return await self._store.create_ledger(
            values=self._ledger_values(
                command=command,
                account=account,
                plan_revision_id=command.plan_revision_id,
                credit_value_micros=int(revision.credit_value_micros),
                entry_type=CreditLedgerEntryType.PERIOD_GRANT,
                delta_balance=granted,
                idempotency_key=f"commerce:plan-period-grant:{grant_identity}",
                description_key="LEDGER_PERIOD_GRANT",
            ),
            conn=conn,
        )

    async def _create_grant_lot(
        self,
        *,
        command: ProviderPeriodCreditCommand,
        account: WorkspaceCreditAccount,
        revision: CommercePlanRevision,
        grant_identity: str,
        granted: int,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditGrantLot | None:
        if granted == 0:
            return None
        return await self._store.create_lot(
            values={
                "workspace_id": command.workspace_id,
                "account_id": account.id,
                "subscription_id": command.subscription_id,
                "plan_revision_id": command.plan_revision_id,
                "source": CreditGrantSource.PLAN_PERIOD,
                "source_identity": f"plan-period:{grant_identity}",
                "granted_credits": granted,
                "remaining_credits": granted,
                "reserved_credits": 0,
                "issued_at": command.period_start,
                "expires_at": (
                    None if revision.credit_refresh_interval is CreditRefreshInterval.NONE else command.period_end
                ),
                "actor_user_id": None,
                "description_key": "LEDGER_PERIOD_GRANT",
            },
            conn=conn,
        )

    @staticmethod
    def _ledger_values(
        *,
        command: ProviderPeriodCreditCommand,
        account: WorkspaceCreditAccount,
        plan_revision_id: UUID,
        credit_value_micros: int,
        entry_type: CreditLedgerEntryType,
        delta_balance: int,
        idempotency_key: str,
        description_key: str,
    ) -> dict[str, object]:
        return {
            "workspace_id": command.workspace_id,
            "account_id": account.id,
            "subscription_id": command.subscription_id,
            "plan_revision_id": plan_revision_id,
            "entry_type": entry_type,
            "request_id": None,
            "provider_period_identity": command.provider_period_identity,
            "estimated_cost_micros": None,
            "actual_cost_micros": None,
            "applied_credit_value_micros": credit_value_micros,
            "reserved_credits": 0,
            "committed_credits": 0,
            "delta_balance_credits": delta_balance,
            "delta_reserved_credits": 0,
            "balance_after_credits": account.balance_credits,
            "reserved_after_credits": account.reserved_credits,
            "idempotency_key": idempotency_key,
            "actor_user_id": None,
            "description_key": description_key,
        }

    @staticmethod
    async def _save_account_if_changed(
        *, account: WorkspaceCreditAccount, changed: bool, conn: BaseDBAsyncClient
    ) -> None:
        if not changed:
            return
        account.revision += 1
        await account.save(
            using_db=conn,
            update_fields=[
                "plan_revision_id",
                "balance_credits",
                "period_start",
                "period_end",
                "period_identity",
                "revision",
                "updated_at",
            ],
        )

    @staticmethod
    def _validate_scope(
        *, command: ProviderPeriodCreditCommand, account: WorkspaceCreditAccount, revision: CommercePlanRevision
    ) -> None:
        if command.period_end <= command.period_start:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        if (
            account.workspace_id != command.workspace_id
            or account.subscription_id != command.subscription_id
            or revision.id != command.plan_revision_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")

    @staticmethod
    def _period_changed(
        *,
        account: WorkspaceCreditAccount,
        command: ProviderPeriodCreditCommand,
        account_period_identity: str,
    ) -> bool:
        return (
            account.plan_revision_id != command.plan_revision_id
            or account.period_start != command.period_start
            or account.period_end != command.period_end
            or account.period_identity != account_period_identity
        )

    @staticmethod
    def _grant_identity(*, command: ProviderPeriodCreditCommand, revision: CommercePlanRevision) -> str:
        scope = (
            [str(command.workspace_id), "revision-once", str(command.plan_revision_id)]
            if revision.credit_refresh_interval is CreditRefreshInterval.NONE
            else [
                str(command.workspace_id),
                command.provider,
                command.provider_mode.value,
                command.provider_account_id,
                command.provider_period_identity,
                str(command.plan_revision_id),
                command.period_start.isoformat(),
                command.period_end.isoformat(),
            ]
        )
        return str(uuid5(NAMESPACE_URL, dumps(scope, separators=(",", ":"))))

    @staticmethod
    def _expiration_identity(*, command: ProviderPeriodCreditCommand, lot_id: UUID) -> str:
        return str(
            uuid5(
                NAMESPACE_URL,
                dumps(
                    [
                        str(command.workspace_id),
                        command.provider,
                        command.provider_mode.value,
                        command.provider_account_id,
                        command.provider_period_identity,
                        str(lot_id),
                    ],
                    separators=(",", ":"),
                ),
            )
        )

    @staticmethod
    def _validate_receipt(
        *, receipt: CommercePlanPeriodGrant, command: ProviderPeriodCreditCommand, revision: CommercePlanRevision
    ) -> None:
        stable_scope_matches = (
            receipt.workspace_id == command.workspace_id
            and receipt.subscription_id == command.subscription_id
            and receipt.plan_revision_id == command.plan_revision_id
            and receipt.provider == command.provider
            and receipt.provider_mode == command.provider_mode
            and receipt.provider_account_id == command.provider_account_id
            and int(receipt.granted_credits) == int(revision.credit_grant_amount)
        )
        period_matches = revision.credit_refresh_interval is CreditRefreshInterval.NONE or (
            receipt.provider_period_identity == command.provider_period_identity
            and receipt.period_start == command.period_start
            and receipt.period_end == command.period_end
        )
        if not stable_scope_matches or not period_matches:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")


def provider_credit_period_identity(*, command: ProviderPeriodCreditCommand) -> str:
    canonical = dumps(
        [
            str(command.workspace_id),
            command.provider,
            command.provider_mode.value,
            command.provider_account_id,
            command.subscription_id.hex,
            str(command.plan_revision_id),
            command.period_start.isoformat(),
            command.period_end.isoformat(),
        ],
        separators=(",", ":"),
    )
    return f"provider-period:{uuid5(NAMESPACE_URL, canonical)}"


def build_provider_period_credit_grant_service(*, settings: Settings | None = None) -> ProviderPeriodCreditGrantService:
    return ProviderPeriodCreditGrantService(
        store=TortoiseProviderPeriodCreditStore(),
        settings=settings,
    )
