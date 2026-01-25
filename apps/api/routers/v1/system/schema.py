from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field, SecretStr

from apps.api.common.schemas import BaseSchema


class SetupAdmin(BaseSchema):
    username: str = Field(..., description="Initial admin username.")
    password: SecretStr = Field(..., description="Initial admin password.")
    email: str | None = Field(default=None, description="Initial admin email.")
    display_name: str | None = Field(default=None, description="Initial admin display name.")


class SystemSetupRequest(BaseSchema):
    admin: SetupAdmin = Field(..., description="Admin user to be created.")
    master_key: SecretStr | None = Field(
        default=None,
        description="Optional master key (base64url, 32 bytes) used to encrypt secrets.",
    )
    core_patch: dict[str, Any] = Field(
        default_factory=dict,
        description="Initial core settings merge patch (e.g. site/mail/seo).",
    )


class SystemSetupResult(BaseSchema):
    initialized_at: datetime = Field(..., description="Initialization time.")
    master_key_fingerprint: str = Field(..., description="SHA-256 fingerprint of the master key.")
    admin_user_id: str = Field(..., description="Created admin user id.")
    admin_username: str = Field(..., description="Created admin username.")
    rbac_bootstrapped: bool = Field(..., description="Whether RBAC admin bootstrap succeeded.")
