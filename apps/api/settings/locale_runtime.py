from __future__ import annotations

from typing import Literal
from uuid import UUID

from apps.api.modules.system.models.setting import SettingRecord
from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SCOPE_TYPE_WORKSPACE, SYSTEM_SCOPE_ID


async def read_core_default_locale(*, scope_type: Literal["system", "workspace"], scope_id: UUID | None) -> str | None:
    if scope_type == "workspace":
        if scope_id is None:
            return None
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=scope_id,
            namespace="core",
        )
    else:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace="core",
        )

    value = record.value if record and isinstance(record.value, dict) else {}
    section = value.get("workspace_localization") if isinstance(value, dict) else None
    locale = section.get("locale") if isinstance(section, dict) else None
    return locale if isinstance(locale, str) and locale else None
