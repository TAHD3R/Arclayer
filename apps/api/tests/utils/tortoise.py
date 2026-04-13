from __future__ import annotations

from tortoise import Tortoise


async def reset_postgres_schema(*, schema: str = "public") -> None:
    """
    Reset Postgres schema for integration tests.

    Why:
    - `Tortoise.generate_schemas(safe=True)` only creates missing tables, it does NOT
      alter existing tables. When models evolve (e.g. adding `deleted_at`), an existing
      test database can drift and cause "column does not exist" errors.
    - Dropping tables gives us a deterministic clean schema without creating a new DB.
    """

    conn = Tortoise.get_connection("default")

    # Drop all tables in the target schema.
    # CASCADE also drops dependent objects (FKs, indexes, etc.).
    sql = f"""
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = '{schema}'
  )
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', '{schema}', r.tablename);
  END LOOP;
END $$;
    """
    await conn.execute_script(sql)


async def rebuild_postgres_schema(*, schema: str = "public") -> None:
    """
    Rebuild the current ORM schema from models for integration tests.

    We do not run Tortoise migrations inside pytest. A reused test database can
    therefore drift from the current model graph and miss newer tables such as
    RBAC catalog tables. Rebuilding the schema keeps the test DB aligned with
    the live models deterministically.
    """

    await reset_postgres_schema(schema=schema)
    await Tortoise.generate_schemas(safe=True)
