from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasParentId
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger
from apps.api.src.modules.system.admin.menus.models.service import AdminMenuItem
from apps.api.src.modules.workspaces.context import get_current_workspace_id

logger = get_logger(__name__)

_FATAL_ADMIN_MENU_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


@dataclass(frozen=True, slots=True)
class MenuAccessContext:
    permission_codes: frozenset[str]
    is_superuser: bool
    enabled_plugin_ids: frozenset[str]
    core_codes: frozenset[str]


def raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ADMIN_MENU_ERRORS):
        raise exc


def tr(key: str, default: str) -> str:
    return t("admin_menu", key, default=default)


def require_workspace_id() -> UUID:
    workspace_id = get_current_workspace_id()
    if workspace_id is not None:
        return workspace_id

    raise ServiceUnavailable(
        message=t("errors", "WORKSPACE_CONTEXT_REQUIRED", default="需要工作区上下文"),
        error="WORKSPACE_CONTEXT_REQUIRED",
    )


def get_parent_id(item: AdminMenuItem) -> UUID | None:
    raw = cast(HasParentId, item).parent_id
    return UUID(str(raw)) if raw is not None else None


def collect_roots(
    *, children: dict[UUID | None, list[AdminMenuItem]], by_id: dict[UUID, AdminMenuItem]
) -> list[AdminMenuItem]:
    roots: list[AdminMenuItem] = []
    roots.extend(children.get(None, []))
    for parent_id, items in children.items():
        if parent_id is None:
            continue
        if parent_id in by_id:
            continue
        roots.extend(items)

    seen: set[UUID] = set()
    deduped: list[AdminMenuItem] = []
    for item in roots:
        if item.id in seen:
            continue
        seen.add(item.id)
        deduped.append(item)
    return deduped


def localize_menu_title(*, title: str, title_i18n: str | None) -> str:
    default = (title or "").strip() or title or ""
    raw = (title_i18n or "").strip()
    if not raw:
        return default

    if ":" in raw:
        ns, key = raw.split(":", 1)
        ns = ns.strip()
        key = key.strip()
        if ns and key:
            return t(ns, key, default=default)

    return t("admin_menu", raw, default=default)


@lru_cache(maxsize=1)
def core_menu_codes_best_effort() -> set[str]:
    """
    Best-effort: derive core menu codes from bootstrap seeds.

    Why this exists:
    - Legacy databases can contain polluted `meta.plugin_id` for core menu codes.
    - We must not hide core navigation just because the owner marker is wrong.
    """

    try:
        from apps.api.src.modules.system.admin.menus.bootstrap.service import _core_seeds

        return {str(s.code).strip() for s in _core_seeds() if getattr(s, "code", None)}
    except BaseException as exc:
        raise_if_fatal(exc)
        logger.warning(
            "Admin core menu seed lookup failed",
            action="resolve_core_menu_codes",
            error=str(exc),
        )
        return set()
