from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum
from pydantic import EmailStr, NameEmail, SecretStr, TypeAdapter, ValidationError

from apps.api.config import EmailSettings, Settings
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.settings.crypto import decrypt_secret, ensure_master_key, is_encrypted, master_key_exists
from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _default_template_dir() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "pyproject.toml").exists():
            return parent / "static" / "templates" / "emails"
    return current.parents[5] / "static" / "templates" / "emails"


def build_mail_config(settings: EmailSettings) -> ConnectionConfig:
    template_dir: Path | None = settings.template_dir
    if template_dir is None:
        template_dir = _default_template_dir()

    # fastapi-mail expects SecretStr for MAIL_PASSWORD. Keep it typed and only unwrap when needed.
    password: SecretStr = settings.password if settings.password is not None else SecretStr("")
    try:
        mail_from = _EMAIL_ADAPTER.validate_python(settings.mail_from)
    except ValidationError as exc:
        raise ValueError("invalid mail_from") from exc
    return ConnectionConfig(
        MAIL_USERNAME=settings.username or "",
        MAIL_PASSWORD=password,
        MAIL_FROM=mail_from,
        MAIL_FROM_NAME=settings.mail_from_name,
        MAIL_PORT=settings.port,
        MAIL_SERVER=settings.server,
        MAIL_STARTTLS=settings.starttls,
        MAIL_SSL_TLS=settings.ssl_tls,
        USE_CREDENTIALS=settings.use_credentials,
        VALIDATE_CERTS=settings.validate_certs,
        SUPPRESS_SEND=settings.suppress_send,
        TEMPLATE_FOLDER=template_dir,
    )


def get_fast_mail(settings: EmailSettings) -> FastMail:
    return FastMail(build_mail_config(settings))


def _valid_recipient(recipient: str) -> bool:
    try:
        _EMAIL_ADAPTER.validate_python(recipient)
        return True
    except ValidationError:
        return False


def _to_name_email(email: str) -> NameEmail:
    # fastapi-mail expects `recipients: list[NameEmail]` which requires a `name`.
    local_part = email.split("@", 1)[0].strip()
    return NameEmail(name=local_part or email, email=email)


def _pick_str(value: object, fallback: str) -> str:
    return value if isinstance(value, str) else fallback


def _pick_int(value: object, fallback: int) -> int:
    return value if isinstance(value, int) else fallback


def _pick_bool(value: object, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


class EmailService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.logger = get_logger(__name__)

    async def is_enabled(self) -> bool:
        """
        Public helper for other flows (e.g. auth) to check whether email sending is enabled.

        Note: "enabled" is configured via core settings (`core.mail.enabled`).
        """

        return await self._enabled()

    async def _get_core_mail_config(self) -> dict:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        value = record.value if record and isinstance(record.value, dict) else {}
        mail = value.get("mail")
        return mail if isinstance(mail, dict) else {}

    async def _enabled(self) -> bool:
        mail = await self._get_core_mail_config()
        enabled = mail.get("enabled")
        if isinstance(enabled, bool):
            return enabled
        # Once email is configurable via core settings, default to disabled unless explicitly enabled.
        return False

    async def _is_template_enabled(self, template_key: str) -> bool:
        """
        Determine whether an optional email template is enabled.

        Notes:
        - If no preference is configured, default to enabled (backward compatible).
        - If an allowlist is configured, require template_key to be present.
        """

        mail = await self._get_core_mail_config()
        prefs = mail.get("preferences")
        if not isinstance(prefs, dict):
            return True
        enabled = prefs.get("enabled_templates")
        if enabled is None:
            return True
        if not isinstance(enabled, list):
            return True
        enabled_set = {str(x) for x in enabled if isinstance(x, str) and x.strip()}
        if not enabled_set:
            return False
        return template_key in enabled_set

    async def _build_connection_config(self) -> ConnectionConfig:
        base = self.settings.email
        mail = await self._get_core_mail_config()

        # Prefer DB config (core.mail.*) when present; fall back to env settings.
        server = _pick_str(mail.get("server"), base.server)
        port = _pick_int(mail.get("port"), base.port)
        username = _pick_str(mail.get("username"), base.username or "")
        mail_from_raw = _pick_str(mail.get("mail_from"), base.mail_from)
        mail_from_name = _pick_str(mail.get("mail_from_name"), base.mail_from_name)
        starttls = _pick_bool(mail.get("starttls"), base.starttls)
        ssl_tls = _pick_bool(mail.get("ssl_tls"), base.ssl_tls)

        # fastapi-mail expects EmailStr for MAIL_FROM, validate here so failures are explicit.
        try:
            mail_from = _EMAIL_ADAPTER.validate_python(mail_from_raw)
        except ValidationError as exc:
            raise ValueError("invalid mail_from") from exc

        password_raw = mail.get("password")
        password_secret: SecretStr | None = base.password
        if isinstance(password_raw, str) and password_raw.strip():
            if is_encrypted(password_raw):
                try:
                    key_path = self.settings.setup.master_key_path
                    if not master_key_exists(key_path):
                        raise ValueError("master key missing")
                    key, _fp = ensure_master_key(key_path)
                    aad = f"{CORE_SETTINGS_NAMESPACE}:mail.password"
                    password_secret = SecretStr(decrypt_secret(password_raw, key=key, aad=aad))
                except Exception as exc:
                    self.logger.warning(
                        "Failed to decrypt mail password from core settings, fallback to env password",
                        error=str(exc),
                    )
            else:
                password_secret = SecretStr(password_raw)

        template_dir: Path | None = base.template_dir
        if template_dir is None:
            template_dir = _default_template_dir()

        return ConnectionConfig(
            MAIL_USERNAME=username or "",
            MAIL_PASSWORD=password_secret if password_secret is not None else SecretStr(""),
            MAIL_FROM=mail_from,
            MAIL_FROM_NAME=mail_from_name,
            MAIL_PORT=port,
            MAIL_SERVER=server,
            MAIL_STARTTLS=starttls,
            MAIL_SSL_TLS=ssl_tls,
            USE_CREDENTIALS=base.use_credentials,
            VALIDATE_CERTS=base.validate_certs,
            SUPPRESS_SEND=base.suppress_send,
            TEMPLATE_FOLDER=template_dir,
        )

    async def _get_fast_mail(self) -> FastMail:
        return FastMail(await self._build_connection_config())

    async def send_reset_password(
        self,
        *,
        recipient: str,
        reset_token: str,
        expires_in: int,
        user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send reset password email while email sending is disabled",
                recipient=recipient,
                type="reset_password",
                user_id=user_id,
            )
            return
        if not _valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="reset_password",
                user_id=user_id,
            )
            return
        cid = uuid4().hex
        token_hint = f"{reset_token[:6]}...{reset_token[-4:]}" if len(reset_token) >= 10 else reset_token
        try:
            fm = await self._get_fast_mail()
            subject = t("auth", "RESET_EMAIL_SUBJECT", default="重置密码", locale=locale)
            base = (self.settings.application.frontend_base_url or "").strip()
            base = base.rstrip("/") if base else ""
            reset_url = f"{base}/reset-password?token={reset_token}" if base else None

            if reset_url:
                plain_body = t(
                    "auth",
                    "RESET_EMAIL_PLAIN_WITH_LINK",
                    default="重置链接：{reset_url}\n重置码：{reset_token}\n有效期：{expires_in} 秒。\n如非本人操作，请忽略本邮件。",
                    locale=locale,
                    reset_url=reset_url,
                    reset_token=reset_token,
                    expires_in=expires_in,
                )
            else:
                plain_body = t(
                    "auth",
                    "RESET_EMAIL_PLAIN",
                    default="重置码：{reset_token}，{expires_in} 秒后失效。",
                    locale=locale,
                    reset_token=reset_token,
                    expires_in=expires_in,
                )

            title = t("auth", "RESET_EMAIL_TITLE", default="重置你的密码", locale=locale)
            intro = t(
                "auth",
                "RESET_EMAIL_INTRO",
                default="我们收到了重置密码请求，请点击下方按钮继续。",
                locale=locale,
            )
            cta = t("auth", "RESET_EMAIL_CTA", default="重置密码", locale=locale)
            fallback = t(
                "auth",
                "RESET_EMAIL_FALLBACK",
                default="如果按钮无法使用，你也可以使用以下重置码：",
                locale=locale,
            )
            expires_notice = t(
                "auth",
                "RESET_EMAIL_EXPIRES",
                default="该链接/重置码将在 {expires_in} 秒后失效。",
                locale=locale,
                expires_in=expires_in,
            )
            ignore_notice = t(
                "auth",
                "RESET_EMAIL_IGNORE",
                default="如非本人操作，请忽略本邮件。",
                locale=locale,
            )
            message = MessageSchema(
                subject=subject,
                recipients=[_to_name_email(recipient)],
                template_body={
                    "title": title,
                    "intro": intro,
                    "cta": cta,
                    "fallback": fallback,
                    "expires_notice": expires_notice,
                    "ignore_notice": ignore_notice,
                    "reset_url": reset_url,
                    "reset_token": reset_token,
                    "expires_in": expires_in,
                },
                subtype=MessageType.html,
                alternative_body=plain_body,
                multipart_subtype=MultipartSubtypeEnum.alternative,
            )
            await fm.send_message(
                message,
                html_template="reset_password.html",
                plain_template="reset_password.txt",
            )
            self.logger.info(
                "Successfully sent reset password email",
                recipient=recipient,
                type="reset_password",
                cid=cid,
                token_hint=token_hint,
                user_id=user_id,
            )
        except Exception as exc:
            self.logger.exception(
                "Failed to send reset password email",
                recipient=recipient,
                type="reset_password",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )

    async def send_welcome(
        self,
        *,
        recipient: str,
        username: str,
        user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send welcome email while email sending is disabled",
                recipient=recipient,
                type="welcome",
                user_id=user_id,
            )
            return
        if not await self._is_template_enabled("welcome_email"):
            self.logger.info(
                "Attempt to send welcome email while template is disabled",
                recipient=recipient,
                type="welcome",
                user_id=user_id,
            )
            return
        if not _valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="welcome",
                user_id=user_id,
            )
            return
        cid = uuid4().hex
        try:
            fm = await self._get_fast_mail()
            subject = t(
                "auth",
                "WELCOME_EMAIL_SUBJECT",
                default="欢迎加入 Celestial CMS",
                locale=locale,
            )
            plain_body = t(
                "auth",
                "WELCOME_EMAIL_PLAIN",
                default="欢迎加入 Celestial CMS，{username}。",
                locale=locale,
                username=username,
            )
            title = t(
                "auth",
                "WELCOME_EMAIL_TITLE",
                default="欢迎加入 Celestial CMS",
                locale=locale,
            )
            intro = t(
                "auth",
                "WELCOME_EMAIL_INTRO",
                default="你好，{username}，你的账号已创建成功。",
                locale=locale,
                username=username,
            )
            message = MessageSchema(
                subject=subject,
                recipients=[_to_name_email(recipient)],
                template_body={"username": username, "title": title, "intro": intro},
                subtype=MessageType.html,
                alternative_body=plain_body,
                multipart_subtype=MultipartSubtypeEnum.alternative,
            )
            await fm.send_message(
                message,
                html_template="welcome.html",
                plain_template="welcome.txt",
            )
            self.logger.info(
                "Successfully sent welcome email",
                recipient=recipient,
                type="welcome",
                cid=cid,
                user_id=user_id,
            )
        except Exception as exc:
            self.logger.exception(
                "Failed to send welcome email",
                recipient=recipient,
                type="welcome",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )

    async def send_invitation(
        self,
        *,
        recipient: str,
        invite_url: str | None,
        invite_token: str,
        expires_at: datetime | None,
        organization_name: str | None = None,
        invited_by_user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send invitation email while email sending is disabled",
                recipient=recipient,
                type="invitation",
                organization_name=organization_name,
                invited_by_user_id=invited_by_user_id,
            )
            return
        if not await self._is_template_enabled("registration_prompt"):
            self.logger.info(
                "Attempt to send invitation email while template is disabled",
                recipient=recipient,
                type="invitation",
                organization_name=organization_name,
                invited_by_user_id=invited_by_user_id,
            )
            return
        if not _valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="invitation",
                organization_name=organization_name,
                invited_by_user_id=invited_by_user_id,
            )
            return

        cid = uuid4().hex
        token_hint = f"{invite_token[:6]}...{invite_token[-4:]}" if len(invite_token) >= 10 else invite_token
        try:
            fm = await self._get_fast_mail()

            org_display = (organization_name or "organization").strip() or "organization"
            subject = t(
                "auth",
                "INVITE_EMAIL_SUBJECT",
                default="邀请加入 {organization_name}",
                locale=locale,
                organization_name=org_display,
            )
            title = t(
                "auth",
                "INVITE_EMAIL_TITLE",
                default="你已被邀请加入 {organization_name}",
                locale=locale,
                organization_name=org_display,
            )
            intro = t(
                "auth",
                "INVITE_EMAIL_INTRO",
                default="请使用下方链接完成账号创建并加入组织。",
                locale=locale,
            )
            cta = t(
                "auth",
                "INVITE_EMAIL_CTA",
                default="接受邀请",
                locale=locale,
            )
            fallback = t(
                "auth",
                "INVITE_EMAIL_FALLBACK",
                default="如果按钮无法使用，你也可以使用以下 Token：",
                locale=locale,
            )

            if expires_at is None:
                expires_notice = t(
                    "auth",
                    "INVITE_EMAIL_EXPIRES_NEVER",
                    default="该邀请链接不会过期。",
                    locale=locale,
                )
            else:
                expires_notice = t(
                    "auth",
                    "INVITE_EMAIL_EXPIRES_AT",
                    default="该邀请链接将于 {expires_at} 过期（UTC）。",
                    locale=locale,
                    expires_at=expires_at.astimezone(UTC).isoformat(),
                )

            ignore_notice = t(
                "auth",
                "INVITE_EMAIL_IGNORE",
                default="如非本人操作，请忽略本邮件。",
                locale=locale,
            )

            if invite_url:
                plain_body = t(
                    "auth",
                    "INVITE_EMAIL_PLAIN_WITH_LINK",
                    default="组织：{organization_name}\n邀请链接：{invite_url}\nToken：{invite_token}\n{expires_notice}\n{ignore_notice}",
                    locale=locale,
                    organization_name=org_display,
                    invite_url=invite_url,
                    invite_token=invite_token,
                    expires_notice=expires_notice,
                    ignore_notice=ignore_notice,
                )
            else:
                plain_body = t(
                    "auth",
                    "INVITE_EMAIL_PLAIN",
                    default="组织：{organization_name}\nToken：{invite_token}\n{expires_notice}\n{ignore_notice}",
                    locale=locale,
                    organization_name=org_display,
                    invite_token=invite_token,
                    expires_notice=expires_notice,
                    ignore_notice=ignore_notice,
                )

            message = MessageSchema(
                subject=subject,
                recipients=[_to_name_email(recipient)],
                template_body={
                    "title": title,
                    "intro": intro,
                    "cta": cta,
                    "fallback": fallback,
                    "expires_notice": expires_notice,
                    "ignore_notice": ignore_notice,
                    "invite_url": invite_url,
                    "invite_token": invite_token,
                    "organization_name": org_display,
                },
                subtype=MessageType.html,
                alternative_body=plain_body,
                multipart_subtype=MultipartSubtypeEnum.alternative,
            )
            await fm.send_message(
                message,
                html_template="invitation.html",
                plain_template="invitation.txt",
            )

            self.logger.info(
                "Successfully sent invitation email",
                recipient=recipient,
                type="invitation",
                cid=cid,
                token_hint=token_hint,
                organization_name=org_display,
                invited_by_user_id=invited_by_user_id,
            )
        except Exception as exc:
            self.logger.exception(
                "Failed to send invitation email",
                recipient=recipient,
                type="invitation",
                cid=cid,
                token_hint=token_hint,
                organization_name=organization_name,
                invited_by_user_id=invited_by_user_id,
                error=str(exc),
            )

    async def send_workspace_invitation(
        self,
        *,
        recipient: str,
        invite_url: str | None,
        invite_token: str,
        expires_at: datetime | None,
        workspace_name: str | None,
        inviter_name: str | None = None,
        invited_by_user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        """
        Send a workspace-scoped invitation email.

        Notes:
        - We intentionally reuse the generic invitation templates (invitation.html/txt) so
          the email rendering stays simple, while the wording is workspace-specific.
        - Gated by the same template key as the legacy invitation flow ("registration_prompt")
          to avoid surprising operators who configured an allowlist.
        """

        if not await self._enabled():
            self.logger.info(
                "Attempt to send workspace invitation email while email sending is disabled",
                recipient=recipient,
                type="workspace_invitation",
                workspace_name=workspace_name,
                invited_by_user_id=invited_by_user_id,
            )
            return
        if not await self._is_template_enabled("registration_prompt"):
            self.logger.info(
                "Attempt to send workspace invitation email while template is disabled",
                recipient=recipient,
                type="workspace_invitation",
                workspace_name=workspace_name,
                invited_by_user_id=invited_by_user_id,
            )
            return
        if not _valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="workspace_invitation",
                workspace_name=workspace_name,
                invited_by_user_id=invited_by_user_id,
            )
            return

        cid = uuid4().hex
        token_hint = f"{invite_token[:6]}...{invite_token[-4:]}" if len(invite_token) >= 10 else invite_token
        try:
            fm = await self._get_fast_mail()

            workspace_display = (workspace_name or "workspace").strip() or "workspace"
            inviter_display = (inviter_name or "").strip() or None

            subject = t(
                "team",
                "TEAM_INVITE_EMAIL_SUBJECT",
                default="邀请加入工作区 {workspace_name}",
                locale=locale,
                workspace_name=workspace_display,
            )
            title = t(
                "team",
                "TEAM_INVITE_EMAIL_TITLE",
                default="你已被邀请加入工作区 {workspace_name}",
                locale=locale,
                workspace_name=workspace_display,
            )
            intro = (
                t(
                    "team",
                    "TEAM_INVITE_EMAIL_INTRO_WITH_INVITER",
                    default="{inviter} 邀请你加入工作区。",
                    locale=locale,
                    inviter=inviter_display,
                )
                if inviter_display
                else t(
                    "team",
                    "TEAM_INVITE_EMAIL_INTRO",
                    default="你已被邀请加入工作区。",
                    locale=locale,
                )
            )
            cta = t("team", "TEAM_INVITE_EMAIL_CTA", default="接受邀请", locale=locale)
            fallback = t(
                "team",
                "TEAM_INVITE_EMAIL_FALLBACK",
                default="如果按钮无法使用，你也可以使用以下 Token：",
                locale=locale,
            )

            if expires_at is None:
                expires_notice = t(
                    "team",
                    "TEAM_INVITE_EMAIL_EXPIRES_NEVER",
                    default="该邀请链接不会过期。",
                    locale=locale,
                )
            else:
                expires_notice = t(
                    "team",
                    "TEAM_INVITE_EMAIL_EXPIRES_AT",
                    default="该邀请链接将于 {expires_at} 过期（UTC）。",
                    locale=locale,
                    expires_at=expires_at.astimezone(UTC).isoformat(),
                )

            ignore_notice = t(
                "team",
                "TEAM_INVITE_EMAIL_IGNORE",
                default="如非本人操作，请忽略本邮件。",
                locale=locale,
            )

            if invite_url:
                plain_body = t(
                    "team",
                    "TEAM_INVITE_EMAIL_PLAIN_WITH_LINK",
                    default="工作区：{workspace_name}\n邀请链接：{invite_url}\nToken：{invite_token}\n{expires_notice}\n{ignore_notice}",
                    locale=locale,
                    workspace_name=workspace_display,
                    invite_url=invite_url,
                    invite_token=invite_token,
                    expires_notice=expires_notice,
                    ignore_notice=ignore_notice,
                )
            else:
                plain_body = t(
                    "team",
                    "TEAM_INVITE_EMAIL_PLAIN",
                    default="工作区：{workspace_name}\nToken：{invite_token}\n{expires_notice}\n{ignore_notice}",
                    locale=locale,
                    workspace_name=workspace_display,
                    invite_token=invite_token,
                    expires_notice=expires_notice,
                    ignore_notice=ignore_notice,
                )

            message = MessageSchema(
                subject=subject,
                recipients=[_to_name_email(recipient)],
                template_body={
                    "title": title,
                    "intro": intro,
                    "cta": cta,
                    "fallback": fallback,
                    "expires_notice": expires_notice,
                    "ignore_notice": ignore_notice,
                    "invite_url": invite_url,
                    "invite_token": invite_token,
                },
                subtype=MessageType.html,
                alternative_body=plain_body,
                multipart_subtype=MultipartSubtypeEnum.alternative,
            )
            await fm.send_message(
                message,
                html_template="invitation.html",
                plain_template="invitation.txt",
            )

            self.logger.info(
                "Successfully sent workspace invitation email",
                recipient=recipient,
                type="workspace_invitation",
                cid=cid,
                token_hint=token_hint,
                workspace_name=workspace_display,
                invited_by_user_id=invited_by_user_id,
            )
        except Exception as exc:
            self.logger.exception(
                "Failed to send workspace invitation email",
                recipient=recipient,
                type="workspace_invitation",
                cid=cid,
                token_hint=token_hint,
                workspace_name=workspace_name,
                invited_by_user_id=invited_by_user_id,
                error=str(exc),
            )

    async def send_test_email(
        self,
        *,
        recipient: str,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            raise RuntimeError("MAIL_DISABLED")
        if not _valid_recipient(recipient):
            raise ValueError("INVALID_EMAIL")

        fm = await self._get_fast_mail()
        subject = t("settings", "MAIL_TEST_SUBJECT", default="邮箱配置测试", locale=locale)
        plain_body = t(
            "settings",
            "MAIL_TEST_BODY",
            default="这是一封测试邮件。如果你收到了它，说明 SMTP 配置已生效。",
            locale=locale,
        )
        message = MessageSchema(
            subject=subject,
            recipients=[_to_name_email(recipient)],
            subtype=MessageType.plain,
            body=plain_body,
        )
        await fm.send_message(message)
