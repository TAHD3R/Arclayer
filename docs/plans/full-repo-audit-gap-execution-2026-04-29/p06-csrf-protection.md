# P06: CSRF Protection

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: CSRF 防护
> Matrix category: partial implementation
> Source audit anchors: sections 12 and 14.
> Default batch: 1
> Coupling: medium

## Objective

Define and implement a complete CSRF token strategy for browser-authenticated mutation routes.

## Context

- The audit records CSRF protection as partial.
- FastAPI security headers and CORS are present through security middleware.
- Auth and content API boundaries must be explicit before CSRF scope is final.

## Scope

- Identify cookie/session-authenticated browser mutation routes.
- Add CSRF token issue, storage, validation, and rotation behavior.
- Exempt non-browser token-authenticated Content API routes through explicit route metadata.
- Add tests for missing token, invalid token, valid token, cross-origin behavior, and safe methods.

## Exclusions

- Replacing CORS or security headers.
- Applying CSRF checks to token-authenticated machine APIs.
- UI redesign beyond token fetch integration.

## Dependencies

- Should follow `d01-api-architecture-separation.md`.
- Should coordinate with `f01-content-delivery-api.md` when Content API token routes exist.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/admin/frontend/index.md` if Admin token fetch changes.
- `docs/guidelines/backend-endpoint-contract.md`
- Source audit section 12.

## Execution Instructions

1. Inspect current auth/session/cookie behavior and mutation route dependencies.
2. Define CSRF enforcement scope with route metadata or dependency ownership.
3. Implement token issuance and validation.
4. Add Admin client token fetch and submit behavior only where required.
5. Add tests for route classes and failure modes.
6. Document the CSRF policy.

## Acceptance Criteria

- Browser-authenticated mutation routes reject missing or invalid CSRF tokens.
- Safe methods remain accessible according to policy.
- Token-authenticated machine routes use explicit exemptions.
- Tests cover success and failure paths.

## Verification

- Run focused security/auth tests.
- Run `pnpm api:check`; run `pnpm admin:check` when Admin changed.
- Run GitNexus `impact` on auth/security symbols before editing, then `detect_changes`.

## Execution Log

- Status: blocked
- Last updated: 2026-04-30
- Files changed:
  - `apps/api/src/core/middleware/guard_integration.py`
  - `apps/api/src/settings/env_models.py`
  - `apps/api/tests/core/test_middlewares.py`
  - `apps/admin/src/lib/http/client.ts`
  - `apps/admin/test/lib/http/client-csrf.test.ts`
  - `packages/web/src/http/client.ts`
  - `docs/guidelines/backend-endpoint-contract.md`
- Implementation:
  - Added path-scoped CSRF protection for `/api/*` with explicit `/content-api/*` exemption.
  - Added same-origin or trusted-origin validation for unsafe protected requests.
  - Added double-submit validation using `csrf_token` cookie and `X-CSRF-Token` header.
  - Added CSRF token minting on safe protected requests and rotation after valid unsafe mutations.
  - Added Admin/shared HTTP client CSRF header submission for unsafe requests and refresh helpers.
  - Documented the CSRF policy in `docs/guidelines/backend-endpoint-contract.md`.
- GitNexus:
  - Impact before editing `_build_guard_request_check`: LOW; direct upstream caller `build_guard_config`, affected process `lifespan`.
  - Impact before editing `packages/web/src/http/client.ts:request`: LOW in fresh index; direct upstream callers `createApiClient` and Admin `apiRequest`.
  - `detect_changes(scope="all")`: high risk due shared Guard middleware and shared HTTP client changes; affected flows include `lifespan` Guard setup and Admin `AssetUploadDialog` request paths through the shared client.
- Verification:
  - `rtk timeout 60s pnpm -C apps/api uv -- pytest -q tests/core/test_middlewares.py::test_csrf_middleware tests/core/test_middlewares.py::test_csrf_rejects_invalid_token_and_cross_origin tests/core/test_middlewares.py::test_csrf_exempts_content_api_token_routes tests/core/test_middlewares.py::test_csrf_rotates_token_after_valid_mutation --no-cov` passed: 4 passed.
  - `rtk timeout 60s pnpm --filter @arclayer/admin test test/lib/http/client-csrf.test.ts` passed: 1 file, 3 tests.
  - `rtk git diff --check` passed.
  - `rtk timeout 60s pnpm api:check` blocked: lint, format, and typecheck passed; API test phase exceeded the 60s wrapper and exited 124 without a test failure summary.
  - `rtk timeout 60s pnpm admin:check` blocked: lint passed; Admin test phase failed existing baseline suites with 23 failed files and 38 failed tests, while the new `test/lib/http/client-csrf.test.ts` passed in the full run.
- Notes:
  - Final status remains blocked because the task card requires final `pnpm api:check` and `pnpm admin:check` gates, and those gates did not produce a clean pass in this checkout.
