from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import SettingUpdatedBy
from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.src.modules.sys.settings.checks.service import SysConfigChecksMixin
from apps.api.src.modules.sys.settings.crypto.service import SysConfigCryptoMixin
from apps.api.src.modules.sys.settings.namespaces.service import SysConfigNamespacesMixin
from apps.api.src.modules.sys.settings.repository import SysConfigRepository
from apps.api.src.modules.sys.settings.schema import SysConfigDetail, SysConfigTestResult
from apps.api.src.modules.sys.settings.schemahelpers.service import _ts
from apps.api.src.modules.system.models.setting import SettingRecord
from apps.api.src.plugin.manifest import ConfigSchema
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.runtime import invalidate_core_settings_cache
from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.src.settings.validation import validate_config_schema


class SysConfigActivationMixin(SysConfigNamespacesMixin, SysConfigCryptoMixin, SysConfigChecksMixin):
    repo: SysConfigRepository
    settings: Settings

    async def _assert_revision_can_activate(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        revision_value: dict[str, object],
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
