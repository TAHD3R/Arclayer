from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache

from src.models.system.rbac import PermissionScope
from src.modules.permissions import PermissionConditionTemplate
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.schema import PermissionTemplate


@dataclass(frozen=True, slots=True)
class PermissionActionDefinition:
    code: str
    module: str | None = None
    name: str | None = None
    description: str | None = None
    permission_codes: tuple[str, ...] = ()
    subject_kinds: tuple[str, ...] = ()
    scope: str = PermissionScope.WORKSPACE.value
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_role_codes: tuple[str, ...] = ()
    condition_templates: tuple[str, ...] = ()


def _permission_action_from_template(
    template: PermissionTemplate,
    *,
    module: str | None = None,
    subject_kinds: Sequence[str] = ("workspace_member",),
) -> PermissionActionDefinition:
    return PermissionActionDefinition(
        code=template.code,
        module=module,
        name=template.name,
        description=template.description,
        permission_codes=(template.code,),
        subject_kinds=tuple(subject_kinds),
        scope=PermissionScope(str(template.scope)).value,
        name_i18n=template.name_i18n,
        description_i18n=template.description_i18n,
        default_role_codes=tuple(template.default_roles),
    )


_WORKSPACE_ACTION_DEFINITIONS: tuple[PermissionActionDefinition, ...] = (
    PermissionActionDefinition(
        code="content:items:write",
        description="Allow mutating content items via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="content:site-builder:write",
        description="Allow configuring canvas and site builder workflows.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="content:routing:read",
        description="Allow reading content routing and hierarchy contracts.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="content:routing:write",
        description="Allow mutating route bindings and hierarchy contracts.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="site:read",
        description="Allow reading project site runtime settings.",
        permission_codes=("system:site:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="site:manage",
        description="Allow managing project site runtime settings.",
        permission_codes=("system:site:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:read",
        description="Allow reading workspace release history and status.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:publish",
        description="Allow publishing a new workspace release.",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="release:rollback",
        description="Allow rolling back a workspace to a historical release.",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="automation:read",
        description="Allow reading automation flows, runs, and diagnostics.",
        permission_codes=("system:automation:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="automation:manage",
        description="Allow managing automation flows and operations.",
        permission_codes=("system:automation:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:read",
        description="Allow published delivery reads.",
        subject_kinds=("delivery_api_key", "public"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:graphql:read",
        description="Allow GraphQL delivery reads for authenticated delivery keys.",
        subject_kinds=("delivery_api_key",),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:preview",
        description="Allow preview delivery reads.",
        subject_kinds=("delivery_api_key", "workspace_member"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:models:read",
        description="Allow reading content models via management APIs.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("current_workspace", "content_type", "locale"),
    ),
    PermissionActionDefinition(
        code="content:models:write",
        description="Allow mutating content models via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("current_workspace", "content_type", "locale"),
    ),
)


def list_permission_condition_templates() -> tuple[PermissionConditionTemplate, ...]:
    from src.modules.permissions import build_permission_condition_templates

    return build_permission_condition_templates()


def _register_actions(
    registry: dict[str, PermissionActionDefinition],
    definitions: Iterable[PermissionActionDefinition],
) -> None:
    for definition in definitions:
        registry[definition.code] = definition


def build_workspace_permission_action_registry() -> dict[str, PermissionActionDefinition]:
    registry: dict[str, PermissionActionDefinition] = {}
    _register_actions(
        registry,
        (
            _permission_action_from_template(template)
            for template in CORE_PERMISSION_TEMPLATES
            if PermissionScope(str(template.scope)) == PermissionScope.WORKSPACE
        ),
    )
    _register_actions(registry, _WORKSPACE_ACTION_DEFINITIONS)
    return registry


@lru_cache(maxsize=1)
def get_permission_action_registry() -> dict[str, PermissionActionDefinition]:
    return build_workspace_permission_action_registry()


def list_actions_for_permission_codes(permission_codes: Iterable[str]) -> tuple[str, ...]:
    permission_code_set = {str(code).strip() for code in permission_codes if str(code).strip()}
    matched = [
        action
        for action, definition in get_permission_action_registry().items()
        if permission_code_set.intersection(definition.permission_codes)
    ]
    return tuple(sorted(set(matched)))
