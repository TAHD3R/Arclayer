from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from tortoise.transactions import in_transaction

from src.core.exceptions import NotFound
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.lifecycles.specs import LifecycleAction, LifecycleEvent
from src.modules.projects.content.items.repository import ProjectContentItemsRepository


@dataclass(frozen=True, slots=True)
class EntityCreateResult:
    item: Any
    version: Any


@dataclass(frozen=True, slots=True)
class EntityUpdateResult:
    version: Any
    previous_version_number: int


class EntityManager:
    """Unified CRUD facade over existing items repository with lifecycle hooks.

    All content field values flow through ContentVersionRecord.fields_snapshot
    JSONB — no per-model DB tables needed. Lifecycle hooks fire before and after
    each write operation. Field validation against the model's field type
    contracts is handled by the calling service layer (which has access to
    the model definition), keeping the EntityManager focused on orchestration.
    """

    def __init__(
        self,
        items_repo: ProjectContentItemsRepository,
        lifecycle: LifecycleDispatcher | None = None,
    ) -> None:
        self._items = items_repo
        self._lifecycle = lifecycle

    async def create(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        model_key: str,
        data: dict[str, Any],
        slug: str,
        title: str | None = None,
        locale: str = "en-US",
        actor_id: UUID | None = None,
        resolved_role: str | None = None,
        resolved_posture: str | None = None,
        resolved_surface: str | None = None,
        shape_state: str = "unshaped",
        shape_reason_code: str | None = None,
        shape_reason_meta: dict[str, Any] | None = None,
        bootstrap_preset_key: str | None = None,
        bootstrap_preset_state: str = "none",
        capability_pack_ids: list[str] | None = None,
        translation_group_id: UUID | None = None,
    ) -> EntityCreateResult:
        model = await self._items.get_model_definition_by_key(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=model_key,
        )
        if model is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")

        before_evt = await self._dispatch_before(
            action=LifecycleAction.BEFORE_CREATE,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            data=data,
            actor_id=actor_id,
        )
        resolved_data = {**data, **before_evt.data}

        async with in_transaction() as conn:
            item = await self._items.create_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=model.id,
                slug=slug,
                title=title,
                locale=locale,
                status="draft",
                visibility="public",
                bootstrap_preset_key=bootstrap_preset_key,
                bootstrap_preset_state=bootstrap_preset_state,
                capability_pack_ids=capability_pack_ids or [],
                resolved_role=resolved_role,
                resolved_posture=resolved_posture,
                resolved_surface=resolved_surface,
                shape_state=shape_state,
                shape_reason_code=shape_reason_code,
                shape_reason_meta=shape_reason_meta,
                translation_group_id=translation_group_id,
                actor_user_id=actor_id,
                conn=conn,
            )

            version = await self._items.create_version(
                item_id=item.id,
                version=1,
                state="draft",
                fields_snapshot=resolved_data,
                change_summary=None,
                actor_user_id=actor_id,
                last_transition_by_user_id=actor_id,
                conn=conn,
            )
            item = await self._items.update_item_fields(item, fields={"draft_version": 1}, conn=conn)

        await self._dispatch_after(
            action=LifecycleAction.AFTER_CREATE,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item.id,
            result=item,
            actor_id=actor_id,
        )

        return EntityCreateResult(item=item, version=version)

    async def update(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        model_key: str,
        item_id: UUID,
        data: dict[str, Any],
        actor_id: UUID | None = None,
    ) -> EntityUpdateResult:
        before_evt = await self._dispatch_before(
            action=LifecycleAction.BEFORE_UPDATE,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            data=data,
            actor_id=actor_id,
        )
        resolved_data = {**data, **before_evt.data}

        async with in_transaction() as conn:
            item = await self._items.get_item_with_model(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
                for_update=True,
            )
            if item is None:
                raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")

            previous_version = int(item.draft_version or 0)
            next_version = previous_version + 1

            version = await self._items.create_version(
                item_id=item_id,
                version=next_version,
                state="draft",
                fields_snapshot=resolved_data,
                change_summary=None,
                actor_user_id=actor_id,
                last_transition_by_user_id=actor_id,
                conn=conn,
            )

            await self._items.update_item_fields(item, fields={"draft_version": next_version}, conn=conn)

        await self._dispatch_after(
            action=LifecycleAction.AFTER_UPDATE,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            result=version,
            actor_id=actor_id,
        )

        return EntityUpdateResult(version=version, previous_version_number=previous_version)

    async def delete(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        model_key: str,
        item_id: UUID,
        actor_id: UUID | None = None,
    ) -> bool:
        async with in_transaction() as conn:
            item = await self._items.get_item_with_model(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
                for_update=True,
            )
            if item is None:
                return False

            await self._dispatch_before(
                action=LifecycleAction.BEFORE_DELETE,
                model_key=model_key,
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item.id,
                actor_id=actor_id,
            )

            count = await self._items.delete_item(item_id=item.id, conn=conn)
        deleted = count > 0

        if deleted:
            await self._dispatch_after(
                action=LifecycleAction.AFTER_DELETE,
                model_key=model_key,
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                actor_id=actor_id,
            )

        return deleted

    async def dispatch_before_publish(
        self,
        *,
        model_key: str,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_id: UUID | None = None,
    ) -> LifecycleEvent:
        return await self._dispatch_before(
            action=LifecycleAction.BEFORE_PUBLISH,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            actor_id=actor_id,
        )

    async def dispatch_after_publish(
        self,
        *,
        model_key: str,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        result: Any = None,
        actor_id: UUID | None = None,
    ) -> None:
        await self._dispatch_after(
            action=LifecycleAction.AFTER_PUBLISH,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            result=result,
            actor_id=actor_id,
        )

    async def find_one(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
    ) -> Any | None:
        return await self._items.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
        )

    async def find_many(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        model_key: str,
        query_plan: Any = None,
    ) -> list[Any]:
        model = await self._items.get_model_definition_by_key(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=model_key,
        )
        if model is None:
            return []
        items = await self._items.list_items(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_definition_id=model.id,
        )
        if query_plan is not None and hasattr(query_plan, "filters") and query_plan.filters:
            items = self._apply_query_plan(items, query_plan)
        return items

    @staticmethod
    def _apply_query_plan(items: list[Any], query_plan: Any) -> list[Any]:
        filtered = items
        expression = getattr(query_plan, "filter_expression", None)
        if expression is not None:
            filtered = [item for item in filtered if EntityManager._matches_filter_expression(item, expression)]
        else:
            for condition in query_plan.filters:
                filtered = [item for item in filtered if EntityManager._matches_filter_condition(item, condition)]

        if query_plan.sorts:
            for sort in reversed(query_plan.sorts):
                key = sort.field
                rev = sort.descending
                filtered.sort(key=lambda r: str(getattr(r, key, "") or "").lower(), reverse=rev)
        if query_plan.page and query_plan.page_size:
            start = (query_plan.page - 1) * query_plan.page_size
            filtered = filtered[start : start + query_plan.page_size]
        return filtered

    @staticmethod
    def _field_value(item: Any, field: str) -> Any:
        if hasattr(item, field):
            return getattr(item, field)
        fields_snapshot = getattr(item, "fields_snapshot", None)
        if isinstance(fields_snapshot, dict):
            return fields_snapshot.get(field)
        return None

    @staticmethod
    def _matches_filter_expression(item: Any, expression: Any) -> bool:
        from src.core.query.operators import FilterCondition
        from src.core.query.parser import FilterGroup

        if isinstance(expression, FilterCondition):
            return EntityManager._matches_filter_condition(item, expression)
        if not isinstance(expression, FilterGroup):
            return True
        child_results = [EntityManager._matches_filter_expression(item, child) for child in expression.children]
        if expression.operator == "or":
            return any(child_results)
        return all(child_results)

    @staticmethod
    def _matches_filter_condition(item: Any, condition: Any) -> bool:
        from src.core.query.operators import FilterOperator

        actual = EntityManager._field_value(item, condition.field)
        expected = condition.value
        if condition.operator == FilterOperator.EQ:
            return actual == expected
        if condition.operator == FilterOperator.NE:
            return actual != expected
        if condition.operator == FilterOperator.IN:
            return isinstance(expected, list) and actual in expected
        if condition.operator == FilterOperator.NIN:
            return isinstance(expected, list) and actual not in expected
        if condition.operator == FilterOperator.NULL:
            return actual is None
        if condition.operator == FilterOperator.NOT_NULL:
            return actual is not None
        if condition.operator == FilterOperator.CONTAINS:
            return str(expected).lower() in str(actual or "").lower()
        if condition.operator == FilterOperator.NOT_CONTAINS:
            return str(expected).lower() not in str(actual or "").lower()
        if condition.operator == FilterOperator.STARTS_WITH:
            return str(actual or "").startswith(str(expected))
        if condition.operator == FilterOperator.ENDS_WITH:
            return str(actual or "").endswith(str(expected))
        if condition.operator == FilterOperator.BETWEEN:
            if isinstance(expected, list) and len(expected) == 2:
                return expected[0] <= actual <= expected[1]
            return False
        if condition.operator in {
            FilterOperator.LT,
            FilterOperator.LTE,
            FilterOperator.GT,
            FilterOperator.GTE,
        }:
            if actual is None:
                return False
            if condition.operator == FilterOperator.LT:
                return actual < expected
            if condition.operator == FilterOperator.LTE:
                return actual <= expected
            if condition.operator == FilterOperator.GT:
                return actual > expected
            return actual >= expected
        raise ValueError(f"Unsupported filter operator: {condition.operator}")

    async def _dispatch_before(
        self,
        *,
        action: LifecycleAction,
        model_key: str,
        workspace_id: Any | None = None,
        site_id: Any | None = None,
        item_id: Any | None = None,
        data: dict[str, Any] | None = None,
        actor_id: Any | None = None,
    ) -> LifecycleEvent:
        if self._lifecycle is None:
            return LifecycleEvent(
                action=action,
                model_key=model_key,
                workspace_id=workspace_id,
                site_id=site_id,
                data=data or {},
                item_id=item_id,
                actor_id=actor_id,
            )
        return await self._lifecycle.dispatch_before(
            action=action,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            data=data,
            actor_id=actor_id,
        )

    async def _dispatch_after(
        self,
        *,
        action: LifecycleAction,
        model_key: str,
        workspace_id: Any | None = None,
        site_id: Any | None = None,
        item_id: Any | None = None,
        result: Any = None,
        actor_id: Any | None = None,
    ) -> None:
        if self._lifecycle is None:
            return
        await self._lifecycle.dispatch_after(
            action=action,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            result=result,
            actor_id=actor_id,
        )
