from __future__ import annotations

from datetime import UTC, datetime

from fastapi_mail import ConnectionConfig, FastMail

from src.common.email.dynamic_service import DynamicMailService
from src.common.email.errors import raise_mail_delivery_error
from src.common.email.helpers import raise_if_fatal, valid_recipient
from src.common.email.provider import EmailMessage, SendResult
from src.common.email.providers.smtp import SmtpEmailProvider
from src.common.email.template_renderer import (
    EmailTemplateRenderError,
    EmailTemplateSourceError,
)
from src.common.email.template_runtime import (
    EmailTemplateDisabledError,
    EmailTemplateNotFoundError,
    EmailTemplateRuntime,
)
from src.common.types.json_types import JsonObject
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.logging import get_logger
from src.core.registries import ConnectorRegistry
from src.models.system.setting import SettingRecord
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class EmailService:
    def __init__(
        self,
        settings: Settings,
        *,
        connector_registry: ConnectorRegistry | None = None,
        template_runtime: EmailTemplateRuntime | None = None,
    ) -> None:
        self.settings = settings
        self.connector_registry = connector_registry
        self.template_runtime = template_runtime or EmailTemplateRuntime()
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
        # Fallback to env settings when no core settings are present.
        # This keeps dev/test/self-host bootstrap workable, while still allowing DB settings
        # to override env when configured.
        return bool(self.settings.email.enabled)

    async def _build_connection_config(self) -> ConnectionConfig:
        mail = await self._get_core_mail_config()
        return SmtpEmailProvider(settings=self.settings, config=mail).build_connection_config()

    async def _get_fast_mail(self) -> FastMail:
        return FastMail(await self._build_connection_config())

    async def _get_dynamic_mail_service(self) -> DynamicMailService:
        mail = await self._get_core_mail_config()
        return DynamicMailService(
            settings=self.settings,
            config=mail,
            smtp_fast_mail_factory=self._get_fast_mail,
            connector_registry=self.connector_registry,
        )

    async def _send(self, message: EmailMessage) -> SendResult:
        service = await self._get_dynamic_mail_service()
        return await service.send(message)

    async def _template_message(
        self,
        *,
        recipient: str,
        template_key: str,
        locale: str | None,
        variables: JsonObject,
    ) -> EmailMessage:
        rendered = await self.template_runtime.render(
            key=template_key,
            locale=locale,
            variables=variables,
        )
        return EmailMessage.single(
            recipient=recipient,
            subject=rendered.subject,
            html_body=rendered.html,
            text_body=rendered.text,
            template_id=template_key,
        )

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
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="reset_password",
                user_id=user_id,
            )
            return
        cid = uuid7().hex
        token_hint = f"{reset_token[:6]}...{reset_token[-4:]}" if len(reset_token) >= 10 else reset_token
        try:
            base = (self.settings.application.frontend_base_url or "").strip()
            base = base.rstrip("/") if base else ""
            reset_url = f"{base}/reset-password?token={reset_token}" if base else None
            message = await self._template_message(
                recipient=recipient,
                template_key="reset_password",
                locale=locale,
                variables={
                    "reset_url": reset_url,
                    "reset_token": reset_token,
                    "expires_in": expires_in,
                },
            )
            await self._send(message)
            self.logger.info(
                "Successfully sent reset password email",
                recipient=recipient,
                type="reset_password",
                cid=cid,
                token_hint=token_hint,
                user_id=user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
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
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="welcome",
                user_id=user_id,
            )
            return
        cid = uuid7().hex
        try:
            message = await self._template_message(
                recipient=recipient,
                template_key="welcome",
                locale=locale,
                variables={"username": username},
            )
            await self._send(message)
            self.logger.info(
                "Successfully sent welcome email",
                recipient=recipient,
                type="welcome",
                cid=cid,
                user_id=user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
            self.logger.exception(
                "Failed to send welcome email",
                recipient=recipient,
                type="welcome",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )

    async def send_email_change_code(
        self,
        *,
        recipient: str,
        code: str,
        expires_in: int,
        user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send email change code while email sending is disabled",
                recipient=recipient,
                type="email_change_code",
                user_id=user_id,
            )
            return
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="email_change_code",
                user_id=user_id,
            )
            return

        cid = uuid7().hex
        try:
            message = await self._template_message(
                recipient=recipient,
                template_key="email_change_code",
                locale=locale,
                variables={"code": code, "expires_in": expires_in},
            )
            await self._send(message)
            self.logger.info(
                "Successfully sent email change code",
                recipient=recipient,
                type="email_change_code",
                cid=cid,
                user_id=user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
            self.logger.exception(
                "Failed to send email change code",
                recipient=recipient,
                type="email_change_code",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )

    async def send_registration_verification(
        self,
        *,
        recipient: str,
        verification_token: str,
        expires_in: int,
        user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send registration verification email while email sending is disabled",
                recipient=recipient,
                type="registration_verification",
                user_id=user_id,
            )
            return
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="registration_verification",
                user_id=user_id,
            )
            return

        cid = uuid7().hex
        try:
            base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
            verification_url = f"{base}/login?mode=register&verify_token={verification_token}" if base else None
            message = await self._template_message(
                recipient=recipient,
                template_key="registration_verification",
                locale=locale,
                variables={
                    "verification_url": verification_url,
                    "verification_token": verification_token,
                    "expires_in": expires_in,
                },
            )
            await self._send(message)
            self.logger.info(
                "Successfully sent registration verification email",
                recipient=recipient,
                type="registration_verification",
                cid=cid,
                user_id=user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
            self.logger.exception(
                "Failed to send registration verification email",
                recipient=recipient,
                type="registration_verification",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )
            raise_mail_delivery_error(
                exc,
                namespace="auth",
                failure_key="MAIL_DELIVERY_FAILED",
                failure_error="MAIL_DELIVERY_FAILED",
                expose_configuration_details=False,
            )

    async def send_login_code(
        self,
        *,
        recipient: str,
        code: str,
        expires_in: int,
        user_id: str | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send login code while email sending is disabled",
                recipient=recipient,
                type="login_code",
                user_id=user_id,
            )
            return
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="login_code",
                user_id=user_id,
            )
            return

        cid = uuid7().hex
        try:
            message = await self._template_message(
                recipient=recipient,
                template_key="login_code",
                locale=locale,
                variables={"code": code, "expires_in": expires_in},
            )
            await self._send(message)
            self.logger.info(
                "Successfully sent login code",
                recipient=recipient,
                type="login_code",
                cid=cid,
                user_id=user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
            self.logger.exception(
                "Failed to send login code",
                recipient=recipient,
                type="login_code",
                cid=cid,
                error=str(exc),
                user_id=user_id,
            )
            raise_mail_delivery_error(
                exc,
                namespace="auth",
                failure_key="MAIL_DELIVERY_FAILED",
                failure_error="MAIL_DELIVERY_FAILED",
                expose_configuration_details=False,
            )

    async def send_security_alert(
        self,
        *,
        recipient: str,
        title: str,
        intro: str,
        event_label: str,
        user_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        occurred_at: datetime | None = None,
        locale: str | None = None,
    ) -> None:
        if not await self._enabled():
            self.logger.info(
                "Attempt to send security alert email while email sending is disabled",
                recipient=recipient,
                type="security_alert",
                user_id=user_id,
            )
            return
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="security_alert",
                user_id=user_id,
            )
            return

        cid = uuid7().hex
        timestamp = (occurred_at or datetime.now(UTC)).astimezone(UTC).isoformat()
        try:
            message = await self._template_message(
                recipient=recipient,
                template_key="security_alert",
                locale=locale,
                variables={
                    "title": title,
                    "intro": intro,
                    "event_label": event_label,
                    "occurred_at": timestamp,
                    "ip_address": ip_address or "-",
                    "user_agent": user_agent or "-",
                },
            )
            await self._send(message)
            self.logger.info(
                "Successfully sent security alert email",
                recipient=recipient,
                type="security_alert",
                cid=cid,
                user_id=user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
            self.logger.exception(
                "Failed to send security alert email",
                recipient=recipient,
                type="security_alert",
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
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="invitation",
                organization_name=organization_name,
                invited_by_user_id=invited_by_user_id,
            )
            return

        cid = uuid7().hex
        token_hint = f"{invite_token[:6]}...{invite_token[-4:]}" if len(invite_token) >= 10 else invite_token
        try:
            org_display = (organization_name or "workspace").strip() or "workspace"
            message = await self._template_message(
                recipient=recipient,
                template_key="invitation",
                locale=locale,
                variables={
                    "organization_name": org_display,
                    "invite_url": invite_url,
                    "invite_token": invite_token,
                    "expires_at": expires_at.astimezone(UTC).isoformat() if expires_at else "",
                },
            )
            await self._send(message)

            self.logger.info(
                "Successfully sent invitation email",
                recipient=recipient,
                type="invitation",
                cid=cid,
                token_hint=token_hint,
                organization_name=org_display,
                invited_by_user_id=invited_by_user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
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
        """Send a workspace-scoped invitation email."""

        if not await self._enabled():
            self.logger.info(
                "Attempt to send workspace invitation email while email sending is disabled",
                recipient=recipient,
                type="workspace_invitation",
                workspace_name=workspace_name,
                invited_by_user_id=invited_by_user_id,
            )
            return
        if not valid_recipient(recipient):
            self.logger.warning(
                "Recipient email is invalid, skip sending mail",
                recipient=recipient,
                type="workspace_invitation",
                workspace_name=workspace_name,
                invited_by_user_id=invited_by_user_id,
            )
            return

        cid = uuid7().hex
        token_hint = f"{invite_token[:6]}...{invite_token[-4:]}" if len(invite_token) >= 10 else invite_token
        try:
            workspace_display = (workspace_name or "workspace").strip() or "workspace"
            inviter_display = (inviter_name or "").strip() or None
            message = await self._template_message(
                recipient=recipient,
                template_key="workspace_invitation",
                locale=locale,
                variables={
                    "workspace_name": workspace_display,
                    "inviter_name": inviter_display,
                    "invite_url": invite_url,
                    "invite_token": invite_token,
                    "expires_at": expires_at.astimezone(UTC).isoformat() if expires_at else "",
                },
            )
            await self._send(message)

            self.logger.info(
                "Successfully sent workspace invitation email",
                recipient=recipient,
                type="workspace_invitation",
                cid=cid,
                token_hint=token_hint,
                workspace_name=workspace_display,
                invited_by_user_id=invited_by_user_id,
            )
        except (
            EmailTemplateNotFoundError,
            EmailTemplateDisabledError,
            EmailTemplateSourceError,
            EmailTemplateRenderError,
        ):
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
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
    ) -> SendResult:
        if not await self._enabled():
            raise RuntimeError("MAIL_DISABLED")
        if not valid_recipient(recipient):
            raise ValueError("INVALID_EMAIL")

        message = await self._template_message(
            recipient=recipient,
            template_key="test",
            locale=locale,
            variables={},
        )
        return await self._send(message)

    async def send_notification(
        self,
        *,
        recipient: str,
        title: str,
        body: str | None,
        action_to: str | None,
        action_label: str | None,
        locale: str | None = None,
    ) -> SendResult:
        if not await self._enabled():
            raise RuntimeError("MAIL_DISABLED")
        if not valid_recipient(recipient):
            raise ValueError("INVALID_EMAIL")

        message = await self._template_message(
            recipient=recipient,
            template_key="notification",
            locale=locale,
            variables={
                "title": title,
                "body": body,
                "action_to": action_to,
                "action_label": action_label,
            },
        )
        return await self._send(message)

    async def send_template_version(
        self,
        *,
        recipient: str,
        template_key: str,
        template_version: int,
        locale: str,
        variables: JsonObject,
        idempotency_key: str,
    ) -> SendResult:
        if not await self._enabled():
            raise RuntimeError("MAIL_DISABLED")
        if not valid_recipient(recipient):
            raise ValueError("INVALID_EMAIL")
        rendered = await self.template_runtime.render_version(
            key=template_key,
            locale=locale,
            version=template_version,
            variables=variables,
        )
        return await self._send(
            EmailMessage.single(
                recipient=recipient,
                subject=rendered.subject,
                html_body=rendered.html,
                text_body=rendered.text,
                template_id=f"{template_key}@{template_version}",
                metadata={"idempotencyKey": idempotency_key},
            )
        )
