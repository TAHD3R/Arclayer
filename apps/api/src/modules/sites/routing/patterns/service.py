from __future__ import annotations

import re
from uuid import UUID

from apps.api.src.modules.sites.shared.schema import _CompiledRouteTemplate
from apps.api.src.modules.sites.shared.service import normalize_path

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
