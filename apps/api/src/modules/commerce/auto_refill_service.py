from __future__ import annotations

import hashlib
import json
from typing import cast
from uuid import UUID

from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService, ServiceContractError
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceAutoRefillExecutionState, WorkspaceAutoRefillPolicy
from src.modules.commerce.auto_refill_repository import (
    AutoRefillPolicyStore,
    TortoiseAutoRefillPolicyRepository,
)
from src.modules.commerce.auto_refill_schema import (
    AutoRefillOfferOut,
    WorkspaceAutoRefillPolicyOut,
    WorkspaceAutoRefillPolicyWrite,
)
from src.modules.commerce.billing_connector import BillingConnector


class AutoRefillService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        connector_registry: ConnectorRegistry,
        repository: AutoRefillPolicyStore,
    ) -> None:
        super().__init__(settings)
        self._connector_registry = connector_registry
        self._repository = repository

    async def get(self, *, workspace_id: UUID) -> WorkspaceAutoRefillPolicyOut:
        provider, provider_mode = self._provider_context(required=False)
        async with self.tx() as conn:
            policy = await self._repository.get_policy(workspace_id=workspace_id, conn=conn)
            offers = (
                []
                if provider is None or provider_mode is None
                else await self._repository.list_offer_prices(
                    provider=provider,
                    provider_mode=provider_mode,
                    currency=None if policy is None else policy.currency,
                    conn=conn,
                )
            )
        if policy is None:
            return _empty_result(
                workspace_id=workspace_id,
                provider=provider,
                provider_mode=provider_mode,
                available_offers=offers,
            )
        return _result(
            policy=policy,
            provider=provider,
            provider_mode=provider_mode,
            execution_state=(
                CommerceAutoRefillExecutionState.UNAVAILABLE
                if policy.is_enabled
                else CommerceAutoRefillExecutionState.DISABLED
            ),
            available_offers=offers,
        )

    async def update(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        command: WorkspaceAutoRefillPolicyWrite,
    ) -> WorkspaceAutoRefillPolicyOut:
        provider, provider_mode = self._provider_context(required=True)
        if provider is None or provider_mode is None:
            raise ServiceUnavailable(error="BILLING_AUTO_REFILL_PROVIDER_NOT_CONFIGURED")
        key_hash = _key_hash(workspace_id=workspace_id, idempotency_key=command.idempotency_key)
        fingerprint = _fingerprint(workspace_id=workspace_id, actor_user_id=actor_user_id, command=command)
        async with self.tx() as conn:
            await self._repository.lock_workspace_and_actor(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            receipt = await self._repository.lock_receipt(
                workspace_id=workspace_id,
                idempotency_key_hash=key_hash,
                conn=conn,
            )
            if receipt is not None:
                return _replay(receipt=receipt, fingerprint=fingerprint, workspace_id=workspace_id)
            policy = await self._repository.lock_policy(workspace_id=workspace_id, conn=conn)
            current_revision = 1 if policy is None else int(policy.revision)
            if current_revision != command.expected_revision:
                raise Conflict(error="BILLING_AUTO_REFILL_REVISION_STALE")
            offer, price = await self._repository.lock_offer_price(
                offer_id=UUID(str(command.offer_id)),
                provider=provider,
                provider_mode=provider_mode,
                currency=command.currency,
                conn=conn,
            )
            if command.monthly_ceiling_micros < int(price.amount_micros):
                raise Conflict(error="BILLING_AUTO_REFILL_CEILING_BELOW_OFFER")
            if command.is_enabled:
                raise ServiceUnavailable(error="BILLING_AUTO_REFILL_UNAVAILABLE")
            result_revision = 1 if policy is None else current_revision + 1
            policy = await self._repository.save_policy(
                policy=policy,
                workspace_id=workspace_id,
                offer_id=offer.id,
                is_enabled=False,
                trigger_below_credits=command.trigger_below_credits,
                monthly_ceiling_micros=command.monthly_ceiling_micros,
                currency=price.currency,
                revision=result_revision,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            result = _result(
                policy=policy,
                provider=provider,
                provider_mode=provider_mode,
                execution_state=CommerceAutoRefillExecutionState.DISABLED,
            )
            await self._repository.record_receipt(
                settings=self.settings,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                result_revision=result.revision,
                result_snapshot=cast(JsonObject, result.model_dump(mode="json")),
                conn=conn,
            )
            return result

    def _provider_context(self, *, required: bool) -> tuple[str | None, BillingProviderMode | None]:
        provider = self.settings.billing.provider
        if provider == "disabled":
            if required:
                raise ServiceUnavailable(error="BILLING_AUTO_REFILL_PROVIDER_NOT_CONFIGURED")
            return None, None
        registration = self._connector_registry.resolve(f"billing.{provider}")
        if registration is None:
            raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_SUPPORTED")
        connector = registration.factory()
        if not isinstance(connector, BillingConnector):
            raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID")
        try:
            return provider, BillingProviderMode(connector.provider_mode)
        except ValueError as exc:
            raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID") from exc


def build_auto_refill_service(settings: Settings, connector_registry: ConnectorRegistry) -> AutoRefillService:
    return AutoRefillService(
        settings=settings,
        connector_registry=connector_registry,
        repository=TortoiseAutoRefillPolicyRepository(),
    )


def _empty_result(
    *,
    workspace_id: UUID,
    provider: str | None,
    provider_mode: BillingProviderMode | None,
    available_offers: list[AutoRefillOfferOut],
) -> WorkspaceAutoRefillPolicyOut:
    return WorkspaceAutoRefillPolicyOut(
        workspace_id=workspace_id,
        configured=False,
        offer_id=None,
        offer_code=None,
        offer_revision=None,
        credit_amount=None,
        is_enabled=False,
        trigger_below_credits=None,
        monthly_ceiling_micros=None,
        currency=None,
        provider=provider,
        provider_mode=provider_mode,
        execution_state=CommerceAutoRefillExecutionState.DISABLED,
        revision=1,
        available_offers=available_offers,
    )


def _result(
    *,
    policy: WorkspaceAutoRefillPolicy,
    provider: str | None,
    provider_mode: BillingProviderMode | None,
    execution_state: CommerceAutoRefillExecutionState,
    available_offers: list[AutoRefillOfferOut] | None = None,
) -> WorkspaceAutoRefillPolicyOut:
    offer = policy.offer
    return WorkspaceAutoRefillPolicyOut(
        workspace_id=policy.workspace_id,
        configured=True,
        offer_id=policy.offer_id,
        offer_code=offer.code,
        offer_revision=int(offer.revision),
        credit_amount=int(offer.credit_amount),
        is_enabled=policy.is_enabled,
        trigger_below_credits=int(policy.trigger_below_credits),
        monthly_ceiling_micros=int(policy.monthly_ceiling_micros),
        currency=policy.currency,
        provider=provider,
        provider_mode=provider_mode,
        execution_state=execution_state,
        revision=int(policy.revision),
        available_offers=[] if available_offers is None else available_offers,
    )


def _replay(*, receipt, fingerprint: str, workspace_id: UUID) -> WorkspaceAutoRefillPolicyOut:
    if receipt.request_fingerprint != fingerprint:
        raise Conflict(error="BILLING_AUTO_REFILL_IDEMPOTENCY_CONFLICT")
    try:
        result = WorkspaceAutoRefillPolicyOut.model_validate(receipt.result_snapshot)
    except ValidationError as exc:
        raise ServiceContractError("Auto-refill receipt violates the output contract") from exc
    if result.workspace_id != workspace_id or result.revision != int(receipt.result_revision):
        raise ServiceContractError("Auto-refill receipt metadata does not match its result")
    return result.model_copy(update={"replayed": True})


def _key_hash(*, workspace_id: UUID, idempotency_key: str) -> str:
    return hashlib.sha256(f"auto-refill\0{workspace_id}\0{idempotency_key}".encode()).hexdigest()


def _fingerprint(*, workspace_id: UUID, actor_user_id: UUID, command: WorkspaceAutoRefillPolicyWrite) -> str:
    payload = command.model_dump(mode="json", exclude={"idempotency_key"})
    payload.update({"actor_user_id": str(actor_user_id), "workspace_id": str(workspace_id)})
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
