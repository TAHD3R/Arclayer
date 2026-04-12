from __future__ import annotations

from pathlib import Path

from src.core.database.migration_state_repair import (
    SchemaSnapshot,
    detect_baseline_migration,
    migration_names_up_to,
)


def test_detect_baseline_migration_matches_bootstrap_shape_checkpoint() -> None:
    snapshot = SchemaSnapshot(
        tables=frozenset({
            "asset_folders",
            "content_items",
            "content_model_definitions",
            "content_versions",
        }),
        columns_by_table={
            "asset_folders": frozenset({"organization_id", "user_id"}),
            "content_items": frozenset({
                "bootstrap_preset_key",
                "bootstrap_preset_state",
                "capability_pack_ids",
            }),
            "content_model_definitions": frozenset({"id", "workspace_id"}),
        },
    )

    assert detect_baseline_migration(snapshot) == "0015_content_bootstrap_shape"


def test_detect_baseline_migration_matches_continuation_truth_checkpoint() -> None:
    snapshot = SchemaSnapshot(
        tables=frozenset({"content_items", "content_model_definitions"}),
        columns_by_table={
            "content_items": frozenset({
                "bootstrap_preset_key",
                "bootstrap_preset_state",
                "capability_pack_ids",
                "shape_state",
                "resolved_surface",
            }),
            "content_model_definitions": frozenset({"default_role", "default_surface"}),
        },
    )

    assert detect_baseline_migration(snapshot) == "0016_content_continuation_truth"


def test_detect_baseline_migration_returns_none_for_unknown_existing_schema() -> None:
    snapshot = SchemaSnapshot(
        tables=frozenset({"content_items", "mystery_table"}),
        columns_by_table={"content_items": frozenset({"id"}), "mystery_table": frozenset({"id"})},
    )

    assert detect_baseline_migration(snapshot) is None


def test_migration_names_up_to_returns_ordered_prefix() -> None:
    names = migration_names_up_to(
        "0015_content_bootstrap_shape",
        migrations_dir=Path(__file__).resolve().parents[3] / "src/migrations",
    )

    assert names[0] == "0001_initial"
    assert names[-1] == "0015_content_bootstrap_shape"
    assert "0016_content_continuation_truth" not in names
