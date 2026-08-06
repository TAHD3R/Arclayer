from __future__ import annotations

import hashlib
import json
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services.base import BaseService
from src.models.commerce.billing import BillingProviderMode
from src.modules.commerce.billing_connector import BillingConnector, build_billing_operation_idempotency_key
from src.modules.commerce.schema import BillingRedirectOut, TopUpCheckoutSessionCreate
from src.modules.commerce.top_up_checkout_repository import (
    TopUpCheckoutCreate,
    TopUpCheckoutSelection,
    TopUpCheckoutSessionRecord,
    TortoiseTopUpCheckoutRepository,
)


class TopUpCheckoutStore(Protocol):
    async def lock_idempotency_scope(self, *, idempotency_key: str, conn: BaseDBAsyncClient) -> None: ...

    async def require_replay(
        self,
        *,
        idempotency_key: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> TopUpCheckoutSessionRecord | None: ...

    async def get_checkout_selection(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        top_up_offer_id: UUID,
        provider: str,
        provider_mode: BillingProviderMode,
        conn: BaseDBAsyncClient,
    ) -> TopUpCheckoutSelection: ...

    async def create_top_up_checkout(
        self,
        *,
        settings: Settings,
        command: TopUpCheckoutCreate,
        conn: BaseDBAsyncClient,
    ) -> TopUpCheckoutSessionRecord: ...


class TopUpCheckoutService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        provider: BillingConnector,
        provider_name: str,
        repository: TopUpCheckoutStore,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._provider = provider
        self._provider_name = provider_name
        self._repository = repository

    async def create(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: TopUpCheckoutSessionCreate,
    ) -> BillingRedirectOut:
        caller_idempotency_key = idempotency_key.strip()
        if not caller_idempotency_key:
            raise BadRequest(error="BILLING_CHECKOUT_IDEMPOTENCY_KEY_INVALID")
        try:
            provider_mode = BillingProviderMode(self._provider.provider_mode)
        except ValueError as exc:
            raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID") from exc
        provider_idempotency_key = build_billing_operation_idempotency_key(
            operation="top-up-checkout",
            business_identity=(str(workspace_id), str(actor_user_id), caller_idempotency_key),
        )
        request_fingerprint = _top_up_checkout_request_fingerprint(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            top_up_offer_id=payload.top_up_offer_id,
            provider=self._provider_name,
            provider_mode=provider_mode,
        )
        async with self.tx() as conn:
            await self._repository.lock_idempotency_scope(idempotency_key=provider_idempotency_key, conn=conn)
            replay = await self._repository.require_replay(
                idempotency_key=provider_idempotency_key,
                request_fingerprint=request_fingerprint,
                conn=conn,
            )
            if replay is not None:
                return BillingRedirectOut(url=replay.checkout_url)
            selection = await self._repository.get_checkout_selection(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                top_up_offer_id=payload.top_up_offer_id,
                provider=self._provider_name,
                provider_mode=provider_mode,
                conn=conn,
            )
            return await self._create_pending_checkout(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                provider_mode=provider_mode,
                provider_idempotency_key=provider_idempotency_key,
                request_fingerprint=request_fingerprint,
                selection=selection,
                conn=conn,
            )

    async def _create_pending_checkout(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        provider_mode: BillingProviderMode,
        provider_idempotency_key: str,
        request_fingerprint: str,
        selection: TopUpCheckoutSelection,
        conn: BaseDBAsyncClient,
    ) -> BillingRedirectOut:
        admin_url = self._settings.saas.admin_url.rstrip("/")
        session = await self._provider.create_top_up_checkout_session(
            workspace_id=str(workspace_id),
            top_up_offer_id=str(selection.top_up_offer_id),
            top_up_offer_revision=selection.top_up_offer_revision,
            credit_amount=selection.credit_amount,
            external_price_id=selection.external_price_id,
            currency=selection.currency,
            amount_micros=selection.amount_micros,
            success_url=f"{admin_url}/?billing=top-up-success",
            cancel_url=f"{admin_url}/?billing=top-up-canceled",
            customer_id=selection.customer_id,
            idempotency_key=provider_idempotency_key,
        )
        checkout = await self._repository.create_top_up_checkout(
            settings=self._settings,
            command=TopUpCheckoutCreate(
                workspace_id=workspace_id,
                top_up_offer_id=selection.top_up_offer_id,
                top_up_offer_revision=selection.top_up_offer_revision,
                credit_amount=selection.credit_amount,
                provider=self._provider_name,
                provider_mode=provider_mode,
                provider_account_id=session.provider_account_id,
                currency=selection.currency,
                amount_micros=selection.amount_micros,
                external_price_id=selection.external_price_id,
                external_session_id=session.external_session_id,
                checkout_url=session.url,
                idempotency_key=provider_idempotency_key,
                request_fingerprint=request_fingerprint,
                actor_user_id=actor_user_id,
                expires_at=session.expires_at,
            ),
            conn=conn,
        )
        return BillingRedirectOut(url=checkout.checkout_url)


def build_top_up_checkout_service(settings: Settings, connector_registry: ConnectorRegistry) -> TopUpCheckoutService:
    billing = settings.billing
    if billing.provider == "disabled":
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
    registration = connector_registry.resolve(f"billing.{billing.provider}")
    if registration is None:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_SUPPORTED")
    connector = registration.factory()
    if not isinstance(connector, BillingConnector):
        raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID")
    return TopUpCheckoutService(
        settings=settings,
        provider=connector,
        provider_name=billing.provider,
        repository=TortoiseTopUpCheckoutRepository(),
    )


def _top_up_checkout_request_fingerprint(
    *,
    workspace_id: UUID,
    actor_user_id: UUID,
    top_up_offer_id: UUID,
    provider: str,
    provider_mode: BillingProviderMode,
) -> str:
    payload = {
        "actor_user_id": str(actor_user_id),
        "provider": provider,
        "provider_mode": str(provider_mode),
        "top_up_offer_id": str(top_up_offer_id),
        "workspace_id": str(workspace_id),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()
