from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum
from pydantic import EmailStr, TypeAdapter, ValidationError

from apps.api.config import EmailSettings, Settings
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

    password = settings.password.get_secret_value() if settings.password is not None else None
    return ConnectionConfig(
        MAIL_USERNAME=settings.username or "",
        MAIL_PASSWORD=password or "",
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
    ) -> None:
        if not self._enabled():
            self.logger.info(
                "邮件发送已禁用",
                recipient=recipient,
                type="reset_password",
                user_id=user_id,
            )
            return
        if not _valid_recipient(recipient):
            self.logger.warning(
                "邮件收件人无效，跳过发送",
                recipient=recipient,
                type="reset_password",
                user_id=user_id,
            )
            return
        cid = uuid4().hex
        token_hint = f"{reset_token[:6]}...{reset_token[-4:]}" if len(reset_token) >= 10 else reset_token
        try:
            fm = get_fast_mail(self.settings.email)
            message = MessageSchema(
                subject="重置密码",
                recipients=[recipient],
                template_body={"reset_token": reset_token, "expires_in": expires_in},
                subtype=MessageType.html,
                alternative_body="重置码：{reset_token}，{expires_in} 秒后失效。".format(
                    reset_token=reset_token,
                    expires_in=expires_in,
                ),
                multipart_subtype=MultipartSubtypeEnum.alternative,
            )
            await fm.send_message(
                message,
                html_template="reset_password.html",
                plain_template="reset_password.txt",
            )
            self.logger.info(
                "邮件发送成功",
                recipient=recipient,
                type="reset_password",
                cid=cid,
                token_hint=token_hint,
                user_id=user_id,
            )
        except Exception as exc:
            self.logger.exception(
                "邮件发送失败",
                recipient=recipient,
                type="reset_password",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )

    async def send_welcome(self, *, recipient: str, username: str, user_id: str | None = None) -> None:
        if not self._enabled():
            self.logger.info(
                "邮件发送已禁用",
                recipient=recipient,
                type="welcome",
                user_id=user_id,
            )
            return
        if not _valid_recipient(recipient):
            self.logger.warning(
                "邮件收件人无效，跳过发送",
                recipient=recipient,
                type="welcome",
                user_id=user_id,
            )
            return
        cid = uuid4().hex
        try:
            fm = get_fast_mail(self.settings.email)
            message = MessageSchema(
                subject="欢迎加入 Celestial CMS",
                recipients=[recipient],
                template_body={"username": username},
                subtype=MessageType.html,
                alternative_body="欢迎加入 Celestial CMS，{username}。".format(username=username),
                multipart_subtype=MultipartSubtypeEnum.alternative,
            )
            await fm.send_message(
                message,
                html_template="welcome.html",
                plain_template="welcome.txt",
            )
            self.logger.info(
                "邮件发送成功",
                recipient=recipient,
                type="welcome",
                cid=cid,
                user_id=user_id,
            )
        except Exception as exc:
            self.logger.exception(
                "邮件发送失败",
                recipient=recipient,
                type="welcome",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )
