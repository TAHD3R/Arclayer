from __future__ import annotations

from apps.api.core.admin_ui import AdminUIResourceSpec, AdminUIResourceType
from org.constants import PLUGIN_ID


class OrgAdminUIResourceProvider:
    def get_resources(self) -> list[AdminUIResourceSpec]:
        return [
            AdminUIResourceSpec(
                id="org",
                type=AdminUIResourceType.MENU_GROUP,
                plugin_id=PLUGIN_ID,
                title="Organization",
                title_i18n="org:MENU_ORG",
                icon="org",
                sort=100,
            ),
            AdminUIResourceSpec(
                id="org.departments",
                type=AdminUIResourceType.MENU_ITEM,
                plugin_id=PLUGIN_ID,
                parent_id="org",
                title="Departments",
                title_i18n="org:MENU_DEPARTMENTS",
                icon="departments",
                path="/org/departments",
                sort=10,
                required_permissions_any=["admin:org:departments:read"],
            ),
            AdminUIResourceSpec(
                id="org.departments.create",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.departments",
                title="Create department",
                title_i18n="org:ACTION_DEPARTMENT_CREATE",
                required_permissions_any=["admin:org:departments:write"],
            ),
            AdminUIResourceSpec(
                id="org.departments.update",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.departments",
                title="Update department",
                title_i18n="org:ACTION_DEPARTMENT_UPDATE",
                required_permissions_any=["admin:org:departments:write"],
            ),
            AdminUIResourceSpec(
                id="org.departments.delete",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.departments",
                title="Delete department",
                title_i18n="org:ACTION_DEPARTMENT_DELETE",
                required_permissions_any=["admin:org:departments:write"],
            ),
            AdminUIResourceSpec(
                id="org.positions",
                type=AdminUIResourceType.MENU_ITEM,
                plugin_id=PLUGIN_ID,
                parent_id="org",
                title="Positions",
                title_i18n="org:MENU_POSITIONS",
                icon="positions",
                path="/org/positions",
                sort=20,
                required_permissions_any=["admin:org:positions:read"],
            ),
            AdminUIResourceSpec(
                id="org.positions.create",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.positions",
                title="Create position",
                title_i18n="org:ACTION_POSITION_CREATE",
                required_permissions_any=["admin:org:positions:write"],
            ),
            AdminUIResourceSpec(
                id="org.positions.update",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.positions",
                title="Update position",
                title_i18n="org:ACTION_POSITION_UPDATE",
                required_permissions_any=["admin:org:positions:write"],
            ),
            AdminUIResourceSpec(
                id="org.positions.delete",
                type=AdminUIResourceType.ACTION,
                plugin_id=PLUGIN_ID,
                parent_id="org.positions",
                title="Delete position",
                title_i18n="org:ACTION_POSITION_DELETE",
                required_permissions_any=["admin:org:positions:write"],
            ),
        ]
