from __future__ import annotations

from typing import Any, cast

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.contracts.schema import (
    ContentModelStorageFieldOut,
    ContentModelStorageMigrationOut,
    ContentModelStorageSyncPlanOut,
)
from src.modules.projects.content.fields.base import FieldConfig
from src.modules.projects.content.fields.registry import field_type_registry

JSONB_STORAGE_STRATEGY = "jsonb_snapshot"
CONTENT_FIELDS_STORAGE_TARGET = "domain_content_versions.fields_snapshot"


def build_storage_sync_snapshot(
    *,
    snapshot: dict[str, Any],
    schema_revision: int,
    state: str,
) -> ContentModelStorageSyncPlanOut:
    return ContentModelStorageSyncPlanOut(
        strategy=JSONB_STORAGE_STRATEGY,
        state=cast(Any, state),
        schema_revision=schema_revision,
        storage_target=CONTENT_FIELDS_STORAGE_TARGET,
        fields=_storage_fields(snapshot),
        migrations=[],
        diagnostics=_storage_diagnostics(),
    )


def build_storage_sync_plan(
    *,
    current_snapshot: dict[str, Any],
    next_snapshot: dict[str, Any],
    schema_revision: int,
) -> ContentModelStorageSyncPlanOut:
    migrations = _storage_migrations(current_snapshot=current_snapshot, next_snapshot=next_snapshot)
    return ContentModelStorageSyncPlanOut(
        strategy=JSONB_STORAGE_STRATEGY,
        state="planned",
        schema_revision=schema_revision,
        storage_target=CONTENT_FIELDS_STORAGE_TARGET,
        fields=_storage_fields(next_snapshot),
        migrations=migrations,
        diagnostics=_storage_diagnostics(),
    )


def storage_sync_payload(
    plan: ContentModelStorageSyncPlanOut,
) -> dict[str, Any]:
    return plan.model_dump(mode="json", by_alias=False, exclude_none=True)


def _storage_diagnostics() -> list[str]:
    return [
        "Content field values are stored in ContentVersionRecord.fields_snapshot JSONB.",
        "Field database column types are registry hints for generated indexes, projections, and future strategies.",
        "Rollback is represented as reversible schema-plan steps; historical content versions keep their JSONB snapshots.",
    ]


def _storage_fields(snapshot: dict[str, Any]) -> list[ContentModelStorageFieldOut]:
    fields = snapshot.get("fields")
    if not isinstance(fields, list):
        return []
    return [_storage_field(row) for row in fields if isinstance(row, dict) and isinstance(row.get("key"), str)]


def _storage_field(row: dict[str, Any]) -> ContentModelStorageFieldOut:
    key = str(row["key"])
    scalar = str(row["scalar"])
    raw_config = row.get("config")
    config = cast(dict[str, Any], raw_config) if isinstance(raw_config, dict) else {}
    field_config = FieldConfig(
        key=key,
        required=bool(row.get("required") is True),
        unique=_config_bool(config, "unique"),
        localizable=_config_bool(config, "localizable"),
        omit_from_api_response=_config_bool(config, "omitFromApiResponse"),
        options=dict(config),
    )
    return ContentModelStorageFieldOut(
        key=key,
        scalar=cast(Any, scalar),
        db_column_type=field_type_registry.get_db_column_type(ContentModelFieldType(scalar), field_config),
        json_path=f"fields_snapshot.{key}",
        required=field_config.required,
        unique=field_config.unique,
        indexed=_field_indexed(config),
        localizable=field_config.localizable,
        omit_from_api_response=field_config.omit_from_api_response,
    )


def _storage_field_map(snapshot: dict[str, Any]) -> dict[str, ContentModelStorageFieldOut]:
    return {field.key: field for field in _storage_fields(snapshot)}


def _storage_migrations(
    *,
    current_snapshot: dict[str, Any],
    next_snapshot: dict[str, Any],
) -> list[ContentModelStorageMigrationOut]:
    before = _storage_field_map(current_snapshot)
    after = _storage_field_map(next_snapshot)
    renamed = _detect_renamed_fields(before=before, after=after)
    renamed_before = {source for source, _target in renamed}
    renamed_after = {target for _source, target in renamed}

    migrations: list[ContentModelStorageMigrationOut] = []
    for source, target in renamed:
        migrations.append(_field_rename_migration(before[source], after[target]))
    for key in sorted(before.keys() - after.keys() - renamed_before):
        migrations.append(_field_remove_migration(before[key]))
    for key in sorted(after.keys() - before.keys() - renamed_after):
        migrations.append(_field_add_migration(after[key]))
    for key in sorted(before.keys() & after.keys()):
        migrations.extend(_field_change_migrations(before[key], after[key]))
    return migrations


def _detect_renamed_fields(
    *,
    before: dict[str, ContentModelStorageFieldOut],
    after: dict[str, ContentModelStorageFieldOut],
) -> list[tuple[str, str]]:
    removed = sorted(before.keys() - after.keys())
    added = sorted(after.keys() - before.keys())
    matches: list[tuple[str, str]] = []
    used_added: set[str] = set()
    for source in removed:
        source_field = before[source]
        for target in added:
            if target in used_added:
                continue
            target_field = after[target]
            if _same_storage_shape(source_field, target_field):
                matches.append((source, target))
                used_added.add(target)
                break
    return matches


def _same_storage_shape(before: ContentModelStorageFieldOut, after: ContentModelStorageFieldOut) -> bool:
    return (
        before.scalar == after.scalar
        and before.db_column_type == after.db_column_type
        and before.required == after.required
        and before.unique == after.unique
        and before.indexed == after.indexed
    )


def _field_add_migration(field: ContentModelStorageFieldOut) -> ContentModelStorageMigrationOut:
    return ContentModelStorageMigrationOut(
        operation="field_add",
        target=field.json_path,
        state="planned",
        summary=f"Add JSONB field '{field.key}' with {field.db_column_type} registry type.",
        before=None,
        after=_field_payload(field),
        forward_steps=[
            f"Accept '{field.key}' in content validation for schema revision.",
            f"Store '{field.key}' under {field.json_path} for new content versions.",
            *_index_forward_steps(field),
        ],
        rollback_steps=[
            f"Stop accepting '{field.key}' in content validation.",
            f"Ignore {field.json_path} in generated queries for the rolled-back schema revision.",
            *_index_rollback_steps(field),
        ],
    )


def _field_remove_migration(field: ContentModelStorageFieldOut) -> ContentModelStorageMigrationOut:
    return ContentModelStorageMigrationOut(
        operation="field_remove",
        target=field.json_path,
        state="planned",
        summary=f"Remove JSONB field '{field.key}' from the active model contract.",
        before=_field_payload(field),
        after=None,
        forward_steps=[
            f"Stop accepting '{field.key}' in content validation.",
            f"Keep historical {field.json_path} values on existing content versions.",
            *_index_rollback_steps(field),
        ],
        rollback_steps=[
            f"Restore '{field.key}' in content validation.",
            f"Resume reading {field.json_path} from historical and future content versions.",
            *_index_forward_steps(field),
        ],
    )


def _field_rename_migration(
    before: ContentModelStorageFieldOut,
    after: ContentModelStorageFieldOut,
) -> ContentModelStorageMigrationOut:
    return ContentModelStorageMigrationOut(
        operation="field_rename",
        target=f"{before.json_path}->{after.json_path}",
        state="planned",
        summary=f"Rename JSONB field '{before.key}' to '{after.key}' with compatible storage shape.",
        before=_field_payload(before),
        after=_field_payload(after),
        forward_steps=[
            f"Accept '{after.key}' in content validation.",
            f"Read {before.json_path} as the rollback source for migration diagnostics.",
            f"Store '{after.key}' under {after.json_path} for new content versions.",
            *_index_rollback_steps(before),
            *_index_forward_steps(after),
        ],
        rollback_steps=[
            f"Restore '{before.key}' in content validation.",
            f"Read {after.json_path} as the rollback source for migration diagnostics.",
            f"Store '{before.key}' under {before.json_path} for new content versions.",
            *_index_rollback_steps(after),
            *_index_forward_steps(before),
        ],
    )


def _field_change_migrations(
    before: ContentModelStorageFieldOut,
    after: ContentModelStorageFieldOut,
) -> list[ContentModelStorageMigrationOut]:
    migrations: list[ContentModelStorageMigrationOut] = []
    if before.scalar != after.scalar or before.db_column_type != after.db_column_type:
        migrations.append(
            ContentModelStorageMigrationOut(
                operation="field_type_change",
                target=after.json_path,
                state="planned",
                summary=(
                    f"Change JSONB field '{after.key}' registry type from "
                    f"{before.db_column_type} to {after.db_column_type}."
                ),
                before=_field_payload(before),
                after=_field_payload(after),
                forward_steps=[
                    f"Validate new writes for '{after.key}' as {after.scalar}.",
                    f"Keep historical {after.json_path} values available for migration diagnostics.",
                    *_index_rollback_steps(before),
                    *_index_forward_steps(after),
                ],
                rollback_steps=[
                    f"Validate new writes for '{before.key}' as {before.scalar}.",
                    f"Keep historical {before.json_path} values available for migration diagnostics.",
                    *_index_rollback_steps(after),
                    *_index_forward_steps(before),
                ],
            )
        )
    if before.indexed != after.indexed or before.unique != after.unique:
        migrations.append(
            ContentModelStorageMigrationOut(
                operation="field_index_change",
                target=after.json_path,
                state="planned",
                summary=f"Change generated index intent for JSONB field '{after.key}'.",
                before={"indexed": before.indexed, "unique": before.unique},
                after={"indexed": after.indexed, "unique": after.unique},
                forward_steps=[*_index_rollback_steps(before), *_index_forward_steps(after)],
                rollback_steps=[*_index_rollback_steps(after), *_index_forward_steps(before)],
            )
        )
    if not migrations and before != after:
        migrations.append(
            ContentModelStorageMigrationOut(
                operation="field_config_change",
                target=after.json_path,
                state="planned",
                summary=f"Change JSONB field '{after.key}' storage metadata.",
                before=_field_payload(before),
                after=_field_payload(after),
                forward_steps=[f"Apply updated storage metadata for '{after.key}'."],
                rollback_steps=[f"Restore previous storage metadata for '{before.key}'."],
            )
        )
    return migrations


def _field_payload(field: ContentModelStorageFieldOut) -> dict[str, Any]:
    return field.model_dump(mode="json", by_alias=False, exclude_none=True)


def _config_bool(config: dict[str, Any], key: str) -> bool:
    return bool(config.get(key) is True)


def _field_indexed(config: dict[str, Any]) -> bool:
    return _config_bool(config, "indexed") or _config_bool(config, "dbIndex") or _config_bool(config, "unique")


def _index_forward_steps(field: ContentModelStorageFieldOut) -> list[str]:
    if field.unique:
        return [f"Expose generated unique JSONB projection intent for {field.json_path}."]
    if field.indexed:
        return [f"Expose generated JSONB projection index intent for {field.json_path}."]
    return []


def _index_rollback_steps(field: ContentModelStorageFieldOut) -> list[str]:
    if field.unique:
        return [f"Clear generated unique JSONB projection intent for {field.json_path}."]
    if field.indexed:
        return [f"Clear generated JSONB projection index intent for {field.json_path}."]
    return []
