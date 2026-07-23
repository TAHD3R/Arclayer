# Workspace Commercialization Contracts

This code-spec defines the shared plan, subscription, AI Credits, provider checkout, and usage contracts for Arclayer workspaces.

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
| Checkout session | Short-lived provider-hosted payment URL; creating one never changes the local subscription |
| Provider event | Signed external billing event that is the only authority for applying paid subscription state |
| Entitlement | A registered capability key explicitly included or excluded by the workspace's active Plan |

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
- Every configured Plan must explicitly declare every registered authorization entitlement. Missing, duplicate, malformed, excluded, inactive, or expired entitlement state fails closed.
- The seeded `free` and `premium` plans include `sites.generate`; catalog reconciliation only backfills a missing seeded record and preserves an explicit `included: false` operator decision.
- Deactivating a plan prevents new selection but does not silently rewrite an existing subscription.
- Subscription lifecycle states are explicit: `trialing`, `active`, `past_due`, and `canceled`. Scheduled cancellation is represented independently by `cancelAtPeriodEnd`; unsupported transitions fail with a stable conflict error.
- Credit refresh intervals are `daily`, `monthly`, `yearly`, and `none`. A `none` plan grants once when applied and returns `nextRefreshAt: null` rather than implying renewal.
- Period rollover grants the configured credits exactly once for a workspace, plan, and period. A retry must return the existing result.
- Paid upgrades use `external_checkout`. The workspace owner is redirected to the configured billing provider and the local subscription changes only after a signature-verified provider event.
- Checkout creation, provider return URLs, and frontend refreshes are never authoritative subscription events and must not apply plans or grant credits.
- The baseline provider is Stripe. If provider credentials are absent, checkout is explicitly disabled and the API returns `BILLING_PROVIDER_NOT_CONFIGURED`; it must not fall back to manual approval or simulated success.
- Signed provider webhook paths are exempt from browser CSRF checks; provider signature verification remains mandatory.
- Provider events are claimed transactionally by provider and event ID. Replaying the same event or subscription period cannot duplicate subscription changes, credit grants, or audit events.

### 5. Required API surface

All routes are under the Admin API global `/api/v1` prefix and use typed response envelopes.

| Method and path | Actor | Purpose |
|---|---|---|
| `GET /system/commerce/plans` | super admin | List the configured catalog, optionally including inactive plans |
| `PUT /system/commerce/plans/{code}` | super admin | Create or update one plan with integer money/credit fields |
| `GET /workspaces/{workspaceId}/commerce/overview` | workspace member | Read active plan, subscription, credit balance, period, and usage summary |
| `GET /workspaces/{workspaceId}/commerce/plans` | workspace member | List active plans with current/selectable state for the plan dialog |
| `GET /workspaces/{workspaceId}/commerce/credits/ledger` | workspace manager | Read the paginated immutable ledger |
| `POST /workspaces/{workspaceId}/commerce/checkout-session` | workspace manager | Create a real provider-hosted subscription checkout URL without changing local state |
| `POST /workspaces/{workspaceId}/commerce/customer-portal-session` | workspace manager | Create a provider-hosted subscription management URL |
| `POST /commerce/webhooks/stripe` | Stripe | Verify the signature and apply subscription lifecycle state idempotently |
| `PUT /system/commerce/workspaces/{workspaceId}/subscription` | super admin | Correct or administer a subscription explicitly |

Public workspace and request identifiers use the repository `PublicUUID` contract. External payloads use camelCase through the shared Pydantic alias contract.

### 6. Authorization and failure matrix

| Condition | Required result |
|---|---|
| Workspace has no explicit subscription | Materialize/read the configured Free entitlement; do not invent an unlimited balance |
| Builder generation request | Materialize the configured default subscription, then require `sites.generate` before a Job is accepted |
| Queued Builder Job starts a new effect | Re-evaluate `sites.generate`; a revoked, expired, or excluded entitlement must prevent execution |
| Requested plan is inactive or missing | `404`/`409` with stable plan error code |
| Caller is not a workspace manager | `403` with stable permission code |
| Available credits cannot cover the reservation | `402` with `AI_CREDITS_EXHAUSTED` and sanitized balance metadata |
| Same AI request is retried | Return/reuse the idempotent reservation or terminal ledger result |
| AI provider call fails | Release the reservation and record the failed request audit; do not debit committed credits |
| Actual charge is lower than reserved | Commit actual credits and release the difference atomically |
| Actual charge exceeds reservation | Atomically charge the additional credits or fail explicitly before presenting a successful AI result |
| Duplicate provider event or period grant | Return the existing operation outcome without a second grant |
| Missing provider configuration | `503` with `BILLING_PROVIDER_NOT_CONFIGURED`; never fabricate a checkout URL |
| Invalid or expired webhook signature | Reject with a stable `400`; do not mutate subscriptions, credits, ledger, or audit state |

### 7. Admin product experience

- The Header credit control shows available credits and the active plan for the current workspace.
- Hover/focus reveals balance, reserved/used credits, current period, next refresh, and a clear usage-detail action.
- Activation opens the workspace `Plan & Usage` settings screen. It combines plan status, current-period credits, AI request/token/cost usage, and an immutable ledger DataTable.
- Plan comparison supports monthly/yearly pricing, identifies the current plan, and redirects paid selection to provider checkout. Free-plan cancellation or downgrade is handled through the provider portal.
- The Header credit control, account menu, and workspace scope switcher all open the same `Plan & Usage` screen; credit details are not a standalone dialog.
- System settings expose the plan catalog as the shared DataTable and show whether external checkout is configured. There is no plan-change approval queue.
- Credit-ledger rows persist a stable `descriptionKey`; API responses resolve a localized `description` without rewriting immutable history.

### 8. Tests required

- Atomic concurrent reservation tests proving balance cannot go negative.
- Idempotent reserve/commit/release and period-grant tests.
- Checkout/portal authorization, exact provider amount conversion, signed webhook, and subscription lifecycle tests.
- Idempotent provider-event replay tests proving the same event cannot grant credits twice.
- HTTP 402 and localized error tests for exhausted credits.
- AI runtime integration tests proving successful calls commit and failed calls release.
- Plan-catalog and Builder tests proving `sites.generate` is explicit, request-gated, and revalidated at the worker effect boundary.
- Frontend tests for loading/error/no-workspace, hover/focus content, provider unavailable state, checkout interval selection, current plan, embedded ledger, and exhausted-credit behavior.
