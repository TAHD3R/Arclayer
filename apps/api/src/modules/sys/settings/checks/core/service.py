from __future__ import annotations

import asyncio
import os
import smtplib
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import EmailStr, SecretStr, TypeAdapter, ValidationError

from src.common.utils.ids import uuid7
from src.core.i18n import t
from src.modules.sys.settings.schema import SysConfigTestCheck
from src.platform.storage.s3 import S3StorageProvider

if TYPE_CHECKING:
    from src.config import Settings

_EMAIL_ADAPTER = TypeAdapter(EmailStr)
SMTP_PROBE_TIMEOUT_SECONDS = 5.0


def _tsys(key: str) -> str:
    return t("sys", key)


class SysConfigChecksCoreMixin:
    settings: Settings

    async def _check_core_storage(self, *, full_value: dict[str, object]) -> SysConfigTestCheck:
        storage = full_value.get("storage")
        if not isinstance(storage, dict):
            storage = {}
        provider = storage.get("provider")
        provider = provider if isinstance(provider, str) else "local"

        if provider == "local":
            return await self._check_local_storage()
        if provider == "s3":
            return await self._check_s3_storage(storage=storage)
        return SysConfigTestCheck(
            code="core.storage.provider",
            ok=False,
            kind="config",
            message=_tsys("SYS_CHECK_STORAGE_PROVIDER_UNSUPPORTED"),
            details={"provider": provider},
        )

    async def _check_local_storage(self) -> SysConfigTestCheck:
        root = Path(getattr(getattr(self.settings, "storage", object()), "local_root_dir", ""))
        try:
            root.mkdir(parents=True, exist_ok=True)
            probe = root / f".healthcheck.{uuid7().hex}"
            with open(probe, "wb") as handle:
                handle.write(b"ok")
                handle.flush()
                os.fsync(handle.fileno())
            probe.unlink(missing_ok=True)
            return SysConfigTestCheck(code="core.storage.local", ok=True, kind="config")
        except Exception as exc:
            return SysConfigTestCheck(
                code="core.storage.local",
                ok=False,
                kind="internal",
                message=_tsys("SYS_CHECK_STORAGE_LOCAL_NOT_WRITABLE"),
                details={"rootDir": str(root), "error": str(exc)},
            )

    async def _check_s3_storage(self, *, storage: dict[str, object]) -> SysConfigTestCheck:
        endpoint_url = storage.get("s3_endpoint_url")
        bucket = storage.get("s3_bucket")
        public_bucket = storage.get("s3_public_bucket")
        access_key_id = storage.get("s3_access_key_id")
        secret_raw = storage.get("s3_secret_access_key")
        force_path_style = storage.get("s3_force_path_style")
        region = storage.get("s3_region")
        public_base_url = storage.get("public_base_url")
        public_delivery_mode = storage.get("public_delivery_mode")

        if not isinstance(endpoint_url, str) or not endpoint_url.strip():
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_STORAGE_S3_ENDPOINT_REQUIRED"),
            )
        if not isinstance(bucket, str) or not bucket.strip():
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_STORAGE_S3_BUCKET_REQUIRED"),
            )

        mode = public_delivery_mode if isinstance(public_delivery_mode, str) else "auto"
        if mode == "direct":
            if not isinstance(public_bucket, str) or not public_bucket.strip():
                return SysConfigTestCheck(
                    code="core.storage.s3",
                    ok=False,
                    kind="config",
                    message=_tsys("SYS_CHECK_STORAGE_S3_PUBLIC_BUCKET_REQUIRED"),
                )
            if not isinstance(public_base_url, str) or not public_base_url.strip():
                return SysConfigTestCheck(
                    code="core.storage.s3",
                    ok=False,
                    kind="config",
                    message=_tsys("SYS_CHECK_STORAGE_PUBLIC_BASE_URL_REQUIRED"),
                )

        if not isinstance(access_key_id, str) or not access_key_id.strip():
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_STORAGE_S3_ACCESS_KEY_REQUIRED"),
            )
        if not isinstance(secret_raw, str) or not secret_raw.strip():
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_STORAGE_S3_SECRET_KEY_REQUIRED"),
            )

        try:
            effective = self.settings.model_copy(
                update={
                    "storage": self.settings.storage.model_copy(
                        update={
                            "provider": "s3",
                            "s3_endpoint_url": endpoint_url.strip(),
                            "s3_bucket": bucket.strip(),
                            "s3_access_key_id": access_key_id.strip(),
                            "s3_secret_access_key": SecretStr(secret_raw.strip()),
                            "s3_force_path_style": bool(force_path_style),
                            "s3_region": region.strip() if isinstance(region, str) and region.strip() else None,
                            "s3_public_bucket": public_bucket.strip()
                            if isinstance(public_bucket, str) and public_bucket.strip()
                            else None,
                            "public_base_url": public_base_url.strip()
                            if isinstance(public_base_url, str) and public_base_url.strip()
                            else None,
                            "public_delivery_mode": mode if isinstance(mode, str) else "auto",
                        }
                    ),
                }
            )
            provider_impl = S3StorageProvider(effective)
            await provider_impl.ensure_bucket()
            if mode == "direct":
                pub_name = str(public_bucket).strip() if isinstance(public_bucket, str) else ""
                if pub_name:
                    effective_pub = effective.model_copy(
                        update={
                            "storage": effective.storage.model_copy(
                                update={
                                    "s3_bucket": pub_name,
                                }
                            )
                        }
                    )
                    await S3StorageProvider(effective_pub).ensure_bucket()
            return SysConfigTestCheck(code="core.storage.s3", ok=True, kind="config")
        except ModuleNotFoundError as exc:
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="internal",
                message=_tsys("SYS_CHECK_STORAGE_S3_DEPENDENCY_MISSING"),
                details={"error": str(exc)},
            )
        except ValueError as exc:
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_STORAGE_S3_INVALID"),
                details={"error": str(exc)},
            )
        except Exception as exc:
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="connectivity",
                message=_tsys("SYS_CHECK_STORAGE_S3_CONNECT_FAILED"),
                details={"error": str(exc)},
            )

    async def _check_core_mail(self, *, full_value: dict[str, object]) -> SysConfigTestCheck:
        mail = full_value.get("mail")
        if not isinstance(mail, dict):
            mail = {}
        enabled = mail.get("enabled")
        if enabled is not True:
            return SysConfigTestCheck(
                code="core.mail",
                ok=True,
                kind="config",
                message=_tsys("SYS_CHECK_MAIL_DISABLED"),
            )

        server = mail.get("server")
        port = mail.get("port")
        username = mail.get("username")
        password_raw = mail.get("password")
        starttls = mail.get("starttls")
        ssl_tls = mail.get("ssl_tls")
        mail_from = mail.get("mail_from")

        if not isinstance(server, str) or not server.strip():
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_MAIL_SMTP_SERVER_REQUIRED"),
            )
        if not isinstance(port, int) or port <= 0 or port > 65535:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_MAIL_SMTP_PORT_INVALID"),
            )
        if ssl_tls is True and starttls is True:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_MAIL_TLS_INVALID"),
            )

        if isinstance(mail_from, str) and mail_from.strip():
            try:
                _EMAIL_ADAPTER.validate_python(mail_from.strip())
            except ValidationError as exc:
                return SysConfigTestCheck(
                    code="core.mail.smtp",
                    ok=False,
                    kind="config",
                    message=_tsys("SYS_CHECK_MAIL_FROM_INVALID"),
                    details={"error": str(exc)},
                )

        password: str | None = None
        if isinstance(password_raw, str) and password_raw.strip():
            password = password_raw.strip()

        if isinstance(username, str) and username.strip() and not password:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="config",
                message=_tsys("SYS_CHECK_MAIL_SMTP_PASSWORD_REQUIRED"),
            )

        def _call() -> None:
            host = server.strip()
            timeout = SMTP_PROBE_TIMEOUT_SECONDS
            if ssl_tls is True:
                client = smtplib.SMTP_SSL(host=host, port=int(port), timeout=timeout)
            else:
                client = smtplib.SMTP(host=host, port=int(port), timeout=timeout)
            try:
                client.ehlo()
                if starttls is True:
                    client.starttls()
                    client.ehlo()
                if isinstance(username, str) and username.strip() and password:
                    client.login(username.strip(), password)
            finally:
                try:
                    client.quit()
                except Exception:
                    try:
                        client.close()
                    except Exception:
                        pass

        try:
            await asyncio.to_thread(_call)
            return SysConfigTestCheck(code="core.mail.smtp", ok=True, kind="config")
        except (ConnectionError, OSError, TimeoutError, smtplib.SMTPException) as exc:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="connectivity",
                message=_tsys("SYS_CHECK_MAIL_SMTP_CONNECT_FAILED"),
                details={"error": str(exc)},
            )
        except Exception as exc:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="internal",
                message=_tsys("SYS_CHECK_MAIL_UNEXPECTED_ERROR"),
                details={"error": str(exc)},
            )
