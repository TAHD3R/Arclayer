from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from src.models.content._enums import ContentPresentationKind
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.seo_profile import SEOProfileRecord


@dataclass(frozen=True, slots=True)
class CanonicalContentSnapshot:
    fields: dict[str, Any]
    raw_page_blueprint: dict[str, Any] | None
    raw_slot_mapping: dict[str, Any] | None
    meta: dict[str, Any] | None
    meta_title: str | None
    meta_description: str | None


def _copy_dict(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return dict(cast(dict[str, Any], value))


def _presentation_map(
    presentations: list[PresentationDocumentRecord],
) -> dict[str, dict[str, Any] | None]:
    return {str(presentation.kind): _copy_dict(presentation.payload) for presentation in presentations}


def _seo_meta(seo_profile: SEOProfileRecord | None) -> dict[str, Any] | None:
    if seo_profile is None:
        return None
    payload = _copy_dict(seo_profile.payload)
    if payload is not None:
        return {"seo": payload}
    if seo_profile.meta_title is None and seo_profile.meta_description is None:
        return None
    return {
        "seo": {
            "metaTitle": seo_profile.meta_title,
            "metaDescription": seo_profile.meta_description,
        }
    }


def build_canonical_content_snapshot(
    *,
    item: ContentItemRecord,
    version: ContentVersionRecord,
    presentations: list[PresentationDocumentRecord],
    seo_profile: SEOProfileRecord | None,
) -> CanonicalContentSnapshot:
    presentation_map = _presentation_map(presentations)
    fields = _copy_dict(version.fields_snapshot) or {}
    form_data = presentation_map.get(ContentPresentationKind.FORM_DATA.value)
    if form_data is not None:
        fields = form_data

    title = item.title.strip() if isinstance(item.title, str) and item.title.strip() else None
    if title is not None and "title" not in fields:
        fields = {**fields, "title": title}

    meta = _seo_meta(seo_profile)
    meta_title = seo_profile.meta_title if seo_profile is not None else None
    meta_description = seo_profile.meta_description if seo_profile is not None else None
    if meta_description is not None and "description" not in fields:
        fields = {**fields, "description": meta_description}

    return CanonicalContentSnapshot(
        fields=fields,
        raw_page_blueprint=presentation_map.get(ContentPresentationKind.VISUAL_BLUEPRINT.value),
        raw_slot_mapping=presentation_map.get(ContentPresentationKind.SLOT_MAPPING.value),
        meta=meta,
        meta_title=meta_title or title,
        meta_description=meta_description,
    )
