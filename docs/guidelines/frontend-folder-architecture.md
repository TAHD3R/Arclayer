# Frontend Folder Architecture Guideline (Arclayer)

This document defines the live frontend structure for Arclayer, with `apps/admin` as the primary governed surface.
It describes current layers, ownership rules, and file-placement decisions that match the repository as it exists today.

## 1. Scope

This guideline applies to:

- `apps/admin`
- shared frontend packages under `packages/*` that Admin consumes directly

Current shared package surfaces relevant to Admin:

- `packages/api-client`
- `packages/core/runtime`
- `packages/hooks`
- `packages/lib`
- `packages/ui/*`

## 2. Goals

- Keep route wiring, page composition, transport, and shared UI responsibilities separate.
- Prefer promotion into shared packages over copy-paste across apps.
- Keep page-level code readable without forcing artificial fragmentation.
- Make the live structure easy to recover from disk without relying on historical assumptions.

## 3. Canonical Layer Map

| Layer | Live location | Owns | Must not own |
| --- | --- | --- | --- |
| Route shell | `apps/admin/src/routes` | route config, redirects, search parsing, route metadata, lazy bindings when used | business workflows, API calls, dense JSX trees |
| Page composition | `apps/admin/src/pages` | feature composition, page-local state orchestration, page-local components/hooks/utils | shared transport primitives, global providers |
| App services | `apps/admin/src/api` | typed request functions and response handling for Admin | JSX and page rendering logic |
| App internals | `apps/admin/src/lib`, `apps/admin/src/hooks`, `apps/admin/src/stores`, `apps/admin/src/types` | app-local helpers, hooks, UI state, Admin-only types | cross-app packages or feature-page rendering |
| Reusable app UI | `apps/admin/src/components`, `apps/admin/src/layouts` | reusable Admin presentation blocks and page-shell primitives | domain transport logic |
| Shared packages | `packages/*` | cross-app runtime helpers, UI primitives, hooks, tokens, generated API client | Admin-only page behavior |

## 4. Route Layer Rules

### 4.1 What lives in `src/routes`

Route files may own:

- `createFileRoute` definitions
- `staticData` metadata such as `titleKey`
- `validateSearch`
- `beforeLoad` redirects and guards
- lightweight layout wrappers such as `Outlet`
- `createLazyFileRoute` bindings where the route is intentionally split

Route files must not own:

- API calls
- React Query orchestration
- business transformations
- large page JSX trees
- feature-local styling logic

### 4.2 Route splitting policy

The live repo uses a mixed model:

- leaf routes that benefit from lazy-loading commonly use `index.tsx` + `index.lazy.tsx`
- redirect routes, simple wrapper routes, and some static pages remain single-file `index.tsx`

Do not enforce route splitting mechanically. Split when it improves code loading or keeps route metadata separate from page binding. Keep single-file routes when the file only contains route metadata or a trivial wrapper.

### 4.3 Route metadata

- Page routes should define `staticData.titleKey`.
- `document.title` resolution is centralized through `RouteDocumentTitleManager`.
- Navigation config is not the source of truth for document titles.

## 5. Page Layer Rules

### 5.1 Live page roots

Current top-level page domains in `apps/admin/src/pages` include:

- `workspaces/*`
- `usercenter/*`
- `sys/*`
- root-level flows such as `login`, `setup`, `reset-password`, `notifications`, `invitations`

There is also a live `placeholder/` directory. Treat it as transitional surface area, not as the default destination for new product work.

### 5.2 Route-to-page alignment

Follow live route semantics when placing pages:

| Route family | Page location |
| --- | --- |
| `/w/$workspaceId/*` | `pages/workspaces/*` |
| `/usercenter/*` | `pages/usercenter/*` |
| `/sys/*` | `pages/sys/*` |
| root/global flows | `pages/<feature>/*` |

Do not invent `pages/organization/*` or other route families that do not exist in the live app.

### 5.3 `page.tsx` contract

- Each page directory should expose a `page.tsx` entry.
- `page.tsx` should compose the page and delegate dense UI to local components when the screen grows.
- It is acceptable for mature pages to own meaningful composition logic; do not split only to satisfy a line-count ritual.

### 5.4 Page-local structure

Recommended baseline:

```text
pages/<domain>/<feature>/
├── page.tsx
├── components/
├── hooks/
├── types.ts
├── utils.ts
└── constants.ts
```

Use the subfolders only when they help. Avoid creating empty structure for ceremony.

### 5.5 Shared directories inside page domains

The live repo already uses domain-local shared areas such as:

- `pages/workspaces/shared/*`
- `pages/workspaces/team/shared/*`
- `pages/usercenter/shared/*`

Use these only for code shared within the same page domain. If the code starts serving unrelated domains, promote it into `src/components`, `src/lib`, or `packages/*` as appropriate.

## 6. Admin API Layer Rules

### 6.1 Live API structure

Admin transport code is split across:

- `src/api/*` for runtime request functions
- `src/types/api/*` for contract types
- `src/lib/api/*` for shared path/query helpers
- `src/lib/http/*` for shared HTTP client concerns

### 6.2 API ownership rules

- Keep transport code in `src/api/*`.
- Keep reusable query-string and path construction in `src/lib/api/*`.
- Keep app-level HTTP concerns in `src/lib/http/*`.
- Keep request and response types in `src/types/api/*` when the shape is reused or part of the stable API surface.
- Small non-exported helper types that only exist inside one API file are acceptable when they do not represent shared contract surface.

### 6.3 Data fetching rules

- Admin server state should go through React Query plus the typed API layer.
- Components and pages should not scatter raw fetch logic unless the browser-native flow genuinely demands it.
- Components should not parse backend envelopes ad hoc when the API layer can normalize them once.

## 7. App-Local Shared Code Rules

### 7.1 `src/components`

Use `src/components` for reusable Admin presentation blocks that serve multiple pages or multiple feature domains.

Do not move feature-local code here just because it feels “important”.

### 7.2 `src/layouts`

Use `src/layouts` for structural shells and page framing primitives such as `DefaultPage`, `ColumnsPage`, and `ContentGuard`.

### 7.3 `src/lib`

Use `src/lib` for app-local helpers and domain utilities such as:

- `lib/http/*`
- `lib/query/*`
- `lib/routing/*`
- `lib/time/*`
- `lib/assets/*`

If a helper is reused across multiple page families, `src/lib` is usually the correct home.

### 7.4 `src/stores`

- Keep `src/stores` for UI/client state.
- Do not mirror server state here when React Query already owns that data lifecycle.

### 7.5 `src/types`

- Keep Admin-only types in `src/types`.
- Promote cross-app contracts into shared packages instead of duplicating local shapes.

## 8. Shared Package Promotion Rules

Promote code into `packages/*` when it is reused across apps or is clearly foundational.

Current package placement rules:

- `packages/api-client`: generated API client and generated contract artifacts
- `packages/core/runtime`: runtime utilities and shared non-UI primitives
- `packages/hooks`: reusable hooks that are not Admin-only
- `packages/lib`: shared helpers used across multiple apps
- `packages/ui/*`: shared UI primitives, tokens, and styling infrastructure

Hard rule:

- do not import source files directly from another app

## 9. File Placement Decision Order

When adding new frontend code, decide in this order:

1. Route concern or redirect logic -> `src/routes`
2. Page composition or feature flow -> `src/pages`
3. Admin transport or API normalization -> `src/api`
4. App-local reusable helper or hook -> `src/lib` / `src/hooks`
5. Reusable Admin UI block or shell -> `src/components` / `src/layouts`
6. Cross-app reusable primitive -> `packages/*`

## 10. Quality Constraints

- No authored `any` in maintained source.
- Route files stay thin.
- Shared page-shell behavior should be reused instead of cloned.
- Generated files such as `routeTree.gen.ts` are tooling output and must not be edited manually.

## 11. PR Checklist

- [ ] New files are placed in the right layer for their responsibility.
- [ ] Route files stay limited to routing concerns.
- [ ] Page-local code was not promoted too early into shared layers.
- [ ] Shared logic was promoted when it truly crossed app or domain boundaries.
- [ ] No cross-app direct source imports were introduced.
- [ ] New transport logic lives in the Admin API stack instead of feature JSX.
- [ ] New authored code avoids `any` and respects generated-file boundaries.
