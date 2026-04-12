from __future__ import annotations

from apps.api.src.settings.core_schema import CORE_SETTINGS_SCHEMA
from apps.api.src.settings.schema import ConfigField, ConfigSchema, ConfigSection

SYS_NAMESPACE_STORAGE = "storage"
SYS_NAMESPACE_MAIL = "mail"
SYS_NAMESPACE_OAUTH = "oauth"
SYS_NAMESPACE_AUTH = "auth"

# Legacy sys namespace (kept for backward compatibility with early sys-config builds).
SYS_NAMESPACE_CORE_LEGACY = "core"


def _subset_schema(*, schema: ConfigSchema, section_ids: set[str]) -> ConfigSchema:
    """
    Build a schema subset by section ids.

    Notes:
    - Sys governance should only expose system-scoped sections (e.g. mail/storage).
    - Keep order stable as in the source schema.
    """

    wanted = {str(s).strip() for s in section_ids if str(s).strip()}
    sections = [
        s.model_copy(deep=True) for s in (schema.sections or []) if str(getattr(s, "id", "") or "").strip() in wanted
    ]
    return ConfigSchema(sections=list(sections))


SYS_STORAGE_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"storage"})
SYS_MAIL_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"mail"})

# Sys OAuth social login settings (core capability, non-plugin).
SYS_OAUTH_SETTINGS_SCHEMA = ConfigSchema(
    sections=[
        ConfigSection(
            id="oauth_google",
            title="Google",
            fields=[
                ConfigField(
                    key="enabled",
                    type="bool",
                    default=False,
                    label="Enable Google OAuth",
                    description="Expose Google login button in the admin console.",
                ),
                ConfigField(
                    key="client_id",
                    type="str",
                    default=None,
                    label="Client ID",
                ),
                ConfigField(
                    key="client_secret",
                    type="str",
                    default=None,
                    secret=True,
                    ui={"input": "password"},
                    label="Client secret",
                ),
            ],
        ),
        ConfigSection(
            id="oauth_github",
            title="GitHub",
            fields=[
                ConfigField(
                    key="enabled",
                    type="bool",
                    default=False,
                    label="Enable GitHub OAuth",
                    description="Expose GitHub login button in the admin console.",
                ),
                ConfigField(
                    key="client_id",
                    type="str",
                    default=None,
                    label="Client ID",
                ),
                ConfigField(
                    key="client_secret",
                    type="str",
                    default=None,
                    secret=True,
                    ui={"input": "password"},
                    label="Client secret",
                ),
            ],
        ),
        ConfigSection(
            id="oauth_provisioning",
            title="Provisioning",
            fields=[
                ConfigField(
                    key="auto_provision_enabled",
                    type="bool",
                    default=False,
                    label="Auto provision new users",
                    description="Create a local user when the OAuth account has a verified email.",
                ),
                ConfigField(
                    key="auto_accept_email_invites",
                    type="bool",
                    default=False,
                    label="Auto accept email invites",
                    description="Auto accept pending email invitations after OAuth sign-in.",
                ),
            ],
        ),
    ]
)

# Sys auth / registration policy (instance-level).
SYS_AUTH_SETTINGS_SCHEMA = ConfigSchema(
    sections=[
        ConfigSection(
            id="auth",
            title="Authentication",
            fields=[
                ConfigField(
                    key="public_register_enabled",
                    type="bool",
                    default=False,
                    label="Enable public registration",
                    description="Allow anyone to register via /api/v1/auth/register.",
                ),
                ConfigField(
                    key="public_register_require_email",
                    type="bool",
                    default=False,
                    label="Require email for public registration",
                    description="Force email to be present for public registration.",
                ),
                ConfigField(
                    key="public_register_email_domains_allowlist",
                    type="list",
                    default=[],
                    label="Allowed email domains (allowlist)",
                    description="Optional allowlist. When non-empty, only emails in these domains can register (e.g. example.com).",
                ),
            ],
        ),
    ]
)

# Legacy sys governance "core" namespace schema:
# keep it intentionally narrow to avoid accidental cross-tenant style changes.
SYS_CORE_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"mail", "storage"})
