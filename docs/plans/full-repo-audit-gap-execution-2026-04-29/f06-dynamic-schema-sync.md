# F06: Dynamic Schema Sync

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 动态 Schema 同步
> Matrix category: completely missing
> Source audit anchors: sections 2.4, 9.3, 14.
> Default batch: 2
> Coupling: high

## Objective

Decide and implement the content-type-to-storage synchronization strategy. The current audit records an unresolved architecture decision: content fields are stored in JSONB snapshots while field types expose database column types that are not used.

## Context

- `AbstractFieldType.get_db_column_type()` exists.
- Content values are stored in `ContentVersionRecord.fields_snapshot` JSONB.
- `canonical_service.py` provides schema diff/plan/apply capability.
- The audit classifies dynamic table creation as a high-priority gap and also notes the JSONB approach may be an intentional architecture choice.

## Scope

- Produce a current live-code decision record before implementation.
- Choose one canonical strategy:
  - Keep JSONB and add generated indexes/materialized projections where needed.
  - Add dynamic physical tables per content type.
  - Add a hybrid approach with explicit rules.
- Implement the selected strategy through schema diff/plan/apply.
- Track schema version and migration state.
- Add migration and rollback tests for field add, remove, rename, type change, and index change.

## Exclusions

- Generated REST routes. That belongs to `f07-api-auto-generation.md`.
- Search indexing. That belongs to `f04-search-integration.md`.
- Environment branching. That belongs to `f10-environment-system.md`.

## Dependencies

- Should follow `p05-password-field.md` and `p01-polymorphic-relations.md` when those affect storage.
- Blocks `f07-api-auto-generation.md` when generated routes depend on physical query performance.
- Informs `f03-data-transfer-engine.md`.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `docs/guidelines/backend-folder-architecture.md`
- Source audit section 2.4.
- Live code around content fields, content versions, and canonical service.

## Execution Instructions

1. Inspect live content storage and canonical schema planning.
2. Write a short decision note in the task PRD or research artifact before editing code.
3. Implement the selected storage sync strategy with explicit migration records.
4. Ensure schema changes are idempotent.
5. Ensure failures surface with enough diagnostics to repair state.
6. Add tests for schema planning, application, conflict detection, and rollback.
7. Update docs so future agents understand the chosen storage model.

## Acceptance Criteria

- Content model changes have a persisted schema version or migration state.
- Field storage behavior is explicit and tested.
- `get_db_column_type()` is either used by the chosen implementation or documented as intentionally unused with an alternative extension point.
- Query and API generation work can rely on the chosen contract.

## Verification

- Run focused content schema tests.
- Run migration tests if migrations are generated.
- Run `pnpm api:check`.
- Run GitNexus `impact` and `detect_changes`.

## Execution Log

- Status: verified
- Last updated: 2026-04-30
- Decision: Chose the existing JSONB content storage path as the canonical F06 strategy and formalized it as `jsonb_snapshot` storage sync planning. Dynamic physical tables remain a future storage strategy requiring a separate tenant migration engine, backfill design, and rollback plan.
- Files changed:
  - `apps/api/src/modules/projects/content/contracts/schema.py`
  - `apps/api/src/modules/projects/content/models/canonical_service.py`
  - `apps/api/src/modules/projects/content/models/storage_sync.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_integration.py`
  - `docs/guidelines/backend-folder-architecture.md`
  - `.trellis/tasks/04-30-04-30-f06-dynamic-schema-sync/prd.md`
  - `.trellis/tasks/04-30-04-30-f06-dynamic-schema-sync/research/storage-sync-decision.md`
  - `.trellis/tasks/04-30-04-30-f06-dynamic-schema-sync/implement.jsonl`
  - `.trellis/tasks/04-30-04-30-f06-dynamic-schema-sync/check.jsonl`
  - `.trellis/spec/api/backend/index.md`
  - `.trellis/spec/api/backend/content-model-storage-sync.md`
- Tests run:
  - `pnpm -C apps/api format`
  - `pnpm -C apps/api lint`
  - `pnpm -C apps/api typecheck`
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_unit.py`
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_integration.py::test_content_models_impact_preview_returns_field_lifecycle_codes`
  - `pnpm -C apps/api openapi:sync`
  - `pnpm -C packages/openapi typecheck`
  - `pnpm api:check` (`598 passed, 187 skipped, 26 warnings`)
- GitNexus impact:
  - `ContentModelDefinitionRecord`: MEDIUM risk, 47 impacted symbols, 7 direct.
  - `ProjectContentCanonicalModelsService`: LOW risk, 6 impacted symbols, 3 direct.
  - `ProjectContentModelsRepository.update_model_definition`: LOW risk, 11 impacted symbols, 2 direct.
  - `ContentModelSchemaChangePlanOut`: HIGH risk due API/SDK contract fan-out; implementation used additive response fields and focused contract tests.
