from __future__ import annotations

from typing import Any, Literal, cast
from uuid import UUID, uuid4

from src.common.services import BaseService
from src.core.exceptions import Forbidden, NotFound
from src.core.i18n import t
from src.modules.projects.content.views.repository import ProjectContentViewsRepository
from src.modules.projects.content.views.schema import (
    ContentLibrarySystemViewId,
    ContentLibraryViewColumnsSchema,
    ContentLibraryViewCreateIn,
    ContentLibraryViewFiltersSchema,
    ContentLibraryViewOut,
    ContentLibraryViewPatchIn,
    ContentLibraryViewSortingItemSchema,
    ContentLibraryViewsStateOut,
)
from src.modules.tenancy.schema import TenantContext
from src.settings.scopes import SCOPE_TYPE_USER, SCOPE_TYPE_WORKSPACE

StoredView = dict[str, Any]
StoredUserPayload = dict[str, Any]
ViewLocation = Literal["workspace", "private"]

CONTENT_LIBRARY_WORKSPACE_VIEWS_NAMESPACE = "content_library.library_views"
CONTENT_LIBRARY_USER_VIEWS_NAMESPACE_PREFIX = "content_library.library_views.user"
CONTENT_LIBRARY_MANAGE_ERROR = "CONTENT_LIBRARY_VIEWS_MANAGE_REQUIRED"
SYSTEM_VIEW_IDS = {"all", "site-content", "draft", "published", "needs-attention"}


def _user_namespace(workspace_id: UUID) -> str:
    return f"{CONTENT_LIBRARY_USER_VIEWS_NAMESPACE_PREFIX}.{workspace_id}"


def _normalize_base_view_id(value: Any) -> ContentLibrarySystemViewId:
    normalized = str(value or "").strip()
    if normalized in SYSTEM_VIEW_IDS:
        return cast(ContentLibrarySystemViewId, normalized)
    return "all"


def _normalize_filters(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    parsed = ContentLibraryViewFiltersSchema.model_validate(value)
    return parsed.model_dump(mode="python", exclude_none=True, by_alias=True)


def _normalize_sorting(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        parsed = ContentLibraryViewSortingItemSchema.model_validate(item)
        items.append(parsed.model_dump(mode="python", by_alias=True))
    return items


def _normalize_columns(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    parsed = ContentLibraryViewColumnsSchema.model_validate(value)
    return parsed.model_dump(mode="python", exclude_none=True, by_alias=True)


def _normalize_stored_view(value: Any) -> StoredView | None:
    if not isinstance(value, dict):
        return None
    identifier = str(value.get("id") or "").strip()
    name = str(value.get("name") or "").strip()
    if not identifier or not name:
        return None
    return {
        "id": identifier,
        "name": name,
        "baseViewId": _normalize_base_view_id(value.get("baseViewId")),
        "query": str(value.get("query") or ""),
        "filters": _normalize_filters(value.get("filters")),
        "sorting": _normalize_sorting(value.get("sorting")),
        "columns": _normalize_columns(value.get("columns")),
    }


def _normalize_workspace_items(value: Any) -> list[StoredView]:
    raw_items = value.get("items") if isinstance(value, dict) else []
    if not isinstance(raw_items, list):
        return []
    items: list[StoredView] = []
    for item in raw_items:
        normalized = _normalize_stored_view(item)
        if normalized is not None:
            items.append(normalized)
    return items


def _normalize_user_payload(value: Any) -> StoredUserPayload:
    raw = value if isinstance(value, dict) else {}
    items = _normalize_workspace_items({"items": raw.get("items")})
    raw_pinned = raw.get("pinnedViewIds")
    pinned_view_ids = []
    if isinstance(raw_pinned, list):
        pinned_view_ids = [str(item).strip() for item in raw_pinned if str(item).strip()]
    default_view_id = str(raw.get("defaultViewId") or "").strip() or None
    return {
        "items": items,
        "pinnedViewIds": pinned_view_ids,
        "defaultViewId": default_view_id,
    }


def _remove_from_list(values: list[str], target: str) -> list[str]:
    return [value for value in values if value != target]


def _resolve_fallback_default_view_id(
    *,
    workspace_items: list[StoredView],
    user_items: list[StoredView],
    pinned_view_ids: list[str],
) -> str | None:
    ordered_ids = [item["id"] for item in [*workspace_items, *user_items]]
    if not ordered_ids:
        return None
    visible_ids = set(ordered_ids)
    pinned_candidates = [view_id for view_id in pinned_view_ids if view_id in visible_ids]
    if pinned_candidates:
        return pinned_candidates[0]
    return ordered_ids[0]


def _move_item(items: list[StoredView], *, view_id: str, direction: Literal["up", "down"]) -> list[StoredView]:
    index = next((i for i, item in enumerate(items) if item["id"] == view_id), -1)
    if index < 0:
        raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
    target = index - 1 if direction == "up" else index + 1
    if target < 0 or target >= len(items):
        return items
    next_items = list(items)
    next_items[index], next_items[target] = next_items[target], next_items[index]
    return next_items


class ContentLibraryViewsService(BaseService):
    def __init__(self, settings, tenant_context: TenantContext) -> None:
        super().__init__(settings)
        self.repo = ProjectContentViewsRepository(tenant_context)

    async def list_views(self, *, workspace_id: UUID, user_id: UUID) -> ContentLibraryViewsStateOut:
        workspace_items, user_payload = await self._load_state(workspace_id=workspace_id, user_id=user_id)
        return self._build_state_out(workspace_items=workspace_items, user_payload=user_payload)

    async def create_view(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        payload: ContentLibraryViewCreateIn,
        can_manage_workspace_views: bool,
    ) -> ContentLibraryViewsStateOut:
        workspace_items, user_payload = await self._load_state(workspace_id=workspace_id, user_id=user_id)
        visibility = payload.visibility
        if visibility == "workspace" and not can_manage_workspace_views:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error=CONTENT_LIBRARY_MANAGE_ERROR,
            )

        next_view = {
            "id": str(uuid4()),
            "name": payload.name,
            "baseViewId": payload.base_view_id,
            "query": payload.query,
            "filters": payload.filters.model_dump(mode="python", exclude_none=True, by_alias=True),
            "sorting": [item.model_dump(mode="python", by_alias=True) for item in payload.sorting],
            "columns": payload.columns.model_dump(mode="python", exclude_none=True, by_alias=True)
            if payload.columns is not None
            else {},
        }
        if visibility == "workspace":
            workspace_items = [*workspace_items, next_view]
        else:
            user_payload["items"] = [*cast(list[StoredView], user_payload["items"]), next_view]

        if payload.pinned:
            pinned_ids = _remove_from_list(cast(list[str], user_payload["pinnedViewIds"]), next_view["id"])
            user_payload["pinnedViewIds"] = [*pinned_ids, next_view["id"]]
        if payload.is_default:
            user_payload["defaultViewId"] = next_view["id"]

        return await self._save_state(
            workspace_id=workspace_id,
            user_id=user_id,
            workspace_items=workspace_items,
            user_payload=user_payload,
        )

    async def update_view(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        view_id: str,
        payload: ContentLibraryViewPatchIn,
        can_manage_workspace_views: bool,
    ) -> ContentLibraryViewsStateOut:
        workspace_items, user_payload = await self._load_state(workspace_id=workspace_id, user_id=user_id)
        location = self._locate_view(
            workspace_items=workspace_items,
            user_items=cast(list[StoredView], user_payload["items"]),
            view_id=view_id,
        )
        updates_definition = any(
            value is not None
            for value in (
                payload.name,
                payload.base_view_id,
                payload.query,
                payload.filters,
                payload.visibility,
            )
        )
        if location == "workspace" and updates_definition and not can_manage_workspace_views:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error=CONTENT_LIBRARY_MANAGE_ERROR,
            )

        next_location = payload.visibility or location
        if next_location == "workspace" and not can_manage_workspace_views:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error=CONTENT_LIBRARY_MANAGE_ERROR,
            )

        current_items = workspace_items if location == "workspace" else cast(list[StoredView], user_payload["items"])
        current_index = next((index for index, item in enumerate(current_items) if item["id"] == view_id), -1)
        if current_index < 0:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        next_view = dict(current_items[current_index])

        if payload.name is not None:
            next_view["name"] = payload.name
        if payload.base_view_id is not None:
            next_view["baseViewId"] = payload.base_view_id
        if payload.query is not None:
            next_view["query"] = payload.query
        if payload.filters is not None:
            next_view["filters"] = payload.filters.model_dump(mode="python", exclude_none=True, by_alias=True)
        if payload.sorting is not None:
            next_view["sorting"] = [item.model_dump(mode="python", by_alias=True) for item in payload.sorting]
        if payload.columns is not None:
            next_view["columns"] = payload.columns.model_dump(mode="python", exclude_none=True, by_alias=True)

        if next_location == location:
            current_items[current_index] = next_view
        else:
            if location == "workspace":
                workspace_items = [item for item in workspace_items if item["id"] != view_id]
                user_payload["items"] = [*cast(list[StoredView], user_payload["items"]), next_view]
            else:
                user_payload["items"] = [
                    item for item in cast(list[StoredView], user_payload["items"]) if item["id"] != view_id
                ]
                workspace_items = [*workspace_items, next_view]

        if payload.pinned is not None:
            pinned_ids = _remove_from_list(cast(list[str], user_payload["pinnedViewIds"]), view_id)
            if payload.pinned:
                pinned_ids.append(view_id)
            user_payload["pinnedViewIds"] = pinned_ids

        if payload.is_default is not None:
            if payload.is_default:
                user_payload["defaultViewId"] = view_id
            elif user_payload.get("defaultViewId") == view_id:
                user_payload["defaultViewId"] = None

        return await self._save_state(
            workspace_id=workspace_id,
            user_id=user_id,
            workspace_items=workspace_items,
            user_payload=user_payload,
        )

    async def move_view(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        view_id: str,
        direction: Literal["up", "down"],
        can_manage_workspace_views: bool,
    ) -> ContentLibraryViewsStateOut:
        workspace_items, user_payload = await self._load_state(workspace_id=workspace_id, user_id=user_id)
        location = self._locate_view(
            workspace_items=workspace_items,
            user_items=cast(list[StoredView], user_payload["items"]),
            view_id=view_id,
        )
        if location == "workspace":
            if not can_manage_workspace_views:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED"),
                    error=CONTENT_LIBRARY_MANAGE_ERROR,
                )
            workspace_items = _move_item(workspace_items, view_id=view_id, direction=direction)
        else:
            user_payload["items"] = _move_item(
                cast(list[StoredView], user_payload["items"]),
                view_id=view_id,
                direction=direction,
            )

        return await self._save_state(
            workspace_id=workspace_id,
            user_id=user_id,
            workspace_items=workspace_items,
            user_payload=user_payload,
        )

    async def delete_view(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        view_id: str,
        can_manage_workspace_views: bool,
    ) -> ContentLibraryViewsStateOut:
        workspace_items, user_payload = await self._load_state(workspace_id=workspace_id, user_id=user_id)
        location = self._locate_view(
            workspace_items=workspace_items,
            user_items=cast(list[StoredView], user_payload["items"]),
            view_id=view_id,
        )
        if location == "workspace":
            if not can_manage_workspace_views:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED"),
                    error=CONTENT_LIBRARY_MANAGE_ERROR,
                )
            workspace_items = [item for item in workspace_items if item["id"] != view_id]
        else:
            user_payload["items"] = [
                item for item in cast(list[StoredView], user_payload["items"]) if item["id"] != view_id
            ]

        user_payload["pinnedViewIds"] = _remove_from_list(user_payload["pinnedViewIds"], view_id)
        if user_payload.get("defaultViewId") == view_id:
            user_payload["defaultViewId"] = _resolve_fallback_default_view_id(
                workspace_items=workspace_items,
                user_items=cast(list[StoredView], user_payload["items"]),
                pinned_view_ids=user_payload["pinnedViewIds"],
            )

        return await self._save_state(
            workspace_id=workspace_id,
            user_id=user_id,
            workspace_items=workspace_items,
            user_payload=user_payload,
        )

    async def _load_state(self, *, workspace_id: UUID, user_id: UUID) -> tuple[list[StoredView], StoredUserPayload]:
        workspace_record = await self.repo.get_setting(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CONTENT_LIBRARY_WORKSPACE_VIEWS_NAMESPACE,
        )
        user_record = await self.repo.get_setting(
            scope_type=SCOPE_TYPE_USER,
            scope_id=user_id,
            namespace=_user_namespace(workspace_id),
        )
        workspace_items = _normalize_workspace_items(workspace_record.value if workspace_record else None)
        user_payload = _normalize_user_payload(user_record.value if user_record else None)
        return workspace_items, self._coerce_user_payload(workspace_items=workspace_items, user_payload=user_payload)

    async def _save_state(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        workspace_items: list[StoredView],
        user_payload: StoredUserPayload,
    ) -> ContentLibraryViewsStateOut:
        user_payload = self._coerce_user_payload(workspace_items=workspace_items, user_payload=user_payload)
        await self._save_workspace_record(workspace_id=workspace_id, user_id=user_id, items=workspace_items)
        await self._save_user_record(workspace_id=workspace_id, user_id=user_id, payload=user_payload)
        return self._build_state_out(workspace_items=workspace_items, user_payload=user_payload)

    async def _save_workspace_record(self, *, workspace_id: UUID, user_id: UUID, items: list[StoredView]) -> None:
        next_value = {"items": items} if items else None
        record = await self.repo.save_setting(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CONTENT_LIBRARY_WORKSPACE_VIEWS_NAMESPACE,
            value=next_value,
            updated_by=user_id,
        )
        if record is None:
            return

    async def _save_user_record(self, *, workspace_id: UUID, user_id: UUID, payload: StoredUserPayload) -> None:
        namespace = _user_namespace(workspace_id)
        next_value = {
            "items": cast(list[StoredView], payload["items"]),
            "pinnedViewIds": cast(list[str], payload["pinnedViewIds"]),
            "defaultViewId": payload.get("defaultViewId"),
        }
        value = next_value
        if not next_value["items"] and not next_value["pinnedViewIds"] and next_value["defaultViewId"] is None:
            value = None
        await self.repo.save_setting(
            scope_type=SCOPE_TYPE_USER,
            scope_id=user_id,
            namespace=namespace,
            value=value,
            updated_by=user_id,
        )

    def _coerce_user_payload(
        self, *, workspace_items: list[StoredView], user_payload: StoredUserPayload
    ) -> StoredUserPayload:
        user_items = cast(list[StoredView], user_payload["items"])
        visible_ids = {item["id"] for item in workspace_items} | {item["id"] for item in user_items}
        pinned_ids = [view_id for view_id in cast(list[str], user_payload["pinnedViewIds"]) if view_id in visible_ids]
        default_view_id = user_payload.get("defaultViewId")
        if default_view_id not in visible_ids:
            default_view_id = (
                _resolve_fallback_default_view_id(
                    workspace_items=workspace_items,
                    user_items=user_items,
                    pinned_view_ids=pinned_ids,
                )
                if default_view_id
                else None
            )
        return {
            "items": user_items,
            "pinnedViewIds": pinned_ids,
            "defaultViewId": default_view_id,
        }

    def _build_state_out(
        self,
        *,
        workspace_items: list[StoredView],
        user_payload: StoredUserPayload,
    ) -> ContentLibraryViewsStateOut:
        pinned_ids = set(cast(list[str], user_payload["pinnedViewIds"]))
        default_view_id = cast(str | None, user_payload.get("defaultViewId"))
        private_items = cast(list[StoredView], user_payload["items"])
        items = [
            *[
                self._build_view_out(
                    item=item, visibility="workspace", pinned_ids=pinned_ids, default_view_id=default_view_id
                )
                for item in workspace_items
            ],
            *[
                self._build_view_out(
                    item=item, visibility="private", pinned_ids=pinned_ids, default_view_id=default_view_id
                )
                for item in private_items
            ],
        ]
        return ContentLibraryViewsStateOut(items=items, default_view_id=default_view_id)

    def _build_view_out(
        self,
        *,
        item: StoredView,
        visibility: ViewLocation,
        pinned_ids: set[str],
        default_view_id: str | None,
    ) -> ContentLibraryViewOut:
        return ContentLibraryViewOut(
            id=item["id"],
            name=item["name"],
            base_view_id=item["baseViewId"],
            query=item["query"],
            filters=ContentLibraryViewFiltersSchema.model_validate(item["filters"]),
            sorting=[
                ContentLibraryViewSortingItemSchema.model_validate(entry)
                for entry in cast(list[dict[str, Any]], item.get("sorting") or [])
            ],
            columns=ContentLibraryViewColumnsSchema.model_validate(item.get("columns") or {}),
            visibility=visibility,
            pinned=item["id"] in pinned_ids,
            is_default=default_view_id == item["id"],
        )

    def _locate_view(
        self,
        *,
        workspace_items: list[StoredView],
        user_items: list[StoredView],
        view_id: str,
    ) -> ViewLocation:
        if any(item["id"] == view_id for item in workspace_items):
            return "workspace"
        if any(item["id"] == view_id for item in user_items):
            return "private"
        raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
