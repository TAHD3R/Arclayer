# Backend Error Handling

This code-spec defines how backend failures become typed exceptions, logs, and client-visible response envelopes.

## Scenario: API Error Envelope

### 1. Scope / Trigger

- Trigger: adding or changing route, service, validation, authentication, authorization, database, or platform error behavior.
- Applies to Admin `/api/v1`, public `/content-api/v1`, generated delivery routes, GraphQL delivery, jobs that surface API errors, and shared route helpers.

### 2. Signatures

- Base exception: `src.core.exceptions.types.APIError`
- Typed exceptions: `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `TooManyRequests`, `InternalServerError`, `ServiceUnavailable`
- Service contract exceptions: `ServiceContractError`, `RequiredEventPublisherMissing`, `RequiredDomainEventPublishFailed`
- Handler registration: `init_exception_handlers(app: FastAPI, settings: Settings)`
- Response envelope: `ApiResponse.fail(message=..., error=..., meta=...)`
- Validation response status: HTTP 422 with `error="VALIDATION_ERROR"`
- Internal fallback: HTTP 500 with `error="INTERNAL_ERROR"`

### 3. Contracts

- Domain and route helpers raise typed `APIError` subclasses instead of returning ad hoc dictionaries.
- Every client-visible business failure must include a stable `error` code string.
- Handlers localize `message` through `localize_message`; callers should not pre-localize server errors.
- `details` are included only for validation errors or debug-mode failures.
- `meta` is client-visible and must be sanitized before it is passed to the exception.
- Unexpected exceptions never leak raw exception messages to clients.
- Exception handlers set `request.state.error_code` and `request.state.error_message` so request logs and middleware can report the same failure.
- Use `HTTPException` only when integrating framework-level behavior; prefer `APIError` subclasses for project-domain failures.
- Services must propagate required contract failures (`ServiceContractError` family) explicitly; they must not convert them into fake success payloads.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Domain validation fails | Raise `BadRequest(..., error="<DOMAIN_CODE>")` |
| Authentication token missing or invalid | Raise `Unauthorized` or `Forbidden` with a stable auth error code |
| Permission check fails | Raise `Forbidden(..., error="<SCOPE>_REQUIRED")` or `Forbidden(..., error="PERMISSION_DENIED")` |
| Entity is missing | Raise `NotFound(..., error="<ENTITY>_NOT_FOUND")` |
| Uniqueness or state conflict occurs | Raise `Conflict(..., error="<DOMAIN>_CONFLICT")` |
| Rate limit is exceeded | Raise `TooManyRequests(..., error="<SURFACE>_RATE_LIMITED")` |
| Pydantic or request validation fails | Handler returns HTTP 422 with `VALIDATION_ERROR` and sanitized details |
| Tortoise `OperationalError` escapes | Handler returns HTTP 500 with `DB_OPERATIONAL_ERROR` |
| Unexpected exception escapes | Handler logs stack and returns `INTERNAL_ERROR` without raw message leakage |

### 5. Good/Base/Bad Cases

- Good: content delivery auth raises `Forbidden("API key invalid", error="API_KEY_INVALID")`.
- Good: preview access raises `Forbidden("Preview token required", error="PREVIEW_TOKEN_REQUIRED")`.
- Base: a framework `HTTPException(404)` is mapped to `NOT_FOUND` by the handler.
- Bad: a service catches an exception, logs it, and returns `(False, "failed")`.
- Bad: a route returns `{"ok": False, "message": "..."}` instead of the shared response envelope.
- Bad: a 500 response includes raw database or provider exception text outside debug mode.

### 6. Tests Required

- Route or integration tests must assert the HTTP status and `error` code for each new public failure branch.
- Validation tests must assert 422 and `VALIDATION_ERROR` for malformed request payloads.
- Authz tests must assert permission error codes, not only HTTP 403.
- Internal-error tests should prove raw exception text does not leak when `debug=False`.
- Shared frontend contract tests should import generated OpenAPI types instead of duplicating response shapes.

## Scenario: Exception Propagation and Internal Failure Boundaries

### 1. Scope / Trigger

- Trigger: adding/changing try/except blocks in routers/services/repositories, introducing new exception types, or changing internal error handling behavior.
- Applies to:
  - `src/core/exceptions/types.py`
  - `src/core/exceptions/handlers.py`
  - service orchestration using `BaseService` event publication contracts.

### 2. Signatures

- API exception hierarchy:
  - `APIError` and subclasses (`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `TooManyRequests`, `InternalServerError`, `ServiceUnavailable`)
- Service contract failures:
  - `ServiceContractError`
  - `RequiredEventPublisherMissing`
  - `RequiredDomainEventPublishFailed`
- Handler map:
  - `APIError` handler
  - `HTTPException` handler
  - `RequestValidationError` / `ValidationError` handlers
  - `OperationalError` handler
  - fallback `Exception` / HTTP 500 internal handler.

### 3. Contracts

- Exception class responsibility:
  - `APIError` subclasses represent client-visible business failures.
  - service contract errors represent internal orchestration contract violations and should surface as internal errors unless explicitly mapped.
- Propagation rules:
  - Blocking contract failures in service layer must bubble upward; do not swallow and continue.
  - `asyncio.CancelledError` must always propagate.
  - Fatal process exceptions (`GeneratorExit`, `KeyboardInterrupt`, `SystemExit`) must always propagate.
- Boundary ownership:
  - Routers translate dependency/domain failures through project exception handlers; they do not construct ad hoc error dictionaries.
  - Services may map lower-level exceptions to typed `APIError` when the failure is part of public business contract.
  - Repositories should not shape client-facing exceptions; they surface persistence failures to service layer.
- Internal failure boundary:
  - any unhandled `Exception` is converted to 500 with `error="INTERNAL_ERROR"`.
  - internal error responses never expose raw exception text to clients when `debug=False`.
  - in debug mode, details can be emitted under `meta.details`, not by changing stable `error` code.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Service catches `RequiredDomainEventPublishFailed` and returns success | Forbidden; re-raise or map to typed failure |
| Router catches generic exception and returns ad hoc dict | Forbidden; let handlers build envelope |
| Repository raises ORM/persistence error | Service maps to typed domain/API failure or lets internal handler return 500 |
| `OperationalError` reaches exception handler | Return 500 with `DB_OPERATIONAL_ERROR` |
| Unknown runtime exception reaches fallback | Return 500 with `INTERNAL_ERROR` and sanitized message |
| Debug off and exception has sensitive message | Client response must not include raw details |

### 5. Good/Base/Bad Cases

- Good: service raises `Conflict(..., error="INVITE_ALREADY_EXISTS")` for a public state conflict.
- Good: required domain event publish failure raises `RequiredDomainEventPublishFailed`, which surfaces as explicit backend failure instead of silent success.
- Base: service catches low-level storage exception and remaps to `ServiceUnavailable` when external dependency outage is the intended public contract.
- Bad: broad `except Exception: return {"ok": True}` fallback in service or router.
- Bad: repository catches DB exception and rewrites it into frontend-specific message text.

### 6. Tests Required

- Unit tests for exception handlers must cover:
  - APIError mapping
  - HTTPException mapping
  - validation error mapping
  - operational error mapping
  - generic internal error mapping.
- Service tests must assert required contract failures are not swallowed and do not emit fake success responses.
- Integration tests must assert debug-off responses never leak raw backend stack/error text.
- Integration tests for critical mutations should verify failure paths return stable error codes and correct HTTP status.

### 7. Wrong vs Correct

#### Wrong

```python
try:
    workspace = await repo.get_workspace(workspace_id)
except Exception:
    return {"success": False, "message": "workspace lookup failed"}
```

#### Correct

```python
workspace = await repo.get_workspace(workspace_id)
if workspace is None:
    raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")
```

The handler converts the exception into the shared error envelope and request logging receives the same `error` code.
