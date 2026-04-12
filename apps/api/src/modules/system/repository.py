from __future__ import annotations

from src.common.repositories.base import BaseRepository


class SystemRepository(BaseRepository):
    """
    System repository.

    System module is orchestration-heavy. Storage access is delegated to subdomain repositories.
    """
