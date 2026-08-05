# Workspace Commercialization Contracts

Experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)

This code-spec defines the shared plan, subscription, AI Credits, provider checkout, and usage contracts for Arclayer workspaces. A Workspace is the only commercial tenant; Organization remains an account-level governance container and never becomes a second commercial authority.

## Scenario: Commercial plans and AI consumption at workspace scope

### 1. Scope / Trigger

- Trigger: adding or changing plan configuration, workspace subscriptions, Workspace creation eligibility, AI usage charging, credit balances, plan selection, commercial ownership, or commercial administration UI.
- Applies to `apps/api`, Product Application commerce surfaces in `apps/app`, Platform Console commerce operations in `apps/platform`, generated OpenAPI contracts, and AI runtime accounting.
- The workspace is the commercial tenant. Users and projects consume the active workspace's entitlement; they do not own independent plan balances.

### 2. Domain vocabulary

| Term | Contract |
|---|---|
| Workspace | Customer-governed collaboration and project/site boundary that is the sole owner of its commercial state |
| Organization | Account-level governance container that may group workspaces but never owns, pools, inherits, or overrides their commercial state |
| Commercial tenant | A role fulfilled by exactly one Workspace, not a separate Organization- or user-level entity |
| Workspace lifecycle authority | Server authority for archive, restoration, explicit Owner deletion, and documented legal/privacy erasure that is independent of Commerce |
| Plan | Stable product-offer identity identified by a durable code such as `free` or `premium`; it does not contain mutable commercial terms |
| Draft Plan revision | Editable candidate terms that have never authorized checkout, Subscription state, Credits, or Entitlements |
| Plan revision | Immutable published snapshot of display terms, prices, currency, Credits, refresh policy, Entitlements, and provider Price mappings |
| Free Plan | Non-expiring Workspace Plan with explicit Credits, Entitlements, and resource allowances and no payment method or temporary paid-feature window |
| Free Workspace allowance | Account-level eligibility permitting one User to own at most one Workspace whose Subscription is bound to the Free Plan; it owns no commercial state |
| Active Project allowance | Maximum number of non-archived Projects that the Workspace Subscription's bound Plan Revision authorizes at the same time |
| Fixed Member access | Single non-Owner Workspace access profile applied to every ordinary member when the bound Plan Revision excludes role management |
| Feature Seat | One unit of a Workspace-owned Plan allowance assignable to an active member for one member-assigned paid capability |
| Feature Seat assignment | Revocable binding of one Workspace Feature Seat to one active membership and one Entitlement key; it grants no permission |
| Plan access convergence | Previewed effective-boundary transition that retires role and Feature Seat configuration unsupported by a target Plan Revision |
| Subscription | The workspace's current Plan revision, billing interval, lifecycle status, and current entitlement period |
| Grandfathered subscription | Subscription pinned to an older published Revision after its Plan exposes a newer selling Revision |
| Subscription revision transition | Explicit idempotent action that rebinds a Subscription from one published Revision to another |
| Renewal transition | Platform-initiated Revision transition scheduled for the Subscription's next provider-confirmed renewal boundary |
| Commercial correction | Immediate single-Workspace repair of incorrect commercial state with explicit Provider, proration, Credit, and Entitlement evidence |
| Domain policy exception | Time-bounded, reasoned, audited single-Workspace override owned by the domain whose policy-derived deadline it changes |
| Domain state correction | Evidence-backed compensating transition that changes one Workspace's already-effective Commerce or Hosting lifecycle state without rewriting its original history |
| Dunning policy | Configured Provider-aware rules for retry/recovery state, Payment Grace, final restriction, and restoration |
| Payment grace | Time-bounded access state after payment failure that preserves recovery and non-metered product/data access while withholding unpaid Credits and new external-cost effects |
| Payment restricted | Recoverable commercial access state after dunning exhaustion that blocks paid effects without deleting data, selecting Free, or changing the bound Revision |
| Restricted recovery mode | Product Application mode that keeps authenticated read, export, recovery, security, privacy, and lifecycle access while blocking value-expanding commands during Payment Restricted |
| Billing manager | Active Workspace member with explicitly Owner-delegated tenant-side commercial authority |
| Commercial lifecycle notification | Role-sensitive transactional notice triggered by a Commerce or Hosting lifecycle milestone and delivered through the Notifications authority |
| Hosting policy | Instance-configured rules for the continuity window, delivery suspension, visitor response, and restoration of already-published sites |
| Hosting continuity window | Time-bounded Hosting state that continues serving the last active release after Payment Restricted begins while new hosting-cost effects are blocked |
| Delivery suspended | Recoverable Hosting state that pauses public delivery without unpublishing or removing release, artifact, domain, or certificate state |
| Credit | Integer product unit used to meter AI work; distinct from money and provider tokens |
| Credit value | `credit_value_micros`, the integer number of provider-cost microdollars represented by one credit |
| Grant | Positive immutable ledger entry created by a plan period, operator adjustment, or approved commercial action |
| Reservation | Temporary credit hold created before an AI request |
| Commit | Final credit debit based on actual model cost |
| Release | Return of a reservation when the AI request fails or is cancelled |
| Checkout session | Short-lived provider-hosted payment URL; creating one never changes the local subscription |
| Provider event | Signed external billing event that is the only authority for applying paid subscription state |
| Entitlement | A registered capability key explicitly included or excluded by the Workspace Subscription's bound Plan Revision |

### 3. Money and credit invariants

- Monetary values use integer microdollars (`*_micros`); one USD is `1_000_000` microdollars. Do not store or expose floating-point plan prices.
- Credits are non-negative integers and are never used as an alias for provider tokens or microdollars.
- `credit_value_micros` is positive. Estimated and actual credit charges are:

```text
reserved_credits = ceil(estimated_cost_micros / credit_value_micros)
committed_credits = ceil(actual_cost_micros / credit_value_micros)
```

- Every committed AI ledger entry records the request id, Plan Revision id, estimated/actual `cost_micros`, applied `credit_value_micros`, reserved credits, and committed credits. Later catalog work cannot reinterpret history.
- Balance, reserved, and available values satisfy `available = balance - reserved` and may not become negative.
- Reservation, commit, release, period grant, and subscription change are transactionally consistent and idempotent by request/business key.
- A `past_due` period does not receive a new period Credit grant. Payment recovery grants the now-earned period Credits exactly once using Provider period identity and bound Plan Revision; duplicate or out-of-order recovery events cannot double-grant.

### 4. Plan catalog and subscription contracts

- Every Subscription, Credit account, immutable Credit ledger, Entitlement decision, and Usage record resolves to exactly one Workspace commercial tenant.
- Organization-level plans, subscriptions, Credit pools, and Entitlements are forbidden. Organization membership or governance never grants commercial state to a Workspace.
- Cross-workspace invoice or payment summaries may project Workspace-owned records for enterprise procurement, but they cannot mutate entitlement state or become a second balance authority.
- The initial catalog contains stable `free` and `premium` Plan codes, but the API and UI render the active catalog rather than hard-coding a two-plan limit.
- A User may own at most one Workspace whose Subscription is bound to the Free Plan. Joining or remaining a member of any number of other Workspaces does not consume this allowance.
- The Free Workspace allowance is an account-level creation and ownership eligibility rule, not a User or Organization Plan, Subscription, Credit pool, Entitlement source, or Usage authority.
- When the prospective Owner does not own another Free Workspace, creating a Free Workspace atomically binds it to the current selling Free Plan Revision without checkout or a payment method. It receives only that Revision's declared Credits, Entitlements, and resource allowances and never borrows paid defaults.
- When the prospective Owner already owns a Free Workspace, another Workspace requires its own paid Plan selection and signature-verified Provider confirmation before it becomes usable. A canceled, expired, or failed checkout does not create an active Workspace, consume the Free Workspace allowance, or grant paid access.
- Workspace creation, paid-to-Free downgrade, and Workspace ownership transfer apply the same server-authoritative allowance check. Concurrent or alternate entry points cannot leave one User owning more than one Free Workspace.
- The Free Plan does not expire, auto-convert, or schedule a downgrade. Arclayer offers no general time-limited paid Plan trial, card-required trial, trial countdown, or automatic post-trial charge; paid access begins only after an authorized checkout and signature-verified Provider confirmation.
- A Plan identity owns its stable code and catalog lifecycle. Every set of commercial terms belongs to a Draft or published Plan Revision.
- A Draft Plan Revision may be edited until publication. Publication assigns a monotonically increasing revision number and content hash; the published row and its provider Price mappings are immutable.
- A Plan Revision snapshots localized/product-facing name and description keys, period Credits, refresh interval, `credit_value_micros`, monthly/yearly price micros, currency, typed resource allowances, typed Entitlements, and provider Price mappings for each supported mode and billing interval.
- Every published Plan Revision explicitly declares the registered `projects.active` resource allowance as a positive integer limit or explicit `unlimited`. Missing, zero, negative, malformed, or duplicate declarations fail catalog validation rather than inheriting a product default.
- `projects.active` counts only non-deleted Project records with `is_active = true` inside the current Workspace. Archived Projects, Projects in another Workspace, and Projects that the same User merely belongs to never consume this Workspace's allowance.
- Project creation and restoration allocate one active place through the same transactionally serialized, server-authoritative check. Concurrent requests cannot both observe the last available place and exceed the bound Revision's limit.
- Archiving an active Project releases one place only after the archive mutation commits. It retains the Project and does not refund Credits, change Entitlements, or alter published-site state.
- A Plan selection or Revision transition may leave current active usage above the new allowance. Existing Projects remain active and intact; creation and restoration fail with `WORKSPACE_ACTIVE_PROJECT_LIMIT_REACHED` until committed active usage is below the effective limit or another Plan Revision takes effect.
- The Active Project allowance is distinct from AI Credits, capability Entitlements, Workspace Permissions, published-site state, Hosting limits, rollout eligibility, readiness, and health. Satisfying one does not imply another.
- Every published Plan Revision explicitly declares every registered authorization Entitlement. Missing, duplicate, malformed, excluded, inactive, or expired state fails closed.
- The registered `workspace.roles.manage` Entitlement controls tenant role creation, role editing, role deletion, permission-grant editing, invitation role selection, and member role assignment as one product capability. The Free Plan explicitly excludes it; every other Plan Revision declares inclusion or exclusion rather than inheriting a paid default.
- Excluding `workspace.roles.manage` applies the immutable built-in Fixed Member access profile to every active non-Owner member. Direct role, permission-grant, invitation-role, and member-role mutations fail with `WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED`; clients cannot create a per-member exception by omitting, forging, or replaying role codes.
- Workspace Owner authority is independent of `workspace.roles.manage`. The sole Owner keeps non-delegable tenant billing, ownership-transfer, and Workspace-lifecycle authority on every Plan and cannot be assigned, removed, or copied through role APIs.
- Including `workspace.roles.manage` enables the existing revisioned role and permission engine but grants no role-management permission by itself. The actor still needs the exact Workspace permission, and every resulting role remains subordinate to the Owner invariant.
- Each registered Entitlement definition declares which allocation modes it supports: `workspace` for every authorized member in the Workspace or `member_seat` for explicitly assigned active members. A Plan Revision selects only a supported mode; the catalog rejects arbitrary unregistered values rather than interpreting the existing generic feature value as configuration.
- An included `member_seat` Entitlement declares a positive integer Feature Seat limit or explicit `unlimited`. Missing, zero, negative, malformed, or duplicate seat configuration fails Plan Revision validation. An excluded Entitlement declares no usable seats.
- Feature Seats belong to the Workspace commercial tenant. A User, Organization, role, or membership never owns or carries the Plan Entitlement, seat pool, price, Credits, or Usage into another Workspace.
- A Feature Seat Assignment is unique by Workspace, Entitlement key, and active membership. Assign and revoke operations use expected revisions and idempotency, and the last available seat is allocated through a transactionally serialized check so concurrent requests cannot exceed the bound Plan Revision.
- Only active Workspace members may receive a Feature Seat Assignment. Membership removal, deactivation, or departure ends every assignment for that membership and releases the seats in the same committed lifecycle operation; rejoining creates no implicit restoration.
- Assigning, revoking, or retaining a Feature Seat never edits a role or permission grant. A role change never allocates or releases a seat, and a member with a seat but without the required Workspace Permission remains unauthorized.
- Effective use of a `member_seat` capability requires, in order, supported installation, instance enablement, configuration readiness, Workspace rollout inclusion, Workspace Entitlement, active Feature Seat Assignment, Workspace Permission, sufficient Credits/resource allowances where applicable, and runtime health. Every failed gate returns its own stable reason.
- Product API, Jobs, Tools, Agents, batch, retry, and worker effect boundaries re-evaluate the Workspace Entitlement and actor-bound Feature Seat Assignment before starting the paid effect. A queued request does not preserve use after its assignment is revoked.
- Feature Seat Assignment is commercial allocation inside one already-entitled Workspace, not a per-User rollout, personal Entitlement, permission override, hidden exception, or second Subscription authority.
- The Workspace Owner always has Feature Seat assignment authority independently of roles. A non-Owner must hold `workspace:feature-seats:manage`, which may be delegated only through the canonical role engine when the bound Plan Revision includes `workspace.roles.manage`; Plans without role management keep assignment authority with the Owner alone.
- `workspace:feature-seats:manage` permits reading assignment capacity and assigning or revoking existing Workspace-owned seats. It does not select or purchase a Plan, change a Subscription or seat limit, edit roles or permissions, invite or remove members, grant the capability's action permission, or let the actor use the assigned capability.
- Existing broad member-management, settings, Billing Manager, Organization, Project, and Platform permissions never imply `workspace:feature-seats:manage`. The permission holder may assign or revoke their own seat because that is the authority explicitly delegated; the mutation remains revisioned, capacity-checked, idempotent, and audited rather than requiring a hidden second-person rule.
- A Plan selection or Subscription Revision Transition requires Plan Access Convergence when the target Revision removes `workspace.roles.manage`, removes a `member_seat` Entitlement, or lowers a Feature Seat limit below current assignments. Scheduling is unavailable until a server preview identifies one exact source/target Revision pair and a complete access outcome.
- A target Free Plan additionally requires the current Owner's Free Workspace allowance at preview and effective time. Another owned Free Workspace, ownership drift, or a concurrently consumed allowance invalidates the transition; Arclayer never transfers ownership, upgrades another Workspace, or chooses which Free Workspace to keep.
- The convergence preview lists affected active members, current/effective role responsibilities, custom roles, Billing Managers, Feature Seat managers, Feature Seat Assignments, pending email invitations, reusable invitation links, queued actor-bound paid effects, and the effective time. It never reduces these consequences to an aggregate count.
- For a target Revision without role management, convergence end-dates every non-Owner role assignment and active custom role at the effective boundary, applies the immutable Fixed Member profile to every active non-Owner membership, and invalidates every pending invitation or link carrying a role. The Owner invariant and membership identities remain unchanged.
- For a removed member-assigned Entitlement, every assignment ends at the boundary. For a lower positive seat limit, the reviewed convergence plan names the exact assignments retained within the target capacity and ends the rest; Arclayer never chooses winners by creation time, role, usage, or alphabetical order.
- Ended role definitions, role assignments, invitation bindings, and Feature Seat Assignments remain immutable historical and Audit evidence, not dormant configuration. They are excluded from current authorization and cannot be reactivated, copied automatically, or restored by a later upgrade.
- At the effective boundary, one transaction binds the target local Plan Revision and applies the complete access convergence before acknowledging local success. Current Product Sessions resolve the new authorization on their next request; queued API, Job, Tool, Agent, retry, and worker effects re-evaluate and cannot consume ended authority or assignments.
- Arclayer exposes a role- or seat-impacting downgrade through a Provider Portal only when the Connector can carry the exact target Revision and a previously confirmed convergence identity through scheduling and signed events. Otherwise the Product Application uses the Arclayer-managed preview and Provider scheduling flow and does not advertise an unsafe Portal downgrade action.
- A signed Provider event that reports an access-reducing target without the expected convergence identity is recorded as an explicit reconciliation failure, blocks new paid effects, and emits a Commerce Operational Signal. It cannot bind the local target Revision, keep reporting paid access as healthy, silently delete access configuration, or infer a retained-member set; resolution uses a new forward preview against current Provider and Workspace state.
- The seeded `free` and `premium` Plans each receive an initial published Revision that includes `sites.generate`; reconciliation may backfill a missing seed identity or initial Revision but never mutates a published Revision or reverses an explicit `included: false` decision.
- Every Workspace Subscription references exactly one published Plan Revision. Entitlement evaluation, period grants, usage presentation, checkout, provider events, corrections, and audit evidence resolve that Revision rather than reading mutable terms from the Plan identity.
- Each active Plan exposes exactly one selling Revision for new checkout and explicit Plan selection. Publishing a new selling Revision never changes an existing Subscription binding.
- Existing Subscriptions remain Grandfathered indefinitely. They adopt another Revision only through Workspace-initiated Plan selection or a `commerce.subscriptions.manage` Subscription Revision Transition with explicit source and target Revision ids.
- Entitlement checks, period refresh, usage accounting, provider reconciliation, and background jobs resolve the Subscription's bound Revision. A latest/selling-Revision lookup in these paths is a contract violation.
- A Subscription Revision Transition records Workspace or cohort selection, source and target Revisions, actor, reason, requested/effective timestamps, provider and proration consequences, customer-notification evidence where required, idempotency key, result, and audit correlation.
- A transition preview is server-authoritative and identifies Subscription count, incompatible lifecycle states, Provider Price coverage, Entitlement and Credit changes, current-period effects, and any rows that cannot transition. Execution rejects if the preview token is stale or the cohort changed.
- Platform-initiated Subscription Revision Transitions are Renewal Transitions by default. Each Subscription retains its source Revision through the current paid period and targets its own `currentPeriodEnd`; one cohort operation may therefore contain multiple effective timestamps.
- For externally billed Subscriptions, scheduling requires Connector capabilities for Subscription scheduling/change, cancellation, and proration preview. The Provider schedule is created idempotently before local state becomes `scheduled`; the bound local Revision changes only after a signature-verified Provider event confirms the effective transition.
- A Provider without the required scheduling capabilities makes Renewal Transition explicitly unavailable and reports the missing capabilities in Commerce readiness. The system never substitutes a local-only scheduled change or fabricated proration result.
- Provider-defined cancellation rules determine the last reversible time. Canceling a Renewal Transition must cancel the Provider schedule first and changes local state only after confirmed Provider success.
- Provider-independent Free or manual Subscriptions use the durable local Renewal Transition as authority; the scheduler applies it transactionally at the period boundary and records the same audit/result contract.
- Immediate application is not an `effectiveMode` option on a Renewal Transition. It uses a separate Commercial Correction for one Workspace, requires a specific correction reason and source evidence, and previews exact proration/refund, Credit, Entitlement, period, and Provider consequences.
- A Commercial Correction cannot target a cohort. For externally billed state it follows a Provider-first or Provider-confirmed reconciliation path; it cannot mutate local paid state while leaving the Provider contract unchanged.
- A Domain Policy Exception is not a Commercial Correction: it changes one policy-derived deadline without rebinding a Plan Revision, changing Provider price/proration, granting Credits, or rewriting Subscription history.
- Commerce owns Dunning deadline exceptions and Hosting owns Hosting Continuity deadline exceptions. Each domain validates and persists its own single-Workspace exception; Notifications and the other domain cannot create, approve, or apply it.
- Every Domain Policy Exception records the original and replacement deadline, actor, exact owning-domain permission, reason, supporting evidence, requested/effective timestamps, idempotency key, and audit correlation. It is explicitly time-bounded; bulk, cohort, open-ended, and cross-domain exceptions are rejected.
- A Domain Policy Exception is accepted only while its source window and anchored deadline are still current. The replacement deadline must be later than that anchored deadline, and the mutation atomically compares the expected state/deadline revision so expiry or a concurrent transition wins visibly rather than being overwritten.
- Once Payment Grace becomes Payment Restricted or Hosting Continuity becomes Delivery Suspended, the expired deadline and transition are immutable. A Policy Exception cannot backdate, reopen, or relabel them.
- Restoring Payment Grace or Hosting Continuity after expiry requires a separate owning-domain Domain State Correction. The correction appends a compensating transition with stricter permission and evidence, exact before/after state, an explicit new deadline, idempotency, and audit; it never pretends to be Provider-confirmed payment recovery.
- Commerce and Hosting own their State Corrections independently. A Commerce correction cannot edit Hosting state, and a Hosting correction cannot edit commercial-access or Provider state.
- Deactivating a Plan prevents new selection but does not invalidate its published Revisions or silently rewrite an existing Subscription.
- Provider Price mappings use Plan Revision identity plus provider mode, billing interval, and currency. Reusing one external Price across different Revision terms or resolving only by Plan code fails closed.
- Provider Subscription lifecycle states used by the product are explicit: `active`, `past_due`, and `canceled`. Scheduled cancellation is represented independently by `cancelAtPeriodEnd`; an externally configured `trialing` state is unsupported by the initial product contract and fails reconciliation visibly rather than creating temporary Entitlements or silently mapping to Free.
- Commercial access state is a separate server-authoritative projection: `normal`, `payment_grace`, or `payment_restricted`. It is derived from signed Provider state, retry/recovery timestamps, the configured Dunning Policy, and local Provider-independent authority; clients never infer it from `past_due` alone.
- The Dunning Policy has explicit Provider-backed recovery deadlines and effect classes rather than one hard-coded grace duration. Missing Provider recovery metadata or an internally inconsistent deadline fails as an unavailable/attention state, not as unlimited grace or immediate restriction.
- During Payment Grace, Workspace login, data read, ordinary editing, export, payment recovery, and already-published delivery remain available. New-period Credits are not granted, and commands that would start a new metered external-cost effect fail with a stable payment-recovery error before the effect begins.
- Payment recovery keeps the same bound Plan Revision, restores `normal` access from a signature-verified Provider event, and idempotently grants any now-earned period Credits. It does not create a Subscription Revision Transition.
- Dunning exhaustion or a final Provider unpaid/canceled outcome enters Payment Restricted. The state does not delete Workspace/project/site data, silently select Free, rewrite Plan Revision, or pretend the Subscription is healthy.
- Payment Restricted has no data-deletion duration, countdown, or terminal purge transition. Remaining restricted for any length of time never authorizes Commerce, a Provider event, a scheduler, or a Platform Operator acting only with Commerce permission to delete Workspace data.
- Payment Restricted activates Restricted Recovery Mode without revoking Product Sessions, changing Workspace membership, archiving the Workspace, or creating `workspace_suspended` state.
- The Workspace Owner always has tenant-side commercial authority. When the bound Plan Revision includes `workspace.roles.manage`, any number of active Workspace members may become Billing Managers only through an explicit Owner grant of `workspace:commerce:manage`; a Plan without role management has no non-Owner Billing Managers.
- `workspace:commerce:manage` authorizes Plan selection, Checkout and Provider Portal session creation, payment recovery, detailed Credit-ledger access, and tenant commercial records. It grants no Platform Commerce, provider-configuration, Credit-adjustment, general settings, member-management, content, or lifecycle authority.
- Existing Admin, `system:settings:manage`, organization role, and ordinary Workspace membership never imply `workspace:commerce:manage`. Migration grants no inferred Billing Manager access from those broader legacy roles.
- Only a Workspace Owner may grant or revoke `workspace:commerce:manage`. Billing Managers cannot delegate it onward, and Restricted Recovery Mode continues to block new role/permission grants while preserving authority delegated before restriction.
- Every member may read the sanitized Plan and commercial access summary. Only the Owner or Billing Manager receives detailed commercial records and executable Checkout, Portal, Subscription, or recovery actions.
- Platform Operators use Platform API Commerce Permissions for investigation, correction, and reconciliation. They cannot exchange those permissions for a tenant Provider Portal session, submit a payment method, or impersonate an Owner/Billing Manager.
- Restricted Recovery Mode is a server-authoritative command policy, not a client route allowlist. Every Product API command is classified as preserved access, recovery/security/lifecycle exception, or blocked value expansion before side effects begin.
- The mode narrows existing Workspace authority and never grants a missing permission. An allowed export, security, privacy, lifecycle, or Commerce action still passes its normal actor, scope, confirmation, and audit checks.
- Successful Provider-confirmed recovery atomically changes commercial access to `normal` for subsequent command authorization. It does not mint a new Product Session or rewrite roles, memberships, Plan Revision, or existing data.
- Workspace deletion belongs exclusively to the Workspace Lifecycle Authority and requires either an explicit Workspace Owner instruction or a documented legal/privacy process. An accepted deletion may have its own retention and purge schedule, but commercial timestamps cannot create, advance, or shorten it.
- Archive, access suspension, Hosting Continuity expiry, and Delivery Suspended remain distinct from lifecycle deletion and never become implicit deletion requests.
- If Provider recovery arrives after an independently authorized Workspace deletion has completed, Commerce reconciles the Provider and commercial records without recreating the Workspace or any deleted data.
- Commerce owns commercial-access transitions but not public delivery. It emits durable Payment Restricted and recovery facts; Hosting consumes them idempotently and owns its delivery projection under the configured Hosting Policy.
- Entering Payment Restricted starts one Hosting Continuity Window for the uninterrupted restricted period. Replayed restriction facts do not extend its deadline; a successful recovery followed by a later restriction starts a new window.
- During Hosting Continuity, the current active release remains publicly served. Rebuild, republish, domain mutation, and other commands that add hosting cost fail before work begins, while read-only investigation and payment recovery remain available.
- When the Hosting Continuity Window expires, Hosting enters Delivery Suspended. The delivery gate does not deactivate the canonical release or delete its artifact, domain bindings, or certificate associations.
- Recovery clears Hosting Continuity or Delivery Suspended atomically and resumes the same active release without a build, publish, or deployment job. Restoration failures remain explicit and produce a Hosting-owned Operational Signal.
- A Commerce Domain State Correction from Payment Restricted to Payment Grace publishes a durable corrected commercial-access transition after its own transaction commits. Hosting consumes it idempotently, records a Hosting-owned restoration transition, clears Continuity or Delivery Suspended, invalidates suspended-response caches, and resumes normal delivery of the same active release because Payment Grace preserves already-published delivery.
- Commerce and Hosting do not share a distributed transaction. If Hosting restoration fails, the Commerce correction remains effective and queryable; Hosting retains the failed restoration state, retries through its own durable authority, and emits an Operational Signal without reporting successful delivery.
- A Hosting-only Domain State Correction is used only when commercial access remains Payment Restricted and the operator intentionally moves Delivery Suspended into a new Hosting Continuity Window. It does not change Commerce state and is not required after Commerce has corrected access to Payment Grace.
- Commerce never writes deployment, release, domain-binding, certificate, cache, or delivery-state records as part of dunning or recovery processing.
- Credit refresh intervals are `daily`, `monthly`, `yearly`, and `none`. A `none` plan grants once when applied and returns `nextRefreshAt: null` rather than implying renewal.
- Period rollover grants the configured Credits exactly once for a Workspace, Plan Revision, and period. A retry must return the existing result.
- Paid upgrades use `external_checkout`. The workspace owner is redirected to the configured billing provider and the local subscription changes only after a signature-verified provider event.
- Checkout creation, provider return URLs, and frontend refreshes are never authoritative subscription events and must not apply plans or grant credits.
- The baseline provider is Stripe. If provider credentials are absent, checkout is explicitly disabled and the API returns `BILLING_PROVIDER_NOT_CONFIGURED`; it must not fall back to manual approval or simulated success.
- Signed provider webhook paths are exempt from browser CSRF checks; provider signature verification remains mandatory.
- Provider events are claimed transactionally by provider and event ID. Replaying the same event or subscription period cannot duplicate subscription changes, credit grants, or audit events.

### 5. Required API surface

All routes use typed response envelopes under the shared `/api/v1` prefix. Workspace commerce routes belong to the Product API; instance catalog, provider webhook, and corrective-operation routes belong to the Platform API.

| Method and path | Actor | Purpose |
|---|---|---|
| `GET /system/commerce/plans` | `commerce.read` | List Plan identities with their published and Draft Revision summaries |
| `POST /system/commerce/plans` | `commerce.catalog.manage` | Create one stable Plan identity without inventing published terms |
| `GET /system/commerce/plans/{code}/revisions` | `commerce.read` | List immutable published and editable Draft Revisions |
| `POST /system/commerce/plans/{code}/revisions` | `commerce.catalog.manage` | Create a Draft Revision, optionally from an existing Revision |
| `PUT /system/commerce/plans/{code}/revisions/{revisionId}` | `commerce.catalog.manage` | Update a Draft Revision; reject published Revision mutation |
| `POST /system/commerce/plans/{code}/revisions/{revisionId}/publish` | `commerce.catalog.manage` | Validate provider mappings and Entitlements, then publish the immutable Revision |
| `GET /system/commerce/subscriptions` | `commerce.read` | List and filter Workspace Subscriptions across the deployment |
| `POST /system/commerce/subscription-revision-transitions/preview` | `commerce.subscriptions.manage` | Preview an explicit single-Workspace or cohort Revision transition |
| `POST /system/commerce/subscription-revision-transitions` | `commerce.subscriptions.manage` | Schedule an idempotent Renewal Transition from an unexpired preview token |
| `GET /system/commerce/subscription-revision-transitions/{transitionId}` | `commerce.read` | Read transition progress, per-Subscription results, failures, and audit correlation |
| `DELETE /system/commerce/subscription-revision-transitions/{transitionId}` | `commerce.subscriptions.manage` | Cancel a reversible scheduled transition through the Provider-confirmed path |
| `POST /system/commerce/workspaces/{workspaceId}/subscription-corrections/preview` | `commerce.subscriptions.manage` | Preview one immediate Commercial Correction and all resulting consequences |
| `POST /system/commerce/workspaces/{workspaceId}/subscription-corrections` | `commerce.subscriptions.manage` | Apply one idempotent correction from an unexpired preview and evidence bundle |
| `GET /system/commerce/workspaces/{workspaceId}/overview` | `commerce.read` | Investigate one Workspace's Subscription, Credits, Usage, and provider freshness |
| `GET /system/commerce/transactions` | `commerce.read` | List provider transaction projections when supported |
| `GET /system/commerce/provider` | `commerce.read` | Read sanitized provider identity, configuration readiness, and health |
| `PUT /system/commerce/provider` | `commerce.provider.manage` | Change provider configuration without returning stored secrets |
| `GET /system/commerce/dunning-policy` | `commerce.read` | Read Provider retry/recovery inputs and effective commercial access rules |
| `PUT /system/commerce/dunning-policy` | `commerce.provider.manage` | Configure Provider-aware recovery and restriction rules with validation |
| `GET /system/commerce/provider/events` | `commerce.read` | List the signed provider-event ledger and processing state |
| `POST /system/commerce/provider/events/{eventId}/reconcile` | `commerce.events.reconcile` | Idempotently retry or reconcile one eligible failed event |
| `POST /system/commerce/workspaces/{workspaceId}/credits/adjustments` | `commerce.credits.adjust` | Append an audited Credit adjustment without editing ledger history |
| `GET /workspaces/{workspaceId}/commerce/overview` | workspace member | Read active plan, subscription, credit balance, period, and usage summary |
| `GET /workspaces/{workspaceId}/commerce/plans` | workspace member | List active plans with current/selectable state for the plan dialog |
| `GET /workspaces/{workspaceId}/commerce/credits/ledger` | `workspace:commerce:manage` | Read the paginated immutable ledger |
| `POST /workspaces/{workspaceId}/commerce/checkout-session` | `workspace:commerce:manage` | Create a real provider-hosted subscription checkout URL without changing local state |
| `POST /workspaces/{workspaceId}/commerce/customer-portal-session` | `workspace:commerce:manage` | Create a provider-hosted subscription management URL |
| `GET /workspaces/{workspaceId}/commerce/payment-recovery` | `workspace:commerce:manage` | Read the exact recovery deadline and executable Provider recovery action |
| `POST /commerce/webhooks/stripe` | Stripe | Verify the signature and apply subscription lifecycle state idempotently |
| `PUT /system/commerce/workspaces/{workspaceId}/subscription` | `commerce.subscriptions.manage` | Correct or administer a subscription explicitly |

Public workspace and request identifiers use the repository `PublicUUID` contract. External payloads use camelCase through the shared Pydantic alias contract.

The legacy `PUT /system/commerce/plans/{code}` in-place upsert is removed in the hard cut. Workspace Plan selection continues to use the stable Plan code in product-facing URLs, but the server resolves and returns the eligible published Revision explicitly. Checkout metadata and signed provider events include both Plan code and Revision identity; a missing, unknown, mismatched, or unpublished Revision fails without changing Subscription state.

The direct Subscription correction route requires an explicit target Revision id and never resolves by Plan code alone. Provider events without a Revision identity may update non-contract lifecycle facts only when they correlate to the Subscription's already-bound provider Price; they cannot adopt a newer Revision implicitly.

#### 5.1 Platform permission contract

| Permission | Delegated authority |
|---|---|
| `commerce.read` | Enter Commerce, read sanitized commercial projections, inspect Operational Signals, and follow exact cross-domain links |
| `commerce.catalog.manage` | Create Plan identities, prepare Draft Revisions, publish immutable Revisions, and change catalog lifecycle state |
| `commerce.subscriptions.manage` | Correct Subscription plan, lifecycle, interval, or cancellation state |
| `commerce.credits.adjust` | Append explicit Credit grants, expirations, or corrections through the immutable ledger |
| `commerce.provider.manage` | Configure provider identity, mode, credentials, Price mappings, and webhook readiness |
| `commerce.events.reconcile` | Retry or reconcile eligible failed provider events through the durable idempotent event authority |

The Instance Owner has the complete set independently of Platform Roles. Platform Operators receive permissions only through immutable Built-in Platform Roles or deployment-owned Custom Platform Roles, with no per-operator override. A role may bundle `commerce.read` with a mutation permission for usable navigation, but `commerce.read` does not imply mutation, no mutation permission grants another mutation class, and the Platform API checks the exact permission from current role revisions independently on every endpoint, including existing Platform Sessions after a role change. A generic `commerce.manage` permission and the legacy `require_super_admin` router dependency are forbidden compatibility paths.

Operational Signals declare the exact permission required for their resolution action. An operator with `commerce.read` but without that mutation permission may investigate the condition but cannot invoke or simulate the resolution.

#### 5.2 Workspace billing permission contract

`workspace:commerce:manage` is a Workspace-scoped permission in the server permission catalog. The Workspace Owner is always authorized and is the only actor that may delegate or revoke it. When the bound Plan Revision includes `workspace.roles.manage`, an active member with the effective permission is presented as a Billing Manager; Billing Manager is a responsibility, not a second hard-coded system role, so the permission may be attached to an Owner-created custom role without duplicating RBAC authority. A Plan without role management keeps billing authority with the Owner alone.

When role management is available, the permission page groups `workspace:commerce:manage` under Workspace Commerce with localized name, description, sensitivity warning, and a statement that it can open Provider-hosted payment surfaces. Owner assignment is immutable. Custom-role grants show the affected Billing Managers before save, require the normal role revision/catalog revision/idempotency contract, and are rejected unless the actor is a Workspace Owner.

The current `require_workspace_manage_access` checks on Checkout, Customer Portal, and Credit Ledger are removed from these routes as authorization authorities. They are replaced with the exact catalog permission; ordinary membership, `system:settings:manage`, Admin role, and visible navigation are never compatibility grants.

### 6. Authorization and failure matrix

| Condition | Required result |
|---|---|
| Workspace has no explicit subscription | Materialize/read the configured Free entitlement; do not invent an unlimited balance |
| Builder generation request | Materialize the configured default subscription, then require `sites.generate` before a Job is accepted |
| Queued Builder Job starts a new effect | Re-evaluate `sites.generate`; a revoked, expired, or excluded entitlement must prevent execution |
| Requested plan is inactive or missing | `404`/`409` with stable plan error code |
| Caller lacks `workspace:commerce:manage` for a tenant-side commercial mutation or detailed ledger | `403 WORKSPACE_COMMERCE_MANAGE_REQUIRED` without creating a Provider session |
| Available credits cannot cover the reservation | `402` with `AI_CREDITS_EXHAUSTED` and sanitized balance metadata |
| Same AI request is retried | Return/reuse the idempotent reservation or terminal ledger result |
| AI provider call fails | Release the reservation and record the failed request audit; do not debit committed credits |
| Actual charge is lower than reserved | Commit actual credits and release the difference atomically |
| Actual charge exceeds reservation | Atomically charge the additional credits or fail explicitly before presenting a successful AI result |
| Duplicate provider event or period grant | Return the existing operation outcome without a second grant |
| Missing provider configuration | `503` with `BILLING_PROVIDER_NOT_CONFIGURED`; never fabricate a checkout URL |
| Invalid or expired webhook signature | Reject with a stable `400`; do not mutate subscriptions, credits, ledger, or audit state |
| New selling Revision is published | Existing Subscriptions remain bound to their current Revision; no transition job is created implicitly |
| Transition preview is stale or cohort membership changed | Reject with a stable conflict; require a new preview before execution |
| Target Revision lacks exact Provider Price coverage | Reject the affected transition before changing local or provider state |
| Connector lacks schedule/change, cancellation, or proration-preview capability | Mark Renewal Transition unavailable with explicit missing prerequisites |
| Paid Provider schedule is created but confirmation is pending | Keep the source Revision bound and expose pending Provider state; do not apply the target locally |
| Operator requests immediate cohort migration | Reject; immediate change is a single-Workspace Commercial Correction only |
| Provider reports `past_due` with valid recovery metadata | Enter Payment Grace; withhold new period Credits and block new metered external-cost effects without deleting or silently downgrading data |
| Payment succeeds during recovery | Restore the same Revision and grant the earned period Credits exactly once |
| Recovery metadata is missing or inconsistent | Expose unavailable/attention state and Operational Signal; do not assume unlimited grace or immediate restriction |
| Dunning is exhausted or Provider reports final unpaid/canceled outcome | Enter Payment Restricted without deleting data, selecting Free, or changing Revision |
| Payment Restricted begins | Emit the commercial transition; Hosting starts its configured Continuity Window without changing the active release |
| Restriction fact is replayed during one uninterrupted restricted period | Return the existing Hosting transition outcome and original deadline; do not extend continuity |
| Hosting Continuity Window expires | Enter Delivery Suspended while preserving release, artifact, domain-binding, and certificate state |
| Payment recovers during continuity or suspension | Clear the Hosting delivery gate and atomically resume the same active release without rebuild or redeploy |
| Hosting restoration fails | Keep the failure explicit and emit a Hosting-owned Operational Signal; do not report successful delivery |
| Payment Restricted remains unresolved for any duration | Preserve Workspace data; do not create a lifecycle deletion request or retention deadline |
| Commerce operator requests deletion as a billing resolution | Reject and direct the operator to the independently authorized Workspace lifecycle/legal process |
| Independently authorized Workspace deletion completes before a later Provider recovery | Reconcile commercial/provider state without resurrecting the Workspace or deleted data |
| Read/list/detail/download of preserved Workspace data during Payment Restricted | Allow when normal Workspace authorization succeeds |
| Export of preserved Workspace data during Payment Restricted | Allow through the canonical export path without AI generation, external fetch, build, publish, or fabricated missing artifacts |
| Payment recovery, support, privacy, lifecycle, or security-reducing command | Apply normal authorization and audit; Restricted Recovery Mode does not block or grant it |
| Content, project, site, Customization, AI, import, build, publish, deployment, domain, invite, role-grant, or credential-creation command | Reject before dispatch with `402 WORKSPACE_PAYMENT_RESTRICTED` and stable recovery metadata |
| Commercial access changes to Payment Restricted while state-changing work is queued or running | Cancel or stop at the declared safe boundary; record any non-recallable external effect and its settlement explicitly |
| Provider-confirmed payment recovery succeeds | Atomically restore `normal` command authorization without replacing the Product Session or membership state |
| Ordinary member views Payment Restricted Workspace | Return sanitized state and identify that an Owner/Billing Manager must recover payment; expose no Provider Portal URL or payment detail |
| Owner or Billing Manager requests Checkout/Portal/recovery | Revalidate `workspace:commerce:manage`, create an actor-bound Provider session, and audit the request without treating redirect completion as payment authority |
| Billing Manager attempts to grant billing authority | Reject; only a Workspace Owner may delegate or revoke `workspace:commerce:manage` |
| Platform Operator attempts tenant Checkout or Provider Portal access | Reject even when the operator has Platform Commerce Permissions; use Platform investigation/reconciliation workflows instead |
| A lifecycle source fact or Provider event is replayed | Return the existing milestone dispatch outcome; do not create duplicate deliveries for the same recipient and channel |
| Owner or Billing Manager authority changes before actual dispatch | Resolve the current Owner and `workspace:commerce:manage` holders again; do not send later notices to a revoked Billing Manager |
| One or more lifecycle-notification deliveries fail | Preserve the Commerce and Hosting transitions and their original deadlines; record retryable per-recipient/channel failures without reporting delivery success |
| All billing contacts are unreachable or a critical lifecycle notice remains undelivered | Emit a high-priority Operational Signal with the affected Workspace and delivery evidence; do not fabricate recovery or mutate lifecycle state |
| Notification retry or delivery reconciliation requests a deadline extension | Reject; Notifications may retry the immutable delivery only and has no Commerce or Hosting policy-mutation authority |
| Operator requests one exception that changes Dunning and Hosting deadlines together | Reject; require separate owning-domain actions, permissions, reasons, evidence, idempotency identities, and audits |
| Operator requests a bulk, cohort, or open-ended policy exception | Reject; every exception is time-bounded and scoped to exactly one Workspace and one owning-domain deadline |
| A Domain Policy Exception is accepted | Preserve the Plan Revision, Provider facts, Credits, active release, and other domain's deadline; expose the original/replacement deadline and audit evidence explicitly |
| Policy Exception arrives after its anchored deadline or lifecycle transition | Reject with the current state and immutable historical deadline; do not backdate or reopen the window |
| Policy Exception expected state/deadline revision is stale | Reject with a stable conflict and require a fresh preview; do not overwrite expiry or another operator's action |
| Authorized operator must restore Payment Grace or Hosting Continuity after expiry | Require the owning domain's separate Domain State Correction with stricter permission/evidence and append a compensating transition with a new deadline |
| Operator or migration attempts to edit the expired deadline or original transition | Reject; lifecycle history is append-only and cannot be made to look as if restriction or suspension never occurred |
| Commerce State Correction enters Payment Grace while Hosting is in Continuity or Delivery Suspended | Commit Commerce first, publish the corrected access fact, and let Hosting idempotently restore normal delivery of the same active release through a Hosting-owned transition |
| Corrected commercial-access fact is replayed | Return the existing Hosting restoration result; do not append another restoration or rebuild/redeploy the release |
| Hosting restoration after Commerce correction fails | Keep Payment Grace effective, retain explicit Hosting failure, retry through Hosting, and emit a Hosting Operational Signal; do not roll Commerce back or claim delivery success |
| Operator requests a second Hosting State Correction after Commerce already entered Payment Grace | Reject as unnecessary/conflicting; the corrected commercial-access fact is the canonical restoration trigger |
| Domain Policy Exception or Domain State Correction commits | Emit its own transactional milestone after commit with source kind, cause, original/new deadline or state, and correlation identity; do not send from preview or request receipt |
| Commerce correction requires asynchronous Hosting restoration | Notify Payment Grace plus explicit delivery-restoration progress; do not claim the site is available until Hosting emits success |
| Hosting restoration succeeds after Commerce correction | Emit a separate Hosting-owned success milestone identifying restoration of the preserved active release without exposing internal deployment data |
| Hosting restoration fails after Commerce correction | Emit a separate Hosting-owned failure milestone and Operational Signal; preserve Payment Grace and do not send or retain a false success notice |

### 7. Cross-domain Hosting continuity

The Dunning Policy determines when commercial access becomes Payment Restricted; it does not configure visitor delivery. The Hosting Policy belongs to the Hosting & Delivery Platform Domain and defines the Continuity Window and the public suspended response. Changing that policy affects future transitions and must not silently rewrite an already-running continuity deadline.

During continuity, custom domains and Arclayer-managed subdomains serve the same active release they served before restriction. After suspension, a custom domain returns a neutral localized “site temporarily unavailable” response that does not disclose billing or Workspace identity. An Arclayer-managed subdomain may return a branded recovery response, but it must not expose payment details, operator controls, internal identifiers, or private Workspace data. Both responses are unavailable delivery states, never successful published content or prelaunch fallbacks.

Hosting owns deadline evaluation, delivery gating, cache invalidation, suspension presentation, and restoration. Commerce exposes the source commercial transition, cause, and correlation identity only. A Provider-confirmed payment recovery and a Commerce Domain State Correction to Payment Grace both remove the Payment Restricted basis for the gate, but remain distinct Commerce causes; Hosting records the exact source transition on its own idempotent restoration. Neither domain deletes Workspace data through this protocol, and suspended delivery remains distinguishable from release publication state.

The cross-domain handoff is eventually consistent and outbox-backed, not a distributed database transaction. Commerce success never waits for or is rolled back by Hosting. Until Hosting applies the fact, the Product Application shows Payment Grace together with explicit delivery-restoration progress/failure rather than pretending the site is already available. Hosting restoration reuses the preserved active release and performs no build, publish, or deployment work.

The committed Commerce correction emits a Commercial Lifecycle Notification milestone that states delivery restoration is pending when a Hosting gate exists. Hosting then emits a distinct success or failure milestone from its own restoration result. Notifications cannot infer Hosting success from Commerce state, worker dispatch, retry scheduling, or absence of an error.

Workspace data retention and deletion are likewise outside this protocol. Commerce may project that a restricted Workspace consumes storage for investigation and forecasting, but it cannot present deletion as a payment-recovery action, emit a deletion deadline, or invoke the Workspace deletion route. Any lifecycle or legal deletion proceeds under its own actor authority, evidence, notification, retention, purge, and audit contract.

### 8. Restricted Recovery Mode

Restricted Recovery Mode preserves these command classes when the actor already has the required Workspace authority:

- establish or continue a Product Session and enter the affected Workspace;
- list, search, inspect, and download data and immutable artifacts that already exist;
- export preserved Workspace data through the canonical export workflow, without regenerating missing artifacts, invoking AI, fetching external sources, building, or publishing;
- inspect Plan & Usage, open the Provider recovery surface, and complete payment recovery;
- contact support and exercise privacy or Workspace lifecycle rights;
- reduce security exposure by revoking sessions, API keys, Connector credentials, pending invitations, or member access;
- revoke Feature Seat Assignments to reduce paid-capability access.

It blocks these value-expanding command classes:

- create, edit, move, delete, or version content, projects, sites, assets, Knowledge, Skills, Design Systems, or other Customization state;
- run AI, import, source synchronization, external fetch, asset transformation, preview generation, thumbnail capture, build, publish, deployment, or domain/certificate mutation;
- invite members, grant roles, create credentials, install or enable Connectors, or otherwise expand access;
- assign a new Feature Seat or move a seat to another member;
- enqueue an equivalent background command through a batch, Tool, Agent, retry, schedule, webhook, or direct API path.

Security-reducing and lifecycle commands are exceptions, not a generic write bypass. A command that mixes preserved and blocked effects is rejected as a whole unless its canonical contract already defines an atomic separation; it never silently skips the blocked effects. Transition into Restricted Recovery Mode prevents new work and requests cancellation of queued/running state-changing Jobs at their documented safe boundary. Effects that can no longer be recalled remain explicit and settle through their owning domain.

The payment-recovery exception is actor-scoped: all members may inspect the sanitized state, while only the Owner or an already-delegated Billing Manager may create Checkout/Portal sessions or invoke Subscription recovery. Restricted Recovery Mode does not permit granting a new Billing Manager because that would expand access; the Owner remains an immutable recovery authority.

Blocked Product API commands return HTTP `402` with `WORKSPACE_PAYMENT_RESTRICTED`, the commercial access state, a localized explanation key, and an exact permitted recovery action when one exists. Reads do not return this error. Payment Restricted never returns `WORKSPACE_SUSPENDED`, never populates the Access Restriction store, and never uses the full-screen suspension blocker.

The current status-only `EntitlementService` and generic `403 COMMERCE_ENTITLEMENT_REQUIRED` behavior are insufficient for this mode. The hard cut introduces the commercial-access projection and central command classification at Product API and worker effect boundaries; module-local route hiding or scattered Subscription-status checks are forbidden parallel authorities.

### 9. Commercial lifecycle notifications

Commercial lifecycle communication is event-driven transactional delivery, not a `NotificationCampaign`, a daily reminder blast, or a dependency on Provider-only email. A Provider may send its own notices, but Arclayer remains responsible for its product-state explanation, recovery path, and durable delivery evidence.

#### 9.1 Milestones and source ownership

| Milestone | Source authority | Required meaning |
|---|---|---|
| First payment failure enters Payment Grace | Commerce | Explain retained access, withheld Credits/new metered effects, recovery deadline, and recovery path |
| Payment Grace approaches its configured deadline milestone | Commerce under the Dunning Policy | Warn before the existing deadline without creating a new deadline or daily resend loop |
| Dunning exhaustion enters Payment Restricted | Commerce | Explain Restricted Recovery Mode, retained data/export, blocked value expansion, and payment recovery |
| Hosting Continuity approaches its configured expiry milestone | Hosting under the Hosting Policy | Explain the existing delivery deadline and the consequence of Delivery Suspended without exposing payment state to site visitors |
| Hosting enters Delivery Suspended | Hosting | Report that public delivery is paused while the active release and bindings remain preserved |
| Provider-confirmed payment recovery succeeds | Commerce | Report restored commercial access; Hosting restoration failures remain separate Hosting Operational Signals rather than a false success |
| Domain Policy Exception is accepted | Commerce or Hosting, according to the affected deadline | Report the operator-granted temporary deadline and retained/blocked capability effect only after the exception commits |
| Domain State Correction is accepted | Commerce or Hosting, according to the corrected state | Report the compensating state and new deadline without relabeling it as Provider payment recovery |
| Hosting restoration after a Commerce correction succeeds | Hosting | Report that normal delivery of the preserved active release actually resumed |
| Hosting restoration after a Commerce correction fails | Hosting | Report the still-unavailable delivery state and recovery progress without undoing or misreporting the Commerce correction |

Commerce and Hosting publish durable source facts with Workspace, transition identity, milestone, effective/deadline timestamps where applicable, and correlation context. Notifications consumes those facts idempotently and owns template-version resolution, localization, channel dispatch, delivery and interaction state, retry classification, and sanitized failure evidence. It never reinterprets Subscription or Hosting state.

#### 9.2 Audience and content boundaries

At each actual dispatch, Notifications resolves the current Workspace Owner, current active members with `workspace:commerce:manage`, and other active members from canonical Workspace identity/RBAC projections. One user matching multiple billing-contact criteria is deduplicated.

| Recipient | Channels | Content boundary |
|---|---|---|
| Workspace Owner and current Billing Managers | Email and in-app | May include the safe recovery deadline, retained/blocked capability summary, and an authenticated Product Application recovery action; never includes payment credentials |
| Other active Workspace members | In-app only | May include sanitized commercial/Hosting access state and whom to contact; never includes amounts, invoice data, Provider ids, payment-method data, Provider Portal URLs, or other billing details |

Email recovery actions target the authenticated Product Application, where the server revalidates `workspace:commerce:manage` before creating any actor-bound Provider session. A previously generated Provider Portal session is not embedded as a reusable email authority.

Operator-driven notices identify that a temporary exception or compensating correction occurred. Owner and Billing Manager content names the source as “Arclayer Platform Operations” and includes a stable localized customer-safe reason category, original and new deadline/state, effective time, and support reference. It never exposes the individual Platform Operator identity, internal free-text reason, evidence, Platform permissions, Provider diagnostics, or raw audit data.

Other active members receive only the sanitized capability/delivery effect and effective time. They do not receive the reason category, operator source detail, support/audit reference, deadlines that reveal billing recovery information, or any payment context. Platform Audit separately retains the real actor, exact permission, complete reason/evidence, before/after state, Provider context, and correlation identity; the recipient projection never weakens or replaces that internal evidence.

#### 9.3 Idempotency, failure, and operations

Every delivery has a stable idempotency identity containing at least Workspace, source transition identity, milestone, recipient, and channel. Provider webhook replay, source-event redelivery, worker retry, and recipient deduplication cannot create a second delivery for that identity. A retry updates the existing per-recipient delivery attempt history.

Policy preview, correction preview, command acceptance, and queued Hosting restoration are not success milestones. Notifications fan out only from committed owning-domain facts. A Commerce correction and its later Hosting restoration outcome have distinct source transition and milestone identities, so success/failure delivery cannot overwrite the earlier “restoration pending” notice or be collapsed into one ambiguous message.

Delivery failure never changes Payment Grace, Payment Restricted, Hosting Continuity, Delivery Suspended, or recovery state, and never changes their deadlines. Failures remain visible and retryable according to the durable notification-delivery policy. If every current billing contact is unreachable or a critical milestone exhausts its configured delivery attempts, Notifications emits a high-priority source condition with sanitized evidence; Needs attention links to delivery investigation without offering a control that replays commercial state or edits the audience.

#### 9.4 Domain Policy Exceptions

Notification unreachability never extends Payment Grace or Hosting Continuity automatically. The Operational Signal may link an authorized Platform Operator to the exact owning-domain investigation context, but Notifications cannot supply a mutation payload, combine deadlines, or treat delivery state as policy authority.

A Domain Policy Exception is an explicit single-Workspace operator action. Commerce owns an exception to a Dunning Policy-derived deadline and Hosting owns an exception to a Hosting Policy-derived continuity deadline. Each action independently requires the owning domain's exact mutation permission, a reason, supporting evidence, the original deadline, an explicit replacement deadline, idempotency, and audit. Changing one deadline has no effect on the other.

Exceptions are never bulk or cohort actions and cannot be open-ended. They do not change Plan Revision, Provider lifecycle facts, Credits, Restricted Recovery command classification, active release identity, domain bindings, certificates, or Workspace lifecycle/deletion state. Global Dunning or Hosting Policy edits continue to affect future policy evaluations according to their own contract and do not masquerade as per-Workspace exceptions.

The exception mutation locks or revision-checks the current domain projection and succeeds only before the anchored deadline while the source window remains active. Its replacement deadline is later than the anchored deadline. If expiry, recovery, another exception, or another transition wins first, the request fails with the current state and requires a fresh preview; it never rewrites the winner.

After Payment Restricted or Delivery Suspended becomes effective, restoration is not an exception to the expired policy evaluation. It is a Domain State Correction: Commerce may append `payment_restricted -> payment_grace` with a new grace deadline, and Hosting may append `delivery_suspended -> hosting_continuity` with a new continuity deadline. Each correction requires a separate higher-sensitivity permission, evidence explaining why normal recovery is unavailable or insufficient, an exact before/after preview, idempotency, and audit. The prior deadline and transition remain queryable and unchanged.

A Domain State Correction does not claim that the Provider received payment, grant Credits, rebind the Plan Revision, rebuild or republish the site, or recreate deleted data. It directly restores only its owning domain's declared state. A Commerce correction to Payment Grace nevertheless publishes the canonical access transition that Hosting must project into its own normal-delivery restoration; this downstream projection is not a Commerce mutation of Hosting.

An accepted Domain Policy Exception or Domain State Correction emits its Commercial Lifecycle Notification only after the owning transaction commits. When a Commerce correction must clear a Hosting gate, its first notice reports delivery restoration as pending. Hosting later emits a separate committed success or failure result; neither dispatch acceptance nor retry scheduling is a delivery-success fact.

### 10. Product and platform experience

#### 10.1 Workspace self-service

- The Header credit control shows available credits and the active plan for the current workspace.
- Hover/focus reveals balance, reserved/used credits, current period, next refresh, and a clear usage-detail action.
- Activation opens the Workspace `Plan & Usage` settings screen. It combines current Plan and billing state, Credit sources and depletion, real limits, current-period usage, reporting freshness, forecast, attribution, invoices, recovery, and authorized plan/refill actions. The detailed ledger remains secondary evidence rather than the page's primary product model.
- Plan comparison supports monthly/yearly pricing and identifies the current plan. Paid selection redirects to Provider checkout. Cancellation or downgrade uses the Provider Portal only when the Connector can preserve every required target Revision and Plan Access Convergence identity; otherwise Arclayer presents its managed preview and Provider scheduling flow rather than an unsafe Portal action.
- Free Plan presentation states that access does not expire and shows its actual Credits, Entitlements, and resource allowances without a trial countdown, crossed-out paid value, payment-method prompt, or implied automatic charge.
- A paid-only capability stays visible when that context helps discovery. Its localized Plan badge identifies the required offer, the unavailable action remains disabled, and activation opens the exact `Plan & Usage` capability explanation with current Plan, required Plan, retained alternatives, and one authorized upgrade action. Permission denial, rollout exclusion, readiness failure, and runtime failure keep their own reasons and are never relabelled as an upgrade prompt.
- A badge, disabled control, or hidden navigation item is not enforcement. Product API and worker entry points evaluate the bound Plan Revision and return stable Entitlement metadata before starting the paid effect.
- Workspace creation shows Free as unavailable when the prospective Owner already owns a Free Workspace. The disabled choice explains that joined Workspaces do not count and routes to paid Plan selection; it never claims that the current Workspace's Plan owns or upgrades another Workspace.
- Workspace-creation copy uses these stable bilingual resources rather than exposing allowance codes or commercial authority terms:

| i18n key | `zh-CN` | `en-US` |
|---|---|---|
| `workspaceCreation:FREE_PLAN_UNAVAILABLE_TITLE` | 你已经拥有一个免费工作空间 | You already own a free workspace |
| `workspaceCreation:FREE_PLAN_UNAVAILABLE_DESCRIPTION` | 你仍可加入其他工作空间。要创建新的工作空间，请选择付费套餐。 | You can still join other workspaces. Choose a paid plan to create another workspace. |
| `workspaceCreation:VIEW_PAID_PLANS` | 查看付费套餐 | View paid plans |
- Project lists and creation surfaces show committed active usage against the current Plan Revision. At the limit, Create and Restore remain visible but disabled from the server projection; activation explains how archiving frees a place and opens the exact `Plan & Usage` Project allowance section when an eligible higher allowance exists.
- A Project-limit badge identifies the required Plan only when the current catalog contains an eligible published Revision with a higher allowance. It never promises that upgrading bypasses Permission, Entitlement, rollout, readiness, or health checks, and UI state never replaces Product API enforcement.
- Project-limit product copy uses stable bilingual resources and user-facing “projects in use” language rather than allowance keys, model fields, or quota terminology:

| i18n key | `zh-CN` | `en-US` |
|---|---|---|
| `projects:ACTIVE_LIMIT_USAGE` | 项目 {{used}} / {{limit}} | Projects {{used}} / {{limit}} |
| `projects:ACTIVE_LIMIT_UNLIMITED` | 项目不限量 | Unlimited projects |
| `projects:ACTIVE_LIMIT_REACHED_TITLE` | 已达到项目数量上限 | You've reached your project limit |
| `projects:ACTIVE_LIMIT_REACHED_DESCRIPTION` | 当前套餐最多可同时使用 {{limit}} 个项目。归档暂时不用的项目，或选择支持更多项目的套餐。 | Your current plan supports up to {{limit}} projects at a time. Archive a project you are not using, or choose a plan that supports more. |
| `projects:ACTIVE_LIMIT_EXCEEDED_DESCRIPTION` | 当前有 {{used}} 个使用中的项目，套餐上限为 {{limit}} 个。现有项目不会被归档；在数量降到上限以内前，无法创建或恢复项目。 | You currently have {{used}} projects in use, above your plan limit of {{limit}}. Existing projects stay available, but you cannot create or restore projects until usage is within the limit. |
- On a Plan without `workspace.roles.manage`, Workspace settings do not mount the Roles & Permissions page. Its disabled navigation entry carries the eligible Plan badge and opens the exact `Plan & Usage` explanation instead of exposing an unusable matrix.
- People views omit editable role controls where role management is unavailable and show the immutable Owner identity where relevant. Invitations omit role selection and acceptance applies Fixed Member access; supplied role codes fail visibly rather than being ignored.
- Role-management product copy uses stable bilingual resources and explains the current behavior without exposing Entitlement keys, RBAC terminology, or permission codes:

| i18n key | `zh-CN` | `en-US` |
|---|---|---|
| `workspaceAccess:FIXED_MEMBER_ACCESS` | 成员权限相同 | Members have the same access |
| `workspaceAccess:ROLES_PAID_FEATURE_TITLE` | 为成员分配不同职责 | Assign different responsibilities to members |
| `workspaceAccess:ROLES_PAID_FEATURE_DESCRIPTION` | 当前套餐中，除所有者外的成员使用相同权限。选择支持角色的套餐后，可以为成员分配不同职责。 | On your current plan, everyone except the owner has the same access. Choose a plan with roles to assign different responsibilities. |
| `workspaceAccess:OWNER_AUTHORITY_DESCRIPTION` | 所有者仍负责套餐、所有权转移和删除工作空间。 | The owner remains responsible for the plan, ownership transfer, and workspace deletion. |
- `Plan & Usage` shows each member-assigned capability's assigned and available places. People exposes assignment and revocation separately from roles, while the role matrix never contains seat counts, prices, or assignment controls.
- A member without an assignment sees a member-allocation explanation rather than an upgrade prompt. Only a missing Workspace Entitlement opens the Plan upgrade explanation; Permission, rollout, readiness, Credits, allowance, and health denials keep their own product states.
- Feature Seat product copy uses “使用名额” / “access” instead of the domain term “seat” in primary UI:

| i18n key | `zh-CN` | `en-US` |
|---|---|---|
| `featureAccess:USAGE` | {{feature}}名额 {{assigned}} / {{limit}} | {{feature}} access {{assigned}} / {{limit}} |
| `featureAccess:UNLIMITED` | {{feature}}名额不限量 | Unlimited {{feature}} access |
| `featureAccess:ASSIGN` | 分配使用名额 | Assign access |
| `featureAccess:REVOKE` | 收回使用名额 | Revoke access |
| `featureAccess:NOT_ASSIGNED_TITLE` | 你还没有此功能的使用名额 | You don't have access to this feature yet |
| `featureAccess:NOT_ASSIGNED_DESCRIPTION` | 请联系工作空间管理员为你分配使用名额。 | Ask a workspace manager to assign access to you. |
| `workspacePermissions:FEATURE_ACCESS_MANAGE_NAME` | 管理功能名额 | Manage feature access |
| `workspacePermissions:FEATURE_ACCESS_MANAGE_DESCRIPTION` | 为成员分配或收回工作空间已有的功能名额。不能更改套餐或成员角色。 | Assign or revoke feature access already included in the workspace plan. This does not change the plan or member roles. |
- Access-reducing Plan changes add a dedicated review step before checkout or Provider scheduling. It names affected people and responsibilities, states that ended roles and feature access will not return automatically after a later upgrade, and never hides the consequence behind generic “some features may change” copy.
- The effective result shows the target Plan, current Fixed Member access or retained seat assignments, invalidated invitations, and exact actions required to reconfigure access later. It does not offer Restore previous roles or Reactivate previous access.

| i18n key | `zh-CN` | `en-US` |
|---|---|---|
| `planChange:ACCESS_CHANGES_TITLE` | 成员权限将在套餐变更时调整 | Member access will change with this plan |
| `planChange:ACCESS_CHANGES_DESCRIPTION` | 生效后，不受新套餐支持的角色和功能名额将被终止，之后升级也不会自动恢复。 | When the change takes effect, roles and feature access not supported by the new plan will end and will not return automatically after a later upgrade. |
| `planChange:REVIEW_AFFECTED_MEMBERS` | 查看受影响的成员 | Review affected members |
| `planChange:CONFIRM_ACCESS_CHANGES` | 确认成员权限调整 | Confirm member access changes |
| `planChange:RECONFIGURE_AFTER_UPGRADE` | 以后升级时需要重新配置成员权限。 | Member access must be configured again after a future upgrade. |
- The Header credit control, account menu, and workspace scope switcher all open the same `Plan & Usage` screen; credit details are not a standalone dialog.
- Credit-ledger rows persist a stable `descriptionKey`; API responses resolve a localized `description` without rewriting immutable history.

#### 10.2 Plans & Billing Platform experience

When the internal Commerce Platform Capability is enabled, the Platform Console exposes one **Plans & Billing / 套餐与计费** domain as the commercial operations control plane. It owns:

- the Plan catalog and its configuration;
- a server-paginated, filterable cross-Workspace Subscription list and investigative detail;
- payment and provider-transaction projections when supported by the configured provider;
- the signed provider-event ledger, including processing state, correlation context, and explicit failures;
- payment-provider configuration, readiness, health, and missing prerequisites;
- audited Subscription corrections and Credit adjustments with reason, before/after state, idempotency, and resulting entitlement effects.

The domain does not duplicate Workspace checkout, customer-portal access, member-facing Credits, or the `Plan & Usage` screen. It does not place revenue, conversion, cost, or usage-trend charts on a generic overview; those analyses belong to Monitoring & Audit. It emits actionable provider, event-processing, Subscription, payment, and Credit failures as source conditions for Needs attention.

Commerce configuration remains inside Plans & Billing rather than a global Settings route. Workspaces may show authorized commercial summaries and deep-link to an exact Workspace Subscription context, but cannot host a second mutation form. Before capability enablement, authorized capability managers see missing prerequisites in capability management rather than an empty business page. There is no plan-change approval queue.

The Plan catalog presents stable Plan identities and their Revision histories. Editing occurs only on a Draft; publishing shows an exact before/after terms comparison, affected future selection context, provider Price mapping validation, and an immutable publication audit. Published Revisions have no edit action.

Publishing copy states that the new Revision becomes available to new checkout and explicit Plan selections while existing Subscriptions remain Grandfathered. The Subscription list filters by Plan, bound Revision, selling/non-selling Revision, and grandfathered state. A Revision detail shows its active Subscription count and opens a separate preview-driven transition workflow; publication itself has no hidden “update existing customers” switch.

The Renewal Transition workflow defaults visibly to each Subscription's next renewal boundary and has no immediate toggle. Its preview groups effective dates, shows Provider schedule support, proration result, customer-notification evidence, and the reversible-until value supplied by the Provider. A separate single-Workspace Commercial Correction entry point uses corrective language, requires evidence and reason, and never appears as a bulk action.

Workspace `Plan & Usage` presents Subscription lifecycle and commercial access state separately. Payment Grace shows the Provider recovery deadline, why new Credits or metered effects are unavailable, retained capabilities, and one primary payment-recovery action. Payment Restricted remains an explicit recoverable state; it never renders as Free or as deleted content.

In Restricted Recovery Mode, the Product Application keeps its normal shell and read navigation. A persistent commercial-recovery notice explains that existing data remains available, identifies blocked command classes, and provides the primary recovery action. Blocked controls remain understandable and route to that explanation; the UI does not replace the Workspace with an access-restriction blocker or pretend that hiding controls is enforcement.

All members see the sanitized recovery notice. The Owner and Billing Managers see the executable recovery action and detailed commercial context; other members see who to contact through authorized Workspace identity projections without receiving payment details or Provider URLs. Commercial Lifecycle Notifications follow section 9 rather than defining a second audience or delivery path here.

Payment Restricted copy does not show a data-deletion countdown or imply that payment is required to prevent Commerce from erasing the Workspace. Any separate Owner-requested or legally required deletion notice identifies its Workspace lifecycle source and must not be rendered as a dunning deadline.

Plans & Billing filters Subscriptions by Provider lifecycle, commercial access state, recovery deadline, and dunning risk. Missing recovery metadata, nearing exhaustion, failed restoration, and Credit-grant reconciliation produce domain-owned conditions with exact investigation and recovery destinations.

The legacy `WorkspaceSubscriptionChangeRequest` approval model and its `pending`, `approved`, and `rejected` workflow are removed in the Commerce hard cut. Existing terminal history is retained only through an explicit audit/data-retirement migration; unresolved rows fail migration visibly and are never silently applied, rejected, or converted into direct mutations.

The current Entitlement-service and Provider mapping acceptance of `trialing` is removed in the same commercialization hard cut. Existing `trialing` rows must be inventoried and resolved through explicit Provider-confirmed paid activation, cancellation, or an authorized Free Plan selection before cutover; they never receive inferred paid Entitlements, automatic charges, or silent conversion to Free.

Existing mutable `commerce_plans` rows migrate to stable Plan identities plus Revision `1`; every Workspace Subscription is backfilled to the matching Revision in the same migration. Existing Price mappings are converted to Revision-scoped mappings only after exact amount, currency, interval, provider mode, and Entitlement validation. Ambiguous or mismatched rows stop migration explicitly. Mutable commercial columns and Plan-code-only provider lookups are removed after cutover rather than retained behind a compatibility facade.

### 11. Tests required

- Atomic concurrent reservation tests proving balance cannot go negative.
- Idempotent reserve/commit/release and period-grant tests.
- Checkout/portal authorization, exact provider amount conversion, signed webhook, and subscription lifecycle tests.
- Idempotent provider-event replay tests proving the same event cannot grant credits twice.
- HTTP 402 and localized error tests for exhausted credits.
- AI runtime integration tests proving successful calls commit and failed calls release.
- Plan-catalog and Builder tests proving `sites.generate` is explicit, request-gated, and revalidated at the worker effect boundary.
- Frontend tests for loading/error/no-workspace, hover/focus content, provider unavailable state, checkout interval selection, current plan, embedded ledger, and exhausted-credit behavior.
- Contract tests proving commercial reads, writes, grants, reservations, and entitlement checks always require an explicit Workspace and cannot resolve an Organization-owned balance.
- Platform Console tests for server-side Subscription filters, event/provider failure detail, configuration readiness, audited corrections, exact Workspace deep links, permission-constrained actions, and Operational Signal projection.
- Route tests proving the legacy global billing-settings route and tenant-directory mutation form do not remain as parallel commercial authorities.
- Authorization tests for every Commerce permission, direct API denial, role composition, Instance Owner authority, Signal resolution gating, and absence of a `commerce.manage` or `require_super_admin` bypass.
- Migration tests proving the obsolete plan-change approval queue is retired without silently applying unresolved requests.
- Revision tests proving Draft-only editing, immutable publication, monotonic numbering, deterministic content hashes, explicit Subscription binding, Revision-scoped Provider Prices, and historical Entitlement/Credit stability.
- Migration tests proving every existing Subscription and Price mapping resolves one exact Revision and that ambiguous provider or catalog state fails visibly.
- Grandfathering tests proving publication never mutates existing Subscriptions and that Entitlement, refresh, reconciliation, and provider-event paths use the bound Revision rather than the selling Revision.
- Transition tests for single Workspace and cohorts, stale previews, partial incompatibility, exact source/target identity, idempotency, Provider Price coverage, per-Subscription results, and audit evidence.
- Renewal-boundary tests for mixed cohort dates, Provider schedule creation and cancellation, signature-confirmed application, missing Connector capabilities, out-of-order events, and no local target binding before Provider confirmation.
- Commercial-correction tests proving single-Workspace scope, mandatory evidence/reason, exact Provider/proration/Credit/Entitlement preview, and rejection of local-only paid-state drift.
- Dunning tests for Provider retry metadata, configurable grace, missing/inconsistent deadlines, withheld new-period Credits, metered-effect blocking before dispatch, retained non-metered access, published-delivery continuity during grace, recovery idempotency, and final Payment Restricted projection.
- Cross-domain Hosting tests for an anchored continuity deadline, idempotent restriction replay, continued active-release delivery, pre-dispatch blocking of rebuild/republish/domain changes, expiry into Delivery Suspended, preserved release/domain/certificate records, neutral custom-domain responses, branded Arclayer-subdomain responses, atomic restoration without deployment, and explicit restoration failure.
- Lifecycle-boundary tests proving indefinite Payment Restricted state, dunning jobs, Provider events, Hosting expiry, Commerce permissions, and commercial corrections cannot create or advance Workspace deletion; only an explicit Owner request or documented legal/privacy process can enter the independent lifecycle deletion flow.
- Recovery-after-deletion tests proving commercial reconciliation cannot recreate a Workspace or restore purged data after an independently authorized deletion completes.
- Restricted-Recovery command-matrix tests for authenticated reads, stored downloads, bounded export, payment recovery, support, privacy/lifecycle actions, security reductions, and denial of every value-expanding command class before dispatch.
- Direct API, background Job, Tool, Agent, batch, retry, schedule, and webhook tests proving no alternate entry point bypasses `WORKSPACE_PAYMENT_RESTRICTED`; mixed-effect commands fail atomically rather than silently dropping blocked effects.
- Transition tests for existing Product Sessions, in-flight Job cancellation boundaries, explicit non-recallable effects, exact `402` metadata, absence of `WORKSPACE_SUSPENDED`, and atomic restoration of normal command authorization after Provider-confirmed recovery.
- Workspace billing authorization tests for immutable Owner authority, multiple Billing Managers, Owner-only delegation/revocation, absence of implicit Admin/settings/organization grants, exact route guards, ordinary-member sanitized state, actor-bound Provider sessions, and denial of Platform impersonation.
- RBAC migration tests proving the broad `require_workspace_manage_access` route guards are removed and no existing non-Owner role is silently granted `workspace:commerce:manage`.
- Commercial Lifecycle Notification tests proving exact milestone emission, current Owner/Billing Manager resolution at dispatch, ordinary-member in-app targeting, recipient deduplication, authorization changes, localization, source-event replay idempotency, per-recipient/channel retry evidence, Operational Signal escalation, lifecycle-state independence, and absence of payment details in ordinary-member notices.
- Domain Policy Exception tests proving explicit operator initiation, exact owning-domain permission, single-Workspace/time-bounded scope, mandatory original/replacement deadline and evidence, idempotency, audit, rejection of bulk/open-ended/cross-domain requests, and preservation of Plan Revision, Credits, Provider facts, Hosting records, Workspace lifecycle state, and the other domain's deadline.
- Policy-deadline concurrency tests proving only an active window may be extended, the replacement deadline is later, expiry/recovery/concurrent mutation wins visibly, stale revision fails, and historical deadlines/transitions remain immutable.
- Domain State Correction tests proving stricter owning-domain permission/evidence, append-only compensating transitions from Payment Restricted to Payment Grace or Delivery Suspended to Hosting Continuity, explicit new deadlines, no false Provider recovery/Credit grant/rebuild, and no mutation of the other domain or historical state.
- Cross-domain correction tests proving Commerce commits before publishing, outbox redelivery is idempotent, Hosting restores normal delivery of the same active release, source cause/correlation remain distinguishable from Provider recovery, no second Hosting correction is required, and Hosting failure does not roll back Commerce or report false delivery.
- Operator-intervention notification tests proving post-commit emission for Policy Exception/State Correction, Owner/Billing Manager email plus in-app delivery, ordinary-member sanitized in-app delivery, distinct Commerce-pending and Hosting-result milestones, no preview/request notifications, and no premature or retained false Hosting success.
- Disclosure tests proving stable localized customer-safe reason categories, “Arclayer Platform Operations” source labelling, exact billing-contact before/after/time/support fields, ordinary-member effect-only projection, and absence of personal operator identity, internal notes/evidence, Provider diagnostics, payment details, or raw audit data.
- Frontend tests proving lifecycle/access-state separation, recovery deadline/action, no Free mislabel, and explicit retained versus blocked capabilities.
- Free Plan tests proving non-expiring access, exact Revision-bound Credits/Entitlements/allowances, no trial lifecycle or automatic paid conversion, explicit checkout-only upgrade, and visible paid-capability badges whose disabled state links to bilingual Plan & Usage explanations without masking permission, rollout, readiness, or health denials.
- Trial hard-cut tests proving Provider `trialing` events fail visibly, existing trial rows block cutover until explicitly resolved, and no Entitlement, charge, paid conversion, or Free downgrade is inferred.
- Free Workspace allowance tests proving memberships do not count, the current Owner may own at most one Free Workspace, creation/downgrade/ownership-transfer paths share one atomic check, concurrent attempts cannot bypass it, and paid creation becomes usable only after Provider confirmation.
- Workspace-creation frontend tests proving the Free choice, paid alternative, failed checkout, and bilingual limit explanation reflect server eligibility without implying a User-, Organization-, or sibling-Workspace-owned Subscription.
- Active Project allowance tests proving explicit Plan Revision configuration, Workspace-local counting, archive release, create/restore consumption, transactional last-place concurrency, direct API enforcement, and absence of lifetime, membership, or published-site counting.
- Plan-transition tests proving a lower Active Project allowance preserves every existing Project, exposes the over-limit state, blocks only creation and restoration, and resumes those actions after committed usage falls below the limit or a higher allowance becomes effective.
- Project-limit frontend tests proving server-projected usage, limited and unlimited presentation, disabled Create/Restore actions, exact bilingual explanations, conditional Plan badges, and separate Permission, Entitlement, rollout, readiness, and health reasons.
- Free role-management tests proving Fixed Member access for every non-Owner member, immutable Owner authority, no invitation role choice, direct rejection of every role/member-role/permission-grant mutation, and no forged or replayed role-code bypass.
- Role-management Entitlement tests proving inclusion never grants the actor a Workspace permission, exclusion never weakens ordinary action authorization, and Owner-only billing/transfer/lifecycle authority remains independent of Plan state.
- Product tests proving the Free member and invitation surfaces omit editable role controls, the disabled Roles & Permissions entry opens the bilingual Plan explanation, and raw Entitlement or permission terminology is absent from customer copy.
- Feature Seat contract tests proving registered allocation modes, explicit Plan Revision limits, Workspace ownership, active-membership-only assignment, unique bindings, serialized last-seat allocation, idempotent revocation, and transactional release on membership termination.
- Capability authorization tests proving a seat grants no Workspace Permission, roles grant no seat, Workspace-wide capabilities need no seat, every independent gate keeps its own reason, and API/Job/Tool/Agent/worker paths reject a revoked or missing actor assignment before paid effects begin.
- Feature Seat frontend tests proving Plan & Usage counts, member-level assignment separate from roles, limited and unlimited states, bilingual assign/revoke copy, member-allocation denial instead of upgrade messaging, and no Entitlement keys, seat jargon, or permission codes in primary copy.
- Feature Seat authorization tests proving immutable Owner authority, exact `workspace:feature-seats:manage` delegation, self-assignment without implicit feature permission, no broad member/settings/billing/Organization/Platform implication, and denial of new or moved assignments during Restricted Recovery Mode while revocation remains available.
- Plan Access Convergence tests proving exact source/target preview, named affected members and assignments, stale-preview rejection, explicit retained-seat selection, effective-boundary atomicity, Owner preservation, Fixed Member application, invitation invalidation, Session next-request authorization, and queued-effect revalidation.
- Free downgrade tests proving Owner allowance at preview and effectiveness, ownership/concurrency drift rejection, no automatic ownership transfer or sibling-Workspace mutation, and exact alternatives when the Owner already owns another Free Workspace.
- Downgrade hard-cut tests proving custom roles and unsupported Feature Seat Assignments are end-dated rather than kept dormant, historical Audit remains queryable, later upgrades restore nothing automatically, and no creation-time or role-based algorithm silently chooses retained assignments.
- Provider downgrade tests proving unsafe Portal actions are unavailable, scheduled changes carry convergence identity, mismatched signed events create explicit reconciliation failure and block paid effects, and forward repair never fabricates Provider or access success.
