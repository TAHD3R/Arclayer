from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.modules.tenancy.schema import TenantContext
from src.modules.tenancy.schema_names import validate_tenant_schema_name


def quote_schema_name(schema_name: str) -> str:
    return f'"{validate_tenant_schema_name(schema_name)}"'


async def create_tenant_schema(schema_name: str, conn: BaseDBAsyncClient | None = None) -> None:
    sql = f"CREATE SCHEMA IF NOT EXISTS {quote_schema_name(schema_name)}"
    if conn is not None:
        await conn.execute_query(sql)
        return
    async with in_transaction() as tx:
        await tx.execute_query(sql)


async def drop_tenant_schema(schema_name: str, conn: BaseDBAsyncClient | None = None) -> None:
    sql = f"DROP SCHEMA IF EXISTS {quote_schema_name(schema_name)} CASCADE"
    if conn is not None:
        await conn.execute_query(sql)
        return
    async with in_transaction() as tx:
        await tx.execute_query(sql)


async def set_tenant_search_path(conn: BaseDBAsyncClient, schema_name: str) -> None:
    await conn.execute_query(f"SET LOCAL search_path TO {quote_schema_name(schema_name)}, public")


class TenantDatabaseRouter:
    def __init__(self, tenant_context: TenantContext) -> None:
        self.tenant_context = tenant_context

    async def bind(self, conn: BaseDBAsyncClient) -> BaseDBAsyncClient:
        await set_tenant_search_path(conn, self.tenant_context.schema_name)
        return conn

    @asynccontextmanager
    async def connection(self, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield await self.bind(conn)
            return
        async with in_transaction() as tx:
            yield await self.bind(tx)


class TenantScopedRepository(TortoiseORMRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__()
        self.tenant_context = tenant_context
        self.tenant_db = TenantDatabaseRouter(tenant_context)

    @asynccontextmanager
    async def connection(self, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        async with self.tenant_db.connection(conn) as tenant_conn:
            yield tenant_conn
