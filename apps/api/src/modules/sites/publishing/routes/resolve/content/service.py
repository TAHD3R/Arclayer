from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import Conflict, NotFound
from src.core.exceptions.types import InternalServerError
from src.modules.sites.design.schema import PageBlueprint
from src.modules.sites.publishing.content_snapshot import CanonicalContentSnapshot, build_canonical_content_snapshot
from src.modules.sites.publishing.includes.service import PublishingIncludesService
from src.modules.sites.repository import SitesRepository
from src.modules.sites.schema import (
    ResolveWarningV1,
    SiteFlattenedPageOut,
    SiteFlattenedSectionOut,
    SitePrimaryContextOut,
    SiteResolvedPageMetaOut,
    SiteRouteContextOut,
    SiteRouteMatchOut,
    SiteRouteResolveOut,
)
from src.modules.workspaces.content.routing.service import match_route_binding, route_sort_key


@dataclass(frozen=True, slots=True)
class _RouteBindingCandidate:
    path: str
    route_contract: dict[str, Any] | None
    item: Any


def _resolve_json_path(value: Any, path: list[str]) -> Any:
    current = value
    for segment in path:
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def _normalize_json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, nested in value.items():
            normalized = _normalize_json_value(nested)
            if normalized is not None:
                out[str(key)] = normalized
        return out
    if isinstance(value, list):
        return [_normalize_json_value(item) for item in value if _normalize_json_value(item) is not None]
    return str(value)


def _summarize_depth_one(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, nested in value.items():
            if isinstance(nested, dict):
                summary = {
                    str(child_key): child_value
                    for child_key, child_value in nested.items()
                    if isinstance(child_value, (str, int, float, bool)) or child_value is None
                }
                if summary:
                    out[str(key)] = summary
                continue
            if isinstance(nested, (str, int, float, bool)) or nested is None:
                out[str(key)] = nested
        return out
    return None


def _localized_or_literal(value: Any) -> Any:
    if isinstance(value, dict):
        if value.get("kind") == "binding":
            return value
        if value.get("kind") == "literal":
            return value.get("value")
        if "en-US" in value and isinstance(value["en-US"], str):
            return value["en-US"]
        first = next((item for item in value.values() if isinstance(item, str)), None)
        if first is not None:
            return first
    return value


def _extract_section_defaults(node: dict[str, Any]) -> dict[str, Any]:
    node_type = str(node.get("type") or "")
    if not node_type:
        return {}
    if node_type == "text":
        out: dict[str, Any] = {
            "text": _localized_or_literal(node.get("text")),
        }
        if node.get("tag") is not None:
            out["tag"] = node.get("tag")
        if node.get("align") is not None:
            out["align"] = node.get("align")
        return {key: value for key, value in out.items() if value is not None}
    if node_type == "image":
        return {
            key: value
            for key, value in {
                "src": _localized_or_literal(node.get("src")),
                "alt": _localized_or_literal(node.get("alt")),
                "objectFit": node.get("objectFit"),
            }.items()
            if value is not None
        }
    if node_type == "embed":
        url = _localized_or_literal(node.get("url"))
        return {"url": url} if url is not None else {}
    props = node.get("props")
    if isinstance(props, dict):
        return {str(key): _localized_or_literal(value) for key, value in props.items()}
    return {}


def _extract_sections(raw_page_blueprint: dict[str, Any] | None) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    if not isinstance(raw_page_blueprint, dict):
        return None, []

    if isinstance(raw_page_blueprint.get("rootId"), str) and isinstance(raw_page_blueprint.get("nodesById"), dict):
        root_id = raw_page_blueprint["rootId"]
        nodes = raw_page_blueprint["nodesById"]
        root = nodes.get(root_id) if isinstance(nodes, dict) else None
        if not isinstance(root, dict):
            return None, []
        children = root.get("children") if isinstance(root.get("children"), list) else []
        sections: list[dict[str, Any]] = []
        for child_id in children:
            node = nodes.get(child_id) if isinstance(child_id, str) else None
            if not isinstance(node, dict):
                continue
            sections.append({
                "id": str(node.get("id") or child_id),
                "componentKey": str(node.get("type") or child_id),
                "propsDefaults": _extract_section_defaults(node),
            })
        return root.get("layout") if isinstance(root.get("layout"), dict) else None, sections

    if isinstance(raw_page_blueprint.get("root"), str) and isinstance(raw_page_blueprint.get("nodes"), dict):
        root_id = raw_page_blueprint["root"]
        nodes = raw_page_blueprint["nodes"]
        root = nodes.get(root_id) if isinstance(nodes, dict) else None
        if not isinstance(root, dict):
            return None, []
        children = root.get("children") if isinstance(root.get("children"), list) else []
        sections = []
        for child_id in children:
            node = nodes.get(child_id) if isinstance(child_id, str) else None
            if not isinstance(node, dict):
                continue
            sections.append({
                "id": str(child_id),
                "componentKey": str(node.get("type") or child_id),
                "propsDefaults": {
                    str(key): _localized_or_literal(value) for key, value in (node.get("props") or {}).items()
                }
                if isinstance(node.get("props"), dict)
                else {},
            })
        return root.get("layout") if isinstance(root.get("layout"), dict) else None, sections

    return None, []


def _legacy_section_mapping(raw_slot_mapping: dict[str, Any] | None, component_key: str) -> dict[str, Any]:
    if not isinstance(raw_slot_mapping, dict):
        return {}
    bindings = raw_slot_mapping.get("bindings")
    if not isinstance(bindings, list):
        return {}
    out: dict[str, Any] = {}
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        if str(binding.get("componentKey") or "") != component_key:
            continue
        binding_key = str(binding.get("bindingKey") or "").strip()
        payload = binding.get("payload")
        field = payload.get("field") if isinstance(payload, dict) else None
        if binding_key and isinstance(field, str) and field.strip():
            out[binding_key] = {
                "kind": "context_path",
                "source": "primary",
                "path": [field.strip()],
            }
    return out


def _resolve_mapping_value(mapping: Any, *, primary: dict[str, Any] | None, route_params: dict[str, str]) -> Any:
    if not isinstance(mapping, dict):
        return None
    kind = str(mapping.get("kind") or "").strip()
    if kind == "literal":
        return mapping.get("value")
    if kind != "context_path":
        return None

    source = str(mapping.get("source") or "primary").strip()
    raw_path = mapping.get("path")
    if isinstance(raw_path, list):
        path = [str(segment).strip() for segment in raw_path if str(segment).strip()]
    elif isinstance(raw_path, str) and raw_path.strip():
        path = [segment for segment in raw_path.split(".") if segment]
    else:
        path = []
    if not path:
        return None

    root = primary if source == "primary" else route_params if source in {"route", "routeParams"} else None
    if root is None:
        return None
    return _resolve_json_path(root, path)


def _flatten_sections(
    *,
    raw_page_blueprint: dict[str, Any] | None,
    raw_slot_mapping: dict[str, Any] | None,
    primary: dict[str, Any] | None,
    route_params: dict[str, str],
    strict_bindings: bool = False,
) -> tuple[dict[str, Any] | None, list[SiteFlattenedSectionOut]]:
    layout, section_specs = _extract_sections(raw_page_blueprint)
    sections: list[SiteFlattenedSectionOut] = []
    missing_bindings: list[dict[str, Any]] = []
    structured_sections = raw_slot_mapping.get("sections") if isinstance(raw_slot_mapping, dict) else None
    for spec in section_specs:
        section_id = str(spec["id"])
        component_key = str(spec["componentKey"])
        props = dict(spec.get("propsDefaults") or {})
        structured = structured_sections.get(section_id) if isinstance(structured_sections, dict) else None
        if not isinstance(structured, dict):
            structured = structured_sections.get(component_key) if isinstance(structured_sections, dict) else None
        if isinstance(structured, dict):
            props_defaults = structured.get("propsDefaults")
            if isinstance(props_defaults, dict):
                props.update({str(key): value for key, value in props_defaults.items()})
            props_mapping = structured.get("propsMapping") or structured.get("props")
        else:
            props_mapping = _legacy_section_mapping(raw_slot_mapping, component_key)
        if isinstance(props_mapping, dict):
            for prop_key, mapping in props_mapping.items():
                resolved = _resolve_mapping_value(mapping, primary=primary, route_params=route_params)
                if resolved is not None:
                    props[str(prop_key)] = _normalize_json_value(resolved)
                    continue
                if strict_bindings and str(prop_key) not in props:
                    missing_bindings.append({
                        "sectionId": section_id,
                        "componentKey": component_key,
                        "propKey": str(prop_key),
                        "mapping": _normalize_json_value(mapping),
                    })
        sections.append(
            SiteFlattenedSectionOut(
                id=section_id,
                componentKey=component_key,
                props={str(key): _normalize_json_value(value) for key, value in props.items()},
            )
        )
    if missing_bindings:
        raise Conflict(
            "Page binding resolution failed",
            error="PAGE_BINDING_RESOLUTION_FAILED",
            details=missing_bindings,
        )
    return _normalize_json_value(layout), sections


class ContentPageRouteResolver(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
        includes: PublishingIncludesService,
    ) -> None:
        super().__init__(settings)
        self._repo = repo
        self._includes = includes

    async def _load_snapshot_for_item(
        self,
        *,
        item,
        mode: Literal["public", "preview"],
    ) -> tuple[int | None, Literal["draft", "published"] | None, CanonicalContentSnapshot | None]:
        draft_rev = int(item.draft_version or 0)
        published_rev = int(item.published_version or 0)
        use_rev = published_rev if mode == "public" else (draft_rev or published_rev)
        if use_rev < 1:
            return None, None, None
        version = await self._repo.get_content_revision_by_number(entry_id=UUID(str(item.id)), revision=use_rev)
        if version is None:
            return None, None, None
        presentations = await self._repo.list_content_presentations(version_id=version.id)
        seo_profile = await self._repo.get_content_seo_profile(version_id=version.id)
        snapshot = build_canonical_content_snapshot(
            item=item,
            version=version,
            presentations=presentations,
            seo_profile=seo_profile,
        )
        state: Literal["draft", "published"] = (
            "published" if mode == "public" else ("draft" if draft_rev else "published")
        )
        return use_rev, state, snapshot

    async def _load_snapshot_from_version(
        self,
        *,
        item,
        version,
        state: Literal["draft", "published"],
    ) -> tuple[int, Literal["draft", "published"], CanonicalContentSnapshot]:
        presentations = await self._repo.list_content_presentations(version_id=version.id)
        seo_profile = await self._repo.get_content_seo_profile(version_id=version.id)
        snapshot = build_canonical_content_snapshot(
            item=item,
            version=version,
            presentations=presentations,
            seo_profile=seo_profile,
        )
        return int(version.version), state, snapshot

    async def _load_snapshot_for_state(
        self,
        *,
        item,
        state: Literal["draft", "published"],
    ) -> CanonicalContentSnapshot | None:
        revision = int(item.draft_version or 0) if state == "draft" else int(item.published_version or 0)
        if revision < 1:
            return None
        version = await self._repo.get_content_revision_by_number(entry_id=UUID(str(item.id)), revision=revision)
        if version is None:
            return None
        presentations = await self._repo.list_content_presentations(version_id=version.id)
        seo_profile = await self._repo.get_content_seo_profile(version_id=version.id)
        return build_canonical_content_snapshot(
            item=item,
            version=version,
            presentations=presentations,
            seo_profile=seo_profile,
        )

    @staticmethod
    def _candidate_matches_route(
        *,
        candidate,
        snapshot_fields: dict[str, Any] | None,
        field_key: str,
        param_value: str,
    ) -> bool:
        snapshot_fields = snapshot_fields or {}
        lookup_value = (
            snapshot_fields.get("slug")
            if field_key == "slug"
            else snapshot_fields.get("title")
            if field_key == "title"
            else snapshot_fields.get(field_key)
        )
        if lookup_value is None:
            lookup_value = getattr(candidate, field_key, None)
        return str(lookup_value) == param_value if lookup_value is not None else False

    async def _resolve_page_dependencies(
        self,
        *,
        site_id: UUID,
        raw_page_blueprint: dict[str, Any] | None,
        mode: Literal["public", "preview"],
        release_id: UUID | None = None,
    ) -> list[ResolveWarningV1]:
        if not isinstance(raw_page_blueprint, dict):
            return []
        try:
            document = PageBlueprint.model_validate(raw_page_blueprint)
        except Exception:
            return []

        includes, warnings = await self._includes.resolve_content_refs(
            document=document,
            site_id=site_id,
            mode=mode,
            release_id=release_id,
        )
        blocking = [
            {
                "entryId": str(include.entry_id),
                "resolvedState": include.resolved_state,
                "code": include.error.code,
                "message": include.error.message,
            }
            for include in includes.values()
            if include.error is not None
        ]
        if blocking:
            if mode == "public":
                raise Conflict(
                    "Page dependency unavailable",
                    error="PAGE_DEPENDENCY_UNAVAILABLE",
                    details=blocking,
                )
            raise InternalServerError(
                "Preview dependency unavailable",
                error="PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE",
                details=blocking,
            )
        return warnings

    async def _resolve_primary_context(
        self,
        *,
        site_id: UUID,
        page_item,
        page_snapshot: CanonicalContentSnapshot | None,
        route_contract: dict[str, Any],
        route_params: dict[str, str],
        mode: Literal["public", "preview"],
        release_id: UUID | None = None,
    ) -> SitePrimaryContextOut | None:
        source = route_contract.get("primarySource") if isinstance(route_contract, dict) else None
        if not isinstance(source, dict):
            if page_snapshot is None:
                return None
            page_fields = _summarize_depth_one(page_snapshot.fields) or {}
            return SitePrimaryContextOut(
                id=UUID(str(page_item.id)),
                modelKey=(page_item.model_definition.key if page_item.model_definition is not None else None),
                slug=page_item.slug,
                title=page_item.title,
                data=page_fields,
            )

        model_key = str(source.get("modelKey") or "").strip()
        field_key = str(source.get("fieldKey") or "").strip()
        param_name = str(source.get("paramName") or "").strip()
        param_value = route_params.get(param_name)
        if not model_key or not field_key or not param_name or param_value is None:
            return None

        if mode == "public" and release_id is not None:
            release_candidates = await self._repo.list_active_release_nodes_by_model_key(
                site_id=site_id, model_key=model_key
            )
            for graph_node in release_candidates:
                candidate = graph_node.item
                _, _, published_snapshot = await self._load_snapshot_from_version(
                    item=candidate,
                    version=graph_node.version,
                    state="published",
                )
                published_fields = published_snapshot.fields if published_snapshot is not None else None
                if not self._candidate_matches_route(
                    candidate=candidate,
                    snapshot_fields=published_fields,
                    field_key=field_key,
                    param_value=param_value,
                ):
                    continue
                snapshot_fields = published_fields or {}
                return SitePrimaryContextOut(
                    id=UUID(str(candidate.id)),
                    modelKey=(candidate.model_definition.key if candidate.model_definition is not None else None),
                    slug=str(snapshot_fields.get("slug") or candidate.slug or ""),
                    title=str(snapshot_fields.get("title") or candidate.title or ""),
                    data=_summarize_depth_one(snapshot_fields) or {},
                )

        candidates = await self._repo.list_content_entries_by_model_key(site_id=site_id, model_key=model_key)
        saw_matching_record = False
        for candidate in candidates:
            draft_snapshot = await self._load_snapshot_for_state(item=candidate, state="draft")
            published_snapshot = await self._load_snapshot_for_state(item=candidate, state="published")
            draft_fields = draft_snapshot.fields if draft_snapshot is not None else None
            published_fields = published_snapshot.fields if published_snapshot is not None else None

            if mode == "preview":
                if self._candidate_matches_route(
                    candidate=candidate,
                    snapshot_fields=draft_fields,
                    field_key=field_key,
                    param_value=param_value,
                ):
                    snapshot_fields = draft_fields or {}
                    return SitePrimaryContextOut(
                        id=UUID(str(candidate.id)),
                        modelKey=(candidate.model_definition.key if candidate.model_definition is not None else None),
                        slug=str(snapshot_fields.get("slug") or candidate.slug or ""),
                        title=str(snapshot_fields.get("title") or candidate.title or ""),
                        data=_summarize_depth_one(snapshot_fields) or {},
                    )
                if self._candidate_matches_route(
                    candidate=candidate,
                    snapshot_fields=published_fields,
                    field_key=field_key,
                    param_value=param_value,
                ):
                    snapshot_fields = published_fields or {}
                    return SitePrimaryContextOut(
                        id=UUID(str(candidate.id)),
                        modelKey=(candidate.model_definition.key if candidate.model_definition is not None else None),
                        slug=str(snapshot_fields.get("slug") or candidate.slug or ""),
                        title=str(snapshot_fields.get("title") or candidate.title or ""),
                        data=_summarize_depth_one(snapshot_fields) or {},
                    )
                if self._candidate_matches_route(
                    candidate=candidate,
                    snapshot_fields=None,
                    field_key=field_key,
                    param_value=param_value,
                ):
                    saw_matching_record = True
                continue

            if self._candidate_matches_route(
                candidate=candidate,
                snapshot_fields=published_fields,
                field_key=field_key,
                param_value=param_value,
            ):
                snapshot_fields = published_fields or {}
                return SitePrimaryContextOut(
                    id=UUID(str(candidate.id)),
                    modelKey=(candidate.model_definition.key if candidate.model_definition is not None else None),
                    slug=str(snapshot_fields.get("slug") or candidate.slug or ""),
                    title=str(snapshot_fields.get("title") or candidate.title or ""),
                    data=_summarize_depth_one(snapshot_fields) or {},
                )
            if self._candidate_matches_route(
                candidate=candidate,
                snapshot_fields=draft_fields,
                field_key=field_key,
                param_value=param_value,
            ) or self._candidate_matches_route(
                candidate=candidate,
                snapshot_fields=None,
                field_key=field_key,
                param_value=param_value,
            ):
                saw_matching_record = True

        if saw_matching_record:
            if mode == "public":
                raise Conflict("Primary record unavailable", error="PAGE_PRIMARY_RECORD_UNAVAILABLE")
            raise InternalServerError(
                "Primary record preview unavailable",
                error="PAGE_PRIMARY_RECORD_PREVIEW_UNAVAILABLE",
            )
        raise NotFound("Primary record not found", error="PAGE_PRIMARY_RECORD_NOT_FOUND")

    async def _build_resolve_output(
        self,
        *,
        site_id: UUID,
        pathname: str,
        page_item,
        route_contract: dict[str, Any],
        route_params: dict[str, str],
        draft_rev: int,
        published_rev: int | None,
        use_rev: int | None,
        state: Literal["draft", "published"] | None,
        page_snapshot: CanonicalContentSnapshot | None,
        mode: Literal["public", "preview"],
        strict_binding_errors: bool,
        release_id: UUID | None = None,
    ) -> SiteRouteResolveOut:
        if use_rev is None:
            return SiteRouteResolveOut(
                match=SiteRouteMatchOut(
                    kind="page",
                    params=route_params,
                    page_id=UUID(str(page_item.id)),
                    variant_id=None,
                    revision=None,
                    revision_state=None,
                    draft_revision=draft_rev,
                    published_revision=published_rev,
                ),
                pageMeta=None,
                document=SiteFlattenedPageOut(path=pathname, layout=None, sections=[]),
                context=SiteRouteContextOut(primary=None, routeParams=route_params),
            )

        page_meta = (
            SiteResolvedPageMetaOut(
                title=page_snapshot.meta_title,
                description=page_snapshot.meta_description,
            )
            if page_snapshot is not None
            and (page_snapshot.meta_title is not None or page_snapshot.meta_description is not None)
            else None
        )
        primary = await self._resolve_primary_context(
            site_id=site_id,
            page_item=page_item,
            page_snapshot=page_snapshot,
            route_contract=route_contract,
            route_params=route_params,
            mode=mode,
            release_id=release_id,
        )
        warnings = await self._resolve_page_dependencies(
            site_id=site_id,
            raw_page_blueprint=page_snapshot.raw_page_blueprint if page_snapshot is not None else None,
            mode=mode,
            release_id=release_id,
        )
        primary_data = primary.data if primary is not None else None
        layout, sections = _flatten_sections(
            raw_page_blueprint=page_snapshot.raw_page_blueprint if page_snapshot is not None else None,
            raw_slot_mapping=page_snapshot.raw_slot_mapping if page_snapshot is not None else None,
            primary=primary_data,
            route_params=route_params,
            strict_bindings=strict_binding_errors,
        )
        return SiteRouteResolveOut(
            match=SiteRouteMatchOut(
                kind="page",
                params=route_params,
                page_id=UUID(str(page_item.id)),
                variant_id=None,
                revision=int(use_rev),
                revision_state=state,
                draft_revision=draft_rev,
                published_revision=published_rev,
            ),
            pageMeta=page_meta,
            document=SiteFlattenedPageOut(path=pathname, layout=layout, sections=sections),
            context=SiteRouteContextOut(primary=primary, routeParams=route_params),
            warnings=warnings or None,
        )

    async def resolve(
        self,
        *,
        site_id: UUID,
        pathname: str,
        mode: Literal["public", "preview"],
    ) -> SiteRouteResolveOut | None:
        bindings = await self._repo.list_content_route_bindings(site_id=site_id)
        matches = []
        for binding in bindings:
            params = match_route_binding(binding, pathname)
            if params is None:
                continue
            matches.append((binding, params))
        if not matches:
            return None

        binding, route_params = sorted(matches, key=lambda item: route_sort_key(item[0]))[0]
        page_item = binding.item
        draft_rev = int(page_item.draft_version or 0)
        published_rev = int(page_item.published_version or 0)
        use_rev, state, page_snapshot = await self._load_snapshot_for_item(item=page_item, mode=mode)
        if use_rev is None:
            if mode == "public":
                return None
        route_contract = binding.route_contract if isinstance(binding.route_contract, dict) else {}
        return await self._build_resolve_output(
            site_id=site_id,
            pathname=pathname,
            page_item=page_item,
            route_contract=route_contract,
            route_params=route_params,
            draft_rev=draft_rev,
            published_rev=published_rev or None,
            use_rev=use_rev,
            state=state,
            page_snapshot=page_snapshot,
            mode=mode,
            strict_binding_errors=False,
            release_id=None,
        )

    async def resolve_delivery_path(
        self,
        *,
        site_id: UUID,
        pathname: str,
        perspective: Literal["published", "preview"],
    ) -> SiteRouteResolveOut | None:
        if perspective == "preview":
            bindings = await self._repo.list_content_route_bindings(site_id=site_id)
            matches = []
            for binding in bindings:
                params = match_route_binding(binding, pathname)
                if params is None:
                    continue
                matches.append((binding, params))
            if not matches:
                return None
            binding, route_params = sorted(matches, key=lambda item: route_sort_key(item[0]))[0]
            page_item = binding.item
            use_rev, state, page_snapshot = await self._load_snapshot_for_item(item=page_item, mode="preview")
            return await self._build_resolve_output(
                site_id=site_id,
                pathname=pathname,
                page_item=page_item,
                route_contract=binding.route_contract if isinstance(binding.route_contract, dict) else {},
                route_params=route_params,
                draft_rev=int(page_item.draft_version or 0),
                published_rev=int(page_item.published_version or 0) or None,
                use_rev=use_rev,
                state=state,
                page_snapshot=page_snapshot,
                mode="preview",
                strict_binding_errors=True,
            )

        release = await self._repo.get_active_release(site_id=site_id)
        if release is None:
            return None
        graph_nodes = await self._repo.list_active_release_route_nodes(site_id=site_id)
        matches: list[tuple[_RouteBindingCandidate, Any, dict[str, str]]] = []
        for graph_node in graph_nodes:
            candidate = _RouteBindingCandidate(
                path=graph_node.route_path,
                route_contract=graph_node.route_contract if isinstance(graph_node.route_contract, dict) else None,
                item=graph_node.item,
            )
            params = match_route_binding(candidate, pathname)
            if params is None:
                continue
            matches.append((candidate, graph_node, params))
        if not matches:
            return None
        binding_candidate, graph_node, route_params = sorted(matches, key=lambda item: route_sort_key(item[0]))[0]
        page_item = graph_node.item
        use_rev, state, page_snapshot = await self._load_snapshot_from_version(
            item=page_item,
            version=graph_node.version,
            state="published",
        )
        return await self._build_resolve_output(
            site_id=site_id,
            pathname=pathname,
            page_item=page_item,
            route_contract=(
                binding_candidate.route_contract if isinstance(binding_candidate.route_contract, dict) else {}
            ),
            route_params=route_params,
            draft_rev=int(page_item.draft_version or 0),
            published_rev=int(graph_node.version.version),
            use_rev=use_rev,
            state=state,
            page_snapshot=page_snapshot,
            mode="public",
            strict_binding_errors=True,
            release_id=release.id,
        )

    async def resolve_delivery_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        perspective: Literal["published", "preview"],
    ) -> SiteRouteResolveOut | None:
        if perspective == "preview":
            page_item = await self._repo.get_content_entry_by_id(site_id=site_id, entry_id=page_id)
            if page_item is None:
                return None
            route_binding = await self._repo.get_content_route_binding_by_item_id(site_id=site_id, item_id=page_id)
            if route_binding is None:
                return None
            route_contract = (
                route_binding.route_contract if route_binding and isinstance(route_binding.route_contract, dict) else {}
            )
            pathname = route_binding.path
            use_rev, state, page_snapshot = await self._load_snapshot_for_item(item=page_item, mode="preview")
            if use_rev is None:
                return await self._build_resolve_output(
                    site_id=site_id,
                    pathname=pathname,
                    page_item=page_item,
                    route_contract=route_contract,
                    route_params={},
                    draft_rev=int(page_item.draft_version or 0),
                    published_rev=int(page_item.published_version or 0) or None,
                    use_rev=None,
                    state=None,
                    page_snapshot=None,
                    mode="preview",
                    strict_binding_errors=False,
                )
            return await self._build_resolve_output(
                site_id=site_id,
                pathname=pathname,
                page_item=page_item,
                route_contract=route_contract,
                route_params={},
                draft_rev=int(page_item.draft_version or 0),
                published_rev=int(page_item.published_version or 0) or None,
                use_rev=use_rev,
                state=state,
                page_snapshot=page_snapshot,
                mode="preview",
                strict_binding_errors=False,
            )

        release = await self._repo.get_active_release(site_id=site_id)
        if release is None:
            return None
        graph_node = await self._repo.get_active_release_node_by_item_id(site_id=site_id, item_id=page_id)
        if graph_node is None:
            return None
        page_item = graph_node.item
        use_rev, state, page_snapshot = await self._load_snapshot_from_version(
            item=page_item,
            version=graph_node.version,
            state="published",
        )
        route_contract = graph_node.route_contract if isinstance(graph_node.route_contract, dict) else {}
        return await self._build_resolve_output(
            site_id=site_id,
            pathname=graph_node.route_path,
            page_item=page_item,
            route_contract=route_contract,
            route_params={},
            draft_rev=int(page_item.draft_version or 0),
            published_rev=int(graph_node.version.version),
            use_rev=use_rev,
            state=state,
            page_snapshot=page_snapshot,
            mode="public",
            strict_binding_errors=False,
            release_id=release.id,
        )
