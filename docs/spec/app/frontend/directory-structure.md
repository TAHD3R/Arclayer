# Product Application Frontend Directory Structure

This code-spec defines file placement and ownership for `apps/app` and Product Application-facing shared packages.

## Scenario: Route, Page, API, and Shared UI Placement

### 1. Scope / Trigger

- Trigger: adding, moving, or reviewing Product Application frontend files.
- Applies to `apps/app/src/routes`, `pages`, `api`, `components`, `layouts`, `lib`, `hooks`, `stores`, `types`, and Product Application-facing `packages/*`.

### 2. Signatures

- Route shell: `apps/app/src/routes/**`
- Page composition: `apps/app/src/pages/**/page.tsx`
- Route metadata: `staticData.titleKey`
- Route search parser: `validateSearch(search: Record<string, unknown>)`
- Product Application API transport: `apps/app/src/api/**`
- HTTP helpers: `apps/app/src/lib/http/**`
- Path/query helpers: `apps/app/src/lib/api/**`
- Reusable Product Application UI: `apps/app/src/components/**`
- Layout shells: `apps/app/src/layouts/**`
- Generated API types: `@arclayer/openapi` and `@arclayer/openapi`
- Shared package surfaces: `@arclayer/ui`, `@arclayer/hooks`, `@arclayer/lib`, `@arclayer/web`

### 3. Contracts

- Route files own routing metadata, guards, redirects, search validation, and lazy bindings.
- Route files must not own API calls, React Query orchestration, dense JSX, or business transformations.
- Page routes must declare `staticData.titleKey` so `RouteDocumentTitleManager` remains the single document-title owner.
- Route search params must be parsed and defaulted in `validateSearch`; page code should consume typed route search through route APIs instead of reparsing `window.location`.
- Page directories own feature composition and may keep local `components/`, `hooks/`, `types.ts`, `utils.ts`, and `constants.ts` when those files help readability.
- `page.tsx` is the page entry and should delegate dense UI to local components when the screen grows.
- Transport functions live in `src/api/**`; shared HTTP behavior belongs in `src/lib/http/**`.
- Shared package promotion is required when code becomes cross-app or foundational: UI primitives/tokens go to `packages/ui`, reusable non-Product Application hooks to `packages/hooks`, shared runtime helpers to `packages/lib` or `packages/web`, and generated API contracts to `packages/openapi`.
- Domain-local shared folders such as `pages/workspaces/shared/**` are allowed only inside that domain. If a second unrelated domain consumes the code, promote it to an app/shared package boundary instead of importing across page domains.
- Generated files such as route trees and OpenAPI output are tooling artifacts; change source config/schema and regenerate rather than hand-editing generated output.
- Do not import source files from another app.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Route file contains API calls or query orchestration | Move logic to page/API layer |
| Page route lacks `staticData.titleKey` | Add a translation key and let `RouteDocumentTitleManager` resolve it |
| URL filter/search state is parsed in page JSX | Move parser/defaulting into route `validateSearch` |
| Page-local helper is reused across unrelated page domains | Promote to `src/lib`, `src/components`, or `packages/*` |
| Domain-local `shared/**` is imported from another page domain | Promote to app-level or package-level shared code |
| Backend request/response shape appears in `src/types/api` | Replace with generated OpenAPI import |
| Generated file needs manual tweak | Fix the generator input and rerun the generator |
| New feature under `/w/$workspaceId/*` | Place page code under `pages/workspaces/**` |
| New feature under `/usercenter/*` | Place page code under `pages/usercenter/**` |
| Root/global flow | Place page code under `pages/<feature>/**` |

### 5. Good/Base/Bad Cases

- Good: route file exports `createFileRoute` with `staticData.titleKey`, while the page lives under `pages/workspaces/.../page.tsx`.
- Good: route file uses `validateSearch` for tab/filter/page defaults, then the page reads typed search via the route API.
- Good: `src/api/workspaces.ts` normalizes API data once and page components consume typed hooks.
- Good: a reusable date formatting hook that serves multiple apps lives in `packages/hooks`.
- Base: a small page keeps local components inside `page.tsx` until splitting improves readability.
- Bad: route file fetches workspace data and renders a full management screen.
- Bad: Product Application copies backend `WorkspaceOut` into a local `WorkspaceResponse` type.
- Bad: `pages/usercenter/**` imports `pages/workspaces/shared/**` directly.

### 6. Tests Required

- Route changes require navigation or route validation tests where behavior changes.
- `staticData.titleKey` coverage belongs to route convention tests when routes are added.
- Search-param changes require tests for invalid values, default values, and link persistence when filters are shareable.
- API transport changes require typecheck and focused unit tests for normalization.
- Shared UI placement changes require convention tests when a rule is enforceable.

### 7. Wrong vs Correct

#### Wrong

```tsx
export const Route = createFileRoute('/w/$workspaceId/content')({
  component: () => {
    const data = useQuery({ queryFn: () => fetch('/api/v1/...') })
    return <LargeContentScreen data={data} />
  },
})
```

#### Correct

```tsx
export const Route = createFileRoute('/w/$workspaceId/content')({
  staticData: { titleKey: 'content.title' },
  component: ContentPage,
})
```

The route binds metadata and page entry. The page owns composition and the API layer owns transport.
