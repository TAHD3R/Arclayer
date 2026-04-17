# Headless CMS Backend SDK V1 Release Readiness Closeout

Date: 2026-04-18
Scope: backend-only closeout for Headless CMS backend and SDK v1
Epic: `.codex-tasks/20260418-headless-cms-backend-gap-closure-epic/`

## Release Decision

Backend and SDK v1 are ready for backend-only release closeout.

This closeout covers:

- GraphQL delivery contract completion
- versioned GraphQL schema artifacts
- quantitative acceptance evidence
- external error-contract audit
- SDK recipes that reflect live backend contracts

## External Error Contract Audit

### Delivery REST

Audited live backend error codes exposed through the delivery REST surface:

- `PAGE_ROUTE_NOT_FOUND`
- `PAGE_NOT_FOUND`
- `SECTION_NOT_FOUND`
- `GLOBAL_SET_NOT_FOUND`
- `PREVIEW_TOKEN_REQUIRED`
- `PREVIEW_TOKEN_INVALID`
- `PREVIEW_TOKEN_STORE_UNAVAILABLE`
- `SITE_DB_REQUIRED`
- `PREVIEW_TOKEN_DB_REQUIRED`

SDK contract:

- `packages/delivery-sdk/src/rest-client.ts` throws `DeliveryApiError`
- surfaced fields: `code`, `message`, `status`, `requestId`, `details`, `meta`, `body`

### Delivery GraphQL

Audited live backend error codes exposed through the GraphQL delivery surface:

- `GRAPHQL_SCOPE_REQUIRED`
- `DELIVERY_KEY_PERSPECTIVE_FORBIDDEN`
- `API_KEY_INVALID`
- `API_KEY_FAMILY_FORBIDDEN`
- `API_KEY_NOT_FOUND`
- `API_KEY_SITE_MISMATCH`
- `API_KEY_REVOKED`
- `API_KEY_EXPIRED`
- `API_KEY_CONFLICT`
- `MASTER_KEY_MISSING`
- `MASTER_KEY_INVALID`
- `API_KEY_HASHING_UNAVAILABLE`
- `PAGE_PRIMARY_RECORD_UNAVAILABLE`
- `PAGE_PRIMARY_RECORD_PREVIEW_UNAVAILABLE`
- `PAGE_PRIMARY_RECORD_NOT_FOUND`
- `PAGE_BINDING_RESOLUTION_FAILED`

SDK contract:

- `packages/delivery-sdk/src/graphql-client.ts` throws `DeliveryGraphQLError`
- surfaced fields now include:
  - `code`
  - `message`
  - `status`
  - `requestId`
  - `details`
  - `meta`
  - `errors`

This aligns GraphQL error handling with REST-level determinism for application consumers.

### Management API

Audited backend-facing management surfaces that are part of the Headless CMS release path:

- API key family and scope validation:
  - `API_KEY_NOT_FOUND`
  - `API_KEY_FAMILY_INVALID`
  - `API_KEY_SCOPE_INVALID`
  - `API_KEY_SCOPE_INVALID_FOR_PERSONAL`
  - `API_KEY_SCOPE_INVALID_FOR_WORKSPACE`
  - `API_KEY_SCOPE_INVALID_FOR_DELIVERY`
  - `DELIVERY_KEY_PERSPECTIVE_INVALID`
  - `DELIVERY_KEY_PERSPECTIVE_REQUIRED`
  - `API_KEY_EXPIRES_AT_INVALID`
  - `API_KEY_REVOKED`
  - `MASTER_KEY_MISSING`
  - `MASTER_KEY_INVALID`
  - `API_KEY_HASHING_UNAVAILABLE`
- publish and release:
  - `PUBLISH_VALIDATION_FAILED`
  - `PUBLISH_ROUTE_MISSING`
  - `RELEASE_NOT_FOUND`
- routing and model governance:
  - `CONTENT_ROUTE_PATH_INVALID`
  - `CONTENT_ROUTE_CONTRACT_INVALID`
  - `CONTENT_ROUTE_PATTERN_CONFLICT`
  - `CONTENT_ROUTE_CONFLICT`
  - `CONTENT_ITEM_NOT_ROUTABLE`
  - `CONTENT_ITEM_NOT_TREEABLE`
  - `CONTENT_MODEL_CONTRACT_INVALID`
  - `CONTENT_MODEL_SYSTEM_FIELD_COLLISION`
  - `CONTENT_MODEL_PROTOCOL_IDENTITY_MISMATCH`
  - `CONTENT_MODEL_SYSTEM_FIELD_LOCKED`
  - `CONTENT_MODEL_PROTOCOL_UNSUPPORTED`
  - `CONTENT_MODEL_PROTOCOL_MISSING`
  - `CONTENT_MODEL_IMPACT_PREVIEW_REQUIRED`
  - `CONTENT_MODEL_IMPACT_PREVIEW_TOKEN_INVALID`
  - `CONTENT_MODEL_IMPACT_PREVIEW_BLOCKING`

SDK contract:

- `packages/management-sdk/src/helpers.ts` throws `ManagementApiError`
- surfaced fields: `code`, `message`, `status`, `requestId`, `details`, `meta`, `body`

## SDK Recipes

Backend-facing recipes now present in repo truth:

### Delivery SDK

- `packages/delivery-sdk/examples/basic.ts`
  - resolve a page
  - fetch an article by slug
- `packages/delivery-sdk/examples/graphql-list-and-error.ts`
  - list content with filter, sort, and pagination
  - catch `DeliveryGraphQLError`
  - read `code`, `details`, and `requestId`

### Management SDK

- `packages/management-sdk/examples/basic.ts`
  - list models
  - publish a release
- `packages/management-sdk/examples/content-release-flow.ts`
  - publish a release
  - create a preview token
  - catch `ManagementApiError`
  - read `code`, `details`, and `requestId`

## Validation Bundle

### SDK validation

```bash
pnpm --filter @arclayer/delivery-sdk typecheck
pnpm --filter @arclayer/delivery-sdk test
pnpm --filter @arclayer/management-sdk typecheck
pnpm --filter @arclayer/management-sdk test
```

Result:

- delivery SDK typecheck: pass
- delivery SDK test: pass
- management SDK typecheck: pass
- management SDK test: pass

### Backend validation

```bash
pnpm api:check
```

Result:

- pass on live repo truth at closeout time
- `343 passed, 118 skipped, 32 warnings`

## Known Execution Constraint

Phase 3 quantitative validation remains serial-only.

Documented repo-truth failure modes under parallel execution:

- `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`
- `deadlock detected`
- `relation "internal_permissions" does not exist`

This is an execution constraint for acceptance proof commands. It does not block backend or SDK release readiness.

## Closeout Summary

Backend-only Headless CMS v1 now has:

- delivery REST and GraphQL contracts
- versioned schema artifacts
- focused acceptance evidence above threshold
- SDK error contracts aligned with backend error envelopes
- backend-facing example coverage for delivery and management flows
- release-readiness proof captured in repo docs
