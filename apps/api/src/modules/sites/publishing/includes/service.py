from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from apps.api.src.modules.sites.design_document.schema import PageBlueprint
from apps.api.src.modules.sites.namespaces.service import get_max_content_ref_depth
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import ContentRefIncludeErrorV1, ContentRefIncludeV1, ResolveWarningV1


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

        entry = await self._repo.get_content_entry_by_id(site_id=site_id, entry_id=entry_id)
        if entry is None:
            return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Entry not found")

        if state == "published":
            revision_number = entry.published_revision
            if revision_number is None:
                return (
                    None,
                    None,
                    None,
                    ContentRefIncludeErrorV1(code="NOT_FOUND", message="Published revision not found"),
                )
        else:
            revision_number = int(entry.draft_revision or 0)
            if revision_number < 1:
                return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Draft revision not found")

        rev = await self._repo.get_content_revision_by_number(entry_id=entry.id, revision=int(revision_number))
        if rev is None:
            return None, None, None, ContentRefIncludeErrorV1(code="NOT_FOUND", message="Revision not found")

        snapshot = rev.snapshot if isinstance(rev.snapshot, dict) else {}
        field_values = snapshot.get("field_values")
        data = field_values if isinstance(field_values, dict) else None
        meta_raw = snapshot.get("meta")
        meta = meta_raw if isinstance(meta_raw, dict) else None

        raw_doc = snapshot.get("page_blueprint")
        if raw_doc is None:
            raw_doc = snapshot.get("design_document")
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

            include_key = f"{entry_id_str}:{resolved}"

            if entry_id_str in stack:
                collector[include_key] = ContentRefIncludeV1(
                    entryId=entry_id,
                    resolvedState=resolved,
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
                state=resolved,
            )

            if load_error is not None:
                collector[include_key] = ContentRefIncludeV1(
                    entryId=entry_id,
                    resolvedState=resolved,
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
                resolvedState=resolved,
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
