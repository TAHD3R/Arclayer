# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

Backend persistence uses Tortoise ORM, canonical repository bases, explicit transaction connection propagation, and command-generated migrations.

Database work must stay split by responsibility:

- Tortoise models in `apps/api/src/models/**` define schema shape and relationships.
- Repositories under `apps/api/src/modules/**` compose queries.
- Services own transactions and business orchestration.
- Migration files under `apps/api/src/migrations/**` are generated artifacts and must not be hand-written or hand-repaired.

---

## Query Patterns

Repository methods should expose domain intent, not raw ORM call chains to routers or unrelated services.

### Scenario: Canonical Tortoise Repository Foundation

#### 1. Scope / Trigger

- Trigger: adding, editing, or reviewing any ORM-backed repository under `apps/api/src`.
- Use `TortoiseORMRepository` as the only ORM repository foundation.
- Use tenant-aware repository bases such as `TenantScopedRepository` when tenant schema binding is required.

#### 2. Signatures

- Canonical import: `from src.core.repository.implementations.tortoise import TortoiseORMRepository`
- Model-bound repository: `class ProjectRepository(TortoiseORMRepository[Project]):`
- Tenant-scoped repository: `class ProjectContentItemsRepository(TenantScopedRepository[ContentItemRecord]):`
- Transaction-aware helper methods:
  - `_using_db_kwargs(conn: BaseDBAsyncClient | None)`
  - `using_db(qs, conn: BaseDBAsyncClient | None)`
  - `create_record(model, *, conn=None, **data)`
  - `update_fields(instance, *, fields, conn=None)`
  - `delete_by_id(model, obj_id, *, conn=None)`

#### 3. Contracts

- Shared ORM mechanics live on `TortoiseORMRepository`.
- Tenant schema binding lives on tenant-aware bases such as `TenantScopedRepository`.
- Domain-specific query helpers live on concrete domain repositories.
- Business orchestration lives in services.
- Repository methods that participate in a service transaction accept `conn` explicitly or use an instance already bound to the transaction.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Repository imports `src.common.repositories.base` | `repository.must-extend-tortoise-orm` reports a blocker finding |
| Repository imports `BaseRepository` from `src.common.repositories` | `repository.must-extend-tortoise-orm` reports a blocker finding |
| Repository inherits `BaseRepository` | `repository.must-extend-tortoise-orm` reports a blocker finding |
| Code creates `BaseRepository = TortoiseORMRepository` | `repository.must-extend-tortoise-orm` reports a blocker finding |
| ORM repository class has query behavior and no canonical base | `repository.must-extend-tortoise-orm` reports a blocker finding |
| Repository inherits `TortoiseORMRepository` or `TenantScopedRepository` | Repository foundation rule accepts it |

#### 5. Good/Base/Bad Cases

- Good: `ProjectRepository(TortoiseORMRepository[Project])` sets `model_cls = Project` and uses `self.using_db(query, conn)` for transaction propagation.
- Base: `ProjectContentItemsRepository(TenantScopedRepository[ContentItemRecord])` keeps tenant connection binding in the tenant base and domain queries in the concrete repository.
- Bad: a compatibility alias keeps `BaseRepository` available after the canonical foundation exists.

#### 6. Tests Required

- Add or update `apps/api/tests/core/test_repository_unit.py` when canonical helper behavior changes.
- Add or update code-review-engine rule fixtures in `scripts/code-review-engine/tests/test_rules.py` when forbidden repository patterns change.
- Run `rg -n "BaseRepository|src\.common\.repositories\.base|from src\.common\.repositories" apps/api/src packages` after repository foundation changes.

#### 7. Wrong vs Correct

Wrong:

```python
from src.common.repositories import BaseRepository


class ProjectRepository(BaseRepository):
    ...
```

Correct:

```python
from src.core.repository.implementations.tortoise import TortoiseORMRepository


class ProjectRepository(TortoiseORMRepository[Project]):
    model_cls = Project
```

---

## Migrations

### Scenario: Command-Generated Tortoise Migrations

#### 1. Scope / Trigger

- Trigger: any change to `apps/api/src/models/**` that changes tables, columns, indexes, enum-backed fields, or relationships.
- Use only `pnpm --filter @arclayer/api db:migrate` to create migration files.
- When reviewed historical `RunSQL` migrations have already changed the database but not Tortoise's projected state, use the explicit `db:migrate:reconcile-state` command once before normal generation. The command emits a state-only migration, performs no database operation, and refuses an unreviewed operation count.
- Use only `pnpm --filter @arclayer/api db:upgrade` to apply migration files.

#### 2. Signatures

- Generate: `pnpm --filter @arclayer/api db:migrate`
- Reconcile reviewed state drift: `pnpm --filter @arclayer/api db:migrate:reconcile-state --name <name> --expected-operations <count>`
- Apply: `pnpm --filter @arclayer/api db:upgrade`
- Output location: `apps/api/src/migrations/*.py`
- ORM config: `src.core.database.orm.TORTOISE_ORM`

#### 3. Contracts

- Schema intent starts in Tortoise model definitions under `apps/api/src/models/**`.
- Migration files are generated artifacts and must stay reviewable as command output.
- Generated migrations must be inspected before `db:upgrade`.
- State reconciliation is reserved for schema already applied by reviewed historical migrations; it must not suppress a new model change or database operation.
- When generated output includes duplicate schema operations or invalid operation ordering, fix the model/source state and regenerate.

#### 4. Validation & Error Matrix

| Condition | Required action |
|---|---|
| `db:upgrade` fails with missing column during index creation | Inspect the generated migration order, remove the invalid migration artifact, fix the model/source state that produced the bad ordering, regenerate with `db:migrate` |
| Generated migration includes unrelated intermediate model states | Remove the intermediate generated artifacts and regenerate from the final model state |
| Historical `RunSQL` schema exists in the database but is absent from projected migration state | Review the exact autodetected operation set, run `db:migrate:reconcile-state` with its expected count, inspect the generated state-only migration, then run normal `db:migrate` |
| Migration contents need manual SQL or operation reordering | Stop and fix the source model state, then regenerate |
| Existing database has no pending migrations after regeneration | Run `db:upgrade` again and confirm exit code 0 with `No migrations to apply` |

#### 5. Good/Base/Bad Cases

- Good: model changes are made first, `db:migrate` creates one reviewed migration from the final state, and `db:upgrade` exits 0.
- Base: a regenerated migration reports `No changes detected`; verify whether a new file still appeared and inspect `git status`.
- Bad: `ContentItemRecord.Meta.indexes = (("translation_group_id", "locale"),)` is added in the same migration window as a new `translation_group` foreign key and Tortoise emits index creation before column creation.

#### 6. Tests Required

- Run `pnpm --filter @arclayer/api db:upgrade` after generation.
- Run focused model tests for changed records, for example `pnpm -C apps/api uv -- pytest -vv tests/modules/workspaces/content/test_content_models_unit.py`.
- For feature migrations, run the integration tests that exercise the new table or column.

#### 7. Wrong vs Correct

Wrong:

```python
class ContentItemRecord(BaseModel):
    translation_group = fields.ForeignKeyField("models.TranslationGroupRecord", null=True)

    class Meta(BaseModel.Meta):
        indexes = (("translation_group_id", "locale"),)
```

Correct:

```python
class ContentItemRecord(BaseModel):
    translation_group = fields.ForeignKeyField("models.TranslationGroupRecord", null=True)

    class Meta(BaseModel.Meta):
        unique_together = (("model_definition_id", "environment_id", "locale", "slug"),)
```

If a compound index is required for performance, add it in a later schema change after the foreign key column exists in the applied migration chain.

---

## Naming Conventions

- Model classes use domain names such as `WorkspaceEmailInvite`, `ContentItemRecord`, and `ProjectRuntime`.
- Table and field names must preserve existing database naming style in the target module.
- Foreign key fields should use the domain object name in code and the generated `_id` column only where the ORM exposes it.
- Domain repositories should name query helpers by business meaning, for example `get_role_by_code` or `list_for_workspace`.
- Migration names are produced by the migration command; do not rename generated files for aesthetics.
- External IDs in API schemas must use the project public UUID contract rather than leaking internal integer IDs.

---

## Common Mistakes

- Opening `self.tx()` in a service but calling repository helpers that ignore the yielded connection.
- Adding model fields and hand-editing the generated migration to make it look correct.
- Creating a local repository base or compatibility alias when `TortoiseORMRepository` already owns the shared mechanics.
- Performing tenant reads through the default connection when a runtime tenant context is required.
- Adding compound indexes that reference columns introduced in the same generated migration when the migration generator emits invalid operation ordering.
