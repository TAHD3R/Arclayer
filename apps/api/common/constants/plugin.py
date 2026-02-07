from __future__ import annotations

"""Plugin-related constants (events, storage keys, extension points)."""

# Plugin categories (manifest-level).
#
# Notes:
# - Codes must be stable because they are used in manifests and stored in plugin packages.
# - Admin UI maps codes to localized labels via i18n.
PLUGIN_CATEGORY_CODES: frozenset[str] = frozenset(
    {
        "content_creation",
        "media_management",
        "seo_marketing",
        "system_security",
        "performance_optimization",
        "user_interaction",
        "data_integration",
        "data_analytics",
    }
)

# Core event names (string constants). Keep names stable and version payloads as needed.
SYSTEM_SETUP_COMPLETED = "system.setup.completed"
PLUGIN_INSTALLED = "plugin.installed"
PLUGIN_ENABLED = "plugin.enabled"
PLUGIN_DISABLED = "plugin.disabled"
SETTINGS_UPDATED = "settings.updated"

ADMIN_MENU_PROVIDER_EXTENSION_POINT = "admin-menu-provider"

MIGRATION_LOCK_KEY = "plugin:migrate:lock"

RESTART_EPOCH_KEY = "plugin:restart:epoch"
RESTART_INFO_KEY = "plugin:restart:info"

# RBAC is now a core capability, so there are no protected plugins by default.
PROTECTED_PLUGINS: frozenset[str] = frozenset()
