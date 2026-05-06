# API Frontend Hook Guidelines

This code-spec defines hooks that consume generated API contracts and app API layers.

## Scenario: Generated-Type Data Hooks

### 1. Scope / Trigger

- Trigger: adding or changing hooks that load, mutate, normalize, or cache backend API data.
- Applies to app hooks built on generated API types and transport functions.

### 2. Signatures

- Hook naming: `use<Domain><Action>()`
- Transport owner: app `src/api/**`
- Server-state owner: React Query
- Generated type source: `@arclayer/openapi` or app-specific generated export
- Global query client defaults: `apps/admin/src/lib/query/query-client.ts`
- Query error suppression: `meta: { silent: true }`

### 3. Contracts

- Hooks call typed API layer functions; they do not duplicate request construction scattered through components.
- Query keys must include every parameter that affects returned data.
- Query keys are API cache contracts and should be stable enough for invalidation. Prefer a domain tuple such as `["workspace", "detail", workspaceId]` or a named key helper when multiple hooks/mutations share the key family.
- Query `enabled` conditions must reflect real missing inputs. A disabled query must not be used to hide invalid state that should be a validation error.
- The global query client disables automatic retry and focus/reconnect refetch by default. Do not add per-query retry/fallback behavior unless the product contract explicitly wants retry and the UI exposes the state.
- `meta: { silent: true }` suppresses global toasts only. The hook/page still owns visible error behavior when the query data is required.
- Mutation hooks must invalidate or update affected queries explicitly.
- Mutation hooks must propagate backend error codes and response details needed by the UI. They must not collapse structured errors into generic strings too early.
- Hooks return typed data and explicit pending/error states.
- Hooks should preserve backend error codes for component-level handling.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Request parameter changes data | Include it in query key |
| Required input is missing | Disable query only when missing input is expected; otherwise surface validation error |
| Query is background/non-blocking | `meta: { silent: true }` is allowed with local state strategy |
| Mutation changes list/detail data | Invalidate/update affected queries |
| Backend error code is meaningful to UI | Preserve code through hook return/error path |
| Hook duplicates transport parsing | Move parsing to API layer |
| Hook retries failed writes automatically | Remove retry unless the workflow explicitly supports retry semantics |

### 5. Good/Base/Bad Cases

- Good: `useWorkspace(workspaceId)` includes `workspaceId` in its query key.
- Good: mutation success invalidates `["workspace", "detail", workspaceId]` and the list key that can show the same entity.
- Good: a background breadcrumb query uses `meta: { silent: true }` while the page-level data query renders a visible error state.
- Base: hook maps generated response to a view model once for a feature.
- Bad: hook swallows API error and returns an empty list as fake success.
- Bad: a hook uses `["members"]` for all workspaces and relies on manual local filtering.

### 6. Tests Required

- Query hooks require tests for key composition and enabled/disabled behavior when non-trivial.
- Mutation hooks require tests for invalidation and surfaced errors.
- Error propagation tests should assert stable backend error codes remain available at the component boundary when UI branches on them.

### 7. Wrong vs Correct

#### Wrong

```typescript
return useQuery({ queryKey: ['members'], queryFn: () => listMembers(workspaceId) })
```

#### Correct

```typescript
return useQuery({ queryKey: ['members', workspaceId], queryFn: () => listMembers(workspaceId) })
```

Cache keys are part of the API consumption contract.
