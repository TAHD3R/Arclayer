from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID


class AbstractRepository[T](ABC):
    """Generic repository interface for data access abstraction.

    All persistence access goes through repository implementations,
    never through direct ORM model calls from service layers.
    """

    @abstractmethod
    async def find_one(self, *, id: UUID) -> T | None:
        """Find a single entity by its primary key."""

    @abstractmethod
    async def find_many(
        self,
        *,
        filters: dict | None = None,
        limit: int = 25,
        offset: int = 0,
        order_by: list[str] | None = None,
    ) -> list[T]:
        """Find multiple entities with optional filtering and pagination."""

    @abstractmethod
    async def create(self, *, data: dict) -> T:
        """Create a new entity from the given data dict."""

    @abstractmethod
    async def update(self, *, id: UUID, data: dict) -> T:
        """Update an existing entity with the given data dict."""

    @abstractmethod
    async def delete(self, *, id: UUID) -> bool:
        """Delete an entity by its primary key. Returns True if deleted."""

    @abstractmethod
    async def count(self, *, filters: dict | None = None) -> int:
        """Count entities matching the given filters."""
