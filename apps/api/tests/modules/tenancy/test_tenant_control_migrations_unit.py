from __future__ import annotations

from src.migrations.models.tenant_control import TENANT_CONTROL_MIGRATIONS


def _migration(version: int):  # type: ignore[no-untyped-def]
    return next(migration for migration in TENANT_CONTROL_MIGRATIONS if migration.version == version)


def test_builder_agent_generation_context_migration_contract() -> None:
    migration = _migration(24)
    sql = "\n".join(migration.sql)

    assert migration.version == 24
    assert migration.name == "builder_agent_generation_context"
    assert "ALTER TABLE {schema}.builder_generations" in sql
    assert "ALTER COLUMN agent_run_id DROP NOT NULL" in sql

    for table_name in (
        "builder_change_sets",
        "builder_generations",
        "content_structure_revisions",
        "site_revision_manifests",
    ):
        assert f"ALTER TABLE {{schema}}.{table_name}" in sql
        for column_name in (
            "agent_assignment_id",
            "agent_id",
            "agent_version_id",
        ):
            assert f"ADD COLUMN IF NOT EXISTS {column_name} UUID NULL" in sql
            assert f"idx_{table_name}_{column_name}" in sql

    assert "ADD COLUMN IF NOT EXISTS builder_context JSONB NULL" in sql
    assert "ADD COLUMN IF NOT EXISTS composition_context JSONB NULL" in sql
    assert "ADD COLUMN IF NOT EXISTS wireframe_context JSONB NULL" not in sql


def test_builder_global_section_version_pins_contract() -> None:
    migration = _migration(25)
    sql = "\n".join(migration.sql)

    assert migration.version == 25
    assert migration.name == "builder_global_section_version_pins"
    assert "ALTER TABLE {schema}.site_revision_manifests" in sql
    assert "ADD COLUMN IF NOT EXISTS global_section_version_pins JSONB NOT NULL DEFAULT '[]'::JSONB" in sql


def test_builder_generation_typed_targets_contract() -> None:
    migration = _migration(26)
    sql = "\n".join(migration.sql)

    assert migration.version == 26
    assert migration.name == "builder_generation_typed_targets"
    assert "old_name TEXT := 'selected_page_ids'" in sql
    assert "new_name TEXT := 'targets'" in sql
    assert "old_name TEXT := 'wireframe_context'" in sql
    assert "new_name TEXT := 'composition_context'" in sql
    assert "IF old_column_exists AND NOT new_column_exists THEN" in sql


def test_builder_composition_saga_contract() -> None:
    owned_tables_sql = "\n".join(_migration(2).sql)
    migration = _migration(27)
    sql = "\n".join(migration.sql)

    assert "{schema}.builder_composition_sagas" in owned_tables_sql
    assert migration.version == 27
    assert migration.name == "builder_composition_saga"
    assert "{schema}.builder_composition_sagas" in sql
    assert "ALTER TABLE {schema}.builder_generations" in sql
    assert "ADD COLUMN IF NOT EXISTS composition_saga_id UUID NULL" in sql
    assert "ADD COLUMN IF NOT EXISTS composition_saga_phase VARCHAR(16) NULL" in sql
    assert "ADD COLUMN IF NOT EXISTS planning_context JSONB NULL" in sql
    assert "idx_builder_generations_composition_saga_id" in sql


def test_builder_design_generation_context_is_the_latest_contract() -> None:
    migration = TENANT_CONTROL_MIGRATIONS[-1]
    sql = "\n".join(migration.sql)

    assert migration.version == 28
    assert migration.name == "builder_design_generation_context"
    assert "ALTER TABLE {schema}.builder_generations" in sql
    assert "ADD COLUMN IF NOT EXISTS design_context JSONB NULL" in sql
