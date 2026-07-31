from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.operational_signals.service import OperationalSignalService


def get_operational_signal_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OperationalSignalService:
    return OperationalSignalService(settings=settings)
