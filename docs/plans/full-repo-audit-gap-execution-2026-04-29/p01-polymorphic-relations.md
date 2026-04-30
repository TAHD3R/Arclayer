# P01: Polymorphic Relations

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 多态关联
> Matrix category: partial implementation
> Source audit anchors: sections 2.3 and 14.
> Default batch: 2
> Coupling: high

## Objective

Complete relationship support by adding target-side polymorphic relations and one-way relation semantics.

## Context

- Owner-side polymorphic relation types exist: `morph_to_one` and `morph_to_many`.
- Target-side relation types are absent: `morph_one` and `morph_many`.
- One-way relation types are absent.

## Scope

- Add schema enum and validation support for target-side polymorphic relations.
- Add one-way relation support.
- Update content model builder APIs and Admin UI where relation types are selected.
- Update runtime serialization, query, and GraphQL behavior.
- Add tests for model creation, validation, content persistence, and API response shape.

## Exclusions

- Rewriting all relation storage.
- Dynamic schema sync unless required by the chosen storage model in `f06-dynamic-schema-sync.md`.
- Permission changes.

## Dependencies

- Should complete before `f07-api-auto-generation.md`.
- Informs `p04-graphql-schema-hardening.md`.
- May require coordination with `f06-dynamic-schema-sync.md`.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/admin/frontend/index.md`
- `docs/guidelines/i18n.md`
- Source audit section 2.3.

## Execution Instructions

1. Inspect relation enums, validators, serializers, and Admin relation field picker code.
2. Add relation kinds in one canonical enum path.
3. Update schema validation so invalid owner/target combinations fail clearly.
4. Update persistence and response shaping.
5. Update Admin UI labels and help text in both locales.
6. Add tests for each new relation kind.
7. Verify generated and GraphQL API follow-up requirements are documented.

## Acceptance Criteria

- Target-side polymorphic relations can be defined and validated.
- One-way relations can be defined and persisted.
- Admin UI exposes only valid relation options.
- API and GraphQL response behavior is explicit and tested.

## Verification

- Run focused content model relation tests.
- Run focused Admin tests if UI changes.
- Run `pnpm api:check`; run `pnpm admin:check` when Admin changed.
- Run GitNexus `impact` and `detect_changes`.

## Execution Log

- Status: verified
- Last updated: 2026-04-30
- Files changed:
  - Added `one_way`, `many_way`, `morph_one`, and `morph_many` to the canonical API relation enum, backend contract literal, generated OpenAPI type, Admin payload type, and shared content model relation type.
  - Added content model relation validation for camelCase keys, object configs, cardinality mismatch, one-way inverse editability, polymorphic discriminator fields, polymorphic flag shape, and duplicate relation keys.
  - Wired relation validation into content model create/update paths and expanded relation response shaping with `cardinality`, `direction`, `polymorphic`, and `polymorphicSide` metadata.
  - Added relation type labels and descriptions to `locales/en-US/content.json` and `locales/zh-CN/content.json`.
  - Updated API integration/unit tests and Admin content model builder payload tests to cover one-way and target-side polymorphic relation contracts.
- Verification:
  - `rtk timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_unit.py::test_content_model_relation_types_include_polymorphic_target_and_one_way_values tests/modules/workspaces/content/test_content_models_unit.py::test_content_model_relation_validator_accepts_new_relation_semantics tests/modules/workspaces/content/test_content_models_unit.py::test_content_model_relation_validator_rejects_invalid_new_relation_configs` passed.
  - `rtk timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_integration.py::test_content_models_patch_updates_explicit_contract_sections` passed.
  - `rtk pnpm -C apps/admin test test/pages/projects/content/content-model-builder.test.tsx` passed.
  - `rtk timeout 60s pnpm api:check` reached the required 60s timeout after API lint, format, and typecheck passed; API tests were still running when the timeout ended the command.
  - `rtk pnpm api:check` passed after the global agent rule was corrected to apply the 60 second timeout to single backend tests only; result was 597 passed, 187 skipped, and 26 warnings in 159.04s.
  - First `rtk pnpm admin:check` run failed on `test/pages/workspaces/content/content-library-article-editor-page.test.tsx > autosaves changed draft fields and seo metadata through the patch endpoint`; the same file passed in a focused rerun with 10/10 tests passed.
  - Second `rtk pnpm admin:check` passed with 232/232 test files and 951/951 tests passing.
- GitNexus:
  - Impact for `ContentModelRelationType` reported CRITICAL because it is a broadly imported public enum, with 31 direct dependents and the `create_model` process affected.
  - Impact for `validate_content_model_relation_contracts` reported LOW with direct create/update context callers.
  - Impact for `_relation_schema_entry` reported LOW with relation schema, GraphQL policy, and content model output shaping callers.
  - `detect_changes(scope=staged)` reported 43 changed symbols, 15 staged files, 1 affected process, and medium risk; unrelated Admin newline-only files remained unstaged.
- Follow-up boundary:
  - Generated REST route behavior remains owned by `f07-api-auto-generation.md`.
  - Full dynamic GraphQL schema generation hardening remains owned by `p04-graphql-schema-hardening.md`; this task makes the current model response and GraphQL policy relation schema explicit for the new relation metadata.
