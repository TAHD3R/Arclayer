"""
Extension point contracts for the plugin system.

We keep extension-point definitions (Protocols + registry registration + getters)
under the plugin subsystem instead of `core/` to avoid turning `core` into a grab bag.

Import side effects:
- Each module registers its extension point at import time.
"""

from __future__ import annotations


def init_extension_points() -> None:
    """
    Ensure all built-in extension points are registered.

    We intentionally keep the imports inside the function to:
    - avoid import-time cycles during tooling / type-checking
    - make registration explicit in the app bootstrap
    """

    # Admin-domain extension points (providers are implemented by plugins).
    # Note: RBAC/users/org are now core capabilities, so their providers are no longer plugin-based.
    from . import admin_menu
