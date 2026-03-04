from __future__ import annotations

"""Authentication and token-related constants."""

REFRESH_STATUS_ACTIVE = "active"
REFRESH_STATUS_ROTATED = "rotated"
REFRESH_STATUS_REVOKED = "revoked"

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"

PASSWORD_REGEX = r"^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d~!@#$%^&*()_\-+=\[\]{}|;:'\",.<>?/]{8,128}$"
RESET_TOKEN_REGEX = r"^[a-f0-9]{32}$"

REAUTH_MAX_AGE_SECONDS = 5 * 60

LOGIN_RATE_LIMIT = (5, 60)
REGISTER_RATE_LIMIT = (3, 60)
REFRESH_RATE_LIMIT = (10, 60)
FORGOT_PASSWORD_RATE_LIMIT = (3, 60)
RESET_PASSWORD_RATE_LIMIT = (3, 60)
