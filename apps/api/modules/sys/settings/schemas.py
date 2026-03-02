from __future__ import annotations

from apps.api.plugin.manifest import ConfigSchema
from apps.api.settings.core_schema import CORE_SETTINGS_SCHEMA

SYS_NAMESPACE_STORAGE = "storage"
SYS_NAMESPACE_MAIL = "mail"

# Legacy sys namespace (kept for backward compatibility with early sys-config builds).
SYS_NAMESPACE_CORE_LEGACY = "core"


def _subset_schema(*, schema: ConfigSchema, section_ids: set[str]) -> ConfigSchema:
    """
    Build a schema subset by section ids.

    Notes:
    - Sys governance should only expose system-scoped sections (e.g. mail/storage).
    - Keep order stable as in the source schema.
    """

    wanted = {str(s).strip() for s in section_ids if str(s).strip()}
    sections = [
        s.model_copy(deep=True) for s in (schema.sections or []) if str(getattr(s, "id", "") or "").strip() in wanted
    ]
    return ConfigSchema(sections=list(sections))


SYS_STORAGE_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"storage"})
SYS_MAIL_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"mail"})

# Legacy sys governance "core" namespace schema:
# keep it intentionally narrow to avoid accidental cross-tenant style changes.
SYS_CORE_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"mail", "storage"})
