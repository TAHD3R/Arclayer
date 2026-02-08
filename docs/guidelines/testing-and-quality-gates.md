# Testing and Quality Gates (CelestialCMS)

This document defines mandatory quality checks, testing scope, and merge gates.
It is a normative guideline for backend, admin frontend, and portal frontend changes.

## 1. Goals

- Catch regressions before merge.
- Keep quality expectations explicit per change type.
- Standardize command usage and evidence in PR review.
- Prefer behavior/path coverage over superficial line coverage.

## 2. Scope

This guideline applies to all authored code changes in:

- `apps/api`
- `apps/web/admin`
- `apps/web/portal`
- Shared packages under `packages/*` used by the above apps

## 3. Command Execution Rules (mandatory)

- Run checks through `package.json` scripts (`pnpm <script>` / `pnpm --filter <pkg> <script>` / `pnpm -C <dir> <script>`).
- Do not call `.venv` binaries directly.
- Prefer root orchestrated commands for cross-app validation, and filtered commands for focused validation.

## 4. Quality Gate Baseline

### 4.1 Backend (`apps/api`)

Minimum pass conditions:

- Ruff check/format
- Pyright typecheck
- Unit/integration-relevant pytest suites

Canonical commands:

- `pnpm api:check`
- `pnpm api:test`
- Optional focused execution: `pnpm --filter @celestial/api test:integration`

### 4.2 Admin frontend (`apps/web/admin`)

Minimum pass conditions:

- Lint
- Format
- Typecheck
- Vitest suite

Canonical command:

- `pnpm admin:check`

### 4.3 Portal frontend (`apps/web/portal`)

Minimum pass conditions:

- Lint
- Format
- Typecheck
- Vitest suite

Canonical commands:

- `pnpm portal:check`
- `pnpm --filter @celestial/portal test`

## 5. Change-Type to Required Checks Matrix

| Change type | Required checks before review | Additional checks before merge |
| --- | --- | --- |
| Backend router/service/repository/schema | `pnpm api:check` | Integration tests if DB/cache/auth behavior changed |
| Backend shared contract (`common`, `core/http`, error contracts) | `pnpm api:check` | Impacted frontend checks (`admin:check`, portal tests) when API shape changes |
| Admin UI/page/api layer | `pnpm admin:check` | `pnpm check` for cross-app or shared package impact |
| Portal runtime/page/component | `pnpm portal:check` + portal `test` | `pnpm check` for shared package impact |
| Shared packages used by multiple apps | Relevant filtered checks per consumer app | `pnpm check` |
| i18n contract/error-code mapping | Backend + affected frontend checks | Verify both locales and error mapping behavior |

## 6. Coverage Expectations

- Backend unit tests target: 70%-90% for critical logic paths.
- Backend integration tests target: 40%-60% for critical end-to-end behavior.
- Frontend critical flows (publish, configuration, permissions, billing-like high-risk paths) require interaction-level tests.
- Coverage discussions focus on behavior/path completeness, not only aggregate percentage.

## 7. Test Design Principles

- Test observable behavior, not implementation internals.
- Prioritize deterministic tests with stable fixtures.
- Keep test setup explicit; avoid hidden global state dependencies.
- Add regression tests for every bugfix with user-visible impact.

## 8. Flaky Test and Exception Policy

### 8.1 Flaky tests

- Do not silently re-run until green as a merge strategy.
- Identify and fix root cause (race condition, shared state, environment coupling).
- If temporary quarantine is unavoidable, mark with explicit reason and owner, then track follow-up removal.

### 8.2 Temporary gate exceptions

Temporary skip/xfail/waiver requires all of:

1. Explicit rationale in code comment and PR description
2. Owner and deadline/date for removal
3. Linked remediation issue/task
4. Risk statement of what is no longer protected

Unbounded temporary exceptions are not allowed.

## 9. PR Evidence Requirements

Every non-trivial PR should include:

- Commands executed
- Pass/fail status
- Scope statement for what was tested manually
- Notes on intentionally deferred checks (if any) with rationale

Example evidence block:

```text
Executed:
- pnpm api:check
- pnpm admin:check
Result:
- all passed
Manual verification:
- verified site creation and publish flow in admin
```

## 10. CI and Local Responsibility

- Local checks are required before requesting review.
- CI is enforcement and cross-environment validation, not a substitute for local verification.
- If local and CI results diverge, resolve root cause instead of bypassing failing jobs.

## 11. Anti-Patterns

- Treating formatting/lint/type checks as optional.
- Merging API contract changes without consumer-side verification.
- Adding broad `skip`/`xfail` without expiration and ownership.
- Relying only on line coverage while missing critical behavior paths.
