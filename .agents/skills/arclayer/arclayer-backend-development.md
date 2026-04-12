---
name: Arclayer Backend Development
description: Implement and review Arclayer FastAPI backend changes using the repo's live route composition, module boundaries, table namespace rules, and validation workflow.
---

## Arclayer Backend Development

Use this skill for non-trivial backend work inside `apps/api`, especially:

- new endpoints or endpoint contract changes
- router/service/repository/schema edits
- model and migration changes
- auth, permissions, audit, and runtime-governance changes
- backend refactors that affect `packages/api-client` or frontend consumers

Do not use this skill for Admin UI structure or visual design work.

## Read Repo Truth First

Start with these files:

- `docs/guidelines/backend-folder-architecture-guideline.md`
- `docs/guidelines/backend-endpoint-contract-guideline.md`
- `docs/guidelines/security-and-data-handling.md`
- `docs/guidelines/testing-and-quality-gates.md`
- `apps/api/src/core/routes.py`

If docs and code disagree, prefer live code and then fix the docs in the same task.

## Live Architecture Facts

- Route composition lives in `apps/api/src/core/routes.py`.
- Do not use or recreate `api_aggregation` / `aggregation` style router composition.
- The live include-helper pattern is:
  - `include_router_with_global_prefix_prepended(...)`
  - `include_auth_router_with_prefix(...)`
  - `register_routes(...)`
- The reference backend module is `apps/api/src/modules/analytics`.

## Default Workflow

1. Identify the change type.
   - endpoint contract
   - service/repository behavior
   - auth/security
   - model/table change
   - migration
   - runtime route registration

2. Choose the right layer before editing.
   - `src/modules/**`: feature/domain behavior
   - `src/models/**`: persistence models and DB table metadata
   - `src/core/**`: app factory, route registration, HTTP/runtime cross-cutting concerns
   - `src/infra/**`: cache, storage, jobs, external adapters
   - `src/common/**`: reusable domain-neutral helpers
   - `src/settings/**`: runtime schema and validation

3. Preserve boundaries.
   - `router.py`: HTTP metadata, dependencies, product docstrings
   - `service.py`: business orchestration
   - `repository.py`: persistence only
   - `schema.py`: request/response schemas

4. Verify downstream impact.
   - contract changes: inspect `packages/api-client` and affected frontend callers
   - table/model changes: inspect migrations and runtime-init paths

5. Validate with repo scripts and report evidence honestly.

## Hard Rules

- Do not introduce compatibility dual tracks, fallback router shells, or silent downgrade paths.
- Do not route new work through `aggregation`-style composition.
- Do not call repositories directly from routers.
- Do not expose raw UUIDs in public contracts.
- Do not use `require_workspace_permission("admin:access")` as the effective business authorization gate.
- Do not accept auto-generated migrations blindly when the change is a hard rename or data transition.

## Table and Model Rules

- `Meta.table` is required for authored models.
- Table names must use one of:
  - `domain_*`
  - `global_*`
  - `internal_*`
  - `external_*`
- The first line of every model docstring is normative because it becomes the DB table comment.
- Keep the first line clean and standardized. Examples:
  - `"""Domain model for asset records."""`
  - `"""Global model for OAuth identities."""`
  - `"""Internal model for system configuration revisions."""`

## Router Metadata Rules

- Router tags must use dotted `domain/global/internal/external` vocabulary.
- Every endpoint function must have a concise product-facing docstring inside the function body.
- Keep endpoint wording literal and user-understandable; avoid filler comments.

## Migration Rules

- Generate migration drafts with `pnpm -C apps/api db:migrate`.
- For additive changes, accept generated output only after review.
- For table renames, hard cuts, or data rewrites:
  - generate first
  - then hand-edit to the minimum explicit SQL/ops needed
- Reject generated migrations that include unrelated deletions or drift.

## Validation

Prefer the narrowest check that matches the change:

- syntax/import safety:
  - `pnpm -C apps/api uv -- python -m compileall src/models src/modules src/migrations`
- focused backend tests:
  - `pnpm -C apps/api uv -- pytest ...`
- broader suite:
  - `pnpm api:check`

For each non-trivial backend task, report:

- commands executed
- pass/fail/skip result
- what was manually inspected
- any remaining migration or environment blockers

## Review Checklist

- Is route composition still centered in `src/core/routes.py`?
- Does the change follow the `analytics`-style module boundary?
- Did `Meta.table` and the model docstring first line stay standardized?
- Are router tags and endpoint docstrings aligned with the new vocabulary?
- Does the migration reflect the exact schema move and nothing extra?
- Are validation results and residual risks stated explicitly?
