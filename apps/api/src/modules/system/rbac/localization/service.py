from __future__ import annotations

from apps.api.src.core.i18n import t
from apps.api.src.models.system.rbac import Permission, Role


def _tr(key: str, default: str) -> str:
    return t("rbac", key, default=default)


def _parse_i18n_ref(value: str | None) -> tuple[str, str] | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw or ":" not in raw:
        return None
    ns, key = raw.split(":", 1)
    ns = ns.strip()
    key = key.strip()
    if not ns or not key:
        return None
    return ns, key


def _localize_i18n_ref(value: str | None, *, default: str) -> str:
    ref = _parse_i18n_ref(value)
    if ref is None:
        return default
    ns, key = ref
    return t(ns, key, default=default)


class RBACLocalizationMixin:
    def localize_role(self, role: Role, *, locale: str) -> dict[str, object]:
        _ = locale  # Reserved for future locale-specific behavior.
        if role.is_system:
            name = _localize_i18n_ref(role.name_i18n, default=role.name)
            desc = _localize_i18n_ref(role.description_i18n, default=role.description or "")
        else:
            name = role.name
            desc = role.description or ""

        return {
            "id": role.id,
            "code": role.code,
            "name": name,
            "description": desc or None,
            "is_default": bool(role.is_default),
            "is_superuser": bool(role.is_superuser),
            "is_system": bool(role.is_system),
        }

    def localize_permission(self, perm: Permission) -> dict[str, object]:
        name = _localize_i18n_ref(perm.name_i18n, default=perm.name)
        desc = _localize_i18n_ref(perm.description_i18n, default=perm.description or "")
        return {
            "id": perm.id,
            "code": perm.code,
            "scope": perm.scope.value,
            "name": name,
            "description": desc or None,
            "plugin_id": perm.plugin_id,
        }
