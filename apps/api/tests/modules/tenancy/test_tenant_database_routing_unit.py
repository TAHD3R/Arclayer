from __future__ import annotations

from typing import Any, cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.modules.tenancy.database import (
    TenantDatabaseRouter,
    create_tenant_schema,
    drop_tenant_schema,
    quote_schema_name,
    set_public_search_path,
    set_tenant_search_path,
)
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode


class _FakeConnection:
    def __init__(self) -> None:
        self.queries: list[str] = []

    async def execute_query(self, query: str) -> tuple[int, list[dict[str, Any]]]:
        self.queries.append(query)
        return 0, []


def _tenant_context() -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            project_id=None,
            runtime_id=None,
            site_id=None,
            schema_name="workspace_1234567890abcdefghij",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        )
    )


def test_quote_schema_name_uses_validated_identifier() -> None:
    assert quote_schema_name("WORKSPACE_1234567890ABCDEFGHIJ") == '"workspace_1234567890abcdefghij"'


@pytest.mark.asyncio
async def test_create_drop_and_search_path_sql_use_validated_names() -> None:
    conn = _FakeConnection()
    db = cast(BaseDBAsyncClient, conn)
    await create_tenant_schema("workspace_1234567890abcdefghij", conn=db)
    await set_tenant_search_path(db, "workspace_1234567890abcdefghij")
    await set_public_search_path(db)
    await drop_tenant_schema("workspace_1234567890abcdefghij", conn=db)
    assert conn.queries == [
        'CREATE SCHEMA IF NOT EXISTS "workspace_1234567890abcdefghij"',
        'SET LOCAL search_path TO "workspace_1234567890abcdefghij", public',
        "SET LOCAL search_path TO public",
        'DROP SCHEMA IF EXISTS "workspace_1234567890abcdefghij" CASCADE',
    ]


@pytest.mark.asyncio
async def test_invalid_schema_name_never_reaches_connection() -> None:
    conn = _FakeConnection()
    with pytest.raises(ValueError):
        await set_tenant_search_path(cast(BaseDBAsyncClient, conn), "workspace_bad;DROP SCHEMA public")
    assert conn.queries == []


@pytest.mark.asyncio
async def test_tenant_database_router_sets_search_path_on_each_bind() -> None:
    conn = _FakeConnection()
    router = TenantDatabaseRouter(_tenant_context())
    db = cast(BaseDBAsyncClient, conn)
    await router.bind(db)
    await router.bind(db)
    assert conn.queries == [
        'SET LOCAL search_path TO "workspace_1234567890abcdefghij", public',
        'SET LOCAL search_path TO "workspace_1234567890abcdefghij", public',
    ]
