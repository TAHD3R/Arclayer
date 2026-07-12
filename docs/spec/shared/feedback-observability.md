# Feedback and Observability Contracts

This code-spec defines the shared feedback lifecycle and project/workspace/platform observability contracts.

## Scenario A: Product feedback lifecycle

### 1. Submission contract

- Authenticated users can submit feedback from the Header, AI side panel, or Feedback Center.
- A submission includes a stable source, category, message, optional rating, optional workspace/project context, client request id, and sanitized product context metadata.
- Source values are explicit (`header`, `ai_sidebar`, `feedback_center`); the server does not infer trust from a client-supplied source.
- Message length, category, rating, identifiers, and metadata shape are validated at the boundary. Metadata must reject secrets and unbounded nested payloads.
- A client request id makes retries idempotent. Rate limiting and abuse controls return explicit stable errors.

### 2. Triage contract

- Feedback lifecycle states are `new`, `triaged`, `in_progress`, `waiting_for_customer`, `resolved`, and `closed`.
- Priority is `low`, `normal`, `high`, or `urgent`.
- Platform operators can assign an owner, change status/priority, add internal notes, and send user-visible replies.
- Internal notes are never returned from user-facing endpoints.
- State changes and operator messages write platform audit events with correlation ids.
- Users can list their own submissions and read user-visible replies; workspace membership does not grant access to another user's private feedback by default.

### 3. Required API surface

| Method and path | Actor | Purpose |
|---|---|---|
| `POST /feedback` | authenticated user | Submit idempotent feedback |
| `GET /feedback/mine` | authenticated user | List own feedback and user-visible status |
| `GET /system/feedback` | super admin | Filter and paginate the operational queue |
| `GET /system/feedback/{id}` | super admin | Read full ticket and internal history |
| `PATCH /system/feedback/{id}` | super admin | Update assignment, priority, and lifecycle state |
| `POST /system/feedback/{id}/messages` | super admin | Add a reply or internal note |

## Scenario B: Commercial-grade observability

### 4. Telemetry ownership

- Dashboards render persisted runtime facts; static demonstration series, random values, and fabricated success rates are prohibited.
- Request telemetry is recorded in bounded hourly aggregates keyed by scope, route template, and status class. It includes request count, error count, total duration, and maximum duration.
- AI telemetry reuses daily request/token/cost rollups and the immutable Credits ledger.
- Activity telemetry reuses the canonical audit-event store.
- Telemetry writes are isolated from the business response path: a telemetry-write failure is logged with correlation context and does not rewrite a successful business response. The failure is never swallowed silently.
- Retention and aggregation periods are explicit configuration, not hidden limits.
- HTTP metric retention and query windows use `OBSERVABILITY__RETENTION_ENABLED`, `OBSERVABILITY__RETENTION_DAYS`, `OBSERVABILITY__MAX_QUERY_DAYS`, `OBSERVABILITY__RETENTION_BATCH_SIZE`, and `OBSERVABILITY__RETENTION_MAX_DELETE_PER_RUN`; a scheduled lock-protected cleanup enforces the configured retention period.
- Project attribution coverage is returned as supported state, attributed records, total records, and coverage rate for workspace-owned HTTP, AI, and audit telemetry. System-only records do not lower project-attribution coverage.
- Routes tagged `internal.system.observability` or `domain.observability` query the metric store and are excluded from HTTP ingestion. This prevents dashboard polling from changing the next dashboard sample; the exclusion is tag-based rather than path-based.

### 5. Metrics and API contract

Supported request metrics include `requests`, `errors`, `errorRate`, `avgLatency`, and `maxLatency`. Hourly HTTP aggregates do not claim p95/p99 because they do not retain a latency distribution. AI audit rows retain per-request duration and therefore may expose true p50/p95/p99 values. Supported product metrics include `tokens`, `cost`, `credits`, and `auditEvents`.

| Method and path | Actor | Purpose |
|---|---|---|
| `GET /system/observability/overview` | super admin | Platform KPI summary for an explicit time range |
| `GET /system/observability/trends` | super admin | Platform time series for one supported metric |
| `GET /workspaces/{workspaceId}/observability/overview` | workspace member | Workspace-scoped KPI summary |
| `GET /workspaces/{workspaceId}/observability/trends` | workspace member | Workspace time series, optionally filtered by authorized project |
| Existing `/system/activity` and `/workspaces/{workspaceId}/activity` | authorized caller | Canonical audit-log lists and detail |

- Time-range inputs are bounded by documented retention and return bucket start/end with timezone semantics.
- Missing data returns an empty series and zero-valued aggregate with coverage metadata; it does not interpolate fabricated samples.
- Project filters are authorized against the workspace. If a metric cannot be attributed to a project, the API reports attribution coverage explicitly.
- List endpoints paginate, filters are backend-owned, and large ranges never return unbounded raw events.

### 6. Admin information architecture

- Platform Overview summarizes tenants, active projects, commercial state, feedback queue health, AI consumption, and operational health from live endpoints.
- Audit Log is a filterable, paginated canonical event view with actor, action, scope, target, correlation id, timestamp, and sanitized metadata detail.
- Feedback Center exposes queue filters, ticket detail, assignment, status/priority updates, replies, and internal notes.
- Observability is a parent navigation group with focused child pages for overview, requests/reliability, AI usage/cost, and activity rather than one overloaded dashboard.
- Every chart has an accessible Recharts layer, localized units, a textual summary, and an explicit loading/error/empty state.

### 7. Tests required

- Feedback submission validation, idempotency, access isolation, lifecycle transitions, internal-note privacy, and audit tests.
- Request aggregate concurrency and error-path isolation tests.
- Observability authorization, range validation, empty coverage, aggregation accuracy, and pagination tests.
- Admin component tests for filters, errors, empty results, exact metric values, status changes, and feedback submission from each source.
