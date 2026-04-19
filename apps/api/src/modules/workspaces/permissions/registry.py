from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache

from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES


@dataclass(frozen=True, slots=True)
class PermissionActionDefinition:
    action: str
    permission_codes: tuple[str, ...] = ()
    subject_kinds: tuple[str, ...] = ()
    description: str | None = None


def _build_core_registry() -> dict[str, PermissionActionDefinition]:
    registry: dict[str, PermissionActionDefinition] = {}

    for template in CORE_PERMISSION_TEMPLATES:
        registry[template.code] = PermissionActionDefinition(
            action=template.code,
            permission_codes=(template.code,),
            subject_kinds=("workspace_member",),
            description=template.description,
        )

    registry.update({
        "content:items:write": PermissionActionDefinition(
            action="content:items:write",
            permission_codes=("system:content:manage",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow mutating content items via management APIs.",
        ),
        "content:site-builder:write": PermissionActionDefinition(
            action="content:site-builder:write",
            permission_codes=("system:content:manage",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow configuring canvas and site builder workflows.",
        ),
        "content:routing:read": PermissionActionDefinition(
            action="content:routing:read",
            permission_codes=("system:content:read",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow reading content routing and hierarchy contracts.",
        ),
        "content:routing:write": PermissionActionDefinition(
            action="content:routing:write",
            permission_codes=("system:content:manage",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow mutating route bindings and hierarchy contracts.",
        ),
        "release:read": PermissionActionDefinition(
            action="release:read",
            permission_codes=("system:content:read",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow reading workspace release history and status.",
        ),
        "release:publish": PermissionActionDefinition(
            action="release:publish",
            permission_codes=("system:content:publish",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow publishing a new workspace release.",
        ),
        "release:rollback": PermissionActionDefinition(
            action="release:rollback",
            permission_codes=("system:content:publish",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow rolling back a workspace to a historical release.",
        ),
        "automation:read": PermissionActionDefinition(
            action="automation:read",
            permission_codes=("system:automation:read",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow reading automation flows, runs, and diagnostics.",
        ),
        "automation:manage": PermissionActionDefinition(
            action="automation:manage",
            permission_codes=("system:automation:manage",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow managing automation flows and operations.",
        ),
        "delivery:read": PermissionActionDefinition(
            action="delivery:read",
            subject_kinds=("delivery_api_key", "public"),
            description="Allow published delivery reads.",
        ),
        "delivery:graphql:read": PermissionActionDefinition(
            action="delivery:graphql:read",
            subject_kinds=("delivery_api_key",),
            description="Allow GraphQL delivery reads for authenticated delivery keys.",
        ),
        "delivery:preview": PermissionActionDefinition(
            action="delivery:preview",
            subject_kinds=("delivery_api_key", "workspace_member"),
            description="Allow preview delivery reads.",
        ),
        "content:models:read": PermissionActionDefinition(
            action="content:models:read",
            permission_codes=("system:content:read",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow reading content models via management APIs.",
        ),
        "content:models:write": PermissionActionDefinition(
            action="content:models:write",
            permission_codes=("system:content:manage",),
            subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
            description="Allow mutating content models via management APIs.",
        ),
    })
    return registry


@lru_cache(maxsize=1)
def get_permission_action_registry() -> dict[str, PermissionActionDefinition]:
    return _build_core_registry()


def list_actions_for_permission_codes(permission_codes: Iterable[str]) -> tuple[str, ...]:
    permission_code_set = {str(code).strip() for code in permission_codes if str(code).strip()}
    matched = [
        action
        for action, definition in get_permission_action_registry().items()
        if permission_code_set.intersection(definition.permission_codes)
    ]
    return tuple(sorted(set(matched)))
