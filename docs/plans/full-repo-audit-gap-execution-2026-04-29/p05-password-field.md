# P05: Password Field

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 密码字段
> Matrix category: partial implementation
> Source audit anchors: sections 2.2 and 14.
> Default batch: 2
> Coupling: medium

## Objective

Add a password field type with secure hashing, write-only API semantics, and explicit exclusion from delivery responses.

## Context

- Field enum and field implementations cover many field types.
- Password field is absent.
- The audit expects bcrypt storage and responses that never return password values.

## Scope

- Add password field enum and field type implementation.
- Hash values on write using the project's existing password hashing service.
- Prevent password values from appearing in Admin API, Content API, generated REST, GraphQL, logs, audit payloads, and exports unless an explicit secure export policy is defined.
- Add Admin model-builder UI support with clear field copy.

## Exclusions

- Authentication user password logic refactor.
- Secret manager integration.
- Arbitrary encrypted field type.

## Dependencies

- Should complete before `p04-graphql-schema-hardening.md` and `f07-api-auto-generation.md`.
- May inform `f03-data-transfer-engine.md` export rules.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/admin/frontend/index.md`
- `docs/guidelines/i18n.md`
- Existing password hashing utilities.
- Source audit section 2.2.

## Execution Instructions

1. Inspect field enum, field registry, field validators, and field type classes.
2. Inspect existing auth password hashing utilities.
3. Add password field implementation with write-only serialization.
4. Add response sanitization rules across content APIs.
5. Add Admin UI selection and localized copy.
6. Add tests for create, update, response hiding, GraphQL hiding, export behavior, and logs where applicable.

## Acceptance Criteria

- Password field values are hashed before persistence.
- Password field values never appear in API responses.
- Password field values never appear in GraphQL schema or response.
- Admin UI can define a password field with correct validation.

## Verification

- Run focused field type tests.
- Run focused Admin field picker tests when UI changes.
- Run `pnpm api:check`; run `pnpm admin:check` when Admin changed.
- Run GitNexus `detect_changes` before commit.

## Execution Log

- Status: blocked
- Last updated: 2026-04-30
- Files changed:
  - `apps/api/src/models/content/_enums.py`
  - `apps/api/src/modules/projects/content/fields/__init__.py`
  - `apps/api/src/modules/projects/content/fields/registry.py`
  - `apps/api/src/modules/projects/content/fields/types/__init__.py`
  - `apps/api/src/modules/projects/content/fields/types/text.py`
  - `apps/api/src/modules/projects/content/history/service.py`
  - `apps/api/src/modules/projects/content/items/canonical_service.py`
  - `apps/api/src/modules/projects/content/items/domain_helpers.py`
  - `apps/api/src/modules/projects/content/items/password_fields.py`
  - `apps/api/src/modules/projects/content/items/repository.py`
  - `apps/api/src/modules/projects/content/models/field_type_registry.py`
  - `apps/api/src/modules/sites/graphql/service.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_service_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_content_items_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_document_runtime_unit.py`
  - `apps/admin/src/pages/projects/content/models/components/content-model-edit-screen.tsx`
  - `apps/admin/src/pages/projects/content/models/fields.ts`
  - `apps/admin/test/pages/projects/content/content-model-field-password.test.ts`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
- Implementation notes:
  - Added the built-in `password` content field type and Admin field picker support.
  - Hashes submitted password field values with the existing bcrypt password service before persistence.
  - Preserves existing password hashes when draft save or patch payloads omit password values.
  - Removes password fields from version response snapshots, presentation payloads, and GraphQL delivery fields.
  - Rejects password field GraphQL type exposure at the field type layer.
- Tests run:
  - `timeout 60s pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_unit.py::test_content_model_field_type_registry_exposes_builtin_and_plugin_contracts tests/modules/workspaces/content/test_content_models_unit.py::test_password_field_type_rejects_graphql_exposure tests/modules/sites/test_sites_graphql_service_unit.py::test_delivery_omitted_field_keys_reads_model_field_config tests/modules/sites/test_sites_graphql_service_unit.py::test_filter_delivery_fields_excludes_omitted_fields_before_custom_field_projection tests/modules/workspaces/content/test_document_runtime_unit.py::test_content_history_service_lists_version_system_objects tests/modules/workspaces/content/test_document_runtime_unit.py::test_read_service_list_versions_paginated_uses_history_service` — passed, 6 tests.
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_items_integration.py::test_content_items_hash_password_fields_and_hide_them_from_version_responses` — passed, 1 test.
  - `pnpm -C apps/admin exec vitest run test/pages/projects/content/content-model-field-password.test.ts` — passed, 2 tests.
  - `pnpm -C apps/api run typecheck` — passed.
  - `pnpm api:check` — passed: lint, format, typecheck, and test succeeded; pytest reported 594 passed, 187 skipped, 26 warnings.
  - `pnpm admin:check` — blocked: lint and format completed, Admin test failed with 36 failed tests across 21 files in the current full-suite baseline.
  - `git diff --check` — passed.
- Final gate outcome: blocked by Admin full-suite baseline failures outside the P05 password-field focused test; API final gate and focused P05 checks passed.
