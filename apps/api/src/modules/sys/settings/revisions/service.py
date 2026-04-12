from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.src.common.protocols.logging import LoggerLike
from apps.api.src.common.protocols.tortoise import SettingUpdatedBy
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.src.models.sys.sys_config_revision import SysConfigRevision
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.modules.sys.settings.crypto.service import SysConfigCryptoMixin
from apps.api.src.modules.sys.settings.namespaces.service import SysConfigNamespacesMixin
from apps.api.src.modules.sys.settings.repository import SysConfigRepository
from apps.api.src.modules.sys.settings.schema import SysConfigRevisionDetail, SysConfigRevisionOut
from apps.api.src.modules.sys.settings.schemahelpers.service import (
    _canonical_json_bytes,
    _ts,
)
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.runtime import invalidate_core_settings_cache
from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.src.settings.signing import ensure_signing_keypair, sign_detached
from apps.api.src.settings.validation import merge_deep, validate_config_schema


class _SysConfigActivationLike(Protocol):
    async def _assert_revision_can_activate(
        self,
        *,
        namespace: str,
        schema: object,
        revision_value: dict[str, object],
        revision_id: UUID,
    ) -> None: ...


class SysConfigRevisionsMixin(SysConfigNamespacesMixin, SysConfigCryptoMixin):
    repo: SysConfigRepository
    settings: Settings
    logger: LoggerLike

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
        patch: dict[str, object],
        updated_by: UUID | None,
        activate: bool = True,
    ):
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

        merged: dict[str, object] = dict(merged_visible or {})

        signature: str | None = None
        signing_fp: str | None = None
        try:
            priv, _pub, signing_fp = ensure_signing_keypair(
                private_path=self.settings.security.signing_private_key_path,
                public_path=self.settings.security.signing_public_key_path,
            )
            signature = sign_detached(
                b"sys-config:" + namespace.encode("utf-8") + b":" + _canonical_json_bytes(merged_visible),
                private_key=priv,
            )
        except Exception as exc:
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
            await cast(_SysConfigActivationLike, self)._assert_revision_can_activate(
                namespace=namespace,
                schema=schema,
                revision_value=merged,
                revision_id=rev.id,
            )
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
