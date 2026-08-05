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
4. M1.4 Plan & Usage default-limit/usage surface. — Active
5. M1.5 People Usage column and per-member override dialog.

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

M1.4 active boundary:

- Replace the current `apps/app/src/pages/workspaces/settings/workspace/plan-usage/plan-usage-view.tsx` composition with the approved Operational Ledger layout using canonical shadcn and shared `@arclayer/ui` primitives.
- Present current plan, current-period Workspace Credit state, member Usage, and the Credit ledger from canonical Product Commerce APIs without duplicated estimates.
- Add an Owner/Billing Manager default member-limit editor with explicit limited versus unlimited choices, optimistic revision, body-scoped idempotency, visible loading/error/conflict states, and query invalidation after success.
- Ordinary members receive their self-only Usage projection and no management controls. M1.4 does not add the People table Usage column or per-member override dialog; those remain M1.5.
- Keep plan selection, checkout, and customer-portal actions on their real Commerce paths. Do not introduce simulated success behavior in the Product Application.
- Add stable `zh-CN` and `en-US` copy plus focused view/controller tests for loading, empty, limited, unlimited, permission, mutation, revision-conflict, and responsive presentation states.

## Known unrelated repository failures

- API Ruff currently reports five existing import-order/type-annotation findings in Jobs, Notifications, Design Systems publication, Platform Jobs composition, and a Workspace team notification test outside M1.2.
- API format check currently passes all `1843` files.
- The existing Provider subscription integration fixture lacks required confirmed transition evidence and fails with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED`.
- Existing broad API type-check failures outside the targeted Commerce/LLM paths remain visible and are not masked.
- Product App typecheck and broad Vitest currently fail because `apps/app/test/browser/product-acceptance.spec.ts` imports the missing `tests/browser/support` module outside M1.3.
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
