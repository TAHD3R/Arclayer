# API Frontend Directory Structure

This code-spec defines frontend-facing API package ownership and generated contract placement.

## Scenario: Generated API Client and Consumer Boundary

### 1. Scope / Trigger

- Trigger: adding or changing frontend-facing API contracts, generated OpenAPI packages, API client exports, or shared type consumption.
- Applies to `packages/openapi`, Product API imports, and frontend code that consumes backend route contracts.

### 2. Signatures

- Generated API package: `packages/openapi`
- OpenAPI source artifact: `packages/openapi/openapi.json`
- OpenAPI generator config: `packages/openapi/openapi-ts.config.ts`
- OpenAPI generation command: `pnpm --filter @arclayer/openapi generate`
- Generated API import: `@arclayer/openapi`
- Consumer API layer: `apps/app/src/api/**`
- Shared contract specs: `docs/spec/shared/**`

### 3. Contracts

- Generated API output is the frontend-facing representation of backend route contracts.
- Frontend applications consume generated types through package exports, not by importing backend source.
- App-specific API transport and normalization lives in the app, not inside generated packages.
- `packages/openapi` owns generated clients and generated boundary types only. It must not import application source, app stores, React Query hooks, or UI components.
- OpenAPI artifacts are generated from backend schemas. Do not hand-edit generated JSON/client/type files; fix the backend schema or generator config and regenerate.
- Consumer apps wrap generated types in app API functions where auth, base URL, envelope normalization, and app-level error mapping belong.
- Do not create `packages/contracts` or `@arclayer/contracts` as a parallel API contract source.
- Changes to generated client shape must be paired with backend schema changes and consumer typecheck.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Backend route schema changes | Regenerate/check OpenAPI and update frontend consumers |
| Generated file appears wrong | Fix backend schema or generator config, then regenerate |
| Frontend imports backend source type | Replace with generated package import |
| Generated package exports duplicated local aliases | Prefer direct generated type exports |
| Generated package needs app auth/base URL behavior | Keep that in app API layer or shared HTTP helper, not generated package internals |
| App needs transport normalization | Implement in app `src/api/**`, not generated package internals |

### 5. Good/Base/Bad Cases

- Good: the Product Application imports `WorkspaceOut` from `@arclayer/openapi`.
- Good: a backend response schema change is followed by `@arclayer/openapi` generation and `pnpm app:check`.
- Base: app API layer wraps generated response shape with app-specific error handling.
- Bad: a frontend app imports `apps/api/src/modules/workspaces/schema.py` concepts through a handwritten TS copy.
- Bad: generated OpenAPI output is patched manually to satisfy a frontend type error.

### 6. Tests Required

- Run frontend typecheck after generated type changes.
- Add consumer tests for API normalization when behavior changes.
- Backend route tests must cover response shapes before generated frontend consumers rely on them.
- Cross-layer API changes require backend route checks plus affected frontend checks; use `pnpm check` when both a frontend application and API are involved.

### 7. Wrong vs Correct

#### Wrong

```typescript
import type { WorkspaceOut } from '../../../apps/api/src/modules/workspaces/schema'
```

#### Correct

```typescript
import type { WorkspaceOut } from '@arclayer/openapi'
```

Generated package exports are the frontend boundary.
