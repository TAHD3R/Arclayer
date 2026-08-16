# Platform 控制平面交付波次记录

- 来源：自 `docs/spec/shared/admin-control-plane-rollout.md` §8 拆出（2026-08-17）
- 状态：Wave 0-8 已执行，随一次性发布边界完成 Platform Console 切换（ADR-0043）
- 权威关系：域不变量与「Platform frontend cutover gate」仍以 rollout 契约为准；本文件是执行期交付记录，不是活跃计划

以下为迁移原文。

## Wave 0: contracts and foundations

1. Resolve canonical spec conflicts and approve this contract set.
2. Create the independent `apps/platform` / `@arclayer/platform` frontend and its build, test, i18n, routing, Platform Session, Platform API, shared route-skeleton, and deployment boundaries while preserving `apps/app` / `@arclayer/app` as the Product Application.
3. Add required migrations, projections, indexes, error codes, and durable-job contracts.
4. Define the Platform Capability Catalog, Platform Domain inventory, trusted frontend module registry, capability-management surface, and permission-aware navigation contract.
5. Define the revisioned three-stage Workspace Capability Rollout contract, migration inventory, server enforcement boundaries, impact preview, Audit evidence, and its separation from eligibility, Entitlement, permission, readiness, and health.
6. Define the cross-domain Operational Signal projection, server-authoritative prioritization, revisioned lightweight triage, action-scoped claim/assignment/reminder permissions, and source-owned resolution contract.
7. Record the reviewed `satnaing/shadcn-admin` shell provenance, then build the Platform Experience Kit compositions defined by the administration experience redesign without importing its application, auth, product, chart, icon, or duplicate primitive stacks.
8. Vendor reviewed Bklit Registry chart sources behind `@arclayer/ui/chart`; do not expose Bklit/Visx directly to application pages.
9. Add shared identity hover-card, investigative Drawer, feedback composer, filter/order, and restriction-boundary primitives where reuse is proven.

## Wave 1: feedback and resilient error surfaces

Deliver the exact scope-switcher width fix, unified feedback entry points and center, cache-coherent triage, and Lucide/shared-Empty ContentGuard.

## Wave 2: Overview, Needs attention, and Monitoring & Audit

Deliver request/error diagnostics, repaired performance analytics, semantic Audit projections, useful drill-down, reviewed charts, the unified Monitoring & Audit route family, evidence-backed Overview, and Needs attention with claim, assignment, in-progress work, and time-bounded waiting. Preserve source-owned recovery and do not merge telemetry, Audit evidence, coordination, or domain lifecycle contracts.

## Wave 3: Communications and plugin operations

Deliver the User feedback and sending-issue queues, announcement Campaigns, the generalized feedback-reply/Campaign/transactional delivery ledger, real modal/banner consumption, localized message templates, and email-service readiness. Deliver the Extensibility installed list, catalog, connection inventory, and durable install/update operations, and remove direct event-runtime email delivery as a parallel unaudited path.

## Wave 4: commerce and tenant governance

Deliver the Plans & Billing commercial operations control plane and the Workspace-first Workspaces domain with peer User/Project views; identity cells and hover cards; commercial projections and exact billing deep links; Workspace Owner-controlled Support Access Grants without impersonation; event-driven Commercial Lifecycle Notifications; Project operational detail; and server-authoritative restriction blockers.

## Wave 5: invitation and permission experience

Deliver the token regression matrix, People/Pending/Invite links/Requests views, coherent acceptance/onboarding behavior, and revisioned dynamic localized permissions.

## Wave 6: Identity & Access productization

Deliver the Platform team queue, identity-bound Platform Operator invitation, explicit invitation permission, Delegable Platform Authority, MFA-gated activation, evidence-preserving offboarding and new-invitation re-entry, two-party phishing-resistant Instance Ownership Transfer, out-of-Console managed/self-hosted Ownership Recovery with security-key/passkey readiness and rehearsal, action-bound Step-up Platform Verification with server-owned phishing-resistant classification, immutable Built-in Platform Roles, revisioned Custom Platform Roles with impact and verification-readiness preview and atomic assignment adoption, role-only operator assignments, sign-in and registration policy, identity-provider readiness without MFA substitution, WebAuthn-preferred/TOTP-compatible local Platform MFA methods, device-scoped Platform Session inventory with inactivity/absolute expiry and precise revocation, and non-owner MFA recovery through one-time codes or exact-permission reset. Remove the legacy Access/OAuth settings categories and replace internal terminology in primary UI copy with localized operator language.

## Wave 7: Platform AI operations

Deliver the cross-Workspace AI task queue, model/provider readiness, built-in assistant operations, action-policy controls, and runtime recovery. Remove the legacy Agent settings wall, prevent Platform Operators from exercising tenant approvals, and move commercial or historical analysis to exact Commerce and Monitoring & Audit deep links.

## Wave 8: Hosting & Delivery productization

Deliver the cross-Workspace delivery-issue queue, domain/certificate readiness, file-storage operations, delivery policy, Delivery Suspended investigation, and restoration. Remove the legacy Domains/Storage settings categories and retain Project publication intent only in the Product Application.

## Commit discipline during wave execution

Each wave may be committed separately, but no commit may mix unrelated pre-existing worktree changes.
