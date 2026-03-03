from __future__ import annotations

from typing import Protocol


class LoggerLike(Protocol):
    """
    Minimal logger protocol for structlog-style bound loggers.

    We intentionally avoid importing structlog types here to keep this protocol lightweight and
    available across the codebase (including shared mixins) without creating import cycles.
    """

    def debug(self, event: str, **kwargs: object) -> object: ...

    def info(self, event: str, **kwargs: object) -> object: ...

    def warning(self, event: str, **kwargs: object) -> object: ...

    def error(self, event: str, **kwargs: object) -> object: ...

    def exception(self, event: str, **kwargs: object) -> object: ...
