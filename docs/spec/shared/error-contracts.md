# Shared Error Contracts

This code-spec defines the error contract shared by backend handlers and frontend consumers.

## Scenario: Stable Error Codes Across API and UI

### 1. Scope / Trigger

- Trigger: adding or changing backend error behavior, frontend error handling, validation messaging, permission failures, rate limits, or Content API credential failures.
- Applies to `APIError` subclasses, FastAPI validation errors, frontend API transport, form error display, and any generated route contract that exposes `error`.

### 2. Signatures

- Backend exception: `APIError(message, *, error, status_code, details, meta, headers)`
- Backend failure envelope: `{ "success": false, "message": string, "error": string | null, "meta": object | null }`
- Validation status: HTTP 422 with `error="VALIDATION_ERROR"`
- Rate-limit status: HTTP 429 with a stable rate-limit error code
- Frontend branch key: `error` code, not localized `message`

### 3. Contracts

- Frontend behavior must branch on stable `error` codes, never on localized `message` text.
- Backend business errors must supply a stable `error` code.
- Validation failures expose `VALIDATION_ERROR`; `meta.details` entries use
  `{ code: string, loc: Array<string | number>, message: string }`.
- Validation detail control flow uses stable `code` and `loc`; `message` is localized display copy.
- Validation details must not expose rejected `input`, exception context, or other raw request values.
- `meta` is client-visible and must be sanitized.
- Debug trace fields and raw exception details are debug-only.
- Auth, permission, rate-limit, missing-entity, and conflict errors must use explicit domain codes.
- Error codes are part of the public contract once frontend code handles them.

### 4. Validation & Error Matrix

| Condition | Backend contract | Frontend contract |
|---|---|---|
| Invalid request payload | 422 + `VALIDATION_ERROR` | Show field/form validation state where available |
| Missing auth session | 401 + stable auth code | Redirect or prompt login through auth flow |
| Permission denied | 403 + permission error code | Show access-denied state without retry loop |
| Entity missing | 404 + `<ENTITY>_NOT_FOUND` | Show empty/not-found state |
| Conflict | 409 + domain conflict code | Show conflict copy tied to the action |
| Rate limited | 429 + rate-limit code | Show retry/backoff state |
| Internal error | 500 + `INTERNAL_ERROR` | Show generic failure; do not expose raw detail |

### 5. Good/Base/Bad Cases

- Good: frontend checks `error === "CONTENT_API_RATE_LIMITED"` and renders a rate-limit state.
- Good: backend raises `NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")`.
- Base: frontend displays localized backend `message` as support copy but does not branch on it.
- Bad: frontend checks whether `message.includes("permission")`.
- Bad: validation details echo a submitted password through an `input` property.
- Bad: backend returns a raw provider exception in `meta` for a 500 response.

### 6. Tests Required

- Backend tests assert `error` codes for each new failure path.
- Frontend API tests assert error-code handling for important branches.
- Form tests assert validation-state behavior for `VALIDATION_ERROR`.
- Permission UI tests assert access-denied behavior for 403 codes.

### 7. Wrong vs Correct

#### Wrong

```typescript
if (error.message.includes('required')) {
  showRequiredFieldError()
}
```

#### Correct

```typescript
if (error.code === 'VALIDATION_ERROR') {
  showValidationErrors(error.meta?.details)
}
```

Messages are copy. Error codes are control flow.
