from __future__ import annotations

import math
import re
from collections.abc import Iterable

from apps.api.modules.sites.design_document_schema import DesignDocumentV1
from apps.api.modules.sites.schema import (
    ButtonBlock,
    ContainerBlock,
    DividerBlock,
    DocumentIR,
    HeadingBlock,
    ImageBlock,
    ParagraphBlock,
    PrefabBlock,
    QuoteBlock,
    SpacerBlock,
)

_SAFE_NODE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_-]*$")


def _to_safe_node_id(raw: str) -> str:
    """
    Convert a legacy id into a DesignDocument-safe node id.

    Safety constraints (must match frontend guard):
    - must start with [A-Za-z0-9]
    - may only contain [A-Za-z0-9:_-]
    """

    s = (raw or "").strip()
    s = re.sub(r"[^A-Za-z0-9:_-]", "_", s)
    if not s:
        s = "n"
    if not s[0].isalnum():
        s = f"n{s}"
    if not _SAFE_NODE_ID_RE.match(s):
        s = "n" + re.sub(r"[^A-Za-z0-9:_-]", "_", s)
        if not s[0].isalnum():
            s = "n" + s
    return s


def _unique_id(desired: str, used: set[str]) -> str:
    if desired not in used:
        used.add(desired)
        return desired
    i = 2
    while True:
        candidate = f"{desired}_{i}"
        if candidate not in used:
            used.add(candidate)
            return candidate
        i += 1


def _choose_localized(value: dict | None, locale: str, fallback_locale: str) -> str:
    if not value or not isinstance(value, dict):
        return ""
    v = value.get(locale)
    if isinstance(v, str) and v.strip():
        return v
    v2 = value.get(fallback_locale)
    if isinstance(v2, str) and v2.strip():
        return v2
    for x in value.values():
        if isinstance(x, str) and x.strip():
            return x
    return ""


def _estimate_text_height_px(*, content: str, max_width: float, font_size: float = 16) -> float:
    text = (content or "").strip()
    if max_width <= 1:
        return 0.0
    fs = max(1.0, float(font_size))
    line_height = max(1.0, round(fs * 1.2))
    if not text:
        return float(line_height)
    approx_glyph_w = fs * 0.6
    raw_width = len(text) * approx_glyph_w
    lines = max(1, int(math.ceil(raw_width / max(1.0, max_width))))
    return float(lines * line_height)


def create_empty_design_document_v1() -> DesignDocumentV1:
    return DesignDocumentV1.model_validate({
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


def migrate_document_ir_to_design_document_v1(
    *,
    doc: DocumentIR,
    locale: str = "en-US",
    fallback_locale: str = "zh-CN",
) -> DesignDocumentV1:
    """
    Best-effort migration from legacy DocumentIR to DesignDocumentV1.

    Scope:
    - Not a pixel-perfect conversion; it is meant to unblock a hard switch where
      existing stored revisions are DocumentIR.
    - Produces a deterministic, schema-valid DesignDocumentV1.
    """

    used: set[str] = set()
    root_id = _unique_id("page", used)

    base_width = 1440.0
    page_padding = 24.0
    content_width = max(1.0, base_width - page_padding * 2)

    nodes: dict[str, dict] = {}

    def add_node(payload: dict) -> str:
        raw_id = payload.get("id")
        desired = _to_safe_node_id(str(raw_id)) if raw_id is not None else "n"
        node_id = _unique_id(desired, used)
        payload["id"] = node_id
        nodes[node_id] = payload
        return node_id

    def migrate_blocks(blocks: Iterable[object], *, available_width: float) -> list[str]:
        out_ids: list[str] = []
        for block in blocks:
            out_ids.extend(migrate_block(block, available_width=available_width))
        return out_ids

    def migrate_block(block: object, *, available_width: float) -> list[str]:
        if isinstance(block, ContainerBlock):
            inner_width = max(1.0, available_width - 24.0)
            child_nodes = migrate_blocks(block.children or [], available_width=inner_width)

            height = 0.0
            for cid in child_nodes:
                child = nodes.get(cid)
                rect = (((child or {}).get("layout") or {}).get("self") or {}).get("rect")
                if isinstance(rect, dict):
                    h = rect.get("height")
                    if isinstance(h, (int, float)):
                        height += float(h)
            height = max(40.0, height + 24.0)

            node_id = add_node({
                "id": block.id,
                "type": "frame",
                "name": "Container",
                "children": child_nodes,
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": height},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {
                        "mode": "auto",
                        "direction": "column",
                        "gap": 12,
                        "padding": 12,
                        "alignItems": "stretch",
                        "justifyContent": "start",
                        "wrap": "nowrap",
                    },
                },
            })
            return [node_id]

        if isinstance(block, HeadingBlock):
            content = _choose_localized(block.props.text, locale, fallback_locale)
            tag = f"h{int(block.props.level)}" if block.props.level in (1, 2, 3) else "h3"
            node_id = add_node({
                "id": block.id,
                "type": "text",
                "name": "Heading",
                "text": block.props.text,
                "tag": tag,
                "align": block.props.align,
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 0},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"typography": {"fontSize": 24, "lineHeight": 32, "fontWeight": 600}},
            })
            nodes[node_id]["layout"]["self"]["rect"]["height"] = _estimate_text_height_px(
                content=content,
                max_width=available_width,
                font_size=24,
            )
            return [node_id]

        if isinstance(block, ParagraphBlock):
            content = _choose_localized(block.props.text, locale, fallback_locale)
            node_id = add_node({
                "id": block.id,
                "type": "text",
                "name": "Paragraph",
                "text": block.props.text,
                "tag": "p",
                "align": block.props.align,
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 0},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"typography": {"fontSize": 16, "lineHeight": 22}},
            })
            nodes[node_id]["layout"]["self"]["rect"]["height"] = _estimate_text_height_px(
                content=content,
                max_width=available_width,
                font_size=16,
            )
            return [node_id]

        if isinstance(block, QuoteBlock):
            content = _choose_localized(block.props.text, locale, fallback_locale)
            node_id = add_node({
                "id": block.id,
                "type": "text",
                "name": "Quote",
                "text": block.props.text,
                "tag": "p",
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 0},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"opacity": 0.9, "typography": {"fontSize": 16, "lineHeight": 22}},
            })
            nodes[node_id]["layout"]["self"]["rect"]["height"] = _estimate_text_height_px(
                content=content,
                max_width=available_width,
                font_size=16,
            )
            return [node_id]

        if isinstance(block, ImageBlock):
            src = _choose_localized(block.props.src, locale, fallback_locale)
            node_id = add_node({
                "id": block.id,
                "type": "image",
                "name": "Image",
                "src": src,
                "alt": block.props.alt,
                "objectFit": block.props.object_fit,
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 320},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"borderRadius": "12px"},
            })
            return [node_id]

        if isinstance(block, SpacerBlock):
            size = block.props.size
            h = float(size) if isinstance(size, (int, float)) else 24.0
            node_id = add_node({
                "id": block.id,
                "type": "rect",
                "name": "Spacer",
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": max(0.0, h)},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"opacity": 0.0},
            })
            return [node_id]

        if isinstance(block, DividerBlock):
            node_id = add_node({
                "id": block.id,
                "type": "rect",
                "name": "Divider",
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 1},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"backgroundColor": "rgba(0,0,0,0.12)"},
            })
            return [node_id]

        if isinstance(block, PrefabBlock):
            prefab_code = (block.props.prefab or "").strip()
            raw_props = block.props.props or block.props.data or {}
            props: dict[str, dict] = {}
            if isinstance(raw_props, dict):
                for k, v in raw_props.items():
                    if not isinstance(k, str) or not k.strip():
                        continue
                    props[k] = {"kind": "literal", "value": v}

            slot_child_ids = migrate_blocks(block.children or [], available_width=max(1.0, available_width - 24.0))
            node_id = add_node({
                "id": block.id,
                "type": "prefab_instance",
                "name": "Prefab",
                "prefabId": prefab_code or "unknown",
                "props": props,
                "slotChildren": {"default": slot_child_ids} if slot_child_ids else {},
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 260},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
            })
            return [node_id]

        if isinstance(block, ButtonBlock):
            content = _choose_localized(block.props.text, locale, fallback_locale)
            node_id = add_node({
                "id": block.id,
                "type": "text",
                "name": "Button",
                "text": block.props.text,
                "tag": "span",
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": available_width, "height": 0},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"typography": {"fontSize": 16, "lineHeight": 22, "fontWeight": 600}},
            })
            nodes[node_id]["layout"]["self"]["rect"]["height"] = _estimate_text_height_px(
                content=content,
                max_width=available_width,
                font_size=16,
            )
            return [node_id]

        node_id = add_node({
            "id": getattr(block, "id", "unknown"),
            "type": "rect",
            "name": "Unknown",
            "layout": {
                "self": {
                    "rect": {"x": 0, "y": 0, "width": available_width, "height": 0},
                    "alignX": "start",
                    "alignY": "start",
                },
                "children": {"mode": "absolute"},
            },
            "style": {"opacity": 0.0},
        })
        return [node_id]

    root_children = migrate_blocks(doc.blocks or [], available_width=content_width)

    root_node: dict = {
        "id": root_id,
        "type": "page_root",
        "name": "Page",
        "children": root_children,
        "layout": {
            "children": {
                "mode": "auto",
                "direction": "column",
                "gap": 16,
                "padding": page_padding,
                "alignItems": "stretch",
                "justifyContent": "start",
                "wrap": "nowrap",
            }
        },
    }

    meta = doc.meta
    if meta is not None:
        seo: dict = {}
        if meta.title is not None:
            seo["title"] = meta.title
        if meta.description is not None:
            seo["description"] = meta.description
        if seo:
            root_node["seo"] = seo

    nodes[root_id] = root_node

    return DesignDocumentV1.model_validate({"version": 1, "rootId": root_id, "nodesById": nodes})
