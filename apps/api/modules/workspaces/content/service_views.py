from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from apps.api.core.exceptions import Conflict, NotFound
from apps.api.modules.workspaces.content.constants import CONTENT_VIEWS_NAMESPACE
from apps.api.modules.workspaces.content.mapper import to_content_entry_out
from apps.api.modules.workspaces.content.schema import (
    ContentViewCreateIn,
    ContentViewDeleteOut,
    ContentViewDslIn,
    ContentViewFilterIn,
    ContentViewOut,
    ContentViewPreviewIn,
    ContentViewPreviewOut,
    ContentViewSortIn,
    ContentViewUpdateIn,
)


class WorkspaceContentViewsMixin:
    async def list_views(self, *, site_id: UUID) -> list[ContentViewOut]:
        raw = await self._get_setting_list(site_id=site_id, namespace=CONTENT_VIEWS_NAMESPACE)
        out: list[ContentViewOut] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            view_id = self._parse_uuid_value(item.get("id"))
            if view_id is None:
                continue
            dsl_raw = item.get("dsl")
            dsl = ContentViewDslIn()
            if isinstance(dsl_raw, dict):
                dsl = ContentViewDslIn.model_validate(dsl_raw)
            out.append(
                ContentViewOut(
                    id=view_id,
                    code=str(item.get("code") or ""),
                    name=str(item.get("name") or ""),
                    type_code=(str(item.get("typeCode")) if item.get("typeCode") else None),
                    dsl=dsl,
                    enabled=bool(item.get("enabled", True)),
                    updated_at_ms=int(item.get("updatedAtMs") or 0),
                )
            )
        out.sort(key=lambda x: (x.code, x.name, x.id))
        return out

    async def create_view(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentViewCreateIn,
    ) -> ContentViewOut:
        views = await self.list_views(site_id=site_id)
        code = (payload.code or "").strip()
        name = (payload.name or "").strip()
        if not code:
            raise Conflict("Invalid view code", error="CONTENT_VIEW_CODE_INVALID")
        if not name:
            raise Conflict("Invalid view name", error="CONTENT_VIEW_NAME_INVALID")
        if any(view.code == code for view in views):
            raise Conflict("View code already exists", error="CONTENT_VIEW_CODE_CONFLICT")

        type_code = self._validate_type_code(payload.type_code) if payload.type_code is not None else None
        if type_code is not None:
            type_record = await self.repo.get_type_by_code(workspace_id=workspace_id, site_id=site_id, code=type_code)
            if type_record is None:
                raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")

        view = ContentViewOut(
            id=uuid4(),
            code=code,
            name=name,
            type_code=type_code,
            dsl=payload.dsl,
            enabled=payload.enabled,
            updated_at_ms=self._now_ms(),
        )
        views.append(view)
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_VIEWS_NAMESPACE,
            items=[
                {
                    "id": str(row.id),
                    "code": row.code,
                    "name": row.name,
                    "typeCode": row.type_code,
                    "dsl": row.dsl.model_dump(by_alias=True),
                    "enabled": row.enabled,
                    "updatedAtMs": row.updated_at_ms,
                }
                for row in views
            ],
        )
        return view

    async def update_view(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        view_id: UUID,
        payload: ContentViewUpdateIn,
    ) -> ContentViewOut:
        views = await self.list_views(site_id=site_id)
        idx = next((i for i, view in enumerate(views) if view.id == view_id), None)
        if idx is None:
            raise NotFound("View not found", error="CONTENT_VIEW_NOT_FOUND")
        view = views[idx]
        updates: dict[str, Any] = {"updated_at_ms": self._now_ms()}
        if "name" in payload.model_fields_set and payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise Conflict("Invalid view name", error="CONTENT_VIEW_NAME_INVALID")
            updates["name"] = name
        if "type_code" in payload.model_fields_set:
            if payload.type_code is None:
                updates["type_code"] = None
            else:
                type_code = self._validate_type_code(payload.type_code)
                type_record = await self.repo.get_type_by_code(
                    workspace_id=workspace_id, site_id=site_id, code=type_code
                )
                if type_record is None:
                    raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")
                updates["type_code"] = type_code
        if "dsl" in payload.model_fields_set and payload.dsl is not None:
            updates["dsl"] = payload.dsl
        if "enabled" in payload.model_fields_set and payload.enabled is not None:
            updates["enabled"] = payload.enabled
        updated = view.model_copy(update=updates)
        views[idx] = updated
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_VIEWS_NAMESPACE,
            items=[
                {
                    "id": str(row.id),
                    "code": row.code,
                    "name": row.name,
                    "typeCode": row.type_code,
                    "dsl": row.dsl.model_dump(by_alias=True),
                    "enabled": row.enabled,
                    "updatedAtMs": row.updated_at_ms,
                }
                for row in views
            ],
        )
        return updated

    async def delete_view(self, *, site_id: UUID, view_id: UUID) -> ContentViewDeleteOut:
        views = await self.list_views(site_id=site_id)
        next_views = [view for view in views if view.id != view_id]
        if len(next_views) == len(views):
            raise NotFound("View not found", error="CONTENT_VIEW_NOT_FOUND")
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_VIEWS_NAMESPACE,
            items=[
                {
                    "id": str(row.id),
                    "code": row.code,
                    "name": row.name,
                    "typeCode": row.type_code,
                    "dsl": row.dsl.model_dump(by_alias=True),
                    "enabled": row.enabled,
                    "updatedAtMs": row.updated_at_ms,
                }
                for row in next_views
            ],
        )
        return ContentViewDeleteOut(view_id=view_id)

    @staticmethod
    def _apply_view_filters(rows: list[dict[str, Any]], filters: list[ContentViewFilterIn]) -> list[dict[str, Any]]:
        def match(row: dict[str, Any], flt: ContentViewFilterIn) -> bool:
            value = row.get(flt.field)
            if flt.op == "eq":
                return value == flt.value
            if flt.op == "neq":
                return value != flt.value
            if flt.op == "in":
                return isinstance(flt.value, list) and value in flt.value
            if flt.op == "contains":
                return isinstance(value, str) and str(flt.value).lower() in value.lower()
            return False

        out = rows
        for flt in filters:
            out = [row for row in out if match(row, flt)]
        return out

    @staticmethod
    def _apply_view_sort(rows: list[dict[str, Any]], sorts: list[ContentViewSortIn]) -> list[dict[str, Any]]:
        out = rows
        for sort in reversed(sorts):
            reverse = sort.order == "desc"
            out = sorted(out, key=lambda row: str(row.get(sort.field) or ""), reverse=reverse)
        return out

    async def preview_view(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        view_id: UUID,
        payload: ContentViewPreviewIn,
    ) -> ContentViewPreviewOut:
        views = await self.list_views(site_id=site_id)
        view = next((row for row in views if row.id == view_id), None)
        if view is None:
            raise NotFound("View not found", error="CONTENT_VIEW_NOT_FOUND")

        type_id: UUID | None = None
        if view.type_code is not None:
            t = await self.repo.get_type_by_code(workspace_id=workspace_id, site_id=site_id, code=view.type_code)
            if t is None:
                raise NotFound("Content type not found", error="CONTENT_TYPE_NOT_FOUND")
            type_id = UUID(str(t.id))

        entries = await self.repo.list_entries(workspace_id=workspace_id, site_id=site_id, type_id=type_id)
        rows = []
        for entry in entries:
            row = to_content_entry_out(entry)
            rows.append(row.model_dump(by_alias=True))

        rows = self._apply_view_filters(rows, view.dsl.filters)
        rows = self._apply_view_sort(rows, view.dsl.sort)

        if view.dsl.projection:
            rows = _apply_projection(rows, view.dsl.projection)
        if not view.dsl.include_document_ir:
            for row in rows:
                row.pop("document_ir", None)
                row.pop("documentIr", None)

        total = len(rows)
        offset = payload.offset
        limit = payload.limit or view.dsl.limit or 20
        sliced = rows[offset : offset + limit]
        return ContentViewPreviewOut(
            view_id=view.id,
            total=total,
            items=sliced,
        )


def _apply_projection(rows: list[dict[str, Any]], fields: list[str]) -> list[dict[str, Any]]:
    """Keep only the specified keys in each row."""
    return [{k: row[k] for k in fields if k in row} for row in rows]
