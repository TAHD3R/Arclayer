# Frontend Folder Architecture (`apps/web`)

This document defines the target frontend architecture for CelestialCMS. It is a normative guideline for Admin and Portal applications, plus cross-app shared packages.

## 1. Goals

- Keep Admin and Portal boundaries explicit and maintainable.
- Keep UI code, data access, and runtime infrastructure responsibilities separated.
- Enforce cross-app reuse through `packages/*` instead of copy-paste.
- Preserve strong typing and human-readable code structure as default constraints.

## 2. Scope

This guideline applies to:

- `apps/web/admin`
- `apps/web/portal`
- Cross-app shared frontend packages in `packages/*` (especially `web-core`, `web-types`, and protocol packages)

## 3. Canonical Layer Map

| Layer | Location | Responsibility | Must Not Own |
| --- | --- | --- | --- |
| App routing shell | `admin/src/routes`, `portal/pages`, `portal/renderer`, `portal/server` | Route entry, rendering shell, route-level guards/composition | Business workflow implementation |
| Feature/page composition | `admin/src/pages`, `portal/src/features` | Feature orchestration and page behavior | Transport/client primitives and global infra concerns |
| Data access layer | `admin/src/api`, `portal/src/runtime/*api*` | API contracts, request helpers, response normalization | JSX rendering logic |
| Shared app internals | `admin/src/lib`, `admin/src/hooks`, `portal/src/runtime` (non-API helpers) | App-local reusable helpers | Cross-app contracts that belong in packages |
| UI building blocks | `admin/src/components`, `portal/src/components` | Reusable UI components and presentation units | Domain persistence logic and routing policy |
| App state layer | `admin/src/stores` | UI state only; transient app state | Mirroring server state from API responses |
| Cross-app shared packages | `packages/web-core`, `packages/web-types`, `packages/site-*`, `packages/ui-theme` | Shared contracts, protocol, runtime primitives, theme/tokens | App-specific view logic |

## 4. Admin Structure Rules (`apps/web/admin/src`)

- `routes/` owns route definitions and route guards only.
- `pages/` owns page-level composition and feature wiring.
- `api/` owns request/response contracts and typed API functions.
- `components/` owns reusable UI and composite presentation blocks.
- `lib/` owns local utilities that are not yet cross-app.
- `hooks/` owns reusable React behavior hooks.
- `stores/` owns client/UI state only (not server-state mirrors).
- `types/` owns Admin-local types; cross-app types must move to `packages/web-types`.

### 4.1 Admin API Data Layer Convention (`api/` + `types/api/` + `lib/api/`)

The Admin API layer follows a strict three-tier separation:

```
src/api/          → Runtime API functions only (HTTP calls)
src/types/api/    → Pure type definitions (no runtime code)
src/lib/api/      → Shared utilities (path builders, query-string helpers)
```

**Rules:**

1. **Type definitions** must live in `types/api/*.ts` and be re-exported through `types/api/index.ts`. API files (`api/*.ts`) must not define `type`, `interface`, or `enum` locally — import them from `@/types/api`.

2. **Path construction** must use centralized builders from `lib/api/path-builders.ts`:
   - `workspacePath(workspaceId, "/sub/path")` for `/workspaces/{id}/...` endpoints.
   - `organizationWorkspacePath(orgId, wsId, "/sub/path")` for `/organizations/{orgId}/workspaces/{wsId}/...` endpoints.
   - `organizationWorkspacesBasePath(orgId)` for collection-level organization-workspace endpoints.
   - `orgPluginPath(pluginRef)` for organization-plugin endpoints.
   - Hand-written `encodeURIComponent(String(workspaceId))` + template literal path assembly is prohibited when a builder exists.

3. **Query string construction** must use `toQueryString()` from `lib/api/query-string.ts`. Hand-written `URLSearchParams` or template-literal query assembly is prohibited for standard list/filter parameters.

4. **Internal-only response wrappers** (e.g. `{ items: T[] }` envelope types used only inside one API function) may remain local to the API file as non-exported types.

5. **Adding a new API module** requires:
   - Create `types/api/<module>.ts` with all type definitions.
   - Add re-exports to `types/api/index.ts`.
   - Create `api/<module>.ts` importing types from `@/types/api` and utilities from `@/lib/api`.

## 5. Portal Structure Rules (`apps/web/portal`)

- `pages/` owns Vike route entries (`+Page.tsx`, `+route.ts`) and route-level selection.
- `renderer/` owns render pipeline integration (`+onRender*`, shell wrappers).
- `server/` owns runtime server bootstrap only.
- `src/features/` owns page feature behavior (editor/editor-host/public rendering flows).
- `src/runtime/` owns route resolution, runtime config, request context, and portal API wrappers.
- `src/components/` owns reusable presentational components.

## 6. Cross-App Reuse and Promotion Rules (mandatory)

### 6.1 Promotion trigger

When the same utility/type/contract appears in Admin and Portal for the second time, it must be evaluated and usually promoted to `packages/*`.

### 6.2 Package placement policy

- `packages/web-core`: runtime utilities, HTTP primitives, config/i18n helpers, no React UI dependencies.
- `packages/web-types`: shared type contracts and DTO interfaces across apps.
- `packages/site-*`: editor/renderer/protocol contracts and bridges.
- `packages/ui-theme`: shared design tokens and theme adapters.

### 6.3 Hard prohibitions

- No direct source import between apps (`apps/web/admin` must not import from `apps/web/portal`, and vice versa).
- No duplicated shared helpers across both apps when package extraction is viable.

## 7. Dependency Direction Rules

### 7.1 Admin dependency flow

- `routes -> pages/layouts/providers -> components/hooks/api/lib/stores/types -> packages/*`
- `api` may depend on `lib/http` and `packages/web-core|web-types`.
- `components` may depend on hooks/lib/types/packages, but must not define transport logic.
- `stores` must not become a mirror cache of server state already managed by React Query.

### 7.2 Portal dependency flow

- `pages|renderer -> features -> runtime/components -> packages/*`
- `runtime` owns fetch-based portal API wrappers and route resolution logic.
- `features` should consume runtime APIs instead of implementing raw transport repeatedly.

### 7.3 Prohibited patterns

- Business logic embedded in route entry files.
- Direct fetch calls spread across multiple page/component files when a shared API wrapper can be used.
- Circular imports between feature modules and component foundations.

## 8. Type Safety and Code Quality Constraints

- `any` is forbidden in authored source code.
- Use explicit `interface` / `type` for component props and public function contracts.
- API functions must expose explicit return types (`Promise<T>`).
- Prefer `unknown` + narrowing over `any`.
- Generated files (for example `routeTree.gen.ts`) are tooling output and must not be manually edited.

## 9. Data Fetching and State Rules

- Admin server state must use React Query via typed API layer abstractions.
- Portal runtime data fetching should be centralized in runtime API modules.
- Direct fetch in components/pages is only allowed for exceptional browser-native flows (for example upload streams or external resource probing) and must include a short justification comment.
- Components must not parse raw backend response envelopes directly.

## 10. File Placement Decision Rules

Use this decision order when adding frontend code:

1. Route shell concern? -> `routes/` or `pages/` route entry
2. Feature orchestration concern? -> `pages/` (Admin) or `src/features/` (Portal)
3. API/transport concern? -> `src/api/` (Admin) or `src/runtime/*api*` (Portal)
4. App-local reusable helper? -> `src/lib` or `src/hooks`
5. Cross-app reusable contract/helper? -> `packages/web-core` / `packages/web-types`
6. Presentation unit? -> `src/components`

## 11. Architecture PR Checklist

A frontend PR should pass all checks:

- New files are placed in the correct layer and follow dependency direction rules.
- No cross-app direct source imports were introduced.
- Shared logic is extracted instead of duplicated.
- No new authored `any` was introduced.
- API/transport logic is not leaked into route shells or presentation-only components.
- Added directories include minimal structural documentation when needed.
- Exceptions are documented with justification and a follow-up plan in `docs/plans/`.
