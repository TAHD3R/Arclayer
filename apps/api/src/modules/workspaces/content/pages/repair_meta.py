from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from apps.api.src.core.exceptions import Conflict
from apps.api.src.models.content.content import ContentEntryRecord, ContentRevisionRecord
from apps.api.src.models.sites.site_page import SitePageRecord


@dataclass(frozen=True)
class PageEntryRepairContext:
    slug: str
    locale: str


@dataclass(frozen=True)
class SitePageRepairMeta:
    path: str
    parent_entry_id: UUID | None
    sort_order: int


@dataclass(frozen=True)
class LegacyPageMetaLoadResult:
    available: bool
    meta_by_id: dict[UUID, dict[str, object]]


_LEGACY_CONTENT_ENTRY_COLUMNS: tuple[str, ...] = ("path", "parent_entry_id", "sort_order", "locale")


def _is_asyncpg(conn: BaseDBAsyncClient) -> bool:
    return "tortoise.backends.asyncpg" in conn.__class__.__module__


def _is_sqlite(conn: BaseDBAsyncClient) -> bool:
    return "tortoise.backends.sqlite" in conn.__class__.__module__


def parse_legacy_sort_order(raw_sort: object) -> int:
    if raw_sort is None:
        return 0
    if isinstance(raw_sort, bool):
        return int(raw_sort)
    if isinstance(raw_sort, int):
        return raw_sort
    if isinstance(raw_sort, float):
        return int(raw_sort)
    if isinstance(raw_sort, str):
        value = raw_sort.strip()
        if not value:
            return 0
        try:
            return int(value)
        except ValueError as exc:
            raise Conflict(
                "Legacy page sort order invalid",
                error="PAGE_ROUTE_TREE_REPAIR_SORT_ORDER_INVALID",
            ) from exc

    raise Conflict(
        "Legacy page sort order invalid",
        error="PAGE_ROUTE_TREE_REPAIR_SORT_ORDER_INVALID",
    )


async def load_page_entry_repair_context(
    *,
    conn: BaseDBAsyncClient,
    workspace_id: UUID,
    site_id: UUID,
    entry_ids: list[UUID],
) -> dict[UUID, PageEntryRepairContext]:
    if not entry_ids:
        return {}
    rows = await (
        ContentEntryRecord
        .filter(workspace_id=workspace_id, site_id=site_id, id__in=entry_ids)
        .using_db(conn)
        .values("id", "slug", "locale")
    )
    out: dict[UUID, PageEntryRepairContext] = {}
    for row in rows:
        entry_id = UUID(str(row["id"]))
        slug = str(row.get("slug") or "").strip()
        locale = str(row.get("locale") or "zh-CN")
        out[entry_id] = PageEntryRepairContext(slug=slug, locale=locale)
    return out


async def load_site_page_repair_meta(
    *,
    conn: BaseDBAsyncClient,
    site_id: UUID,
    entry_ids: list[UUID],
) -> dict[UUID, SitePageRepairMeta]:
    if not entry_ids:
        return {}
    rows = await (
        SitePageRecord
        .filter(site_id=site_id, id__in=entry_ids)
        .using_db(conn)
        .values("id", "path", "parent_id", "sort_order")
    )
    out: dict[UUID, SitePageRepairMeta] = {}
    for row in rows:
        entry_id = UUID(str(row["id"]))
        raw_path = row.get("path")
        if not isinstance(raw_path, str) or not raw_path.strip():
            continue
        raw_parent = row.get("parent_id")
        parent_entry_id = UUID(str(raw_parent)) if raw_parent is not None else None
        sort_order = int(row.get("sort_order") or 0)
        out[entry_id] = SitePageRepairMeta(
            path=raw_path.strip(),
            parent_entry_id=parent_entry_id,
            sort_order=sort_order,
        )
    return out


async def load_latest_revision_paths(
    *,
    conn: BaseDBAsyncClient,
    entry_ids: list[UUID],
) -> dict[UUID, str]:
    if not entry_ids:
        return {}
    rows = await (
        ContentRevisionRecord
        .filter(entry_id__in=entry_ids)
        .using_db(conn)
        .order_by("entry_id", "-revision")
        .values("entry_id", "snapshot")
    )
    out: dict[UUID, str] = {}
    for row in rows:
        entry_id = UUID(str(row["entry_id"]))
        if entry_id in out:
            continue
        snapshot = row.get("snapshot")
        if not isinstance(snapshot, dict):
            continue
        meta = snapshot.get("meta")
        if not isinstance(meta, dict):
            continue
        raw_path = meta.get("path")
        if not isinstance(raw_path, str) or not raw_path.strip():
            continue
        out[entry_id] = raw_path.strip()
    return out


async def try_load_legacy_page_meta(
    *,
    conn: BaseDBAsyncClient,
    site_id: UUID,
    entry_ids: list[UUID],
) -> LegacyPageMetaLoadResult:
    if not entry_ids:
        return LegacyPageMetaLoadResult(available=True, meta_by_id={})

    if _is_asyncpg(conn):
        sql_cols = """
SELECT column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = $1
  AND column_name = ANY($2::text[])
"""
        _, col_rows = await conn.execute_query(sql_cols, ["content_entries", list(_LEGACY_CONTENT_ENTRY_COLUMNS)])
        present = {str(row.get("column_name")) for row in col_rows if isinstance(row, dict)}
        if not set(_LEGACY_CONTENT_ENTRY_COLUMNS).issubset(present):
            return LegacyPageMetaLoadResult(available=False, meta_by_id={})

        sql = """
SELECT id, path, parent_entry_id, sort_order, locale
FROM content_entries
WHERE site_id = $1 AND id = ANY($2::uuid[])
"""
        _, rows = await conn.execute_query(sql, [site_id, entry_ids])
        out: dict[UUID, dict[str, object]] = {}
        for row in rows:
            entry_id = UUID(str(row["id"]))
            out[entry_id] = dict(row)
        return LegacyPageMetaLoadResult(available=True, meta_by_id=out)

    if _is_sqlite(conn):
        _, col_rows = await conn.execute_query("PRAGMA table_info(content_entries)", [])
        present = {str(row.get("name")) for row in col_rows if isinstance(row, dict)}
        if not set(_LEGACY_CONTENT_ENTRY_COLUMNS).issubset(present):
            return LegacyPageMetaLoadResult(available=False, meta_by_id={})

        placeholders = ", ".join(["?"] * len(entry_ids))
        sql = f"""
SELECT id, path, parent_entry_id, sort_order, locale
FROM content_entries
WHERE site_id = ? AND id IN ({placeholders})
"""
        values = [str(site_id), *[str(entry_id) for entry_id in entry_ids]]
        _, rows = await conn.execute_query(sql, values)
        out: dict[UUID, dict[str, object]] = {}
        for row in rows:
            entry_id = UUID(str(row["id"]))
            out[entry_id] = dict(row)
        return LegacyPageMetaLoadResult(available=True, meta_by_id=out)

    return LegacyPageMetaLoadResult(available=False, meta_by_id={})
