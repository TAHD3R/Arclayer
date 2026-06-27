from __future__ import annotations

from src.modules.auth.oauth.social.providers import OAUTH_PROVIDER_DEFINITIONS
from src.settings.schema import ConfigField, ConfigOption, ConfigSchema, ConfigSection

CORE_SETTINGS_NAMESPACE = "core"


def _build_oauth_provider_sections() -> list[ConfigSection]:
    return [
        ConfigSection(
            id=provider.section_id,
            title=provider.title,
            fields=[
                ConfigField(
                    key="enabled",
                    type="bool",
                    default=False,
                    label=f"Enable {provider.title}",
                ),
                ConfigField(
                    key="client_id",
                    type="str",
                    default=None,
                    label=f"{provider.title} client ID",
                ),
                ConfigField(
                    key="client_secret",
                    type="str",
                    default=None,
                    secret=True,
                    ui={"input": "password"},
                    label=f"{provider.title} client secret",
                ),
            ],
        )
        for provider in OAUTH_PROVIDER_DEFINITIONS
    ]


def build_core_settings_schema() -> ConfigSchema:
    # Keep the schema structure aligned with plugin config_schema so the admin UI can
    # render all settings with one renderer.
    return ConfigSchema(
        sections=[
            ConfigSection(
                id="site",
                title="Site",
                title_i18n="settings:SITE_TITLE",
                fields=[
                    ConfigField(
                        key="name",
                        type="str",
                        default="Arclayer",
                        label="Site name",
                        label_i18n="settings:SITE_NAME_LABEL",
                    ),
                    ConfigField(
                        key="subtitle",
                        type="str",
                        default=None,
                        label="Site subtitle",
                        label_i18n="settings:SITE_SUBTITLE_LABEL",
                    ),
                    ConfigField(
                        key="description",
                        type="str",
                        default=None,
                        label="Site description",
                        label_i18n="settings:SITE_DESCRIPTION_LABEL",
                        ui={"multiline": True},
                    ),
                    ConfigField(
                        key="name_i18n",
                        type="dict",
                        default=None,
                        label="Site name (i18n)",
                        label_i18n="settings:SITE_NAME_I18N_LABEL",
                    ),
                    ConfigField(
                        key="description_i18n",
                        type="dict",
                        default=None,
                        label="Site description (i18n)",
                        label_i18n="settings:SITE_DESCRIPTION_I18N_LABEL",
                    ),
                    ConfigField(
                        key="url",
                        type="str",
                        default="http://localhost:3000",
                        label="Site URL",
                        label_i18n="settings:SITE_URL_LABEL",
                    ),
                    ConfigField(
                        key="logo_url",
                        type="str",
                        default=None,
                        label="Logo URL",
                        label_i18n="settings:SITE_LOGO_LABEL",
                    ),
                    ConfigField(
                        key="logo_asset_id",
                        type="str",
                        default=None,
                        label="Logo asset id",
                        label_i18n="settings:SITE_LOGO_ASSET_ID_LABEL",
                    ),
                    ConfigField(
                        key="favicon_url",
                        type="str",
                        default=None,
                        label="Favicon URL",
                        label_i18n="settings:SITE_FAVICON_LABEL",
                    ),
                    ConfigField(
                        key="favicon_asset_id",
                        type="str",
                        default=None,
                        label="Favicon asset id",
                        label_i18n="settings:SITE_FAVICON_ASSET_ID_LABEL",
                    ),
                    ConfigField(
                        key="avatar_placeholder_url",
                        type="str",
                        default=None,
                        label="Avatar placeholder URL",
                        label_i18n="settings:SITE_AVATAR_PLACEHOLDER_LABEL",
                    ),
                    ConfigField(
                        key="avatar_placeholder_asset_id",
                        type="str",
                        default=None,
                        label="Avatar placeholder asset id",
                        label_i18n="settings:SITE_AVATAR_PLACEHOLDER_ASSET_ID_LABEL",
                    ),
                    ConfigField(
                        key="contact_email",
                        type="str",
                        default=None,
                        label="Contact email",
                        label_i18n="settings:SITE_CONTACT_EMAIL_LABEL",
                    ),
                ],
            ),
            ConfigSection(
                id="workspace_localization",
                title="Workspace localization",
                title_i18n="settings:WORKSPACE_LOCALIZATION_TITLE",
                fields=[
                    ConfigField(
                        key="locale",
                        type="str",
                        default="zh-CN",
                        label="Default language",
                        label_i18n="settings:WORKSPACE_LOCALIZATION_LOCALE_LABEL",
                    ),
                    ConfigField(
                        key="timezone",
                        type="str",
                        default="Asia/Shanghai",
                        label="Timezone",
                        label_i18n="settings:WORKSPACE_LOCALIZATION_TIMEZONE_LABEL",
                    ),
                    ConfigField(
                        key="date_format",
                        type="str",
                        default="YYYY-MM-DD",
                        label="Date format",
                        label_i18n="settings:WORKSPACE_LOCALIZATION_DATE_FORMAT_LABEL",
                    ),
                ],
            ),
            ConfigSection(
                id="site_localization",
                title="Site localization",
                title_i18n="settings:SITE_LOCALIZATION_TITLE",
                fields=[
                    ConfigField(
                        key="supported_locales",
                        type="list",
                        default=["zh-CN", "en-US"],
                        label="Supported locales",
                        label_i18n="settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_LABEL",
                        description="List of locales enabled for the site (BCP 47, e.g. en-US).",
                        description_i18n="settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_DESC",
                    ),
                    ConfigField(
                        key="default_locale",
                        type="str",
                        default="zh-CN",
                        label="Default locale",
                        label_i18n="settings:SITE_LOCALIZATION_DEFAULT_LOCALE_LABEL",
                        description="Default locale for the site (used for canonical/x-default).",
                        description_i18n="settings:SITE_LOCALIZATION_DEFAULT_LOCALE_DESC",
                    ),
                    ConfigField(
                        key="fallback_locale",
                        type="str",
                        default="en-US",
                        label="Fallback locale",
                        label_i18n="settings:SITE_LOCALIZATION_FALLBACK_LOCALE_LABEL",
                        description="Fallback locale used when a localized value is missing.",
                        description_i18n="settings:SITE_LOCALIZATION_FALLBACK_LOCALE_DESC",
                    ),
                    ConfigField(
                        key="locale",
                        type="str",
                        default="zh-CN",
                        label="Default language",
                        label_i18n="settings:SITE_LOCALIZATION_LOCALE_LABEL",
                    ),
                    ConfigField(
                        key="timezone",
                        type="str",
                        default="Asia/Shanghai",
                        label="Timezone",
                        label_i18n="settings:SITE_LOCALIZATION_TIMEZONE_LABEL",
                    ),
                    ConfigField(
                        key="date_format",
                        type="str",
                        default="YYYY-MM-DD",
                        label="Date format",
                        label_i18n="settings:SITE_LOCALIZATION_DATE_FORMAT_LABEL",
                    ),
                ],
            ),
            ConfigSection(
                id="seo",
                title="SEO",
                title_i18n="settings:SEO_TITLE",
                fields=[
                    ConfigField(
                        key="default_title",
                        type="str",
                        default=None,
                        label="Default title",
                        label_i18n="settings:SEO_DEFAULT_TITLE_LABEL",
                    ),
                    ConfigField(
                        key="default_description",
                        type="str",
                        default=None,
                        label="Default description",
                        label_i18n="settings:SEO_DEFAULT_DESCRIPTION_LABEL",
                        ui={"multiline": True},
                    ),
                    ConfigField(
                        key="title_policy_v1",
                        type="dict",
                        default={
                            "parts": [
                                {"kind": "token", "value": "pageTitle"},
                                {"kind": "literal", "value": " - "},
                                {"kind": "token", "value": "siteName"},
                            ],
                            "home_mode": "siteOnly",
                            "dedupe": True,
                        },
                        label="Title policy",
                        label_i18n="settings:SEO_TITLE_POLICY_V1_LABEL",
                        description="Structured title composition policy (parts tokens/literals).",
                        description_i18n="settings:SEO_TITLE_POLICY_V1_DESC",
                    ),
                ],
            ),
            ConfigSection(
                id="comments",
                title="Comments",
                title_i18n="settings:COMMENTS_TITLE",
                fields=[
                    ConfigField(
                        key="enabled",
                        type="bool",
                        default=False,
                        label="Enable comments",
                        label_i18n="settings:COMMENTS_ENABLED_LABEL",
                    ),
                ],
            ),
            ConfigSection(
                id="mail",
                title="Email",
                title_i18n="settings:MAIL_TITLE",
                fields=[
                    ConfigField(
                        key="enabled",
                        type="bool",
                        default=False,
                        label="Enable email",
                        label_i18n="settings:MAIL_ENABLED_LABEL",
                    ),
                    ConfigField(
                        key="provider",
                        type="str",
                        default="smtp",
                        label="Active email provider",
                        label_i18n="settings:MAIL_PROVIDER_LABEL",
                        options=[
                            ConfigOption(value="smtp", label="SMTP"),
                            ConfigOption(value="resend", label="Resend"),
                            ConfigOption(value="cloudflare", label="Cloudflare"),
                            ConfigOption(value="ses", label="Amazon SES"),
                        ],
                    ),
                    ConfigField(
                        key="providers",
                        type="dict",
                        default={},
                        label="Provider settings",
                        label_i18n="settings:MAIL_PROVIDERS_LABEL",
                    ),
                    ConfigField(
                        key="fallback_chain",
                        type="list",
                        default=[],
                        label="Fallback providers",
                        label_i18n="settings:MAIL_FALLBACK_CHAIN_LABEL",
                    ),
                    ConfigField(
                        key="retry",
                        type="dict",
                        default={"max_attempts": 3, "backoff_seconds": [1, 2, 4]},
                        label="Retry policy",
                        label_i18n="settings:MAIL_RETRY_LABEL",
                    ),
                    ConfigField(
                        key="server",
                        type="str",
                        default="localhost",
                        label="SMTP server",
                        label_i18n="settings:MAIL_SERVER_LABEL",
                    ),
                    ConfigField(
                        key="port",
                        type="int",
                        default=587,
                        label="SMTP port",
                        label_i18n="settings:MAIL_PORT_LABEL",
                    ),
                    ConfigField(
                        key="username",
                        type="str",
                        default=None,
                        label="SMTP username",
                        label_i18n="settings:MAIL_USERNAME_LABEL",
                    ),
                    ConfigField(
                        key="password",
                        type="str",
                        default=None,
                        secret=True,
                        ui={"input": "password"},
                        label="SMTP password",
                        label_i18n="settings:MAIL_PASSWORD_LABEL",
                    ),
                    ConfigField(
                        key="use_credentials",
                        type="bool",
                        default=True,
                        label="Use SMTP authentication",
                        label_i18n="settings:MAIL_USE_CREDENTIALS_LABEL",
                    ),
                    ConfigField(
                        key="mail_from",
                        type="str",
                        default="noreply@example.com",
                        label="Mail from",
                        label_i18n="settings:MAIL_FROM_LABEL",
                    ),
                    ConfigField(
                        key="mail_from_name",
                        type="str",
                        default="Arclayer",
                        label="Mail from name",
                        label_i18n="settings:MAIL_FROM_NAME_LABEL",
                    ),
                    ConfigField(
                        key="starttls",
                        type="bool",
                        default=True,
                        label="STARTTLS",
                        label_i18n="settings:MAIL_STARTTLS_LABEL",
                    ),
                    ConfigField(
                        key="ssl_tls",
                        type="bool",
                        default=False,
                        label="SSL/TLS",
                        label_i18n="settings:MAIL_SSL_TLS_LABEL",
                    ),
                ],
            ),
            ConfigSection(
                id="notifications",
                title="Notifications",
                fields=[
                    ConfigField(
                        key="groups",
                        type="dict",
                        default={
                            "team": {"enabled": True},
                            "security": {"enabled": True},
                            "content": {"enabled": True},
                            "automation": {"enabled": True},
                            "system": {"enabled": False},
                        },
                        label="Notification groups",
                    ),
                ],
            ),
            ConfigSection(
                id="ai_agents",
                title="AI Agents",
                fields=[
                    ConfigField(
                        key="enabled",
                        type="bool",
                        default=True,
                        label="Enable AI agents",
                    ),
                    ConfigField(
                        key="default_mode",
                        type="str",
                        default="build",
                        label="Default composer mode",
                        options=[
                            ConfigOption(value="build", label="Build"),
                            ConfigOption(value="plan", label="Plan"),
                            ConfigOption(value="agent", label="Agent"),
                        ],
                    ),
                    ConfigField(
                        key="default_model",
                        type="str",
                        default="deepseek-v4-pro",
                        label="Default model",
                    ),
                    ConfigField(
                        key="reasoning_effort",
                        type="str",
                        default="medium",
                        label="Default reasoning effort",
                        options=[
                            ConfigOption(value="low", label="Low"),
                            ConfigOption(value="medium", label="Medium"),
                            ConfigOption(value="high", label="High"),
                        ],
                    ),
                    ConfigField(
                        key="system_prompt",
                        type="str",
                        default="",
                        label="System prompt",
                    ),
                    ConfigField(
                        key="conversation_retention_days",
                        type="int",
                        default=90,
                        label="Conversation retention days",
                    ),
                    ConfigField(
                        key="auto_title_enabled",
                        type="bool",
                        default=True,
                        label="Auto-title new conversations",
                    ),
                    ConfigField(
                        key="context_recommendations_enabled",
                        type="bool",
                        default=True,
                        label="Recommend actions from current page context",
                    ),
                    ConfigField(
                        key="monthly_budget_micros",
                        type="int",
                        default=100_000_000,
                        label="Monthly workspace AI budget",
                    ),
                    ConfigField(
                        key="skills_enabled",
                        type="bool",
                        default=True,
                        label="Enable agent skills",
                    ),
                    ConfigField(
                        key="allowed_skill_ids",
                        type="list",
                        default=[
                            "content.analysis",
                            "content.planning",
                            "content.build",
                            "content.modeling",
                            "content.writer",
                            "content.modeler",
                        ],
                        label="Allowed skill ids",
                    ),
                    ConfigField(
                        key="write_tools_enabled",
                        type="bool",
                        default=False,
                        label="Enable write-capable tools",
                    ),
                    ConfigField(
                        key="approval_policy",
                        type="str",
                        default="always_approve",
                        label="Write approval policy",
                        options=[
                            ConfigOption(value="always_approve", label="Always approve"),
                            ConfigOption(value="approve_bulk_only", label="Approve bulk only"),
                            ConfigOption(value="approve_schema_only", label="Approve schema only"),
                            ConfigOption(value="auto_approved", label="Auto-approved"),
                        ],
                    ),
                    ConfigField(
                        key="dry_run_required",
                        type="bool",
                        default=True,
                        label="Require dry-run before writes",
                    ),
                ],
            ),
            ConfigSection(
                id="langgraph",
                title="LangGraph",
                fields=[
                    ConfigField(
                        key="enabled",
                        type="bool",
                        default=True,
                        label="Enable LangGraph orchestration",
                    ),
                    ConfigField(
                        key="checkpointer",
                        type="str",
                        default="database",
                        label="Checkpoint backend",
                        options=[
                            ConfigOption(value="database", label="Database"),
                            ConfigOption(value="memory", label="Memory"),
                        ],
                    ),
                    ConfigField(
                        key="checkpoint_ttl_days",
                        type="int",
                        default=90,
                        label="Checkpoint retention days",
                    ),
                    ConfigField(
                        key="interrupt_resume_enabled",
                        type="bool",
                        default=True,
                        label="Enable interrupt/resume approvals",
                    ),
                ],
            ),
            ConfigSection(
                id="auth",
                title="Auth",
                fields=[
                    ConfigField(
                        key="public_register_enabled",
                        type="bool",
                        default=False,
                        label="Public registration enabled",
                    ),
                    ConfigField(
                        key="public_register_require_email",
                        type="bool",
                        default=False,
                        label="Require email for public registration",
                    ),
                    ConfigField(
                        key="public_register_require_email_verification",
                        type="bool",
                        default=False,
                        label="Require email verification after public registration",
                    ),
                    ConfigField(
                        key="public_register_email_domains_allowlist",
                        type="list",
                        default=[],
                        label="Public registration email allowlist",
                    ),
                ],
            ),
            *_build_oauth_provider_sections(),
            ConfigSection(
                id="oauth_provisioning",
                title="OAuth provisioning",
                fields=[
                    ConfigField(
                        key="auto_provision_enabled",
                        type="bool",
                        default=False,
                        label="Auto provision enabled",
                    ),
                    ConfigField(
                        key="auto_accept_email_invites",
                        type="bool",
                        default=False,
                        label="Auto accept email invites",
                    ),
                ],
            ),
            ConfigSection(
                id="storage",
                title="Storage",
                title_i18n="settings:STORAGE_TITLE",
                fields=[
                    ConfigField(
                        key="default_profile_key",
                        type="str",
                        default="env-default",
                        label="Default storage profile key",
                    ),
                    ConfigField(
                        key="upload_chunk_size_mb",
                        type="int",
                        default=8,
                        label="Upload chunk size (MiB)",
                        label_i18n="settings:STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL",
                    ),
                    ConfigField(
                        key="upload_policy",
                        type="dict",
                        default={},
                        label="Upload policy",
                    ),
                    ConfigField(
                        key="upload_session_ttl_seconds",
                        type="int",
                        default=3600,
                        label="Upload session TTL (seconds)",
                    ),
                    ConfigField(
                        key="recycle_bin_retention_days",
                        type="int",
                        default=90,
                        label="Recycle bin retention (days)",
                    ),
                ],
            ),
        ]
    )


CORE_SETTINGS_SCHEMA = build_core_settings_schema()
