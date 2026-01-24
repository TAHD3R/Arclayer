from __future__ import annotations

from apps.api.core.admin_ui import AdminUIResourceSpec, AdminUIResourceType
from rbac_org.constants import PLUGIN_ID


class RBACOrgAdminUIResourceProvider:
    def get_resources(self) -> list[AdminUIResourceSpec]:
        return [
            AdminUIResourceSpec(
                id="org.rbac_mapping",
                type=AdminUIResourceType.MENU_ITEM,
                plugin_id=PLUGIN_ID,
                parent_id="org",
                title="Org RBAC mapping",
                title_i18n="rbac_org:MENU_ORG_RBAC_MAPPING",
                icon="shield",
                path="/org/rbac-mapping",
                sort=90,
                required_permissions_any=[
                    "admin:rbac-org:positions:roles:read",
                    "admin:rbac-org:departments:roles:read",
                ],
            ),
            AdminUIResourceSpec(
                id="org.rbac_mapping.bind_position_role",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.rbac_mapping",
                title="Bind position role",
                title_i18n="rbac_org:ACTION_BIND_POSITION_ROLE",
                required_permissions_any=["admin:rbac-org:positions:roles:write"],
            ),
            AdminUIResourceSpec(
                id="org.rbac_mapping.bind_department_role",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.rbac_mapping",
                title="Bind department role",
                title_i18n="rbac_org:ACTION_BIND_DEPARTMENT_ROLE",
                required_permissions_any=["admin:rbac-org:departments:roles:write"],
            ),
        ]
