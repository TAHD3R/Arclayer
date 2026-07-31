# Platform Monitoring & Audit and Operations Inbox Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)

## 1. Scope

This contract defines one Monitoring & Audit Platform Domain for raw request/error investigation, performance and usage trends, Activity trends, and immutable administrative Audit evidence. It also defines useful chart/table drill-down, the shared chart implementation, removal of redundant overview and route families, and redesign of the current `/system/overview` implementation as the Platform Console Operations Inbox.

It supersedes the hourly-only percentile and observability-overview UI statements in `feedback-observability.md`. Hourly aggregates remain useful for long-range trends, while persisted raw request records are the source for exact request investigation and true percentile computation inside their retention window.

## 2. Current-state evidence

- `/system/audit-log` already has ChromeTabs for request records, request analysis, and events.
- raw request rows currently retain occurrence time, trace id, actor/workspace/project ids, route template, method, status, and duration; the current detail Dialog cannot explain an incident at PostHog/Cloudflare depth.
- request analytics already computes true P95/P99 from raw rows using PostgreSQL percentile functions, but the analysis tab can return an internal-server error and needs database/integration diagnosis.
- event rows expose actor/subject summaries plus raw entity and trace identifiers, but target and correlation columns are not operator-readable.
- the current overview uses page-local metric widgets and drill-downs that repeat facts without identifying a concrete operator decision or resolution action.
- `/system/observability/overview` duplicates focused observability pages, while `/system/overview` is still mostly a summary of other pages.

## 3. Non-goals

- Persisting raw request or response bodies.
- Reimplementing a vendor-neutral distributed tracing backend.
- Allowing arbitrary SQL, arbitrary widgets, or user-authored executable dashboard code.
- Providing a configurable dashboard, draggable widget canvas, or persisted operator-specific layout.
- Claiming percentiles from aggregates that do not retain a distribution.
- Hiding the request-analysis 500 error behind cached or fabricated values.

## 4. Audit trail product framing

### 4.1 Header copy

Stable i18n intent:

| Key intent | `zh-CN` | `en-US` |
|---|---|---|
| Page title | 审计记录 | Audit trail |
| Description | 查看谁在何时对平台执行了什么操作，以及操作影响和结果。 | Review who changed what on the platform, when it happened, and what the result was. |

The description explains operator value and must not describe implementation details such as table names or correlation ids.

### 4.2 Top-level composition

```text
Audit trail
Review who changed what ...

[Search] [Order ▼] [Filters] [Reset]       [Table tools]
[active filter chips]
[Audit event DataTable]
```

Audit trail is a peer page inside Monitoring & audit, not a tab container for request telemetry. It owns its URL-addressable search, time range, filters, and order; exact correlation links may open the related Requests & errors record without changing Audit authorization.

## 5. Shared search, filter, and order contract

Requests & errors, Performance trends, and Audit trail use the shared Assets-page control composition where a table is present: `DataTableSearchInput`, explicit order Select, shared `Filters`, reset control, and DataTable tools.

### Request records

- Search: request/correlation id, normalized path, route template, actor display/email, workspace/project name, error code.
- Filters: time range, method, status/status class, latency range, route, actor, workspace, project, environment, deployment/version, error presence.
- Order: newest/oldest, slowest/fastest, status severity.

### Request analysis

- Search: route template/service.
- Filters: time range, method, status class, workspace/project, environment, service.
- Order: request volume, error rate, P95, P99, average latency, most recent.

### Audit trail

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

## 9. Semantic Audit events

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

## 11. Operational Signal projection

### 11.1 Ownership and projection

Each platform domain owns the source state, lifecycle, authorization, and resolution action for the conditions it detects. The Operations Inbox consumes that projection and adds only lightweight Operational Signal Triage; it does not copy domain state into a second incident or task model. Resolving an item invokes the owning domain operation and the projection becomes resolved only after that domain confirms the result.

An Operational Signal contains:

- a stable signal id, source domain, signal type, and source reference;
- severity, detected time, freshness, and an explainable server-authoritative priority;
- localized title and explanation of the condition, impact, and affected scope;
- the evidence summary needed to judge the condition without opening a generic value dump;
- the required Platform Permission and one clear resolution or investigation destination;
- source lifecycle state and the condition that makes the signal resolved.

The projection may group duplicate signals only when it preserves affected count, worst severity, oldest occurrence, representative evidence, and access to the individual source records. The frontend must not invent severity, priority, resolution state, or cross-domain deduplication rules.

### 11.2 Lightweight triage

Operations Inbox collaboration stores a revisioned triage record keyed to the Operational Signal without copying its source content or lifecycle. It contains only the current assignee when present, `needs_attention`, `in_progress`, or `remind_later` coordination state, an explicit reminder time and required user-authored reason for `remind_later`, and the actors and timestamps required for attribution.

- An authorized operator may claim an unassigned Signal, assign or reassign it to an eligible active operator, mark work in progress, set or end a time-bounded reminder, or return it to needs attention. Every command requires its matching action-scoped Platform Permission, expected triage revision, and canonical Audit evidence; conflicts remain visible rather than overwriting another operator's work.
- Triage never changes severity, priority inputs, health, source lifecycle, affected scope, source authorization, or the owning domain's resolution operation. Assignment grants no new access, and an assignee who lacks the source action permission sees no hidden evidence or action.
- There is no dismiss, close, ignore forever, or manually resolve command. A Signal becomes resolved only from an owning-domain fact confirming that the source condition cleared or its canonical operation committed; a failed or merely accepted operation leaves the Signal unresolved.
- A reminder remains discoverable through an explicit filtered view with its reason and return time and is omitted only from the default immediate-work slice until that time. When the time arrives, the same unresolved Signal returns to needs attention without creating a duplicate source condition.
- Source-confirmed resolution makes triage read-only and retains the final assignee, coordination history, reminder history, and source result for authorized investigation and Audit. Triage delivery or persistence failure cannot delay, reverse, or fabricate source resolution.
- Primary UI copy uses stable bilingual keys and plain labels such as “Needs attention” / “待处理”, “In progress” / “处理中”, “Remind me later” / “稍后提醒”, and “Resolved” / “已解决”. User-authored reminder reasons remain verbatim and are not machine-translated.

### 11.3 Admission rule

A fact appears in the Operations Inbox only when the owning domain can state why an operator should care now and what decision or action follows. Normal request volume, plan distribution, active tenant counts, and other context-only metrics remain in Monitoring & audit or their owning domain page unless a configured rule turns them into an actionable condition. Decorative KPI cards and empty navigation summaries are non-conforming.

### 11.4 Responsive presentation

The Inbox uses a stable queue/list hierarchy rather than movable widgets. At narrow widths, prioritization, condition, impact, and primary action remain visible in reading order; secondary evidence moves into the detail surface. Focused Monitoring & audit charts and tables use responsive content containers and must not create page-level horizontal overflow.

### 11.5 Domain-owned Signal policies

Each owning Platform Domain defines typed, versioned policies for the Operational Signals it can emit. A policy declares its stable policy and signal types, source coverage, adjustable fields, valid values, evaluation semantics, severity mapping, admission and resolution conditions, required Platform Permissions, and customer-safe product-copy keys.

- Authorized operators may change only fields exposed by the owning domain, such as a meaningful threshold, observation window, severity mapping, or optional Inbox admission. The UI does not expose SQL, arbitrary expressions, cross-domain joins, user-authored executable code, or a generic event-rule builder.
- A policy change follows the risk-tiered configuration contract and requires a server-generated, revision-bound preview. The preview uses explicitly reported recent coverage/effective range to show representative matching scopes and counts; it is advisory, creates no Signals, changes no historical evidence, and never claims complete prediction when coverage is partial.
- Security, Audit completeness, data-corruption, or other integrity policies may be mandatory and non-disableable when the owning domain declares the exact invariant. Product copy explains what is protected and why the control cannot be turned off rather than exposing an internal hard-coded flag.
- Applying a revision records canonical Audit evidence and affects subsequent authoritative evaluation. Every emitted Signal references the policy revision that evaluated it. A policy edit never deletes or rewrites existing Signals directly; source-domain reconciliation opens, updates, or resolves them according to explicit new evaluation results.
- A threshold alone does not satisfy Inbox admission. The policy must still identify why an operator should care, the affected scope, the evidence, the supported next action, and the source condition that confirms resolution.
- Evaluation failures, stale coverage, and unavailable sources remain observable and cannot be interpreted as no matches or healthy state.

## 12. Shared Bklit chart contract

Bklit UI is a shadcn Registry source, not an npm runtime package. Reviewed chart source is vendored from the configured `@bklit` registry into `packages/ui/src/chart` and adapted before use.

- `@arclayer/ui/chart` remains the only application import boundary.
- Admin pages never import Bklit Registry source, `@visx/*`, D3, or Recharts directly.
- The vendored implementation replaces foreign aliases, theme tokens, loaders, and motion defaults with Arclayer primitives.
- Bklit's long default animation is reduced to the product motion range and disabled for reduced motion.
- The shared API covers line/area/bar/stacked/composed charts, axis/legend/tooltip, empty/loading/error, point/series selection, text summary, and exact-value alternative.
- Units, number/date formatting, timezone, semantic colors, and series identity are explicit props; charts do not choose random colors.
- If reviewed Bklit source or its alpha Visx dependency cannot pass security, type, bundle, accessibility, and visual checks, the wave is blocked. Silent fallback to a second page-level chart stack is prohibited.

The migration is a hard cut per chart surface: implement the shared adapter, migrate all consumers in scope, and delete superseded page-level Recharts implementations. `product-ui-toolchain.md` carries the same Bklit-backed shared-boundary contract and must remain aligned.

## 13. Monitoring & Audit information architecture hard cut

- Platform Console navigation uses “监控与审计” / “Monitoring & audit” and opens “请求与错误” / “Requests & errors” at `/monitoring/requests` by default. There is no domain Overview.
- Peer pages are Requests & errors, Performance trends, AI usage, Activity trends, and Audit trail. Requests & errors owns retained raw request records; Performance trends owns grouped request analysis; Audit trail owns canonical administrative and security events.
- Their stable frontend routes are `/monitoring/requests`, `/monitoring/performance`, `/monitoring/ai-usage`, `/monitoring/activity`, and `/monitoring/audit`; translated labels never change these paths.
- Activity trends is an aggregate trend/anomaly view of administrative event volume and risk. Its source-row action opens Audit trail with matching filters, but aggregate activity never substitutes for or reconstructs Audit evidence.
- Monitoring telemetry and Audit evidence use separate capability permissions, retention policies, completeness metadata, export contracts, and storage authorities even though they share one Platform Domain, time-control patterns, identity projections, and correlation links.
- Remove `/system/observability/overview`, the `/system/audit-log` tab shell, obsolete menu items, route skeletons, tests, localized navigation copy, and duplicate page components. The old route families are migration sources, not permanent aliases.
- Regenerate `routeTree.gen.ts` through the repository generator; do not hand-edit it.

## 14. The platform home becomes Operations Inbox

### 14.1 Header and purpose

The Platform Console root `/`, navigation, and page title use `Operations Inbox` / `行动中心`. During the frontend split, the current `/system/overview` implementation is the migration source, not the permanent route contract. The description communicates a prioritized operational work surface, not a summary page.

The Operations Inbox answers:

- What requires attention now?
- Why does it matter, which scope is affected, and how urgent is it?
- What can this operator do next with their current Platform Permissions?
- Who is handling it now, and which items need this operator's attention?
- Which owning domain will confirm that the condition is resolved?

### 14.2 Initial signal sources

The initial source domains may project signals for:

- availability degradation, request failures, and reliability regressions;
- unresolved incidents and materially slow routes;
- tenant access, subscription, credit, or usage conditions requiring intervention;
- feedback items at risk of breaching their response policy;
- failed notification deliveries, plugin operations, and durable jobs;
- AI usage or cost conditions that crossed an explicitly configured rule;
- high-risk administrative changes requiring review.

This list is not a license to emit a signal for every metric. Each source must satisfy the section 11 admission rule and preserve its own resolution authority.

### 14.3 Queue controls

The default view shows unresolved, non-reminded signals in server-authoritative priority order and makes current assignment and coordination state visible. Operators may filter by assignee, coordination state, source domain, severity, affected scope, and source lifecycle state when supported; reminded items remain available through an explicit view and return automatically at their reviewed time. Filters are URL-addressable and use stable codes. Historical range selection and trend exploration belong to Monitoring & audit rather than controlling the default Inbox.

## 15. State, performance, and failure contract

- Signal-source queries are independently observable; one source failure produces a visible source-scoped error and partial-page state, not an empty Inbox or fabricated healthy state.
- Cancelling a range/filter change cancels obsolete requests.
- High-cardinality breakdown endpoints paginate and return top-N plus `other` only when the API contract explicitly describes aggregation and total coverage.
- Tables use server pagination; charts use bucket counts appropriate to pixel width and never return unbounded raw points.
- Drawer queries load on demand, preserve the selected summary, and show skeleton/error independently.
- Offline state does not present stale values as current; cached data displays its captured timestamp and stale status.

## 16. Telemetry and audit

Audit every claim, assignment, coordination-state change, reminder change, and state-changing resolution invoked from an Operational Signal. Triage commands use their own canonical events, while source resolution uses the owning domain's event. Instrument signal age, time to first claim, active-work duration, reminder return, action open-to-result time, projection freshness and partial coverage, query latency, result size, chart render failures, and Drawer open-to-data time without recording sensitive row content or user-authored reasons in analytics.

## 17. Tests and acceptance criteria

- API integration tests for raw-record ingestion/sanitization, exact filters/orders, percentile correctness, empty samples, migration state, retention boundary, and the reproduced 500 regression.
- API integration tests for triage action permissions, eligible assignees, expected-revision conflicts, time-bounded reminder return, assignment without authority transfer, source-confirmed resolution, retained history, and absence of dismiss/manual-resolve commands.
- Contract tests for semantic actor/scope/target projections including renamed and deleted entities.
- Component tests for URL filters, actor hover/focus card, row keyboard Drawer, useful card/chart detail, exact-value alternatives, Operational Signal admission, claim/assign/in-progress/reminder collaboration, permission-aware actions, source-owned resolution, and partial source failures.
- Signal-policy tests for exposed-field validation, preview revision/coverage, mandatory-policy behavior, action-scoped permission, Audit evidence, policy-version attribution, non-retroactive reconciliation, and evaluation failure visibility.
- Responsive browser tests for Inbox priority/read order, keyboard actions, narrow-width evidence disclosure, and table/chart overflow.
- Route tests prove removal of the Observability overview and old Audit Log tab shell, Operations Inbox at `/`, and `/monitoring/requests` as the Monitoring & Audit default route.
- Browser evidence covers Operations Inbox at desktop/narrow widths, dark theme, reduced motion, populated/empty/partial/error data, permission-constrained claim/assign/in-progress/reminder actions, reminder return, source-confirmed resolution, and focused Monitoring & Audit chart selection Drawer.

Acceptance requires a passing real-database request-analysis query; independently complete, immutable, permissioned Audit evidence; revision-safe triage without authority transfer or manual source resolution; no actor ids in table triggers; no primary correlation-id column; no generic `Current value` detail; no draggable/persisted dashboard layout; no page-level chart-stack imports; and no `/system/observability/overview` or legacy `/system/audit-log` tab-shell route.
