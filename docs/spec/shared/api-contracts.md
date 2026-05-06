# Shared API Contracts

This code-spec defines API response ownership and frontend consumption boundaries.

## Scenario: Backend-Owned API Shape, Generated Frontend Consumption

### 1. Scope / Trigger

- Trigger: adding or changing backend routes, response models, request bodies, generated OpenAPI output, or frontend API consumers.
- Applies to Admin `/api/v1`, Content API `/content-api/v1`, generated delivery routes, and shared frontend transport code.

### 2. Signatures

- Backend response envelope: `ApiResponse[T]`
- Backend failure envelope: `ApiResponse.fail(message=..., error=..., meta=...)`
- Backend route declaration: `@router.get(..., response_model=<SchemaOut>)`
- Frontend generated type source: `@arclayer/openapi` or `@arclayer/openapi/admin-types`
- Admin transport location: `apps/admin/src/api/*`
- Admin view-model location: `apps/admin/src/types/**` for UI-only projections

### 3. Contracts

- Backend Pydantic schemas own external request and response shapes.
- OpenAPI generation is the single source for frontend API boundary types.
- Frontend code must import backend request/response types from generated OpenAPI packages rather than duplicating `*Request` or `*Response` shapes locally.
- Admin `src/types/**` may define `*ViewModel`, `*Row`, `*FormState`, and `*UiState` types only when they are presentation projections.
- API normalization belongs in `apps/admin/src/api/*` or shared HTTP helpers, not in page JSX.
- Backend routes must expose stable path parameters, query parameters, response model fields, and error codes before frontend code depends on them.
- Breaking API changes require backend tests plus frontend consumer review.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Backend response field is added | Pydantic schema and OpenAPI output expose it; frontend imports generated type |
| Backend response field is renamed or removed | Update frontend consumers in the same task or document an explicit migration plan |
| Frontend needs a UI-only projection | Define a `ViewModel`/`Row`/`FormState` type separate from generated response types |
| Frontend defines a duplicated backend `*Response` type | Treat as a contract drift bug |
| Route returns raw dict without response model | Add a schema response model or documented raw response exception |
| Content API public route differs from Admin envelope | Document the route-specific contract in backend and shared specs |

### 5. Good/Base/Bad Cases

- Good: a backend schema exposes `storage_sync`, OpenAPI generation updates, and Admin imports the generated type.
- Good: Admin transport normalizes an API envelope once and pages consume typed data.
- Base: a frontend table row type derives from generated data and adds display-only fields.
- Bad: Admin defines `ContentModelResponse` locally with fields copied from backend schema.
- Bad: a route handler returns `{"data": data}` without a response model and frontend code guesses the shape.

### 6. Tests Required

- Backend route tests assert response fields and error codes.
- OpenAPI generation/typecheck must run when route contracts change.
- Frontend typecheck must fail if generated fields drift from consumers.
- Consumer tests should cover normalization logic where the API layer transforms envelopes.

### 7. Wrong vs Correct

#### Wrong

```typescript
type WorkspaceResponse = {
  id: string
  name: string
}
```

#### Correct

```typescript
import type { WorkspaceOut } from '@arclayer/openapi/admin-types'

type WorkspaceRow = WorkspaceOut & {
  displayName: string
}
```

Generated API types own the backend contract. Local types may add UI projection only.
