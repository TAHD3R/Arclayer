from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from collections.abc import Sequence

from tortoise.context import TortoiseContext
from tortoise.migrations.autodetector import MigrationAutodetector
from tortoise.migrations.operations import CreateModel, Operation
from tortoise.migrations.schema_generator.operation_generator import OperationGenerator
from tortoise.migrations.schema_generator.state import State
from tortoise.migrations.schema_generator.state_apps import StateApps
from tortoise.migrations.writer import ImportManager, MigrationWriter, format_migration_name

from src.core.database.migration_operations import ReplaceAppState
from src.core.database.orm import TORTOISE_ORM


class StateReconciliationWriter(MigrationWriter):
    """Render an explicit state-only wrapper around autodetected operations."""

    def _format_operation(
        self,
        operation: Operation,
        imports: ImportManager,
        *,
        indent: str,
    ) -> list[str]:
        if not isinstance(operation, ReplaceAppState):
            return super()._format_operation(operation, imports, indent=indent)
        imports.add_from("src.core.database.migration_operations", "ReplaceAppState")
        lines = [f"{indent}ReplaceAppState(", f"{indent}    operations=["]
        for state_operation in operation.operations:
            lines.extend(super()._format_operation(state_operation, imports, indent=f"{indent}        "))
        lines.extend((f"{indent}    ],", f"{indent}),"))
        return lines


async def generate_state_reconciliation(*, name: str, expected_operations: int) -> str:
    apps_config = TORTOISE_ORM["apps"]
    async with TortoiseContext() as context:
        await context.init(config=TORTOISE_ORM)
        if context.apps is None:
            raise RuntimeError("Tortoise apps were not initialized")
        autodetector = MigrationAutodetector(context.apps, apps_config)
        await autodetector.loader.build_graph()
        old_state = await autodetector._project_state()
        new_state = autodetector._current_state()

    drift_operations = OperationGenerator(old_state, new_state).generate(app_labels=["models"])
    if len(drift_operations) != expected_operations:
        counts = Counter(type(operation).__name__ for operation in drift_operations)
        raise RuntimeError(
            "Migration state drift differs from the reviewed operation set: "
            f"expected {expected_operations}, received {len(drift_operations)} ({dict(sorted(counts.items()))})"
        )
    snapshot_operations = OperationGenerator(
        State(models={}, apps=StateApps()),
        new_state,
    ).generate(app_labels=["models"])
    if not snapshot_operations or any(not isinstance(operation, CreateModel) for operation in snapshot_operations):
        counts = Counter(type(operation).__name__ for operation in snapshot_operations)
        raise RuntimeError(f"Expected a complete CreateModel snapshot, received {dict(sorted(counts.items()))}")
    migration_name, initial = autodetector._migration_name("models", old_state, new_state)
    number = int(migration_name.split("_", 1)[0])
    writer = StateReconciliationWriter(
        format_migration_name(number, name),
        "models",
        [ReplaceAppState(snapshot_operations)],
        dependencies=sorted((key.app_label, key.name) for key in autodetector._leaf_nodes("models")),
        initial=initial,
        migrations_module=TORTOISE_ORM["apps"]["models"]["migrations"],
    )
    return str(writer.write())


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a reviewed state-only migration for schema already applied by historical RunSQL migrations."
    )
    parser.add_argument("--name", required=True)
    parser.add_argument("--expected-operations", required=True, type=int)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = _parse_args(argv)
    path = asyncio.run(
        generate_state_reconciliation(
            name=args.name,
            expected_operations=args.expected_operations,
        )
    )
    print(f"Created state reconciliation migration: {path}")


if __name__ == "__main__":
    main()
