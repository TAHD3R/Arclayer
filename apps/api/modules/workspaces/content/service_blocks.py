from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from apps.api.common.utils.public_ids import encode_uuid
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.modules.workspaces.content.constants import CONTENT_BLOCKS_NAMESPACE
from apps.api.modules.workspaces.content.schema import (
    ContentBlockCreateIn,
    ContentBlockDeleteOut,
    ContentBlockOut,
    ContentBlockUpdateIn,
    ContentBlockUsageOut,
    ContentBlockUsagesOut,
)


class WorkspaceContentBlocksMixin:
    if TYPE_CHECKING:
        from apps.api.modules.workspaces.content.repository import WorkspaceContentRepository
        from apps.api.modules.workspaces.content.schema import ContentMenuOut, ContentViewOut

        repo: WorkspaceContentRepository

        @staticmethod
        def _now_ms() -> int: ...

        @staticmethod
        def _parse_uuid_value(value: Any) -> UUID | None: ...

        async def _get_setting_list(self, *, site_id: UUID, namespace: str) -> list[dict[str, Any]]: ...

        async def _put_setting_list(
            self,
            *,
            site_id: UUID,
            namespace: str,
            items: list[dict[str, Any]],
        ) -> None: ...

        async def list_menus(self, *, site_id: UUID) -> list[ContentMenuOut]: ...

        async def list_views(self, *, site_id: UUID) -> list[ContentViewOut]: ...

        @staticmethod
        def _walk_menu_items(items: list[Any]) -> list[Any]: ...

    async def list_blocks(self, *, site_id: UUID) -> list[ContentBlockOut]:
        raw = await self._get_setting_list(site_id=site_id, namespace=CONTENT_BLOCKS_NAMESPACE)
        out: list[ContentBlockOut] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            block_id = self._parse_uuid_value(item.get("id"))
            if block_id is None:
                continue
            out.append(
                ContentBlockOut(
                    id=block_id,
                    code=str(item.get("code") or ""),
                    name=str(item.get("name") or ""),
                    payload=(item.get("payload") if isinstance(item.get("payload"), dict) else None),
                    updated_at_ms=int(item.get("updatedAtMs") or 0),
                )
            )
        out.sort(key=lambda x: (x.code, x.name, x.id))
        return out

    async def create_block(self, *, site_id: UUID, payload: ContentBlockCreateIn) -> ContentBlockOut:
        blocks = await self.list_blocks(site_id=site_id)
        code = (payload.code or "").strip()
        name = (payload.name or "").strip()
        if not code:
            raise Conflict("Invalid block code", error="CONTENT_BLOCK_CODE_INVALID")
        if not name:
            raise Conflict("Invalid block name", error="CONTENT_BLOCK_NAME_INVALID")
        if any(block.code == code for block in blocks):
            raise Conflict("Block code already exists", error="CONTENT_BLOCK_CODE_CONFLICT")

        block = ContentBlockOut(
            id=uuid4(),
            code=code,
            name=name,
            payload=payload.payload,
            updated_at_ms=self._now_ms(),
        )
        blocks.append(block)
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_BLOCKS_NAMESPACE,
            items=[
                {
                    "id": str(row.id),
                    "code": row.code,
                    "name": row.name,
                    "payload": row.payload,
                    "updatedAtMs": row.updated_at_ms,
                }
                for row in blocks
            ],
        )
        return block

    async def update_block(self, *, site_id: UUID, block_id: UUID, payload: ContentBlockUpdateIn) -> ContentBlockOut:
        blocks = await self.list_blocks(site_id=site_id)
        idx = next((i for i, block in enumerate(blocks) if block.id == block_id), None)
        if idx is None:
            raise NotFound("Block not found", error="CONTENT_BLOCK_NOT_FOUND")
        block = blocks[idx]
        updates: dict[str, Any] = {"updated_at_ms": self._now_ms()}
        if "name" in payload.model_fields_set and payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise Conflict("Invalid block name", error="CONTENT_BLOCK_NAME_INVALID")
            updates["name"] = name
        if "payload" in payload.model_fields_set:
            updates["payload"] = payload.payload
        updated = block.model_copy(update=updates)
        blocks[idx] = updated
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_BLOCKS_NAMESPACE,
            items=[
                {
                    "id": str(row.id),
                    "code": row.code,
                    "name": row.name,
                    "payload": row.payload,
                    "updatedAtMs": row.updated_at_ms,
                }
                for row in blocks
            ],
        )
        return updated

    async def delete_block(self, *, site_id: UUID, block_id: UUID) -> ContentBlockDeleteOut:
        blocks = await self.list_blocks(site_id=site_id)
        next_blocks = [block for block in blocks if block.id != block_id]
        if len(next_blocks) == len(blocks):
            raise NotFound("Block not found", error="CONTENT_BLOCK_NOT_FOUND")
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_BLOCKS_NAMESPACE,
            items=[
                {
                    "id": str(row.id),
                    "code": row.code,
                    "name": row.name,
                    "payload": row.payload,
                    "updatedAtMs": row.updated_at_ms,
                }
                for row in next_blocks
            ],
        )
        return ContentBlockDeleteOut(block_id=block_id)

    async def get_block_usages(self, *, workspace_id: UUID, site_id: UUID, block_id: UUID) -> ContentBlockUsagesOut:
        usages: list[ContentBlockUsageOut] = []
        block_markers = {str(block_id), encode_uuid(block_id)}

        entries = await self.repo.list_entries(workspace_id=workspace_id, site_id=site_id)
        for entry in entries:
            payload = {
                "documentIr": entry.document_ir,
                "fieldValues": entry.field_values,
            }
            payload_text = json.dumps(payload, ensure_ascii=True)
            if any(marker in payload_text for marker in block_markers):
                usages.append(
                    ContentBlockUsageOut(
                        source="entry",
                        source_id=UUID(str(entry.id)),
                        path="snapshot",
                    )
                )

        menus = await self.list_menus(site_id=site_id)
        for menu in menus:
            for item in self._walk_menu_items(menu.items):
                if item.target in block_markers:
                    usages.append(
                        ContentBlockUsageOut(
                            source="menu",
                            source_id=menu.id,
                            path=f"item:{encode_uuid(item.id)}",
                        )
                    )

        views = await self.list_views(site_id=site_id)
        for view in views:
            view_dsl_text = json.dumps(view.dsl.model_dump(by_alias=True), ensure_ascii=True)
            if any(marker in view_dsl_text for marker in block_markers):
                usages.append(
                    ContentBlockUsageOut(
                        source="view",
                        source_id=view.id,
                        path="dsl",
                    )
                )

        return ContentBlockUsagesOut(block_id=block_id, usages=usages)
