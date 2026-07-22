from __future__ import annotations

from typing import Protocol, runtime_checkable

from src.core.events import Event


@runtime_checkable
class AnalyticsConnector(Protocol):
    @property
    def enabled(self) -> bool: ...

    async def capture_event(self, event: Event) -> None: ...

    async def close(self) -> None: ...
