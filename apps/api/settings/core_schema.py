from __future__ import annotations

from apps.api.plugin.manifest import ConfigField, ConfigSchema, ConfigSection

CORE_SETTINGS_NAMESPACE = "core"


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
                        default="Celestial CMS",
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
                        key="favicon_url",
                        type="str",
                        default=None,
                        label="Favicon URL",
                        label_i18n="settings:SITE_FAVICON_LABEL",
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
                id="localization",
                title="Localization",
                title_i18n="settings:LOCALIZATION_TITLE",
                fields=[
                    ConfigField(
                        key="locale",
                        type="str",
                        default="zh-CN",
                        label="Default language",
                        label_i18n="settings:LOCALIZATION_LOCALE_LABEL",
                    ),
                    ConfigField(
                        key="timezone",
                        type="str",
                        default="UTC",
                        label="Timezone",
                        label_i18n="settings:LOCALIZATION_TIMEZONE_LABEL",
                    ),
                    ConfigField(
                        key="date_format",
                        type="str",
                        default="YYYY-MM-DD",
                        label="Date format",
                        label_i18n="settings:LOCALIZATION_DATE_FORMAT_LABEL",
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
                        key="mail_from",
                        type="str",
                        default="noreply@example.com",
                        label="Mail from",
                        label_i18n="settings:MAIL_FROM_LABEL",
                    ),
                    ConfigField(
                        key="mail_from_name",
                        type="str",
                        default="Celestial CMS",
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
        ]
    )


CORE_SETTINGS_SCHEMA = build_core_settings_schema()
