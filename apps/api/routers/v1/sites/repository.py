from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from typing import Literal, cast
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.common.utils.tortoise_protocols import RouteTemplateIds, SettingUpdatedBy
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.models.setting import SettingRecord
from apps.api.models.site import SiteRecord
from apps.api.models.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord
from apps.api.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.models.site_route_template import RouteTemplateRecord
from apps.api.routers.v1.sites.schema import DocumentIR
from apps.api.settings.scopes import SCOPE_TYPE_SITE


def normalize_path(path: str) -> str:
    if not path:
        return "/"
    pathname = path if path.startswith("/") else f"/{path}"
    if pathname == "/":
        return "/"
    return pathname[:-1] if pathname.endswith("/") else pathname


@dataclass(frozen=True)
class RouteTemplateMatch:
    template_id: UUID
    entry_type_id: UUID
    params: dict[str, str]
    template_page_revision_id: UUID | None


@dataclass(frozen=True)
class ResolvedEntryDocument:
    entry_id: UUID
    draft_rev: int
    published_rev: int
    revision: int
    revision_state: Literal["draft", "published"]
    document: DocumentIR


@dataclass(frozen=True)
class _CompiledRouteTemplate:
    template_id: UUID
    entry_type_id: UUID
    template_page_revision_id: UUID | None
    path_pattern: str
    segments: tuple[tuple[str, str], ...]
    # Specificity is purely a function of pattern itself:
    # - more static segments => more specific
    # - ties are broken deterministically by (segment_count, path_pattern)
    specificity: int
    sort_key: tuple[int, int, str]


class _RouteTemplateCache:
    """
    In-process route template cache.

    Sprint 3:
    - We keep it conservative and TTL-based because there is no Admin UI to update templates yet.
    - Later (when RouteTemplate becomes editable), we should add invalidation based on:
      - `updated_at` watermark per site
      - or an explicit "site resolver version" key stored in DB/Valkey.
    """

    _TTL_MS = 5_000

    def __init__(self) -> None:
        self._by_site: dict[str, tuple[int, list[_CompiledRouteTemplate]]] = {}
        self._lock = asyncio.Lock()

    async def get(self, *, site_id: str, loader) -> list[_CompiledRouteTemplate]:
        now_ms = int(time.time() * 1000)
        cached = self._by_site.get(site_id)
        if cached and cached[0] > now_ms:
            return cached[1]

        async with self._lock:
            cached2 = self._by_site.get(site_id)
            if cached2 and cached2[0] > now_ms:
                return cached2[1]
            compiled = await loader()
            self._by_site[site_id] = (now_ms + self._TTL_MS, compiled)
            return compiled


_route_template_cache = _RouteTemplateCache()


class SitesRepository:
    async def get_site_by_id(self, *, site_id: str) -> SiteRecord:
        site = await SiteRecord.get_or_none(id=site_id)
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        return site

    async def get_site_by_host(self, *, host: str) -> SiteRecord | None:
        raw = (host or "").strip().lower()
        if not raw:
            return None
        # Strip port for common Host header formats like "localhost:3100".
        if ":" in raw and "]" not in raw:
            raw = raw.split(":", 1)[0]
        return await SiteRecord.get_or_none(primary_host=raw)

    async def get_site_setting(self, *, site_id: str, namespace: str) -> SettingRecord | None:
        ns = (namespace or "").strip()
        if not ns:
            return None
        return await SettingRecord.get_or_none(scope_type=SCOPE_TYPE_SITE, scope_id=site_id, namespace=ns)

    async def upsert_site_setting(
        self,
        *,
        site_id: str,
        namespace: str,
        value: dict | None,
        updated_by: UUID | None,
    ) -> SettingRecord:
        ns = (namespace or "").strip()
        if not ns:
            raise Conflict("Invalid namespace", error="SETTING_NAMESPACE_INVALID")

        rec, created = await SettingRecord.get_or_create(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_id,
            namespace=ns,
            defaults={"value": value, "updated_by": updated_by},
        )
        if created:
            return rec

        rec.value = value
        cast(SettingUpdatedBy, rec).updated_by = updated_by
        await rec.save(update_fields=["value", "updated_by"])
        return rec

    async def get_page_by_id(self, *, site_id: str, page_id: UUID) -> SitePageRecord | None:
        return await SitePageRecord.get_or_none(id=page_id, site_id=site_id)

    async def get_page_by_path(self, *, site_id: str, path: str) -> SitePageRecord | None:
        pathname = normalize_path(path)
        return await SitePageRecord.get_or_none(site_id=site_id, path=pathname)

    async def get_page_revision(self, *, page_id: UUID, rev: int) -> SitePageRevisionRecord | None:
        return await SitePageRevisionRecord.get_or_none(page_id=page_id, rev=rev)

    async def get_entry_by_id(self, *, site_id: str, entry_id: UUID) -> EntryRecord | None:
        return await EntryRecord.get_or_none(id=entry_id, site_id=site_id)

    async def get_entry_revision(self, *, entry_id: UUID, rev: int) -> EntryRevisionRecord | None:
        return await EntryRevisionRecord.get_or_none(entry_id=entry_id, rev=rev)

    async def get_entry_type_by_code(self, *, site_id: str, code: str) -> EntryTypeRecord:
        c = (code or "").strip()
        if not c:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        et = await EntryTypeRecord.get_or_none(site_id=site_id, code=c)
        if et is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        return et

    async def save_entry_draft_by_slug(
        self,
        *,
        site_id: str,
        entry_type_id: UUID,
        slug: str,
        document: DocumentIR | None,
        data: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
    ) -> tuple[UUID, int, int]:
        """
        Save an entry draft by (entry_type_id, slug).

        Returns: (entry_id, revision, saved_at_ms).
        """

        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            entry = (
                await EntryRecord
                .filter(site_id=site_id, entry_type_id=entry_type_id, slug=s)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if entry is None:
                entry = await EntryRecord.create(
                    site_id=site_id,
                    entry_type_id=entry_type_id,
                    slug=s,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
                    using_db=conn,
                )

            current_rev = int(entry.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await EntryRevisionRecord.create(
                entry_id=entry.id,
                rev=next_rev,
                data=data,
                document=(document.model_dump(by_alias=True) if document is not None else None),
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            entry.draft_rev = next_rev
            await entry.save(update_fields=["draft_rev"], using_db=conn)

        return UUID(str(entry.id)), next_rev, now_ms

    async def publish_entry_by_slug(
        self,
        *,
        site_id: str,
        entry_type_id: UUID,
        slug: str,
        revision: int | None,
    ) -> tuple[UUID, int, int]:
        """
        Publish an entry revision by (entry_type_id, slug).

        Returns: (entry_id, published_revision, published_at_ms).
        """

        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            entry = (
                await EntryRecord
                .filter(site_id=site_id, entry_type_id=entry_type_id, slug=s)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")

            target_rev = int(revision) if revision is not None else int(entry.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            exists = await EntryRevisionRecord.filter(entry_id=entry.id, rev=target_rev).using_db(conn).exists()
            if not exists:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            entry.published_rev = target_rev
            await entry.save(update_fields=["published_rev"], using_db=conn)

        return UUID(str(entry.id)), target_rev, now_ms

    async def save_page_draft_by_path(
        self,
        *,
        site_id: str,
        path: str,
        document: DocumentIR,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
    ) -> tuple[int, int]:
        """
        Save a page draft by pathname (helper for editor mode).

        Returns: (revision, saved_at_ms).
        """

        pathname = normalize_path(path)
        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = (
                await SitePageRecord.filter(site_id=site_id, path=pathname).using_db(conn).select_for_update().first()
            )
            if page is None:
                page = await SitePageRecord.create(
                    site_id=site_id,
                    path=pathname,
                    parent_id=None,
                    sort_order=0,
                    visibility=SitePageVisibility.PUBLIC,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
                    using_db=conn,
                )

            current_rev = int(page.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await SitePageRevisionRecord.create(
                page_id=page.id,
                rev=next_rev,
                document=document.model_dump(by_alias=True),
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            page.draft_rev = next_rev
            await page.save(update_fields=["draft_rev"], using_db=conn)

        return next_rev, now_ms

    async def publish_page_by_path(
        self,
        *,
        site_id: str,
        path: str,
        revision: int | None,
    ) -> tuple[int, int]:
        """
        Publish a page revision by pathname.

        Returns: (published_revision, published_at_ms).
        """

        pathname = normalize_path(path)
        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = (
                await SitePageRecord.filter(site_id=site_id, path=pathname).using_db(conn).select_for_update().first()
            )
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            target_rev = int(revision) if revision is not None else int(page.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            exists = await SitePageRevisionRecord.filter(page_id=page.id, rev=target_rev).using_db(conn).exists()
            if not exists:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            page.published_rev = target_rev
            await page.save(update_fields=["published_rev"], using_db=conn)

        return target_rev, now_ms

    async def resolve_entry_by_slug(
        self,
        *,
        site_id: str,
        entry_type_id: UUID,
        slug: str,
        mode: Literal["public", "preview"],
    ) -> ResolvedEntryDocument | None:
        entry = await EntryRecord.get_or_none(site_id=site_id, entry_type_id=entry_type_id, slug=slug)
        if entry is None:
            return None

        draft_rev = int(entry.draft_rev or 0)
        published_rev = int(entry.published_rev or 0)

        revision = published_rev if mode == "public" else (draft_rev or published_rev)
        if revision <= 0:
            return None

        revision_state: Literal["draft", "published"]
        if mode == "public":
            revision_state = "published"
        else:
            revision_state = "draft" if draft_rev else "published"

        rec = await EntryRevisionRecord.get_or_none(entry_id=entry.id, rev=revision)
        if rec is None or rec.document is None:
            return None

        doc = DocumentIR.model_validate(rec.document)
        return ResolvedEntryDocument(
            entry_id=UUID(str(entry.id)),
            draft_rev=draft_rev,
            published_rev=published_rev,
            revision=revision,
            revision_state=revision_state,
            document=doc,
        )

    async def list_route_templates(self, *, site_id: str) -> list[RouteTemplateRecord]:
        return (
            await RouteTemplateRecord
            .filter(site_id=site_id, is_active=True)
            .prefetch_related("entry_type", "template_page_revision")
            .all()
        )

    async def match_route_template(self, *, site_id: str, pathname: str) -> RouteTemplateMatch | None:
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

        compiled = await _route_template_cache.get(site_id=site_id, loader=_load)

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

    async def list_public_sitemap_paths(self, *, site_id: str) -> list[str]:
        """
        List public sitemap paths for a site.

        Sprint 3:
        - Pages: include only `visibility=public` and `published_rev` present.
        - Entries: include published entries for templates that have a single `:slug` param.
        """

        page_paths = await SitePageRecord.filter(
            site_id=site_id,
            visibility=SitePageVisibility.PUBLIC,
            published_rev__not_isnull=True,
        ).values_list("path", flat=True)
        page_set = {normalize_path(p) for p in page_paths if isinstance(p, str) and p}

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
