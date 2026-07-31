from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Forbidden, ServiceUnavailable
from src.models.commerce.billing import (
    CommercePlanRevisionEntitlement,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceSubscription,
)
from src.modules.commerce.entitlement_repository import (
    EntitlementRepository,
    WorkspaceEntitlementSource,
    WorkspaceRevisionEntitlement,
)
from src.modules.commerce.entitlement_schema import (
    DEFAULT_ENTITLEMENT_REGISTRY,
    SITE_GENERATION_ENTITLEMENT,
    WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
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
        self.connections: list[object | None] = []

    async def get_workspace_source(
        self,
        *,
        workspace_id: UUID,
        conn: object | None = None,
    ) -> WorkspaceEntitlementSource | None:
        self.requested_workspace_ids.append(workspace_id)
        self.connections.append(conn)
        return self.source


def _row(
    key: str,
    *,
    included: bool = True,
    allocation_mode: str | None = "workspace",
) -> WorkspaceRevisionEntitlement:
    return WorkspaceRevisionEntitlement(
        key=key,
        definition_is_active=True,
        supports_workspace_allocation=True,
        supports_member_seat_allocation=False,
        is_included=included,
        allocation_mode=allocation_mode if included else None,
        seat_limit_kind=None,
        seat_limit_value=None,
    )


def _rows() -> tuple[WorkspaceRevisionEntitlement, ...]:
    return (
        _row(SITE_GENERATION_ENTITLEMENT),
        _row(WORKSPACE_ROLES_MANAGE_ENTITLEMENT),
    )


def _source(**updates: object) -> WorkspaceEntitlementSource:
    source = WorkspaceEntitlementSource(
        workspace_id=uuid4(),
        plan_code="premium",
        subscription_status=SubscriptionStatus.ACTIVE.value,
        current_period_end=_NOW + timedelta(days=30),
        plan_revision_id=uuid4(),
        plan_revision_status=PlanRevisionStatus.PUBLISHED.value,
        plan_revision_published_at=_NOW - timedelta(days=1),
        entitlements=_rows(),
    )
    return source.model_copy(update=updates)


def _service(repository: _FakeRepository) -> EntitlementService:
    return EntitlementService(_SETTINGS, repository=repository)


def test_entitlement_registry_is_closed_and_rejects_duplicates() -> None:
    assert [definition.key for definition in DEFAULT_ENTITLEMENT_REGISTRY.list_definitions()] == [
        "sites.generate",
        "workspace.roles.manage",
    ]
    with pytest.raises(ValueError, match="Unknown entitlement key"):
        DEFAULT_ENTITLEMENT_REGISTRY.require("sites.unknown")
    with pytest.raises(ValueError, match="Duplicate entitlement key"):
        EntitlementRegistry((
            EntitlementDefinition(key="sites.generate"),
            EntitlementDefinition(key="sites.generate"),
        ))


@pytest.mark.asyncio
async def test_check_grants_entitlement_from_active_bound_published_revision() -> None:
    source = _source()
    repository = _FakeRepository(source)

    decision = await _service(repository).check(
        workspace_id=source.workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
        now=_NOW,
    )

    assert decision.granted is True
    assert decision.reason == "granted"
    assert decision.plan_code == "premium"
    assert decision.subscription_status == SubscriptionStatus.ACTIVE
    assert repository.requested_workspace_ids == [source.workspace_id]


@pytest.mark.asyncio
async def test_check_uses_callers_transaction_connection() -> None:
    source = _source()
    repository = _FakeRepository(source)
    conn = object()

    await _service(repository).check(
        workspace_id=source.workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
        now=_NOW,
        conn=conn,  # type: ignore[arg-type]
    )

    assert repository.connections == [conn]


@pytest.mark.asyncio
async def test_require_returns_granted_decision() -> None:
    source = _source()

    decision = await _service(_FakeRepository(source)).require(
        workspace_id=source.workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
        now=_NOW,
    )

    assert decision.granted is True


@pytest.mark.asyncio
async def test_check_rejects_naive_evaluation_time() -> None:
    source = _source()

    with pytest.raises(ValueError, match="timezone-aware"):
        await _service(_FakeRepository(source)).check(
            workspace_id=source.workspace_id,
            entitlement=SITE_GENERATION_ENTITLEMENT,
            now=datetime(2026, 7, 23),
        )


@pytest.mark.parametrize(
    ("source", "reason"),
    [
        (None, "subscription_missing"),
        (_source(subscription_status=SubscriptionStatus.CANCELED.value), "subscription_inactive"),
        (_source(current_period_end=_NOW), "subscription_period_expired"),
        (
            _source(
                entitlements=(
                    _row(SITE_GENERATION_ENTITLEMENT),
                    _row(WORKSPACE_ROLES_MANAGE_ENTITLEMENT, included=False),
                )
            ),
            "feature_excluded",
        ),
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
        entitlement=WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
        now=_NOW,
    )

    assert decision.granted is False
    assert decision.reason == reason


@pytest.mark.asyncio
async def test_require_raises_stable_forbidden_with_non_sensitive_context() -> None:
    source = _source(
        entitlements=(_row(SITE_GENERATION_ENTITLEMENT, included=False), _row(WORKSPACE_ROLES_MANAGE_ENTITLEMENT)),
    )

    with pytest.raises(Forbidden) as exc_info:
        await _service(_FakeRepository(source)).require(
            workspace_id=source.workspace_id,
            entitlement=SITE_GENERATION_ENTITLEMENT,
            now=_NOW,
        )

    assert exc_info.value.error == COMMERCE_ENTITLEMENT_REQUIRED
    assert exc_info.value.meta == {
        "entitlement": SITE_GENERATION_ENTITLEMENT,
        "reason": "feature_excluded",
        "planCode": "premium",
    }


@pytest.mark.parametrize(
    ("source", "reason"),
    [
        (_source(subscription_status="unknown"), "subscription_status_invalid"),
        (_source(current_period_end=datetime(2026, 8, 1)), "subscription_period_timezone_invalid"),
        (_source(plan_revision_id=None), "plan_revision_missing"),
        (_source(plan_revision_status=PlanRevisionStatus.DRAFT.value), "plan_revision_not_published"),
        (_source(plan_revision_published_at=None), "plan_revision_unpublished"),
        (_source(entitlements=()), "entitlement_row_missing"),
        (
            _source(entitlements=(_row(SITE_GENERATION_ENTITLEMENT), _row(SITE_GENERATION_ENTITLEMENT))),
            "entitlement_row_duplicate",
        ),
        (
            _source(
                entitlements=(
                    WorkspaceRevisionEntitlement.model_construct(
                        **(_row(SITE_GENERATION_ENTITLEMENT).model_dump() | {"allocation_mode": "member_seat"}),
                    ),
                    _row(WORKSPACE_ROLES_MANAGE_ENTITLEMENT),
                )
            ),
            "entitlement_member_seat_allocation_unsupported",
        ),
    ],
)
@pytest.mark.asyncio
async def test_invalid_revision_entitlement_authority_fails_closed(
    source: WorkspaceEntitlementSource,
    reason: str,
) -> None:
    with pytest.raises(ServiceUnavailable) as exc_info:
        await _service(_FakeRepository(source)).check(
            workspace_id=source.workspace_id,
            entitlement=SITE_GENERATION_ENTITLEMENT,
            now=_NOW,
        )

    assert exc_info.value.error == COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID
    assert exc_info.value.meta == {"reason": reason}


@pytest.mark.asyncio
async def test_repository_projects_bound_revision_entitlements_and_uses_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    revision_id = uuid4()
    conn = object()
    subscription = SimpleNamespace(
        workspace_id=workspace_id,
        status=SubscriptionStatus.ACTIVE,
        current_period_end=_NOW + timedelta(days=10),
        plan_revision_id=revision_id,
        plan_revision=SimpleNamespace(
            status=PlanRevisionStatus.PUBLISHED,
            published_at=_NOW,
            plan=SimpleNamespace(code="premium"),
        ),
    )
    captured: dict[str, object] = {}
    rows = [
        {
            "entitlement__key": SITE_GENERATION_ENTITLEMENT,
            "entitlement__is_active": True,
            "entitlement__supports_workspace_allocation": True,
            "entitlement__supports_member_seat_allocation": False,
            "is_included": True,
            "allocation_mode": "workspace",
            "seat_limit_kind": None,
            "seat_limit_value": None,
        }
    ]

    class _SubscriptionQuery:
        def using_db(self, value: object):
            captured["subscription_conn"] = value
            return self

        async def first(self):
            return subscription

    class _EntitlementQuery:
        def values(self, *fields: str):
            captured["entitlement_fields"] = fields
            return self

        def using_db(self, value: object):
            captured["entitlement_conn"] = value
            return self

        def __await__(self):
            async def _result():
                return rows

            return _result().__await__()

    def fake_subscription_filter(**kwargs: object):
        captured["subscription_filter"] = kwargs
        return SimpleNamespace(
            select_related=lambda relation: captured.setdefault("select_related", relation) and _SubscriptionQuery()
        )

    def fake_entitlement_filter(**kwargs: object):
        captured["entitlement_filter"] = kwargs
        return _EntitlementQuery()

    monkeypatch.setattr(WorkspaceSubscription, "filter", fake_subscription_filter)
    monkeypatch.setattr(CommercePlanRevisionEntitlement, "filter", fake_entitlement_filter)

    result = await EntitlementRepository().get_workspace_source(
        workspace_id=workspace_id,
        conn=conn,  # type: ignore[arg-type]
    )

    assert result is not None
    assert result.plan_code == "premium"
    assert result.plan_revision_id == revision_id
    assert result.entitlements[0].key == SITE_GENERATION_ENTITLEMENT
    assert captured["subscription_filter"] == {"workspace_id": workspace_id}
    assert captured["select_related"] == "plan_revision__plan"
    assert captured["entitlement_filter"] == {"plan_revision_id": revision_id}
    assert captured["subscription_conn"] is conn
    assert captured["entitlement_conn"] is conn


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
