# API Frontend State Management

This code-spec defines state ownership for frontend API data and contract-derived UI state.

## Scenario: Server State vs UI Projection State

### 1. Scope / Trigger

- Trigger: adding or changing state that is derived from backend API data.
- Applies to generated API data, normalized view models, form state, cache invalidation, and route/search parameters.

### 2. Signatures

- Server state: React Query
- Generated type source: `@arclayer/openapi`
- UI projection: `*ViewModel`, `*Row`, `*FormState`
- Route/search state: router search params where deep-linkable
- Global client state: Zustand only for non-server UI/session state
- API transport owner: app `src/api/**`

### 3. Contracts

- Backend data freshness belongs to server-state tooling.
- UI projection state must be derived from generated API data or form inputs, not stored as a second source of truth.
- Derived UI projections should be computed in API mappers, hooks, or memoized page/controller code. Do not persist derived rows as independent global state unless the projection is a user-authored draft.
- Form drafts may diverge from generated request types until submit, but conversion must be explicit and typed.
- URL/search state owns filters that must survive refresh or sharing.
- If a filter affects an API result, it belongs in both the route/search contract when shareable and the React Query key for cache correctness.
- Zustand stores must not cache generated API responses or normalized backend lists. Store ids, UI preferences, current context, draft/session state, or recent choices only when they are client-owned.
- Do not fake success by keeping stale state after failed API writes.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Backend list/detail data loaded | Store through React Query |
| Filter affects API query | Put in query key and route/search state when shareable |
| Form draft differs from API payload | Convert through typed submit mapper |
| Derived row/list is purely display data | Derive from generated data instead of persisting separately |
| Cross-page state is a selected backend entity id | Store the id/context; fetch entity data through React Query |
| Cross-page state is backend entity payload | Do not store in Zustand; use React Query |
| Mutation fails | Surface error state and preserve unsaved input |
| Mutation succeeds | Update/invalidate server state |

### 5. Good/Base/Bad Cases

- Good: search filters are encoded in route search params and query keys.
- Good: `currentWorkspaceId` is persisted as client context while workspace details are fetched through React Query.
- Base: form state stores strings before converting to generated request payload.
- Bad: failed save keeps optimistic UI and hides the error.
- Bad: a global store keeps `WorkspaceOut[]` and tries to reconcile it after every mutation.

### 6. Tests Required

- Mapper tests for form-state to request-payload conversion.
- Mutation tests for success/error/cache behavior.
- Search-param tests for API-affecting filters.
- Store tests when API-derived ids/context influence which query keys are enabled or invalidated.

### 7. Wrong vs Correct

#### Wrong

```typescript
setRows(await listRows())
```

#### Correct

```typescript
useQuery({ queryKey: ['rows', filters], queryFn: () => listRows(filters) })
```

API data remains server state.
