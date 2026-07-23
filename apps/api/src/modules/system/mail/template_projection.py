from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from typing import cast

from pydantic import ConfigDict

from src.common.email.template_renderer import (
    EmailTemplateSourceError,
    validate_email_html_template,
    validate_email_template_source,
)
from src.common.schemas import BaseSchema
from src.core.i18n import DEFAULT_LOCALE
from src.models.system.email_template import EmailTemplateRecord
from src.modules.system.mail.schema import (
    MailTemplateCategory,
    MailTemplateGroupOut,
    MailTemplateHealth,
    MailTemplateLocaleOut,
    MailTemplateOwner,
    MailTemplateSourceState,
)
from src.modules.system.mail.template_defaults import DEFAULT_EMAIL_TEMPLATES, DefaultEmailTemplate


class TemplateCatalogEntry(BaseSchema):
    model_config = ConfigDict(frozen=True)

    category: MailTemplateCategory
    is_required: bool


_TEMPLATE_CATALOG: dict[str, TemplateCatalogEntry] = {
    "reset_password": TemplateCatalogEntry(category="security", is_required=True),
    "welcome": TemplateCatalogEntry(category="account", is_required=False),
    "email_change_code": TemplateCatalogEntry(category="security", is_required=True),
    "registration_verification": TemplateCatalogEntry(category="account", is_required=True),
    "login_code": TemplateCatalogEntry(category="security", is_required=True),
    "security_alert": TemplateCatalogEntry(category="security", is_required=True),
    "invitation": TemplateCatalogEntry(category="invitation", is_required=True),
    "workspace_invitation": TemplateCatalogEntry(category="invitation", is_required=True),
    "test": TemplateCatalogEntry(category="operations", is_required=False),
    "notification": TemplateCatalogEntry(category="notification", is_required=False),
}
_DEFAULTS_BY_IDENTITY = {(item.key, item.locale): item for item in DEFAULT_EMAIL_TEMPLATES}


def get_default_email_template(key: str, locale: str) -> DefaultEmailTemplate | None:
    return _DEFAULTS_BY_IDENTITY.get((key, locale))


def is_builtin_template_key(key: str) -> bool:
    return key in _TEMPLATE_CATALOG


def is_required_template_key(key: str) -> bool:
    catalog = _TEMPLATE_CATALOG.get(key)
    return bool(catalog and catalog.is_required)


def _variables(record: EmailTemplateRecord) -> list[str]:
    values = record.variables if isinstance(record.variables, list) else []
    return [str(value) for value in values]


def _is_valid(record: EmailTemplateRecord) -> bool:
    try:
        validate_email_template_source(record.subject_template)
        validate_email_html_template(record.html_template)
        validate_email_template_source(record.text_template)
    except EmailTemplateSourceError:
        return False
    return bool(record.name.strip())


def _matches_default(record: EmailTemplateRecord, default: DefaultEmailTemplate) -> bool:
    return (
        record.name == default.name
        and record.subject_template == default.subject
        and record.html_template == default.html
        and record.text_template == default.text
        and _variables(record) == list(default.variables)
        and record.is_enabled
    )


def _source_state(record: EmailTemplateRecord) -> MailTemplateSourceState:
    default = get_default_email_template(record.key, record.locale)
    if default is None:
        return "custom"
    return "default" if _matches_default(record, default) else "overridden"


def _subject_preview(subject: str) -> str:
    return " ".join(subject.split())[:160]


def _group_health(locales: list[MailTemplateLocaleOut]) -> MailTemplateHealth:
    if any(locale.validation_state == "invalid" for locale in locales):
        return "invalid"
    enabled_count = sum(locale.is_enabled for locale in locales)
    if enabled_count == 0:
        return "disabled"
    if enabled_count < len(locales):
        return "partial"
    return "healthy"


def _display_record(records: list[EmailTemplateRecord], display_locale: str) -> EmailTemplateRecord:
    priorities = (display_locale, DEFAULT_LOCALE, "en-US")
    for locale in priorities:
        match = next((record for record in records if record.locale == locale), None)
        if match is not None:
            return match
    return records[0]


def _build_group(records: list[EmailTemplateRecord], display_locale: str) -> MailTemplateGroupOut:
    records.sort(key=lambda record: record.locale)
    key = records[0].key
    catalog = _TEMPLATE_CATALOG.get(key)
    display = _display_record(records, display_locale)
    locales = [
        MailTemplateLocaleOut(
            id=record.id,
            locale=record.locale,
            is_enabled=record.is_enabled,
            version=record.version,
            updated_at=record.updated_at,
            validation_state="valid" if _is_valid(record) else "invalid",
            subject_preview=_subject_preview(record.subject_template),
            source_state=_source_state(record),
        )
        for record in records
    ]
    owner = cast(MailTemplateOwner, "builtin" if catalog else "custom")
    category = catalog.category if catalog else cast(MailTemplateCategory, "custom")
    return MailTemplateGroupOut(
        key=key,
        name=display.name,
        description=display.description,
        category=category,
        owner=owner,
        is_required=catalog.is_required if catalog else False,
        locales=locales,
        fallback_locale=DEFAULT_LOCALE,
        health=_group_health(locales),
        latest_version=max(locale.version for locale in locales),
        updated_at=max(locale.updated_at for locale in locales),
    )


def build_template_groups(
    records: Iterable[EmailTemplateRecord],
    *,
    display_locale: str,
) -> list[MailTemplateGroupOut]:
    grouped: dict[str, list[EmailTemplateRecord]] = defaultdict(list)
    for record in records:
        grouped[record.key].append(record)
    return [_build_group(group_records, display_locale) for group_records in grouped.values()]


def _matches_search(group: MailTemplateGroupOut, query: str) -> bool:
    haystack = [group.key, group.name, group.description or ""]
    haystack.extend(locale.subject_preview for locale in group.locales)
    return query in " ".join(haystack).casefold()


def filter_template_groups(
    groups: Iterable[MailTemplateGroupOut],
    *,
    q: str | None,
    category: MailTemplateCategory | None,
    owner: MailTemplateOwner | None,
    locale: str | None,
    enabled: bool | None,
    validation_state: str | None,
    source_state: MailTemplateSourceState | None,
) -> list[MailTemplateGroupOut]:
    query = (q or "").strip().casefold()
    filtered: list[MailTemplateGroupOut] = []
    for group in groups:
        if query and not _matches_search(group, query):
            continue
        if category and group.category != category:
            continue
        if owner and group.owner != owner:
            continue
        if locale and all(item.locale != locale for item in group.locales):
            continue
        if enabled is not None and not any(item.is_enabled is enabled for item in group.locales):
            continue
        if validation_state and all(item.validation_state != validation_state for item in group.locales):
            continue
        if source_state and all(item.source_state != source_state for item in group.locales):
            continue
        filtered.append(group)
    return filtered


def sort_template_groups(
    groups: Iterable[MailTemplateGroupOut],
    ordering: str | None,
) -> list[MailTemplateGroupOut]:
    ordered = list(groups)
    accessors = {
        "key": lambda group: group.key.casefold(),
        "name": lambda group: group.name.casefold(),
        "category": lambda group: group.category,
        "health": lambda group: group.health,
        "version": lambda group: group.latest_version,
        "updated_at": lambda group: group.updated_at,
    }
    fields = [part.strip() for part in str(ordering or "key").split(",") if part.strip()]
    valid_fields = [field for field in fields if field.lstrip("-") in accessors]
    for field in reversed(valid_fields or ["key"]):
        descending = field.startswith("-")
        accessor = accessors[field.lstrip("-")]
        ordered.sort(key=accessor, reverse=descending)
    return ordered
