from __future__ import annotations

from apps.api.plugin.manifest import ConfigSchema
from apps.api.settings.core_schema import CORE_SETTINGS_SCHEMA


def _subset_schema(*, schema: ConfigSchema, section_ids: set[str]) -> ConfigSchema:
    """
    Build a schema subset by section ids.

    Notes:
    - Sys governance should only expose system-scoped sections (e.g. mail/storage).
    - Keep order stable as in the source schema.
    """

    wanted = {str(s).strip() for s in section_ids if str(s).strip()}
    sections = [s for s in (schema.sections or []) if str(getattr(s, "id", "") or "").strip() in wanted]
    return ConfigSchema(sections=sections)


# Sys governance "core" namespace schema:
# keep it intentionally narrow to avoid accidental cross-tenant style changes.
SYS_CORE_SETTINGS_SCHEMA = _subset_schema(schema=CORE_SETTINGS_SCHEMA, section_ids={"mail", "storage"})
