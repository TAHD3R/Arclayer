from __future__ import annotations

import asyncio

import pytest
from tortoise import Model, fields
from tortoise.context import get_current_context

from src.config import Settings
from src.core.database import orm


class OrmLifecycleProbe(Model):
    id = fields.IntField(primary_key=True)


_SQLITE_CONFIG = {
    "connections": {"default": "sqlite://:memory:"},
    "apps": {
        "models": {
            "models": [__name__],
            "default_connection": "default",
        }
    },
    "use_tz": True,
    "timezone": "UTC",
}


def test_model_discovery_excludes_migration_only_enum_modules() -> None:
    modules = orm.discover_model_modules("src.models")

    assert "src.models.agents.conversation" not in modules
    assert "src.models.agents.runtime_v1" in modules


async def test_orm_lifecycle_detaches_initializer_context_when_closed_by_another_task(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATABASE__ENABLED", "1")
    monkeypatch.setattr(orm, "build_tortoise_config", lambda *_args, **_kwargs: _SQLITE_CONFIG)
    settings = Settings()
    initialized = asyncio.get_running_loop().create_future()
    closed = asyncio.Event()

    async def initialize_and_observe_shutdown():
        try:
            await orm.init_orm(settings)
        except BaseException as exc:
            initialized.set_exception(exc)
            return None
        initialized.set_result(get_current_context())
        await closed.wait()
        return get_current_context()

    initializer = asyncio.create_task(initialize_and_observe_shutdown())
    assert await initialized is not None

    await asyncio.create_task(orm.close_orm())
    closed.set()

    assert await initializer is None


async def test_orm_lifecycle_keeps_exact_nested_initialization_until_last_owner_closes(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATABASE__ENABLED", "1")
    monkeypatch.setattr(orm, "build_tortoise_config", lambda *_args, **_kwargs: _SQLITE_CONFIG)
    settings = Settings()

    await orm.init_orm(settings)
    initialized_context = get_current_context()
    await orm.init_orm(settings)

    assert initialized_context is not None
    assert get_current_context() is initialized_context

    await orm.close_orm()

    assert get_current_context() is initialized_context

    await orm.close_orm()

    assert get_current_context() is None


async def test_orm_lifecycle_rejects_nested_initialization_with_different_config(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATABASE__ENABLED", "1")
    active_config = dict(_SQLITE_CONFIG)
    monkeypatch.setattr(orm, "build_tortoise_config", lambda *_args, **_kwargs: active_config)
    settings = Settings()

    await orm.init_orm(settings)
    active_config = {
        **_SQLITE_CONFIG,
        "timezone": "Asia/Shanghai",
    }
    try:
        with pytest.raises(RuntimeError, match="different database configuration"):
            await orm.init_orm(settings)
    finally:
        await orm.close_orm()


async def test_orm_lifecycle_serializes_concurrent_exact_initialization(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATABASE__ENABLED", "1")
    monkeypatch.setattr(orm, "build_tortoise_config", lambda *_args, **_kwargs: _SQLITE_CONFIG)
    settings = Settings()
    original_init = orm.Tortoise.init
    first_init_entered = asyncio.Event()
    release_first_init = asyncio.Event()
    init_call_count = 0

    async def delayed_init(**kwargs):  # type: ignore[no-untyped-def]
        nonlocal init_call_count
        init_call_count += 1
        if init_call_count == 1:
            first_init_entered.set()
            await release_first_init.wait()
        return await original_init(**kwargs)

    monkeypatch.setattr(orm.Tortoise, "init", delayed_init)

    first = asyncio.create_task(orm.init_orm(settings))
    await first_init_entered.wait()
    second = asyncio.create_task(orm.init_orm(settings))
    await asyncio.sleep(0)
    release_first_init.set()

    await asyncio.gather(first, second)
    initialized_context = get_current_context()
    try:
        assert initialized_context is not None
        assert init_call_count == 1

        await orm.close_orm()

        assert get_current_context() is initialized_context
    finally:
        await orm.close_orm()

    assert get_current_context() is None
