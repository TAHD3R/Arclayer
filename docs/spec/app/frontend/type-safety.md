# Product Application Type Safety

This code-spec defines frontend type ownership and safe TypeScript patterns for Product Application.

## Scenario: Generated API Types and UI Projection Types

### 1. Scope / Trigger

- Trigger: adding or changing Product Application API consumers, shared types, form payloads, table rows, generated OpenAPI usage, or type assertions.
- Applies to `apps/app/src/api`, `types`, `pages`, `hooks`, and generated imports from `@arclayer/openapi`.

### 2. Signatures

- Generated API types: `@arclayer/openapi`
- Product Application UI-only types: `*ViewModel`, `*Row`, `*FormState`, `*UiState`
- Typed route search/params: TanStack Router `validateSearch`, `Route.useSearch()`, `Route.useParams()`
- React Query key type pattern: readonly tuple keys or stable object members that include all API-affecting inputs
- TypeScript ban target: `any`
- API contract spec: `docs/spec/shared/api-contracts.md`

### 3. Contracts

- Backend request/response types are imported from generated OpenAPI packages.
- Product Application-local types may model UI projections only; they must not copy backend payload fields as a shadow contract.
- Route search types are route contracts. Parse unknown search input in `validateSearch`, return a typed object, and consume that typed object from the page/hook layer.
- Query keys are typed cache contracts. Use stable tuple/object members and include every variable that changes the returned data.
- Avoid `any`; use `unknown` at untrusted boundaries and narrow explicitly.
- Type assertions must be local, justified, and backed by runtime or generated contract evidence.
- Prefer discriminated unions for UI state machines instead of boolean flag clusters.
- Form submit payloads should be typed against generated request shapes or narrow API-layer input types.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Frontend needs backend response field | Import generated response type |
| Frontend builds submit payload | Type against generated request shape or API-layer input |
| Route accepts search params | Narrow from `Record<string, unknown>` in `validateSearch` |
| Component receives route params/search | Use typed route API result or receive typed props from route/page |
| Query key carries typed filters | Keep keys serializable and include all API-affecting fields |
| Raw unknown data crosses boundary | Validate/narrow before use |
| `any` appears in Product Application source | Replace with generated type, `unknown`, or a narrow local type |
| Local type duplicates backend `*Response` | Treat as contract drift and remove |

### 5. Good/Base/Bad Cases

- Good: `WorkspaceRow` extends or maps from generated `WorkspaceOut`.
- Good: API layer accepts a narrow typed input object and returns generated response data.
- Good: route `validateSearch` converts invalid `page` to a typed default before the page uses it.
- Good: a query key helper returns `["assets", "list", scopeKey, filters] as const`.
- Base: a page-local `FormState` stores additional dirty flags and string inputs before submit.
- Bad: `type ContentModelResponse = { ... }` duplicates backend schema fields locally.
- Bad: `const data = response as any` bypasses generated contract drift.
- Bad: page code casts `useSearch({ strict: false }) as FeatureSearch` instead of using a route-specific validated search API.

### 6. Tests Required

- Run `pnpm app:check` after Product Application type or API consumer changes.
- API consumer tests should fail when normalization assumptions drift.
- Form tests should assert conversion from UI form state to generated request payload where transformation exists.
- Route search tests should cover invalid raw input, omitted input, and the typed object consumed by the page.

### 7. Wrong vs Correct

#### Wrong

```typescript
const model = response as any
return model.storageSync
```

#### Correct

```typescript
import type { ContentModelSchemaChangePlanOut } from '@arclayer/openapi'

function getStorageSync(plan: ContentModelSchemaChangePlanOut) {
  return plan.storageSync
}
```

Generated types should make contract drift visible at typecheck time.
