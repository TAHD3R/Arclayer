from __future__ import annotations

from apps.api.src.common.repositories.base import BaseRepository


class SysRepository(BaseRepository):
    """
    Sys repository.

    Sys module is governance-focused. Storage access is delegated to subdomain repositories.
    """
