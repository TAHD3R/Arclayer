from __future__ import annotations

import asyncio
import binascii
import json
import os
import smtplib
from pathlib import Path
from typing import Any, cast
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic import EmailStr, SecretStr, TypeAdapter, ValidationError

from apps.api.src.common.protocols.tortoise import SettingUpdatedBy
from apps.api.src.common.services.base import BaseService
from apps.api.src.common.utils.ids import uuid7
from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.src.core.i18n import t
from apps.api.src.infra.storage.s3 import S3StorageProvider
from apps.api.src.modules.sys.models.sys_config_revision import SysConfigRevision
from apps.api.src.modules.sys.settings.repository import SysConfigRepository
from apps.api.src.modules.sys.settings.schema import (
    SysConfigDetail,
    SysConfigNamespaceSummary,
    SysConfigRevisionDetail,
    SysConfigRevisionOut,
    SysConfigTestCheck,
    SysConfigTestResult,
)
from apps.api.src.modules.sys.settings.schemas import (
    SYS_AUTH_SETTINGS_SCHEMA,
    SYS_CORE_SETTINGS_SCHEMA,
    SYS_MAIL_SETTINGS_SCHEMA,
    SYS_NAMESPACE_AUTH,
    SYS_NAMESPACE_CORE_LEGACY,
    SYS_NAMESPACE_MAIL,
    SYS_NAMESPACE_OAUTH,
    SYS_NAMESPACE_STORAGE,
    SYS_OAUTH_SETTINGS_SCHEMA,
    SYS_STORAGE_SETTINGS_SCHEMA,
)
from apps.api.src.modules.system.models.setting import SettingRecord
from apps.api.src.plugin.manifest import ConfigSchema
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.crypto import (
    decrypt_secret,
    encrypt_secret,
    ensure_master_key,
    is_encrypted,
    load_master_key,
    master_key_exists,
)
from apps.api.src.settings.runtime import invalidate_core_settings_cache
from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.src.settings.signing import (
    ensure_signing_keypair,
    fingerprint_key_bytes,
    load_public_key,
    sign_detached,
    verify_detached,
)
from apps.api.src.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema

_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


def _canonical_json_bytes(value: dict[str, Any]) -> bytes:
    # Stable encoding for signatures.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


class SysConfigService(BaseService):
    """
    Sys-domain configuration service (super admin only).

    Current scope:
    - Manages split namespaces: `storage` and `mail` (system-level only).
    - Stores revision history in sys_config_revisions/sys_config_active.
    - Persists active values into the legacy `core` settings store for runtime compatibility.
    - Keeps legacy sys namespace `core` readable for early migrations.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = SysConfigRepository()

    def _get_schema_for_namespace(self, namespace: str) -> ConfigSchema:
        if namespace == SYS_NAMESPACE_STORAGE:
            return SYS_STORAGE_SETTINGS_SCHEMA
        if namespace == SYS_NAMESPACE_MAIL:
            return SYS_MAIL_SETTINGS_SCHEMA
        if namespace == SYS_NAMESPACE_OAUTH:
            return SYS_OAUTH_SETTINGS_SCHEMA
        if namespace == SYS_NAMESPACE_AUTH:
            return SYS_AUTH_SETTINGS_SCHEMA
        if namespace == CORE_SETTINGS_NAMESPACE or namespace == SYS_NAMESPACE_CORE_LEGACY:
            # Backward compatible: legacy sys namespace "core" (mail+storage).
            return SYS_CORE_SETTINGS_SCHEMA
        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SYS_NAMESPACE_NOT_FOUND")

    @staticmethod
    def _schema_section_ids(schema: ConfigSchema) -> set[str]:
        return {str(s.id) for s in (schema.sections or []) if getattr(s, "id", None)}

    @staticmethod
    def _schema_section_field_keys(schema: ConfigSchema) -> dict[str, set[str]]:
        out: dict[str, set[str]] = {}
        for section in (schema.sections or []) or []:
            section_id = str(getattr(section, "id", "") or "").strip()
            if not section_id:
                continue
            keys = {str(getattr(f, "key", "") or "").strip() for f in (getattr(section, "fields", []) or [])}
            out[section_id] = {k for k in keys if k}
        return out

    def _assert_patch_within_schema(self, *, schema: ConfigSchema, patch: dict[str, Any]) -> None:
        """
        Hard-safety gate:
        - sys config should only patch sections that are explicitly allowed by the schema.
        - This prevents super admin UI from accidentally modifying unrelated core sections.
        """

        if not isinstance(patch, dict):
            raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="BAD_REQUEST")

        allowed_sections = self._schema_section_ids(schema)
        allowed_fields = self._schema_section_field_keys(schema)
        for section_id, value in (patch or {}).items():
            if section_id not in allowed_sections:
                raise BadRequest(
                    message=_ts("BAD_REQUEST", "参数错误"),
                    error="SYS_CONFIG_PATCH_OUT_OF_SCHEMA",
                    details={"section_id": section_id},
                )
            if value is not None and not isinstance(value, dict):
                raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="BAD_REQUEST")
            if isinstance(value, dict):
                known_keys = allowed_fields.get(section_id, set())
                for field_key in value.keys():
                    if field_key not in known_keys:
                        raise BadRequest(
                            message=_ts("BAD_REQUEST", "参数错误"),
                            error="SYS_CONFIG_PATCH_FIELD_OUT_OF_SCHEMA",
                            details={"section_id": section_id, "field_key": field_key},
                        )

    def _filter_to_schema_sections(self, *, schema: ConfigSchema, value: dict[str, Any]) -> dict[str, Any]:
        allowed_sections = self._schema_section_ids(schema)
        return {k: v for k, v in (value or {}).items() if k in allowed_sections}

    async def list_namespaces(self) -> list[SysConfigNamespaceSummary]:
        return [
            SysConfigNamespaceSummary(
                namespace=SYS_NAMESPACE_STORAGE,
                kind="storage",
                title=_ts("STORAGE_TITLE", "存储"),
                description=None,
            ),
            SysConfigNamespaceSummary(
                namespace=SYS_NAMESPACE_MAIL,
                kind="mail",
                title=_ts("MAIL_TITLE", "邮件"),
                description=None,
            ),
            SysConfigNamespaceSummary(
                namespace=SYS_NAMESPACE_OAUTH,
                kind="oauth",
                title=_ts("OAUTH_TITLE", "OAuth"),
                description=_ts("OAUTH_DESC", "第三方登录（Google/GitHub）与自动开通策略"),
            ),
            SysConfigNamespaceSummary(
                namespace=SYS_NAMESPACE_AUTH,
                kind="auth",
                title=_ts("AUTH_TITLE", "认证"),
                description=_ts("AUTH_DESC", "注册开放与注册限制策略"),
            ),
        ]

    async def _get_legacy_core_value(self) -> dict[str, Any]:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        return record.value if record and isinstance(record.value, dict) else {}

    async def _get_active_payload(self, namespace: str) -> dict[str, Any] | None:
        _active, rev = await self.repo.get_active(namespace=namespace)
        if rev is None:
            return None
        value = rev.value if isinstance(rev.value, dict) else None
        return value if isinstance(value, dict) else None

    async def _get_effective_core_value(self, *, override: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Build an effective core settings dict for validation/runtime compatibility.

        Sources (ordered):
        1) Legacy settings store (core)
        2) Legacy sys-config "core" active revision (mail/storage only)
        3) Split sys-config active revisions (storage/mail)
        4) Optional override (used for draft/test/activation checks)
        """

        core = await self._get_legacy_core_value()

        legacy_sys_core = await self._get_active_payload(SYS_NAMESPACE_CORE_LEGACY)
        if legacy_sys_core is not None:
            allowed = {"mail", "storage"}
            legacy_visible = {k: v for k, v in legacy_sys_core.items() if k in allowed}
            core = merge_deep(core, legacy_visible)

        storage_payload = await self._get_active_payload(SYS_NAMESPACE_STORAGE)
        if storage_payload is not None:
            core = merge_deep(core, storage_payload)
        mail_payload = await self._get_active_payload(SYS_NAMESPACE_MAIL)
        if mail_payload is not None:
            core = merge_deep(core, mail_payload)
        oauth_payload = await self._get_active_payload(SYS_NAMESPACE_OAUTH)
        if oauth_payload is not None:
            core = merge_deep(core, oauth_payload)
        auth_payload = await self._get_active_payload(SYS_NAMESPACE_AUTH)
        if auth_payload is not None:
            core = merge_deep(core, auth_payload)

        if override is not None and isinstance(override, dict):
            core = merge_deep(core, override)
        return core

    async def _get_current_namespace_visible_value(self, *, namespace: str, schema: ConfigSchema) -> dict[str, Any]:
        core = await self._get_effective_core_value()
        return self._filter_to_schema_sections(schema=schema, value=core)

    def _mask_secrets(self, schema: ConfigSchema, config: dict[str, Any]) -> tuple[dict[str, Any], dict[str, bool]]:
        masked: dict[str, Any] = dict(config or {})
        secrets: dict[str, bool] = {}

        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = masked.get(section_id)
            if not isinstance(section, dict):
                secrets[path] = False
                continue
            value = section.get(field_key)
            if value is None:
                secrets[path] = False
                continue
            secrets[path] = True
            section[field_key] = None

        return masked, secrets

    async def get_detail(self, *, namespace: str) -> SysConfigDetail:
        schema = self._get_schema_for_namespace(namespace)
        await self._bootstrap_from_legacy_if_needed(namespace=namespace, schema=schema)
        current = await self._get_current_namespace_visible_value(namespace=namespace, schema=schema)
        masked, secrets = self._mask_secrets(schema, current)

        active, rev = await self.repo.get_active(namespace=namespace)
        updated_at = rev.updated_at if rev is not None else None
        return SysConfigDetail(
            namespace=namespace,
            setting_schema=self._to_schema_item(schema),
            value=masked,
            secrets=secrets,
            active_revision_id=(getattr(active, "active_revision_id", None) if active is not None else None),
            updated_at=updated_at,
        )

    async def list_revisions_page(
        self,
        *,
        namespace: str,
        params: PageParams,
    ) -> PageData[SysConfigRevisionOut]:
        self._get_schema_for_namespace(namespace)
        qs = SysConfigRevision.filter(namespace=namespace).order_by("-created_at")
        return await paginate_queryset(qs, params=params, out_schema=SysConfigRevisionOut)

    async def patch_namespace(
        self,
        namespace: str,
        *,
        patch: dict[str, Any],
        updated_by: UUID | None,
        activate: bool = True,
    ) -> SysConfigDetail:
        schema = self._get_schema_for_namespace(namespace)
        await self._bootstrap_from_legacy_if_needed(namespace=namespace, schema=schema)
        self._assert_patch_within_schema(schema=schema, patch=patch)
        current_visible = await self._get_current_namespace_visible_value(namespace=namespace, schema=schema)
        merged_visible = merge_deep(current_visible, patch)

        validate_config_schema(schema, merged_visible, allow_unknown=True)
        merged_visible = await self._encrypt_secrets_if_needed(
            namespace=CORE_SETTINGS_NAMESPACE,
            schema=schema,
            current=current_visible,
            merged=merged_visible,
        )

        # Store schema-visible payload only (split namespaces).
        merged: dict[str, Any] = dict(merged_visible or {})

        # Sign the merged payload (best-effort).
        signature: str | None = None
        signing_fp: str | None = None
        try:
            priv, _pub, signing_fp = ensure_signing_keypair(
                private_path=self.settings.setup.signing_private_key_path,
                public_path=self.settings.setup.signing_public_key_path,
            )
            signature = sign_detached(
                b"sys-config:" + namespace.encode("utf-8") + b":" + _canonical_json_bytes(merged_visible),
                private_key=priv,
            )
        except Exception as exc:
            # Never block config edits on signature issues; log and proceed.
            self.logger.warning(
                "Sys config signature failed",
                action="sys_config_sign_revision",
                namespace=namespace,
                error=str(exc),
            )

        _active, active_rev = await self.repo.get_active(namespace=namespace)
        base_revision_id = active_rev.id if active_rev is not None else None
        rev = await self.repo.create_revision(
            namespace=namespace,
            value=merged,
            base_revision_id=base_revision_id,
            created_by=updated_by,
            signature=signature,
            signing_key_fingerprint=signing_fp,
        )

        if activate:
            await self._assert_revision_can_activate(
                namespace=namespace,
                schema=schema,
                revision_value=merged,
                revision_id=rev.id,
            )
            # Legacy runtime compatibility: persist into system-scoped core settings store.
            core_value = await self._get_effective_core_value(override=merged)
            record = await SettingRecord.get_or_none(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
            )
            if record is None:
                await SettingRecord.create(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=CORE_SETTINGS_NAMESPACE,
                    value=core_value,
                    updated_by=updated_by,
                )
            else:
                record.value = core_value
                cast(SettingUpdatedBy, record).updated_by = updated_by
                await record.save()
            await self.repo.activate(namespace=namespace, revision=rev, activated_by=updated_by)
            invalidate_core_settings_cache()

        detail = await self.get_detail(namespace=namespace)
        detail.revision_id = rev.id
        return detail

    async def activate_revision(
        self, *, namespace: str, revision_id: UUID, activated_by: UUID | None
    ) -> SysConfigDetail:
        schema = self._get_schema_for_namespace(namespace)
        await self._bootstrap_from_legacy_if_needed(namespace=namespace, schema=schema)
        rev = await self.repo.get_revision(namespace=namespace, revision_id=revision_id)
        if rev is None:
            raise NotFound(message=_ts("NOT_FOUND", "资源不存在"), error="SYS_CONFIG_REVISION_NOT_FOUND")

        value = rev.value if isinstance(rev.value, dict) else {}
        visible = self._filter_to_schema_sections(schema=schema, value=value)
        validate_config_schema(schema, visible, allow_unknown=True)
        self._assert_revision_secrets_encrypted(namespace=namespace, schema=schema, value=value)
        await self._assert_revision_can_activate(
            namespace=namespace,
            schema=schema,
            revision_value=value,
            revision_id=rev.id,
        )

        core_value = await self._get_effective_core_value(override=value)
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        if record is None:
            await SettingRecord.create(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
                value=core_value,
                updated_by=activated_by,
            )
        else:
            record.value = core_value
            cast(SettingUpdatedBy, record).updated_by = activated_by
            await record.save()

        await self.repo.activate(namespace=namespace, revision=rev, activated_by=activated_by)
        invalidate_core_settings_cache()
        detail = await self.get_detail(namespace=namespace)
        detail.revision_id = rev.id
        return detail

    async def test_revision(self, *, namespace: str, revision_id: UUID) -> SysConfigTestResult:
        schema = self._get_schema_for_namespace(namespace)
        await self._bootstrap_from_legacy_if_needed(namespace=namespace, schema=schema)
        rev = await self.repo.get_revision(namespace=namespace, revision_id=revision_id)
        if rev is None:
            raise NotFound(message=_ts("NOT_FOUND", "资源不存在"), error="SYS_CONFIG_REVISION_NOT_FOUND")

        value = rev.value if isinstance(rev.value, dict) else {}
        visible = self._filter_to_schema_sections(schema=schema, value=value)
        validate_config_schema(schema, visible, allow_unknown=True)
        self._assert_revision_secrets_encrypted(namespace=namespace, schema=schema, value=value)
        effective = await self._get_effective_core_value(override=value)
        checks = await self._run_revision_checks(namespace=namespace, effective_core_value=effective)
        ok = all(c.ok for c in checks)
        return SysConfigTestResult(ok=ok, checks=checks)

    async def get_revision_detail(self, *, namespace: str, revision_id: UUID) -> SysConfigRevisionDetail:
        schema = self._get_schema_for_namespace(namespace)
        await self._bootstrap_from_legacy_if_needed(namespace=namespace, schema=schema)
        rev = await self.repo.get_revision(namespace=namespace, revision_id=revision_id)
        if rev is None:
            raise NotFound(message=_ts("NOT_FOUND", "资源不存在"), error="SYS_CONFIG_REVISION_NOT_FOUND")

        value = rev.value if isinstance(rev.value, dict) else {}
        visible = self._filter_to_schema_sections(schema=schema, value=value)
        masked, secrets = self._mask_secrets(schema, visible)
        verified, reason = self._verify_revision_signature(
            namespace=namespace,
            visible_value=visible,
            signature=rev.signature,
            signing_key_fingerprint=rev.signing_key_fingerprint,
        )

        return SysConfigRevisionDetail(
            id=rev.id,
            created_at=rev.created_at,
            updated_at=rev.updated_at,
            namespace=namespace,
            base_revision_id=rev.base_revision_id,
            created_by=rev.created_by,
            signature=rev.signature,
            signing_key_fingerprint=rev.signing_key_fingerprint,
            signature_verified=verified,
            signature_verify_reason=reason,
            value=masked,
            secrets=secrets,
        )

    async def _bootstrap_from_legacy_if_needed(self, *, namespace: str, schema: ConfigSchema) -> None:
        """
        Best-effort bootstrap:
        - If sys-config has no active revision yet, but legacy `settings` already has a value,
          create an initial revision and activate it.

        Rationale:
        - Enables revision history immediately after introducing sys tables.
        - Avoids a manual data migration step for existing installations.
        """

        _active, active_rev = await self.repo.get_active(namespace=namespace)
        if active_rev is not None:
            return

        created_by: UUID | None = None
        legacy_value: dict[str, Any] | None = None

        legacy_sys_core = await self._get_active_payload(SYS_NAMESPACE_CORE_LEGACY)
        if legacy_sys_core is not None:
            legacy_value = legacy_sys_core
        else:
            record = await SettingRecord.get_or_none(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
            )
            if record is not None and isinstance(record.value, dict):
                legacy_value = record.value
                created_by = getattr(record, "updated_by", None)

        if legacy_value is None:
            return

        visible = self._filter_to_schema_sections(schema=schema, value=legacy_value)

        signature: str | None = None
        signing_fp: str | None = None
        try:
            priv, _pub, signing_fp = ensure_signing_keypair(
                private_path=self.settings.setup.signing_private_key_path,
                public_path=self.settings.setup.signing_public_key_path,
            )
            signature = sign_detached(
                b"sys-config:" + namespace.encode("utf-8") + b":" + _canonical_json_bytes(visible),
                private_key=priv,
            )
        except Exception as exc:
            self.logger.warning(
                "Sys config bootstrap signature failed",
                action="sys_config_bootstrap_sign_revision",
                namespace=namespace,
                error=str(exc),
            )

        rev = await self.repo.create_revision(
            namespace=namespace,
            value=visible,
            base_revision_id=None,
            created_by=created_by,
            signature=signature,
            signing_key_fingerprint=signing_fp,
        )
        await self.repo.activate(namespace=namespace, revision=rev, activated_by=created_by)

    def _assert_revision_secrets_encrypted(
        self, *, namespace: str, schema: ConfigSchema, value: dict[str, Any]
    ) -> None:
        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = value.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str) or not raw.strip():
                continue
            if is_encrypted(raw):
                continue
            raise BadRequest(
                message=_ts("BAD_REQUEST", "参数错误"),
                error="SYS_CONFIG_REVISION_PLAINTEXT_SECRET",
                details={"namespace": namespace, "secret_path": path},
            )

    def _verify_revision_signature(
        self,
        *,
        namespace: str,
        visible_value: dict[str, Any],
        signature: str | None,
        signing_key_fingerprint: str | None,
    ) -> tuple[bool | None, str | None]:
        if not signature:
            return None, None

        pub_path = self.settings.setup.signing_public_key_path
        try:
            if not pub_path.is_file():
                return None, "PUBLIC_KEY_MISSING"
            pub = load_public_key(pub_path)
            current_fp = fingerprint_key_bytes(pub.public_bytes(Encoding.Raw, PublicFormat.Raw))
            if signing_key_fingerprint and signing_key_fingerprint != current_fp:
                return None, "SIGNING_KEY_ROTATED"
            payload = b"sys-config:" + namespace.encode("utf-8") + b":" + _canonical_json_bytes(visible_value)
            ok = verify_detached(payload, signature_b64=signature, public_key=pub)
            return ok, None
        except Exception as exc:
            self.logger.warning(
                "Sys config signature verify failed",
                action="sys_config_verify_revision_signature",
                namespace=namespace,
                error=str(exc),
            )
            return None, "VERIFY_ERROR"

    def _decrypt_secret_str_best_effort(self, *, namespace: str, secret_path: str, raw: str) -> str | None:
        """
        Decrypt a secret string if it is encrypted; otherwise return as-is.

        Notes:
        - Sys config secrets use AAD: "{namespace}:{section.key}".
        - Returns None when master key is missing or decryption fails.
        """

        if not isinstance(raw, str) or not raw.strip():
            return None
        if not is_encrypted(raw):
            return raw

        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            return None
        try:
            key = load_master_key(key_path)
            aad = f"{namespace}:{secret_path}"
            return decrypt_secret(raw, key=key, aad=aad)
        except (binascii.Error, OSError, RuntimeError, TypeError, ValueError, UnicodeError, InvalidTag):
            return None

    async def _run_revision_checks(
        self,
        *,
        namespace: str,
        effective_core_value: dict[str, Any],
    ) -> list[SysConfigTestCheck]:
        checks: list[SysConfigTestCheck] = []
        if namespace in {SYS_NAMESPACE_STORAGE}:
            checks.append(await self._check_core_storage(full_value=effective_core_value))
            return checks
        if namespace in {SYS_NAMESPACE_MAIL}:
            checks.append(await self._check_core_mail(full_value=effective_core_value))
            return checks
        if namespace in {SYS_NAMESPACE_OAUTH}:
            checks.extend(await self._check_oauth_social(full_value=effective_core_value))
            return checks
        if namespace in {SYS_NAMESPACE_AUTH}:
            checks.extend(await self._check_auth_policy(full_value=effective_core_value))
            return checks
        if namespace in {CORE_SETTINGS_NAMESPACE, SYS_NAMESPACE_CORE_LEGACY}:
            checks.append(await self._check_core_storage(full_value=effective_core_value))
            checks.append(await self._check_core_mail(full_value=effective_core_value))
            return checks
        return []

    async def _assert_revision_can_activate(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        revision_value: dict[str, Any],
        revision_id: UUID,
    ) -> None:
        effective = await self._get_effective_core_value(override=revision_value)
        checks = await self._run_revision_checks(namespace=namespace, effective_core_value=effective)
        failures = [c for c in checks if not bool(c.ok)]
        if not failures:
            return

        any_transient = any(c.kind in {"connectivity", "internal"} for c in failures)
        payload = {
            "revisionId": encode_uuid(revision_id),
            "checks": [c.model_dump(by_alias=True) for c in checks],
        }
        if any_transient:
            raise ServiceUnavailable(
                message=_ts("SYS_CONFIG_ACTIVATE_FAILED", "配置测试失败，请检查网络连接与服务状态"),
                error="SYS_CONFIG_ACTIVATION_CHECK_FAILED",
                details=payload,
            )
        raise BadRequest(
            message=_ts("SYS_CONFIG_ACTIVATE_FAILED", "配置测试失败，请检查参数"),
            error="SYS_CONFIG_ACTIVATION_CHECK_FAILED",
            details=payload,
        )

    async def _check_core_storage(self, *, full_value: dict[str, Any]) -> SysConfigTestCheck:
        storage = full_value.get("storage")
        if not isinstance(storage, dict):
            storage = {}
        provider = storage.get("provider")
        provider = provider if isinstance(provider, str) else "local"

        if provider == "local":
            root = Path(self.settings.storage.local_root_dir)
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

        if provider == "s3":
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
                    message="Missing s3_endpoint_url",
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
                    code="core.storage.s3",
                    ok=False,
                    kind="config",
                    message="Missing s3_access_key_id",
                )
            if not isinstance(secret_raw, str) or not secret_raw.strip():
                return SysConfigTestCheck(
                    code="core.storage.s3",
                    ok=False,
                    kind="config",
                    message="Missing s3_secret_access_key",
                )

            secret = self._decrypt_secret_str_best_effort(
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
                                "s3_region": (region.strip() if isinstance(region, str) and region.strip() else None),
                                "s3_bucket": bucket.strip(),
                                "s3_public_bucket": public_bucket.strip()
                                if isinstance(public_bucket, str) and public_bucket.strip()
                                else None,
                                "s3_access_key_id": access_key_id.strip(),
                                "s3_secret_access_key": SecretStr(secret),
                                "s3_force_path_style": bool(force_path_style)
                                if isinstance(force_path_style, bool)
                                else False,
                                "public_base_url": public_base_url.strip()
                                if isinstance(public_base_url, str) and public_base_url.strip()
                                else None,
                                "public_delivery_mode": mode if isinstance(mode, str) else "auto",
                            }
                        )
                    }
                )
                provider_impl = S3StorageProvider(effective)
                await provider_impl.ensure_bucket()
                if mode == "direct":
                    # Ensure public bucket exists too.
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

        return SysConfigTestCheck(
            code="core.storage.provider",
            ok=False,
            kind="config",
            message="Unsupported storage provider",
            details={"provider": provider},
        )

    async def _check_core_mail(self, *, full_value: dict[str, Any]) -> SysConfigTestCheck:
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
            password = self._decrypt_secret_str_best_effort(
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
            timeout = 5.0
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

    async def _check_oauth_social(self, *, full_value: dict[str, Any]) -> list[SysConfigTestCheck]:
        """
        Validate OAuth social login configuration (core capability).

        Notes:
        - This is a config-level check only (no external network calls).
        - Secrets are expected to be encrypted with AAD: "core:{section.key}".
        """

        checks: list[SysConfigTestCheck] = []

        def _check_provider(section_id: str, *, code: str) -> SysConfigTestCheck:
            section = full_value.get(section_id)
            if not isinstance(section, dict):
                section = {}
            enabled = section.get("enabled") is True
            if not enabled:
                return SysConfigTestCheck(code=code, ok=True, kind="config", message="OAuth disabled (skipped)")

            client_id = section.get("client_id")
            client_secret_raw = section.get("client_secret")
            if not isinstance(client_id, str) or not client_id.strip():
                return SysConfigTestCheck(code=code, ok=False, kind="config", message="Missing client_id")
            if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                return SysConfigTestCheck(code=code, ok=False, kind="config", message="Missing client_secret")

            secret = self._decrypt_secret_str_best_effort(
                namespace=CORE_SETTINGS_NAMESPACE,
                secret_path=f"{section_id}.client_secret",
                raw=client_secret_raw,
            )
            if secret is None:
                return SysConfigTestCheck(
                    code=code,
                    ok=False,
                    kind="config",
                    message="Cannot decrypt client_secret (master key missing or invalid)",
                )
            return SysConfigTestCheck(code=code, ok=True, kind="config")

        checks.append(_check_provider("oauth_google", code="core.oauth.google"))
        checks.append(_check_provider("oauth_github", code="core.oauth.github"))
        return checks

    async def _check_auth_policy(self, *, full_value: dict[str, Any]) -> list[SysConfigTestCheck]:
        """
        Validate instance-level auth policies (registration gates).

        Notes:
        - This is a config-level check only.
        - Runtime enforcement happens in auth service endpoints.
        """

        section = full_value.get("auth")
        if not isinstance(section, dict):
            section = {}

        allowlist = section.get("public_register_email_domains_allowlist")
        if allowlist is None:
            return [SysConfigTestCheck(code="core.auth.registration", ok=True, kind="config")]

        if not isinstance(allowlist, list):
            return [
                SysConfigTestCheck(
                    code="core.auth.registration",
                    ok=False,
                    kind="config",
                    message="public_register_email_domains_allowlist must be a list",
                )
            ]

        normalized: list[str] = []
        for item in allowlist:
            if not isinstance(item, str):
                return [
                    SysConfigTestCheck(
                        code="core.auth.registration",
                        ok=False,
                        kind="config",
                        message="public_register_email_domains_allowlist must only contain strings",
                    )
                ]
            d = item.strip().lower().lstrip(".")
            if not d:
                continue
            normalized.append(d)

        if len(normalized) != len({*normalized}):
            return [
                SysConfigTestCheck(
                    code="core.auth.registration",
                    ok=False,
                    kind="config",
                    message="public_register_email_domains_allowlist contains duplicates",
                )
            ]

        return [SysConfigTestCheck(code="core.auth.registration", ok=True, kind="config")]

    async def _encrypt_secrets_if_needed(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        current: dict[str, Any],
        merged: dict[str, Any],
    ) -> dict[str, Any]:
        # Only require master key if there are plaintext secret fields to encrypt.
        secret_paths = list(iter_secret_field_paths(schema))
        needs_encrypt = False
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = merged.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            # If the user didn't change the secret and it matches the current encrypted value,
            # don't re-encrypt.
            cur_section = current.get(section_id)
            if isinstance(cur_section, dict):
                cur_val = cur_section.get(field_key)
                if isinstance(cur_val, str) and raw == cur_val:
                    continue
            needs_encrypt = True
            break

        if not needs_encrypt:
            return merged

        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=_ts("MASTER_KEY_MISSING", "系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = merged.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            aad = f"{namespace}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)

        return merged

    def _to_schema_item(self, schema: ConfigSchema):
        # Reuse the admin Settings schema shape for UI compatibility.
        from apps.api.src.modules.system.settings.schema import (
            SettingsFieldItem,
            SettingsOptionItem,
            SettingsSchemaItem,
            SettingsSectionItem,
        )

        def _translate_ref(ref: str | None, default: str | None) -> str | None:
            if not ref:
                return default
            trimmed = ref.strip()
            if ":" in trimmed:
                ns, key = trimmed.split(":", 1)
            elif "." in trimmed:
                ns, key = trimmed.split(".", 1)
            else:
                ns, key = "settings", trimmed
            return t(ns.strip(), key.strip(), default=default)

        sections: list[SettingsSectionItem] = []
        for section in schema.sections:
            fields: list[SettingsFieldItem] = []
            for field in section.fields:
                options: list[SettingsOptionItem] = []
                for opt in getattr(field, "options", []) or []:
                    options.append(
                        SettingsOptionItem(
                            value=getattr(opt, "value", None),
                            label=_translate_ref(getattr(opt, "label_i18n", None), getattr(opt, "label", None)),
                            description=_translate_ref(
                                getattr(opt, "description_i18n", None),
                                getattr(opt, "description", None),
                            ),
                        )
                    )
                fields.append(
                    SettingsFieldItem(
                        key=field.key,
                        type=field.type,
                        default=field.default,
                        secret=bool(getattr(field, "secret", False)),
                        options=options,
                        ui=getattr(field, "ui", None),
                        label=_translate_ref(field.label_i18n, field.label),
                        description=_translate_ref(field.description_i18n, field.description),
                    )
                )
            sections.append(
                SettingsSectionItem(
                    id=section.id,
                    title=_translate_ref(section.title_i18n, section.title),
                    fields=fields,
                )
            )
        return SettingsSchemaItem(sections=sections)
