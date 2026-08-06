# AI and Commerce Control Plane Rebuild — Execution Guide

Last updated: 2026-08-06

## Purpose

This document is the persistent execution record for the Billing, Credits, Workspace member usage, AI control-plane, and related Product/Platform redesign. It prevents implementation drift when the working context becomes long.

Canonical product and implementation contracts remain under `docs/spec/**`. This file records sequencing, repository evidence, completed work, validation, and current blockers; it does not override a spec.

## Update rule

After each independently verifiable part:

1. Update its status and implementation evidence here.
2. Record the exact validation commands and results.
3. Record newly discovered blockers without introducing silent fallbacks.
4. Set one next active part with concrete files and acceptance criteria.
5. Commit the completed part and this document together when the part is ready to land.

## Fixed product decisions

- Credits are non-negative integers.
- Credit sources are distinct: period Plan grants, promotional grants, purchased top-ups, Platform adjustments, and refunds/corrections.
- Consumption order is current-period Plan Credits, expiring promotional/adjustment Credits by earliest expiry and issue time, migration-unattributed legacy Credits, then non-expiring purchased top-ups.
- Every active Workspace member, including the Owner, is subject to the effective member limit. The Owner may edit their own override.
- `/ai/policies` owns deployment-wide AI capability policy. Workspaces cannot override it.
- Workspace AI rollout / “Workspace AI 可用范围” is deleted rather than redesigned.
- Billing keeps the real Stripe Billing path. A separate `simulated` Provider is allowed only in development/test and must traverse signature verification, encrypted inbox, pinned Job, application projection, transaction/invoice/refund, and access-state flows.
- Platform Billing is redesigned around plans, subscriptions, transactions, invoices, refunds, Provider events, configuration, and an explicit payment simulator.
- Product Plan & Usage and People surfaces expose real Workspace/member Credit state rather than duplicated estimates.
- Visual direction: Operational Ledger, canonical shadcn primitives, shared `@arclayer/ui` components, stable bilingual i18n keys.

## Milestones

| Milestone | Status | Acceptance boundary |
| --- | --- | --- |
| M0 Credit accounting foundation | Complete | Integer Credits, source lots, exact allocations, member attribution, legacy migration, adjustment correctness |
| M1 Member limits and Usage API | Complete | Default policy CRUD, per-member override CRUD, manager/all-member and self-only Usage reads, revision/idempotency/permissions |
| M2 Simulated Billing Provider | In progress | Development/test gate, signed webhook, inbox/Job/application projections, checkout/payment/refund lifecycle |
| M3 Platform Billing redesign | Pending | Replace legacy `/billing/*` pages with complete CRUD and Operational Ledger layouts |
| M4 Product Plan & Usage / People | Complete | New Plan & Usage, People Usage column, member limits, icon-free ChromeTabs, Workspace setting |
| M5 Global AI administration | Pending | Rebuild tasks/assistants/policies, delete Workspace rollout, enforce immutable global policies |
| M6 Remaining referenced product features | Pending | Implement the approved Image #6/#7/#8 interaction contracts after their concrete repository surfaces are mapped |

## M0 — Credit accounting foundation

Status: Complete

Landed commit: `c331e4ed feat(control-plane)!: advance AI and commerce foundations`

Implemented:

- `0116_commerce_credit_sources_member_limits_and_payments` schema and real PostgreSQL upgrade coverage.
- Source-attributed grant lots, reservation allocations, non-reservation mutations, member policy/override/current-period counters, append-only Usage events, and payment projection models.
- Runtime actor/membership/Project/Agent/capability attribution.
- Deterministic lot depletion and top-up-protecting reversal order.
- Expired lots excluded from new reservations and negative adjustments.
- Explicit adjustment expiry, Workspace-scoped source identities, account-lock-first idempotent replay, and exact lot mutations.
- Explicit `legacy_unattributed` migration source and attribution version `0`; legacy commit/release settles exact allocations without inventing member Usage facts.
- PostgreSQL-safe two-step row locking for allocation and lot settlement.

Validation:

- Targeted API type checking: passed.
- Targeted API unit tests: `45 passed`.
- Real `0115 → 0116` migration and rollback fixtures: `2 passed`.
- Legacy settlement integration: `2 passed`.
- Platform Credit adjustment integration: `2 passed`.
- Platform Credit page test: `3 passed`.
- Broader Commerce integration: `7 passed`, with one existing Provider transition fixture failing because it does not supply the now-required `confirmed_transition` evidence.
- Repository-wide `pnpm check`: failed on six existing API Ruff findings outside M0; Turbo then canceled remaining package gates. No fallback or unrelated cleanup was introduced.

## M1 — Member limits and Usage API

Status: Complete

Canonical Product endpoints:

- `GET /workspaces/{workspaceId}/commerce/member-usage`
- `GET /workspaces/{workspaceId}/commerce/member-limits`
- `PUT /workspaces/{workspaceId}/commerce/member-limits/default`
- `PUT /workspaces/{workspaceId}/commerce/member-limits/{membershipId}`

Authorization:

- Owner: full read/write authority, including their own override.
- Billing Manager: requires exact `workspace:commerce:manage` and the revision-bound management entitlement.
- Ordinary active member: may read only their own Usage; cannot read other members or mutate limits.
- Disabled/non-member/cross-Workspace targets fail explicitly.

Data semantics:

- `limited` requires a positive integer Credit limit.
- `unlimited` requires `limitCredits = null`.
- Clearing an override is distinct from setting an explicit unlimited override.
- Policy and override mutations use optimistic revision and durable idempotency receipts.
- Same key and fingerprint replays the stored result; changed payload conflicts.
- Effective limit is override when present, otherwise Workspace default.
- Usage reads expose current-period reserved, committed, and available allowance from durable member counters. Raw append-only event attribution remains a separate ledger contract rather than being folded into this table endpoint.

Active implementation parts:

1. M1.1 schemas, repository/service, receipts, and migration extension. — Complete
2. M1.2 Product router contracts and authorization tests. — Complete
3. M1.3 OpenAPI synchronization and Product API wrappers. — Complete
4. M1.4 Plan & Usage default-limit/usage surface. — Complete
5. M1.5 People Usage column and per-member override dialog. — Complete

M1.1 acceptance criteria:

- Transactionally lock policy/override scope before revision and receipt evaluation.
- Validate active membership and Workspace ownership of every target.
- Preserve explicit unlimited versus inherited default.
- Do not reset or rewrite Usage when a limit changes.
- Cover replay, conflict, stale revision, concurrent requests, Owner self-override, and invalid limit shapes.

M1.1 status: Complete

M1.1 implementation evidence:

- Added typed default-limit, member-override, effective-limit, and mutation-result schemas with strict `limited`, `unlimited`, and `clear` shape validation.
- Added an injected repository/service composition. The service owns revision, precedence, and command semantics; the Tortoise repository owns row locks, persistence, required Activity evidence, and durable receipts.
- Workspace mutations serialize on the active Workspace row, then lock active actor/target memberships, policy, override, and receipt in a deterministic order.
- `WorkspaceMemberCreditPolicy.revision` is the Workspace-wide configuration revision. Override writes and clears advance it without modifying current-period Usage rows.
- Added Workspace-scoped receipt identity and request fingerprints covering actor, target, operation, expected revision, and payload. Exact replays return the stored snapshot; changed commands conflict before stale-revision evaluation.
- Receipt replay validates scope, membership snapshot, result revision, and the complete output schema. Corrupt persistence evidence fails explicitly.
- Receipt Activity evidence records operation, scope, expected/result revision, request hashes, and before/after limit snapshots in the same transaction.
- Added migration `0117_workspace_member_credit_command_receipts`. Receipts cascade with Workspace deletion, retain membership UUID snapshots after membership deletion, and restrict deletion of their linked audit event.

M1.1 validation:

- Targeted Ruff formatting/checks: passed.
- Targeted `ty` checks across schemas, repository/service/composition, models, and tests: passed.
- Schema, model, and migration unit tests: `10 passed`.
- Real PostgreSQL repository/service tests covering replay, conflict, stale revision, Owner self-override, explicit unlimited versus clear, inactive/cross-Workspace targets, same-key concurrency, revision races, Usage preservation, and archived Workspace rejection: `5 passed`.
- Real PostgreSQL `0116 → 0117` migration contract test: `1 passed`.
- `pnpm api:check`: failed outside M1.1 on existing API Ruff findings and 28 existing format-check files; Turbo interrupted the remaining package tasks after those gates failed. No M1.1 targeted diagnostic remained.

M1.2 status: Complete

M1.2 implementation evidence:

- Added the four canonical Product Workspace Commerce routes under one typed member-Credit router and registered it in the Product Workspace composition.
- Added a read repository/service boundary that validates existing Workspace billing, pins the account's exact `period_start`/`period_end`, reads only active memberships, and batch-loads page-scoped overrides and current-period counters without creating rows.
- Effective limits preserve explicit unlimited overrides versus inherited defaults. Limited availability is `max(limit - reserved - committed, 0)`; unlimited availability is `null`; missing Usage counters are zero.
- The read path holds the Workspace member-Credit policy lock while reading override/counter rows so `configurationRevision` and effective limits cannot cross revisions. This intentionally makes same-Workspace reads and configuration writes serialize for a coherent management snapshot; the lock order has no cycle with the command path.
- Added a reusable Commerce management authority: Owner bypasses entitlement/RBAC only as an active Workspace member; non-Owner management requires the revision-bound `workspace.roles.manage` entitlement followed by exact `workspace:commerce:manage`.
- `member-usage` projects `ALL` for authorized management and `SELF` for an ordinary active member. Limits and both mutations use the strict management dependency. Guest Owners are rejected before Owner bypass.
- Added PublicUUID/camelCase response contracts for usage rows, nested member identity, limits, pagination, period bounds, and the Workspace-wide configuration revision.

M1.2 validation:

- Targeted Ruff checks, Ruff format checks, and `ty` checks across the changed models, authorization, schemas, repositories/services/composition/router, Workspace router registration, and tests: passed.
- Authorization and router unit tests: `18 passed`, covering Owner bypass, guest-Owner denial, entitlement-before-exact-permission, unrelated permission rejection, ordinary-member self projection, manager all projection, real 403 manager dependency behavior, canonical paths, PublicUUID serialization, mutation transport, and stable error propagation.
- Member-Credit schema plus real PostgreSQL configuration/read integration: `14 passed`, covering replay/conflict/stale revision, disabled/cross-Workspace targets, current account period isolation, old-period exclusion, limited/unlimited/inherited limits, over-limit clamping, missing Usage rows, active-member filtering, self-only reads, pagination, and GET row-count preservation across subscription/account/policy/override/Usage tables.
- Code Review Engine changed-scope audit: exited successfully with zero blocking findings. Its two M1.2 prototype findings were removed by using the canonical Tortoise repository base and a frozen Pydantic snapshot; remaining report-only findings belong to unrelated changed modules in the shared worktree.
- `pnpm api:check`: failed on five existing Ruff findings outside M1.2. API format check passed for all `1843` files; Turbo interrupted the broad test process and did not expose a final type-check result after lint failed. No targeted M1.2 diagnostic remained.

M1.3 active boundary:

- Export the Product OpenAPI contract with all four M1 endpoints and synchronize generated clients without hand-editing generated artifacts.
- Add Product Application API wrappers for member Usage, member limits, default-limit writes, and member-override set/clear commands.
- Preserve PublicUUID path encoding, camelCase payloads, pagination query parameters, optimistic revision, and body-scoped idempotency keys exactly.
- Add focused wrapper/contract tests for paths, query/body serialization, output typing, and stable API error propagation. No M1.4 or M1.5 UI work belongs in this part.

M1.3 status: Complete

M1.3 implementation evidence:

- Regenerated only the Product OpenAPI package with the canonical export pipeline. The generated SDK now exports all four member-Credit operations, their request data contracts, response envelopes, and PublicUUID/camelCase schemas.
- Preserved the concurrent AI thread `pinned` schema additions during generation and did not modify Platform OpenAPI artifacts.
- Extended the Product Commerce API module with typed member Usage and limits pagination wrappers, default-limit writes, and member-override set/clear commands.
- Workspace and membership path values are encoded independently. GET wrappers apply canonical `page = 1` and `size = 20` defaults and forward `AbortSignal`.
- Added discriminated limited/unlimited command inputs. Clear-override commands rebuild the exact body without `limitKind` or `limitCredits`; optimistic revision and idempotency remain camelCase body fields with no idempotency header.
- Page wrappers reject successful responses that omit the canonical `items` array. Existing `ApiError` instances, including management denial and revision conflict, propagate unchanged.
- Synchronized the existing Credit Ledger entry-type mapping with the generated `promotional_grant`, `top_up`, and `refund` contract and added stable bilingual Commerce keys.

M1.3 validation:

- Product OpenAPI generation: `pnpm --filter @arclayer/openapi generate` passed.
- Product OpenAPI typecheck: `pnpm --filter @arclayer/openapi typecheck` passed.
- Focused Product tests: `7 passed` across `test/api/commerce.test.ts` and `test/components/commerce/credit-ledger-table.test.tsx`.
- Product lint, format check, and locale parity passed; locale parity covers all `23` namespaces.
- Code Review Engine changed-scope audit exited successfully. All `49` report-only findings belong to unrelated API/AI/Platform files in the shared worktree; no M1.3 file received a finding.
- `pnpm app:check`: lint, format, and locale tasks passed. Typecheck and the broad Vitest run failed on the existing `test/browser/product-acceptance.spec.ts` import of missing `../../../../tests/browser/support`; M1.3 focused tests and OpenAPI typecheck remain green.

M1.4 status: Complete

M1.4 implementation evidence:

- Replaced the legacy Plan & Usage composition with an Operational Ledger layout built from canonical shared Card, Badge, Button, ContentGuard, settings, and data-table primitives.
- The plan summary now presents canonical available Credits, reserved Credits, completed tasks, Credit period, next Credit refresh, and a separate paid-subscription renewal/cancellation lifecycle. Free plans never render sentinel renewal dates.
- Added a Workspace default member-Credit limit editor with explicit limited versus unlimited semantics, positive safe-integer validation, optimistic configuration revision, body-scoped idempotency, accessible descriptions/errors, and visible saved/conflict/error states.
- Added a controller that grants management to the active Workspace Owner or superuser, and requires both `workspace.roles.manage` and exact `workspace:commerce:manage` for other managers. Ordinary members receive the server-enforced self-only Usage projection and no billing/configuration controls.
- Default-limit retries reuse an idempotency key only for the same failed revision-bound payload. Successful writes validate Workspace/default scope, update the cached revision, and invalidate limits plus member Usage. Revision/idempotency conflicts refresh canonical state before another edit.
- Added an embedded member Usage table for committed, reserved, available, and effective-limit Credits. The member identity column is pinned for narrow viewports, unlimited values remain explicit, and missing identity copy never falls back to a raw user ID.
- Kept Checkout/plan selection and the real customer portal path for authorized managers. The Credit Ledger remains a secondary evidence surface rather than the primary Usage model.
- Added all new Product copy as stable bilingual `commerce` keys.

M1.4 validation:

- Focused Product tests: `23 passed` across the Plan & Usage view, controller, default-limit editor, and member Usage table.
- Product App lint, format check, and locale parity passed; locale parity covers all `23` namespaces.
- Product OpenAPI typecheck passed.
- `pnpm app:check`: lint, format, and locale tasks passed. Typecheck and the broad Vitest task remain blocked by the existing `test/browser/product-acceptance.spec.ts` import of missing `../../../../tests/browser/support`; no M1.4 type error remained and all M1.4 focused tests passed.
- Code Review Engine changed-scope audit exited successfully with zero blocking findings. Its report-only findings belong to unrelated shared-worktree API/AI/Platform changes, plus one existing prototype directory-structure suggestion for the overlay-mounted `plan-usage` directory; no M1.4 behavioral or architecture blocker was reported.

M1.5 implementation parts:

1. M1.5a People current-period Usage column and icon-free ChromeTabs. — Complete
2. M1.5b Per-member override dialog and canonical Workspace setting entry. — Complete

M1.5a status: Complete

M1.5a implementation evidence:

- Added one Workspace-scoped Product query for canonical member Credit Usage and joined it to People rows by `membershipId`. The query is independent of People search/sort state and never performs per-row requests.
- The client follows canonical pagination with the backend maximum page size, preserves one current-period snapshot across pages, and fails explicitly on repeated pages, duplicate memberships, or inconsistent periods.
- Added a current-period Usage column to the existing hand-built People settings table without migrating it to a competing data-table abstraction. Cells show committed, reserved, and available Credits; explicit unlimited availability remains distinct from a missing projection.
- Ordinary-member SELF projections leave other People rows unavailable rather than inventing zero Usage. Loading and fetch failures remain visible without blocking member identity, role, status, or last-login data.
- Increased the table's narrow-screen overflow width for the fifth column while preserving the established horizontal-scroll contract.
- Removed icons only from the three People ChromeTabs. Labels, active state, keyboard navigation, overflow behavior, invite actions, and the separate invite-link action icon remain unchanged.
- Added stable bilingual People Usage copy while reusing canonical Commerce labels for used and unlimited Credits.

M1.5a validation:

- Focused Product tests: `23 passed` across the Usage query/pagination, Usage cell, People table layout, and settings overlay/ChromeTabs behavior.
- Product App lint, format check, and locale parity passed; locale parity covers all `23` namespaces.
- Product OpenAPI typecheck passed.
- `pnpm app:check`: lint, format, and locale tasks passed. Typecheck and the broad Vitest task remain blocked by the existing `test/browser/product-acceptance.spec.ts` import of missing `../../../../tests/browser/support`; M1.5a focused tests passed and no M1.5a type error remained.
- Code Review Engine changed-scope audit exited successfully with zero blocking findings. Report-only findings belong to unrelated shared-worktree API/AI/Platform changes, plus the existing prototype directory-structure suggestion for the overlay-mounted `people` directory.

M1.5b active boundary:

- Add an Owner/Billing Manager per-member limit dialog with inherited-default, explicit limited, explicit unlimited, and clear-override states. The Workspace Owner may edit their own override.
- Reuse the M1.4 authority boundary, optimistic configuration revision, body-scoped idempotency, scope validation, conflict refresh, and visible mutation states.
- Add the approved Workspace setting entry that routes authorized managers to the canonical default member-Credit limit control rather than creating a duplicated policy store.
- Keep ordinary members read-only/self-only, and keep role assignment, feature-seat allocation, and M1.4 Workspace default-limit ownership outside the per-member dialog.
- Add stable bilingual copy and focused tests for inherited/limited/unlimited overrides, Owner self-edit, permission gating, exact set/clear commands, stale revision, idempotent retry, and the Workspace setting route.

M1.5b execution parts:

1. M1.5b.1 shared client contracts and member-limit controller. — Complete
   - Extract one Commerce-management authority hook used by Plan & Usage, People, and the Workspace settings entry.
   - Define non-colliding query keys for Commerce overview, member-limit configuration, full member limits, People Usage, and the Plan & Usage member table.
   - Add a manager-only paginated member-limits controller keyed by `membershipId`.
   - Preserve one Workspace-wide `configurationRevision`; reject inconsistent pages and duplicate member rows explicitly.
   - Implement per-member revision-bound set/clear mutations, response-scope validation, target-aware idempotency fingerprints, conflict refresh, and canonical cache invalidation.
2. M1.5b.2 focused per-member override dialog and People row action. — Complete
   - Use `SettingDialog`, React Hook Form, Zod, and canonical shared fields.
   - Keep `inherit`, explicit positive-integer `limited`, and explicit `unlimited` as three distinct states.
   - Owner may edit their own row; Billing Managers require both the role-management Entitlement and exact Commerce permission; ordinary members receive no action.
   - Keep roles, Feature Seat assignment, member activation, and member removal as separate actions and authorities.
3. M1.5b.3 canonical Workspace settings entry and focus target. — Complete
   - Add an authorized Workspace-basics entry that opens `workspace.plan-usage` at `default-member-credit-limit`.
   - Add one `SettingsSectionAnchor` around the existing M1.4 editor.
   - Do not add another default-limit form, mutation, cache, or policy store.
4. M1.5b.4 validation, execution-record update, and focused commit. — Complete
   - Run focused controller/dialog/People/settings tests, App lint/format/locale checks, Product OpenAPI typecheck, the affected package gate, Code Review Engine, and staged GitNexus detection.
   - Record exact results and known unrelated failures here before the M1.5b commit.

M1.5b implementation constraints:

- `overrideLimit === null` means inherited Workspace default; explicit unlimited is a persisted override with `limitKind = "unlimited"` and `limitCredits = null`.
- Clear commands contain only `action`, `expectedRevision`, and `idempotencyKey`; they never carry limit fields.
- Dialog state comes from manager-only `member-limits`, never inferred from effective Usage because inherited unlimited and explicit unlimited have the same effective value.
- One failed target/revision/action/value fingerprint reuses its idempotency key. Changing any fingerprint component creates a new key.
- A successful mutation must validate Workspace id, membership id, configuration revision, override limit, and effective limit before updating client state.
- A revision or idempotency conflict refreshes canonical limits and Usage, keeps the dialog available, and reports that the attempted change was not applied.
- Mutation success invalidates full member limits, the M1.4 configuration snapshot, People Usage, and the Plan & Usage member table without resetting durable Usage counters.
- Workspace settings may navigate to the canonical Plan & Usage control only; Product and Platform specs forbid a second Workspace Commerce mutation form.

M1.5b.1 implementation evidence:

- Added one shared Commerce-management authority hook with Owner/superuser bypass and the exact role-management Entitlement plus `workspace:commerce:manage` permission requirement for other managers.
- Consolidated canonical Commerce overview, default configuration, full member limits, People Usage, and Plan & Usage table query keys so mutations refresh every affected projection without key collisions.
- Added a manager-only full member-limit controller that follows canonical pagination, indexes by `membershipId`, and rejects repeated pages, duplicate memberships, inconsistent Workspace revisions/defaults/periods/totals, and incomplete snapshots.
- Added revision-bound set/clear commands with target-aware idempotency fingerprints. Clear commands remain free of limit fields, while explicit unlimited remains distinct from inherited default.
- Mutation success now validates Workspace, membership, strictly advanced configuration revision, default/override/effective limit shapes, and effective-limit precedence before updating cache state.
- Reused the same authority and cache contracts in Plan & Usage, Workspace role availability, People Usage, and the member Usage table. Default-limit writes now invalidate full member limits and People Usage in addition to the canonical configuration and Plan table.

M1.5b.1 validation:

- Focused Product tests: `19 passed` across shared Plan authority/default-limit behavior, People Usage pagination, and the new member-limit controller.
- Product App lint and format checks passed; locale parity passed for all `23` namespaces.
- Product OpenAPI typecheck passed.
- Product App typecheck contains only the known unrelated `test/browser/product-acceptance.spec.ts` missing `../../../../tests/browser/support` error; no M1.5b.1 type error remains.
- `pnpm app:check`: lint, format, and locale tasks passed; typecheck and broad Vitest remain blocked by the same missing browser acceptance support module.
- Staged GitNexus change detection reported `MEDIUM` risk across `29` indexed symbols and `5` expected Workspace Commerce/People execution flows; no unrelated flow was introduced.
- Code Review Engine changed-scope audit exited successfully with zero blocking findings. Its sole report-only finding is the existing prototype directory-structure suggestion for the overlay-mounted `plan-usage` directory.

M1.5b.2 implementation evidence:

- Added a `SettingDialog`-based member Credit limit editor using React Hook Form and Zod with three canonical states: inherited Workspace default, explicit positive-integer limit, and explicit unlimited.
- Dialog initialization comes only from the manager member-limits snapshot. Inherited state submits `action = "clear"`; explicit unlimited submits a persisted `action = "set"` command with `limitCredits = null`.
- Added visible saving, saved, conflict, and failure states. Conflict refresh keeps the selected member and dialog open while the form resets from the refreshed canonical revision.
- Added a separate People row action for active members. The action uses the shared Commerce authority, stays hidden from ordinary members and non-active targets, and exposes loading/error states without borrowing role or Feature Seat permissions.
- Corrected the Owner-row action early return so an Owner can edit their own member limit even when Feature Access has no action. Existing role, Feature Access, enable, disable, and self-disable behavior remains independently gated.
- Added bilingual Commerce copy without exposing raw member or protocol identifiers.

M1.5b.2 validation:

- Focused Product tests: `24 passed` across three-state dialog behavior, positive-integer validation, action-state gating, People source contracts, and the member-limit controller. The expanded Workspace team regression suite passed `51` tests across `13` files.
- Product App lint and format checks passed; locale parity passed for all `23` namespaces.
- Product OpenAPI typecheck passed.
- Product App typecheck contains only the known unrelated browser acceptance support import error; no M1.5b.2 type error remains.
- `pnpm app:check`: lint, format, and locale tasks passed; typecheck and broad Vitest remain blocked by `test/browser/product-acceptance.spec.ts` importing the missing `../../../../tests/browser/support` module.
- Staged GitNexus change detection reported `HIGH` risk because `TeamMembersView` is a shared People/roles/Usage integration hub; the `7` affected flows are the expected existing Team Members API, permission, and projection paths. The expanded team regression suite and exact authority tests passed before commit.
- Code Review Engine changed-scope audit exited successfully with zero findings.

M1.5b.3 implementation evidence:

- Added an authorized Workspace basics Commerce panel that reuses the shared Commerce authority and renders only for Owner/superuser or fully authorized Billing Managers.
- The panel contains no limit fields, form state, mutation, or cache. Its only action opens `workspace.plan-usage` at `default-member-credit-limit`.
- Wrapped the existing M1.4 default member-limit editor in one `SettingsSectionAnchor` using the same stable section and DOM identifier.
- Ordinary members receive no Workspace basics Commerce entry and continue to have no default-limit editor or mutation access.

M1.5b.3 validation:

- Focused Product tests: `19 passed` across the authorized basics entry, form composition, Plan & Usage manager/view projection, section focus/flash, and the canonical default-limit controller.
- Product App lint and format checks passed; locale parity passed for all `23` namespaces.
- Product OpenAPI typecheck passed.
- Product App typecheck contains only the known unrelated browser acceptance support import error; no M1.5b.3 type error remains.
- `pnpm app:check`: lint, format, and locale tasks passed; typecheck and broad Vitest remain blocked by the same missing `../../../../tests/browser/support` module.
- Staged GitNexus change detection reported `LOW` risk across `9` indexed symbols with no affected execution flow.
- Code Review Engine changed-scope audit exited successfully with zero blocking findings. Its sole report-only finding is the existing prototype directory-structure suggestion for `plan-usage`.

M1.5b.4 validation and closure:

- Comprehensive focused Product regression passed `70` tests across `18` files covering the complete Workspace team directory plus Plan & Usage, Workspace basics Commerce entry, form composition, and settings-section focus behavior.
- Product OpenAPI typecheck passed.
- `pnpm app:check`: lint, format, and locale parity passed. Typecheck remains blocked only by `test/browser/product-acceptance.spec.ts` importing the missing `../../../../tests/browser/support` module.
- The broad Product Vitest run in the package gate also reported one failure in `feedback-ticket-dialog.test.tsx`; an immediate isolated rerun passed `2/2`, so the nondeterministic package-gate failure remains visible and was not converted into a fallback.
- M1.5b and M1 are complete. M4 is also complete because its accepted Product Plan & Usage, People Usage, member-limit, icon-free ChromeTab, and Workspace setting surfaces were delivered through M1.4 and M1.5.

## M2 — Simulated Billing Provider

Status: In progress

Current active part: M2.4b.3 Stripe top-up Checkout and settlement.

Repository baseline:

- The real Stripe path is a registered `billing.stripe` connector and remains the production Billing Provider. Its Checkout, Customer Portal, signature verification, normalized subscription events, pinned connector version, and Stripe-specific webhook route remain canonical and must not be aliased to simulated behavior.
- Billing Provider resolution, readiness, signature inputs, and accepted-event handling are injected through `BillingConnector`. Stripe retains its strict API/webhook-secret requirements, while the separate `simulated` Provider is explicitly limited to development and test.
- Durable Provider event acceptance verifies signatures before persistence, encrypts the raw payload, claims the unique Provider event identity, and creates a pinned Job/outbox transactionally. The Job decrypts, checks payload integrity, resolves the pinned Connector version, performs any accepted Provider expansion, normalizes the event, and applies the canonical Subscription/access/payment projection.
- `CommerceCheckoutSession`, `CommerceInvoice`, `CommerceTransaction`, and `CommerceRefund` models already exist. Subscription Checkout sessions are durable and idempotent, while M2.4a projects simulated and Stripe invoice/transaction evidence. Purchased top-up settlement, refund holds/confirmation, and payment reconciliation remain the active gap.
- No Stripe Connect onboarding or connected-account funds-flow contract exists. M2 concerns the SaaS Billing installation only and does not introduce Connect semantics.

M2 execution parts:

1. M2.1 provider contract, environment gate, and readiness foundation. — Complete
   - Add `simulated` as a first-class Billing Provider only for `development` and `test`; production configuration must fail explicitly during settings validation or startup.
   - Register a separate `billing.simulated` connector/plugin without Stripe credentials, Stripe endpoints, or Stripe identity.
   - Make Billing readiness and event-acceptance prerequisites Provider-neutral while retaining all current Stripe requirements and error behavior.
   - Define explicit simulator signing configuration and capabilities. Do not add outcome commands or simulated success behavior in this part.
   - Verify configuration rejection, registry ownership, connector resolution, readiness, and unchanged Stripe behavior with focused tests.
2. M2.2a durable simulated checkout. — Complete
   - Persist every simulated checkout as a real `CommerceCheckoutSession` with actor, exact Plan Revision Price, Provider mode/account, idempotency identity, expiry, and visible simulated state.
   - Keep the durable checkout in `pending`; creating or returning from Checkout must not update Subscription, access, invoice, transaction, refund, or Credits.
   - Serialize the Provider idempotency scope and replay an identical request without creating a second Provider or database session; reject reuse for different checkout facts.
3. M2.2b explicit simulated checkout outcome command. — Complete
   - Expose an authorized development/test-only simulator command that requires an explicit actor-selected outcome or deterministic test command.
   - Generate a signed Provider event envelope and submit it through the canonical event-acceptance service; the command itself never updates Subscription, access, invoice, transaction, or Credits.
   - Cover pending, success, failure, cancellation, duplicate, delayed, and out-of-order commands without mock-success shortcuts.
4. M2.3 subscription, dunning, recovery, and access-state projection. — Complete
   - Process simulated subscription and invoice lifecycle events through signature verification, encrypted inbox, pinned Job, normalization, and the existing Provider application service.
   - Preserve exact Plan Revision/Price evidence, Provider event claims, convergence ordering, period identity, dunning facts, recovery, and access-state transitions.
   - Keep unsupported schedule/cancellation capabilities explicitly unavailable until a Provider-neutral transition adapter exists; never fabricate a local Stripe schedule.
5. M2.4 transaction, invoice, top-up, and refund projection. — Active
   - Add one canonical payment projection service over the existing payment models with transactional Provider-event idempotency and audit evidence.
   - Project checkout settlement, recurring invoices, transactions, purchased Credit top-ups, refunds, and corrections without bypassing the accepted Provider event Job.
   - Preserve integer Credits, source-lot attribution, refund/reversal ordering, and Workspace/account ownership constraints.
   - M2.4a.1 Provider-neutral and simulated invoice/transaction projection. — Complete
   - M2.4a.2 Stripe invoice normalization and projection. — Complete
   - M2.4b purchased top-up, refund, and payment reconciliation. — Active
     - M2.4b.0 canonical top-up/refund contract freeze. — Complete
     - M2.4b.1 top-up Checkout snapshot and accepted-event evidence foundation. — Complete
     - M2.4b.2 simulated top-up settlement and exact Credit grant. — Complete
       - M2.4b.2a simulated top-up Checkout creation chain. — Complete
       - M2.4b.2b signed settlement and exact-once transaction/ledger/lot grant. — Complete
     - M2.4b.3 Stripe top-up Checkout and settlement. — Active
       - M2.4b.3a Stripe top-up Checkout creation contract. — Complete
       - M2.4b.3b accepted Stripe Checkout settlement normalization and exact grant. — Complete
       - M2.4b.3c Stripe full-chain, replay, ordering, and closure. — Complete
     - M2.4b.4 full top-up refund hold and Provider-confirmed reversal. — Complete
     - M2.4b.5 payment reconciliation/correction and M2.4 closure. — Active
6. M2.5 simulator control plane and OpenAPI surfaces. — Pending
   - Add explicit Platform simulator/readiness/event/retry/reconciliation APIs and generated contracts needed by the later Platform Billing redesign.
   - Keep simulation visually and contractually distinct from Stripe; reject the entire surface in production and outside authorized Platform operations.
   - Expose durable checkout, transaction, invoice, refund, inbox, Job, and application outcomes rather than templated success responses.
7. M2.6 full lifecycle and Stripe regression closure. — Pending
   - Verify success/failure/pending/cancel/duplicate/delay/out-of-order, renewal, dunning recovery, top-up, refund, retry, and reconciliation lifecycles.
   - Verify production rejection, no Stripe secret dependency, no Stripe or Connect impersonation, exact connector-version pinning, and unchanged real Stripe Checkout/Portal/webhook paths.
   - Run API/OpenAPI/package gates, staged GitNexus detection, changed-scope Code Review Engine, update this record, and commit M2.

M2.1 acceptance criteria:

- `provider = "simulated"` is accepted only when `app_env` is `development` or `test`; production rejection is explicit and covered by tests.
- `billing.simulated` is independently registered and resolved through the existing typed connector registry.
- Simulated readiness never reads Stripe credentials; Stripe readiness remains strict and unchanged.
- Event acceptance can resolve Provider-specific signing/readiness inputs without weakening signature verification, encryption, inbox uniqueness, pinned Job creation, or payload-integrity checks.
- No simulated outcome can report success or mutate commercial state during M2.1.
- No Stripe route, connector key, production setting, Checkout/Portal behavior, or webhook contract is removed or silently redirected.

M2.1 implementation evidence:

- Added `simulated` to the typed Billing Provider setting with a dedicated signing secret. `Settings` now rejects `BILLING__PROVIDER=simulated` immediately when `APP_ENV=production`; development and test remain explicit supported environments.
- Added the independent official `arclayer-simulated-billing` extension and `billing.simulated` Connector registration. It has its own manifest, identity, signing secret, test mode, readiness metadata, and Connector factory and never registers under or imports Stripe.
- The M2.1 Connector verifies HMAC signatures and strict simulated event envelopes but declares no accepted lifecycle events yet. Checkout, Customer Portal, and event normalization fail with explicit unavailable errors, so this foundation cannot manufacture a successful commercial outcome.
- Generalized Billing settings readiness into Provider and webhook-secret facts. Stripe still requires both its API secret and webhook secret; simulated requires only its dedicated signing secret and registered Connector.
- Bound `/commerce/webhooks/stripe` explicitly to `provider_name = "stripe"`. Selecting simulated can no longer cause the stable Stripe endpoint to resolve or invoke `billing.simulated`.
- Generalized the event-acceptance builder to an explicit `stripe | simulated` Provider identity while preserving signature verification before persistence, Connector version pinning, encrypted inbox, Job construction, and existing Provider-not-configured/unsupported/invalid errors.

M2.1 validation:

- Targeted Ruff formatting/checks and targeted `ty` checks across all changed API, plugin, and focused test files passed with zero diagnostics.
- Focused M2.1 settings, readiness, Connector registry, Stripe-route isolation, and simulated Connector tests passed `32` tests.
- Existing Stripe Connector, Billing service, event-acceptance, and plugin-readiness regression passed `23` tests with `4` database integration tests skipped because integration mode was not enabled.
- `pnpm api:check`: API lint passed, format check passed for all `1844` files, and the M2.1 targeted type surface remained green. The broad API typecheck still failed on existing Design System publication/content-route diagnostics outside M2.1; Turbo interrupted the broad test task before collection completed.
- Final staged GitNexus detection reported `LOW` risk across `39` indexed symbols and no affected execution flow.
- Code Review Engine reported zero blocking findings. Eight report-only i18n findings are pre-existing errors in the already changed Platform Commerce operations file. The single new prototype lifecycle finding conflicts with the canonical extension contract: Connector-only extensions register capabilities through `arclayer_register`, while bootstrap/ready/destroy hooks are optional; the new plugin follows the same lifecycle shape as the existing Stripe Connector.

M2.2a status: Complete

M2.2a acceptance criteria:

- Every simulated subscription Checkout persists one real `CommerceCheckoutSession` in `pending` with exact Workspace, Subscription, Plan code, Plan Revision, Price, Provider mode/account, amount, currency, actor, expiry, external session identity, and request fingerprint evidence.
- Checkout selection is pinned to one published Plan Revision Price before the Provider call. Stripe and simulated Checkout metadata carry Plan code plus Plan and Revision identity.
- The Product caller supplies a non-empty `Idempotency-Key`. The Provider key includes Workspace, actor, and caller identity; the request fingerprint includes the current Subscription/Revision and exact selected Price.
- Simulated Checkout creation is serialized transactionally. Identical retries replay the same durable session; reuse with different checkout facts returns an explicit conflict.
- Checkout creation and return URLs never manufacture success and never mutate Subscription, access, invoice, transaction, refund, or Credits.
- Stripe Checkout, Customer Portal, webhook verification, and event application remain unchanged except for the required pinned Plan metadata.

M2.2a implementation evidence:

- Extended `CommerceCheckoutSession` and migration `0119_commerce_checkout_session_evidence` with Plan code, Provider account, external Price, request fingerprint, and optimistic revision evidence. The migration maps existing subscription and top-up checkout rows back to their exact Price and fails explicitly when evidence cannot be recovered.
- Added a canonical `TortoiseCheckoutSessionRepository` plus `SimulatedCheckoutStore` port. PostgreSQL advisory transaction locking serializes each Provider idempotency identity; replay checks the immutable request fingerprint before returning the existing session.
- Added `SimulatedCheckoutService` to create the Provider session and durable database row in one transaction. The simulated Connector returns only a test URL, external session identity, Provider account, and a named 30-minute expiry; the database status remains `pending`.
- `BillingService.create_checkout` now pins the exact published Plan Revision Price, derives actor-scoped Provider idempotency and a complete request fingerprint, and routes only the simulated Provider through durable persistence. Stripe continues through its existing Connector path.
- The Product Commerce wrapper sends the caller idempotency identity in the `Idempotency-Key` header, and the Plan selection dialog generates one identity per user action before redirecting.
- Added bilingual stable errors for invalid and conflicting Checkout idempotency identities and regenerated the Product OpenAPI SDK.

M2.2a validation:

- Targeted API Ruff check/format and `ty` checks across the changed checkout model, migration, services, repository, router, and focused tests passed with zero diagnostics.
- Focused checkout model, migration, Billing service, simulated Connector/service, and Stripe Connector unit coverage passed `32` tests.
- Billing service, Stripe Connector, Billing event Job, reconciliation, and router regression passed `33` tests.
- Real PostgreSQL checkout concurrency/replay and `0118 -> 0119` migration coverage passed `2` integration tests in `24.56s`.
- Product checkout wrapper/dialog coverage passed `11` tests. The isolated Workspace guidance test that failed during the earlier broad Product run passed `5/5`, confirming that failure is unrelated and nondeterministic.
- Product OpenAPI generation and typecheck passed; Product lint, format check across `1242` files, and locale parity across `23` namespaces passed.
- `pnpm api:check`: lint and format passed; broad typecheck remains blocked by `294` existing Design System publication/content-route diagnostics, and Turbo interrupted broad pytest after that failure. The targeted Commerce type surface is green.
- `pnpm app:check`: lint, format, and locale parity passed; typecheck remains blocked by the existing missing `tests/browser/support` import from `test/browser/product-acceptance.spec.ts`. The broad Vitest run also observed the unrelated Workspace guidance failure whose isolated rerun passed.
- Final staged GitNexus detection reported `LOW` risk across `27` files and `85` indexed symbols, with no affected execution flow.
- Changed-scope Code Review Engine reported zero blocking findings. Its only two report-only findings are the same prototype lifecycle rule for the simulated and Stripe Connector plugins; the canonical Connector contract registers them through `arclayer_register` and does not require optional lifecycle hooks.

M2.2b status: Complete

M2.2b acceptance evidence:

- Primary implementation targets are the simulated billing Connector, a focused Commerce outcome application service/store, the Workspace Commerce router command surface, canonical Billing event acceptance composition, and their API/integration tests. Do not broaden this part into the later Platform simulator control plane or payment projection milestones.
- Accept only an existing `pending`, unexpired simulated Checkout owned by the requested Workspace. Require an authenticated actor with Commerce management authority, explicit `pending | succeeded | failed | canceled` outcome input, request idempotency, and optimistic Checkout revision.
- Reject the command outside `development` and `test`, for Stripe sessions, for mismatched Workspace/actor authority, or for invalid terminal transitions. No production fallback or Provider impersonation is permitted.
- Build the strict simulated Provider event envelope, sign the exact raw bytes with the configured simulated signing secret, and submit it to the canonical acceptance service so signature verification, encrypted inbox identity, payload hash, pinned Connector version, and Job creation remain mandatory.
- The command may record the selected simulated Checkout outcome only through the accepted event Job contract. It must not directly update Subscription, access, invoice, transaction, refund, or Credits; those projections remain M2.3/M2.4.
- Added a durable `CommerceCheckoutOutcomeCommand` receipt with actor, Workspace, Checkout, expected revision, selected outcome, Provider event identity, exact event time, request fingerprint, idempotency hash, and processing result evidence.
- Added the development/test-only Product command `POST /workspaces/{workspace_id}/commerce/checkout-session/{checkout_session_id}/outcome`. It accepts only a configured simulated/test Checkout and resolves Owner or exact `workspace:commerce:manage` authority before event acceptance.
- The command emits deterministic strict JSON, signs the exact bytes with HMAC, and calls `BillingEventAcceptanceService`; the encrypted inbox, payload hash, unique Provider event claim, pinned Connector Job, Connector normalization, and fenced outcome applicator remain mandatory.
- The applicator validates the durable command's Provider event identity and signed event timestamp, applies only a matching pending Checkout revision, uses event time for expiry and `completed_at`, and records terminal result evidence. Same-revision terminal races converge on the first applied event and report later events as stale.
- The simulated Connector owns `checkout.session.outcome`; Stripe explicitly declines that event. Checkout outcome processing does not update Subscription, commercial access, invoice, transaction, refund, or Credits.
- Fixed the migration generator's latent projected-state drift instead of accepting a 231-operation database replay. Raw SQL migrations `0080` and `0116`–`0119` had no projected-state effect; the first generated drift exposed two non-serializable datetime lambdas. The lambdas are now module-level callables, and the reviewed state-reconciliation command emits a database-no-op complete app-state snapshot guarded by the expected drift count.
- Generated `0120_migration_state_reconciliation` with the complete 247-model projected state and `0121_simulated_checkout_outcome_commands` with the single new command model. A fresh `db:migrate` reports `No changes detected`.

M2.2b validation:

- Final focused unit regression passed `43` tests covering state reconciliation, migration shape, models, command authorization/environment/idempotency, application evidence/order/expiry, router contract, Job routing, and both simulated and Stripe Connector behavior.
- Real PostgreSQL validation passed `2` integration tests: `0119 -> 0120 -> 0121` migration execution and the complete command -> signed event -> encrypted inbox -> pinned Job -> Connector normalization -> Checkout application/replay chain. The integration assertion confirms Subscription, commercial access, invoice, transaction, refund, and Credits remain unchanged.
- Targeted Ruff check/format and `ty` passed across the changed non-generated API, plugin, and test surfaces. Product OpenAPI generation/typecheck and locale parity across `23` namespaces passed.
- `pnpm api:check`: API lint and formatting passed across `1858` files. Broad typecheck remains blocked by the same `294` existing Design System publication/content-route diagnostics, and Turbo interrupted broad pytest after that failure; no fallback was added.
- Changed-scope Code Review Engine reported zero blocking findings. Its only two report-only findings are the known prototype lifecycle reports for the simulated and Stripe Connector plugins, both registered through the canonical `arclayer_register` Connector contract.

M2.3 execution parts:

1. M2.3a simulated subscription lifecycle event contract and application baseline. — Complete
   - M2.3a.1 strict simulated subscription lifecycle normalization and same-Revision application baseline. — Complete
     - Add one strict `subscription.lifecycle` simulated event shape and normalize it to the existing `ProviderSubscription` contract without changing Stripe event ownership or behavior.
     - Route a signed event through `BillingEventAcceptanceService`, encrypted `ConnectorEventInbox`, pinned `BillingConnectorEventJobHandler`, and `BillingProviderSubscriptionApplicationService`; direct Subscription mutation is not accepted as lifecycle evidence.
     - Apply only the Subscription's already-bound published Revision and exact simulated Price in this slice. Verify Provider customer/subscription identity, period, status, application identity, duplicate replay, and stale-period rejection. Dunning, Credits, payment projections, and Revision rebinding remain unavailable.
     - Primary files are the simulated Connector and focused Connector/full-chain PostgreSQL tests. No schema or migration is expected.
   - M2.3a.2 completed-Checkout activation evidence and Revision rebinding. — Complete
     - Correlate a completed simulated subscription Checkout to the exact Workspace, current Subscription, target Plan/Revision/Price, Provider account/session, and actor command evidence before a paid activation event may rebind the Revision.
     - Require the canonical Plan Access Convergence path for any access-reducing target; an unconfirmed or mismatched Revision change remains an explicit reconciliation failure.
     - Cover initial paid activation after completed Checkout, exact Provider period identity, duplicate replay, stale/out-of-order events, and unchanged Stripe behavior.

M2.3a.1 implementation evidence:

- Registered the separate strict simulated event type `subscription.lifecycle` while retaining `checkout.session.outcome`. Event data is a closed union: subscription facts require exact Workspace, Plan, Revision, Price, billing cycle, uppercase currency, Provider customer/subscription identity, explicit supported lifecycle status, valid increasing period boundaries, and cancellation scheduling state.
- The simulated Connector validates that the event type matches its exact data shape. Subscription events normalize only to `ProviderSubscription`; Checkout events continue to normalize only to `ProviderCheckoutOutcome`. Stripe code and registered Stripe event ownership are unchanged.
- The real integration path verifies HMAC bytes, stores only encrypted payload in `ConnectorEventInbox`, creates the pinned Job/outbox, resolves the pinned simulated Connector, normalizes the lifecycle event, and applies it through `BillingProviderSubscriptionApplicationService`.
- This slice applies only an already-bound published Plan Revision with an exact simulated Price. It updates Provider customer/subscription identity, lifecycle status, period, and Credit-account period identity without granting Credits, changing access state, creating payment projections, or permitting Revision rebinding.
- Duplicate event acceptance and processed-Job replay return the existing result. A different event carrying an older period is rejected by the Commerce application boundary and recorded as a failed inbox without rolling back the already-applied current period.

M2.3a.1 validation:

- Simulated Connector unit coverage passed `7` tests for signature identity, signature rejection, strict registration, Checkout preservation, lifecycle normalization, and event-type/data-shape mismatch rejection.
- Focused simulated/Stripe Connector and Billing event Job regression passed `29` tests.
- Real PostgreSQL regression passed `2` integration tests: the existing simulated Checkout outcome chain and the new subscription lifecycle acceptance/application/replay/stale-period chain.
- Targeted Ruff check/format and `ty` passed for the simulated Connector and both focused test files. GitNexus pre-edit impact for every modified Connector symbol was `LOW`, with zero indexed upstream dependencies and zero affected execution flows; dynamic plugin behavior is covered by the focused tests above.
- Changed-scope Code Review Engine reported zero blocking findings. Its only report-only finding is the known prototype lifecycle rule for the simulated Connector, which registers through the canonical `arclayer_register` Connector contract.
- Final staged GitNexus detection reported `LOW` risk across `4` files and `42` indexed symbols, with no affected execution flow.

M2.3a.2 implementation evidence:

- Added strict Checkout activation evidence to the Provider subscription contract. A simulated lifecycle activation identifies the exact durable Checkout, external session, accepted Checkout outcome event, and lifecycle occurrence time; it cannot also carry a confirmed Provider transition.
- Added migration `0122_checkout_activation_evidence`. Each `CommerceProviderEventApplication` may retain the exact Checkout session and outcome-command foreign keys that authorized a Revision-changing activation.
- Added a dedicated Checkout activation repository that locks the outcome command before the Checkout session and validates Workspace, current Subscription, Plan/Revision/Price, Plan code, Provider/mode/account, billing cycle, currency, amount, external Price/session, successful terminal outcome, actor, accepted inbox/Job processing, and event ordering.
- Revision rebinding now requires either confirmed Provider transition evidence or an exact completed-Checkout activation whose target does not reduce access. Access-reducing targets still require canonical Plan Access Convergence and fail explicitly when convergence is absent.
- Provider application replay distinguishes an already-applied event from a recoverable `provider_reconciliation_required` application. A failed activation can be retried after its durable Checkout outcome evidence arrives; successful Revision rebinding advances `WorkspaceSubscription.revision`.
- Dunning no longer bypasses Revision authority. Stripe normalization remains independent and does not receive simulated Checkout activation semantics.

M2.3a.2 validation:

- Focused unit regression passed `45` tests across Checkout activation repository, simulated and Stripe Connectors, Billing event Job handling, and migration shape.
- Real PostgreSQL regression passed `15` tests across Provider-confirmed convergence, simulated lifecycle application, completed Checkout activation, replay, stale/out-of-order and mismatched evidence, access-reducing rejection, reconciliation retry, and the `0119 -> 0120 -> 0121 -> 0122` migration chain.
- Targeted Ruff lint/format and `ty` passed across all `14` changed API, plugin, migration, and test files.
- The active database is upgraded through `0122_checkout_activation_evidence`; a repeated `db:upgrade` reports no migrations to apply and `db:migrate` reports no model-state changes.
- `pnpm api:check`: API lint and formatting passed across `1861` files. Broad typecheck remains blocked by `290` existing diagnostics in Design System/content and unrelated test surfaces, so Turbo interrupted broad pytest; the targeted Commerce type surface is green.
- Changed-scope Code Review Engine exited successfully with zero blocking findings. Its `39` report-only findings are existing convergence repository/protocol and i18n prototype reports plus the known simulated Connector lifecycle report; the new Checkout activation repository is recognized as a canonical `TortoiseORMRepository`.
- The existing Stripe Credit integration fixture still attempts a Free-to-Premium Revision rebind without completed Checkout or confirmed transition evidence and correctly fails with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED`; the authority boundary was not weakened to preserve that legacy fixture.

2. M2.3b dunning and restricted-access projection. — Complete
   - Normalize a failed-payment dunning fact with Provider period identity, occurrence time, and explicit recovery deadline; apply it through the existing access-state composition and configured Provider-aware dunning policy.
   - Verify warning/restricted/suspended transitions, optimistic access revision, duplicate/out-of-order convergence, entitlement/Credit denial behavior, and immutable signed evidence.
   - M2.3b.1 strict simulated dunning normalization and signed application baseline. — Complete
     - Extend only `subscription.lifecycle` with a closed `payment_failure | final_unpaid` dunning union. Payment failure requires `past_due`, exact Provider period identity, event occurrence time, and an explicit later recovery deadline; final unpaid carries no deadline.
     - Apply the normalized fact only through signature verification, encrypted inbox, pinned Billing Job, Subscription application, `VerifiedProviderDunningFact`, the canonical access-state composition, immutable transition/outbox facts, and optimistic access revision.
     - Prove `normal -> payment_grace` and `payment_grace -> payment_restricted` without changing the bound Plan Revision, granting Credits, implementing recovery/renewal, or adding Platform simulator APIs.
   - M2.3b.2 Provider-aware policy enforcement and dunning ordering. — Complete
     - Resolve the active Provider/mode Dunning Policy, reject missing or inconsistent policy/recovery metadata explicitly, and prevent duplicate or stale Provider facts from extending or regressing the current state.
   - M2.3b.3 Restricted Recovery denial projection and closure. — Complete
     - Verify the existing Product API/Job command matrix against the projected state, withheld period Credit behavior, immutable Hosting/notification handoffs, and the complete focused/package regression before advancing to recovery.
     - M2.3b.3a Payment Grace metered-effect denial and Job terminal contract. — Complete
       - Keep ordinary Product content mutation available during Grace while rejecting every newly dispatched metered external-cost effect with an explicit 402 recovery error and Provider recovery deadline.
       - Project the same denial into permanent Job failure metadata so retry, schedule, Agent, and Job paths cannot reinterpret the payment state as transient.
     - M2.3b.3b Product API/automation denial matrix closure. — Complete
       - Close unguarded Product HTTP and event-driven execution paths while preserving payment recovery, cancellation, revocation, deletion, and other reducing actions.
       - M2.3b.3b.1 Product HTTP command matrix. — Complete
         - Classify every reachable Product mutation route by its actual commercial effect, including storage, AI runtime, legacy Agent, environment, database, API-key, Automation configuration, Knowledge, Skill, and Design System surfaces.
         - Keep abort, cancel, reject, revoke, rotate, delete, and other reducing or safety actions available during recovery.
       - M2.3b.3b.2 Event-driven Automation execution preflight. — Complete
         - Pre-authorize every distinct operation effect before creating an Automation run or dispatching any operation so mixed flows cannot partially execute under Grace or Restricted access.
       - M2.3b.3b.3 Remaining reachable Site mutation closure. — Complete
         - Verify Site settings and preview-token write paths against the same Product commercial-effect contract, and exclude unreachable legacy routers with registration evidence instead of manufacturing a false closure.
     - M2.3b.3c withheld period Credits and immutable handoff evidence. — Complete
       - Prove past-due/final-unpaid periods create no Plan Credit grant, and enforce database-level update rejection for committed Hosting/lifecycle facts without blocking Workspace cascade deletion.
3. M2.3c recovery, renewal, and closure. — Complete
   - Apply successful recovery and renewal facts with exact period boundaries and revision evidence, restoring access only through the canonical state machine.
   - Close M2.3 with delayed/reordered lifecycle integration coverage, unchanged Stripe regressions, package/static gates, staged GitNexus detection, changed-scope review, execution-record update, and a focused commit.

M2.3b.1 implementation evidence:

- Extended the strict simulated `subscription.lifecycle` contract with a closed dunning union. `payment_failure` requires `past_due`, exact Provider period identity, and a recovery deadline later than the signed event occurrence time; `final_unpaid` permits only `past_due | canceled` and forbids recovery metadata.
- Dunning and Checkout activation evidence are mutually exclusive. The occurrence time comes only from signed `event.created`, so callers cannot inject a second ordering clock.
- Applied dunning through the complete HMAC signature, encrypted inbox, pinned Billing Job, Connector normalization, Subscription application, `VerifiedProviderDunningFact`, access-state transition, and immutable notification/Hosting outbox chain.
- Proved `normal -> payment_grace -> payment_restricted` while preserving the bound Plan Revision and Credit-account Revision, advancing the optimistic access revision from `1` to `3`, and creating no Credit grant or recovery behavior.
- Fixed the first real Payment Restricted Hosting handoff: `BaseSchema` materializes enum values as strings, so the outbox now serializes `str(handoff.state)` instead of dereferencing a nonexistent `.value` attribute.

M2.3b.1 validation:

- Focused Connector, Stripe, Billing Job, access-state, and restricted-recovery unit regression passed `51` tests.
- Real PostgreSQL regression passed `14` integration tests across simulated lifecycle and Provider subscription application paths.
- Targeted Ruff lint/format and `ty` passed for the four changed code/test files. GitNexus impact for the Hosting outbox fix was `LOW`, with one direct test caller and zero affected execution flows.
- `pnpm api:check` passed lint and formatting across `1861` files. Broad typecheck remains blocked by `290` existing diagnostics, so Turbo interrupted broad pytest; no fallback or suppression was added.
- Changed-scope Code Review Engine reported zero blocking findings and only the existing i18n and simulated Connector lifecycle prototype reports.

M2.3b.2 implementation evidence:

- Added exact active Dunning Policy resolution by Provider and mode. Missing, multi-active, invalid-mode, non-Provider deadline, empty, or non-object effect metadata fails explicitly before Subscription, access, Credit-account, application, transition, or outbox state commits.
- Moved Provider application claim, policy resolution, access ordering, transition/outbox writes, Subscription/Credit-account projection, and application completion into one database transaction. A failed policy or access write rolls back the complete application boundary.
- Expanded the verified dunning identity to Provider, mode, Provider account, event, exact Provider period boundaries, occurrence time, Subscription Revision, and policy Revision. Durable transition lookup and uniqueness no longer conflate test/live or separate Provider accounts that reuse an event id.
- Rebuilt replay receipts exclusively from immutable transition snapshots rather than the mutable current Subscription. Historical replay preserves its original Revision, Provider mode, account/event scope, period, access revision, occurrence evidence, and policy revision after later transitions or Subscription changes.
- Added explicit `transitioned`, `replayed`, `stale_ignored`, `state_repeat_ignored`, and `state_regression_ignored` outcomes. Later failure retries cannot extend a Grace deadline; delayed older periods remain stale even with a later arrival time; Restricted cannot regress to Grace; and a recovered Provider period cannot re-enter dunning from a later failure fact.
- Standardized the transactional lock order as Subscription before commercial access, removing the dunning/recovery lock-order cycle while preserving optimistic access revision checks.
- Added migration `0123_dunning_policy_ordering_evidence`. It backfills exact Provider application, Subscription Revision, Provider period, and resulting access-revision evidence for M2.3b.1 transitions, rejects ambiguous/incomplete legacy evidence, enforces non-null snapshot columns and scoped event uniqueness, and prevents database updates to historical transitions while retaining Workspace lifecycle cascade behavior.

M2.3b.2 validation:

- Focused access-state, policy, and Restricted Recovery unit regression passed `37` tests.
- Simulated Connector, Stripe Connector, and Billing event Job regression passed `33` tests.
- Real PostgreSQL Provider application and simulated lifecycle regression passed `17` tests, covering policy failure rollback, exact replay, Grace deadline stability, stale and regressing facts, immutable historical receipts, Provider period ordering, and unchanged Stripe behavior.
- Real PostgreSQL `0122 -> 0123` legacy-data migration coverage passed `1` test, including exact snapshot backfill, non-null evidence, current access-period backfill, and database-level immutable transition rejection.
- The active database was rolled back to `0122`, upgraded through the final `0123`, and migration generation reported `No changes detected`.
- Targeted Ruff lint/format and `ty` checks passed across the changed model, migration, access-state/application runtime, and tests.
- `pnpm api:check`: API lint and formatting passed across `1862` files. Broad typecheck remains blocked by `289` existing diagnostics in Design System/content and unrelated test surfaces; Turbo interrupted broad pytest after that failure. All M2.3b.2 focused and PostgreSQL tests remain green.
- Changed-scope Code Review Engine exited successfully with zero blocking findings. Its `25` report-only findings are the existing prototype backend error-localization pattern on changed access-state/application files; no architecture or lifecycle blocker was reported.

M2.3b.3a implementation evidence:

- Added a distinct `WORKSPACE_PAYMENT_RECOVERY_REQUIRED` 402 contract for Payment Grace. Its immutable metadata identifies `payment_grace`, the exact recovery deadline, `commerce:PAYMENT_GRACE`, and the permitted payment-recovery action.
- `RestrictedRecoveryService` now rejects only `METERED_EXTERNAL_EFFECT` during Grace. Ordinary content mutation remains available, while Payment Restricted continues to reject every value-expanding command.
- `CommercialAccessJobAuthorizer` converts both Grace metering denial and Payment Restricted denial into permanent Job execution errors. The common Job registry now requires the exact metadata schema for both codes across every registered Job type.
- Added stable bilingual API/Product error copy without changing the existing Payment Restricted message.

M2.3b.3a validation:

- Focused Restricted Recovery, command policy, and Job registry regression passed `46` tests.
- Targeted Ruff lint and formatting passed after formatting the single changed test file; targeted `ty` passed for all changed production modules.
- Product locale parity passed for all `23` namespaces.
- GitNexus pre-edit impact for `RestrictedRecoveryService.classify`, `CommercialAccessJobAuthorizer.authorize`, and the common Job terminal contract was `LOW`, with at most one direct test caller and zero affected execution flows.

M2.3b.3b.1 implementation evidence:

- Added explicit commercial-effect dependencies to every newly identified reachable Product mutation route. Storage and rendering/AI dispatch paths use `METERED_EXTERNAL_EFFECT`; content/configuration writes use `CONTENT_MUTATION`; API-key creation uses `ACCESS_EXPANSION`.
- Reclassified project and Workspace upload init/part/complete/presign/commit operations as metered external effects because they allocate or write storage. Upload status/policy reads remain read-only and abort remains available without a commercial blocker.
- Classified durable AI Run create/resume, legacy Agent proposal/run/resume/stream, project database creation, and representative Design System preview as metered effects. Thread metadata, Agent approval mutation/apply, environments, and Automation flow configuration remain ordinary content mutations.
- Preserved recovery and risk-reducing actions without commercial blockers, including AI/Agent cancel, Tool response, thread deletion, upload abort, API-key revoke/rotate, database credential rotation, Automation deletion, and Agent rejection.
- Expanded the route contract test into an exact mutation matrix. `None` is an explicit assertion that the route intentionally has no commercial blocker rather than an omitted classification.

M2.3b.3b.1 validation:

- Exact Product command-route matrix passed `5` tests after synchronizing all reachable Knowledge Guidance, ZIP Skill import, Design System publication/preview, storage, AI runtime, legacy Agent, API-key, database, environment, and Automation mutations.
- Targeted Ruff lint/format and `ty` passed across all ten changed production/test files.
- GitNexus pre-edit impact for every changed route function was `LOW`, with zero affected execution processes.
- Changed-scope Code Review Engine exited successfully with zero blocking findings. Its only report-only finding is the existing prototype module-structure suggestion for `apps/api/src/modules/ai`.

M2.3b.3b.2 implementation evidence:

- Added an injected `CommercialEffectAuthorizer` protocol to `ProjectAutomationService`. The production `AutomationRuntime` composes it with the canonical Restricted Recovery command policy; direct flow execution without an authorizer fails explicitly with `AUTOMATION_COMMERCIAL_EFFECT_AUTHORIZER_UNAVAILABLE`.
- Mapped every current Automation operation kind to its actual effect: content reads use `READ_EXISTING`; content updates use `CONTENT_MUTATION`; webhook, HTTP request, Agent analysis, release publication, and notification dispatch use `METERED_EXTERNAL_EFFECT`.
- `execute_flow` now loads the complete ordered operation list and pre-authorizes every distinct effect before creating an Automation run, updating run state, writing logs, or invoking an operation handler. Distinct effects are authorized separately so mixed preserved/value-expansion flows do not trigger the existing mixed-command conflict.
- Unknown persisted operation kinds fail with the stable `COMMERCIAL_COMMAND_EFFECT_UNCLASSIFIED` contract before any run side effect. Both new configuration errors have complete `zh-CN` and `en-US` API messages.
- Preserved existing operation-failure behavior after successful preflight: execution failures still produce the configured failed/dead-letter run and diagnostic log rather than being confused with a preflight denial.

M2.3b.3b.2 validation:

- Restricted Recovery, command policy, Product route matrix, Automation service, and Automation runtime regression passed `44` tests.
- Automation-focused service/runtime regression passed `20` tests after the final localization update; core API i18n regression passed `8` tests.
- Targeted Ruff lint/format and `ty` passed for the Automation service, runtime, and tests.
- `pnpm api:check` passed API lint and formatting. Broad typecheck remains blocked by the same `289` existing diagnostics, after which Turbo canceled broad pytest; no targeted Automation type diagnostic remains.
- Changed-scope Code Review Engine exited successfully with zero blocking findings. Its sole report-only finding is the existing `AUTOMATION_NOTIFICATION_TARGET_INVALID` localization prototype issue outside this change.
- GitNexus could not resolve the Automation service/runtime symbols because the index reported an existing ScopeExtractor failure for `service.py`; no High/Critical result was returned, and the live production construction chain was verified directly as `core/runtime_init.py -> AutomationRuntime -> ProjectAutomationService`.

M2.3b.3b.3 implementation evidence:

- Added Site-scoped commercial-effect dependencies that resolve the durable Site before authorizing its owning Workspace through the canonical Restricted Recovery policy.
- Site setting upserts retain mandatory preview-token validation before Workspace resolution and commercial authorization, then classify the write as `CONTENT_MUTATION`.
- Preview-token issuance classifies the temporary access credential as `ACCESS_EXPANSION`; the existing identity-authorization boundary remains unchanged in this slice.
- Product composition evidence confirms that the settings and preview-token routes are reachable while the legacy Site pattern collection/item routers are not registered. Unreachable handlers were excluded instead of being presented as protected Product surfaces.

M2.3b.3b.3 validation:

- Focused Site route/helper/composition coverage passed `13` tests; targeted Ruff lint/format and `ty` passed across all changed Site production and test files.
- Expanded Restricted Recovery, command-policy, Product route, Automation service/runtime, Site helper, and Product composition regression passed `52` tests.
- Changed-scope Code Review Engine reported zero findings across all `41` rules.
- GitNexus was refreshed successfully to `102188` symbols and `300` execution flows after the index became stale; its existing ScopeExtractor failures remain visible and did not hide a High/Critical Site impact result.
- M2.3b.3b is complete. The only active part is M2.3b.3c withheld period Credits and immutable handoff evidence.

M2.3b.3c implementation evidence:

- Extended the signed simulated dunning integration chain with direct Credit-account evidence. `past_due` payment failure and `final_unpaid` both preserve the existing balance and create neither a `PLAN_PERIOD` grant lot nor a `PERIOD_GRANT` ledger entry.
- Kept the existing Provider application behavior explicit: dunning updates Subscription/access state and the Credit account's Provider period identity, but does not call the Plan-grant creation path. Successful recovery remains responsible for a separate durable grant decision in M2.3c.
- Added migration `0124_commercial_access_fact_immutability` with a PostgreSQL `BEFORE UPDATE` trigger on `commerce_commercial_access_facts`, covering both committed `lifecycle_notification` and `hosting_handoff` evidence.
- The trigger rejects fact mutation without adding a DELETE trigger. The existing Workspace foreign key remains `ON DELETE CASCADE`, so Workspace deletion still removes committed facts.

M2.3b.3c validation:

- Migration shape coverage passed `1` unit test. Focused signed dunning plus immutable-fact migration PostgreSQL coverage passed `2` tests.
- Complete access-state unit regression passed `34` tests; its `4` integration tests were skipped only in the non-integration invocation.
- Explicit PostgreSQL Provider application, simulated lifecycle, `0122 -> 0123` ordering evidence, and `0123 -> 0124` immutability regression passed `19` tests.
- Targeted Ruff lint/format and `ty` passed across the migration and changed tests. Changed-scope Code Review Engine reported zero findings across all `41` rules.
- The active database applied `0124_commercial_access_fact_immutability`; `db:migrate` then reported `No changes detected`.
- `pnpm api:check` passed API lint and formatting. Broad typecheck remains blocked by the same `289` existing diagnostics, after which Turbo interrupted broad pytest; every M2.3b.3c focused and PostgreSQL test remains green.
- M2.3b.3 and M2.3b are complete. The only active part is M2.3c recovery, renewal, and closure.

M2.3c implementation evidence:

- Replaced the disconnected recovery-grant decision branch with one transactional Provider-period Credit service and durable `CommercePlanPeriodGrant` receipt. Subscription/access convergence, exact Plan Revision, Credit account, lot/ledger evidence, Provider application completion, and recovery/renewal status now commit or roll back together.
- Added migration `0125_commerce_plan_period_grants`. Each receipt binds one Workspace/account/subscription/Revision to the exact Provider application, period-grant ledger, optional Plan lot, Provider/mode/account/event, period identity/boundaries, grant reason, and integer Credit amount. Application, ledger, lot, and grant identity uniqueness prevent duplicate evidence.
- Successful `payment_recovered` facts restore access only through the canonical state machine, clear the recovery deadline, create immutable notification/Hosting handoffs, and grant the withheld period Credits exactly once. A second recovery event converges to `dunning_state_repeat_ignored`; a later same-period failure cannot re-enter dunning.
- Ordinary `active` lifecycle events cannot recover Payment Grace or Payment Restricted without a signed `payment_recovered` fact. The application transaction rolls back with `COMMERCIAL_RECOVERY_FACT_REQUIRED` instead of silently restoring access.
- Paid Checkout activation, periodic renewal, and recovery use explicit `activation | renewal | recovery` grant reasons. New periodic Provider periods expire remaining Plan-period lots with exact expiration ledger/mutation evidence, preserve purchased top-ups, and then create the new Plan lot and period-grant ledger.
- Pending account or Plan-lot reservations reject a period change with `COMMERCIAL_CREDIT_PERIOD_RESERVATIONS_PENDING`; Subscription, account, application, lots, and ledger remain unchanged. Revision-once (`refresh = none`) Plans advance Provider period identity without expiring or granting the same Revision twice.
- Deleted the obsolete `PaymentRecoveryGrantService`, its repository/schema persistence path, and its unit test. Provider application lifecycle completion retains `result_code = applied`; recovery-grant evidence no longer overwrites that field.
- Corrected two PostgreSQL/runtime defects exposed by the full chain: access projections require value equality because `BaseSchema` serializes enum values, and Plan-lot row locking now uses separate prefetch queries so PostgreSQL never applies `FOR UPDATE` to the nullable side of an outer join.

M2.3c validation:

- Focused simulated/Stripe Connector, access-state, model, and migration unit regression passed `43` tests.
- Real PostgreSQL simulated lifecycle, Stripe Provider application, and `0124 -> 0125` migration regression passed `20` tests, covering activation, renewal, top-up preservation, expiration evidence, delayed periods, recovery, duplicate recovery, recovery-fact enforcement, reservation rollback, Revision-once grants, and exact migration relations/indexes.
- Targeted Ruff lint/format and `ty` passed across all changed production, migration, plugin, and test surfaces. The active database applied `0125_commerce_plan_period_grants`; a subsequent `db:migrate` reported `No changes detected`.
- Product error-locale parity passed across all `23` namespaces after synchronizing the two new explicit recovery/period-reservation errors and the existing filtered shared errors.
- `pnpm api:check` passed API lint and formatting across `1863` files. Broad typecheck remains blocked by `290` existing Design System/content and unrelated test diagnostics; Turbo interrupted broad pytest after that failure. No targeted M2.3c diagnostic remains.
- The known legacy Stripe Credit fixture still attempts a Free-to-Premium Revision rebind without completed Checkout or confirmed transition evidence and continues to fail with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED`; the production authority boundary was not weakened.
- Changed-scope Code Review Engine exited successfully with zero blocking findings. Its `29` report-only findings are existing access-state/application localization prototypes plus the known simulated Connector lifecycle report; the new service inheritance and Pydantic contract findings were resolved before commit.
- Final staged GitNexus detection reported `LOW` risk across `22` files and `102` indexed symbols with no affected execution flow.
- M2.3 is complete. The only active part is M2.4 canonical transaction, invoice, top-up, and refund projection.

M2.4a.1 implementation evidence:

- Added one Provider-neutral payment projection service inside the existing Provider Subscription application transaction. It binds the Workspace, Subscription, Plan Revision, Provider/mode/account/event, current invoice and transaction projections, payload SHA-256, signature reference, and a canonical payment fingerprint.
- Extended strict normalized Subscription events with optional invoice and exact transaction facts. The simulated Provider now emits these facts only through its signed `subscription.lifecycle` event and the accepted encrypted-inbox/pinned-Job chain.
- Added durable application and transaction snapshot models plus migration `0126_commerce_provider_payment_projections`. Exact application replay creates no duplicate projection; later legal states advance current projections; delayed invoice events persist `stale_ignored` evidence without regressing current state.
- Corrected transaction ordering to compare Provider event occurrence times rather than mixing transaction occurrence time with event time. A later event can therefore advance the same transaction from `pending` to `succeeded` while genuinely delayed events remain stale.
- Removed the obsolete Job-handler unit test that invoked the deleted `_apply_credit_account` implementation detail instead of restoring a compatibility path.

M2.4a.1 validation:

- Focused Provider payment, simulated/Stripe Connector, Job, and migration unit regression passed `36` tests. Real PostgreSQL lifecycle and independent `0126` migration validation passed `15` tests.
- Targeted Ruff, format, and `ty` checks passed. The active database reports no migrations to apply, and `db:migrate` reports `No changes detected`.
- `pnpm api:check` passed Ruff and format across `1866` files. Broad typecheck remains blocked by `289` existing Design System/content and unrelated test diagnostics; Turbo interrupted broad pytest after that failure.
- Changed-scope Code Review Engine exited successfully with zero blocking findings. Its `26` report-only findings are existing localization prototypes plus the known simulated Connector lifecycle report.
- M2.4a.1 is complete. The only active part is M2.4a.2 real Stripe invoice normalization and projection; production Stripe remains independent from simulated event shapes and must use exact Provider transaction identities.

M2.4a.2 implementation evidence:

- Normalized Stripe Basil invoice facts from `invoice.paid`, `invoice.overpaid`, `invoice.payment_failed`, `invoice.payment_succeeded`, `invoice.marked_uncollectible`, and the allocation-native `invoice_payment.paid` event without reusing simulated Provider payload shapes.
- `invoice_payment.paid` processing occurs only in the accepted Connector Job. It resolves the exact Invoice by the signed InvoicePayment's `invoice` identity, requests the complete expanded `payments.data` collection, and then resolves the Subscription; webhook verification itself remains free of Provider I/O.
- Uses each Stripe `inpay_*` InvoicePayment identity as the canonical transaction identity. Every allocation must identify `object = invoice_payment`, belong to the projected Invoice, use the same currency, carry complete paid amount/time evidence, and match the fetched expanded allocation exactly for allocation events.
- Incomplete or paginated payment collections, allocation totals above the Invoice paid amount, paid amounts above the requested allocation, and semantically false `invoice.overpaid` events fail explicitly. Invoice paid amount may exceed amount due, and absent Provider transaction evidence never causes a fabricated transaction identity.
- Preserved integer micros: Stripe two-decimal payment amounts scale by `10_000`; Stripe zero-decimal payment currencies scale by `1_000_000`; ISK, UGX, HUF, and TWD remain on Stripe's two-decimal payment representation.
- Invoice service periods are independent from the Subscription current period for ordinary Stripe invoice projection. Completed-Checkout activation retains strict period equality and subscription-transaction semantics; non-activation invoice facts accept exact Stripe `subscription_create | subscription_cycle` transaction kinds.
- Open partial invoices complete the Provider application as `payment_projected`. Exact Job replay creates no duplicate projection and does not advance Subscription, commercial access, Provider-period Credits, or period identity. A later paid Invoice advances the same Invoice, records every exact allocation, advances the Subscription period, and grants period Credits once.
- Stripe `trialing` remains explicitly unsupported. `invoice.payment_failed` without Provider recovery metadata remains an invalid/attention event; the Connector does not infer an unlimited Grace window or immediate Payment Restricted state.
- The tightened Provider-neutral Checkout activation validator exposed a simulated Connector normalization leak. Provider contract validation errors are now translated to the stable invalid-webhook error instead of escaping as raw Pydantic exceptions.

M2.4a.2 validation:

- Focused Stripe, simulated, Provider payment, and Billing Job unit regression passed `50` tests.
- Real PostgreSQL Stripe chain passed `1` test covering signed `invoice_payment.paid` partial allocation, expanded Invoice retrieval, `payment_projected` replay, later `invoice.paid`, two exact `inpay_*` transactions, and one Provider-period Credit grant.
- Real PostgreSQL Provider application and simulated lifecycle regressions passed `5` and `14` tests respectively. The separate legacy Free-to-Premium fixture still correctly fails with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED` because it supplies neither completed Checkout nor confirmed transition evidence.
- Targeted Ruff lint/format and `ty` passed across all changed API, Connector, and test files. `db:upgrade` reports no migrations to apply and `db:migrate` reports `No changes detected`.
- `pnpm api:check` passed API lint and formatting across `1867` files. Broad typecheck remains blocked by the existing `289` unrelated diagnostics, after which Turbo interrupted broad pytest; all focused M2.4a.2 unit and PostgreSQL tests remain green.
- Changed-scope Code Review Engine exited successfully with zero blockers. Its `17` report-only findings are existing application-service localization prototypes and the known simulated/Stripe Connector lifecycle prototype reports.
- Final staged GitNexus detection reported `LOW` risk across `8` files and `168` indexed symbols, with no affected execution flow.
- M2.4a.2 is complete. M2.4b.0 froze the purchased top-up, refund, and payment-reconciliation contracts. M2.4b.1 completed immutable top-up Checkout snapshots and strict settlement evidence. M2.4b.2 completed simulated top-up Checkout and signed exact-once settlement; the only active part is M2.4b.3 Stripe top-up Checkout and settlement.

M2.4b.0 contract freeze:

- Credit consumption is deterministic: current-period Plan lots; promotional and adjustment lots by expiry, issue time, and stable identity; `legacy_unattributed`; then purchased top-up lots. Generic negative adjustments preserve top-ups by reversing newest adjustment, promotional, Plan, legacy, and then top-up value. Provider refunds bypass that generic order and target only the exact purchased lot linked to the original top-up transaction.
- Every top-up Checkout snapshots the offer id/revision, integer Credits, Provider Price, currency, money micros, Workspace, actor, Provider scope, expiry, idempotency identity, and request fingerprint. Checkout creation and return URLs never grant Credits.
- Initial settlement accepts exactly one complete payment whose amount, currency, Provider Price, and Credits match the Checkout snapshot. Only a signature-verified accepted Provider event may create the top-up transaction, ledger entry, and non-expiring purchased lot. Partial, multiple, substituted, duplicate, stale, and out-of-order settlements never create a second grant and become explicit reconciliation failures when evidence conflicts.
- Initial refund supports one full refund of a succeeded top-up transaction. Request acceptance creates a durable pending refund and exact hold against the original purchased lot's unreserved remaining Credits before any Provider refund call. The hold reduces availability without claiming completion; failure/cancellation releases it; Provider-confirmed success consumes it and atomically appends the refund ledger/lot mutation and projection updates.
- Subscription and renewal refunds remain Subscription Commercial Corrections. M2.4 payment correction means append-only Provider payment/Credit consequence reconciliation and is distinct from Subscription Commercial Correction, Commerce/Hosting Domain State Correction, and Platform Credit adjustment.
- A Provider-confirmed refund without the exact pending hold and matching Workspace, transaction, amount, currency, and Credit consequence enters reconciliation required. The system never fabricates success, produces a negative Credit balance, or reverses unrelated lots.

M2.4b.1 implementation evidence:

- Added `top_up_offer_revision` to durable Checkout evidence. A top-up Checkout now has a complete provider-neutral record containing Workspace, actor, offer id/revision, integer Credits, Provider/mode/account, exact Price, currency, money micros, external session, expiry, idempotency key, fingerprint, and revision.
- Added a dedicated top-up Checkout repository that transactionally locks the idempotency scope, active Workspace, active actor membership, active Offer, and exact Provider Price before persistence. Archived/inactive Workspaces and non-members fail explicitly; changed fingerprints conflict, stale Offer/Price facts conflict, and exact replay returns the original snapshot even after later Offer or Price edits.
- Added a strict Connector-normalized top-up settlement contract and correlation validator. Provider event identity, Checkout/session, Workspace, actor, Offer revision, Price, currency, amount, Credits, fingerprint, Provider scope, and expiry must all match before a later application service may project settlement.
- Added state-aware migration `0127_top_up_checkout_snapshot_evidence`. It backfills existing top-up Checkout revisions, fails explicitly when evidence cannot be recovered, and hardens subscription versus top-up target shapes so top-ups cannot carry Subscription, Plan Revision, Plan code, or billing-cycle authority.
- Kept settlement execution unavailable in this slice. No Checkout creation, return URL, Product poll, simulator command, repository call, or migration grants Credits or creates a succeeded transaction. Signature/inbox/pinned-Job dispatch, simulated settlement, Stripe Checkout mode, refund execution, Platform APIs, and OpenAPI remain in later parts.

M2.4b.1 validation:

- New snapshot/settlement/model/migration unit tests passed `4`; new PostgreSQL repository and independent `0126 → 0127` migration tests passed `2`.
- Existing subscription Checkout, outcome, Billing service, payment-model, and migration unit regression passed `26`; existing Checkout persistence/outcome PostgreSQL regression passed `2`.
- Targeted Ruff lint/format and `ty` passed across all changed API, migration, locale, and test files. API i18n regression passed `8`; Product locale parity passed all `23` namespaces.
- `db:migrate` reported `No changes detected`. `db:upgrade` applied `models.0127_top_up_checkout_snapshot_evidence` successfully to the active database.
- `pnpm api:check` passed API lint and formatting across `1872` files. Broad typecheck remains blocked by the existing `289` unrelated diagnostics, after which Turbo interrupted broad pytest; all focused M2.4b.1 tests remain green.
- Changed-scope Code Review Engine reported zero findings across all `41` rules after adding complete shared/Product `en-US` and `zh-CN` error coverage.
- Final staged GitNexus detection reported `LOW` risk across `14` files and `4` indexed symbols, with no affected execution flow.
- M2.4b.1 and M2.4b.2 are complete; the only active part is M2.4b.3 Stripe top-up Checkout and settlement.

M2.4b.2a implementation evidence:

- Added a provider-neutral `create_top_up_checkout_session` Connector contract carrying the exact Workspace, Offer revision, integer Credits, Provider Price, currency, money micros, customer scope, redirect URLs, and provider idempotency identity.
- The simulated Connector creates one visible deterministic `sim_top_up_cs_*` session identity and redirect URL without payment or commercial-state mutation. Stripe implements the same contract as an explicit `BILLING_TOP_UP_CHECKOUT_NOT_AVAILABLE` boundary until M2.4b.3 and performs no Provider I/O.
- Added `POST /workspaces/{workspaceId}/commerce/top-up-checkout-session` under `workspace:commerce:manage`, with typed public Offer identity and mandatory `Idempotency-Key` forwarding to a dedicated top-up Checkout service.
- The service serializes the provider idempotency scope, replays the stored Checkout before reading mutable catalog state, and fingerprints only stable request facts: Workspace, actor, Offer, Provider, and mode. Later Offer or Price changes therefore cannot reinterpret or block an exact replay.
- First creation locks the Workspace and active actor membership, reads the current published Subscription Revision currency and aligned Credit account, locks the active Offer and exact Provider Price, calls the configured Connector, and persists one complete pending Checkout plus required Activity audit in the same transaction.
- Checkout creation remains non-authoritative: it creates no succeeded transaction, invoice, ledger entry, grant lot, settlement receipt, or Credit balance/revision mutation. Signed Provider settlement remains unavailable until M2.4b.2b.

M2.4b.2a validation:

- Focused Connector, service, route, Billing Job, and settlement-evidence regression passed `57` tests. API i18n regression passed `8`; Product locale parity passed all `23` namespaces.
- Real PostgreSQL validation passed `2` tests covering repository and service concurrency, exact replay after Offer/Price edits, current-currency selection, one pending Checkout/Audit record, inactive Offer rejection before Provider I/O, and unchanged transaction, ledger, lot, Credit balance, reservation, and account Revision state.
- Targeted Ruff lint/format and `ty` passed across all changed API, Connector, and test files. `db:migrate` reported `No changes detected`; `db:upgrade` reported no migrations to apply.
- `pnpm api:check` passed API lint and formatting across `1876` files. Broad typecheck remains blocked by the existing `289` unrelated diagnostics, after which Turbo interrupted broad pytest; all focused M2.4b.2a tests remain green.
- Changed-scope Code Review Engine exited successfully with zero blockers. Its only `2` report-only findings are the known prototype lifecycle reports for the simulated and Stripe Connector plugins, both registered through the canonical Connector `arclayer_register` contract.
- Final staged GitNexus detection reported `LOW` risk across `18` files and `51` indexed symbols, with no affected execution flow.
- M2.4b.2a and M2.4b.2b are complete. The only active part is M2.4b.3 Stripe top-up Checkout and settlement.

M2.4b.2b implementation evidence:

- Added the dedicated signed simulated event `top_up.checkout.outcome`. The simulator command reuses durable `CommerceCheckoutOutcomeCommand` idempotency and actor evidence, signs strict deterministic JSON, and submits only through signature verification, encrypted inbox persistence, pinned Connector Job, and Connector normalization.
- Extended the Provider-neutral Connector contract with top-up settlement normalization. Simulated Billing owns the new event; Stripe explicitly returns no top-up settlement until M2.4b.3. Checkout, subscription, and top-up outcomes remain mutually exclusive for each accepted event.
- Added a dedicated top-up settlement application service and Tortoise repository. Each Provider event is unique within Provider/mode/account scope and retains Checkout, command, transaction, invoice, ledger, lot, payload hash, signature, occurrence time, and settlement-fingerprint evidence.
- Successful settlement atomically completes the Checkout and command, creates one succeeded top-up transaction, one `LEDGER_TOP_UP` Credit ledger entry, one non-expiring purchased top-up lot, advances the Credit account balance/revision, writes required Activity evidence, and creates the immutable settlement application receipt.
- A nullable One-to-One `granted_checkout_session` relation enforces at most one successful Credit grant for a Checkout at the database layer. Transaction, invoice, ledger, lot, and simulated command relations remain nullable so pending/failed/canceled outcomes and the later Stripe path can retain exact non-grant evidence.
- Pending settlement records application/audit evidence without changing Checkout status/revision or commercial balances. Failed and canceled outcomes enter terminal Checkout/command state without transaction, ledger, lot, invoice, refund, or Credit mutation.
- Deterministic simulated transaction identity is derived from the durable Checkout/session rather than the command event, so pending followed by success converges on one Provider transaction identity. Exact command replay returns the existing accepted event; changed payload conflicts; delayed or out-of-order outcomes fail explicitly and cannot grant twice.
- Added the development/test-only Product command `POST /workspaces/{workspaceId}/commerce/top-up-checkout-session/{checkoutSessionId}/outcome` under the existing Commerce management authority. The route does not bypass Provider event acceptance or perform direct settlement mutation.
- Added migration `0128_top_up_settlement_applications` plus unit and real PostgreSQL migration contracts for scoped Provider-event uniqueness, success-Checkout uniqueness, nullable non-grant relations, exact evidence One-to-One relations, and query indexes.
- Added complete shared/Product `zh-CN` and `en-US` error copy for the new settlement boundaries and the shared `LEDGER_TOP_UP` description used by the Product Credit ledger.

M2.4b.2b validation:

- Targeted Ruff lint/format and `ty` passed across all changed API, migration, plugin, and test surfaces. The migration unit contract passed `1` test.
- Focused Connector, Job, evidence, Workspace route, and migration regression passed `31` tests. API i18n regression passed `8` tests.
- Real PostgreSQL validation passed `6` tests in `63.59s`: exact success and Job replay, exact command replay/idempotency conflict, pending then success, failed, canceled, delayed pending after success, and independent `0127 -> 0128` relation/index/nullability migration execution.
- Expanded Commerce regression passed `286` tests with `69` integration-only tests skipped by the non-integration invocation.
- Product locale parity passed all `23` namespaces. Product copy and Credit-ledger tests passed `2`; the broad Product localization-overlay failure passed `3/3` on immediate isolated rerun.
- The active database applied `0128_top_up_settlement_applications`; a subsequent `db:migrate` reported `No changes detected`.
- `pnpm api:check` passed API lint and formatting across `1880` files. Broad typecheck remains blocked by the existing `289` unrelated diagnostics, and Turbo interrupted broad pytest after that failure; every targeted M2.4b.2b check remains green.
- `pnpm app:check` passed Product lint, formatting, and locale parity. Typecheck remains blocked by `test/browser/product-acceptance.spec.ts` importing the missing `../../../../tests/browser/support` module; broad Vitest also observed that collection failure and one nondeterministic localization-overlay failure whose immediate isolated rerun passed.
- Changed-scope Code Review Engine exited successfully with zero blockers. Its only `2` report-only findings are the known prototype lifecycle reports for the simulated and Stripe Connector plugins, both registered through the canonical Connector `arclayer_register` contract.
- Final staged GitNexus detection reported `LOW` risk across `26` files and `106` indexed symbols, with no affected execution flow.
- M2.4b.2 is complete. The only active part is M2.4b.3 real Stripe top-up Checkout and settlement.

M2.4b.3 active boundary:

- M2.4b.3a — Complete — implements only real Stripe top-up Checkout creation through the existing Provider-neutral `TopUpCheckoutService`. Stripe uses one catalog Price, quantity one, `mode = payment`, exact business idempotency, Checkout and PaymentIntent metadata, Provider-hosted success/cancel URLs, and optional customer reuse. The existing service persists the pending Checkout; neither Stripe response nor return URL grants Credits.
- M2.4b.3b — Active — accepts only signature-verified `checkout.session.completed` evidence that identifies a Stripe payment-mode top-up Checkout. Job-time normalization retrieves the complete Provider Checkout/PaymentIntent/invoice evidence when the webhook object is insufficient, then requires exact Checkout/session, Workspace, Offer revision, Price, currency, amount, Credit, payment-status, and Provider account/mode agreement before invoking the existing top-up settlement applicator.
- M2.4b.3c — Pending — closes exact replay, duplicate successful event, partial/unpaid/substituted amount, quantity or Price mismatch, delayed/out-of-order event, test/live/account isolation, Provider retrieval failure, optional invoice, and unchanged subscription Checkout behavior with real PostgreSQL full-chain coverage.
- M2.4b.3 does not add Stripe Connect, connected accounts, stored card fields, Product payment forms, refunds, partial top-ups, multiple successful payments, payment reconciliation, Platform simulator APIs, or any fallback to simulated success.

M2.4b.3a acceptance criteria:

- Validate the stored external Price as a Stripe `price_*` identity before Provider I/O. Use that Price directly; do not create inline `price_data` or reinterpret local money/Credit snapshots.
- Send exact immutable top-up metadata on both the Checkout Session and its PaymentIntent: Workspace, Offer id/revision, integer Credits, external Price, uppercase currency, and amount micros.
- Use `mode = payment`, quantity one, invoice creation, caller success/cancel URLs, and the exact business idempotency key. Reuse the existing Stripe customer when present; otherwise request Provider customer creation explicitly.
- Return only a validated Provider Checkout URL/session/account/expiry. The existing repository remains the sole local pending-Checkout persistence boundary and records the exact local snapshot plus Activity evidence.
- Cover request encoding, customer/no-customer behavior, idempotency, invalid Price rejection before I/O, invalid Provider response, and unchanged subscription Checkout behavior. No webhook normalization or Credit grant belongs in M2.4b.3a.

M2.4b.3a implementation evidence:

- Replaced explicit Stripe top-up unavailability with one catalog-Price Checkout Session request using `mode = payment`, quantity one, invoice creation, and the exact Provider-neutral business idempotency key.
- Sent immutable Workspace, top-up Offer id/revision, integer Credit amount, external Price, uppercase currency, and amount-micros snapshots on both Checkout and PaymentIntent metadata without inline `price_data` or local amount reinterpretation.
- Reused an existing Stripe Customer when available and otherwise requested `customer_creation = always`; kept Provider response validation in the existing Checkout parser and pending persistence in `TopUpCheckoutService`.
- Added exact request-encoding, existing/no-customer, pre-I/O invalid Price, invalid Provider response, and unchanged subscription Checkout regression coverage. No webhook, settlement, transaction, ledger, lot, or Credit path changed.

M2.4b.3a validation:

- Stripe Connector unit regression passed `31` tests; Provider-neutral top-up Checkout service regression passed `2` tests with `1` integration-only test skipped by the non-integration invocation.
- Targeted Ruff lint/format and `ty` passed for the Stripe Connector and its unit tests.
- `pnpm api:check` passed API lint and formatting across `1880` files. Broad typecheck remains blocked by the existing `289` unrelated diagnostics, after which Turbo interrupted broad pytest; every focused M2.4b.3a check remains green.
- Changed-scope Code Review Engine exited successfully with zero blockers. Its only report-only finding is the known Stripe Connector lifecycle prototype report registered through the canonical Connector extension contract.
- Final staged GitNexus detection reported `LOW` risk across `3` files and `24` indexed symbols, with no affected execution flow.
- M2.4b.3a is complete. The only active implementation part is M2.4b.3b accepted Stripe settlement normalization.

M2.4b.3b implementation boundary:

- The existing `BillingProviderTopUpSettlementApplicationService` is the only settlement authority, but its current evidence loader is still simulated-only. M2.4b.3b must remove that provider hard-code rather than introduce a Stripe-specific applicator or direct Credit mutation path.
- Stripe normalization owns Provider evidence only. It accepts a signature-verified `checkout.session.completed` event only when the retrieved Checkout is `mode = payment`, the payment is complete, and the Checkout, PaymentIntent, optional invoice, single line item, Price, quantity, money, currency, and immutable metadata agree exactly.
- Stripe resolves the local immutable Checkout snapshot by Provider/mode/account/external Session identity inside the applicator transaction. Internal Checkout id, actor, and request fingerprint are local evidence and are not trusted from Provider metadata.
- Simulated settlement continues to require its durable outcome command and exact command/event/revision agreement. Stripe has no simulated command; the existing nullable command relation records `null` while the same Checkout, application, transaction, ledger, lot, and Credit uniqueness boundaries remain authoritative.
- The common applicator enriches normalized Stripe facts from the locked local Checkout before fingerprinting and validation, then applies the existing exact-once success transaction. A second successful event for the same Checkout, a reused PaymentIntent, stale Checkout state, or changed event evidence fails reconciliation without another grant.
- Payment-mode top-up Checkout events must normalize to top-up only, while subscription-mode Checkout completion remains unchanged. Unpaid, partially paid, asynchronous-pending, changed Price/quantity/amount/currency/Credits, mismatched mode/account, missing retrieval evidence, or invalid optional invoice facts fail explicitly; they do not normalize to pending success or fall back to simulated behavior.

## Known unrelated repository failures

- API Ruff and format checks now pass after the pre-M1.5b mechanical cleanup; this is no longer a package-gate blocker.
- The existing Provider subscription integration fixture lacks required confirmed transition evidence and fails with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED`.
- Existing broad API type-check failures outside the targeted Commerce/LLM paths remain visible and are not masked. The latest M2.3c package gate reports `290` diagnostics while targeted Commerce type checking passes.
- The M2.4b.2b `pnpm api:check` run reports the same `289` unrelated diagnostics after API lint and formatting pass; Turbo interrupts broad pytest after the typecheck failure.
- The M2.2a `pnpm api:check` run still fails on `294` existing Design System publication and content-route type diagnostics; lint and formatting pass, and Turbo interrupts broad pytest after the typecheck failure.
- Product App typecheck currently fails because `apps/app/test/browser/product-acceptance.spec.ts` imports the missing `tests/browser/support` module outside Commerce work.
- The M2.4b.2b broad Product Vitest run also observed one nondeterministic `preferences-localization-section.test.tsx` overlay failure; its immediate isolated rerun passed `3/3`.
- The M1.5b.4 broad Product Vitest run also observed one nondeterministic `feedback-ticket-dialog.test.tsx` failure; its immediate isolated rerun passed `2/2`.
- The M2.2a broad Product Vitest run observed one nondeterministic `workspace-guidance-view.test.tsx` failure; its immediate isolated rerun passed `5/5`.
- Changed-scope Code Review Engine currently has zero blockers. The latest M2.3b.3c audit reports zero findings across all `41` rules.

## Progress log

### 2026-08-05 — Baseline and M0

- Product decisions and canonical specs updated.
- Credit source/member/payment schema and runtime accounting implemented.
- Migration, concurrency, legacy settlement, and Platform adjustment defects fixed and verified.
- All accumulated worktree changes committed as `c331e4ed`.

### 2026-08-05 — M1 preparation

- Execution record created before M1 code changes.
- Existing Product Commerce router, Workspace authorization, member models, Plan & Usage, People table, OpenAPI clients, and i18n surfaces mapped.
- M1.1 was selected as the only active implementation part.

### 2026-08-05 — M1.1 member limit command foundation

- Completed strict member-limit command/output schemas and explicit unlimited-versus-clear semantics.
- Completed repository/service separation, deterministic locking, Workspace-wide optimistic revision, durable replay receipts, and required Activity evidence.
- Completed and verified migration `0117_workspace_member_credit_command_receipts`.
- Verified `10` unit tests, `5` repository/service integration tests, and `1` real PostgreSQL migration test.
- Advanced the active implementation part to M1.2 Product router contracts and authorization tests.

### 2026-08-05 — M1.2 Product member Usage and limits API

- Completed the four Product Workspace Commerce endpoints with typed Product principal, Workspace context, pagination, and member-Credit read/configuration services.
- Completed Owner/Billing Manager/ordinary-member authorization projections and closed the reachable guest-Owner management bypass in the shared Commerce authority.
- Completed coherent account-period reads, batched effective-limit/Usage projection, explicit unlimited semantics, disabled-member exclusion, and no-create GET behavior.
- Verified `18` authorization/router unit tests and `14` schema plus PostgreSQL configuration/read integration tests; targeted lint, format, and type checks passed.
- Ran the affected package gate: formatting passed; five unrelated Ruff findings caused `pnpm api:check` to fail and Turbo interrupted the remaining broad gates.
- Advanced the active implementation part to M1.3 OpenAPI synchronization and Product API wrappers.

### 2026-08-05 — M1.3 Product OpenAPI and Commerce wrappers

- Regenerated the Product SDK with all four member-Credit routes and preserved concurrent AI thread pinning schema work.
- Added strict Product wrappers for member Usage, limits, default-limit writes, and member override set/clear commands.
- Added wrapper contract coverage for PublicUUID encoding, pagination, AbortSignal forwarding, exact camelCase bodies, body-scoped idempotency, invalid success envelopes, and stable API errors.
- Closed the generated Credit Ledger enum integration gap with bilingual labels for promotional grants, purchased top-ups, and refunds.
- Verified `7` focused Product tests, Product OpenAPI typecheck, App lint/format, and locale parity; the affected package gate remains blocked only by the unrelated missing browser acceptance support module.
- Advanced the active implementation part to M1.4 Plan & Usage default-limit and member Usage surface.

### 2026-08-05 — M1.4 Product Plan & Usage

- Replaced the legacy page with canonical plan, current-period Credit, member Usage, default member-limit, and secondary Credit Ledger surfaces.
- Enforced Owner/superuser management plus the exact entitlement-and-permission boundary for other Billing Managers; ordinary members retain self-only Usage without billing actions.
- Added revision-bound and idempotent default-limit mutation behavior with explicit limited/unlimited semantics, conflict refresh, response-scope validation, and canonical query invalidation.
- Added responsive member Usage presentation, accessible limit controls, raw-ID-safe identity fallbacks, and complete bilingual Commerce copy.
- Verified `23` focused tests plus Product lint, format, locale parity, and OpenAPI typecheck. The affected package gate remains blocked only by the unrelated missing browser acceptance support module.
- Advanced the active implementation part to M1.5 People Usage, per-member overrides, icon-free ChromeTabs, and the canonical Workspace setting entry.

### 2026-08-05 — M1.5a People Usage and ChromeTabs

- Added one paginated canonical member Usage query for the People surface, joined rows by membership ID, and rejected inconsistent pagination instead of silently degrading.
- Added current-period used, reserved, and available Credits to the existing People table while preserving ordinary-member SELF semantics and the responsive horizontal-scroll layout.
- Kept missing projections distinct from real zero Usage and explicit unlimited availability.
- Removed the three People tab icons locally while preserving Radix keyboard activation, active state, invite flows, and the invite-link action icon.
- Verified `23` focused tests plus Product lint, format, locale parity, and OpenAPI typecheck; the package gate remains blocked only by the unrelated missing browser acceptance support module.
- Advanced the active implementation part to M1.5b per-member overrides and the canonical Workspace setting entry.

### 2026-08-05 — M1.5b preparation checkpoint

- Committed the previously accumulated AI thread pinning and grouped-history vertical as `3de7dceb feat(ai): add pinned grouped thread history` before beginning M1.5b.
- Committed the remaining API formatting and Ruff cleanup as `70e0ed9f chore(api): normalize formatting and lint`; API lint and format checks now pass.
- Re-read the approved administration experience, Workspace commercialization, Product UI toolchain, frontend design guideline, and `DESIGN.md` contracts before changing the Product surfaces.
- Split M1.5b into four recoverable execution parts and selected M1.5b.1 as the only active implementation part.
- Confirmed that M1.5b adds no backend route or second policy store: it consumes the M1 APIs completed in M1.2/M1.3 and deep-links Workspace basics to the existing M1.4 default-limit editor.

### 2026-08-05 — M1.5b.1 shared authority and member-limit controller

- Consolidated Commerce management authority, entitlement checks, pagination constants, query keys, conflict recognition, and limit validation into shared Product contracts.
- Added the full manager member-limit snapshot and per-member override controller with strict revision, idempotency, response-scope, effective-precedence, cache update, and conflict-refresh behavior.
- Extended the existing default member-limit controller to the same shared authority and canonical invalidation contract.
- Verified `19` focused tests plus Product lint, format, locale parity, and OpenAPI typecheck. The package gate remains blocked only by the unrelated missing browser acceptance support module.
- Advanced the active implementation part to M1.5b.2 focused per-member override dialog and People row action.

### 2026-08-05 — M1.5b.2 member override dialog and People action

- Added the canonical inherit/limited/unlimited member override dialog and connected it to the revision-bound M1.5b.1 controller.
- Added manager-only actions for active People rows, preserved ordinary-member read-only behavior, and restored Owner self-edit through the existing row menu.
- Kept role assignment, Feature Access, activation, and deactivation as separate actions with their existing authorities.
- Verified `24` focused member-limit tests and `51` expanded Workspace team regression tests plus Product lint, format, locale parity, and OpenAPI typecheck. The package gate remains blocked only by the unrelated missing browser acceptance support module.
- Advanced the active implementation part to M1.5b.3 canonical Workspace settings entry and Plan & Usage focus target.

### 2026-08-05 — M1.5b.3 Workspace settings deep-link

- Added a manager-only Workspace basics summary row that navigates to the existing Plan & Usage default member-limit control.
- Added the single canonical `default-member-credit-limit` section anchor around the existing editor, including scroll, focus, and flash behavior.
- Confirmed that the basics surface adds no second limit form, mutation, query cache, or policy store.
- Verified `19` focused tests plus Product lint, format, locale parity, and OpenAPI typecheck. The package gate remains blocked only by the unrelated missing browser acceptance support module.
- Advanced the active implementation part to M1.5b.4 final validation, execution record, and commit closure.

### 2026-08-05 — M1.5b.4 closure and M2 preparation

- Verified the complete M1.5b Product regression with `70` tests across `18` files and re-ran Product OpenAPI type checking successfully.
- Confirmed the package gate still passes lint, format, and locale parity and remains blocked by the existing browser acceptance support import; recorded the isolated passing rerun for the additional nondeterministic broad-test failure.
- Marked M1 and M4 complete after checking their accepted API, Plan & Usage, People Usage, member-limit, ChromeTab, and Workspace setting boundaries.
- Mapped the existing Stripe connector, typed registry, Stripe-specific configuration/readiness assumptions, durable encrypted webhook inbox, pinned Job application pipeline, and currently unpopulated payment projection models.
- Split M2 into six recoverable implementation parts and selected M2.1 provider contract, environment gate, and readiness foundation as the only active part before changing code.

### 2026-08-05 — M2.1 simulated Provider foundation

- Added the development/test-only Billing Provider gate and dedicated simulated signing configuration, including explicit production rejection.
- Registered `billing.simulated` as a separate official Connector and kept all Checkout, Portal, and lifecycle application paths explicitly unavailable until their durable M2.2/M2.3 implementations exist.
- Made Provider readiness and webhook enablement Provider-neutral without weakening Stripe credentials or signature requirements.
- Fixed the stable Stripe webhook route to resolve only `billing.stripe`; it cannot dispatch to the active simulated Provider.
- Verified `32` focused M2.1 tests and `23` Stripe/Billing regressions, plus targeted Ruff and `ty`; recorded the existing broad API typecheck blockers without adding fallback behavior.
- Advanced the only active implementation part to M2.2 durable simulated checkout and explicit outcome command.

### 2026-08-05 — M2.2a durable simulated checkout

- Persisted exact simulated Checkout evidence with actor-scoped idempotency, PostgreSQL serialization, replay/conflict semantics, Provider account/session identity, pinned Plan Revision Price, and explicit 30-minute expiry.
- Kept all newly created sessions in `pending`; neither Checkout creation nor redirect return mutates Subscription, access, payment projections, or Credits.
- Preserved Stripe Checkout, Portal, and webhook behavior while adding required Plan code and Revision metadata, and added explicit Product `Idempotency-Key` handling.
- Verified `32` focused unit tests, `33` Billing/Stripe/Job/router regressions, `2` PostgreSQL integration tests, `11` Product checkout tests, `5` isolated Workspace guidance tests, targeted API static checks, Product OpenAPI generation/typecheck, lint, format, and locale parity.
- Recorded the existing broad API typecheck and Product browser-support import blockers without fallback behavior. Final staged GitNexus risk is `LOW` with no affected execution flow; changed-scope Code Review Engine has zero blocking findings and only the two known Connector lifecycle prototype reports.
- Advanced the only active implementation part to M2.2b explicit simulated checkout outcome command.

### 2026-08-05 — M2.2b explicit simulated checkout outcomes

- Added the authorized development/test-only Checkout outcome command with durable idempotency evidence, strict optimistic revision, deterministic signed event bytes, and explicit pending/succeeded/failed/canceled behavior.
- Applied outcomes only through the canonical Provider acceptance -> encrypted inbox -> pinned Job -> Connector normalization -> fenced Checkout application chain; no Subscription, access, payment projection, or Credit mutation occurs in this part.
- Repaired the latent Tortoise projected migration state mismatch with a reviewed database-no-op app-state snapshot and separated the new command model into migration `0121`; a clean migration generation now reports no changes.
- Verified `43` focused unit tests and `2` real PostgreSQL integration tests, targeted static checks, Product OpenAPI generation/typecheck, and locale parity. API lint/format pass; the broad gate retains the same `294` unrelated type diagnostics.
- Changed-scope review has zero blocking findings and only the two known Connector lifecycle prototype reports. Advanced the only active implementation part to M2.3a simulated subscription lifecycle event contract and application baseline.

### 2026-08-05 — M2.3a.1 simulated subscription lifecycle baseline

- Added the strict `subscription.lifecycle` simulated Provider event with exact Plan/Revision/Price, Provider identity, status, and period facts while preserving the existing Checkout event and unchanged Stripe ownership.
- Proved the event through signature verification, encrypted inbox, pinned Job, Connector normalization, same-Revision Subscription application, durable Provider application evidence, duplicate replay, and stale-period rejection.
- Kept Revision rebinding, dunning/access transitions, Credit grants, transaction/invoice/refund projection, and simulator API work outside this slice.
- Verified `7` simulated Connector tests, `29` Connector/Job regressions, `2` PostgreSQL full-chain regressions, and targeted Ruff/format/`ty` checks.
- Changed-scope review has zero blocking findings and only the known simulated Connector lifecycle prototype report.
- Final staged GitNexus risk is `LOW` with no affected execution flow.
- Advanced the only active implementation part to M2.3a.2 completed-Checkout activation evidence and Revision rebinding.

### 2026-08-05 — M2.3a.2 completed Checkout activation and Revision rebinding

- Added exact completed-Checkout authority evidence and persisted it on Provider event application records through migration `0122`.
- Restricted Revision rebinding to confirmed Provider transitions or exact completed Checkout activations, while retaining mandatory Plan Access Convergence for access-reducing targets.
- Added recoverable reconciliation retry semantics, exact actor/session/outcome/event ordering checks, duplicate replay behavior, and `WorkspaceSubscription.revision` advancement.
- Verified `45` unit tests, `15` PostgreSQL integration tests, targeted lint/format/type checks, active database migration state, and zero changed-scope Code Review Engine blockers.
- Recorded the unchanged legacy Stripe fixture failure rather than adding a fallback or weakening Subscription authority.
- Advanced the only active implementation part to M2.3b dunning and restricted-access projection.

### 2026-08-05 — M2.3b.1 strict simulated dunning baseline

- Added the closed simulated `payment_failure | final_unpaid` contract and projected signed dunning evidence through the canonical Subscription and access-state chain.
- Proved Payment Grace and Payment Restricted transitions with immutable notification/Hosting handoffs, stable Plan/Credit Revision bindings, and optimistic access revision advancement.
- Fixed Hosting handoff state serialization exposed by the first real restricted-access projection.
- Verified `51` focused unit tests, `14` PostgreSQL integration tests, targeted static checks, and zero changed-scope Code Review Engine blockers.
- Advanced the only active implementation part to M2.3b.2 Provider-aware policy enforcement and dunning ordering.

### 2026-08-05 — M2.3b.2 Provider-aware policy and ordering

- Added strict Provider/mode Dunning Policy resolution and kept policy failure inside the atomic Provider application transaction.
- Persisted exact Provider account/event, Subscription Revision, Provider period boundaries, occurrence time, resulting access revision, and policy revision on immutable transitions; replay no longer reads mutable current Subscription facts.
- Added explicit duplicate, stale, repeat, and regression convergence, including recovered-period and delayed-older-period protection without extending the original Grace deadline.
- Rebuilt migration `0123` with legacy M2.3b.1 evidence backfill, ambiguity rejection, non-null snapshot enforcement, scoped uniqueness, canonical Subscription-before-access locks, and database-level transition update rejection.
- Verified `37` focused access/policy tests, `33` Connector/Job regressions, `17` PostgreSQL lifecycle tests, `1` PostgreSQL migration test, targeted static checks, final database upgrade, and zero migration drift.
- Recorded the existing `289` broad API type diagnostics and `25` report-only Code Review Engine localization findings without suppression or fallback.
- Advanced the only active implementation part to M2.3b.3 Restricted Recovery denial projection and closure.

### 2026-08-05 — M2.3b.3a Payment Grace metered denial

- Added an explicit Payment Grace recovery-required error with the durable recovery deadline while preserving ordinary content editing during the Grace window.
- Projected the same denial into the common permanent Job terminal contract so Agent, retry, and scheduled Job execution cannot bypass the payment state.
- Verified `46` focused tests, targeted Ruff/format/`ty`, and Product locale parity across `23` namespaces.
- Split the remaining closure into Product API/automation matrix work followed by withheld-period Credit and immutable handoff database evidence; selected M2.3b.3b as the only active part.

### 2026-08-05 — M2.3b.3b.1 Product HTTP command matrix

- Closed the reachable Product HTTP mutation matrix across storage, AI runtime, legacy Agent, API-key, database, environment, Automation configuration, Knowledge, Skill, and Design System routes.
- Classified new external-cost dispatch as metered while retaining ordinary content mutation during Grace and preserving reducing/recovery actions without a commercial blocker.
- Verified the exact route matrix with `5` tests plus targeted Ruff/format/`ty` checks and a zero-blocker changed-scope review.
- Advanced the only active implementation part to M2.3b.3b.2 event-driven Automation execution preflight.

### 2026-08-05 — M2.3b.3b.2 Automation execution preflight

- Injected the canonical Restricted Recovery policy into the event-driven Automation runtime and made missing authorization fail explicitly.
- Pre-authorized every distinct operation effect before run creation or operation dispatch, including mixed read/content/metered flows and unknown-operation rejection.
- Verified `44` combined Restricted Recovery/route/Automation tests, `20` final Automation tests, `8` core i18n tests, targeted static checks, and a zero-blocker changed-scope review.
- Recorded the unchanged `289` broad API type diagnostics and selected M2.3b.3b.3 remaining reachable Site mutation closure as the only active part.

### 2026-08-05 — M2.3b.3b.3 reachable Site mutation closure

- Added canonical Workspace commercial-effect resolution to the reachable Site settings and preview-token mutations.
- Preserved preview-token validation before the settings write authorization, classified settings as content mutation, and classified token issuance as access expansion.
- Proved through Product composition tests that the legacy Site pattern routers are unreachable and excluded them from the denial matrix without manufacturing coverage.
- Verified `13` focused Site tests, `52` expanded Restricted Recovery/Automation/Site regressions, targeted Ruff/format/`ty`, and a zero-finding changed-scope review.
- Completed M2.3b.3b and selected M2.3b.3c withheld period Credits and immutable handoff evidence as the only active part.

### 2026-08-05 — M2.3b.3c withheld Credits and immutable access facts

- Proved through the signed Provider dunning chain that neither `past_due` nor `final_unpaid` creates Plan Credit lots or period-grant ledger entries, while the Credit balance remains unchanged.
- Added `0124_commercial_access_fact_immutability` so committed lifecycle-notification and Hosting-handoff facts reject database UPDATE operations.
- Verified the immutable trigger does not block the existing Workspace `ON DELETE CASCADE` lifecycle.
- Applied `0124` to the active database and confirmed `db:migrate` reports no model-state changes.
- Verified `1` migration unit test, `2` focused PostgreSQL tests, `34` access-state unit tests, `19` expanded Provider/migration integration tests, targeted static checks, and a zero-finding changed-scope review.
- Recorded the unchanged `289` broad API type diagnostics and completed M2.3b; selected M2.3c recovery, renewal, and closure as the only active part.

### 2026-08-05 — M2.3c recovery, renewal, and exact Provider-period Credits

- Hard-cut the unused recovery decision branch and introduced durable exact-once Provider-period grant receipts linked to Provider application, Plan Revision, ledger, and lot evidence.
- Completed signed recovery through the canonical access-state transaction, including immutable notification/Hosting handoffs, exact withheld-period Credit restoration, duplicate convergence, and same-period failure regression protection.
- Completed activation and renewal grant reasons, periodic Plan-lot expiration with mutation/ledger evidence, purchased top-up preservation, delayed-event rejection, reservation-safe rollback, and Revision-once grant behavior.
- Added and applied `0125_commerce_plan_period_grants`, verified its PostgreSQL FK/unique/index contract, and confirmed migration generation has no remaining drift.
- Verified `43` focused unit tests and `20` PostgreSQL lifecycle/Provider/migration tests plus targeted lint, format, type, and Product locale checks. The package gate retains the existing `290` unrelated type diagnostics.
- Changed-scope review completed with zero blockers; staged GitNexus detection reported `LOW` risk and no affected execution flow.
- Completed M2.3 and selected M2.4 transaction, invoice, top-up, and refund projection as the only active part.

### 2026-08-05 — M2.4a.1 Provider-neutral simulated payment projection

- Added canonical invoice and transaction projection inside the atomic Provider application transaction, with exact Workspace/Subscription/Revision/Provider identity and durable payload, signature, and payment-fingerprint evidence.
- Routed simulated payment facts through signature verification, encrypted inbox, pinned Job, normalization, Provider application, current projections, and durable event snapshots; exact replay and delayed-event convergence remain explicit.
- Added and applied `0126_commerce_provider_payment_projections`, confirmed no pending upgrade and no generated migration drift, and removed one obsolete private-method test rather than restoring dead compatibility.
- Corrected transaction update ordering to use Provider event time and covered pending-to-succeeded advancement with a focused regression.
- Verified `36` focused unit/Connector/Job/migration tests, `15` PostgreSQL lifecycle/migration tests, targeted lint/format/type checks, and a zero-blocker changed-scope review. The package gate retains `289` unrelated broad type diagnostics.
- Completed M2.4a.1 and selected M2.4a.2 real Stripe invoice normalization and projection as the only active part.

### 2026-08-05 — M2.4a.2 Stripe invoice and InvoicePayment projection

- Added strict Stripe invoice and InvoicePayment normalization with exact `inpay_*` identities, allocation-to-Invoice ownership, complete expanded payment collections, event/status invariants, overpayment semantics, and integer currency scaling.
- Added allocation-native `invoice_payment.paid` handling through accepted Job-time Invoice expansion while retaining existing invoice lifecycle, dunning, signature, encrypted inbox, and pinned Connector boundaries.
- Preserved payment-only partial projection/replay without Subscription, access, or Credit advancement; later paid Invoice convergence advances the existing Invoice, records all allocations, and grants period Credits exactly once.
- Restored strict Checkout activation period authority while keeping ordinary Stripe invoice periods independent from Subscription current periods, and translated simulated normalized-contract failures to the stable invalid-webhook boundary.
- Verified `50` focused unit tests, `1` Stripe PostgreSQL full-chain test, `19` Provider application/simulated lifecycle PostgreSQL tests, targeted static checks, no migration drift, no pending database upgrade, and zero changed-scope review blockers.
- Recorded the unchanged legacy unauthorized Revision-rebind failure and existing `289` broad API type diagnostics without weakening authority or adding a fallback.
- Completed M2.4a.2 and selected M2.4b purchased top-up, refund, and payment reconciliation as the only active part.

### 2026-08-05 — M2.4b.0 top-up and refund contract freeze

- Fixed deterministic Credit consumption and generic reversal ordering while requiring Provider refunds to target only the exact purchased lot linked to the original top-up transaction.
- Required immutable top-up Checkout snapshots and one exact signature-verified settlement before transaction, ledger, or non-expiring purchased-lot creation; Checkout creation and return URLs remain non-authoritative.
- Limited the initial refund workflow to one full refund of a succeeded top-up transaction, with a durable pre-Provider Credit hold, confirmed success consumption, and explicit failure/cancellation release.
- Defined mismatched or consequence-impossible Provider refund facts as reconciliation required without fabricated success, negative Credits, or reversal of unrelated lots.
- Kept payment reconciliation distinct from Subscription Commercial Correction, Commerce/Hosting Domain State Correction, and Platform Credit adjustment.
- Split implementation into M2.4b.1 Checkout snapshot/evidence, M2.4b.2 simulated settlement, M2.4b.3 Stripe settlement, M2.4b.4 confirmed full refund, and M2.4b.5 reconciliation/closure; selected M2.4b.1 as the only active part.

### 2026-08-05 — M2.4b.1 immutable top-up Checkout snapshot and settlement evidence

- Added provider-neutral durable top-up Checkout persistence with exact Offer revision, Credits, Price, money, Workspace, actor, Provider scope, expiry, idempotency, and fingerprint snapshots.
- Serialized new Checkout creation against the active Offer and exact Provider Price, rejected stale selections and changed idempotency payloads, and preserved original replay evidence after catalog edits.
- Added strict normalized settlement evidence and exact Checkout correlation without activating a simulated/Stripe payment or granting Credits in this foundation slice.
- Added and applied `0127_top_up_checkout_snapshot_evidence`, hardened subscription/top-up target shapes, and confirmed migration generation has no model-state drift.
- Verified `30` focused unit/regression tests, `4` PostgreSQL tests, `8` API i18n tests, Product locale parity, targeted static checks, and a zero-finding changed-scope review. The package gate retains the existing `289` unrelated type diagnostics.
- Completed M2.4b.1 and selected M2.4b.2 simulated top-up settlement and exact Credit grant as the only active part.

### 2026-08-06 — M2.4b.2a simulated top-up Checkout creation chain

- Added the provider-neutral top-up Checkout Connector contract, deterministic simulated session creation, explicit pre-M2.4b.3 Stripe unavailability, dedicated Product service, and the canonical `POST /workspaces/{workspaceId}/commerce/top-up-checkout-session` route.
- Serialized exact replay before mutable catalog reads, pinned current-currency Offer/Price and actor/Workspace evidence, and persisted one pending Checkout without transaction, invoice, ledger, lot, settlement, or Credit mutation.
- Verified `57` focused unit/regression tests, `2` PostgreSQL concurrency/full-chain tests, `8` API i18n tests, Product locale parity, targeted static checks, no migration drift, zero changed-scope review blockers, and a LOW-risk GitNexus pre-commit audit. The package gate retains the existing `289` unrelated type diagnostics.
- Completed M2.4b.2a and selected M2.4b.2b signed simulated settlement and exact-once transaction/ledger/lot grant as the only active part.

### 2026-08-06 — M2.4b.2b signed simulated settlement and exact Credit grant

- Added the strict signed `top_up.checkout.outcome` chain through simulated command, signature verification, encrypted inbox, pinned Connector Job, top-up normalization, and the dedicated atomic settlement application service.
- Completed exact-once success projection for Checkout/command, top-up transaction, `LEDGER_TOP_UP` entry, non-expiring purchased lot, Credit balance/revision, immutable application receipt, and required Activity audit.
- Preserved explicit pending, failed, canceled, replay, conflict, delayed, and out-of-order behavior without direct Provider-event bypass, Stripe impersonation, or a fabricated success path.
- Added and applied `0128_top_up_settlement_applications`, verified its PostgreSQL uniqueness/nullability/index contract, and confirmed migration generation has no remaining drift.
- Verified `31` focused tests, `6` PostgreSQL full-chain/migration tests, `286` expanded Commerce tests, API/Product i18n, Product Credit-ledger rendering, targeted static checks, zero changed-scope blockers, and a LOW-risk staged GitNexus audit.
- Completed M2.4b.2 and selected M2.4b.3 Stripe top-up Checkout and settlement as the only active part.

### 2026-08-06 — M2.4b.3a real Stripe top-up Checkout creation

- Added exact Stripe payment-mode Checkout creation for one configured top-up Price with quantity one, invoice creation, immutable Checkout/PaymentIntent metadata, and the Provider-neutral business idempotency key.
- Preserved existing Customer reuse and explicitly requested Stripe Customer creation when no Customer exists; retained the existing validated Checkout response and pending persistence boundaries.
- Proved exact form encoding, absence of inline Price data, customer/no-customer behavior, invalid Price rejection before Provider I/O, invalid Provider response, and unchanged subscription Checkout behavior.
- Verified `31` Stripe Connector tests, `2` Provider-neutral service tests, targeted Ruff/format/`ty`, and API package lint/format. The package gate retains the existing `289` unrelated type diagnostics and interrupted broad pytest.
- Completed changed-scope review with zero blockers and only the known Stripe Connector lifecycle prototype report.
- Final staged GitNexus detection reported `LOW` risk across `3` files and `24` indexed symbols, with no affected execution flow.
- Completed M2.4b.3a and selected M2.4b.3b accepted Stripe settlement normalization as the only active implementation part.

### 2026-08-06 — M2.4b.3b real Stripe settlement normalization and exact grant

- Added strict Stripe `checkout.session.completed` normalization for payment-mode top-up Checkouts. The Job-time Connector GET expands `line_items.data.price`, `payment_intent`, and `invoice`, then verifies event/Checkout identity, test/live mode, Provider account, exact immutable metadata, one line item, quantity one, catalog Price/currency, amount micros, succeeded PaymentIntent, amount received, PaymentIntent metadata, and optional paid Invoice evidence.
- Payment-mode Checkout events now return `None` from subscription normalization, preserving subscription Checkout behavior while making the Job's three outcomes mutually exclusive. Retrieval failures remain Provider failures; malformed, unpaid, partial, substituted, or mismatched facts fail with `BILLING_WEBHOOK_PAYLOAD_INVALID`.
- Refactored top-up settlement application into one Provider-neutral authority. Simulated settlements still require and revise their durable outcome command; Stripe settlements resolve and lock the local immutable Checkout snapshot by Provider/mode/account/external session, keep `outcome_command_id = NULL`, and share the exact-once Checkout, transaction, optional Invoice, `LEDGER_TOP_UP`, non-expiring purchased lot, Credit revision, application receipt, and Activity evidence path.
- Repository settlement writes preserve command-less Stripe revision checks and add exact external-session snapshot locking. Provider-local Checkout UUID, actor, and request fingerprint are filled only from the locked local snapshot; Provider metadata is never trusted for those internal fields.
- Added Stripe normalization regressions for payment-mode recognition, subscription exclusion, exact expansion/metadata/line-item/PaymentIntent/Invoice evidence, and unpaid rejection while retaining all existing Stripe subscription and invoice tests.
- Focused validation: Stripe Connector `34 passed`; Billing Event Job Handler `9 passed`; top-up settlement evidence `2 passed`; targeted Ruff check/format and `ty` all passed.
- Advanced the only active implementation part to M2.4b.3c Stripe full-chain, replay, ordering, and closure. The remaining boundary intentionally excludes refunds, partial top-ups, reconciliation closure, Connect, and Product payment-form work.

### 2026-08-06 — M2.4b.3c Stripe full-chain, replay, ordering, and closure

- Added a real PostgreSQL integration path for a signed Stripe payment-mode top-up Checkout from webhook acceptance through encrypted inbox, Job-time Provider retrieval, Provider-neutral settlement application, transaction, Invoice, `LEDGER_TOP_UP`, non-expiring purchased lot, Credit balance, and application receipt.
- The integration path verifies the exact Stripe expansion contract (`line_items.data.price`, `payment_intent`, `invoice`), successful settlement with `outcome_command_id = NULL`, same-event replay without a second grant, and a distinct second successful Provider event for the same Checkout being permanently rejected without balance or transaction mutation.
- Existing Stripe subscription and invoice projection integration behavior remains covered; the new full-chain test runs with `RUN_INTEGRATION_TESTS=1` and passed (`2 passed`). Default focused execution remains explicit and skips integration tests when the flag is absent (`2 skipped`).
- Targeted Ruff check/format and `ty` passed. M2.4b.3c is complete; the only active implementation part is now M2.4b.4 full top-up refund hold and Provider-confirmed reversal.

### 2026-08-06 — M2.4b.4 full top-up refund hold and Provider-confirmed reversal

- Added Provider-neutral refund request and application authority for one succeeded `top_up` transaction only. A pending request locks the exact purchased lot, reserves the full integer Credit consequence, and records a durable `LEDGER_REFUND_HOLD`; no local refund completion occurs from request acceptance or Provider API response.
- Added Stripe refund creation against the original PaymentIntent with exact amount/currency and idempotency, plus strict signed `refund.updated` and `charge.refunded` terminal normalization. Pending Provider refund states remain non-authoritative; malformed or multi-refund event shapes fail explicitly.
- Wired refund outcomes into the existing billing event Job as a fourth mutually-exclusive Provider outcome. Confirmed success consumes only the held purchased lot, appends `LEDGER_REFUND` and a linked `CreditLotMutationKind.REFUND`, marks the transaction/invoice/refund projections refunded, and writes Activity evidence. Failed or canceled outcomes release the exact hold through a durable release ledger entry; impossible or mismatched consequences require reconciliation and do not create negative Credits.
- Added Stripe unit coverage for refund request encoding, terminal normalization, partial/multi-refund shape rejection, registration, and PostgreSQL full-chain top-up refund success/replay. Focused validation: `48 passed, 2 skipped` with integration disabled and `2 passed` with `RUN_INTEGRATION_TESTS=1`; targeted Ruff/format/`ty` passed.
- M2.4b.4 is complete. The only active implementation part is now M2.4b.5 payment reconciliation/correction and M2.4 closure.
