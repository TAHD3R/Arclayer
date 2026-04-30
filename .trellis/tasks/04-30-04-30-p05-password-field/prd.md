# P05 Password Field

## Source

- Task card: `docs/plans/full-repo-audit-gap-execution-2026-04-29/p05-password-field.md`
- Coordination README: `docs/plans/full-repo-audit-gap-execution-2026-04-29/README.md`
- Source audit anchors: `docs/plans/full-repo-audit-arclayer-strapi-contentful-2026-04-29.md` sections 2.2 and 14

## Objective

Add a content-model password field type with secure hashing, write-only API semantics, and exclusion from delivery-facing responses.

## Requirements

- Add a password field enum and field type implementation.
- Hash password field values on write using the project's existing password hashing service.
- Preserve existing password hashes when updates omit a password value.
- Ensure password field values are hidden from Admin API responses, Content API responses, generated REST responses, GraphQL schema and responses, logs, audit payloads, and export paths in this task's reachable scope.
- Add Admin model-builder support so users can define a password field with localized product copy.

## Scope

- Backend content field enum, registry, validation, and serialization.
- Content item write pipeline for hashing password fields.
- Content item read and delivery serialization for field hiding.
- GraphQL schema generation field filtering.
- Admin field picker and localized copy.
- Focused backend and Admin tests for password field creation, hashing, response hiding, GraphQL hiding, and Admin picker availability.

## Exclusions

- Authentication user password refactor.
- Secret manager integration.
- General encrypted field type.
- Broad export engine implementation outside existing reachable code paths.

## Acceptance Criteria

- Password field values are hashed before persistence.
- Password field values never appear in API responses.
- Password field values never appear in GraphQL schema or response.
- Admin UI can define a password field with correct validation.

## Verification

- Run focused field type and content item tests.
- Run focused Admin field picker tests when UI changes.
- Run `pnpm api:check`.
- Run `pnpm admin:check` when Admin changes.
- Run GitNexus `detect_changes` before commit.
