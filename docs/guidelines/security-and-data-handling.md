# Security and Data Handling Guideline (Arclayer)

This document defines mandatory security and data-handling rules for backend and cross-app contracts.
It consolidates operational rules that were previously spread across code and AGENTS guidance.

## 1. Goals

- Prevent sensitive data leakage in API responses, logs, events, and background jobs.
- Keep authentication/token behavior consistent and revocation-safe.
- Enforce secure defaults for file uploads and plugin package ingestion.
- Define minimum auditability for high-risk actions.

## 2. Scope

This guideline applies to:

- Backend APIs and services under `apps/api/*`
- Plugin runtime and plugin management flows
- Settings/config storage and encryption flows
- Upload and asset ingestion flows
- Audit and structured logging behavior

## 3. Data Classification (mandatory)

Use the following classification before introducing new fields.

| Class | Examples | Storage requirement | Output/log requirement |
| --- | --- | --- | --- |
| Public | non-sensitive page metadata, localized labels | normal storage | may appear in API/logs |
| Internal | internal status flags, operational metadata | normal storage | avoid broad exposure outside owning context |
| Sensitive | user identifiers, org/workspace identifiers, business telemetry | controlled access | minimal exposure; sanitize in logs |
| Secret | password hash inputs, refresh tokens, API keys, encrypted settings secrets | protected storage + encryption where applicable | never expose plaintext in API/logs/events |

When unsure between Sensitive and Secret, default to Secret handling.

## 4. API Output Safety Rules

- All business responses must use typed schemas and standard response envelope.
- Do not handcraft raw dict output for business payloads when schema is possible.
- External entity IDs must use `PublicUUID`; raw UUID is internal.
- Response `meta` must not be used to smuggle secret/sensitive business payloads.

## 5. Logging and Redaction Rules

## 5.1 Structured logging baseline

- Use structured logging only.
- Include relevant context for traceability (`trace_id/request_id`, `user_id`, `entity_id`, `org_id`, `action`) when available.
- Keep log text concise and actionable.

## 5.2 Sensitive field redaction

- Redact sensitive keys (token/password/secret/etc.) before emitting logs.
- Never log authentication headers, cookies, or request bodies by default.
- Error logging should preserve diagnosis value while keeping secret values masked.

## 5.3 Prohibited log content

- Plain refresh/access tokens
- Passwords or reset token plaintext
- Secret config plaintext
- Raw encrypted payload blobs when they can reveal secret context

## 6. Authentication and Token Lifecycle

## 6.1 Access + refresh model

- Access token and refresh token lifecycles must remain separated.
- Refresh token issuance and rotation must be stateful and auditable.

## 6.1.1 Privileged sys governance step-up (mandatory)

Sys governance endpoints under `/api/v1/sys/*` are privileged surfaces and must require a
short-lived step-up token:

- Normal access tokens can authenticate users, but must not be sufficient for `/sys` governance.
- `/api/v1/sys/*` must require an access token with context claim `ctx=sys` (step-up).
- Step-up token is issued via `/api/v1/sys/auth/step-up` and must require re-entering password
  (future: 2FA/TOTP).
- Step-up token TTL must be short (`AUTH__SYS_ACCESS_TOKEN_TTL_SECONDS`, default 300s).
- Sys step-up tokens must be treated as ephemeral: clients must not persist them to cookies,
  localStorage, or other durable storage (memory-only store).
- Sys HTTP clients must not attempt refresh-token rotation/auto-refresh for step-up tokens.

Operational note:
- Production/staging environments must be isolated at the database level (separate deployments
  with separate DBs). Do not multiplex multiple environment configs inside the same DB.

## 6.2 Rotation and reuse detection (mandatory)

- Refresh tokens must be single-use by rotation chain semantics.
- Reuse/mismatch detection must trigger defensive invalidation.
- Reuse response must not leak internals; return stable security error code.

## 6.3 Revocation and logout

- Logout must revoke all active refresh tokens for the user context.
- Password change and password reset completion must invalidate prior token version and refresh chain.
- `token_version` invalidation is mandatory for forced session invalidation.

## 6.4 Availability and fail-safe behavior

- If refresh/reset token store is unavailable, fail with explicit service-unavailable semantics.
- Do not silently downgrade to weaker auth behavior.

## 7. Upload and Package Ingestion Security

## 7.1 General upload constraints

- Validate filename safety (reject path-like input).
- Enforce extension allow-list per upload purpose.
- Enforce size limits and checksum format validation.
- Reject unsupported or policy-violating uploads early with stable error codes.

## 7.2 Plugin package installation constraints

- Accept only valid zip packages.
- Require valid manifest (`plugin.toml`) and entrypoint contract.
- Enforce safe extraction (block path traversal and symlink entries).
- Enforce file-count and uncompressed-size limits to reduce zip bomb risk.
- Keep rollback and cleanup behavior explicit when install/update fails.

## 8. Configuration and Secret Management

## 8.1 Secret storage

- Secret fields in plugin/system config must be encrypted at rest.
- Encryption keys must be managed via master-key flow, not hardcoded in source.
- Key files should use restricted filesystem permissions.

## 8.2 Secret runtime usage

- Decrypt secrets only when needed and in-memory.
- Treat decryption failures as fail-closed behavior.
- Never return decrypted secret values to unauthorized contexts.

## 8.3 Secret handling anti-leak rules

- Do not include secret fields in logs, API errors, or event payloads.
- Do not write secret defaults into plaintext manifests/config snapshots.

## 9. Event and Background Task Safety

- Event payloads must be minimal and sanitized.
- Background tasks must capture exceptions and log sanitized context.
- Event publish failures must not crash critical request flows, but must be observable.

## 10. Audit Minimum Requirements

At minimum, audit or security-observable events should cover:

- Authentication success/failure and suspicious token behavior
- Token reuse detection and forced invalidation
- Plugin install/enable/disable/uninstall/config updates
- Sensitive settings updates
- Upload completion and critical resource mutations

Audit records should include actor/subject/entity/action/time/source context when available.

## 11. Exception and Error Response Safety

- Use stable API error codes.
- Do not leak internal stack traces or raw exception internals to clients.
- Validation and operational errors should return safe, localized, contract-stable messages.
- Debug-only details must remain controlled by runtime settings and still avoid secret leakage.

## 12. Security PR Checklist (mandatory)

- [ ] New/changed fields are classified (Public/Internal/Sensitive/Secret) and handled accordingly.
- [ ] API responses avoid raw internal IDs and avoid secret leakage.
- [ ] Logs/events/background tasks do not expose tokens/passwords/secrets.
- [ ] Token lifecycle behavior (rotation/reuse/revocation/token_version) remains intact.
- [ ] Upload/package validation includes filename/type/size/safe extraction protections.
- [ ] Config secret fields stay encrypted at rest and sanitized at runtime boundaries.
- [ ] New security-relevant errors use stable codes and locale mappings.
- [ ] Audit coverage exists for high-risk state transitions.
- [ ] Any temporary security exception includes owner, expiry date, risk note, and remediation task.

## 13. Evidence Requirements for Security-Sensitive PRs

Security-sensitive changes should include:

- Executed check commands
- Key negative-case verification (for example invalid token reuse, invalid package extraction)
- Manual validation notes for sensitive flows
- Explicit list of deferred hardening items (if any) with owners and deadlines

## 14. Anti-Patterns

- Logging request bodies/headers for convenience debugging.
- Returning decrypted secret config content to broad clients.
- Disabling token rotation/revocation safeguards to simplify implementation.
- Treating upload and plugin package validation as optional.
- Swallowing security-related exceptions without audit/log context.
