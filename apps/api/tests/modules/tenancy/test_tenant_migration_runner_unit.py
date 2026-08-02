from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.modules.tenancy.migrations import TenantMigration, TenantMigrationRunner


class _FakeConnection:
    def __init__(self) -> None:
        self.events: list[str] = []

    async def execute_query(
        self,
        query: str,
        values: list[Any] | None = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        if "pg_advisory_xact_lock" in query:
            self.events.append(f"lock:{values[0] if values else ''}")
            return 0, []
        if query.startswith("CREATE TABLE IF NOT EXISTS"):
            self.events.append("ensure_migration_table")
            return 0, []
        if query.startswith("SELECT version, status"):
            self.events.append("load_applied_versions")
            return 0, []
        self.events.append(query)
        return 0, []


@pytest.mark.asyncio
async def test_tenant_migration_runner_locks_schema_before_creating_schema(monkeypatch) -> None:
    from src.modules.tenancy import migrations

    fake_conn = _FakeConnection()
    conn = cast(BaseDBAsyncClient, fake_conn)

    @asynccontextmanager
    async def fake_in_transaction() -> AsyncIterator[BaseDBAsyncClient]:
        yield conn

    async def fake_create_tenant_schema(schema_name: str, *, conn: BaseDBAsyncClient | None = None) -> None:
        assert conn is fake_conn
        fake_conn.events.append(f"create_schema:{schema_name}")

    monkeypatch.setattr(migrations, "in_transaction", fake_in_transaction)
    monkeypatch.setattr(migrations, "create_tenant_schema", fake_create_tenant_schema)

    version = await TenantMigrationRunner(migrations=()).apply_all("workspace_abcdef1234567890abcd")

    assert version == 0
    assert fake_conn.events == [
        "lock:tenant_schema:workspace_abcdef1234567890abcd",
        "create_schema:workspace_abcdef1234567890abcd",
        "ensure_migration_table",
        "load_applied_versions",
    ]


@pytest.mark.asyncio
async def test_tenant_migration_runner_reuses_supplied_connection_without_opening_transaction(monkeypatch) -> None:
    from src.modules.tenancy import migrations

    fake_conn = _FakeConnection()
    conn = cast(BaseDBAsyncClient, fake_conn)

    @asynccontextmanager
    async def unexpected_in_transaction() -> AsyncIterator[BaseDBAsyncClient]:
        raise AssertionError("supplied tenant migration connection must be reused")
        yield conn

    async def fake_create_tenant_schema(schema_name: str, *, conn: BaseDBAsyncClient | None = None) -> None:
        assert conn is fake_conn
        fake_conn.events.append(f"create_schema:{schema_name}")

    monkeypatch.setattr(migrations, "in_transaction", unexpected_in_transaction)
    monkeypatch.setattr(migrations, "create_tenant_schema", fake_create_tenant_schema)

    version = await TenantMigrationRunner(migrations=()).apply_all(
        "workspace_abcdef1234567890abcd",
        conn=conn,
    )

    assert version == 0
    assert fake_conn.events == [
        "lock:tenant_schema:workspace_abcdef1234567890abcd",
        "create_schema:workspace_abcdef1234567890abcd",
        "ensure_migration_table",
        "load_applied_versions",
    ]


@pytest.mark.asyncio
async def test_tenant_migration_runner_preserves_original_statement_failure(monkeypatch) -> None:
    from src.modules.tenancy import migrations

    class _FailingConnection(_FakeConnection):
        async def execute_query(
            self,
            query: str,
            values: list[Any] | None = None,
        ) -> tuple[int, list[dict[str, Any]]]:
            if query == "SELECT broken_migration":
                self.events.append(query)
                raise RuntimeError("original migration failure")
            return await super().execute_query(query, values)

    fake_conn = _FailingConnection()
    conn = cast(BaseDBAsyncClient, fake_conn)

    async def fake_create_tenant_schema(schema_name: str, *, conn: BaseDBAsyncClient | None = None) -> None:
        assert conn is fake_conn
        fake_conn.events.append(f"create_schema:{schema_name}")

    monkeypatch.setattr(migrations, "create_tenant_schema", fake_create_tenant_schema)
    runner = TenantMigrationRunner(
        migrations=(TenantMigration.create(version=1, name="broken", sql=("SELECT broken_migration",)),),
    )

    with pytest.raises(RuntimeError, match="original migration failure"):
        await runner.apply_all("workspace_abcdef1234567890abcd", conn=conn)

    assert fake_conn.events[-1] == "SELECT broken_migration"
