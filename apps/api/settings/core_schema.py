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
            ConfigSection(
                id="storage",
                title="Storage",
                title_i18n="settings:STORAGE_TITLE",
                fields=[
                    ConfigField(
                        key="provider",
                        type="str",
                        default="local",
                        label="Storage provider",
                        label_i18n="settings:STORAGE_PROVIDER_LABEL",
                        description="Storage provider: local or s3.",
                        description_i18n="settings:STORAGE_PROVIDER_DESC",
                    ),
                    ConfigField(
                        key="public_base_url",
                        type="str",
                        default=None,
                        label="Public base URL",
                        label_i18n="settings:STORAGE_PUBLIC_BASE_URL_LABEL",
                        description="Optional CDN base URL for public assets.",
                        description_i18n="settings:STORAGE_PUBLIC_BASE_URL_DESC",
                    ),
                    ConfigField(
                        key="upload_chunk_size_mb",
                        type="int",
                        default=8,
                        label="Upload chunk size (MiB)",
                        label_i18n="settings:STORAGE_UPLOAD_CHUNK_SIZE_MB_LABEL",
                    ),
                    ConfigField(
                        key="upload_max_file_size_mb",
                        type="int",
                        default=2048,
                        label="Max file size (MiB)",
                        label_i18n="settings:STORAGE_UPLOAD_MAX_FILE_SIZE_MB_LABEL",
                    ),
                    ConfigField(
                        key="upload_max_avatar_size_mb",
                        type="int",
                        default=10,
                        label="Max avatar size (MiB)",
                        label_i18n="settings:STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB_LABEL",
                    ),
                    ConfigField(
                        key="upload_max_site_logo_size_mb",
                        type="int",
                        default=20,
                        label="Max site logo size (MiB)",
                        label_i18n="settings:STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB_LABEL",
                    ),
                    ConfigField(
                        key="upload_max_favicon_size_mb",
                        type="int",
                        default=2,
                        label="Max favicon size (MiB)",
                        label_i18n="settings:STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB_LABEL",
                    ),
                    ConfigField(
                        key="s3_endpoint_url",
                        type="str",
                        default=None,
                        label="S3 endpoint URL",
                        label_i18n="settings:STORAGE_S3_ENDPOINT_URL_LABEL",
                    ),
                    ConfigField(
                        key="s3_region",
                        type="str",
                        default=None,
                        label="S3 region",
                        label_i18n="settings:STORAGE_S3_REGION_LABEL",
                    ),
                    ConfigField(
                        key="s3_bucket",
                        type="str",
                        default=None,
                        label="S3 bucket",
                        label_i18n="settings:STORAGE_S3_BUCKET_LABEL",
                    ),
                    ConfigField(
                        key="s3_access_key_id",
                        type="str",
                        default=None,
                        label="S3 access key id",
                        label_i18n="settings:STORAGE_S3_ACCESS_KEY_ID_LABEL",
                    ),
                    ConfigField(
                        key="s3_secret_access_key",
                        type="str",
                        default=None,
                        secret=True,
                        ui={"input": "password"},
                        label="S3 secret access key",
                        label_i18n="settings:STORAGE_S3_SECRET_ACCESS_KEY_LABEL",
                    ),
                    ConfigField(
                        key="s3_force_path_style",
                        type="bool",
                        default=False,
                        label="S3 force path style",
                        label_i18n="settings:STORAGE_S3_FORCE_PATH_STYLE_LABEL",
                    ),
                    ConfigField(
                        key="s3_presign_expires_seconds",
                        type="int",
                        default=900,
                        label="S3 presign expires seconds",
                        label_i18n="settings:STORAGE_S3_PRESIGN_EXPIRES_SECONDS_LABEL",
                    ),
                ],
            ),
        ]
    )


CORE_SETTINGS_SCHEMA = build_core_settings_schema()
