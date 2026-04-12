from __future__ import annotations

from uuid import UUID

from src.models.system.setting import SettingRecord
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_WORKSPACE


class SiteRuntimeLocalizationMixin:
    @staticmethod
    def _normalize_locale_tag(value: str) -> str | None:
        raw = (value or "").strip()
        if not raw:
            return None
        raw = raw.replace("_", "-")
        parts = [p for p in raw.split("-") if p]
        if not parts:
            return None
        parts[0] = parts[0].lower()
        if len(parts) >= 2 and len(parts[1]) == 2 and parts[1].isalpha():
            parts[1] = parts[1].upper()
        return "-".join(parts)

    @classmethod
    def _uniq_locales(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for v in values:
            norm = cls._normalize_locale_tag(v)
            if not norm:
                continue
            key = norm.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(norm)
        return out

    async def _read_workspace_site_localization(
        self,
        *,
        workspace_id: UUID,
        site: object,
    ) -> tuple[str, str, list[str]]:
        rec = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        value = rec.value if rec is not None and isinstance(rec.value, dict) else {}
        section = value.get("site_localization") if isinstance(value, dict) else None
        section_dict = section if isinstance(section, dict) else {}

        default_locale = self._normalize_locale_tag(str(section_dict.get("default_locale") or "")) or None
        if default_locale is None:
            default_locale = self._normalize_locale_tag(str(section_dict.get("locale") or "")) or None
        if default_locale is None:
            default_locale = self._normalize_locale_tag(str(getattr(site, "default_locale", "") or "")) or None
        if default_locale is None:
            default_locale = "zh-CN"

        fallback_locale = self._normalize_locale_tag(str(section_dict.get("fallback_locale") or "")) or None
        if fallback_locale is None:
            fallback_locale = self._normalize_locale_tag(str(getattr(site, "fallback_locale", "") or "")) or None
        if fallback_locale is None:
            fallback_locale = "en-US"

        supported_raw = section_dict.get("supported_locales")
        supported = self._uniq_locales(supported_raw) if isinstance(supported_raw, list) else []

        if default_locale.lower() not in {s.lower() for s in supported}:
            supported.insert(0, default_locale)
        if fallback_locale.lower() not in {s.lower() for s in supported}:
            supported.append(fallback_locale)

        supported = self._uniq_locales(supported)
        return default_locale, fallback_locale, supported

    @staticmethod
    def _coerce_locale_map(raw: object) -> dict[str, str]:
        if not isinstance(raw, dict):
            return {}

        lowered: dict[str, str] = {}
        for k, v in raw.items():
            if not isinstance(k, str) or not isinstance(v, str):
                continue
            kk = k.strip()
            vv = v.strip()
            if not kk or not vv:
                continue
            lowered[kk.lower()] = vv
        return lowered

    @staticmethod
    def _pick_localized_value(values: dict[str, str], tag: str) -> str | None:
        if not tag:
            return None
        v = values.get(tag.lower())
        if not v:
            return None
        s = v.strip()
        return s or None

    @classmethod
    def _resolve_localized_str(
        cls,
        raw: object,
        *,
        locale: str,
        fallback_locale: str,
    ) -> str | None:
        values = cls._coerce_locale_map(raw)
        if not values or not locale:
            return None

        direct = cls._pick_localized_value(values, locale)
        if direct is not None:
            return direct

        fb = cls._pick_localized_value(values, fallback_locale)
        if fb is not None:
            return fb

        for v in values.values():
            s = v.strip()
            if s:
                return s
        return None
