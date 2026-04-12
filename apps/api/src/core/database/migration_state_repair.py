from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from tortoise import Tortoise
from tortoise.migrations.executor import MigrationExecutor
from tortoise.migrations.graph import MigrationKey

from src.core.database.orm import close_orm

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
RECORDER_TABLE = "tortoise_migrations"
KNOWN_SCHEMA_TABLES = {
    "asset_folders",
    "content_component_bindings",
    "content_items",
    "content_model_definitions",
    "content_publish_artifacts",
    "content_seo_profiles",
    "content_versions",
}


@dataclass(frozen=True)
class SchemaSnapshot:
    tables: frozenset[str]
    columns_by_table: dict[str, frozenset[str]]

    def has_table(self, table: str) -> bool:
        return table in self.tables

    def has_column(self, table: str, column: str) -> bool:
        return column in self.columns_by_table.get(table, frozenset())

    def has_non_recorder_tables(self) -> bool:
        return any(table != RECORDER_TABLE for table in self.tables)


@dataclass(frozen=True)
class MigrationStateRepairResult:
    repaired: bool
    baseline: str | None
    reason: str
    recorded_names: tuple[str, ...] = ()


def list_migration_names(migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    return sorted(path.stem for path in migrations_dir.glob("*.py") if path.is_file() and path.name != "__init__.py")


def migration_names_up_to(baseline: str, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    names = list_migration_names(migrations_dir)
    if baseline not in names:
        raise ValueError(f"Unknown baseline migration: {baseline}")
    return [name for name in names if name <= baseline]


def detect_baseline_migration(snapshot: SchemaSnapshot) -> str | None:
    if (
        snapshot.has_column("content_items", "shape_state")
        and snapshot.has_column("content_items", "resolved_surface")
        and snapshot.has_column("content_model_definitions", "default_role")
        and snapshot.has_column("content_model_definitions", "default_surface")
    ):
        return "0016_content_continuation_truth"

    if (
        snapshot.has_table("content_model_definitions")
        and snapshot.has_column("content_items", "bootstrap_preset_key")
        and snapshot.has_column("content_items", "bootstrap_preset_state")
        and snapshot.has_column("content_items", "capability_pack_ids")
    ):
        return "0015_content_bootstrap_shape"

    if (
        snapshot.has_table("content_publish_artifacts")
        and snapshot.has_table("content_seo_profiles")
        and snapshot.has_table("content_component_bindings")
    ):
        return "0013_content_platform_rebuild"

    if (
        snapshot.has_table("content_model_definitions")
        and snapshot.has_table("content_items")
        and snapshot.has_table("content_versions")
    ):
        return "0011_content_kernel_initial"

    if (
        snapshot.has_table("asset_folders")
        and snapshot.has_column("asset_folders", "organization_id")
        and snapshot.has_column("asset_folders", "user_id")
    ):
        return "0006_auto_20260306_1016"

    if snapshot.has_table("asset_folders"):
        return "0001_initial"

    return None


async def collect_schema_snapshot(connection) -> SchemaSnapshot:
    table_rows = await connection.execute_query_dict(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )
    tables = frozenset(row["tablename"] for row in table_rows)
    columns_by_table: dict[str, frozenset[str]] = {}

    for table in sorted(tables & KNOWN_SCHEMA_TABLES):
        column_rows = await connection.execute_query_dict(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=$1
            ORDER BY ordinal_position
            """,
            [table],
        )
        columns_by_table[table] = frozenset(row["column_name"] for row in column_rows)

    return SchemaSnapshot(tables=tables, columns_by_table=columns_by_table)


async def repair_tortoise_migration_state(
    config: dict,
    *,
    app_label: str = "models",
) -> MigrationStateRepairResult:
    await Tortoise.init(config=config)
    try:
        app_config = config["apps"][app_label]
        connection_name = app_config.get("default_connection", "default")
        connection = Tortoise.get_connection(connection_name)
        executor = MigrationExecutor(connection, {app_label: app_config})
        await executor.recorder.ensure_schema(executor._schema_editor(atomic=False))

        applied = await executor.recorder.applied_migrations()
        if applied:
            return MigrationStateRepairResult(
                repaired=False,
                baseline=None,
                reason="already_tracked",
            )

        snapshot = await collect_schema_snapshot(connection)
        if not snapshot.has_non_recorder_tables():
            return MigrationStateRepairResult(
                repaired=False,
                baseline=None,
                reason="empty_schema",
            )

        baseline = detect_baseline_migration(snapshot)
        if baseline is None:
            return MigrationStateRepairResult(
                repaired=False,
                baseline=None,
                reason="unknown_existing_schema",
            )

        names = tuple(migration_names_up_to(baseline))
        for name in names:
            await executor.recorder.record_applied(app_label, name)

        repaired_applied = await executor.recorder.applied_migrations()
        repaired_keys = {MigrationKey(app_label=app_label, name=name) for name in names}
        if not repaired_keys.issubset(set(repaired_applied)):
            raise RuntimeError("Failed to record baseline tortoise migrations.")

        return MigrationStateRepairResult(
            repaired=True,
            baseline=baseline,
            reason="repaired_from_schema_checkpoint",
            recorded_names=names,
        )
    finally:
        await close_orm()
