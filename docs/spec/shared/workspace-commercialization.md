# Workspace Commercialization Contracts

This code-spec defines the shared plan, subscription, AI Credits, billing-change, and usage contracts for Arclayer workspaces.

## Scenario: Commercial plans and AI consumption at workspace scope

### 1. Scope / Trigger

- Trigger: adding or changing plan configuration, workspace subscriptions, AI usage charging, credit balances, plan selection, or commercial Admin UI.
- Applies to `apps/api`, `apps/admin`, generated OpenAPI contracts, and AI runtime accounting.
- The workspace is the commercial tenant. Users and projects consume the active workspace's entitlement; they do not own independent plan balances.

### 2. Domain vocabulary

| Term | Contract |
|---|---|
| Plan | Operator-configurable product offer identified by a stable code such as `free` or `premium` |
| Subscription | The workspace's current plan, billing interval, lifecycle status, and current entitlement period |
| Credit | Integer product unit used to meter AI work; distinct from money and provider tokens |
| Credit value | `credit_value_micros`, the integer number of provider-cost microdollars represented by one credit |
| Grant | Positive immutable ledger entry created by a plan period, operator adjustment, or approved commercial action |
| Reservation | Temporary credit hold created before an AI request |
| Commit | Final credit debit based on actual model cost |
| Release | Return of a reservation when the AI request fails or is cancelled |
| Change request | Workspace-owner request to move to another plan; pending until the configured commercial workflow completes |

### 3. Money and credit invariants

- Monetary values use integer microdollars (`*_micros`); one USD is `1_000_000` microdollars. Do not store or expose floating-point plan prices.
- Credits are non-negative integers and are never used as an alias for provider tokens or microdollars.
- `credit_value_micros` is positive. Estimated and actual credit charges are:

```text
reserved_credits = ceil(estimated_cost_micros / credit_value_micros)
committed_credits = ceil(actual_cost_micros / credit_value_micros)
```

- Every committed AI ledger entry records the request id, estimated/actual `cost_micros`, applied `credit_value_micros`, reserved credits, and committed credits. Later plan edits cannot reinterpret history.
- Balance, reserved, and available values satisfy `available = balance - reserved` and may not become negative.
- Reservation, commit, release, period grant, and subscription change are transactionally consistent and idempotent by request/business key.

### 4. Plan catalog and subscription contracts

- The initial catalog contains stable `free` and `premium` plan codes, but the API and UI render the active catalog rather than hard-coding a two-plan limit.
- A plan defines localized/product-facing name and description keys, sort order, active state, period credits, refresh interval, `credit_value_micros`, monthly/yearly price micros, currency, and typed feature entitlements.
- Deactivating a plan prevents new selection but does not silently rewrite an existing subscription.
- Subscription lifecycle states are explicit: `trialing`, `active`, `past_due`, and `canceled`. Scheduled cancellation is represented independently by `cancelAtPeriodEnd`; unsupported transitions fail with a stable conflict error.
- Credit refresh intervals are `daily`, `monthly`, `yearly`, and `none`. A `none` plan grants once when applied and returns `nextRefreshAt: null` rather than implying renewal.
- Period rollover grants the configured credits exactly once for a workspace, plan, and period. A retry must return the existing result.
- Upgrades apply only after the configured commercial workflow succeeds. This repository's baseline mode is `operator_managed`: a workspace owner submits a change request and a platform operator approves or rejects it.
- Operator-managed mode never claims that payment succeeded. Approval is the authoritative commercial event and must write an audit event.

### 5. Required API surface

All routes are under the Admin API global `/api/v1` prefix and use typed response envelopes.

| Method and path | Actor | Purpose |
|---|---|---|
| `GET /system/commerce/plans` | super admin | List the configured catalog, optionally including inactive plans |
| `PUT /system/commerce/plans/{code}` | super admin | Create or update one plan with integer money/credit fields |
| `GET /workspaces/{workspaceId}/commerce/overview` | workspace member | Read active plan, subscription, credit balance, period, and usage summary |
| `GET /workspaces/{workspaceId}/commerce/plans` | workspace member | List active plans with current/selectable state for the plan dialog |
| `GET /workspaces/{workspaceId}/commerce/credits/ledger` | workspace manager | Read the paginated immutable ledger |
| `POST /workspaces/{workspaceId}/commerce/subscription-change-requests` | workspace owner/manager | Request a plan and billing-interval change |
| `GET /system/commerce/subscription-change-requests` | super admin | Triage pending and historical change requests |
| `POST /system/commerce/subscription-change-requests/{id}/approve` | super admin | Atomically apply the plan, period grant, ledger, and audit event |
| `POST /system/commerce/subscription-change-requests/{id}/reject` | super admin | Reject with an operator-visible reason and audit event |
| `PUT /system/commerce/workspaces/{workspaceId}/subscription` | super admin | Correct or administer a subscription explicitly |

Public workspace and request identifiers use the repository `PublicUUID` contract. External payloads use camelCase through the shared Pydantic alias contract.

### 6. Authorization and failure matrix

| Condition | Required result |
|---|---|
| Workspace has no explicit subscription | Materialize/read the configured Free entitlement; do not invent an unlimited balance |
| Requested plan is inactive or missing | `404`/`409` with stable plan error code |
| Caller is not a workspace manager | `403` with stable permission code |
| Available credits cannot cover the reservation | `402` with `AI_CREDITS_EXHAUSTED` and sanitized balance metadata |
| Same AI request is retried | Return/reuse the idempotent reservation or terminal ledger result |
| AI provider call fails | Release the reservation and record the failed request audit; do not debit committed credits |
| Actual charge is lower than reserved | Commit actual credits and release the difference atomically |
| Actual charge exceeds reservation | Atomically charge the additional credits or fail explicitly before presenting a successful AI result |
| Duplicate period grant or approval | Return the existing operation outcome without a second grant |

### 7. Admin product experience

- The Header credit control shows available credits and the active plan for the current workspace.
- Hover/focus reveals balance, reserved/used credits, current period, next refresh, and a clear usage-detail action.
- Activation opens a plan-selection dialog that renders live catalog data, supports monthly/yearly comparison, identifies the current plan, and explains the configured approval workflow.
- In operator-managed mode, the primary action creates a pending change request and confirms submission; it must not display “payment successful” or “plan upgraded” before approval.
- System settings expose catalog fields and change-request administration to super admins with explicit validation and audit feedback.
- Credit-ledger rows persist a stable `descriptionKey`; API responses resolve a localized `description` without rewriting immutable history.

### 8. Tests required

- Atomic concurrent reservation tests proving balance cannot go negative.
- Idempotent reserve/commit/release and period-grant tests.
- Plan transition and change-request authorization/state-machine tests.
- HTTP 402 and localized error tests for exhausted credits.
- AI runtime integration tests proving successful calls commit and failed calls release.
- Frontend tests for loading/error/no-workspace, hover/focus content, plan interval selection, pending request, current plan, and exhausted-credit behavior.
