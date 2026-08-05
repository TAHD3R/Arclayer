# Product Application Hook Guidelines

This code-spec defines Product Application hook placement, data fetching, and side-effect ownership.

## Scenario: Feature Hooks and Server-State Hooks

### 1. Scope / Trigger

- Trigger: adding or changing React hooks in `apps/app`.
- Applies to page-local hooks, shared Product Application hooks, React Query hooks, URL/search hooks, and hooks that call Product Application API transport functions.

### 2. Signatures

- Hook naming: `use<Thing>()`
- Page-local hook path: `apps/app/src/pages/<domain>/<feature>/hooks/**`
- App-local shared hook path: `apps/app/src/hooks/**`
- API transport path: `apps/app/src/api/**`
- Server state owner: React Query
- Query client factory: `apps/app/src/lib/query/query-client.ts`
- Query error suppression flag: `meta: { silent: true }`
- Shared hook package: `@arclayer/hooks`

### 3. Contracts

- Hooks may orchestrate state and effects, but transport functions live in `src/api/**`.
- Server state belongs in React Query hooks or page/query orchestration, not global UI stores.
- React Query keys must include every parameter that changes the result, including tenant/workspace/project ids, filters, pagination, session-version inputs, and locale-like parameters when they alter backend data.
- Query hooks should rely on the global query client defaults unless a different freshness contract is real. The current default is no automatic retry, no refetch on window focus/reconnect, `staleTime: 30_000`, and `gcTime: 5 * 60_000`.
- Use `meta: { silent: true }` only when the surface owns an explicit local error state or when a background query must not toast. Silent queries still must expose failure through local UI when the data is required for the screen.
- Mutations must invalidate or update every affected query family. If a mutation changes list and detail state, both keys need explicit handling.
- Hooks that require route params/search should consume typed TanStack Router APIs from the route boundary or receive the values as parameters. They must not parse `window.location` or import route files into shared hook packages.
- Page-local hooks stay with the page domain until reuse crosses domain boundaries.
- Shared hooks must not import from page directories.
- Hooks promoted to `@arclayer/hooks` must not import Product Application-only stores, route APIs, i18n namespaces, or API transport.
- Hooks must expose typed return values and explicit pending/error states.
- Hooks that mutate server data must invalidate or update the relevant query state explicitly.
- Browser-only effects must stay guarded by React lifecycle and should not run during module import.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Hook calls `fetch` directly | Move transport to `src/api/**` unless browser-native flow requires direct call |
| Hook reused across unrelated page domains | Promote to `src/hooks/**` or `packages/hooks` |
| Hook promoted to `packages/hooks` imports Product Application-only code | Keep it in Product Application or inject dependencies as parameters |
| Query key omits an API-affecting parameter | Add the parameter to the key before shipping |
| Query sets `meta.silent` but the UI has no error state | Add explicit local error handling or remove silence |
| Mutation changes server data | Invalidate/update relevant React Query cache |
| Hook stores server state in Zustand/local store | Replace with React Query server state |
| Hook reads route state through browser globals | Use typed route params/search or pass values in |
| Hook hides error state | Return or throw an explicit typed error path |

### 5. Good/Base/Bad Cases

- Good: `useWorkspaceMembers` calls `listWorkspaceMembers` from `src/api` and returns query state.
- Good: a background title query sets `meta: { silent: true }` because the visible page state is not blocked by that query.
- Good: an asset mutation invalidates list, detail, folders, and tags queries that can display changed data.
- Good: page-local hook keeps filter UI state next to its page until another domain needs it.
- Base: a hook wraps `useSearch`/navigation to keep URL state typed.
- Bad: a hook imports a route file to get path params.
- Bad: a shared hook imports a feature page component or page-local constant.
- Bad: a mutation only updates local state while stale React Query cache continues rendering old backend data.

### 6. Tests Required

- Data hooks require tests for success, loading, error, and invalidation behavior when logic is non-trivial.
- Query-key helpers require tests that prove all API-affecting inputs appear in the key.
- URL/search hooks require tests for parsing defaults and invalid values.
- Mutation hooks require tests for disabled/pending behavior where user actions depend on it.

### 7. Wrong vs Correct

#### Wrong

```tsx
export function useMembers() {
  return useQuery({ queryFn: () => fetch('/api/v1/members').then((r) => r.json()) })
}
```

#### Correct

```tsx
export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers({ workspaceId }),
  })
}
```

The hook owns query state; the API layer owns transport.
