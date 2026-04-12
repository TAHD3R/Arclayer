from __future__ import annotations

from typing import cast
from uuid import UUID

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from src.common.protocols.logging import LoggerLike
from src.config import Settings
from src.models.system.setting import SettingRecord
from src.modules.sys.settings.namespaces.schema import (
    SYS_NAMESPACE_AUTH,
    SYS_NAMESPACE_CORE_LEGACY,
    SYS_NAMESPACE_MAIL,
    SYS_NAMESPACE_OAUTH,
    SYS_NAMESPACE_STORAGE,
)
from src.modules.sys.settings.repository import SysConfigRepository
from src.modules.sys.settings.schema import SysConfigDetail, SysConfigNamespaceSummary
from src.modules.sys.settings.schemahelpers.service import (
    SysConfigSchemaHelpersMixin,
    _canonical_json_bytes,
    _ts,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.schema import ConfigSchema
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from src.settings.signing import (
    ensure_signing_keypair,
    fingerprint_key_bytes,
    load_public_key,
    sign_detached,
    verify_detached,
)
from src.settings.validation import merge_deep


class SysConfigNamespacesMixin(SysConfigSchemaHelpersMixin):
    repo: SysConfigRepository
    settings: Settings
    logger: LoggerLike

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

    async def _get_legacy_core_value(self) -> dict[str, object]:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        return record.value if record and isinstance(record.value, dict) else {}

    async def _get_active_payload(self, namespace: str) -> dict[str, object] | None:
        _active, rev = await self.repo.get_active(namespace=namespace)
        if rev is None:
            return None
        value = rev.value if isinstance(rev.value, dict) else None
        return value if isinstance(value, dict) else None

    async def _get_effective_core_value(self, *, override: dict[str, object] | None = None) -> dict[str, object]:
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

    async def _get_current_namespace_visible_value(self, *, namespace: str, schema: ConfigSchema) -> dict[str, object]:
        core = await self._get_effective_core_value()
        return self._filter_to_schema_sections(schema=schema, value=core)

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

    async def _bootstrap_from_legacy_if_needed(self, *, namespace: str, schema: ConfigSchema) -> None:
        _active, active_rev = await self.repo.get_active(namespace=namespace)
        if active_rev is not None:
            return

        created_by: UUID | None = None
        legacy_value: dict[str, object] | None = None

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
                private_path=self.settings.security.signing_private_key_path,
                public_path=self.settings.security.signing_public_key_path,
            )
            signature = sign_detached(
                b"sys-config:" + namespace.encode("utf-8") + b":" + _canonical_json_bytes(visible),
                private_key=priv,
            )
        except Exception as exc:
            getattr(self, "logger", None) and self.logger.warning(  # type: ignore[attr-defined]
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

    def _verify_revision_signature(
        self,
        *,
        namespace: str,
        visible_value: dict[str, object],
        signature: str | None,
        signing_key_fingerprint: str | None,
    ) -> tuple[bool | None, str | None]:
        if not signature:
            return None, None

        pub_path = self.settings.security.signing_public_key_path
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
            getattr(self, "logger", None) and self.logger.warning(  # type: ignore[attr-defined]
                "Sys config signature verify failed",
                action="sys_config_verify_revision_signature",
                namespace=namespace,
                error=str(exc),
            )
            return None, "VERIFY_ERROR"


def _assert_service_mro() -> None:
    # Keep module import cheap but ensure this subdomain stays importable.
    cast(type[SysConfigSchemaHelpersMixin], SysConfigNamespacesMixin)
