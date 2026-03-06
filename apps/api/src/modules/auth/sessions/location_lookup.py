from __future__ import annotations

import ipaddress
from pathlib import Path

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings


class AuthSessionLocationLookup(BaseService):
    def __init__(self, settings: Settings, *, db_path: Path | None = None) -> None:
        super().__init__(settings)
        self.db_path = db_path or Path("static/ip2region.xdb")
        self._warned_unavailable = False

    def lookup(self, *, ip_address: str | None) -> str | None:
        normalized = self._normalize_ip(ip_address)
        if normalized is None:
            return None
        if not self.db_path.exists():
            self._warn_unavailable(normalized)
            return None
        self._warn_unavailable(normalized)
        return None

    def _normalize_ip(self, ip_address: str | None) -> str | None:
        raw = (ip_address or "").strip()
        if not raw:
            return None
        try:
            parsed = ipaddress.ip_address(raw)
        except ValueError:
            return None
        if parsed.is_private or parsed.is_loopback or parsed.is_multicast or parsed.is_reserved:
            return None
        return raw

    def _warn_unavailable(self, ip_address: str) -> None:
        if self._warned_unavailable:
            return
        self._warned_unavailable = True
        self.logger.warning(
            "ip2region lookup unavailable; returning null location label",
            ip_address=ip_address,
            db_path=str(self.db_path),
        )
