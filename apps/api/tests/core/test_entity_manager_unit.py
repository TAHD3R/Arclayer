from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

from src.core.entity_manager.manager import EntityManager
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.lifecycles.specs import LifecycleAction, LifecycleEvent
from src.core.query.operators import FilterCondition, FilterOperator


class _FakeItemsRepo:
    def __init__(self) -> None:
        self.model = SimpleNamespace(id=uuid4())
        self.item = SimpleNamespace(id=uuid4(), draft_version=0, visibility=None)
        self.created_item_payload: dict[str, object] | None = None
        self.created_version_payload: dict[str, object] | None = None
        self.deleted_item_id: object | None = None

    async def get_model_definition_by_key(self, **kwargs: Any) -> SimpleNamespace:
        return self.model

    async def get_item_with_model(self, **kwargs: Any) -> SimpleNamespace:
        self.item.model_definition = SimpleNamespace(singular_key=kwargs.get("model_key", "article"))
        return self.item

    async def create_item(self, **kwargs: Any) -> SimpleNamespace:
        self.created_item_payload = kwargs
        self.item.visibility = kwargs["visibility"]
        return self.item

    async def create_version(self, **kwargs: Any) -> SimpleNamespace:
        self.created_version_payload = kwargs
        return SimpleNamespace(id=uuid4(), **kwargs)

    async def update_item_fields(
        self,
        item: SimpleNamespace,
        *,
        fields: dict[str, Any],
        **_: Any,
    ) -> SimpleNamespace:
        for key, value in fields.items():
            setattr(item, key, value)
        return item

    async def delete_item(self, **kwargs: Any) -> int:
        self.deleted_item_id = kwargs["item_id"]
        return 1


@asynccontextmanager
async def _fake_transaction():
    yield None


async def test_entity_manager_create_dispatches_lifecycle_and_keeps_public_draft_defaults(monkeypatch) -> None:
    monkeypatch.setattr("src.core.entity_manager.manager.in_transaction", _fake_transaction)
    repo = _FakeItemsRepo()
    lifecycle = LifecycleDispatcher()

    async def add_lifecycle_field(event: LifecycleEvent) -> None:
        event.data["normalized"] = True

    await lifecycle.register(
        subscriber_id="test",
        action=LifecycleAction.BEFORE_CREATE,
        handler=add_lifecycle_field,
    )

    manager = EntityManager(items_repo=cast(Any, repo), lifecycle=lifecycle)
    result = await manager.create(
        workspace_id=uuid4(),
        site_id=uuid4(),
        model_key="article",
        data={"title": "Hello"},
        slug="hello",
        title="Hello",
    )

    assert result.item is repo.item
    assert result.item.draft_version == 1
    assert repo.created_item_payload is not None
    assert repo.created_item_payload["visibility"] == "public"
    assert repo.created_item_payload["status"] == "draft"
    assert repo.created_version_payload is not None
    assert repo.created_version_payload["fields_snapshot"] == {
        "title": "Hello",
        "normalized": True,
    }


async def test_entity_manager_create_surfaces_before_lifecycle_errors(monkeypatch) -> None:
    monkeypatch.setattr("src.core.entity_manager.manager.in_transaction", _fake_transaction)
    repo = _FakeItemsRepo()
    lifecycle = LifecycleDispatcher()

    async def reject_create(_event: LifecycleEvent) -> None:
        raise RuntimeError("policy failed")

    await lifecycle.register(
        subscriber_id="test",
        action=LifecycleAction.BEFORE_CREATE,
        handler=reject_create,
    )

    manager = EntityManager(items_repo=cast(Any, repo), lifecycle=lifecycle)

    try:
        await manager.create(
            workspace_id=uuid4(),
            site_id=uuid4(),
            model_key="article",
            data={"title": "Hello"},
            slug="hello",
            title="Hello",
        )
    except RuntimeError as exc:
        assert str(exc) == "policy failed"
    else:
        raise AssertionError("Expected before lifecycle error")

    assert repo.created_item_payload is None
    assert repo.created_version_payload is None


async def test_entity_manager_delete_dispatches_lifecycle(monkeypatch) -> None:
    monkeypatch.setattr("src.core.entity_manager.manager.in_transaction", _fake_transaction)
    repo = _FakeItemsRepo()
    lifecycle = LifecycleDispatcher()
    actions: list[LifecycleAction] = []

    async def track_event(event: LifecycleEvent) -> None:
        actions.append(event.action)

    await lifecycle.register(
        subscriber_id="test-before",
        action=LifecycleAction.BEFORE_DELETE,
        handler=track_event,
    )
    await lifecycle.register(
        subscriber_id="test-after",
        action=LifecycleAction.AFTER_DELETE,
        handler=track_event,
    )

    manager = EntityManager(items_repo=cast(Any, repo), lifecycle=lifecycle)
    item_id = repo.item.id
    deleted = await manager.delete(
        workspace_id=uuid4(),
        site_id=uuid4(),
        model_key="article",
        item_id=item_id,
    )

    assert deleted is True
    assert repo.deleted_item_id == item_id
    assert actions == [LifecycleAction.BEFORE_DELETE, LifecycleAction.AFTER_DELETE]


def test_entity_manager_filter_condition_rejects_not_contains_matches() -> None:
    item = SimpleNamespace(fields_snapshot={"title": "Draft launch plan", "price": 10})

    assert (
        EntityManager._matches_filter_condition(
            item,
            FilterCondition(field="title", operator=FilterOperator.NOT_CONTAINS, value="archive"),
        )
        is True
    )
    assert (
        EntityManager._matches_filter_condition(
            item,
            FilterCondition(field="title", operator=FilterOperator.NOT_CONTAINS, value="draft"),
        )
        is False
    )


def test_entity_manager_filter_condition_supports_numeric_comparisons() -> None:
    item = SimpleNamespace(fields_snapshot={"price": 10})

    assert EntityManager._matches_filter_condition(item, FilterCondition("price", FilterOperator.GTE, 10)) is True
    assert EntityManager._matches_filter_condition(item, FilterCondition("price", FilterOperator.LT, 10)) is False
