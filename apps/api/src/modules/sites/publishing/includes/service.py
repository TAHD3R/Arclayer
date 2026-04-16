from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from src.common.services import BaseService
from src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from src.modules.sites.design.schema import PageBlueprint
from src.modules.sites.namespaces.service import get_max_content_ref_depth
from src.modules.sites.publishing.content_snapshot import build_canonical_content_snapshot
from src.modules.sites.repository import SitesRepository
from src.modules.sites.schema import ContentRefIncludeErrorV1, ContentRefIncludeV1, ResolveWarningV1


class PublishingIncludesService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._repo = repo

    async def load_page_blueprint_from_revision(self, rec) -> PageBlueprint | None:
        """Load PageBlueprint from a revision record."""
        if rec.design_document is None:
            return None
        try:
            return PageBlueprint.model_validate(rec.design_document)
        except Exception:
            return None

    @staticmethod
    def create_empty_page_blueprint() -> PageBlueprint:
        return PageBlueprint.model_validate({
            "version": 1,
            "rootId": "page",
            "nodesById": {
                "page": {
                    "id": "page",
                    "type": "page_root",
                    "name": "Page",
                    "children": [],
                    "layout": {"children": {"mode": "absolute"}},
                }
            },
        })

    @staticmethod
    def resolve_ref_state(
        ref_state: str,
        mode: Literal["public", "preview"],
    ) -> Literal["draft", "published"] | Literal["STATE_FORBIDDEN"]:
        if ref_state == "auto":
            return "draft" if mode == "preview" else "published"
        if ref_state == "draft" and mode == "public":
            return "STATE_FORBIDDEN"
        return cast(Literal["draft", "published"], ref_state)

    async def load_content_ref_entry(
        self,
        *,
        site_id: UUID,
        entry_id_public: str,
        state: Literal["draft", "published"],
    ) -> tuple[
        PageBlueprint | None,
        dict | None,
        dict | None,
        ContentRefIncludeErrorV1 | None,
    ]:
        try:
            entry_id = decode_public_id(entry_id_public)
        except PublicIdDecodeError:
            return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Invalid public id")

        item = await self._repo.get_content_entry_by_id(site_id=site_id, entry_id=entry_id)
        if item is None:
            return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Entry not found")

        if state == "published":
            revision_number = item.published_version
            if revision_number is None:
                return (
                    None,
                    None,
                    None,
                    ContentRefIncludeErrorV1(code="NOT_FOUND", message="Published revision not found"),
                )
        else:
            revision_number = int(item.draft_version or 0)
            if revision_number < 1:
                return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Draft revision not found")

        version = await self._repo.get_content_revision_by_number(entry_id=item.id, revision=int(revision_number))
        if version is None:
            return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Revision not found")

        presentations = await self._repo.list_content_presentations(version_id=version.id)
        seo_profile = await self._repo.get_content_seo_profile(version_id=version.id)
        snapshot = build_canonical_content_snapshot(
            item=item,
            version=version,
            presentations=presentations,
            seo_profile=seo_profile,
        )
        data = snapshot.fields or None
        meta = snapshot.meta
        raw_doc = snapshot.raw_page_blueprint
        if raw_doc is None:
            return None, data, meta, None

        try:
            doc = PageBlueprint.model_validate(raw_doc)
        except Exception as exc:
            self.logger.warning(
                "Invalid design_document in content ref snapshot",
                entry_id=entry_id_public,
                state=state,
                error=str(exc),
            )
            return (
                None,
                data,
                meta,
                ContentRefIncludeErrorV1(
                    code="INVALID_SCHEMA",
                    message=f"page_blueprint validation failed: {exc}",
                ),
            )

        return doc, data, meta, None

    async def resolve_content_refs(
        self,
        *,
        document: PageBlueprint,
        site_id: UUID,
        mode: Literal["public", "preview"],
        depth: int = 0,
        stack: frozenset[str] | None = None,
        collector: dict[str, ContentRefIncludeV1] | None = None,
        warnings: list[ResolveWarningV1] | None = None,
    ) -> tuple[dict[str, ContentRefIncludeV1], list[ResolveWarningV1]]:
        if collector is None:
            collector = {}
        if stack is None:
            stack = frozenset()
        if warnings is None:
            warnings = []

        max_depth = get_max_content_ref_depth()

        if depth >= max_depth:
            for node in document.nodes_by_id.values():
                if getattr(node, "type", None) != "content_ref":
                    continue

                entry_id_str = getattr(node, "ref_entry_id", "")
                try:
                    entry_id = decode_public_id(entry_id_str)
                except PublicIdDecodeError:
                    warnings.append(
                        ResolveWarningV1(
                            code="INVALID_SCHEMA",
                            message=f"invalid refEntryId {entry_id_str}",
                            refEntryId=entry_id_str,
                            refNodeId=getattr(node, "id", None),
                        )
                    )
                    continue
                ref_state_raw = getattr(node, "ref_state", "auto")
                resolved = self.resolve_ref_state(ref_state_raw, mode)
                if resolved == "STATE_FORBIDDEN":
                    resolved = "published"

                include_key = f"{entry_id_str}:{resolved}"
                if include_key not in collector:
                    collector[include_key] = ContentRefIncludeV1(
                        entryId=entry_id,
                        resolvedState=resolved,
                        pageBlueprint=None,
                        error=ContentRefIncludeErrorV1(code="DEPTH_LIMIT"),
                    )

                warnings.append(
                    ResolveWarningV1(
                        code="DEPTH_LIMIT",
                        message=f"max depth {max_depth} reached, skipping {entry_id_str}",
                        refEntryId=entry_id_str,
                        refNodeId=getattr(node, "id", None),
                    )
                )

            return collector, warnings

        for node in document.nodes_by_id.values():
            if getattr(node, "type", None) != "content_ref":
                continue

            entry_id_str = getattr(node, "ref_entry_id", "")
            try:
                entry_id = decode_public_id(entry_id_str)
            except PublicIdDecodeError:
                warnings.append(
                    ResolveWarningV1(
                        code="INVALID_SCHEMA",
                        message=f"invalid refEntryId {entry_id_str}",
                        refEntryId=entry_id_str,
                        refNodeId=getattr(node, "id", None),
                    )
                )
                continue
            ref_state_raw = getattr(node, "ref_state", "auto")
            resolved = self.resolve_ref_state(ref_state_raw, mode)

            if resolved == "STATE_FORBIDDEN":
                include_key = f"{entry_id_str}:published"
                collector[include_key] = ContentRefIncludeV1(
                    entryId=entry_id,
                    resolvedState="published",
                    pageBlueprint=None,
                    error=ContentRefIncludeErrorV1(code="STATE_FORBIDDEN"),
                )
                warnings.append(
                    ResolveWarningV1(
                        code="STATE_FORBIDDEN",
                        message=f"draft not allowed in public mode for {entry_id_str}",
                        refEntryId=entry_id_str,
                        refNodeId=getattr(node, "id", None),
                    )
                )
                continue

            preferred_state = resolved
            include_key = f"{entry_id_str}:{preferred_state}"

            if entry_id_str in stack:
                collector[include_key] = ContentRefIncludeV1(
                    entryId=entry_id,
                    resolvedState=preferred_state,
                    pageBlueprint=None,
                    error=ContentRefIncludeErrorV1(code="CYCLE_DETECTED"),
                )
                warnings.append(
                    ResolveWarningV1(
                        code="CYCLE_DETECTED",
                        message=f"circular ref detected for {entry_id_str}",
                        refEntryId=entry_id_str,
                        refNodeId=getattr(node, "id", None),
                    )
                )
                continue

            if include_key in collector:
                continue

            entry_doc, entry_data, entry_meta, load_error = await self.load_content_ref_entry(
                site_id=site_id,
                entry_id_public=entry_id_str,
                state=preferred_state,
            )
            resolved_state = preferred_state

            if load_error is not None and mode == "preview" and ref_state_raw == "auto" and preferred_state == "draft":
                fallback_doc, fallback_data, fallback_meta, fallback_error = await self.load_content_ref_entry(
                    site_id=site_id,
                    entry_id_public=entry_id_str,
                    state="published",
                )
                if fallback_error is None:
                    entry_doc = fallback_doc
                    entry_data = fallback_data
                    entry_meta = fallback_meta
                    load_error = None
                    resolved_state = "published"
                    include_key = f"{entry_id_str}:{resolved_state}"
                    warnings.append(
                        ResolveWarningV1(
                            code="DEPENDENCY_FALLBACK_PUBLISHED",
                            message=f"preview fallback to published dependency {entry_id_str}",
                            refEntryId=entry_id_str,
                            refNodeId=getattr(node, "id", None),
                        )
                    )

            if load_error is not None:
                collector[include_key] = ContentRefIncludeV1(
                    entryId=entry_id,
                    resolvedState=resolved_state,
                    pageBlueprint=None,
                    data=entry_data,
                    meta=entry_meta,
                    error=load_error,
                )
                warnings.append(
                    ResolveWarningV1(
                        code=load_error.code,
                        message=load_error.message or f"load failed for {entry_id_str}",
                        refEntryId=entry_id_str,
                        refNodeId=getattr(node, "id", None),
                    )
                )
                continue

            collector[include_key] = ContentRefIncludeV1(
                entryId=entry_id,
                resolvedState=resolved_state,
                pageBlueprint=entry_doc,
                data=entry_data,
                meta=entry_meta,
            )

            if entry_doc is not None:
                await self.resolve_content_refs(
                    document=entry_doc,
                    site_id=site_id,
                    mode=mode,
                    depth=depth + 1,
                    stack=stack | {entry_id_str},
                    collector=collector,
                    warnings=warnings,
                )

        return collector, warnings
