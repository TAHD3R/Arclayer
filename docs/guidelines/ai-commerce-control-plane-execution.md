# AI and Commerce Control Plane Rebuild — Execution Guide

Last updated: 2026-08-05

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
| M1 Member limits and Usage API | In progress | Default policy CRUD, per-member override CRUD, manager/all-member and self-only Usage reads, revision/idempotency/permissions |
| M2 Simulated Billing Provider | Pending | Development/test gate, signed webhook, inbox/Job/application projections, checkout/payment/refund lifecycle |
| M3 Platform Billing redesign | Pending | Replace legacy `/billing/*` pages with complete CRUD and Operational Ledger layouts |
| M4 Product Plan & Usage / People | Pending | New Plan & Usage, People Usage column, member limits, icon-free ChromeTabs, Workspace setting |
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

Status: In progress

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
5. M1.5 People Usage column and per-member override dialog. — In progress (`M1.5b` Active)

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
2. M1.5b Per-member override dialog and canonical Workspace setting entry. — Active

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
4. M1.5b.4 validation, execution-record update, and focused commit. — Active
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

## Known unrelated repository failures

- API Ruff and format checks now pass after the pre-M1.5b mechanical cleanup; this is no longer a package-gate blocker.
- The existing Provider subscription integration fixture lacks required confirmed transition evidence and fails with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED`.
- Existing broad API type-check failures outside the targeted Commerce/LLM paths remain visible and are not masked.
- Product App typecheck and broad Vitest currently fail because `apps/app/test/browser/product-acceptance.spec.ts` imports the missing `tests/browser/support` module outside M1.4.
- Changed-scope Code Review Engine currently reports prototype findings in unrelated Workspace, Platform Site Delivery, Platform Identity, Knowledge, Skills, Feedback, and AI files present in the shared worktree; M1.2 files have no remaining finding.

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
