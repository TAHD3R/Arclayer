# Admin Control Plane Productization Rollout

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Owners: Admin, API, Platform
Applies to: `apps/admin`, `apps/api`, `packages/ui`, plugin packages

## 1. Purpose

This contract coordinates the productization of Arclayer's platform control plane. It covers feedback and error reporting, audit and observability, configurable dashboards, plugin operations, notification campaigns, email templates, tenant governance, access restrictions, invitations, and dynamic permissions.

The rollout is a hard-cut product contract. New work must use the domain contracts linked below; superseded page-local models and UI shims are removed in the same wave unless a migration is explicitly documented.

## 2. Product and visual intent

Arclayer's system administration surface is a dense platform-operations console for super administrators. It is productized, low-noise, and action-oriented. Blue is reserved for selection and primary actions. The signature interaction is a configurable dashboard whose cards, charts, and rows drill into real operational facts through a consistent Drawer.

All surfaces follow `DESIGN.md`, `docs/guidelines/frontend-design.md`, and `docs/spec/admin/frontend/product-ui-toolchain.md`. The preferred composition is:

- `DefaultPage` for page framing and Header slots;
- `ChromeTabs` for peer views;
- `DataTable`, `DataTableSearchInput`, shared `Filters`, and explicit ordering controls for operational lists;
- `SettingDialog` for focused editing and a shared Drawer for investigative detail;
- `@arclayer/ui` as the only public primitive boundary;
- Lucide for icons and the reviewed shared chart API for visualization.

## 3. Domain contracts

| Contract | Scope |
|---|---|
| [Admin feedback and support](./admin-feedback-support.md) | Scope switcher, feedback composer and center, error reporting, ContentGuard |
| [Admin observability and dashboard](./admin-observability-dashboard.md) | Audit log, request analytics, charts, responsive layout, system Dashboard, observability route removal |
| [Admin plugins, notifications, and mail](./admin-plugin-notification-mail.md) | Plugin lifecycle, campaign delivery, global surfaces, localized email templates |
| [Admin tenant governance](./admin-tenant-governance.md) | User/workspace/project directories, commerce projection, access restrictions |
| [Workspace invitation and permission experience](./workspace-invitation-permission-experience.md) | Invitation acceptance and tables, dynamic localized permission catalog |

These contracts are normative together. A wave is incomplete if its frontend is shipped without the required backend authority, cache behavior, migrations, tests, or operational telemetry.

## 4. Requirement coverage

| User requirement | Canonical owner |
|---|---|
| 1. Scope switcher width | Admin feedback and support, section 4 |
| 2, 2.1, 2.2. Feedback entry points, center, error reports | Admin feedback and support, sections 5-9 |
| 2.3. ContentGuard shared Empty state | Admin feedback and support, section 10 |
| 3, 3.1-3.4. Audit log and request analysis | Admin observability and dashboard, sections 4-8 |
| 4. Useful card/table drill-down | Admin observability and dashboard, sections 9-10 |
| 5. `react-grid-layout` responsive layouts | Admin observability and dashboard, section 11 |
| 6. Bklit-based shared chart capability | Admin observability and dashboard, section 12 |
| 7. Plugin catalog, install, upgrade, detail, configuration | Admin plugins, notifications, and mail, sections 4-8 |
| 8. Notification campaigns and global surfaces | Admin plugins, notifications, and mail, sections 9-14 |
| 9. Email template DataTable and locale aggregation | Admin plugins, notifications, and mail, sections 15-18 |
| 10-13. Tenant directory interaction and commercial data | Admin tenant governance, sections 4-9 |
| 14. Disabled-state enforcement and blocker | Admin tenant governance, sections 10-14 |
| 15. Remove observability overview; redesign system overview | Admin observability and dashboard, sections 13-14 |
| 16. Invitation flow and three DataTables | Workspace invitation and permission experience, sections 4-9 |
| 17. Dynamic localized permission page | Workspace invitation and permission experience, sections 10-14 |

Coverage means executable behavior, not visual approximation.

## 5. Universal data and interaction rules

### 5.1 Real data only

- Cards, charts, tables, and detail surfaces render persisted facts or an explicitly labeled unavailable/partial state.
- A detail surface must answer an operational question. A generic list of `Current value`, raw identifiers, or serialized JSON is not an acceptable primary presentation.
- Raw metadata may appear in a secondary diagnostics section after sensitive-field sanitization.
- Entity identifiers are correlation aids, not display names. The API supplies semantic identity projections for users, workspaces, projects, targets, and subjects.

### 5.2 List controls

- Operational lists use the Assets-page control pattern: shared search input, shared `Filters`, a visible ordering control, an active-filter reset, and DataTable tools.
- Filter and ordering state is URL-addressable where the page has a route; overlay-local tables preserve it for the overlay session.
- Filter operators and values are API-owned and validated. The client does not fetch an unfiltered dataset to emulate server filtering.
- Mutation success updates the detail cache and every affected list/count cache before the success notification. A manual page refresh is never required.

### 5.3 Drill-down

- Row click opens a Drawer for investigative data; an explicit primary row action remains available for keyboard and assistive-technology users.
- Editing uses a Dialog when the task is bounded and a Drawer when the operator must retain surrounding context.
- Interactive descendants stop row activation. Opening a hover card, copying a value, or using an action menu must not open the row Drawer.
- Cards and charts expose a visible affordance, keyboard activation, and the same detail model as their textual/table counterpart.

### 5.4 States

Every query and mutation surface defines: initial loading, background refresh, empty, filtered empty, partial data, permission denied, validation error, conflict, offline/network failure, and server error. Error states expose the original stable error and correlation context; they do not silently substitute demo values.

### 5.5 Accessibility and responsive behavior

- All actions are keyboard reachable and have a visible focus indicator.
- Icon-only buttons have localized accessible names and at least a 44 by 44 CSS pixel coarse-pointer target.
- Hover cards also open on focus. Hover-only content is never the sole path to an action.
- Tooltips are used only when rendered content is actually truncated or when explaining an icon-only control.
- Charts provide a localized text summary and an exact-value table or list alternative.
- Layouts work at narrow viewport widths without horizontal page overflow; dense tables may scroll inside their own bounded region.
- Numeric metrics use tabular numerals. Motion honors reduced-motion preferences.

### 5.6 Internationalization

All new product copy, action names, filter values, statuses, chart labels, errors, and accessibility labels use stable keys in both `zh-CN` and `en-US`. Domain APIs return codes and localized-key metadata where required; they do not persist translated display strings as authoritative state.

## 6. Security and authorization

- Super-admin UI visibility is not an authorization boundary. Every system endpoint enforces the canonical server permission.
- Workspace and project restrictions are enforced on direct API calls as well as navigation.
- User-supplied URLs, media, feedback metadata, notification content, and plugin packages are validated at their trust boundary.
- Sensitive request bodies, response bodies, credentials, tokens, cookies, authorization headers, and secret query values are never stored in audit or feedback context.
- Destructive and privilege-changing operations write canonical audit events with actor, target, before/after summary, and correlation id.

## 7. Migration rules

- Schema changes require forward migrations, backfill strategy, indexes for every supported list/filter/order path, and a rollback or repair procedure.
- Old feedback categories remain readable only through a documented legacy projection; they are not presented as new submission options.
- Existing notifications and email template rows remain readable while new aggregate projections are introduced.
- Layout persistence is schema-versioned. Unknown widget ids are retained as unavailable definitions rather than discarded silently.
- Removal of `/system/observability/overview` includes route, navigation, route skeleton, tests, translations, and generated route-tree regeneration.
- OpenAPI changes are generated from the API schema; Admin does not maintain parallel handwritten transport types.

## 8. Delivery waves

### Wave 0: contracts and foundations

1. Resolve canonical spec conflicts and approve this contract set.
2. Add required migrations, projections, indexes, error codes, and durable-job contracts.
3. Install `react-grid-layout` through the workspace package manager.
4. Vendor reviewed Bklit Registry chart sources behind `@arclayer/ui/chart`; do not expose Bklit/Visx directly to Admin pages.
5. Add shared identity hover-card, investigative Drawer, feedback composer, filter/order, and restriction-boundary primitives where reuse is proven.

### Wave 1: feedback and resilient error surfaces

Deliver the exact scope-switcher width fix, unified feedback entry points and center, cache-coherent triage, and Lucide/shared-Empty ContentGuard.

### Wave 2: audit, observability, and Dashboard

Deliver request-record diagnostics, repair request analytics, semantic event projections, useful drill-down, responsive layout persistence, reviewed charts, route removal, and the new system Dashboard.

### Wave 3: plugin and communications control plane

Deliver plugin operations through durable jobs, notification campaigns and delivery ledger, real modal/banner consumption, and locale-aggregated email template management.

### Wave 4: tenant governance

Deliver identity cells and hover cards, workspace commercial projections and controls, project operational detail, and server-authoritative restriction blockers.

### Wave 5: invitation and permission experience

Deliver the token regression matrix, three shared invitation DataTables, coherent acceptance/onboarding behavior, and revisioned dynamic localized permissions.

Each wave may be committed separately, but no commit may mix unrelated pre-existing worktree changes.

## 9. Verification contract

Use staged verification rather than repeatedly running the full monorepo gate:

1. Targeted unit/component tests while editing a domain.
2. Targeted API integration tests with the repository's 60-second timeout rule for narrow backend nodes.
3. `pnpm admin:check` for Admin-only waves, `pnpm api:check` for API-only waves, and `pnpm check` only at cross-app release boundaries.
4. `pnpm code-review-engine --scope changed --base HEAD --format human` at wave boundaries.
5. GitNexus impact before modifying symbols, and `detect_changes()` before every commit. If the service is unavailable, record the failure and do not claim graph verification.
6. Browser acceptance at desktop, narrow viewport, keyboard-only, reduced motion, dark theme, empty state, populated state, and failed-network state.

## 10. Definition of done

A requirement is done only when:

- the domain and API behavior in the owning spec is implemented without page-local duplicate contracts;
- migrations and backfills succeed against a representative existing database;
- the UI has all required states and interaction paths;
- list mutations are immediately cache coherent;
- authorization is verified by direct API tests, not only by hidden controls;
- both locales are complete;
- exact-value and keyboard alternatives exist for visualization and hover interactions;
- no placeholder/demo detail or unbounded payload is shipped;
- targeted and release-boundary checks pass with evidence;
- obsolete routes, components, categories, and compatibility shims identified by the domain spec are removed.

## 11. Non-goals

- Replacing the canonical activity/audit store with an external vendor.
- Building a general-purpose BI tool or arbitrary user-authored widgets.
- Allowing executable third-party plugin code without package verification and an explicit trust policy.
- Storing raw HTTP bodies for troubleshooting.
- Treating a blocking Dialog as the security boundary for disabled users or tenants.
