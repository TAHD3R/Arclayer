"""Unit tests for the Repository abstraction layer."""

from __future__ import annotations

from typing import Any, cast

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.base import AbstractRepository
from src.core.repository.factory import RepositoryFactory
from src.core.repository.implementations.tortoise import TortoiseORMRepository


class TestAbstractRepository:
    def test_abstract_repository_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            AbstractRepository()  # type: ignore[abstract]

    def test_abstract_repository_defines_interface(self):
        methods = {"find_one", "find_many", "create", "update", "delete", "count"}
        for method_name in methods:
            assert hasattr(AbstractRepository, method_name)


class TestTortoiseORMRepository:
    def test_constructor_stores_model_class(self):
        class FakeModel:
            pass

        repo = TortoiseORMRepository(FakeModel)
        assert repo._model is FakeModel

    def test_using_db_kwargs_returns_empty_mapping_without_connection(self):
        repo = TortoiseORMRepository()

        assert repo._using_db_kwargs(None) == {}

    def test_using_db_kwargs_returns_connection_mapping(self):
        conn = cast(BaseDBAsyncClient, object())
        repo = TortoiseORMRepository()

        assert repo._using_db_kwargs(conn) == {"using_db": conn}

    def test_using_db_applies_connection_to_query(self):
        conn = cast(BaseDBAsyncClient, object())

        class FakeQuery:
            def __init__(self) -> None:
                self.received_conn: BaseDBAsyncClient | None = None

            def using_db(self, received_conn: BaseDBAsyncClient) -> FakeQuery:
                self.received_conn = received_conn
                return self

        query = FakeQuery()
        repo = TortoiseORMRepository()

        out = repo.using_db(query, conn)

        assert out is query
        assert query.received_conn is conn

    @pytest.mark.asyncio
    async def test_create_record_passes_connection_to_model_create(self):
        conn = cast(BaseDBAsyncClient, object())

        class FakeModel:
            create_kwargs: dict[str, Any] | None = None

            @classmethod
            async def create(cls, **kwargs: Any) -> str:
                cls.create_kwargs = kwargs
                return "created"

        repo = TortoiseORMRepository()

        out = await repo.create_record(cast(Any, FakeModel), conn=conn, name="Alpha")

        assert out == "created"
        assert FakeModel.create_kwargs == {"using_db": conn, "name": "Alpha"}

    @pytest.mark.asyncio
    async def test_update_fields_saves_only_changed_fields_with_connection(self):
        conn = cast(BaseDBAsyncClient, object())

        class FakeInstance:
            def __init__(self) -> None:
                self.name = "Old"
                self.saved_kwargs: dict[str, Any] | None = None

            async def save(self, **kwargs: Any) -> None:
                self.saved_kwargs = kwargs

        instance = FakeInstance()
        repo = TortoiseORMRepository()

        out = await repo.update_fields(cast(Any, instance), fields={"name": "New"}, conn=conn)

        assert out is instance
        assert instance.name == "New"
        assert instance.saved_kwargs == {"update_fields": ["name"], "using_db": conn}


class TestRepositoryFactory:
    def test_factory_caches_by_model_name(self):
        class ModelA:
            pass

        factory = RepositoryFactory()
        repo1 = factory.for_model(ModelA)
        repo2 = factory.for_model(ModelA)
        assert repo1 is repo2

    def test_factory_different_models_different_repos(self):
        class ModelA:
            pass

        class ModelB:
            pass

        factory = RepositoryFactory()
        repo_a = factory.for_model(ModelA)
        repo_b = factory.for_model(ModelB)
        assert repo_a is not repo_b

    def test_factory_clear_removes_cache(self):
        class ModelA:
            pass

        factory = RepositoryFactory()
        repo1 = factory.for_model(ModelA)
        factory.clear()
        repo2 = factory.for_model(ModelA)
        assert repo1 is not repo2

    def test_factory_unknown_implementation_raises_on_build(self):
        factory = RepositoryFactory(implementation="nonexistent")

        class SomeModel:
            pass

        with pytest.raises(ValueError, match="Unknown repository implementation"):
            factory.for_model(SomeModel)


class TestRepositoryInterface:
    """Contract tests ensuring the interface is consistent."""

    def test_find_one_signature(self):
        import inspect

        sig = inspect.signature(AbstractRepository.find_one)
        params = list(sig.parameters.keys())
        assert "self" in params
        assert "id" in params

    def test_find_many_signature(self):
        import inspect

        sig = inspect.signature(AbstractRepository.find_many)
        params = list(sig.parameters.keys())
        assert "filters" in params
        assert "limit" in params
        assert "offset" in params
        assert "order_by" in params

    def test_create_signature(self):
        import inspect

        sig = inspect.signature(AbstractRepository.create)
        assert "data" in sig.parameters
