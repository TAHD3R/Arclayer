# API Frontend Component Guidelines

This code-spec defines how frontend components should consume API contracts without becoming transport owners.

## Scenario: Contract-Aware UI Components

### 1. Scope / Trigger

- Trigger: building UI that renders backend API data or submits backend payloads.
- Applies to Product Application and Platform components consuming `packages/openapi`.

### 2. Signatures

- Generated data input: `type Props = { item: GeneratedType }`
- UI projection type: `*ViewModel`, `*Row`, `*FormState`
- Transport owner: app `src/api/**`
- Server-state owner: React Query hook/page orchestration
- Error-code source: shared error contract codes from backend/API layer
- Shared API contract: `docs/spec/shared/api-contracts.md`

### 3. Contracts

- Components receive typed data or UI view models; they do not fetch raw backend endpoints directly.
- Components should not parse API envelopes ad hoc.
- Components must not own React Query cache keys, invalidation, or transport side effects unless they are explicitly a page/controller component. Reusable presentational components receive data, pending/error flags, and callbacks.
- Components may render UI projections but must not define duplicated backend response shapes.
- Submit components should emit typed intent or form state; API layers perform transport conversion.
- Components that branch on backend error state must branch on stable error codes.
- Local component fallback states must be explicit user-visible states. Do not turn missing/failed API data into fake empty success.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Component needs backend data | Receive generated type or view model from parent/hook |
| Component needs to submit data | Emit typed form/intent object to hook/API layer |
| Component sees API envelope | Move envelope parsing to API layer |
| Reusable component owns `useQuery` or invalidation | Move server-state orchestration to hook/page controller |
| Component defines backend response shape | Replace with generated type import |
| Backend error changes UI branch | Match on stable error code and test that branch |

### 5. Good/Base/Bad Cases

- Good: a table component accepts `WorkspaceRow[]` derived from generated data.
- Good: a controller hook maps generated API data to `WorkspaceRow[]`, and the table only renders rows and callbacks.
- Base: a form component owns string input state before submit conversion.
- Bad: a component calls `fetch('/api/v1/...')` and reads `json.data.items`.
- Bad: a component catches API failure and renders an empty success state with no error affordance.

### 6. Tests Required

- Component tests should use typed fixtures that match generated shapes.
- Error-state tests should assert behavior for stable error codes.
- Presentational component tests should assert rendering and callbacks; hook/API tests should assert transport, query, and mapper behavior.

### 7. Wrong vs Correct

#### Wrong

```tsx
function WorkspaceList() {
  const [items, setItems] = useState([])
  useEffect(() => void fetch('/api/v1/workspaces').then(...), [])
}
```

#### Correct

```tsx
function WorkspaceList({ rows }: { rows: WorkspaceRow[] }) {
  return rows.map((row) => <WorkspaceListItem key={row.id} row={row} />)
}
```

Components render typed data; hooks and API layers own retrieval.
