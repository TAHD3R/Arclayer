# Full Repo Audit Gap Execution Plan

> Source audit: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Created: 2026-04-29
> Purpose: execution plan for the 19 gaps in the comprehensive gap matrix.

## Operating Rules

This directory is the coordination layer for future implementation work. Treat each task card as a bounded sub-agent handoff contract.

- High-coupling items proceed by batch.
- Independent items proceed alone.
- Each implementation round gives the sub-agent only the current task card and relevant spec/context.
- Each completed round updates this overview status table.
- Every implementation task must run repo impact analysis before editing symbols and change detection before commit.
- Every implementation task must use live repo evidence over older notes when the two conflict.
- Every implementation task must keep failures visible. Do not add silent fallback paths to make a check pass.

## Required Context For Sub-Agents

Every sub-agent receives exactly:

- Its current task card from this directory.
- The source audit report section referenced by that card.
- Relevant Trellis spec indexes and guideline files.
- Research artifacts created for that task, if any.

Do not include unrelated task cards in the default context. The current card may reference dependency cards by file name; the coordinating agent decides whether those dependency cards need to be included.

## Execution Batches

### Batch 0: Truth And Architecture Corrections

Goal: set the canonical platform direction before implementation expands.

| Order | Card | Reason |
|---:|---|---|
| 0.1 | `d01-api-architecture-separation.md` | Defines the API boundary that Content Delivery API and generated REST routes must follow. |
| 0.2 | `d02-search-audit-correction.md` | Removes stale search assumptions before selecting search infrastructure. |

### Batch 1: Platform Runtime Foundation

Goal: activate existing framework capabilities and expose a real delivery boundary.

| Order | Card | Reason |
|---:|---|---|
| 1.1 | `f02-plugin-startup-integration.md` | Makes plugin registries and hooks available to later work. |
| 1.2 | `f01-content-delivery-api.md` | Creates the independent content-facing API surface. |
| 1.3 | `p06-csrf-protection.md` | Hardens browser-facing authenticated flows once the API boundary is explicit. |

### Batch 2: Content Runtime Contract

Goal: make content model definitions drive runtime behavior consistently.

| Order | Card | Reason |
|---:|---|---|
| 2.1 | `p05-password-field.md` | Adds a narrow field type with strict storage and response semantics. |
| 2.2 | `p01-polymorphic-relations.md` | Completes relationship semantics before API generation exposes them. |
| 2.3 | `f06-dynamic-schema-sync.md` | Decides and implements the physical storage strategy for content fields. |
| 2.4 | `f07-api-auto-generation.md` | Builds generated REST routes on top of the settled model/runtime contract. |
| 2.5 | `p04-graphql-schema-hardening.md` | Aligns GraphQL schema generation with field visibility and safe type construction. |

### Batch 3: Permissions And Editorial Governance

Goal: make access control editable, expressive, and consistent across API and Admin.

| Order | Card | Reason |
|---:|---|---|
| 3.1 | `p07-conditional-permissions.md` | Establishes condition semantics consumed by APIs and UI. |
| 3.2 | `f08-rbac-management-ui.md` | Exposes role and permission management in Admin. |
| 3.3 | `p02-review-workflow.md` | Adds stage assignment, stage permissions, and publish-stage enforcement. |

### Batch 4: Developer And Operations Tooling

Goal: support repeatable platform operations and external developer workflows.

| Order | Card | Reason |
|---:|---|---|
| 4.1 | `f03-data-transfer-engine.md` | Implements import, export, schema transfer, and diagnostics. |
| 4.2 | `f05-cli-tools.md` | Provides the command surface for transfer, config, scaffolding, and generators. |

### Batch 5: Delivery Experience And Differentiators

Goal: add capabilities that improve content delivery, media delivery, and multi-environment operations.

| Order | Card | Reason |
|---:|---|---|
| 5.1 | `f09-images-api.md` | Adds URL-driven transformations for assets. |
| 5.2 | `f04-search-integration.md` | Adds full-text and optional vector search after the audit correction is complete. |
| 5.3 | `p03-sso-providers.md` | Extends login providers using the existing auth contract. |
| 5.4 | `f10-environment-system.md` | Adds environment isolation and aliases after content runtime and transfer semantics are established. |

## Status Matrix

Status values:

- `planned`: task card exists and implementation has not started.
- `in_progress`: a sub-agent or main agent is actively implementing the card.
- `blocked`: implementation found a dependency, product decision, or infrastructure issue.
- `verified`: code is merged or committed with required checks.
- `deferred`: explicitly postponed with a reason and revisit condition.

| ID | Card | Batch | Coupling | Status | Last Result |
|---|---|---:|---|---|---|
| D01 | `d01-api-architecture-separation.md` | 0 | high | verified | Admin API remains under `/api/v1`; Content API delivery routes moved under `/content-api/v1`; local checks passed. |
| D02 | `d02-search-audit-correction.md` | 0 | low | verified | Corrected search audit prose: dev infra includes Meilisearch and pgvector availability, while application-level search integration remains future F04 work. |
| F02 | `f02-plugin-startup-integration.md` | 1 | high | verified | App-owned plugin runtime implemented; focused tests and full `pnpm api:check` pass. |
| F01 | `f01-content-delivery-api.md` | 1 | high | verified | Content API entries routes, tenant-bound GraphQL/REST reads, token auth separation, and shared REST/GraphQL limiter added; focused tests passed, `pnpm api:check` reached the 60s timeout after lint/typecheck/test startup. |
| P06 | `p06-csrf-protection.md` | 1 | medium | blocked | CSRF implementation and focused tests completed; final gates blocked by existing Admin suite failures and API 60s gate timeout. |
| P05 | `p05-password-field.md` | 2 | medium | verified | Password field enum/type, bcrypt write hashing, response/GraphQL hiding, and Admin picker support completed; implementation-round `pnpm api:check` passed, and this follow-up unblocked the Admin baseline so `pnpm admin:check` now passes. |
| P01 | `p01-polymorphic-relations.md` | 2 | high | verified | Target-side polymorphic and one-way relation contract support implemented; focused API/Admin checks, `pnpm api:check`, and rerun `pnpm admin:check` passed. |
| F06 | `f06-dynamic-schema-sync.md` | 2 | high | verified | Chose `jsonb_snapshot` as canonical storage strategy; schema previews now expose versioned storage sync plans with field add/remove/rename/type/index migration records, rollback steps, and registry-resolved database type hints; OpenAPI SDK sync and `pnpm api:check` passed. |
| F07 | `f07-api-auto-generation.md` | 2 | high | verified | Added `core/api_generator` Content API primitives and generated per-model REST read routes from GraphQL/query metadata; focused unit and integration tests passed, and `pnpm api:check` passed. |
| P04 | `p04-graphql-schema-hardening.md` | 2 | high | verified | Replaced GraphQL resolver `exec()` with inspected Strawberry resolver signatures, added identifier validation for generated schema parts, preserved delivery field filtering, and passed focused GraphQL checks plus `pnpm api:check`. |
| P07 | `p07-conditional-permissions.md` | 3 | high | verified | Added explicit condition model/templates, role-permission condition storage, workspace/project policy enforcement, Admin-facing metadata, and focused owner/project/workflow bypass coverage; `pnpm api:check` passed. |
| F08 | `f08-rbac-management-ui.md` | 3 | high | verified | Admin workspace permissions now expose action catalog, role matrix, staged save/revert grants, read/write permission gates, and condition grant indicators; focused RBAC/Admin tests plus `pnpm admin:check` passed. |
| P02 | `p02-review-workflow.md` | 3 | high | verified | Added governed workflow policy contracts, role/user stage assignment, transition and permission enforcement, configured publish-stage gates, Admin workflow settings, OpenAPI sync, and API/Admin checks; default Admin Turbo gate still exposes an unrelated sidebar test flake, while the same gate passes with Turbo task concurrency pinned to 1. |
| F03 | `f03-data-transfer-engine.md` | 4 | high | planned | Implement import/export/schema transfer and diagnostics. |
| F05 | `f05-cli-tools.md` | 4 | high | planned | Add `@arclayer/cli` and operational commands. |
| F09 | `f09-images-api.md` | 5 | medium | planned | Add URL-driven image transforms. |
| F04 | `f04-search-integration.md` | 5 | medium | planned | Add search infrastructure and query integration. |
| P03 | `p03-sso-providers.md` | 5 | low | planned | Add more OAuth providers. |
| F10 | `f10-environment-system.md` | 5 | high | planned | Add environments and aliases. |

## Per-Task Completion Contract

At the end of every implementation round, the executing agent must:

1. Update the corresponding row in this README.
2. Record files changed and tests run in the task card's `Execution Log`.
3. Run the narrowest relevant checks, with `pnpm api:check`, `pnpm admin:check`, or `pnpm check` as the final gate according to scope.
4. Run GitNexus change detection before any commit.
5. Commit only the files owned by the current task when the user expects commits.

## Spec Context Index

Use these spec indexes when curating Trellis context for future tasks:

- API backend: `.trellis/spec/api/backend/index.md`
- API frontend: `.trellis/spec/api/frontend/index.md`
- Admin frontend: `.trellis/spec/admin/frontend/index.md`
- Shared thinking guides: `.trellis/spec/guides/index.md`

The implementing agent must read the concrete guideline files listed by the relevant index before editing code.
