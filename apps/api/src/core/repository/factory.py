from __future__ import annotations

from src.core.repository.base import AbstractRepository
from src.core.repository.implementations.tortoise import TortoiseORMRepository


class RepositoryFactory:
    """Factory that returns Repository instances for a given model.

    Usage:
        factory = RepositoryFactory()
        repo = factory.for_model(ContentItemRecord)
        item = await repo.find_one(id=some_uuid)
    """

    def __init__(self, *, implementation: str = "tortoise") -> None:
        self._implementation = implementation
        self._cache: dict[str, AbstractRepository] = {}

    def for_model(self, model_cls: type) -> AbstractRepository:
        model_name = getattr(model_cls, "__name__", str(model_cls))
        if model_name not in self._cache:
            self._cache[model_name] = self._build(model_cls)
        return self._cache[model_name]

    def _build(self, model_cls: type) -> AbstractRepository:
        if self._implementation == "tortoise":
            return TortoiseORMRepository(model_cls)
        raise ValueError(f"Unknown repository implementation: {self._implementation}")

    def clear(self) -> None:
        self._cache.clear()
