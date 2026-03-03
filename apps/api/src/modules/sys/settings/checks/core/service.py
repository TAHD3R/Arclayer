from __future__ import annotations

import asyncio
import os
import smtplib
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, cast

from pydantic import EmailStr, SecretStr, TypeAdapter, ValidationError

from apps.api.src.common.utils.ids import uuid7
from apps.api.src.infra.storage.s3 import S3StorageProvider
from apps.api.src.modules.sys.settings.schema import SysConfigTestCheck
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE

if TYPE_CHECKING:
    from apps.api.src.config import Settings

_EMAIL_ADAPTER = TypeAdapter(EmailStr)
SMTP_PROBE_TIMEOUT_SECONDS = 5.0


class _SysConfigCryptoLike(Protocol):
    def _decrypt_secret_str_best_effort(self, *, namespace: str, secret_path: str, raw: str) -> str | None: ...


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
            message="Unsupported storage provider",
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
                message="Local storage is not writable",
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
                code="core.storage.s3", ok=False, kind="config", message="Missing s3_endpoint_url"
            )
        if not isinstance(bucket, str) or not bucket.strip():
            return SysConfigTestCheck(code="core.storage.s3", ok=False, kind="config", message="Missing s3_bucket")

        mode = public_delivery_mode if isinstance(public_delivery_mode, str) else "auto"
        if mode == "direct":
            if not isinstance(public_bucket, str) or not public_bucket.strip():
                return SysConfigTestCheck(
                    code="core.storage.s3",
                    ok=False,
                    kind="config",
                    message="Missing s3_public_bucket (required for public direct delivery)",
                )
            if not isinstance(public_base_url, str) or not public_base_url.strip():
                return SysConfigTestCheck(
                    code="core.storage.s3",
                    ok=False,
                    kind="config",
                    message="Missing public_base_url (required for public direct delivery)",
                )

        if not isinstance(access_key_id, str) or not access_key_id.strip():
            return SysConfigTestCheck(
                code="core.storage.s3", ok=False, kind="config", message="Missing s3_access_key_id"
            )
        if not isinstance(secret_raw, str) or not secret_raw.strip():
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message="Missing s3_secret_access_key",
            )

        secret = cast(_SysConfigCryptoLike, self)._decrypt_secret_str_best_effort(
            namespace=CORE_SETTINGS_NAMESPACE,
            secret_path="storage.s3_secret_access_key",
            raw=secret_raw,
        )
        if secret is None:
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message="Cannot decrypt s3_secret_access_key (master key missing or invalid)",
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
                            "s3_secret_access_key": SecretStr(secret),
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
                message="S3 client dependency is missing",
                details={"error": str(exc)},
            )
        except ValueError as exc:
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="config",
                message="Invalid S3 settings",
                details={"error": str(exc)},
            )
        except Exception as exc:
            return SysConfigTestCheck(
                code="core.storage.s3",
                ok=False,
                kind="connectivity",
                message="Failed to connect to S3",
                details={"error": str(exc)},
            )

    async def _check_core_mail(self, *, full_value: dict[str, object]) -> SysConfigTestCheck:
        mail = full_value.get("mail")
        if not isinstance(mail, dict):
            mail = {}
        enabled = mail.get("enabled")
        if enabled is not True:
            return SysConfigTestCheck(code="core.mail", ok=True, kind="config", message="Mail disabled (skipped)")

        server = mail.get("server")
        port = mail.get("port")
        username = mail.get("username")
        password_raw = mail.get("password")
        starttls = mail.get("starttls")
        ssl_tls = mail.get("ssl_tls")
        mail_from = mail.get("mail_from")

        if not isinstance(server, str) or not server.strip():
            return SysConfigTestCheck(code="core.mail.smtp", ok=False, kind="config", message="Missing SMTP server")
        if not isinstance(port, int) or port <= 0 or port > 65535:
            return SysConfigTestCheck(code="core.mail.smtp", ok=False, kind="config", message="Invalid SMTP port")
        if ssl_tls is True and starttls is True:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="config",
                message="Invalid TLS settings (ssl_tls and starttls cannot both be true)",
            )

        if isinstance(mail_from, str) and mail_from.strip():
            try:
                _EMAIL_ADAPTER.validate_python(mail_from.strip())
            except ValidationError as exc:
                return SysConfigTestCheck(
                    code="core.mail.smtp",
                    ok=False,
                    kind="config",
                    message="Invalid mail_from",
                    details={"error": str(exc)},
                )

        password: str | None = None
        if isinstance(password_raw, str) and password_raw.strip():
            password = cast(_SysConfigCryptoLike, self)._decrypt_secret_str_best_effort(
                namespace=CORE_SETTINGS_NAMESPACE,
                secret_path="mail.password",
                raw=password_raw,
            )
            if password is None:
                return SysConfigTestCheck(
                    code="core.mail.smtp",
                    ok=False,
                    kind="config",
                    message="Cannot decrypt SMTP password (master key missing or invalid)",
                )

        if isinstance(username, str) and username.strip() and not password:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="config",
                message="SMTP username requires password",
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
                message="Failed to connect to SMTP server",
                details={"error": str(exc)},
            )
        except Exception as exc:
            return SysConfigTestCheck(
                code="core.mail.smtp",
                ok=False,
                kind="internal",
                message="Unexpected mail test error",
                details={"error": str(exc)},
            )
