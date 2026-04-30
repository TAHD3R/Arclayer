from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import NotFound
from src.modules.sites.namespaces.service import EDITOR_GLOBAL_SECTIONS_NAMESPACE
from src.modules.sites.publishing.includes.service import PublishingIncludesService
from src.modules.sites.publishing.routes.resolve.content.service import ContentPageRouteResolver, _flatten_sections
from src.modules.sites.repository import SitesRepository
from src.modules.sites.shared.service import normalize_path as normalize_site_path


class ContentDeliveryService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._includes = PublishingIncludesService(settings, repo=repo)
        self._page_resolver = ContentPageRouteResolver(settings, repo=repo, includes=self._includes)

    async def delivery_get_menu(self, *, site_id: UUID, menu_key: str):
        from src.modules.sites.delivery.schema import DeliveryMenuOut

        await self._repo.get_site_by_id(site_id=site_id)
        menu = await self._repo.get_menu_by_key(site_id=site_id, key=menu_key)
        items_raw = menu.get("items") if isinstance(menu, dict) else None
        return DeliveryMenuOut(
            key=menu_key,
            items=(items_raw if isinstance(items_raw, list) else []),
        )

    async def delivery_get_style(self, *, site_id: UUID):
        from src.modules.sites.delivery.schema import DeliveryStyleOut

        await self._repo.get_site_by_id(site_id=site_id)
        style = await self._repo.get_site_style(site_id=site_id)
        return DeliveryStyleOut(
            effective=style if isinstance(style, dict) else None,
        )

    async def delivery_resolve_page(
        self,
        *,
        site_id: UUID,
        path: str,
        perspective: Literal["published", "preview"],
    ):
        return await self._page_resolver.resolve_delivery_path(
            site_id=site_id,
            pathname=normalize_site_path(path),
            perspective=perspective,
        )

    async def delivery_get_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        perspective: Literal["published", "preview"],
    ):
        return await self._page_resolver.resolve_delivery_page_by_id(
            site_id=site_id,
            page_id=page_id,
            perspective=perspective,
        )

    async def delivery_get_section_by_alias(
        self,
        *,
        site_id: UUID,
        alias: str,
        perspective: Literal["published", "preview"],
    ):
        from src.modules.sites.delivery.schema import DeliverySectionDocumentOut, DeliverySectionOut

        target_alias = alias.strip()
        if not target_alias:
            raise NotFound("Section not found", error="SECTION_NOT_FOUND")

        item, use_rev, state, snapshot, release_id = await self._resolve_section_source(
            site_id=site_id,
            alias=target_alias,
            perspective=perspective,
        )
        warnings = await self._page_resolver._resolve_page_dependencies(
            site_id=site_id,
            raw_page_blueprint=snapshot.raw_page_blueprint,
            mode="public" if perspective == "published" else "preview",
            release_id=release_id,
        )
        layout, sections = _flatten_sections(
            raw_page_blueprint=snapshot.raw_page_blueprint,
            raw_slot_mapping=snapshot.raw_slot_mapping,
            primary=None,
            route_params={},
            strict_bindings=True,
        )
        fields = snapshot.fields if isinstance(snapshot.fields, dict) else {}
        return DeliverySectionOut.model_validate({
            "id": item.id,
            "alias": target_alias,
            "title": str(fields.get("title") or item.title or target_alias),
            "revision": use_rev,
            "revisionState": state,
            "draftRevision": int(item.draft_version or 0),
            "publishedRevision": int(item.published_version or 0) or None,
            "document": DeliverySectionDocumentOut(layout=layout, sections=sections),
            "warnings": warnings or None,
        })

    async def delivery_get_global_set(
        self,
        *,
        site_id: UUID,
        key: str,
        perspective: Literal["published", "preview"],
    ):
        from src.modules.sites.delivery.schema import DeliveryGlobalSetItemOut, DeliveryGlobalSetOut
        from src.modules.sites.settings.schema import SiteGlobalSectionOut

        target_key = key.strip()
        if not target_key:
            raise NotFound("Global set not found", error="GLOBAL_SET_NOT_FOUND")

        await self._repo.get_site_by_id(site_id=site_id)
        setting = await self._repo.get_site_setting(site_id=site_id, namespace=EDITOR_GLOBAL_SECTIONS_NAMESPACE)
        value = setting.value if setting is not None and isinstance(setting.value, dict) else {}
        raw_items = value.get("items") if isinstance(value, dict) else None
        items = []
        if isinstance(raw_items, list):
            for raw in raw_items:
                if not isinstance(raw, dict):
                    continue
                parsed = SiteGlobalSectionOut.model_validate(raw)
                if parsed.kind == target_key and parsed.enabled:
                    items.append(parsed)
        if not items:
            raise NotFound("Global set not found", error="GLOBAL_SET_NOT_FOUND")

        resolved_items: list[DeliveryGlobalSetItemOut] = []
        for item in items:
            section_alias = self._extract_global_section_alias(item.payload)
            section = (
                await self.delivery_get_section_by_alias(site_id=site_id, alias=section_alias, perspective=perspective)
                if section_alias is not None
                else None
            )
            resolved_items.append(
                DeliveryGlobalSetItemOut(
                    id=item.id,
                    name=item.name,
                    key=item.kind,
                    payload=item.payload,
                    section_alias=section_alias,
                    section=section,
                )
            )

        return DeliveryGlobalSetOut(key=target_key, items=resolved_items)

    async def _resolve_section_source(
        self,
        *,
        site_id: UUID,
        alias: str,
        perspective: Literal["published", "preview"],
    ) -> tuple[Any, int, Literal["draft", "published"], Any, UUID | None]:
        if perspective == "published":
            release = await self._repo.get_active_release(site_id=site_id)
            if release is None:
                raise NotFound("Section not found", error="SECTION_NOT_FOUND")
            graph_nodes = await self._repo.list_active_release_nodes_by_model_key(
                site_id=site_id,
                model_key="reusable-section",
            )
            for graph_node in graph_nodes:
                item = graph_node.item
                use_rev, state, snapshot = await self._page_resolver._load_snapshot_from_version(
                    item=item,
                    version=graph_node.version,
                    state="published",
                )
                section_key = str(snapshot.fields.get("section_key") or "").strip()
                if section_key != alias:
                    continue
                return item, use_rev, state, snapshot, release.id
            raise NotFound("Section not found", error="SECTION_NOT_FOUND")

        candidates = await self._repo.list_content_entries_by_model_key(site_id=site_id, model_key="reusable-section")
        for candidate in candidates:
            draft_snapshot = await self._page_resolver._load_snapshot_for_state(item=candidate, state="draft")
            if draft_snapshot is not None and str(draft_snapshot.fields.get("section_key") or "").strip() == alias:
                return candidate, int(candidate.draft_version or 0), "draft", draft_snapshot, None
            published_snapshot = await self._page_resolver._load_snapshot_for_state(item=candidate, state="published")
            if (
                published_snapshot is not None
                and str(published_snapshot.fields.get("section_key") or "").strip() == alias
            ):
                return (
                    candidate,
                    int(candidate.published_version or 0),
                    "published",
                    published_snapshot,
                    None,
                )
        raise NotFound("Section not found", error="SECTION_NOT_FOUND")

    @staticmethod
    def _extract_global_section_alias(payload: dict[str, Any] | None) -> str | None:
        if not isinstance(payload, dict):
            return None
        for key in ("sectionAlias", "sectionKey", "alias"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None
