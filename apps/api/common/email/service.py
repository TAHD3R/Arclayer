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
    return ConnectionConfig(
        MAIL_USERNAME=settings.username or "",
        MAIL_PASSWORD=password,
        MAIL_FROM=settings.mail_from,
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


class EmailService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.logger = get_logger(__name__)

    def _enabled(self) -> bool:
        return self.settings.email.enabled

    async def send_reset_password(
        self,
        *,
        recipient: str,
        reset_token: str,
        expires_in: int,
        user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not self._enabled():
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
            fm = get_fast_mail(self.settings.email)
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
        if not self._enabled():
            self.logger.info(
                "Attempt to send welcome email while email sending is disabled",
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
            fm = get_fast_mail(self.settings.email)
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
        if not self._enabled():
            self.logger.info(
                "Attempt to send invitation email while email sending is disabled",
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
            fm = get_fast_mail(self.settings.email)

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
