# Content Model Storage Sync

## Scenario: JSONB Snapshot Storage Sync Plans

### 1. Scope / Trigger

- Trigger: changing content model schema planning, impact preview responses, storage metadata, generated route assumptions, or field type storage hints.
- Applies to content model create/update/preview flows under `apps/api/src/modules/projects/content/models/`.
- Applies to future API generation, data transfer, and generated query/index planning that need to understand content field storage.

### 2. Signatures

- API response field: `ContentModelSchemaChangePlanOut.storage_sync`
- Planner entry point: `build_storage_sync_plan(current_snapshot, next_snapshot, schema_revision)`
- Snapshot entry point: `build_storage_sync_snapshot(snapshot, schema_revision, state)`
- Storage strategy: `jsonb_snapshot`
- Storage target: `domain_content_versions.fields_snapshot`
- Field type extension point: `FieldTypeRegistry.get_db_column_type(ContentModelFieldType, FieldConfig)`

### 3. Contracts

- Content field values stay in `ContentVersionRecord.fields_snapshot` JSONB.
- Content model schema versions are sourced from `draft_contract_revision` and `published_contract_revision`.
- Every canonical schema snapshot includes a `storage_sync` payload with:
  - `strategy`
  - `state`
  - `schema_revision`
  - `storage_target`
  - resolved `fields`
  - generated `migrations`
  - diagnostics
- Every storage field includes:
  - `key`
  - `scalar`
  - `db_column_type`
  - `json_path`
  - `required`
  - `unique`
  - `indexed`
  - `localizable`
  - `omit_from_api_response`
- Storage migrations are plan records. They describe forward and rollback behavior for field add, remove, rename, type change, index change, and metadata change.

### 4. Validation & Error Matrix

- Unknown field scalar -> field type registry resolution error during planning.
- Invalid field config -> field type config validation or registry type resolution error.
- Missing `fields` list in snapshot -> empty storage field list.
- Unsupported future storage strategy -> add a new explicit strategy literal and tests before emitting it.

### 5. Good/Base/Bad Cases

- Good: impact preview for a uniqueness change emits `field_index_change` with non-empty rollback steps.
- Good: compatible remove/add pairs emit `field_rename` when the storage shape matches.
- Base: a model with no fields emits `jsonb_snapshot` with an empty field list and no migrations.
- Bad: a planner silently treats an unknown scalar as JSONB.
- Bad: generated routes infer database columns from field rows without reading the storage sync plan.

### 6. Tests Required

- Unit test for contract fields on `ContentModelSchemaChangePlanOut.storage_sync`.
- Unit test for field add, remove, rename, type change, index change, and rollback steps.
- Integration test asserting impact-preview JSON includes `changePlan.storageSync`.
- API gate: `pnpm api:check`.

### 7. Wrong vs Correct

#### Wrong

```python
db_type = "JSONB"
```

This hides the field type registry and gives API generation no field-level storage contract.

#### Correct

```python
db_type = field_type_registry.get_db_column_type(ContentModelFieldType(scalar), field_config)
```

This keeps JSONB as the physical storage target while exposing field-specific database type hints for future projections, indexes, and generated routes.
