from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from src.modules.tenancy.database import (
    TenantDatabaseRouter,
    create_tenant_schema,
    drop_tenant_schema,
    quote_schema_name,
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
            schema_name="cms_ws_1234567890abcdefghij",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        )
    )


def test_quote_schema_name_uses_validated_identifier() -> None:
    assert quote_schema_name("CMS_WS_1234567890ABCDEFGHIJ") == '"cms_ws_1234567890abcdefghij"'


@pytest.mark.asyncio
async def test_create_drop_and_search_path_sql_use_validated_names() -> None:
    conn = _FakeConnection()
    await create_tenant_schema("cms_ws_1234567890abcdefghij", conn=conn)
    await set_tenant_search_path(conn, "cms_ws_1234567890abcdefghij")
    await drop_tenant_schema("cms_ws_1234567890abcdefghij", conn=conn)
    assert conn.queries == [
        'CREATE SCHEMA IF NOT EXISTS "cms_ws_1234567890abcdefghij"',
        'SET LOCAL search_path TO "cms_ws_1234567890abcdefghij", public',
        'DROP SCHEMA IF EXISTS "cms_ws_1234567890abcdefghij" CASCADE',
    ]


@pytest.mark.asyncio
async def test_invalid_schema_name_never_reaches_connection() -> None:
    conn = _FakeConnection()
    with pytest.raises(ValueError):
        await set_tenant_search_path(conn, "cms_ws_bad;DROP SCHEMA public")
    assert conn.queries == []


@pytest.mark.asyncio
async def test_tenant_database_router_sets_search_path_on_each_bind() -> None:
    conn = _FakeConnection()
    router = TenantDatabaseRouter(_tenant_context())
    await router.bind(conn)  # type: ignore[arg-type]
    await router.bind(conn)  # type: ignore[arg-type]
    assert conn.queries == [
        'SET LOCAL search_path TO "cms_ws_1234567890abcdefghij", public',
        'SET LOCAL search_path TO "cms_ws_1234567890abcdefghij", public',
    ]
