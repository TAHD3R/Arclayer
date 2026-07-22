# Admin Control Plane Spec Audit — 2026-07-22

Scope: `admin-control-plane-rollout.md` and its five domain contracts
Method: independent second-pass review against the user requirements, live repository evidence, existing canonical specs, and the product UI toolchain
Result: Pass after revision

## 1. Audit criteria

The audit checked:

1. traceability of all 17 user requirement groups;
2. conflicts with existing canonical feedback, observability, plugin, notification, job, commerce, identity, permission, error, and UI-toolchain specs;
3. backend model/API/job feasibility and ownership;
4. migration, cache, concurrency, authorization, and idempotency completeness;
5. loading/empty/error/partial/conflict/offline state coverage;
6. accessibility, responsive layout, large-data performance, and exact-value alternatives;
7. objective acceptance criteria and staged repository verification.

Severity definitions:

- Critical: unsafe or impossible contract, missing authorization boundary, or contradictory source of truth that blocks implementation.
- Major: material ambiguity or missing contract likely to cause divergent implementations.
- Minor: editorial or non-blocking precision improvement.

## 2. Findings and revisions

| Id | Severity | Finding | Revision | Status |
|---|---|---|---|---|
| A-01 | Major | Existing UI toolchain named Recharts while the rollout required Bklit-backed charts. | Updated `product-ui-toolchain.md`, added a hard shared `@arclayer/ui/chart` boundary, and updated `feedback-observability.md`. | Resolved |
| A-02 | Major | Access restriction HTTP status was left as `403` or `423`. | Selected canonical `403` and fixed stable error codes for all four restriction types; unauthenticated sessions remain `401`. | Resolved |
| A-03 | Major | Request-record performance said only “modest” pagination and left infinite accumulation open. | Fixed default page size to 20, shared 10/20/50/100 choices, replacement pagination, and mandatory virtualization for any future accumulated cursor view. | Resolved |
| A-04 | Major | Campaign and email-template behavior lacked exact route ownership and left the synchronous broadcast endpoint coexistence ambiguous. | Added canonical endpoint tables and hard removal of `POST /system/notifications/broadcasts` after caller migration; aggregate mail response is an explicit hard cut. | Resolved |
| A-05 | Major | Permission catalog refresh allowed an unspecified “equivalent” protocol. | Selected HTTP `ETag`, `If-None-Match`, and `304 Not Modified`. | Resolved |
| A-06 | Major | Feedback intents and list parameter names were not fixed for every source. | Fixed four intents for general entry points, locked ContentGuard to `problem`, aligned query names, and added batch API/result semantics. | Resolved |
| A-07 | Major | Responsive layout requirements did not enumerate every affected surface, and Observability Activity could duplicate Audit Log Events. | Enumerated Audit, focused Observability, and Dashboard widgets; defined Activity as aggregate analysis with Audit Log as raw-event authority. | Resolved |

No Critical findings remained. No unresolved Major findings remained.

## 3. Requirement traceability result

| Group | Result | Evidence owner |
|---|---|---|
| 1 | Covered | Feedback/support section 4 |
| 2, 2.1, 2.2, 2.3 | Covered | Feedback/support sections 5-13 |
| 3, 3.1, 3.2, 3.3, 3.4 | Covered | Observability/dashboard sections 4-9 and 17 |
| 4 | Covered | Observability/dashboard section 10 |
| 5 | Covered | Observability/dashboard section 11 |
| 6 | Covered | Observability/dashboard section 12 plus product UI toolchain |
| 7 | Covered | Plugin/notification/mail sections 4-8 |
| 8 | Covered | Plugin/notification/mail sections 9-14 |
| 9 | Covered | Plugin/notification/mail sections 15-18 |
| 10 | Covered | Tenant governance sections 4-6 |
| 11 | Covered | Tenant governance section 7 |
| 12 | Covered | Tenant governance section 8 |
| 13 | Covered | Tenant governance section 5 |
| 14 | Covered | Tenant governance sections 10-14 |
| 15 | Covered | Observability/dashboard sections 13-14 |
| 16 | Covered | Invitation/permission sections 4-9 |
| 17 | Covered | Invitation/permission sections 10-14 |

Coverage score: 17/17 groups, including every numbered sub-requirement.

## 4. Canonical ownership result

- The rollout overview owns sequencing, shared UX rules, security baseline, migration rules, and Definition of Done.
- Each domain contract owns its model/API/frontend/state/test decisions without duplicating another domain's business authority.
- Commerce calculations remain in `workspace-commercialization.md`.
- Stable errors remain governed by `error-contracts.md`; this rollout selects domain codes within that shape.
- Conditional grants remain governed by `conditional-permissions.md`.
- Jobs remain governed by `background-jobs.md`; this rollout declares which operations require them.
- Chart imports remain governed by `product-ui-toolchain.md`, now aligned with the Bklit-backed shared implementation.
- `feedback-observability.md` explicitly delegates the superseded Admin taxonomy, raw-request percentile, chart, and information-architecture portions.

No competing frontend-derived business calculation, page-local transport shape, or silent fallback is authorized.

## 5. Feasibility and dependency result

- `react-grid-layout` 2.2.3 supports the repository's React peer range and supplies responsive drag/resize/collision behavior. Installation remains an implementation-wave mutation.
- Bklit is a shadcn Registry source rather than an npm runtime package. The contract therefore vendors reviewed source behind `packages/ui`, adapts motion/tokens/accessibility, and blocks rather than silently falling back if the alpha Visx dependency cannot pass gates.
- Existing feedback lifecycle, raw request records, P95/P99 SQL, plugin manifest metadata, notification presentations, email locale storage, commerce service, invitation token flow, and permission catalog provide a feasible starting point.
- Required new persisted models are explicit for plugin installations/operations, notification campaigns/deliveries, richer request diagnostics, and access restrictions.

## 6. State, security, and migration result

All domain specs cover cache reconciliation, revision conflict, idempotency, partial failure, authorization, audit, safe metadata, migration/backfill or hard cut, bilingual i18n, keyboard/focus interaction, responsive behavior, and targeted tests.

The following security boundaries are explicit:

- request/feedback diagnostics exclude bodies, credentials, cookies, authorization headers, and secret query values;
- notification media uses Asset ids and actions use typed internal targets or allowlisted HTTPS URLs;
- plugin packages require integrity, provenance, compatibility, and permission review;
- invitation tokens are one-time-visible and absent from persistent list/audit projections;
- disabled-state Dialogs are presentation only, while direct API enforcement remains authoritative.

## 7. Validation evidence

- `git diff --check` passed for the new and revised spec files.
- Relative sibling links in the rollout/domain contracts resolve to existing files.
- The changed-scope code-review engine completed with no blocking finding. Its 74 report-only prototype findings belong to the already-dirty parallel worktree and did not identify a documentation-specific violation in this spec set.
- No business implementation, generated route tree, dependency manifest, lockfile, or runtime model was changed during the spec phase.
- GitNexus discovery was attempted but returned `Transport closed`; the specs therefore rely on live source inspection and do not claim graph verification. Symbol impact and `detect_changes()` remain mandatory when implementation begins.

## 8. Approval decision

The reviewed contract set is complete enough to establish an implementation Goal. Implementation must follow the delivery waves and cannot declare a requirement complete from visual changes alone. Any discovered schema or runtime fact that contradicts these contracts must pause the affected wave, update and re-audit the canonical spec, then resume.
