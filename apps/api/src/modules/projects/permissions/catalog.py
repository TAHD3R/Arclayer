from __future__ import annotations

from collections.abc import Sequence

from src.models.system.rbac import PermissionScope
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.schema import PermissionTemplate
from src.modules.workspaces.permissions.registry import PermissionActionDefinition


def _permission_action_from_template(
    template: PermissionTemplate,
    *,
    subject_kinds: Sequence[str] = ("workspace_member",),
) -> PermissionActionDefinition:
    return PermissionActionDefinition(
        code=template.code,
        name=template.name,
        description=template.description,
        permission_codes=(template.code,),
        subject_kinds=tuple(subject_kinds),
        scope=PermissionScope(str(template.scope)).value,
        name_i18n=template.name_i18n,
        description_i18n=template.description_i18n,
        default_role_codes=tuple(template.default_roles),
    )


PROJECT_ACTION_DEFINITIONS: tuple[PermissionActionDefinition, ...] = (
    PermissionActionDefinition(
        code="content:items:write",
        description="Allow mutating content items via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:site-builder:write",
        description="Allow configuring canvas and site builder workflows.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:routing:read",
        description="Allow reading content routing and hierarchy contracts.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:routing:write",
        description="Allow mutating route bindings and hierarchy contracts.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
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
    ),
    PermissionActionDefinition(
        code="release:rollback",
        description="Allow rolling back a workspace to a historical release.",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
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
    ),
    PermissionActionDefinition(
        code="content:models:write",
        description="Allow mutating content models via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
)


def build_project_permission_action_catalog() -> dict[str, PermissionActionDefinition]:
    registry: dict[str, PermissionActionDefinition] = {
        template.code: _permission_action_from_template(template)
        for template in CORE_PERMISSION_TEMPLATES
        if PermissionScope(str(template.scope)) == PermissionScope.WORKSPACE
    }
    for definition in PROJECT_ACTION_DEFINITIONS:
        registry[definition.code] = definition
    return registry
