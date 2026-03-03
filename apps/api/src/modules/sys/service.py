from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.core.services import BaseService


class SysService(BaseService):
    """
    Sys service.

    Sys module is a thin orchestrator. Most business logic lives in subdomain services.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
