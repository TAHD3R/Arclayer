# Frontend Folder Architecture (`apps/*`)

This document defines the target frontend architecture for CelestialCMS. It is a normative guideline for the Admin application plus shared frontend packages.

## 1. Goals

- Keep Admin boundaries explicit and maintainable.
- Keep UI code, data access, and runtime infrastructure responsibilities separated.
- Enforce cross-app reuse through `packages/*` instead of copy-paste.
- Preserve strong typing and human-readable code structure as default constraints.

## 2. Scope

This guideline applies to:

- `apps/admin`
- Cross-app shared frontend packages in `packages/*` (especially `packages/core/runtime`, `packages/internal/types`, and `packages/protocols/*`)


## 3. Canonical Layer Map

| Layer | Location | Responsibility | Must Not Own |
| --- | --- | --- | --- |
| App routing shell | `apps/admin/src/routes` (`index.tsx` + `index.lazy.tsx`) | Route config and lazy component binding, route-level guards | Business workflow implementation, inline page rendering |
| Feature/page composition | `apps/admin/src/pages` | Feature orchestration and page behavior | Transport/client primitives and global infra concerns |
| Data access layer | `apps/admin/src/api` | API contracts, request helpers, response normalization | JSX rendering logic |
| Shared app internals | `apps/admin/src/lib`, `apps/admin/src/hooks` | App-local reusable helpers | Cross-app contracts that belong in packages |
| UI building blocks | `apps/admin/src/components` | Reusable UI components and presentation units | Domain persistence logic and routing policy |
| App state layer | `apps/admin/src/stores` | UI state only; transient app state | Mirroring server state from API responses |
| Cross-app shared packages | `packages/core/runtime`, `packages/core/renderer`, `packages/internal/types`, `packages/protocols/*`, `packages/bridges/*`, `packages/ui/tokens` | Shared contracts, protocol, runtime primitives, theme/tokens | App-specific view logic |

## 4. Admin Structure Rules (`apps/admin/src`)

- `routes/` owns route definitions and route guards only.
- `pages/` owns page-level composition and feature wiring.
- `api/` owns request/response contracts and typed API functions.
- `components/` owns reusable UI and composite presentation blocks.
- `lib/` owns local utilities that are not yet cross-app.
- `hooks/` owns reusable React behavior hooks.
- `stores/` owns client/UI state only (not server-state mirrors).
- `types/` owns Admin-local types; shared types should be promoted to the appropriate `packages/*` package.

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

### 4.2 Admin Route Splitting Convention (`routes/` + `pages/`)

Admin uses TanStack Router manual lazy-loading with `autoCodeSplitting: false`. Every route is split into two files: `index.tsx` for route configuration and `index.lazy.tsx` for component binding.

**File responsibilities:**

| File | API | Owns | Must not contain |
| --- | --- | --- | --- |
| `index.tsx` | `createFileRoute` | Route config: `validateSearch`, `beforeLoad`, search type definitions | `component` property, page component imports |
| `index.lazy.tsx` | `createLazyFileRoute` | `component` property + page component import | Route config logic (`validateSearch`, `beforeLoad`) |

**Examples:**

Simple route (no config):

```typescript
// routes/setup/index.tsx
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/setup/")({});

// routes/setup/index.lazy.tsx
import { createLazyFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/pages/setup/page";
export const Route = createLazyFileRoute("/setup/")({ component: SetupPage });
```

Route with `validateSearch` (config stays in `index.tsx`, component in lazy):

```typescript
// routes/w/$workspaceId/settings/workspace/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";
export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  validateSearch: (search: Record<string, unknown>): { index?: WorkspaceSettingsTabKey } => {
    // validation logic only
  },
});

// routes/w/$workspaceId/settings/workspace/index.lazy.tsx
import { createLazyFileRoute } from "@tanstack/react-router";
import { WorkspaceSettingsPage } from "@/pages/workspaces/settings/workspace/page";
export const Route = createLazyFileRoute("/w/$workspaceId/settings/workspace/")({
  component: WorkspaceSettingsPage,
});
```

Wrapper component injecting route params into a shared page:

```typescript
// routes/o/$orgId/extensions/index.lazy.tsx
import { createLazyFileRoute } from "@tanstack/react-router";
import { ExtensionsPage } from "@/pages/extensions/extensions-page";
export const Route = createLazyFileRoute("/o/$orgId/extensions/")({
  component: OrganizationExtensionsRoute,
});
function OrganizationExtensionsRoute() {
  const { orgId } = Route.useParams();
  return <ExtensionsPage scope="organization" organizationId={orgId} />;
}
```

**Page component naming:**

1. Page components use `*Page` suffix (e.g. `DashboardPage`, `LoginPage`).
2. Page files are always named `page.tsx`, placed in `src/pages/` mirroring the feature structure.
3. Lightweight wrapper components in lazy files use `*Route` suffix (e.g. `OrganizationExtensionsRoute`).

**Vite configuration:** The `tanstackRouter` plugin must set `autoCodeSplitting: false`. All code splitting is driven by the manual `index.lazy.tsx` convention.

**Exception:** `__root.tsx` is the only route file allowed to define `component`, `errorComponent`, and `notFoundComponent` directly (using `createRootRoute`).

### 4.3 Route Single Responsibility (mandatory)

Route files (`routes/**/*.tsx`) must follow strict single responsibility. They exist solely for route configuration and lazy component binding.

**Allowed in route files (whitelist):**

- `createFileRoute` / `createLazyFileRoute` invocations.
- `validateSearch`: search parameter type definitions and validation logic.
- `beforeLoad`: route guards (authentication checks, redirects).
- `component`: only in `index.lazy.tsx`, referencing a component from `src/pages/`.
- Lightweight wrapper functions: only for injecting route params into shared page components (e.g. `Route.useParams()`).

**Prohibited in route files (blacklist):**

- Business logic (data transformation, conditional branching, state computation).
- API calls or data fetching (belongs in `src/api/` + React Query).
- Complex JSX rendering (anything beyond a single component reference belongs in `src/pages/`).
- Stateful hooks (`useEffect`, `useState`, `useMemo`, etc. — `Route.useParams()` / `Route.useSearch()` are exceptions).
- Style definitions or Tailwind class composition.
- i18n `useTranslation` calls (belongs in page/component layer).

**Decision principle:** If a piece of code can be removed from a route file without breaking navigation or page loading, it does not belong in the route layer.

### 4.4 Route Title Registry (mandatory)

Admin uses a route-driven registry for document titles. This is a governance rule, not a UI preference.

**Goals:**

- Make document titles a first-class route concern.
- Keep navigation menu items strictly for rendering navigation (no metadata inference).
- Prevent fragile `pathname` checks or menu-driven title fallbacks.

**Rules:**

1. Every route that represents a page must set `staticData.titleKey` in its `createFileRoute(...)` definition.
2. `staticData.titleKey` must be an i18n key (e.g. `nav:NAV_DASHBOARD`, `notifications:NOTIFICATIONS_PAGE_TITLE`).
3. `document.title` must be set in a single place only: `RouteDocumentTitleManager`.
4. Navigation constants (`admin-nav.ts`, `org-nav.ts`, `common-footer-nav.ts`) are render-only; they must not be used as the source-of-truth for document titles.

**Example:**

```ts
// routes/me/notifications/index.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me/notifications/")({
  staticData: { titleKey: "notifications:NOTIFICATIONS_PAGE_TITLE" },
});
```

### 4.5 Admin Pages Directory Convention (mandatory)

This section defines governance rules for `apps/admin/src/pages/`. It extends the layer map and route conventions in this document and must be followed for any new or modified pages.

#### 4.5.1 Route-to-pages path alignment (mandatory)

The `pages/` directory structure must align with route path semantics in `routes/`.

**Mapping rules:**

| Route prefix | Pages directory |
| --- | --- |
| `w/$workspaceId/*` | `pages/workspaces/*` |
| `o/$orgId/*` | `pages/organization/*` |
| Global routes (e.g. `/login`, `/setup`) | `pages/*` (root-level) |

**Constraints:**

- Pages that are shared across workspace and organization contexts must not be placed under the `pages/` root. They must be split by real route ownership, or the shared parts must be extracted into `src/components/` as reusable UI blocks.
- `builtin/` pages may exist as global error boundary pages and do not need to align with a route prefix, but their non-route nature must be explicit (for example by renaming to `_builtin/` or moving to `src/components/`).
- `placeholder/` is a temporary staging directory. Any placeholder page must be replaced with a formal page when implementing the actual feature.

#### 4.5.2 Page entry file contract: `page.tsx` (mandatory)

- Every page directory must contain exactly one `page.tsx` file as a thin entry.
- `page.tsx` must only orchestrate feature composition:
  - compose subcomponents
  - pass props
  - define page-level `Suspense` / `ErrorBoundary` boundaries
- `page.tsx` should not exceed ~120 lines. If it does, treat it as a signal that responsibilities must be split into page-local components.

`page.tsx` must not directly contain:

- Data table column definitions
- Dialog implementations
- Toolbar implementations
- Filter implementations

**Naming rule:** the exported component name must match route semantics (for example `TeamMembersPage`).

#### 4.5.3 Standard page-local directory layout (recommended baseline)

A complete page directory should follow this structure:

```
pages/<domain>/<feature>/
├── page.tsx              # Thin entry: composition and boundaries
├── components/           # Page-local components
│   ├── <feature>-toolbar.tsx
│   ├── <feature>-dialogs.tsx
│   ├── <feature>-filter-popover.tsx
│   └── ...
├── hooks/                # Page-local hooks (optional)
│   └── use-<feature>-*.ts
├── constants.ts          # Page-local constants (optional)
├── types.ts              # Page-local types (optional)
└── utils.ts              # Page-local utilities (optional)
```

**Rules:**

- `constants.ts`, `types.ts`, and `utils.ts` must not use a feature prefix (the directory already provides context).
- If there are only 1–2 hooks, they may be placed directly in the page directory without creating `hooks/`.
- Non-standard filenames such as `helpers.ts`, `display.ts`, `*-helpers.tsx`, or `*-display.ts` are prohibited — use `utils.ts`.

#### 4.5.4 Component ownership & promotion rules (mandatory)

- `src/components/` is for reusable UI components imported by 2+ pages.
- `pages/<feature>/components/` is for page-local components used only by the current page.

**Promotion process:**

1. When creating a new component, place it under `pages/<feature>/components/` by default.
2. When a second page needs it, promote it into `src/components/<domain>/`.
3. When it is reused across Admin and Portal, promote it into `packages/*`.

Non-normative note: if a domain folder already exists under `src/components/`, it should be audited periodically to ensure it truly contains cross-page components and not feature-local ones.

#### 4.5.5 Page utilities governance (mandatory)

- If a utility is only used by a single page, it should live in `pages/<feature>/utils.ts`.
- If a utility is used by 2+ pages, it must be promoted into `src/lib/` under an appropriate domain module.
- If an equivalent utility already exists in `src/lib/`, duplicate definitions are prohibited — import and reuse the existing implementation.

**Additional constraints:**

- Pure helper functions longer than 5 lines must not be defined inline in `page.tsx` or page-local component files; move them into `utils.ts`.
- Naming must be consistent: use `utils.ts` (do not use `helpers.ts`, `display.ts`, or `*-helpers.tsx`).
- For formatting/label utilities that depend on i18n (for example `formatRole`, `getStatusLabel`), evaluate whether they belong in a shared i18n utility layer instead of remaining page-local.

#### 4.5.6 Constants and types extraction rules (mandatory)

- Page-local constants must live in `pages/<feature>/constants.ts`.
- Cross-page shared constants must live in `src/lib/constants/` or the appropriate domain module under `src/lib/`.
- Page-local types must live in `pages/<feature>/types.ts`.
- Cross-page shared types must live in `src/types/`.
- API request/response types must live in `src/types/api/`; redefining API contract types inside `pages/` is prohibited.

**Additional constraints:**

- If an enum originates from backend schema, it should live in `src/types/` and remain aligned with the API contract.
- The same `interface` or type shape must not be duplicated across multiple pages’ `types.ts` files.

#### 4.5.7 Data table conventions (mandatory)

To prevent drift in naming and structure:

```
pages/<feature>/
└── components/
    ├── <feature>-columns.tsx        # Column definitions (required)
    ├── <feature>-toolbar.tsx        # Toolbar (optional)
    ├── <feature>-bulk-actions.tsx   # Bulk actions (optional)
    └── <feature>-filter-popover.tsx # Filters (optional)
```

**Rules:**

- Column definitions files must be named `<feature>-columns.tsx`. Names like `*-table-columns.tsx` are prohibited.
- Column definitions must be exported as a function (to accept dependencies such as `t`), not as a bare array.
- Table instantiation must be performed in `page.tsx` or a dedicated `<feature>-view.tsx` component.
- Shared data-table infrastructure (column types, shared helpers) must live in `src/components/data-table/`.

#### 4.5.8 Cross-subpage shared directory: `shared/` (restricted allowance)

For patterns like `organization/team/shared/`:

- A `shared/` directory is allowed for components shared by multiple subpages within the same feature domain.
- `shared/` must be a sibling of the subpages that import it.
- If a component in `shared/` is imported by a page outside the feature domain, it must be promoted into `src/components/`.
- `shared/` must not contain `page.tsx`.

#### 4.5.9 File naming consistency (mandatory)

- Component files must use `kebab-case.tsx` and export `PascalCase` components.
- Hook files must use `use-<name>.ts` (logic only) or `use-<name>.tsx` (contains JSX).
- Page-local utility/constant/type files must be named `utils.ts`, `constants.ts`, and `types.ts` (no page-level prefixes).
- Prohibited names: `helpers.ts`, `display.ts`, `*-helpers.tsx`, `*-display.ts`.

## 5. Cross-App Reuse and Promotion Rules (mandatory)

### 6.1 Promotion trigger

When the same utility/type/contract appears across multiple frontend surfaces for the second time, it must be evaluated and usually promoted to `packages/*`.

### 6.2 Package placement policy

- `packages/core/runtime`: runtime utilities, HTTP primitives, config/i18n helpers, no React UI dependencies.
- `packages/internal/types`: shared runtime contracts (route match shape, runtime config types, request context types).
- `packages/protocols/*`: protocol/type contracts shared by apps.
- `packages/core/renderer` + `packages/bridges/*`: renderer core and editor bridges/adapters.
- `packages/ui/tokens`: shared design tokens, Tailwind preset, and theme adapters.

### 6.3 Hard prohibitions

- No direct source import across app boundaries.
- No duplicated shared helpers across multiple apps when package extraction is viable.

## 7. Dependency Direction Rules

### 7.1 Admin dependency flow

- `routes -> pages/layouts/providers -> components/hooks/api/lib/stores/types -> packages/*`
- `api` may depend on `lib/http` and `packages/core/runtime|packages/internal/types`.
- `components` may depend on hooks/lib/types/packages, but must not define transport logic.
- `stores` must not become a mirror cache of server state already managed by React Query.

### 7.2 Prohibited patterns

- Business logic, API calls, complex JSX, or stateful hooks in route entry files (`routes/**/*.tsx`). Route files must only contain route configuration and lazy component binding — all rendering and behavior logic belongs in `pages/`. See section 4.3 for the full whitelist/blacklist.
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
5. Cross-app reusable contract/helper? -> `packages/core/runtime` / `packages/internal/types`
6. Presentation unit? -> `src/components`

## 11. Architecture PR Checklist

A frontend PR should pass all checks:

- New files are placed in the correct layer and follow dependency direction rules.
- No cross-app direct source imports were introduced.
- Shared logic is extracted instead of duplicated.
- No new authored `any` was introduced.
- API/transport logic is not leaked into route shells or presentation-only components.
- Admin `pages/` changes follow the Pages Directory Convention (path alignment, single `page.tsx` entry, naming rules, and promotion rules).
- Added directories include minimal structural documentation when needed.
- Exceptions are documented with justification and a follow-up plan in `docs/plans/`.
