from __future__ import annotations

import asyncio
import re
import time
from typing import cast
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.common.protocols.tortoise import RouteTemplateIds
from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.modules.sites.models.site_entry import EntryRecord
from apps.api.src.modules.sites.models.site_page import SitePageRecord, SitePageVisibility
from apps.api.src.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.src.modules.sites.types import RouteTemplateMatch, _CompiledRouteTemplate
from apps.api.src.modules.sites.utils import normalize_path
from apps.api.src.modules.workspaces.content.models.content import ContentEntryRecord


class _RouteTemplateCache:
    """
    In-process route template cache.

    Sprint 3:
    - Default path: TTL-based caching for read-mostly workloads.
    - When route templates become editable, writers should explicitly invalidate
      this cache (per-site) after successful create/update/delete operations.
    """

    _TTL_MS = 5_000

    def __init__(self) -> None:
        # Keyed by (site_id, version). Version is used for cross-instance invalidation.
        self._by_key: dict[tuple[UUID, int], tuple[int, list[_CompiledRouteTemplate]]] = {}
        self._lock = asyncio.Lock()

    async def get(self, *, site_id: UUID, version: int, loader) -> list[_CompiledRouteTemplate]:
        now_ms = int(time.time() * 1000)
        key = (site_id, int(version or 0))
        cached = self._by_key.get(key)
        if cached and cached[0] > now_ms:
            return cached[1]

        async with self._lock:
            cached2 = self._by_key.get(key)
            if cached2 and cached2[0] > now_ms:
                return cached2[1]
            compiled = await loader()
            self._by_key[key] = (now_ms + self._TTL_MS, compiled)
            return compiled

    def invalidate(self, *, site_id: UUID) -> None:
        # Remove all cached versions for a site (writers call this after mutations).
        for key in list(self._by_key.keys()):
            if key[0] == site_id:
                self._by_key.pop(key, None)


_route_template_cache = _RouteTemplateCache()


class SiteRoutingRepository(BaseRepository):
    async def list_route_templates(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return (
            await RouteTemplateRecord
            .filter(site_id=site_id, is_active=True)
            .prefetch_related("entry_type", "template_page_revision")
            .all()
        )

    async def list_route_templates_all(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return (
            await RouteTemplateRecord
            .filter(site_id=site_id)
            .prefetch_related("entry_type", "template_page_revision")
            .order_by("path_pattern")
            .all()
        )

    async def get_route_template_by_id(self, *, site_id: UUID, template_id: UUID) -> RouteTemplateRecord | None:
        return (
            await RouteTemplateRecord
            .filter(id=template_id, site_id=site_id)
            .prefetch_related("entry_type", "template_page_revision")
            .first()
        )

    async def create_route_template(
        self,
        *,
        site_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        try:
            rec = await RouteTemplateRecord.create(
                site_id=site_id,
                path_pattern=path_pattern,
                entry_type_id=entry_type_id,
                template_page_revision_id=template_page_revision_id,
                is_active=bool(is_active),
            )
        except IntegrityError:
            raise Conflict("Route template already exists", error="ROUTE_TEMPLATE_CONFLICT") from None

        await rec.fetch_related("entry_type", "template_page_revision")
        return rec

    async def update_route_template(
        self,
        *,
        site_id: UUID,
        template_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        async with in_transaction() as conn:
            rec = (
                await RouteTemplateRecord
                .filter(id=template_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Route template not found", error="ROUTE_TEMPLATE_NOT_FOUND")

            rec.path_pattern = path_pattern
            rec.entry_type_id = entry_type_id
            rec.template_page_revision_id = template_page_revision_id
            rec.is_active = bool(is_active)
            try:
                await rec.save(
                    update_fields=[
                        "path_pattern",
                        "entry_type_id",
                        "template_page_revision_id",
                        "is_active",
                    ],
                    using_db=conn,
                )
            except IntegrityError:
                raise Conflict("Route template already exists", error="ROUTE_TEMPLATE_CONFLICT") from None

        await rec.fetch_related("entry_type", "template_page_revision")
        return rec

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> None:
        deleted = await RouteTemplateRecord.filter(site_id=site_id, id=template_id).delete()
        if not deleted:
            raise NotFound("Route template not found", error="ROUTE_TEMPLATE_NOT_FOUND")

    def invalidate_route_template_cache(self, *, site_id: UUID) -> None:
        _route_template_cache.invalidate(site_id=site_id)

    async def match_route_template(
        self,
        *,
        site_id: UUID,
        pathname: str,
        cache_version: int = 0,
    ) -> RouteTemplateMatch | None:
        path = normalize_path(pathname)

        async def _load() -> list[_CompiledRouteTemplate]:
            templates = await self.list_route_templates(site_id=site_id)
            compiled: list[_CompiledRouteTemplate] = []
            for t in templates:
                t_like = cast(RouteTemplateIds, t)
                ct = _compile_path_pattern(
                    t.path_pattern,
                    template_id=UUID(str(t.id)),
                    entry_type_id=UUID(str(t_like.entry_type_id)),
                    template_page_revision_id=UUID(str(t_like.template_page_revision_id))
                    if t_like.template_page_revision_id
                    else None,
                )
                if ct is None:
                    continue
                compiled.append(ct)

            # Deterministic order: most specific first.
            compiled.sort(key=lambda x: x.sort_key, reverse=True)
            return compiled

        compiled = await _route_template_cache.get(site_id=site_id, version=int(cache_version or 0), loader=_load)

        for ct in compiled:
            params = _match_compiled(ct, path)
            if params is None:
                continue
            return RouteTemplateMatch(
                template_id=ct.template_id,
                entry_type_id=ct.entry_type_id,
                params=params,
                template_page_revision_id=ct.template_page_revision_id,
            )
        return None

    async def list_public_sitemap_paths(self, *, site_id: UUID) -> list[str]:
        """
        List public sitemap paths for a site.

        Sprint 3:
        - Pages: include only `visibility=public` and `published_rev` present.
        - Entries: include published entries for templates that have a single `:slug` param.
        """

        content_page_paths = await ContentEntryRecord.filter(
            site_id=site_id,
            type__kind="page",
            visibility="public",
            published_revision__not_isnull=True,
            path__not_isnull=True,
        ).values_list("path", flat=True)
        content_page_set = {normalize_path(p) for p in content_page_paths if isinstance(p, str) and p}

        legacy_page_paths = await SitePageRecord.filter(
            site_id=site_id,
            visibility=SitePageVisibility.PUBLIC,
            published_rev__not_isnull=True,
        ).values_list("path", flat=True)
        legacy_page_set = {normalize_path(p) for p in legacy_page_paths if isinstance(p, str) and p}
        page_set = content_page_set | legacy_page_set

        templates = await RouteTemplateRecord.filter(site_id=site_id, is_active=True).all()
        entry_paths: set[str] = set()
        for t in templates:
            t_like = cast(RouteTemplateIds, t)
            ct = _compile_path_pattern(
                t.path_pattern,
                template_id=UUID(str(t.id)),
                entry_type_id=UUID(str(t_like.entry_type_id)),
                template_page_revision_id=UUID(str(t_like.template_page_revision_id))
                if t_like.template_page_revision_id
                else None,
            )
            if ct is None:
                continue

            param_names = {name for kind, name in ct.segments if kind == "param"}
            if param_names != {"slug"}:
                continue

            slugs = await EntryRecord.filter(
                site_id=site_id,
                entry_type_id=ct.entry_type_id,
                published_rev__not_isnull=True,
            ).values_list("slug", flat=True)
            for slug in slugs:
                if not isinstance(slug, str):
                    continue
                s = slug.strip()
                if not s or "/" in s:
                    continue
                parts: list[str] = []
                for kind, name in ct.segments:
                    if kind == "static":
                        parts.append(name)
                    else:
                        parts.append(s)
                path = normalize_path("/" + "/".join(parts))
                if path in page_set:
                    continue
                entry_paths.add(path)

        paths = sorted(page_set | entry_paths)
        # Ensure homepage is first (handy for debugging, doesn't matter for consumers).
        if "/" in paths:
            paths.remove("/")
            paths.insert(0, "/")
        return paths


_PARAM_RE = re.compile(r"^:([A-Za-z][A-Za-z0-9_]*)$")


def _compile_path_pattern(
    path_pattern: str,
    *,
    template_id: UUID,
    entry_type_id: UUID,
    template_page_revision_id: UUID | None,
) -> _CompiledRouteTemplate | None:
    if not path_pattern or not path_pattern.startswith("/"):
        return None

    pat = normalize_path(path_pattern)
    if pat == "/":
        # Reserved for the site root; dynamic templates shouldn't use it.
        return None

    pat_segs = pat.split("/")[1:]
    if not pat_segs or any(not s for s in pat_segs):
        return None

    segments: list[tuple[str, str]] = []
    static_count = 0
    seen_params: set[str] = set()
    for seg in pat_segs:
        m = _PARAM_RE.match(seg)
        if m:
            name = m.group(1)
            if name in seen_params:
                return None
            seen_params.add(name)
            segments.append(("param", name))
            continue
        segments.append(("static", seg))
        static_count += 1

    sort_key = (static_count, len(segments), pat)
    return _CompiledRouteTemplate(
        template_id=template_id,
        entry_type_id=entry_type_id,
        template_page_revision_id=template_page_revision_id,
        path_pattern=pat,
        segments=tuple(segments),
        specificity=static_count,
        sort_key=sort_key,
    )


def _match_compiled(compiled: _CompiledRouteTemplate, pathname: str) -> dict[str, str] | None:
    path = normalize_path(pathname)
    path_segs = path.split("/")[1:]
    if len(path_segs) != len(compiled.segments):
        return None

    params: dict[str, str] = {}
    for (kind, value), seg in zip(compiled.segments, path_segs, strict=True):
        if kind == "static":
            if seg != value:
                return None
            continue
        # param
        params[value] = seg

    return params


def _match_path_pattern(path_pattern: str, pathname: str) -> tuple[dict[str, str], int] | None:
    """
    Match a simplified path pattern against a pathname.

    Rules (Sprint 3):
    - Pattern and pathname are both absolute paths (start with '/').
    - Only `:param` single-segment parameters are supported.
    - No splat/optional segments.

    Returns: (params, specificityScore) where specificityScore favors static matches.
    """

    # Kept for tests and for documenting Sprint 3 behavior.
    # Internally we prefer compile+match to support caching.
    ct = _compile_path_pattern(
        path_pattern,
        template_id=UUID(int=0),
        entry_type_id=UUID(int=0),
        template_page_revision_id=None,
    )
    if ct is None:
        return None
    params = _match_compiled(ct, pathname)
    return (params, ct.specificity) if params is not None else None
