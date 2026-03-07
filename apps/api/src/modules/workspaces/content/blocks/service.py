from __future__ import annotations

import json
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.modules.workspaces.content.schema import (
    ContentBlockCreateIn,
    ContentBlockDeleteOut,
    ContentBlockOut,
    ContentBlockUpdateIn,
    ContentBlockUsageOut,
    ContentBlockUsagesOut,
)
from apps.api.src.modules.workspaces.content.shared.service import CONTENT_BLOCKS_NAMESPACE


class WorkspaceContentBlocksMixin:
    if TYPE_CHECKING:
        from apps.api.src.modules.workspaces.content.repository import WorkspaceContentRepository
        from apps.api.src.modules.workspaces.content.schema import ContentMenuItemOut, ContentMenuOut, ContentViewOut

        repo: WorkspaceContentRepository

        @staticmethod
        def _now_ms() -> int: ...

        @staticmethod
        def _parse_uuid_value(value: object) -> UUID | None: ...

        async def _get_setting_list(self, *, site_id: UUID, namespace: str) -> list[dict[str, object]]: ...

        async def _put_setting_list(
            self,
            *,
            site_id: UUID,
            namespace: str,
            items: list[dict[str, object]],
        ) -> None: ...

        async def list_menus(self, *, site_id: UUID) -> list[ContentMenuOut]: ...

        async def list_views(self, *, site_id: UUID) -> list[ContentViewOut]: ...

        @staticmethod
        def _walk_menu_items(items: list[ContentMenuItemOut]) -> list[ContentMenuItemOut]: ...

    async def _entry_contains_any_marker(
        self,
        *,
        entry_id: UUID,
        draft_revision: int,
        published_revision: int | None,
        markers: set[str],
    ) -> bool:
        revisions: list[int] = []
        if draft_revision > 0:
            revisions.append(int(draft_revision))
        if published_revision is not None and int(published_revision) not in revisions:
            revisions.append(int(published_revision))

        for revision in revisions:
            record = await self.repo.get_revision_by_number(entry_id=entry_id, revision=revision)
            if record is None:
                raise NotFound("Revision not found", error="CONTENT_ENTRY_REVISION_NOT_FOUND")
            snapshot_text = json.dumps(record.snapshot, ensure_ascii=True)
            if any(marker in snapshot_text for marker in markers):
                return True
        return False

    async def list_blocks(self, *, site_id: UUID) -> list[ContentBlockOut]:
        raw = await self._get_setting_list(site_id=site_id, namespace=CONTENT_BLOCKS_NAMESPACE)
        out: list[ContentBlockOut] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            block_id = self._parse_uuid_value(item.get("id"))
            if block_id is None:
                continue
            raw_updated = item.get("updatedAtMs")
            if raw_updated is None:
                updated_at_ms = 0
            elif isinstance(raw_updated, int):
                updated_at_ms = raw_updated
            else:
                raise Conflict("Invalid block data", error="CONTENT_BLOCK_DATA_INVALID")

            raw_payload = item.get("payload")
            payload_value = raw_payload if isinstance(raw_payload, dict) else None
            out.append(
                ContentBlockOut(
                    id=block_id,
                    code=str(item.get("code") or ""),
                    name=str(item.get("name") or ""),
                    payload=payload_value,
                    updated_at_ms=updated_at_ms,
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
        updates: dict[str, object] = {"updated_at_ms": self._now_ms()}
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
            entry_id = UUID(str(entry.id))
            draft_revision = int(getattr(entry, "draft_revision", 0) or 0)
            published_revision_raw = getattr(entry, "published_revision", None)
            published_revision = int(published_revision_raw) if published_revision_raw is not None else None
            if await self._entry_contains_any_marker(
                entry_id=entry_id,
                draft_revision=draft_revision,
                published_revision=published_revision,
                markers=block_markers,
            ):
                usages.append(
                    ContentBlockUsageOut(
                        source="entry",
                        source_id=entry_id,
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
