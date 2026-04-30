# API Contract Guideline (Arclayer)

This document defines the contract rules for HTTP APIs in `apps/api`.
It is normative: new backend and frontend API work must follow these rules unless a user-approved exception is documented in the PR.

## 1. Goals

- Keep HTTP contracts predictable, typed, and reviewable.
- Prevent backend persistence details from leaking into public APIs.
- Keep backend and frontend aligned on one schema-first truth.
- Make breaking changes explicit and deliberate instead of hiding them behind compatibility shells.

## 2. Scope

This guideline applies to:

- backend endpoint definitions in `apps/api/src/modules/**/router.py`
- backend request/response schemas in `apps/api/src/modules/**/schema.py`
- shared backend HTTP primitives in `apps/api/src/core/http/*`
- frontend consumers in `apps/admin/src/api/**`, `apps/portal/src/**`, and `packages/openapi/**`

## 3. Endpoint Contract Rules

### 3.0 API surface taxonomy

Top-level route surfaces have distinct ownership:

- Admin API: `/api/v1/*` for authenticated Admin UI and control-plane operations.
- Content API: `/content-api/v1/*` for runtime content reads, preview reads, GraphQL delivery, site resolution, and sitemap delivery.
- Management API: `/management-api/v1/*` reserved for future authenticated programmatic mutations that are distinct from Admin UI workflows.

Admin API authentication uses the user session/access-token stack from `src.modules.auth.http.service`.
Content API authentication is owned by `src.modules.auth.content_api` and accepts delivery API keys through `x-api-key` or `Authorization: Bearer <delivery-key>`.
Published Content API reads may remain public when the route contract allows it, but any supplied Content API credential must be validated by the Content API auth dependency.

### 3.0.1 CSRF policy

Browser-authenticated unsafe requests on the Admin API surface require double-submit CSRF validation:

- Protected surface: paths under `/api/*` by default.
- Exempt surface: paths under `/content-api/*` by default, because Content API routes use explicit delivery credentials (`x-api-key` or `Authorization: Bearer <delivery-key>`) and serve machine/runtime clients.
- Safe methods (`GET`, `HEAD`, `OPTIONS`, `TRACE`) may mint the readable `csrf_token` cookie and do not require validation.
- Unsafe methods require a matching `X-CSRF-Token` header and `csrf_token` cookie.
- Unsafe methods also require same-origin `Origin` or `Referer`, unless the origin is listed in `SECURITY__CSRF__TRUSTED_ORIGINS`.
- A valid unsafe mutation rotates the CSRF cookie for the next request.

Admin clients must read the `csrf_token` cookie and submit it as `X-CSRF-Token` on unsafe API calls. New machine-facing route surfaces must add an explicit CSRF exemption prefix only when their authentication boundary is token based and independent from browser cookies.

### 3.1 Schema-first request and response

- Every public endpoint must use explicit Pydantic request/response schemas.
- Every endpoint must declare `response_model` explicitly.
- Routers must return the shared envelope type `ResponseModel[T]`.
- Do not handcraft business JSON dictionaries when a schema can express the payload.

### 3.2 Canonical success envelope

- Use the shared response helpers from `apps/api/src/core/http/response.py`.
- Success payloads must use `ApiResponse.success(...)`.
- The canonical response envelope is `ResponseModel[T]` with:
  - `message`
  - `data`
  - `error`
  - `timestamp`
  - `meta`
- `meta` is reserved for extension-style metadata. Core business state belongs in typed schema fields under `data`.

### 3.3 List and pagination contracts

- Paginated endpoints must return `ResponseModel[PageData[T]]`.
- Shared pagination parameters must use `apps/api/src/core/http/pagination.py`.
- Returning `ResponseModel[list[T]]` for business lists is forbidden unless the endpoint is intentionally non-paginated and the reason is obvious from the product surface.

### 3.4 Endpoint-level product comments

- Every endpoint function must contain a concise function docstring inside the function body.
- The docstring must be product-facing and immediately understandable from the endpoint alone.
- Keep it short. Good examples:
  - `"""List organization members."""`
  - `"""Preview publish impact for the current workspace."""`
- Do not write filler comments that simply restate HTTP mechanics.

### 3.5 Router tag vocabulary

- Router tags must use the domain-based dotted vocabulary:
  - `domain.*`
  - `global.*`
  - `internal.*`
  - `external.*`
- Tags must be stable, lowercase, and semantic.
- Title-style tags such as `Workspace: Team`, `System: Activity`, or `Services: Mail` are forbidden.

## 4. Public Identifier Rules

### 4.1 External ID policy

- External contracts must use `PublicUUID` for entity identifiers.
- This applies to path params, query params, request body IDs, and response IDs exposed to clients.
- Raw UUID is an internal persistence detail and must not be the public contract.

### 4.2 Persistence leakage

- Do not expose `Meta.table`, DB naming, or internal ORM field semantics in public API schemas.
- Public contract fields should follow the existing schema serialization rules and frontend-facing naming.

## 5. Error Contract Rules

- Business errors must use the `APIError` hierarchy from `apps/api/src/core/exceptions/types.py`.
- Error codes are part of the public contract and must remain stable.
- New public error codes must be mapped in locale resources where applicable.
- Do not hide contract problems with fallback payloads, mock success, or weak error swallowing.

## 6. Router / Service / Repository Boundaries

- Router owns HTTP concerns: dependencies, parsing, `response_model`, route metadata, and transport-level comments.
- Service owns business orchestration, policy enforcement, and contract shaping.
- Repository owns persistence only.
- Router must not call repository directly.

## 7. Change Policy

### 7.1 Compatible changes

- adding optional fields
- adding new endpoint paths
- adding enum values when downstream handling already exists

### 7.2 Breaking changes

- removing or renaming fields
- changing field semantics
- changing ID format
- changing stable error semantics
- replacing or renaming public routes

### 7.3 Hard-cut rule for breaking changes

- Do not implement dual-track compatibility shells, fallback paths, or long-lived parallel contracts by default.
- When a contract must change, update the backend, the affected clients, and the migration artifacts in the same change set.
- Remove the old path cleanly instead of leaving an unowned compatibility branch behind.

## 8. Frontend Consumption Rules

- Frontend code must consume typed API wrappers, not raw transport payloads.
- API clients must return explicit typed values rather than `any`.
- Frontend code must not depend on internal UUID formats, raw DB table names, or backend-only state that is not part of the published schema.

## 9. PR Checklist

- [ ] Endpoint uses explicit request/response schemas.
- [ ] `response_model` is declared and matches the returned payload.
- [ ] Success response uses `ApiResponse.success(...)`.
- [ ] Paginated endpoints use `ResponseModel[PageData[T]]`.
- [ ] Public identifiers use `PublicUUID`.
- [ ] Endpoint function contains a concise product docstring.
- [ ] Router tags use the `domain/global/internal/external` dotted vocabulary.
- [ ] Router/service/repository boundaries are preserved.
- [ ] Breaking changes cut cleanly without fallback contract shells.

## 10. Anti-Patterns

- returning ad-hoc dict payloads for business output
- exposing raw UUIDs as the stable public contract
- using title-cased router tags
- leaving old and new contract surfaces alive in parallel without a clear owner
- swallowing errors to preserve a fake compatible response
