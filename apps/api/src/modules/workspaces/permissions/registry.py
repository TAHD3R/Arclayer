from __future__ import annotations

from collections.abc import Iterable, Sequence
from functools import lru_cache

from pydantic import BaseModel, ConfigDict

from src.models.system.rbac import PermissionScope
from src.modules.permissions import PermissionConditionTemplate
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.schema import PermissionTemplate


class PermissionActionDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
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
        module="content",
        name="Edit content items",
        description="Allow mutating content items via management APIs.",
        name_i18n="rbac:RBAC_ACTION_CONTENT_ITEMS_WRITE_NAME",
        description_i18n="rbac:RBAC_ACTION_CONTENT_ITEMS_WRITE_DESC",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="content:site-builder:write",
        module="content",
        name="Manage site builder",
        description="Allow configuring canvas and site builder workflows.",
        name_i18n="rbac:RBAC_ACTION_CONTENT_SITE_BUILDER_WRITE_NAME",
        description_i18n="rbac:RBAC_ACTION_CONTENT_SITE_BUILDER_WRITE_DESC",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="content:routing:read",
        module="content",
        name="Read content routes",
        description="Allow reading content routing and hierarchy contracts.",
        name_i18n="rbac:RBAC_ACTION_CONTENT_ROUTING_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_CONTENT_ROUTING_READ_DESC",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="content:routing:write",
        module="content",
        name="Manage content routes",
        description="Allow mutating route bindings and hierarchy contracts.",
        name_i18n="rbac:RBAC_ACTION_CONTENT_ROUTING_WRITE_NAME",
        description_i18n="rbac:RBAC_ACTION_CONTENT_ROUTING_WRITE_DESC",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="site:read",
        module="site",
        name="Read site settings",
        description="Allow reading project site runtime settings.",
        name_i18n="rbac:RBAC_ACTION_SITE_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_SITE_READ_DESC",
        permission_codes=("system:site:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="site:manage",
        module="site",
        name="Manage site settings",
        description="Allow managing project site runtime settings.",
        name_i18n="rbac:RBAC_ACTION_SITE_MANAGE_NAME",
        description_i18n="rbac:RBAC_ACTION_SITE_MANAGE_DESC",
        permission_codes=("system:site:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:read",
        module="release",
        name="Read releases",
        description="Allow reading workspace release history and status.",
        name_i18n="rbac:RBAC_ACTION_RELEASE_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_RELEASE_READ_DESC",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:publish",
        module="release",
        name="Publish releases",
        description="Allow publishing a new workspace release.",
        name_i18n="rbac:RBAC_ACTION_RELEASE_PUBLISH_NAME",
        description_i18n="rbac:RBAC_ACTION_RELEASE_PUBLISH_DESC",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="release:rollback",
        module="release",
        name="Roll back releases",
        description="Allow rolling back a workspace to a historical release.",
        name_i18n="rbac:RBAC_ACTION_RELEASE_ROLLBACK_NAME",
        description_i18n="rbac:RBAC_ACTION_RELEASE_ROLLBACK_DESC",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("own_content", "current_workspace", "content_type", "locale", "workflow_stage"),
    ),
    PermissionActionDefinition(
        code="automation:read",
        module="automation",
        name="Read automation",
        description="Allow reading automation flows, runs, and diagnostics.",
        name_i18n="rbac:RBAC_ACTION_AUTOMATION_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_AUTOMATION_READ_DESC",
        permission_codes=("system:automation:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="automation:manage",
        module="automation",
        name="Manage automation",
        description="Allow managing automation flows and operations.",
        name_i18n="rbac:RBAC_ACTION_AUTOMATION_MANAGE_NAME",
        description_i18n="rbac:RBAC_ACTION_AUTOMATION_MANAGE_DESC",
        permission_codes=("system:automation:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:read",
        module="delivery",
        name="Read published content",
        description="Allow published delivery reads.",
        name_i18n="rbac:RBAC_ACTION_DELIVERY_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_DELIVERY_READ_DESC",
        subject_kinds=("delivery_api_key", "public"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:graphql:read",
        module="delivery",
        name="Read GraphQL delivery",
        description="Allow GraphQL delivery reads for authenticated delivery keys.",
        name_i18n="rbac:RBAC_ACTION_DELIVERY_GRAPHQL_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_DELIVERY_GRAPHQL_READ_DESC",
        subject_kinds=("delivery_api_key",),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:preview",
        module="delivery",
        name="Preview unpublished content",
        description="Allow preview delivery reads.",
        name_i18n="rbac:RBAC_ACTION_DELIVERY_PREVIEW_NAME",
        description_i18n="rbac:RBAC_ACTION_DELIVERY_PREVIEW_DESC",
        subject_kinds=("delivery_api_key", "workspace_member"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:models:read",
        module="content",
        name="Read content models",
        description="Allow reading content models via management APIs.",
        name_i18n="rbac:RBAC_ACTION_CONTENT_MODELS_READ_NAME",
        description_i18n="rbac:RBAC_ACTION_CONTENT_MODELS_READ_DESC",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
        condition_templates=("current_workspace", "content_type", "locale"),
    ),
    PermissionActionDefinition(
        code="content:models:write",
        module="content",
        name="Manage content models",
        description="Allow mutating content models via management APIs.",
        name_i18n="rbac:RBAC_ACTION_CONTENT_MODELS_WRITE_NAME",
        description_i18n="rbac:RBAC_ACTION_CONTENT_MODELS_WRITE_DESC",
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
