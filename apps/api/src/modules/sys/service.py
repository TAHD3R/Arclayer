from __future__ import annotations

from src.common.services import BaseService
from src.config import Settings


class SysService(BaseService):
    """
    Sys service.

    Sys module is a thin orchestrator. Most business logic lives in subdomain services.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
