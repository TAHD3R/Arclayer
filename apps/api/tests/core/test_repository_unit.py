"""Unit tests for the Repository abstraction layer."""

from __future__ import annotations

import pytest

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
