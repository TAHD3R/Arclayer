from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from tortoise.migrations.api import migrate

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.src.core.database.migration_state_repair import repair_tortoise_migration_state
from apps.api.src.core.database.orm import TORTOISE_ORM


async def main() -> None:
    repair = await repair_tortoise_migration_state(TORTOISE_ORM, app_label="models")
    if repair.reason == "unknown_existing_schema":
        raise RuntimeError(
            "Existing public tables were found, but tortoise_migrations is empty and no known "
            "schema checkpoint matched. Refusing to guess migration state."
        )
    if repair.repaired and repair.baseline:
        print(
            f"Bootstrapped tortoise_migrations through {repair.baseline} "
            f"({len(repair.recorded_names)} recorded migrations)."
        )
    await migrate(config=TORTOISE_ORM, app_labels=["models"])


if __name__ == "__main__":
    asyncio.run(main())
