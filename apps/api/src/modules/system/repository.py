from __future__ import annotations

from src.core.repository.implementations.tortoise import TortoiseORMRepository


class SystemRepository(TortoiseORMRepository):
    """
    System repository.

    System module is orchestration-heavy. Storage access is delegated to subdomain repositories.
    """
