# API Frontend Quality Guidelines

This code-spec defines quality gates for frontend API contract consumption.

## Scenario: Frontend API Contract Quality

### 1. Scope / Trigger

- Trigger: changing generated API consumers, API transport helpers, frontend schema usage, hooks, or state derived from backend data.
- Applies to frontend packages and apps that depend on `packages/openapi`.

### 2. Signatures

- Generated package: `packages/openapi`
- Generate command: `pnpm --filter @arclayer/openapi generate`
- Shared contract source: `docs/spec/shared/**`
- Admin quality gate: `pnpm admin:check`
- Cross-app quality gate: `pnpm check`

### 3. Contracts

- API contract changes must fail visibly through typecheck when consumers drift.
- Do not add fallback shapes or mock success paths to hide backend/frontend contract mismatch.
- Frontend API layers must preserve meaningful backend error codes.
- Data mappers must be tested when they transform generated data into UI projections.
- Generated contracts and app consumers should be updated in the same task for breaking shape changes.
- Regenerated API artifacts must be reviewed as generated output. If the generated diff is wrong, fix backend schemas or generator config and regenerate instead of editing generated artifacts.
- Query/cache behavior is part of API contract consumption. Review query keys, `enabled`, `meta.silent`, invalidation, and error propagation for each changed hook.
- During a small isolated change, run the nearest app static check and focused
  mapper/hook/component test. At a coherent milestone or before handoff, run
  the affected application gate. Reserve `pnpm check` for cross-app integration
  or final delivery.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Generated type no longer matches consumer | Fix consumer or backend schema; do not cast through `any` |
| Backend error code is needed for UI | Preserve it through API/hook layer |
| OpenAPI generated diff is unexpected | Fix schema/config source and regenerate |
| API mapper changes | Add/update mapper tests |
| Query key or invalidation changes | Add/update hook tests for cache behavior |
| Shared contract changes | Review backend and frontend affected specs |
| Contract mismatch appears in runtime | Add regression test at the boundary that missed it |

### 5. Good/Base/Bad Cases

- Good: OpenAPI type drift breaks `pnpm admin:check`, then the consumer is fixed.
- Good: a breaking response rename is covered by backend route tests, regenerated OpenAPI types, mapper tests, and `pnpm admin:check`.
- Base: non-breaking field addition updates UI only when the feature needs it.
- Bad: frontend catches parsing failure and returns `{ ok: true, data: [] }`.
- Bad: generated types are manually cast to old names to avoid updating consumers.

### 6. Tests Required

- Run the nearest app-specific typecheck and focused consumer test during the
  change; run the affected application gate at a coherent milestone or before
  handoff.
- Run `pnpm check` for cross-app integration or final delivery when shared
  packages or cross-app contracts change.
- Add tests around API normalization and generated type mappers.
- Add hook tests for query keys, `enabled`, error-code propagation, and mutation invalidation when logic is non-trivial.

### 7. Review Checklist

- [ ] Generated types are used directly for backend request/response boundaries.
- [ ] Local types are UI projections only.
- [ ] Error codes survive API and hook layers.
- [ ] Query keys include API-affecting parameters.
- [ ] Mutations update or invalidate affected server state.
- [ ] No silent fallback or fake success path hides contract failures.

### 8. Wrong vs Correct

#### Wrong

```typescript
async function listRows() {
  try {
    return await requestRows()
  } catch {
    return { items: [] }
  }
}
```

#### Correct

```typescript
async function listRows() {
  const response = await requestRows()
  return normalizeRows(response)
}
```

Contract failures should surface through the API/hook error path so backend/frontend drift can be fixed at the boundary.
