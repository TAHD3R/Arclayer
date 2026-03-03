from __future__ import annotations

from apps.api.src.core.repositories import BaseRepository


class SystemRepository(BaseRepository):
    """
    System repository.

    System module is orchestration-heavy. Storage access is delegated to subdomain repositories.
    """
