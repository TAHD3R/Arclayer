# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

<!-- How to create and run migrations -->

### Scenario: Command-Generated Tortoise Migrations

#### 1. Scope / Trigger

- Trigger: any change to `apps/api/src/models/**` that changes tables, columns, indexes, enum-backed fields, or relationships.
- Use only `pnpm --filter @arclayer/api db:migrate` to create migration files.
- Use only `pnpm --filter @arclayer/api db:upgrade` to apply migration files.

#### 2. Signatures

- Generate: `pnpm --filter @arclayer/api db:migrate`
- Apply: `pnpm --filter @arclayer/api db:upgrade`
- Output location: `apps/api/src/migrations/*.py`
- ORM config: `src.core.database.orm.TORTOISE_ORM`

#### 3. Contracts

- Schema intent starts in Tortoise model definitions under `apps/api/src/models/**`.
- Migration files are generated artifacts and must stay reviewable as command output.
- Generated migrations must be inspected before `db:upgrade`.
- When generated output includes duplicate schema operations or invalid operation ordering, fix the model/source state and regenerate.

#### 4. Validation & Error Matrix

| Condition | Required action |
|---|---|
| `db:upgrade` fails with missing column during index creation | Inspect the generated migration order, remove the invalid migration artifact, fix the model/source state that produced the bad ordering, regenerate with `db:migrate` |
| Generated migration includes unrelated intermediate model states | Remove the intermediate generated artifacts and regenerate from the final model state |
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

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

<!-- Database-related mistakes your team has made -->

(To be filled by the team)
