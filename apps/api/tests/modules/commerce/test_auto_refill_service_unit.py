from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.models.commerce.billing import BillingProviderMode
from src.modules.commerce.auto_refill_schema import WorkspaceAutoRefillPolicyWrite
from src.modules.commerce.auto_refill_service import AutoRefillService


class _Repository:
    def __init__(self) -> None:
        self.policy = None
        self.receipt = None
        self.offer = SimpleNamespace(id=uuid4(), code="credits-100", revision=3, credit_amount=100)
        self.price = SimpleNamespace(amount_micros=5_000_000, currency="USD")

    async def lock_workspace_and_actor(self, **_kwargs):
        return None

    async def get_policy(self, **_kwargs):
        return self.policy

    async def lock_policy(self, **_kwargs):
        return self.policy

    async def lock_offer_price(self, **_kwargs):
        return self.offer, self.price

    async def save_policy(self, **kwargs):
        self.policy = SimpleNamespace(
            workspace_id=kwargs["workspace_id"],
            offer_id=kwargs["offer_id"],
            offer=self.offer,
            is_enabled=kwargs["is_enabled"],
            trigger_below_credits=kwargs["trigger_below_credits"],
            monthly_ceiling_micros=kwargs["monthly_ceiling_micros"],
            currency=kwargs["currency"],
            revision=kwargs["revision"],
        )
        return self.policy

    async def lock_receipt(self, **_kwargs):
        return self.receipt

    async def record_receipt(self, **kwargs):
        self.receipt = SimpleNamespace(
            request_fingerprint=kwargs["request_fingerprint"],
            result_revision=kwargs["result_revision"],
            result_snapshot=kwargs["result_snapshot"],
        )
        return self.receipt


@asynccontextmanager
async def _transaction():
    yield object()


def _service(repository: _Repository) -> AutoRefillService:
    service = AutoRefillService(
        settings=Settings(),
        connector_registry=SimpleNamespace(),
        repository=repository,
    )
    service.tx = lambda: _transaction()  # type: ignore[method-assign]
    service._provider_context = lambda required: ("stripe", BillingProviderMode.TEST)  # type: ignore[method-assign]
    return service


def _command(*, offer_id, enabled=False, revision=1, key="auto-refill-1"):
    return WorkspaceAutoRefillPolicyWrite(
        offer_id=offer_id,
        is_enabled=enabled,
        trigger_below_credits=25,
        monthly_ceiling_micros=10_000_000,
        currency="USD",
        expected_revision=revision,
        idempotency_key=key,
    )


@pytest.mark.asyncio
async def test_auto_refill_policy_is_revisioned_and_replayable() -> None:
    repository = _Repository()
    service = _service(repository)
    workspace_id = uuid4()
    actor_user_id = uuid4()
    command = _command(offer_id=repository.offer.id)

    first = await service.update(workspace_id=workspace_id, actor_user_id=actor_user_id, command=command)
    replay = await service.update(workspace_id=workspace_id, actor_user_id=actor_user_id, command=command)

    assert first.revision == 1
    assert first.is_enabled is False
    assert replay.replayed is True
    assert replay.revision == first.revision


@pytest.mark.asyncio
async def test_auto_refill_enable_is_explicitly_unavailable_without_charge_capability() -> None:
    repository = _Repository()
    service = _service(repository)

    with pytest.raises(ServiceUnavailable, match="BILLING_AUTO_REFILL_UNAVAILABLE"):
        await service.update(
            workspace_id=uuid4(),
            actor_user_id=uuid4(),
            command=_command(offer_id=repository.offer.id, enabled=True),
        )


@pytest.mark.asyncio
async def test_auto_refill_revision_conflict_is_not_silently_overwritten() -> None:
    repository = _Repository()
    service = _service(repository)
    workspace_id = uuid4()
    actor_user_id = uuid4()
    command = _command(offer_id=repository.offer.id)
    await service.update(workspace_id=workspace_id, actor_user_id=actor_user_id, command=command)
    repository.receipt = None

    with pytest.raises(Conflict, match="BILLING_AUTO_REFILL_REVISION_STALE"):
        await service.update(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            command=_command(offer_id=repository.offer.id, revision=2, key="auto-refill-2"),
        )
