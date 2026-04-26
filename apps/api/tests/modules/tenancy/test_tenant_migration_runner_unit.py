from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import pytest

from src.modules.tenancy.migrations import TenantMigrationRunner


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

    conn = _FakeConnection()

    @asynccontextmanager
    async def fake_in_transaction() -> AsyncIterator[_FakeConnection]:
        yield conn

    async def fake_create_tenant_schema(schema_name: str, *, conn: _FakeConnection | None = None) -> None:
        assert conn is not None
        conn.events.append(f"create_schema:{schema_name}")

    monkeypatch.setattr(migrations, "in_transaction", fake_in_transaction)
    monkeypatch.setattr(migrations, "create_tenant_schema", fake_create_tenant_schema)

    version = await TenantMigrationRunner(migrations=()).apply_all("cms_ws_abcdef1234567890abcd")

    assert version == 0
    assert conn.events == [
        "lock:tenant_schema:cms_ws_abcdef1234567890abcd",
        "create_schema:cms_ws_abcdef1234567890abcd",
        "ensure_migration_table",
        "load_applied_versions",
    ]
