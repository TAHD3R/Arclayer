# API Contract Guideline (CelestialCMS)

This document defines the API contract rules for backend and frontend teams.
It is a normative guideline focused on stable, schema-first, type-safe contracts.

## 1. Goals

- Keep API behavior predictable and version-safe.
- Eliminate schema drift between backend and frontend.
- Prevent accidental leakage of internal persistence details.
- Keep contract changes reviewable with explicit compatibility decisions.

## 2. Scope

This guideline applies to:

- Backend HTTP endpoints under `apps/api/src/modules/**/router.py`
- Backend request/response schemas under `apps/api/src/modules/**/schema.py` and `apps/api/src/common/schemas/*`
- Frontend API clients under `apps/admin/src/api` and Portal runtime API wrappers under `apps/portal/src/runtime/*api*`
- Shared type packages that represent backend contracts (usually `packages/protocols/*` packages; Portal runtime types live in `packages/internal/types`)

## 3. Contract-First Design Rules (mandatory)

### 3.1 Schema-first request/response

- Every public endpoint must define explicit Pydantic request/response schemas.
- Router endpoints must set `response_model` explicitly.
- Service and repository return values should be schema instances (or values accepted by `.model_validate(...)`), not ad-hoc dict payloads.
- Do not handcraft response dictionaries in router/service layers when a schema can express the shape.

### 3.2 Canonical response envelope

- Use project envelope contracts from `apps/api/src/core/http/response.py`.
- Success payloads must use `Response.success(...)` (or equivalent project wrapper with same envelope semantics).
- The canonical envelope is `ResponseModel[T]` with fields:
  - `message`
  - `data`
  - `error`
  - `timestamp`
  - `meta` (extension-only field)
- `meta` is only for dynamic extension data. Core business payload must be represented by typed schema fields in `data`.

### 3.3 List endpoints and pagination

- List endpoints must use `ResponseModel[PageData[T]]`.
- `ResponseModel[list[T]]` is forbidden for paginated business APIs.
- Pagination parameters should use shared pagination contracts from `apps/api/src/core/http/pagination.py`.

## 4. Public ID Contract (mandatory)

### 4.1 External ID policy

- External API contracts must use `PublicUUID` for entity identifiers.
- Applies to path params, query params, request body IDs, and response IDs.
- Raw UUID is an internal persistence detail and must not be exposed as public API contract.

### 4.2 Allowed compatibility exception

- Raw UUID input acceptance is a temporary dev/test compatibility mode only.
- It must not be used as production contract behavior.
- Any endpoint depending on raw UUID input in production is a contract violation.

### 4.3 Logging and telemetry

- Avoid logging raw internal IDs when public IDs can be logged instead.
- Keep sensitive correlation context masked/sanitized according to security policy.

## 5. Error Contract Rules

- Business errors must use `APIError` hierarchy (`apps/api/src/core/exceptions/types.py`) with stable `error` codes.
- Error codes are contract-level identifiers; avoid changing existing codes without migration planning.
- Validation failures should remain compatible with standard envelope and status semantics.
- New public error codes must be mapped in i18n resources (`locales/*/errors.json`) for supported locales.

## 6. Field Naming and Serialization Rules

- API schemas must inherit project base schema contracts (`BaseSchema`, `BaseOut`, mixins where appropriate).
- API field naming must follow project serialization behavior (camelCase output via schema config).
- Do not expose internal DB naming styles directly when schema aliasing already defines public shape.
- Schema constraints (`Field`, validators) must express business constraints instead of relying on implicit client behavior.

## 7. Router / Service / Repository Contract Boundaries

- Router owns transport concerns: HTTP metadata, dependencies, request parsing, response model binding.
- Service owns business orchestration and error semantics.
- Repository owns persistence access only.
- Router must not call repository directly.
- Contract mapping and normalization should happen in service/schema boundaries, not scattered across routers.

### 7.1 Authorization granularity (mandatory)

- Business endpoints must use domain capability permissions (for example `system:assets:read`,
  `system:assets:manage`, `system:content:publish`) instead of broad gates.
- `require_workspace_permission("admin:access")` is forbidden in router endpoint dependencies.
- `admin:access` may be kept only for backward compatibility metadata and must not be used as
  the effective authorization dependency for business APIs.
- Read/write/publish/delete operations must be split into corresponding permissions where semantics differ.

## 8. Frontend Consumption Rules

- Frontend components must not parse raw HTTP payloads directly.
- API modules must normalize envelope responses and return explicit `Promise<T>` contracts.
- Frontend types/interfaces must align with backend schema shapes and naming.
- `any` is forbidden for authored API contract code.

## 9. Contract Change Policy

### 9.1 Compatible changes (default)

- Adding optional fields
- Adding new endpoint paths
- Adding new enum values only when downstream fallback is defined

### 9.2 Breaking changes (require migration plan)

- Removing or renaming existing fields
- Changing field type semantics
- Replacing `PublicUUID` contract with another ID format
- Changing error code semantics or deleting stable error codes

### 9.3 Breaking change requirements

For breaking changes, PR must include:

1. Compatibility impact statement
2. Frontend migration tasks
3. Rollout/deprecation plan
4. i18n/error mapping updates if applicable

## 10. PR Checklist

- [ ] Endpoint defines explicit `response_model` with schema-based payload.
- [ ] Response envelope uses `ResponseModel[T]` semantics.
- [ ] List APIs use `ResponseModel[PageData[T]]`.
- [ ] External IDs use `PublicUUID` (no raw UUID contract leakage).
- [ ] Error codes are stable and mapped for i18n where needed.
- [ ] Router/service/repository boundaries are respected.
- [ ] Frontend API wrappers are updated with explicit return types.
- [ ] Contract-breaking changes include migration plan and rollout notes.

## 11. Anti-Patterns

- Returning ad-hoc dict payloads for business output when schema is possible.
- Returning plain arrays for paginated resources.
- Exposing raw UUIDs to clients.
- Encoding business state into `meta` instead of typed schema fields.
- Swallowing contract errors with weak fallbacks that hide incompatibilities.
