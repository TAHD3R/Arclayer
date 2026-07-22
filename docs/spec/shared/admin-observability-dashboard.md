# Admin Observability and Dashboard Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Admin Control Plane Productization Rollout](./admin-control-plane-rollout.md)

## 1. Scope

This contract defines the platform Audit Log, raw request records and analytics, semantic audit events, useful card/chart/table drill-down, the responsive dashboard layout engine, the shared chart implementation, removal of the redundant observability overview, and redesign of `/system/overview` as the global Dashboard.

It supersedes the hourly-only percentile and observability-overview UI statements in `feedback-observability.md`. Hourly aggregates remain useful for long-range trends, while persisted raw request records are the source for exact request investigation and true percentile computation inside their retention window.

## 2. Current-state evidence

- `/system/audit-log` already has ChromeTabs for request records, request analysis, and events.
- raw request rows currently retain occurrence time, trace id, actor/workspace/project ids, route template, method, status, and duration; the current detail Dialog cannot explain an incident at PostHog/Cloudflare depth.
- request analytics already computes true P95/P99 from raw rows using PostgreSQL percentile functions, but the analysis tab can return an internal-server error and needs database/integration diagnosis.
- event rows expose actor/subject summaries plus raw entity and trace identifiers, but target and correlation columns are not operator-readable.
- dashboard widgets use a page-local configurable layout that lacks mature responsive collision, resize preview, and content measurement behavior.
- `/system/observability/overview` duplicates focused observability pages, while `/system/overview` is still mostly a summary of other pages.

## 3. Non-goals

- Persisting raw request or response bodies.
- Reimplementing a vendor-neutral distributed tracing backend.
- Allowing arbitrary SQL, arbitrary widgets, or user-authored executable dashboard code.
- Claiming percentiles from aggregates that do not retain a distribution.
- Hiding the request-analysis 500 error behind cached or fabricated values.

## 4. Audit Log product framing

### 4.1 Header copy

Stable i18n intent:

| Key intent | `zh-CN` | `en-US` |
|---|---|---|
| Page title | 审计日志 | Audit Log |
| Description | 追踪平台请求与管理操作，定位异常、性能变化和关键配置改动。 | Trace platform requests and administrative changes to investigate failures, performance shifts, and sensitive configuration updates. |

The description explains operator value and must not describe implementation details such as table names or correlation ids.

### 4.2 Top-level composition

```text
Audit Log
Trace platform requests ...

[ Request records ] [ Request analysis ] [ Events ]
────────────────────────────────────────────────────
[Search] [Order ▼] [Filters] [Reset]       [Table tools]
[active filter chips]
[view content]
```

ChromeTabs remain the navigation authority. Each tab owns its search parameters while preserving the selected time range.

## 5. Shared search, filter, and order contract

All three tabs use the shared Assets-page control composition: `DataTableSearchInput`, explicit order Select, shared `Filters`, reset control, and DataTable tools.

### Request records

- Search: request/correlation id, normalized path, route template, actor display/email, workspace/project name, error code.
- Filters: time range, method, status/status class, latency range, route, actor, workspace, project, environment, deployment/version, error presence.
- Order: newest/oldest, slowest/fastest, status severity.

### Request analysis

- Search: route template/service.
- Filters: time range, method, status class, workspace/project, environment, service.
- Order: request volume, error rate, P95, P99, average latency, most recent.

### Events

- Search: localized action text, canonical event code, actor/subject/target name, scope name.
- Filters: time range, action family/event code, source, actor, workspace, project, target type, result/severity.
- Order: newest/oldest and severity/risk where supported.

The backend validates every order field and performs filtering. Filter state is URL-addressable and uses stable codes rather than translated values.

## 6. Raw request record model

### 6.1 Required persisted fields

Within the configured raw-record retention window, each record contains bounded, sanitized operational facts:

- record id, occurred timestamp, correlation/request id, trace id when present;
- method, normalized path, route template, protocol, status code;
- duration, request bytes, response bytes when measurable;
- actor user id plus captured/resolved identity summary;
- workspace/project ids plus resolved identity summaries;
- service/upstream, environment, release/deployment version and instance/region when available;
- client user-agent family/device summary and privacy-preserving network address representation;
- error code, error class, and sanitized operator message for failed requests;
- ingestion source and schema version.

Do not persist authorization headers, cookies, credentials, secret query values, request bodies, response bodies, or unsanitized exception strings. Query context may retain an allowlisted list of key names, never arbitrary values.

### 6.2 Identity and retention semantics

- Captured summaries preserve investigative meaning after entity rename/deletion; live resolution may add the current name.
- Raw retention and aggregate retention are explicit, separately configured, and reported in API coverage metadata.
- Indexes support occurred time plus the documented filters and groupings. The migration includes an explain-plan/performance proof against representative volume.
- Telemetry write failure remains observable through logs/metrics but does not rewrite a successful business response.

## 7. Request records table and Drawer

### 7.1 Columns

| Column | Content |
|---|---|
| Time | Localized timestamp, exact value available |
| Request | Method tag plus normalized route/path; request id is not the trigger label |
| Status | Semantic status code |
| Duration | Tabular-number duration with slow-state semantics from backend/query context |
| Actor | Avatar and display name; hover/focus identity card; never show user id in the trigger |
| Scope | Workspace/project icon and resolved name |
| Service | Service/upstream and environment when relevant |

Rows are keyboard activatable and open the same Drawer as an explicit ghost `Details` action. Request records use server pagination with a default page size of 20; page navigation replaces the rendered row set instead of appending to it. The page-size selector follows the shared `10/20/50/100` options and the API's documented maximum. If a future view deliberately restores cursor accumulation, row virtualization is mandatory and item measurement must support expanded accessible text.

### 7.2 Investigative Drawer

```text
┌ Request  GET /api/...                    [Copy link] × ┐
│ 500  •  842 ms  •  production  •  release abc         │
│                                                        │
│ Summary        Timeline        Error        Context    │
│ route/service  started         code/class   actor      │
│ bytes/upstream completed       safe message workspace  │
│                                                        │
│ Related events and feedback                             │
└────────────────────────────────────────────────────────┘
```

The Drawer provides:

1. status, duration, time, method, route/path, service, environment, and release;
2. actor identity card and resolved workspace/project navigation;
3. timing milestones when instrumentation exists, otherwise an explicit unavailable state;
4. request/response size and upstream information;
5. sanitized error code/class/message with stack-trace linkage only to an authorized external trace system;
6. user-agent/device and privacy-preserving network context;
7. trace/correlation identifiers in a secondary copyable diagnostics section;
8. related canonical audit events and feedback tickets;
9. `Report issue`, which opens the shared feedback composer with context attached silently.

Unavailable fields are omitted or labeled unavailable; the Drawer must not fill space with `-` rows or raw JSON as its primary design.

## 8. Request analysis correctness

### 8.1 Metric authority

- True P50/P95/P99 come only from retained raw durations or a future distribution-preserving sketch.
- Hourly aggregates supply count, errors, total/average/max latency, and longer-range trends; they never claim percentiles.
- Every analysis response includes requested range, effective range, raw/aggregate source, sample count, attribution coverage, partial-window markers, and timezone/bucket semantics.
- Empty samples return an explicit empty result, not zero latency presented as a real measurement.

### 8.2 Internal-server-error repair gate

Implementation must reproduce the 500 against a migrated real database and capture the stable API error plus server traceback. Investigation must verify, without preselecting a cause:

1. raw request-record migration and indexes are applied;
2. percentile SQL casts, filter parameters, aliases, and empty-set behavior match PostgreSQL;
3. range/timezone values and generated OpenAPI query types are valid;
4. the handler's authorization and response serialization succeed;
5. representative integration fixtures include success, empty, mixed-status, and high-volume cases.

The root cause is fixed at the API/query/migration layer and protected by an integration test. Frontend fallback data or swallowed errors are prohibited.

## 9. Semantic audit events

### 9.1 Projection contract

The API supplies display-ready, code-backed projections:

- `action`: canonical event code, i18n key, localized parameters, category, result, and risk;
- `source`: stable source code and i18n key;
- `actor`: user/service identity summary with navigation target when authorized;
- `scope`: system/workspace/project type, icon, resolved name, and navigation target;
- `subject`: primary affected identity when distinct from target;
- `target`: type, icon, human-readable primary/secondary text, current/deleted state, and navigation target;
- `correlation`: trace/correlation/request identifiers for the Drawer;
- `changes`: safe before/after field summaries;
- `metadata`: sanitized secondary detail.

The frontend must not infer an entity name from `entityType + entityId`, and raw ids are not primary columns.

### 9.2 Table contract

Columns are Time, Action, Source, Actor, Scope, Target, Result, and Actions. Actor uses the shared avatar identity card and trigger text excludes user id. Scope and target show icon plus resolved name. Correlation ids move into the Drawer; a `-` correlation value is not a useful default column.

The event Drawer explains who did what, where, to which target, with what result, and what safe fields changed. It then exposes correlation ids, raw event code, and sanitized metadata for deeper diagnosis.

## 10. Useful detail for cards, charts, and tables

Every interactive metric defines a `detailQuery` and a domain-specific detail presenter.

### 10.1 Card detail

A metric card Drawer includes:

- exact value, definition, comparison baseline, and coverage;
- time series or breakdown explaining the value;
- top contributors/outliers with links to filtered source rows;
- threshold/health interpretation grounded in configured rules;
- last refresh and data-source status.

A single label/value list is non-conforming.

### 10.2 Chart detail

Clicking or keyboard-activating a point, bar, segment, or legend entry opens a Drawer scoped to that selection. It includes exact bucket boundaries, value/unit, comparison, breakdown, representative source rows, and a `View filtered records` action. Selection persists while the Drawer is open and is announced to assistive technology.

### 10.3 Table detail

Row detail uses the semantic request/event/AI/cost domain presenter. Generic raw-object rendering may exist only behind an `Advanced diagnostics` disclosure after sanitization.

## 11. Responsive layout engine

### 11.1 Dependency and public abstraction

Install `react-grid-layout` through pnpm. Admin pages consume a shared `ConfigurableDashboard` abstraction; they do not import the dependency directly. The abstraction exposes responsive breakpoints, drag/resize, collision/compaction, edit mode, add/hide widgets, reset, and persistence.

The layout applies to all widget-based surfaces in this rollout: Audit Log request analysis and event-analysis widgets; each focused Observability page's cards, charts, and table widgets; and every `/system/overview` Dashboard widget. Request-record and analysis tables are registered widgets where they appear in a configurable surface, so their container size is governed by the same layout and overflow contract.

### 11.2 Layout behavior

- Layouts are stored per user, dashboard id, breakpoint, and schema version.
- Editing is explicit. Normal mode does not turn cards into accidental drag handles.
- Drag and resize show the library placeholder/size preview and auto-compaction result.
- Keyboard users can enter layout edit mode, select a widget, move/resize it in grid increments, and receive live-region position feedback.
- Widgets have declared min/max dimensions based on content semantics; the layout does not silently clamp user choices beyond those documented constraints.
- Hiding preserves the widget definition and query settings. Add-widget restores hidden or newly available registered widgets.
- Reset previews the consequence and restores the server/default layout for all breakpoints.
- Concurrent writes use a revision; conflicts offer reload or intentional overwrite.

### 11.3 Overflow contract

Every grid item and immediate content root uses `min-width: 0` and `min-height: 0`. Charts observe the content box and remeasure after resize. Tables use an internal bounded scroll container, sticky headers where appropriate, and no fixed width larger than the widget. Long routes/names truncate or wrap according to column semantics. The page itself must not gain horizontal overflow from a widget.

## 12. Shared Bklit chart contract

Bklit UI is a shadcn Registry source, not an npm runtime package. Reviewed chart source is vendored from the configured `@bklit` registry into `packages/ui/src/chart` and adapted before use.

- `@arclayer/ui/chart` remains the only application import boundary.
- Admin pages never import Bklit Registry source, `@visx/*`, D3, or Recharts directly.
- The vendored implementation replaces foreign aliases, theme tokens, loaders, and motion defaults with Arclayer primitives.
- Bklit's long default animation is reduced to the product motion range and disabled for reduced motion. Chart resize animation must not fight grid resize.
- The shared API covers line/area/bar/stacked/composed charts, axis/legend/tooltip, empty/loading/error, point/series selection, text summary, and exact-value alternative.
- Units, number/date formatting, timezone, semantic colors, and series identity are explicit props; charts do not choose random colors.
- If reviewed Bklit source or its alpha Visx dependency cannot pass security, type, bundle, accessibility, and visual checks, the wave is blocked. Silent fallback to a second page-level chart stack is prohibited.

The migration is a hard cut per chart surface: implement the shared adapter, migrate all consumers in scope, and delete superseded page-level Recharts implementations. `product-ui-toolchain.md` carries the same Bklit-backed shared-boundary contract and must remain aligned.

## 13. Observability information architecture hard cut

- Remove `/system/observability/overview` route, menu item, route skeleton, tests, localized navigation copy, and page components.
- `/system/observability` redirects to the first valid focused child, initially `/system/observability/requests`.
- Focused pages remain Requests/Reliability, AI Usage/Cost, and Activity. Activity is an aggregate trend/anomaly view of administrative event volume and risk; its source-row action opens the Audit Log Events tab with matching filters. Audit Log Events remains the canonical raw-event investigation table, so the Activity page must not duplicate that table.
- Regenerate `routeTree.gen.ts` through the repository generator; do not hand-edit it.

## 14. `/system/overview` becomes Dashboard

### 14.1 Header and purpose

The navigation and page title use `Dashboard` / `仪表盘`. The description communicates a global operational decision surface, not a summary page.

The Dashboard answers:

- Is the platform healthy now and over the selected range?
- Which tenants, subscriptions, credits, or usage patterns need attention?
- Which incidents, feedback items, jobs, or deliveries require action?
- Which sensitive changes happened recently?
- Where should the operator drill down next?

### 14.2 Default widget registry

The initial registry contains independently queryable widgets:

- platform availability and request reliability;
- unresolved errors/incidents and slow routes;
- active tenants/projects plus growth/retention signal;
- subscription/plan distribution, credit risk, and usage anomalies;
- feedback queue SLA and urgent unresolved items;
- notification/plugin/job operation failures;
- AI usage/cost risk;
- recent high-risk administrative changes;
- operator shortcuts tied to real authorized actions.

Widgets may link to focused pages but must not simply repeat their hero cards. Each widget declares source endpoint, freshness, coverage, allowed sizes, detail query, and navigation target.

### 14.3 Time-range control

Use a compact Tab control with `7`, `14`, `30`, and `90` day options. The accessible label includes the unit (for example `14 days`). Selection is URL-addressable and shared by compatible widgets; widgets with a different time model declare that explicitly.

## 15. State, performance, and failure contract

- Dashboard/widget queries are independent; one failure produces a visible widget error and partial-page state, not a blank dashboard.
- Cancelling a range/filter change cancels obsolete requests.
- High-cardinality breakdown endpoints paginate and return top-N plus `other` only when the API contract explicitly describes aggregation and total coverage.
- Tables use server pagination; charts use bucket counts appropriate to pixel width and never return unbounded raw points.
- Drawer queries load on demand, preserve the selected summary, and show skeleton/error independently.
- Offline state does not present stale values as current; cached data displays its captured timestamp and stale status.

## 16. Telemetry and audit

Audit the following operator changes: dashboard layout save/reset, widget add/hide, retention/config changes, and any navigation from a sensitive event to an administrative mutation. Instrument query latency, result size, partial coverage, chart render failures, layout conflicts, and Drawer open-to-data time without recording sensitive row content.

## 17. Tests and acceptance criteria

- API integration tests for raw-record ingestion/sanitization, exact filters/orders, percentile correctness, empty samples, migration state, retention boundary, and the reproduced 500 regression.
- Contract tests for semantic actor/scope/target projections including renamed and deleted entities.
- Component tests for URL filters, actor hover/focus card, row keyboard Drawer, useful card/chart detail, exact-value alternatives, partial widget failures, and layout conflict handling.
- Layout browser tests for drag, resize preview, compaction, keyboard movement, breakpoint persistence, widget add/hide/reset, and table/chart overflow.
- Route tests prove observability overview removal and redirect.
- Browser evidence covers Dashboard at desktop/narrow widths, dark theme, reduced motion, 7/14/30/90 tabs, populated/empty/partial/error data, and chart selection Drawer.

Acceptance requires a passing real-database request-analysis query, no actor ids in table triggers, no primary correlation-id column, no generic `Current value` detail, no page-level chart-stack imports, and no `/system/observability/overview` route.
