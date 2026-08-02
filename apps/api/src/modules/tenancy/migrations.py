from __future__ import annotations

from pydantic import BaseModel
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.migrations.models.tenant_control import TENANT_CONTROL_MIGRATIONS
from src.modules.tenancy.database import create_tenant_schema, quote_schema_name
from src.modules.tenancy.schema import TenantMigration
from src.modules.tenancy.schema_names import validate_tenant_schema_name

_MIGRATION_TABLE_NAME = "tenant_schema_migrations"


async def acquire_tenant_schema_lock(schema_name: str, conn: BaseDBAsyncClient) -> None:
    await conn.execute_query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [f"tenant_schema:{validate_tenant_schema_name(schema_name)}"],
    )


async def ensure_tenant_migration_table(schema_name: str, conn: BaseDBAsyncClient) -> None:
    schema = quote_schema_name(schema_name)
    await conn.execute_query(
        f"""
CREATE TABLE IF NOT EXISTS {schema}.{_MIGRATION_TABLE_NAME} (
    version INT PRIMARY KEY,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NULL,
    status VARCHAR(16) NOT NULL
)
""".strip()
    )


async def _load_applied_versions(schema_name: str, conn: BaseDBAsyncClient) -> dict[int, str]:
    schema = quote_schema_name(schema_name)
    rows = await conn.execute_query(f"SELECT version, status FROM {schema}.{_MIGRATION_TABLE_NAME} ORDER BY version")
    payload = rows[1] if isinstance(rows, tuple) else rows
    if not isinstance(payload, list):
        return {}
    return {int(item["version"]): str(item["status"]) for item in payload}


async def _record_status(
    *,
    schema_name: str,
    conn: BaseDBAsyncClient,
    migration: TenantMigration,
    status: str,
) -> None:
    schema = quote_schema_name(schema_name)
    await conn.execute_query(
        f"""
INSERT INTO {schema}.{_MIGRATION_TABLE_NAME} (version, checksum, applied_at, status)
VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
ON CONFLICT (version)
DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = EXCLUDED.applied_at, status = EXCLUDED.status
""".strip(),
        [migration.version, migration.checksum, status],
    )


class TenantMigrationRunner(BaseModel):
    migrations: tuple[TenantMigration, ...] = TENANT_CONTROL_MIGRATIONS

    async def apply_all(self, schema_name: str, *, conn: BaseDBAsyncClient | None = None) -> int:
        validated = validate_tenant_schema_name(schema_name)
        if conn is not None:
            return await self._apply_all(validated, conn=conn)
        async with in_transaction() as conn:
            return await self._apply_all(validated, conn=conn)

    async def _apply_all(self, schema_name: str, *, conn: BaseDBAsyncClient) -> int:
        await acquire_tenant_schema_lock(schema_name, conn)
        await create_tenant_schema(schema_name, conn=conn)
        await ensure_tenant_migration_table(schema_name, conn)
        applied = await _load_applied_versions(schema_name, conn)
        for migration in self.migrations:
            if applied.get(migration.version) == "applied":
                continue
            for statement in migration.sql:
                await conn.execute_query(statement.format(schema=quote_schema_name(schema_name)))
            await _record_status(
                schema_name=schema_name,
                conn=conn,
                migration=migration,
                status="applied",
            )
        return max((migration.version for migration in self.migrations), default=0)
