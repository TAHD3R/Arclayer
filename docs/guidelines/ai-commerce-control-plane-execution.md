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
- Usage reads current period reserved, committed, available allowance, and append-only event attribution without reconstructing identity from mutable membership data.

Active implementation parts:

1. M1.1 schemas, repository/service, receipts, and migration extension.
2. M1.2 Product router contracts and authorization tests.
3. M1.3 OpenAPI synchronization and Product API wrappers.
4. M1.4 Plan & Usage default-limit/usage surface.
5. M1.5 People Usage column and per-member override dialog.

M1.1 acceptance criteria:

- Transactionally lock policy/override scope before revision and receipt evaluation.
- Validate active membership and Workspace ownership of every target.
- Preserve explicit unlimited versus inherited default.
- Do not reset or rewrite Usage when a limit changes.
- Cover replay, conflict, stale revision, concurrent requests, Owner self-override, and invalid limit shapes.

## Known unrelated repository failures

- API Ruff currently reports existing import-order/type-annotation findings in Jobs, Notifications, Design Systems publication, and a Workspace notification test.
- The existing Provider subscription integration fixture lacks required confirmed transition evidence and fails with `SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED`.
- Existing broad API type-check failures outside the targeted Commerce/LLM paths remain visible and are not masked.

## Progress log

### 2026-08-05 — Baseline and M0

- Product decisions and canonical specs updated.
- Credit source/member/payment schema and runtime accounting implemented.
- Migration, concurrency, legacy settlement, and Platform adjustment defects fixed and verified.
- All accumulated worktree changes committed as `c331e4ed`.

### 2026-08-05 — M1 preparation

- Execution record created before M1 code changes.
- Existing Product Commerce router, Workspace authorization, member models, Plan & Usage, People table, OpenAPI clients, and i18n surfaces mapped.
- M1.1 is the only active implementation part.
