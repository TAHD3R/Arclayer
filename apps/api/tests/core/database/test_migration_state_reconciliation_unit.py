from __future__ import annotations

from tortoise import fields
from tortoise.migrations import operations as ops
from tortoise.migrations.schema_generator.state import State
from tortoise.migrations.schema_generator.state_apps import StateApps

from scripts.reconcile_migration_state import StateReconciliationWriter
from src.core.database.migration_operations import ReplaceAppState


def test_replace_app_state_discards_stale_models_and_loads_snapshot() -> None:
    state = State(models={}, apps=StateApps())
    ops.CreateModel(
        name="Stale",
        fields=[("id", fields.IntField(primary_key=True))],
        options={"table": "stale", "app": "models"},
    ).state_forward("models", state)
    operation = ReplaceAppState([
        ops.CreateModel(
            name="Example",
            fields=[("id", fields.IntField(primary_key=True))],
            options={"table": "examples", "app": "models"},
        )
    ])

    operation.state_forward("models", state)

    assert ("models", "Stale") not in state.models
    assert ("models", "Example") in state.models


def test_state_reconciliation_writer_renders_importable_nested_operations() -> None:
    writer = StateReconciliationWriter(
        "0120_migration_state_reconciliation",
        "models",
        [
            ReplaceAppState([
                ops.CreateModel(
                    name="Example",
                    fields=[("id", fields.IntField(primary_key=True))],
                    options={"table": "examples", "app": "models"},
                )
            ])
        ],
        dependencies=[("models", "0119_previous")],
        migrations_module="src.migrations",
    )

    rendered = writer.as_string()

    assert "from src.core.database.migration_operations import ReplaceAppState" in rendered
    assert "ReplaceAppState(" in rendered
    assert "ops.CreateModel(" in rendered
    assert "dependencies = [('models', '0119_previous')]" in rendered
