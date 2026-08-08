from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from hashlib import sha256
from typing import Protocol, cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.models.system.setting import (
    PlatformLanguageCatalogRevision,
    PlatformLanguageCatalogRevisionStatus,
    PlatformSystemSettingsCommandReceipt,
    SettingRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.platform_system_settings.schema import (
    PlatformLanguageCatalogDraftOut,
    PlatformLanguageCatalogDraftWrite,
    PlatformLanguageCatalogEntryOut,
    PlatformLanguageCatalogImpactOut,
    PlatformLanguageCatalogPublishRequest,
    PlatformRegionalSettingsOut,
    PlatformSiteMetadataSettingsOut,
    PlatformSystemDomainSettingsOut,
    PlatformSystemIdentitySettingsOut,
    PlatformSystemSettingFieldOut,
    PlatformSystemSettingOptionOut,
    PlatformSystemSettingSectionOut,
    PlatformSystemSettingsOut,
    PlatformSystemSettingsSectionWrite,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.runtime import invalidate_core_settings_cache
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

_DEFAULT_RESERVED_LABELS = ("www", "platform", "api")
_DEFAULT_TITLE_FORMAT = "Page title · Site name"
_SYSTEM_SETTINGS_REVISION_KEY = "configuration_revision"
_VERIFIED_LOCALES = ("zh-CN", "en-US")
_SPECIALIZED_CORE_SECTIONS = frozenset({"site", "domains", "workspace_localization", "site_localization", "seo"})


class PlatformSystemSettingsRepository(Protocol):
    async def get_core_value(self) -> JsonObject: ...

    async def write_core_section(
        self,
        *,
        section: str,
        values: JsonObject,
        expected_revision: int,
        idempotency_key_hash: str,
        request_fingerprint: str,
        actor_user_id: UUID,
        settings: Settings,
    ) -> JsonObject: ...

    async def create_language_draft(
        self, *, request: PlatformLanguageCatalogDraftWrite, actor_user_id: UUID, settings: Settings
    ) -> PlatformLanguageCatalogDraftOut: ...

    async def preview_language_draft(self, *, draft_revision: int) -> PlatformLanguageCatalogImpactOut: ...

    async def publish_language_draft(
        self, *, request: PlatformLanguageCatalogPublishRequest, actor_user_id: UUID, settings: Settings
    ) -> JsonObject: ...


class TortoisePlatformSystemSettingsRepository:
    async def get_core_value(self) -> JsonObject:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        raw = record.value if record is not None else None
        return cast(JsonObject, dict(raw)) if isinstance(raw, dict) else {}

    async def write_core_section(
        self,
        *,
        section: str,
        values: JsonObject,
        expected_revision: int,
        idempotency_key_hash: str,
        request_fingerprint: str,
        actor_user_id: UUID,
        settings: Settings,
    ) -> JsonObject:
        from tortoise.transactions import in_transaction

        async with in_transaction() as conn:
            receipt = await (
                PlatformSystemSettingsCommandReceipt
                .filter(idempotency_key_hash=idempotency_key_hash)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if receipt is not None:
                if receipt.request_fingerprint != request_fingerprint:
                    raise Conflict(error="SYSTEM_SETTINGS_IDEMPOTENCY_CONFLICT")
                snapshot = receipt.result_snapshot
                return cast(JsonObject, dict(snapshot)) if isinstance(snapshot, dict) else {}

            record = await (
                SettingRecord
                .filter(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=CORE_SETTINGS_NAMESPACE,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            core = dict(record.value) if record is not None and isinstance(record.value, dict) else {}
            current_revision = _revision(core)
            if current_revision != expected_revision:
                raise Conflict(error="SYSTEM_SETTINGS_REVISION_STALE")
            next_core: JsonObject = dict(core)
            next_core[section] = dict(values)
            metadata = _section(next_core, "system_settings")
            metadata[_SYSTEM_SETTINGS_REVISION_KEY] = current_revision + 1
            next_core["system_settings"] = metadata
            if record is None:
                record = await SettingRecord.create(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=CORE_SETTINGS_NAMESPACE,
                    value=next_core,
                    updated_by=actor_user_id,
                    using_db=conn,
                )
            else:
                record.value = next_core
                record.updated_by = actor_user_id
                await record.save(using_db=conn, update_fields=["value", "updated_by", "updated_at"])
            audit = await write_required_activity_event(
                settings=settings,
                payload=ActivityAuditPayload(
                    event_name=f"platform.system_settings.{section}.updated",
                    actor_user_id=actor_user_id,
                    entity_type="system_settings",
                    entity_id=record.id,
                    properties={
                        "section": section,
                        "revision": current_revision + 1,
                        "idempotency_key": idempotency_key_hash,
                    },
                ),
                conn=conn,
            )
            await PlatformSystemSettingsCommandReceipt.create(
                section=section,
                idempotency_key_hash=idempotency_key_hash,
                request_fingerprint=request_fingerprint,
                actor_user_id=actor_user_id,
                result_revision=current_revision + 1,
                result_snapshot=next_core,
                audit_event_id=audit.id,
                using_db=conn,
            )
        invalidate_core_settings_cache()
        return next_core

    async def create_language_draft(
        self, *, request: PlatformLanguageCatalogDraftWrite, actor_user_id: UUID, settings: Settings
    ) -> PlatformLanguageCatalogDraftOut:
        from tortoise.transactions import in_transaction

        _validate_language_selection(request.enabled_locales, request.default_locale)
        values = {
            "enabled_locales": list(request.enabled_locales),
            "default_locale": request.default_locale,
        }
        fingerprint = _fingerprint(
            actor_user_id,
            "languages:draft",
            cast(JsonObject, values),
            expected_revision=request.expected_revision,
        )
        key_hash = _digest(request.idempotency_key)
        async with in_transaction() as conn:
            receipt = await (
                PlatformSystemSettingsCommandReceipt
                .filter(idempotency_key_hash=key_hash)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if receipt is not None:
                if receipt.section != "languages:draft" or receipt.request_fingerprint != fingerprint:
                    raise Conflict(error="SYSTEM_SETTINGS_IDEMPOTENCY_CONFLICT")
                return PlatformLanguageCatalogDraftOut.model_validate(receipt.result_snapshot)
            core = await _locked_core(conn)
            if _revision(core) != request.expected_revision:
                raise Conflict(error="SYSTEM_SETTINGS_REVISION_STALE")
            latest = await PlatformLanguageCatalogRevision.all().using_db(conn).order_by("-sequence").first()
            sequence = 1 if latest is None else int(latest.sequence) + 1
            active_draft = await (
                PlatformLanguageCatalogRevision
                .filter(status=PlatformLanguageCatalogRevisionStatus.DRAFT)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if active_draft is not None:
                active_draft.status = PlatformLanguageCatalogRevisionStatus.RETIRED
                await active_draft.save(using_db=conn, update_fields=["status", "updated_at"])
            draft = await PlatformLanguageCatalogRevision.create(
                sequence=sequence,
                status=PlatformLanguageCatalogRevisionStatus.DRAFT,
                enabled_locales=list(request.enabled_locales),
                default_locale=request.default_locale,
                actor_user_id=actor_user_id,
                using_db=conn,
            )
            result = PlatformLanguageCatalogDraftOut(
                draft_revision=sequence,
                status="draft",
                enabled_locales=request.enabled_locales,
                default_locale=request.default_locale,
                bundle_ready=True,
            )
            audit = await write_required_activity_event(
                settings=settings,
                payload=ActivityAuditPayload(
                    event_name="platform.system_settings.languages.draft_created",
                    actor_user_id=actor_user_id,
                    entity_type="platform_language_catalog_revision",
                    entity_id=draft.id,
                    properties={"draft_revision": sequence, "idempotency_key": key_hash},
                ),
                conn=conn,
            )
            await PlatformSystemSettingsCommandReceipt.create(
                section="languages:draft",
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                actor_user_id=actor_user_id,
                result_revision=sequence,
                result_snapshot=result.model_dump(mode="json"),
                audit_event_id=audit.id,
                using_db=conn,
            )
        return result

    async def preview_language_draft(self, *, draft_revision: int) -> PlatformLanguageCatalogImpactOut:
        draft = await PlatformLanguageCatalogRevision.get_or_none(sequence=draft_revision)
        if draft is None or draft.status is not PlatformLanguageCatalogRevisionStatus.DRAFT:
            raise NotFound(error="SYSTEM_SETTINGS_LANGUAGE_DRAFT_NOT_FOUND")
        impact = PlatformLanguageCatalogImpactOut(
            draft_revision=draft_revision,
            affected_surfaces=("platform-console", "platform-api", "platform-openapi"),
            requires_product_todo=True,
            ready_to_publish=True,
        )
        draft.impact_snapshot = impact.model_dump(mode="json")
        await draft.save(update_fields=["impact_snapshot", "updated_at"])
        return impact

    async def publish_language_draft(
        self, *, request: PlatformLanguageCatalogPublishRequest, actor_user_id: UUID, settings: Settings
    ) -> JsonObject:
        from tortoise.transactions import in_transaction

        key_hash = _digest(request.idempotency_key)
        fingerprint = _fingerprint(
            actor_user_id,
            "languages:publish",
            cast(JsonObject, {"draft_revision": request.draft_revision}),
            expected_revision=request.expected_revision,
        )
        async with in_transaction() as conn:
            receipt = await (
                PlatformSystemSettingsCommandReceipt
                .filter(idempotency_key_hash=key_hash)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if receipt is not None:
                if receipt.section != "languages:publish" or receipt.request_fingerprint != fingerprint:
                    raise Conflict(error="SYSTEM_SETTINGS_IDEMPOTENCY_CONFLICT")
                snapshot = receipt.result_snapshot
                return cast(JsonObject, dict(snapshot)) if isinstance(snapshot, dict) else {}
            draft = await (
                PlatformLanguageCatalogRevision
                .filter(sequence=request.draft_revision)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if draft is None or draft.status is not PlatformLanguageCatalogRevisionStatus.DRAFT:
                raise NotFound(error="SYSTEM_SETTINGS_LANGUAGE_DRAFT_NOT_FOUND")
            if not isinstance(draft.impact_snapshot, dict) or not draft.impact_snapshot.get("ready_to_publish"):
                raise Conflict(error="SYSTEM_SETTINGS_LANGUAGE_IMPACT_REQUIRED")
            core = await _locked_core(conn)
            current_revision = _revision(core)
            if current_revision != request.expected_revision:
                raise Conflict(error="SYSTEM_SETTINGS_REVISION_STALE")
            enabled = [str(locale) for locale in draft.enabled_locales]
            localization = _section(core, "site_localization")
            localization.update({
                "supported_locales": enabled,
                "default_locale": draft.default_locale,
                "locale": draft.default_locale,
            })
            next_core: JsonObject = dict(core)
            next_core["site_localization"] = localization
            metadata = _section(next_core, "system_settings")
            metadata[_SYSTEM_SETTINGS_REVISION_KEY] = current_revision + 1
            next_core["system_settings"] = metadata
            record = (
                await SettingRecord
                .filter(
                    scope_type=SCOPE_TYPE_SYSTEM,
                    scope_id=SYSTEM_SCOPE_ID,
                    namespace=CORE_SETTINGS_NAMESPACE,
                )
                .using_db(conn)
                .first()
            )
            if record is None:
                raise NotFound(error="SYSTEM_SETTINGS_CORE_RECORD_NOT_FOUND")
            record.value = next_core
            record.updated_by = actor_user_id
            await record.save(using_db=conn, update_fields=["value", "updated_by", "updated_at"])
            await (
                PlatformLanguageCatalogRevision
                .filter(status=PlatformLanguageCatalogRevisionStatus.PUBLISHED)
                .using_db(conn)
                .update(status=PlatformLanguageCatalogRevisionStatus.RETIRED)
            )
            draft.status = PlatformLanguageCatalogRevisionStatus.PUBLISHED
            draft.published_at = datetime.now(UTC)
            await draft.save(using_db=conn, update_fields=["status", "published_at", "updated_at"])
            audit = await write_required_activity_event(
                settings=settings,
                payload=ActivityAuditPayload(
                    event_name="platform.system_settings.languages.published",
                    actor_user_id=actor_user_id,
                    entity_type="platform_language_catalog_revision",
                    entity_id=draft.id,
                    properties={
                        "draft_revision": request.draft_revision,
                        "revision": current_revision + 1,
                        "idempotency_key": key_hash,
                    },
                ),
                conn=conn,
            )
            await PlatformSystemSettingsCommandReceipt.create(
                section="languages:publish",
                idempotency_key_hash=key_hash,
                request_fingerprint=fingerprint,
                actor_user_id=actor_user_id,
                result_revision=current_revision + 1,
                result_snapshot=next_core,
                audit_event_id=audit.id,
                using_db=conn,
            )
        invalidate_core_settings_cache()
        return next_core


class PlatformSystemSettingsService:
    def __init__(self, *, settings: Settings, repository: PlatformSystemSettingsRepository) -> None:
        self._settings = settings
        self._repository = repository

    async def get_settings(self) -> PlatformSystemSettingsOut:
        return self._project(await self._repository.get_core_value())

    def _project(self, core: JsonObject) -> PlatformSystemSettingsOut:
        site = self._section(core, "site")
        domains = self._section(core, "domains")
        localization = self._section(core, "workspace_localization")
        site_localization = self._section(core, "site_localization")
        seo = self._section(core, "seo")

        primary_domain = self._string(domains.get("base_domain")) or self._settings.saas.base_domain
        console_subdomain = self._string(domains.get("platform_subdomain")) or "platform"
        default_locale = self._string(site_localization.get("default_locale")) or "zh-CN"
        enabled_locales = self._string_tuple(site_localization.get("supported_locales")) or ("zh-CN", "en-US")

        return PlatformSystemSettingsOut(
            revision=self._revision(core),
            identity=PlatformSystemIdentitySettingsOut(
                instance_name=self._string(site.get("name")) or "Arclayer",
                description=self._optional_string(site.get("description")),
                contact_email=self._optional_string(site.get("contact_email")),
                logo_url=self._optional_string(site.get("logo_url")),
                favicon_url=self._optional_string(site.get("favicon_url")),
            ),
            domains=PlatformSystemDomainSettingsOut(
                primary_domain=primary_domain,
                console_domain=f"{console_subdomain}.{primary_domain}",
                reserved_labels=self._string_tuple(domains.get("reserved_labels")) or _DEFAULT_RESERVED_LABELS,
            ),
            languages=self._language_catalog(enabled_locales=enabled_locales, default_locale=default_locale),
            regional=PlatformRegionalSettingsOut(
                timezone=self._string(localization.get("timezone")) or "Asia/Shanghai",
                date_format=self._string(localization.get("date_format")) or "YYYY-MM-DD",
                number_format=self._string(localization.get("number_format")) or "1,234.56",
            ),
            site_metadata=PlatformSiteMetadataSettingsOut(
                default_title=self._optional_string(seo.get("default_title")),
                title_format=self._title_format(seo.get("title_policy_v1")),
                default_description=self._optional_string(seo.get("default_description")),
            ),
            sections=self._project_sections(core),
        )

    @classmethod
    def _project_sections(cls, core: JsonObject) -> tuple[PlatformSystemSettingSectionOut, ...]:
        projected: list[PlatformSystemSettingSectionOut] = []
        for section in CORE_SETTINGS_SCHEMA.sections:
            values = cls._section(core, section.id)
            visible_values: JsonObject = {}
            secret_keys: list[str] = []
            fields: list[PlatformSystemSettingFieldOut] = []
            for field in section.fields:
                fields.append(
                    PlatformSystemSettingFieldOut(
                        key=field.key,
                        type=field.type,
                        label=field.label or field.key,
                        description=field.description,
                        secret=field.secret,
                        options=tuple(
                            PlatformSystemSettingOptionOut(value=option.value, label=option.label)
                            for option in field.options
                        ),
                    )
                )
                if field.secret:
                    secret_keys.append(field.key)
                elif field.key in values:
                    visible_values[field.key] = values[field.key]
                elif field.default is not None:
                    visible_values[field.key] = field.default
            projected.append(
                PlatformSystemSettingSectionOut(
                    id=section.id,
                    title=section.title,
                    fields=tuple(fields),
                    values=visible_values,
                    secret_keys=tuple(secret_keys),
                    editable=section.id not in _SPECIALIZED_CORE_SECTIONS,
                )
            )
        return tuple(projected)

    async def update_section(
        self,
        *,
        section: str,
        values: JsonObject,
        expected_revision: int,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> PlatformSystemSettingsOut:
        if section not in {"site", "domains", "workspace_localization", "seo"}:
            raise Conflict(error="SYSTEM_SETTINGS_SECTION_UNSUPPORTED")
        fingerprint = _fingerprint(actor_user_id, section, values, expected_revision=expected_revision)
        return self._project(
            await self._repository.write_core_section(
                section=section,
                values=values,
                expected_revision=expected_revision,
                idempotency_key_hash=_digest(idempotency_key),
                request_fingerprint=fingerprint,
                actor_user_id=actor_user_id,
                settings=self._settings,
            )
        )

    async def update_generic_section(
        self,
        *,
        section: str,
        request: PlatformSystemSettingsSectionWrite,
        actor_user_id: UUID,
    ) -> PlatformSystemSettingsOut:
        definition = _section_definition(section)
        values = self._validate_generic_values(definition=definition, values=request.values)
        current = self._section(await self._repository.get_core_value(), section)
        merged = dict(current)
        merged.update(values)
        fingerprint = _fingerprint(actor_user_id, section, merged, expected_revision=request.expected_revision)
        return self._project(
            await self._repository.write_core_section(
                section=section,
                values=merged,
                expected_revision=request.expected_revision,
                idempotency_key_hash=_digest(request.idempotency_key),
                request_fingerprint=fingerprint,
                actor_user_id=actor_user_id,
                settings=self._settings,
            )
        )

    @staticmethod
    def _validate_generic_values(*, definition, values: JsonObject) -> JsonObject:
        fields = {field.key: field for field in definition.fields}
        unknown = set(values) - set(fields)
        if unknown:
            raise Conflict(error="SYSTEM_SETTINGS_FIELD_UNSUPPORTED", meta={"fields": sorted(unknown)})
        for key, value in values.items():
            field = fields[key]
            if field.secret:
                raise Conflict(error="SYSTEM_SETTINGS_SECRET_FIELD_UNSUPPORTED", meta={"field": key})
            if not _matches_config_type(value, field.type):
                raise Conflict(error="SYSTEM_SETTINGS_FIELD_INVALID", meta={"field": key, "type": field.type})
            if field.options and value not in [option.value for option in field.options]:
                raise Conflict(error="SYSTEM_SETTINGS_FIELD_OPTION_INVALID", meta={"field": key})
        return dict(values)

    async def create_language_draft(
        self, request: PlatformLanguageCatalogDraftWrite, *, actor_user_id: UUID
    ) -> PlatformLanguageCatalogDraftOut:
        return await self._repository.create_language_draft(
            request=request, actor_user_id=actor_user_id, settings=self._settings
        )

    async def preview_language_draft(self, draft_revision: int) -> PlatformLanguageCatalogImpactOut:
        return await self._repository.preview_language_draft(draft_revision=draft_revision)

    async def publish_language_draft(
        self, request: PlatformLanguageCatalogPublishRequest, *, actor_user_id: UUID
    ) -> PlatformSystemSettingsOut:
        return self._project(
            await self._repository.publish_language_draft(
                request=request, actor_user_id=actor_user_id, settings=self._settings
            )
        )

    @staticmethod
    def _language_catalog(
        *, enabled_locales: tuple[str, ...], default_locale: str
    ) -> tuple[PlatformLanguageCatalogEntryOut, ...]:
        enabled = set(enabled_locales)
        return (
            PlatformLanguageCatalogEntryOut(
                locale="zh-CN",
                language_name="Simplified Chinese",
                native_name="简体中文",
                flag_code="cn",
                enabled="zh-CN" in enabled,
                is_default=default_locale == "zh-CN",
                sort_order=0,
                bundle_ready=True,
            ),
            PlatformLanguageCatalogEntryOut(
                locale="en-US",
                language_name="English (United States)",
                native_name="English",
                flag_code="us",
                enabled="en-US" in enabled,
                is_default=default_locale == "en-US",
                sort_order=1,
                bundle_ready=True,
            ),
        )

    @classmethod
    def _revision(cls, core: Mapping[str, object]) -> int:
        metadata = cls._section(core, "system_settings")
        value = metadata.get(_SYSTEM_SETTINGS_REVISION_KEY)
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 1 else 1

    @staticmethod
    def _section(core: Mapping[str, object], key: str) -> JsonObject:
        value = core.get(key)
        return cast(JsonObject, dict(value)) if isinstance(value, dict) else {}

    @staticmethod
    def _string(value: object) -> str:
        return value.strip() if isinstance(value, str) else ""

    @classmethod
    def _optional_string(cls, value: object) -> str | None:
        normalized = cls._string(value)
        return normalized or None

    @classmethod
    def _string_tuple(cls, value: object) -> tuple[str, ...]:
        if not isinstance(value, list | tuple):
            return ()
        return tuple(normalized for item in value if (normalized := cls._string(item)))

    @classmethod
    def _title_format(cls, value: object) -> str:
        if isinstance(value, str):
            return value.strip() or _DEFAULT_TITLE_FORMAT
        if not isinstance(value, dict):
            return _DEFAULT_TITLE_FORMAT
        policy = cast(Mapping[str, object], value)
        parts = policy.get("parts")
        if not isinstance(parts, list):
            return _DEFAULT_TITLE_FORMAT
        rendered: list[str] = []
        tokens = {"pageTitle": "Page title", "siteName": "Site name"}
        for part in parts:
            if not isinstance(part, dict):
                return _DEFAULT_TITLE_FORMAT
            part_map = cast(Mapping[str, object], part)
            kind = part_map.get("kind")
            raw = part_map.get("value")
            if not isinstance(raw, str):
                return _DEFAULT_TITLE_FORMAT
            rendered.append(tokens.get(raw, raw) if kind == "token" else raw)
        return "".join(rendered) or _DEFAULT_TITLE_FORMAT


def _section(core: Mapping[str, object], key: str) -> JsonObject:
    value = core.get(key)
    return cast(JsonObject, dict(value)) if isinstance(value, dict) else {}


def _section_definition(section: str):
    if section in _SPECIALIZED_CORE_SECTIONS:
        raise Conflict(error="SYSTEM_SETTINGS_SECTION_USE_SPECIALIZED_ROUTE")
    for definition in CORE_SETTINGS_SCHEMA.sections:
        if definition.id == section:
            return definition
    raise NotFound(error="SYSTEM_SETTINGS_SECTION_NOT_FOUND")


def _matches_config_type(value: object, field_type: str) -> bool:
    if field_type == "str":
        return isinstance(value, str)
    if field_type == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if field_type == "bool":
        return isinstance(value, bool)
    if field_type == "list":
        return isinstance(value, list)
    if field_type == "dict":
        return isinstance(value, dict)
    return True


def _revision(core: Mapping[str, object]) -> int:
    metadata = _section(core, "system_settings")
    value = metadata.get(_SYSTEM_SETTINGS_REVISION_KEY)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 1 else 1


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def _fingerprint(actor_user_id: UUID, section: str, values: JsonObject, *, expected_revision: int) -> str:
    return _digest(f"{actor_user_id}:{section}:{expected_revision}:{values!r}")


async def _locked_core(conn) -> JsonObject:
    record = await (
        SettingRecord
        .filter(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        .using_db(conn)
        .select_for_update()
        .first()
    )
    return dict(record.value) if record is not None and isinstance(record.value, dict) else {}


def _validate_language_selection(enabled_locales: tuple[str, ...], default_locale: str) -> None:
    normalized = tuple(dict.fromkeys(locale.strip() for locale in enabled_locales if locale.strip()))
    if normalized != enabled_locales:
        raise Conflict(error="SYSTEM_SETTINGS_LANGUAGE_LOCALES_INVALID")
    if any(locale not in _VERIFIED_LOCALES for locale in normalized):
        raise Conflict(error="SYSTEM_SETTINGS_LANGUAGE_LOCALE_NOT_VERIFIED")
    if default_locale not in normalized:
        raise Conflict(error="SYSTEM_SETTINGS_LANGUAGE_DEFAULT_NOT_ENABLED")
