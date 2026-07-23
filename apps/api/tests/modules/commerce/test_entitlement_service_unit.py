from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Forbidden, ServiceUnavailable
from src.models.commerce.billing import SubscriptionStatus, WorkspaceSubscription
from src.modules.commerce.entitlement_repository import (
    EntitlementRepository,
    WorkspaceEntitlementSource,
)
from src.modules.commerce.entitlement_schema import (
    DEFAULT_ENTITLEMENT_REGISTRY,
    EntitlementDefinition,
    EntitlementRegistry,
)
from src.modules.commerce.entitlement_service import (
    COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
    COMMERCE_ENTITLEMENT_REQUIRED,
    EntitlementService,
)

_NOW = datetime(2026, 7, 23, tzinfo=UTC)
_SETTINGS = Settings(app_env="test", database={"enabled": False})


class _FakeRepository:
    def __init__(self, source: WorkspaceEntitlementSource | None) -> None:
        self.source = source
        self.requested_workspace_ids: list[UUID] = []

    async def get_workspace_source(
        self,
        *,
        workspace_id: UUID,
    ) -> WorkspaceEntitlementSource | None:
        self.requested_workspace_ids.append(workspace_id)
        return self.source


def _feature(*, included: bool = True, value: str | int | bool | None = None) -> dict[str, object]:
    return {
        "key": "sites.generate",
        "label": "AI site generation",
        "included": included,
        "value": value,
    }


def _source(**updates) -> WorkspaceEntitlementSource:
    source = WorkspaceEntitlementSource(
        workspace_id=uuid4(),
        plan_code="premium",
        plan_is_active=True,
        subscription_status=SubscriptionStatus.ACTIVE.value,
        current_period_end=_NOW + timedelta(days=30),
        plan_features=[_feature(value=12)],
    )
    return source.model_copy(update=updates)


def _service(repository: _FakeRepository) -> EntitlementService:
    return EntitlementService(_SETTINGS, repository=repository)


def test_entitlement_registry_is_closed_and_rejects_duplicates() -> None:
    assert [definition.key for definition in DEFAULT_ENTITLEMENT_REGISTRY.list_definitions()] == ["sites.generate"]
    with pytest.raises(ValueError, match="Unknown entitlement key"):
        DEFAULT_ENTITLEMENT_REGISTRY.require("sites.unknown")
    with pytest.raises(ValueError, match="Duplicate entitlement key"):
        EntitlementRegistry((
            EntitlementDefinition(key="sites.generate"),
            EntitlementDefinition(key="sites.generate"),
        ))


@pytest.mark.asyncio
async def test_check_grants_active_in_period_plan_feature() -> None:
    source = _source()
    repository = _FakeRepository(source)

    decision = await _service(repository).check(
        workspace_id=source.workspace_id,
        entitlement="sites.generate",
        now=_NOW,
    )

    assert decision.granted is True
    assert decision.reason == "granted"
    assert decision.plan_code == "premium"
    assert decision.subscription_status == SubscriptionStatus.ACTIVE
    assert decision.value == 12
    assert repository.requested_workspace_ids == [source.workspace_id]


@pytest.mark.asyncio
async def test_require_returns_granted_decision() -> None:
    source = _source()

    decision = await _service(_FakeRepository(source)).require(
        workspace_id=source.workspace_id,
        entitlement="sites.generate",
        now=_NOW,
    )

    assert decision.granted is True


@pytest.mark.asyncio
async def test_check_rejects_naive_evaluation_time() -> None:
    source = _source()

    with pytest.raises(ValueError, match="timezone-aware"):
        await _service(_FakeRepository(source)).check(
            workspace_id=source.workspace_id,
            entitlement="sites.generate",
            now=datetime(2026, 7, 23),
        )


@pytest.mark.parametrize(
    ("source", "reason"),
    [
        (None, "subscription_missing"),
        (_source(subscription_status=SubscriptionStatus.CANCELED.value), "subscription_inactive"),
        (_source(current_period_end=_NOW), "subscription_period_expired"),
        (_source(plan_is_active=False), "plan_inactive"),
        (_source(plan_features=[]), "feature_missing"),
        (_source(plan_features=[_feature(included=False)]), "feature_excluded"),
    ],
)
@pytest.mark.asyncio
async def test_check_returns_explicit_denial_reasons(
    source: WorkspaceEntitlementSource | None,
    reason: str,
) -> None:
    workspace_id = source.workspace_id if source is not None else uuid4()

    decision = await _service(_FakeRepository(source)).check(
        workspace_id=workspace_id,
        entitlement="sites.generate",
        now=_NOW,
    )

    assert decision.granted is False
    assert decision.reason == reason


@pytest.mark.asyncio
async def test_require_raises_stable_forbidden_with_non_sensitive_context() -> None:
    source = _source(plan_features=[])

    with pytest.raises(Forbidden) as exc_info:
        await _service(_FakeRepository(source)).require(
            workspace_id=source.workspace_id,
            entitlement="sites.generate",
            now=_NOW,
        )

    assert exc_info.value.error == COMMERCE_ENTITLEMENT_REQUIRED
    assert exc_info.value.meta == {
        "entitlement": "sites.generate",
        "reason": "feature_missing",
        "planCode": "premium",
    }


@pytest.mark.parametrize(
    ("source", "reason"),
    [
        (_source(subscription_status="unknown"), "subscription_status_invalid"),
        (_source(current_period_end=datetime(2026, 8, 1)), "subscription_period_timezone_invalid"),
        (_source(plan_features={}), "plan_features_not_list"),
        (_source(plan_features=[{"key": "sites.generate"}]), "plan_feature_invalid"),
        (
            _source(plan_features=[_feature(), _feature()]),
            "plan_feature_duplicate",
        ),
    ],
)
@pytest.mark.asyncio
async def test_invalid_commerce_state_fails_closed_with_stable_error(
    source: WorkspaceEntitlementSource,
    reason: str,
) -> None:
    with pytest.raises(ServiceUnavailable) as exc_info:
        await _service(_FakeRepository(source)).check(
            workspace_id=source.workspace_id,
            entitlement="sites.generate",
            now=_NOW,
        )

    assert exc_info.value.error == COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID
    assert exc_info.value.meta == {"reason": reason}


@pytest.mark.asyncio
async def test_repository_projects_subscription_and_plan_without_exposing_orm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    raw_features = [_feature()]
    subscription = SimpleNamespace(
        workspace_id=workspace_id,
        status=SubscriptionStatus.TRIALING,
        current_period_end=_NOW + timedelta(days=10),
        plan=SimpleNamespace(
            code="premium",
            is_active=True,
            features=raw_features,
        ),
    )
    captured: dict[str, object] = {}

    class _FakeQuery:
        def select_related(self, relation: str):
            captured["select_related"] = relation
            return self

        async def first(self):
            return subscription

    def fake_filter(**kwargs):
        captured["filter"] = kwargs
        return _FakeQuery()

    monkeypatch.setattr(WorkspaceSubscription, "filter", fake_filter)

    result = await EntitlementRepository().get_workspace_source(workspace_id=workspace_id)

    assert result is not None
    assert result == WorkspaceEntitlementSource(
        workspace_id=workspace_id,
        plan_code="premium",
        plan_is_active=True,
        subscription_status="trialing",
        current_period_end=subscription.current_period_end,
        plan_features=raw_features,
    )
    assert result.plan_features is not raw_features
    assert captured == {
        "filter": {"workspace_id": workspace_id},
        "select_related": "plan",
    }


@pytest.mark.asyncio
async def test_repository_returns_none_when_workspace_has_no_subscription(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _EmptyQuery:
        def select_related(self, _relation: str):
            return self

        async def first(self):
            return None

    monkeypatch.setattr(WorkspaceSubscription, "filter", lambda **_kwargs: _EmptyQuery())

    result = await EntitlementRepository().get_workspace_source(workspace_id=uuid4())

    assert result is None
