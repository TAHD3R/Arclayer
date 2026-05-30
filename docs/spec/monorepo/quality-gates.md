# Monorepo Quality Gates

This code-spec defines validation scope, lint/format/typecheck/test expectations, and evidence requirements for Arclayer monorepo changes.

## Scenario: Selecting and Reporting the Correct Quality Gate

### 1. Scope / Trigger

- Trigger: changing app code, package code, root scripts, generated contracts, database schema, API routes, UI behavior, shared packages, or specs that define implementation contracts.
- Applies to all code under `apps/*`, `packages/*`, `scripts/*`, root orchestration files, and generated artifacts when they are intentionally regenerated.

### 2. Signatures

- Admin-only gate: `pnpm admin:check`
- API-only gate: `pnpm api:check`
- CLI gate: `pnpm cli:check`
- Cross-app gate: `pnpm check`
- Root format command: `pnpm format`
- Turbo tasks used by checks: `lint`, `format`, `typecheck`, `test`, `build`
- Backend focused test timeout: 60 seconds for narrow backend test nodes

### 3. Contracts

- Choose the narrowest gate that covers the changed behavior, then broaden when contracts cross packages/apps.
- Lint, format, typecheck, and tests are not interchangeable. A pass is meaningful only when the selected command includes the checks relevant to the changed package.
- API shape changes must verify backend route/schema behavior and affected frontend generated-type consumers.
- Shared package changes must verify at least one affected consumer app. Use `pnpm check` when multiple primary apps can be affected.
- UI behavior changes require component/hook tests and Playwright or screenshot verification when the risk is visual, responsive, or browser-runtime sensitive and a runtime is available.
- Generated artifacts are verified by source-driven regeneration and review, not by manual edits.
- Do not add `skip`, `xfail`, fake success returns, silent fallbacks, or broad casts to make gates pass. Expose the failure and fix the root cause.
- Final handoff evidence must name exact commands run, pass/fail result, and any blocked verification with a concrete reason.

### 4. Validation & Error Matrix

| Change type | Required gate |
|---|---|
| Admin page/component/hook/store/API consumer | `pnpm admin:check` |
| API router/service/repository/schema/core behavior | `pnpm api:check` |
| Shared package used by Admin/API | Affected package check plus consumer gate; usually `pnpm check` |
| API contract consumed by frontend | Backend check, OpenAPI generation/check, and affected frontend check |
| Root `package.json`, `turbo.json`, workspace config | Execute the changed script/task path and relevant root gate |
| CLI package behavior | `pnpm cli:check` |
| Focused backend test node | Use package-script/uv path with a 60-second timeout |
| Runtime visual verification unavailable | State blocker and run static/unit checks that still cover the changed code |

### 5. Good/Base/Bad Cases

- Good: a backend response-field rename runs `pnpm api:check`, regenerates OpenAPI, and runs `pnpm admin:check`.
- Good: a shared UI primitive change runs the package tests and Admin checks for affected surfaces.
- Good: a root Turbo task edit is followed by the root script that uses that task.
- Base: a pure `docs/spec` documentation update runs mechanical Markdown checks instead of app test suites because no app behavior changed.
- Bad: reporting “tests passed” after only running a formatter.
- Bad: adding a defensive fallback that returns empty data after an API error to make UI tests pass.
- Bad: ignoring a generated artifact diff because typecheck still passes.

### 6. Tests Required

- Add or update tests at the changed behavior boundary: backend route/service/repository, frontend component/hook/store, API mapper, shared package primitive, or route/search contract.
- Add regression tests for bug fixes that changed observable behavior.
- Add convention tests for repeatable repo rules when they can be enforced mechanically.
- For specs-only work, run mechanical checks for links, indexes, duplicate task context, placeholder residue, and required topic coverage.

### 7. Wrong vs Correct

#### Wrong

```text
Verification: looks good locally
```

#### Correct

```text
Executed:
- pnpm admin:check
Result:
- passed
Manual verification:
- checked settings dialog responsive layout in Playwright
```

Quality evidence must be reproducible and tied to the changed behavior.
