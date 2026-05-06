# Admin State Management

This code-spec defines ownership for local UI state, URL state, server state, and global Admin state.

## Scenario: Choosing the Correct State Owner

### 1. Scope / Trigger

- Trigger: adding or changing stateful Admin UI, filters, forms, selection, server data, navigation state, or global stores.
- Applies to `useState`, React Query, TanStack Router search params, form state, and `src/stores/**`.

### 2. Signatures

- Server state: React Query
- Route/search state: TanStack Router search params
- Page-local UI state: component or page-local hook state
- Global UI state: `apps/admin/src/stores/**`
- API transport: `apps/admin/src/api/**`
- Persisted UI/session stores: Zustand `persist(...)` with explicit `localStorage` or `sessionStorage`
- Root route guard state reads: `useAuthStore.getState()` and `useWorkspaceStore.getState()` inside router lifecycle code

### 3. Contracts

- Server data must not be mirrored into global stores when React Query owns freshness and caching.
- URL-relevant state such as filters, tabs, pagination, source views, and search params should use typed TanStack Router search params when refresh/share/deep-link behavior matters.
- Route lifecycle state belongs to TanStack Router. Auth redirects, post-auth routing, welcome redirects, and document-title metadata stay in route/root-route code, not page effects.
- Route guards may read Zustand stores through `getState()` because they run outside React render. Components should select only the required store slice to avoid broad rerenders.
- Form draft state stays local to the form/dialog/page unless the workflow spans routes or sessions.
- Global Zustand stores are for durable client state that truly crosses pages or route lifecycles: auth/session tokens, auth challenges, current workspace/project context, user preferences, favorites, and recent UI choices.
- Persisted store fields are a client contract. Add migrations or explicit reset behavior when changing persisted shape; do not silently reinterpret old values as new semantics.
- Session-scoped auth challenges use `sessionStorage`; durable preferences/context/recent state use `localStorage` only when persistence across browser sessions is intended.
- Global stores must not hold backend list/detail results that React Query can fetch, cache, invalidate, and error-handle.
- Mutations must bind loading and disabled states to the real pending state.
- Save/reset feedback must be local, explicit, and tied to the action just triggered.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Data comes from backend | Store through React Query, not global store |
| State affects URL/share/deep link | Use route search params |
| State affects route guard/redirect decisions | Keep ownership in TanStack Router lifecycle and read stores through explicit snapshots |
| State is form-only | Keep local to form/page |
| State spans multiple unrelated pages | Consider `src/stores/**` |
| Zustand store uses persistence | Declare storage scope and migration/reset behavior |
| Persisted state shape changes | Add migration or explicit invalidation/reset path |
| Store selector returns whole store for a small component | Select only the needed fields/actions |
| Mutation pending | Disable conflicting actions and show real pending state |
| Mutation succeeds | Update/invalidate query state and show local feedback |

### 5. Good/Base/Bad Cases

- Good: table filters live in typed search params so refresh preserves the view.
- Good: dialog form state resets when the dialog closes.
- Base: sidebar collapse state lives in a UI store because multiple layout surfaces consume it.
- Base: auth token and current workspace context live in persisted stores because root route guards and layouts need them across reloads.
- Bad: workspace list API results are copied into a global store and manually synchronized.
- Bad: save button shows loading from local optimistic state instead of mutation pending state.
- Bad: a route guard is implemented in a page `useEffect`, causing protected content to render before redirect.
- Bad: persisted store shape is changed and old browser state is silently treated as valid new data.

### 6. Tests Required

- Search-param state requires parse/default tests.
- Mutations require tests for pending, success, error, and query invalidation behavior when logic is non-trivial.
- Global stores require tests for cross-page behavior when they coordinate multiple surfaces.
- Persisted stores require tests for storage scope and shape migration/reset when persisted fields change.
- Route guard changes require tests for redirect decisions and store snapshot interactions.

### 7. Wrong vs Correct

#### Wrong

```tsx
workspaceStore.setState({ workspaces: await listWorkspaces() })
```

#### Correct

```tsx
const query = useQuery({
  queryKey: ['workspaces'],
  queryFn: listWorkspaces,
})
```

React Query owns server-state freshness. Global stores own durable UI state only.
