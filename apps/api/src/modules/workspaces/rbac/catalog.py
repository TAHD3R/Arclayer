from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict

from src.models.system.rbac import SystemPermission, SystemRole
from src.modules.permissions import PermissionConditionSet
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.constants.service import CORE_PERMISSION_OWNER
from src.modules.workspaces.permissions import get_permission_action_registry

PermissionLifecycle = Literal["active", "deprecated", "retained_unavailable"]


class _FrozenCatalogModel(BaseModel):
    model_config = ConfigDict(frozen=True)


class PermissionCatalogGroup(_FrozenCatalogModel):
    code: str
    name_i18n: str
    order: int


class PermissionCatalogMetadata(_FrozenCatalogModel):
    group_code: str
    sort_order: int
    lifecycle: PermissionLifecycle
    replacement_code: str | None
    action_codes: tuple[str, ...]
    condition_templates: tuple[str, ...]


class RolePermissionBatchUpdate(_FrozenCatalogModel):
    role_code: str
    role_revision: str
    permission_grants: tuple[tuple[str, tuple[PermissionConditionSet, ...]], ...]


PERMISSION_CATALOG_GROUPS: tuple[PermissionCatalogGroup, ...] = (
    PermissionCatalogGroup(code="content", name_i18n="rbac:RBAC_PERMISSION_GROUP_CONTENT", order=100),
    PermissionCatalogGroup(code="access", name_i18n="rbac:RBAC_PERMISSION_GROUP_ACCESS", order=200),
    PermissionCatalogGroup(code="operations", name_i18n="rbac:RBAC_PERMISSION_GROUP_OPERATIONS", order=300),
    PermissionCatalogGroup(
        code="administration",
        name_i18n="rbac:RBAC_PERMISSION_GROUP_ADMINISTRATION",
        order=400,
    ),
    PermissionCatalogGroup(code="extensions", name_i18n="rbac:RBAC_PERMISSION_GROUP_EXTENSIONS", order=500),
    PermissionCatalogGroup(code="other", name_i18n="rbac:RBAC_PERMISSION_GROUP_OTHER", order=900),
)

_GROUP_ORDER = {group.code: group.order for group in PERMISSION_CATALOG_GROUPS}
_CORE_PERMISSION_CODES = frozenset(template.code for template in CORE_PERMISSION_TEMPLATES)


def role_revision(role: SystemRole) -> str:
    source = f"{role.id}:{role.updated_at.isoformat()}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:24]


def resolve_permission_group(code: str, *, owner_key: str | None) -> str:
    owner = str(owner_key or CORE_PERMISSION_OWNER).strip()
    if owner != CORE_PERMISSION_OWNER:
        return "extensions"
    if code.startswith(("rbac:", "team:", "admin:")):
        return "access"
    if code.startswith(("system:content:", "system:site:", "system:assets:", "system:domains:")):
        return "content"
    if code.startswith(("system:automation:", "system:jobs:", "system:notifications:")):
        return "operations"
    if code.startswith(("system:settings:", "system:keys:")):
        return "administration"
    return "other"


def build_permission_metadata(permissions: list[SystemPermission]) -> dict[str, PermissionCatalogMetadata]:
    action_registry = get_permission_action_registry()
    action_codes_by_permission: dict[str, list[str]] = {}
    condition_templates_by_permission: dict[str, set[str]] = {}
    for action_code, definition in action_registry.items():
        for permission_code in definition.permission_codes:
            action_codes_by_permission.setdefault(permission_code, []).append(action_code)
            condition_templates_by_permission.setdefault(permission_code, set()).update(definition.condition_templates)

    grouped_codes: dict[str, list[str]] = {}
    for permission in permissions:
        group_code = resolve_permission_group(permission.code, owner_key=permission.owner_key)
        grouped_codes.setdefault(group_code, []).append(permission.code)

    order_by_code: dict[str, int] = {}
    for group_code, codes in grouped_codes.items():
        group_order = _GROUP_ORDER.get(group_code, _GROUP_ORDER["other"])
        for index, code in enumerate(sorted(codes), start=1):
            order_by_code[code] = group_order * 1000 + index

    metadata: dict[str, PermissionCatalogMetadata] = {}
    for permission in permissions:
        owner_key = str(permission.owner_key or CORE_PERMISSION_OWNER)
        lifecycle: PermissionLifecycle = (
            "active"
            if permission.code in _CORE_PERMISSION_CODES
            else "retained_unavailable"
            if owner_key != CORE_PERMISSION_OWNER
            else "deprecated"
        )
        metadata[permission.code] = PermissionCatalogMetadata(
            group_code=resolve_permission_group(permission.code, owner_key=owner_key),
            sort_order=order_by_code[permission.code],
            lifecycle=lifecycle,
            replacement_code=None,
            action_codes=tuple(sorted(action_codes_by_permission.get(permission.code, []))),
            condition_templates=tuple(sorted(condition_templates_by_permission.get(permission.code, set()))),
        )
    return metadata


def build_catalog_revision(permissions: list[SystemPermission]) -> str:
    metadata = build_permission_metadata(permissions)
    descriptor = [
        {
            "code": permission.code,
            "scope": permission.scope.value,
            "name": permission.name,
            "description": permission.description,
            "name_i18n": permission.name_i18n,
            "description_i18n": permission.description_i18n,
            "owner_key": permission.owner_key or CORE_PERMISSION_OWNER,
            "group_code": metadata[permission.code].group_code,
            "sort_order": metadata[permission.code].sort_order,
            "lifecycle": metadata[permission.code].lifecycle,
            "replacement_code": metadata[permission.code].replacement_code,
            "action_codes": metadata[permission.code].action_codes,
            "condition_templates": metadata[permission.code].condition_templates,
        }
        for permission in sorted(permissions, key=lambda item: item.code)
    ]
    canonical = json.dumps(descriptor, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_catalog_etag(catalog_revision: str, roles: list[SystemRole]) -> str:
    role_revisions = [(role.code, role_revision(role)) for role in sorted(roles, key=lambda item: item.code)]
    source = json.dumps(
        {"catalog_revision": catalog_revision, "role_revisions": role_revisions},
        separators=(",", ":"),
        sort_keys=True,
    )
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
    return f'"{digest}"'


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    return any(candidate.strip() in {etag, "*"} for candidate in if_none_match.split(","))
