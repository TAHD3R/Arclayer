from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.modules.system.admin.menus.seeds.service import AdminMenuSeedService
from apps.api.src.plugin.manifest import AdminMenuSeedItem

logger = get_logger(__name__)


def _core_seeds() -> list[AdminMenuSeedItem]:
    """
    Core admin navigation seeds.

    Notes:
    - Codes intentionally match admin frontend navigation keys.
    - Paths are workspace-relative (frontend prefixes `/w/{workspaceId}`).
    """

    return [
        # Dashboard
        AdminMenuSeedItem(
            code="dashboard",
            parent_code=None,
            title="Dashboard",
            title_i18n="nav:NAV_DASHBOARD",
            icon="Gauge",
            type="item",
            path="/",
            sort=10,
            permission_code=None,
        ),
        # Content
        AdminMenuSeedItem(
            code="content",
            title="Content",
            title_i18n="nav:NAV_CONTENT",
            icon="FileText",
            type="group",
            sort=20,
            permission_code=None,
        ),
        AdminMenuSeedItem(
            code="content.pages",
            parent_code="content",
            title="Pages",
            title_i18n="nav:NAV_CONTENT_PAGES",
            icon="File",
            type="item",
            path="/content/pages",
            sort=10,
            permission_code=None,
        ),
        AdminMenuSeedItem(
            code="content.library",
            parent_code="content",
            title="Content library",
            title_i18n="nav:NAV_CONTENT_LIBRARY",
            icon="LibraryBig",
            type="item",
            path="/content/library",
            sort=20,
            permission_code=None,
        ),
        # Assets
        AdminMenuSeedItem(
            code="assets",
            title="Assets",
            title_i18n="nav:NAV_ASSETS",
            icon="Images",
            type="item",
            path="/assets",
            sort=30,
            permission_code=None,
        ),
        # Appearance
        AdminMenuSeedItem(
            code="appearance",
            title="Appearance",
            title_i18n="nav:NAV_APPEARANCE",
            icon="Palette",
            type="group",
            sort=40,
            permission_code=None,
        ),
        AdminMenuSeedItem(
            code="appearance.themes",
            parent_code="appearance",
            title="Themes",
            title_i18n="nav:NAV_APPEARANCE_THEMES",
            icon="Paintbrush",
            type="item",
            path="/appearance/themes",
            sort=10,
            permission_code=None,
        ),
        AdminMenuSeedItem(
            code="appearance.navigation",
            parent_code="appearance",
            title="Navigation",
            title_i18n="nav:NAV_APPEARANCE_NAVIGATION",
            icon="Navigation2",
            type="item",
            path="/appearance/navigation",
            sort=20,
            permission_code=None,
        ),
        AdminMenuSeedItem(
            code="appearance.styles",
            parent_code="appearance",
            title="Global styles",
            title_i18n="nav:NAV_APPEARANCE_STYLES",
            icon="Palette",
            type="item",
            path="/appearance/styles",
            sort=30,
            permission_code=None,
        ),
        # Plugins
        AdminMenuSeedItem(
            code="plugins",
            title="Plugins",
            title_i18n="nav:NAV_PLUGINS",
            icon="Package",
            type="group",
            sort=50,
            permission_code="system:plugins:read",
        ),
        AdminMenuSeedItem(
            code="plugins.installed",
            parent_code="plugins",
            title="Installed",
            title_i18n="nav:NAV_PLUGINS_INSTALLED",
            icon="Package",
            type="item",
            path="/plugins/installed",
            sort=10,
            permission_code="system:plugins:read",
        ),
        # Team
        AdminMenuSeedItem(
            code="settings.team",
            title="Team",
            title_i18n="nav:NAV_SETTINGS_TEAM",
            icon="Users",
            type="group",
            sort=60,
            permission_code="team:members:read",
        ),
        AdminMenuSeedItem(
            code="settings.team.memberList",
            parent_code="settings.team",
            title="Members",
            title_i18n="nav:NAV_SETTINGS_TEAM_MEMBER_LIST",
            icon="Users",
            type="item",
            path="/team/members",
            sort=10,
            permission_code="team:members:read",
        ),
        AdminMenuSeedItem(
            code="settings.team.members",
            parent_code="settings.team",
            title="Member invitations",
            title_i18n="nav:NAV_SETTINGS_TEAM_MEMBERS",
            icon="UserPlus",
            type="item",
            path="/team/invitations",
            sort=20,
            permission_code="team:invitations:manage",
        ),
        AdminMenuSeedItem(
            code="settings.team.roles",
            parent_code="settings.team",
            title="Roles & permissions",
            title_i18n="nav:NAV_SETTINGS_TEAM_ROLES",
            icon="ShieldCheck",
            type="item",
            path="/team/roles",
            sort=30,
            permission_code="rbac:roles:read",
        ),
        # Settings
        AdminMenuSeedItem(
            code="settings",
            title="Settings",
            title_i18n="nav:NAV_SETTINGS",
            icon="Settings",
            type="group",
            sort=70,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.workspace",
            parent_code="settings",
            title="Workspace",
            title_i18n="nav:NAV_SETTINGS_WORKSPACE",
            icon="Navigation2",
            type="item",
            path="/settings/workspace",
            sort=10,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.general",
            parent_code="settings",
            title="General",
            title_i18n="nav:NAV_SETTINGS_GENERAL",
            icon="SlidersHorizontal",
            type="item",
            path="/settings/general",
            sort=20,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.seo",
            parent_code="settings",
            title="SEO",
            title_i18n="nav:NAV_SETTINGS_SEO",
            icon="Search",
            type="item",
            path="/settings/seo",
            sort=30,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.maintenance",
            parent_code="settings",
            title="Maintenance",
            title_i18n="nav:NAV_SETTINGS_MAINTENANCE",
            icon="Wrench",
            type="group",
            sort=40,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.maintenance.snapshots",
            parent_code="settings.maintenance",
            title="Backups & rollback",
            title_i18n="nav:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS",
            icon="HardDrive",
            type="item",
            path="/settings/maintenance/snapshots",
            sort=10,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.maintenance.activity",
            parent_code="settings.maintenance",
            title="Activity",
            title_i18n="nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
            icon="History",
            type="item",
            path="/settings/maintenance/activity",
            sort=20,
            permission_code="system:settings:read",
        ),
        AdminMenuSeedItem(
            code="settings.maintenance.status",
            parent_code="settings.maintenance",
            title="System status",
            title_i18n="nav:NAV_SETTINGS_MAINTENANCE_STATUS",
            icon="Activity",
            type="item",
            path="/settings/maintenance/status",
            sort=30,
            permission_code="system:settings:read",
        ),
    ]


async def ensure_core_admin_menus_ready(*, settings: Settings) -> None:
    """
    Ensure core admin menu items exist in DB.

    This is safe to call on every startup (idempotent).
    """

    service = AdminMenuSeedService(settings)
    await service.ensure_seeds(
        owner_plugin_id="core",
        seeds=_core_seeds(),
        # Core menu is treated as product-owned navigation. We keep it consistent across deployments
        # to ensure permission codes / i18n keys are up-to-date even for legacy databases.
        update_existing=True,
        restore_deleted=True,
    )
    logger.info("Core admin menu seeds ensured")
