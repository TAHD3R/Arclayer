"""Shared Arclayer project-hook runtime."""

from .runtime import Platform
from .stdio import dispatch_from_stdio

__all__ = ["Platform", "dispatch_from_stdio"]
