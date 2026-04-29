# execute F01 content delivery API

## Goal

Implement `docs/plans/full-repo-audit-gap-execution-2026-04-29/f01-content-delivery-api.md` exactly as the current execution card defines it: create the minimum independent content-facing API surface for published and preview content, using Content API token authentication and route-level rate limiting separated from Admin API session authentication.

## What I Already Know

- The coordination README requires each round to update the README status row, append files changed and verification into the task card Execution Log, run impact analysis before editing symbols, run change detection before commit, and keep failures visible.
- D01 is verified and defines the canonical boundary: Admin API remains under `/api/v1`; Content API owns runtime delivery reads, preview reads, GraphQL delivery, site resolution, and sitemap under `/content-api/v1`; Management API is reserved.
- F02 is verified and initializes plugin runtime on app startup, so Content API work can rely on the current app runtime contract.
- Source audit section 3.1 identifies the missing public Content API and shared-auth problem.
- Source audit section 4.2 identifies missing Content Delivery API tokens, consumer auth separation, public read auth separation, and API-key based rate limiting.

## Requirements

- Confirm the canonical API boundary from D01 in live code before editing.
- Inspect current content item, version, site, project, and preview-token models before selecting the minimum API contract.
- Implement the minimum Content API contract for:
  - project or site selection
  - content model selection
  - published item reads
  - preview item reads
  - locale handling
  - pagination and filtering
- Implement explicit token validation with delivery and preview scopes.
- Keep Admin session auth and Content API token auth as separate dependencies.
- Add route-level rate limiting for Content API token flows using existing security middleware or an explicit content-api limiter.
- Add integration tests for public reads, preview reads, auth failures, scope failures, and rate-limit behavior.
- Document route naming, auth behavior, and rate limiting.
- Update `docs/plans/full-repo-audit-gap-execution-2026-04-29/README.md` and the F01 Execution Log when complete.

## Acceptance Criteria

- [x] Published content can be read through the Content API using a delivery credential.
- [x] Preview content requires a preview credential or explicit preview scope.
- [x] Admin session credentials do not define Content API access.
- [x] Content API failures return explicit typed errors.
- [x] Route naming, auth, and rate limiting are documented.
- [x] Focused API integration tests for Content API auth and reads pass.
- [x] `pnpm api:check` result is recorded.
- [x] GitNexus impact analysis and change detection are recorded.

## Out of Scope

- Generated REST endpoints for every content type.
- Full CDN integration.
- Search and Images API query semantics.
- Environment aliases.
- SDK plan updates until the route contract is stable.

## Technical Notes

- Required execution card: `docs/plans/full-repo-audit-gap-execution-2026-04-29/f01-content-delivery-api.md`.
- Required coordination README: `docs/plans/full-repo-audit-gap-execution-2026-04-29/README.md`.
- Required audit anchors: `docs/plans/full-repo-audit-arclayer-strapi-contentful-2026-04-29.md` sections 3.1 and 4.2.
- Required backend guidance: `.trellis/spec/api/backend/index.md`, `docs/guidelines/backend-endpoint-contract.md`, `docs/guidelines/backend-folder-architecture.md`, and `.trellis/spec/guides/index.md`.
