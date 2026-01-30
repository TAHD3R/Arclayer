from __future__ import annotations

"""User-related constants."""

# Admin user listing ordering allow-list.
ADMIN_USERS_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset(
    {"created_at", "updated_at", "username", "email", "status", "last_login_at"}
)

