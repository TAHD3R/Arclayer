# Audit v2 — 2026-05-02

> Source audit: `AUDIT_REPORT.md` (Headless CMS 全流程能力审计)
> Created: 2026-05-02
> Purpose: execution plan for the gaps identified in the comprehensive audit against Contentful.

## Operating Rules

This directory is the coordination layer for future implementation work. Treat each task card as a bounded sub-agent handoff contract.

- High-coupling items proceed by batch.
- Independent items proceed alone.
- Each implementation round gives the sub-agent only the current task card and relevant spec/context.
- Each completed round updates this overview status table.
- Every implementation task must run repo impact analysis before editing symbols and change detection before commit.
- Every implementation task must use live repo evidence over older notes when the two conflict.
- Every implementation task must keep failures visible. Do not add silent fallback paths to make a check pass.

## Required Context For Sub-Agents

Every sub-agent receives exactly:

- Its current task card from this directory.
- The source audit report section referenced by that card.
- Relevant Trellis spec indexes and guideline files.
- Research artifacts created for that task, if any.

Do not include unrelated task cards in the default context. The current card may reference dependency cards by file name; the coordinating agent decides whether those dependency cards need to be included.

## Task Cards

### P0 — 阻断用户全流程闭环

| ID | Card | Priority | Dependencies | Status | Last Result |
|---|---|---|---|---|---|
| I18N | `card-i18n-content-localization.md` | P0 | none | verified | Translation groups, create-translation flow, SQL locale filtering, delivery/GraphQL locale fallback, Admin translation UI, i18n keys, OpenAPI, migration, and tests shipped. Final gate: `pnpm check`. |
| REVIEW | `card-review-workflows.md` | P0 | none | see note | 已在前次审计 Plan 中实现 (`p02-review-workflow.md`) |

### P1 — 完善内容协作

| ID | Card | Priority | Dependencies | Status | Last Result |
|---|---|---|---|---|---|
| EMAIL | `card-email-multi-provider-gateway.md` | P1 | none | verified | Multi-provider gateway shipped: EmailProvider ABC, SMTP/Resend/Cloudflare/SES providers, DynamicMailService fallback/retry/switching, Admin provider settings, security alert templates, i18n, and focused/provider tests. Final gates: `pnpm api:check` and `pnpm admin:check`. |
| SCHEDULE | `card-scheduled-publish-task-center.md` | P1 | none | planned | — |

### P2 — 完善开发者体验

| ID | Card | Priority | Dependencies | Status | Last Result |
|---|---|---|---|---|---|
| SENTRY | `card-sentry-sdk-integration.md` | P2 | none | planned | — |

### P3 — 体验提升

| ID | Card | Priority | Dependencies | Status | Last Result |
|---|---|---|---|---|---|
| AUDIT | `card-platform-audit-log-page.md` | P3 | none | planned | — |

> **注**: AUDIT-03 (CLI 全流程) 需独立 Plan，不在本次 5 个任务范围内。

## Status Matrix

Status values:

- `planned`: task card exists and implementation has not started.
- `in_progress`: a sub-agent or main agent is actively implementing the card.
- `blocked`: implementation found a dependency, product decision, or infrastructure issue.
- `verified`: code is merged or committed with required checks.
- `deferred`: explicitly postponed with a reason and revisit condition.

| ID | Card | Priority | Status | Last Result |
|---|---|---|---|---|
| I18N | `card-i18n-content-localization.md` | P0 | verified | Translation groups, create-translation flow, SQL locale filtering, delivery/GraphQL locale fallback, Admin translation UI, i18n keys, OpenAPI, migration, and tests shipped. Final gate: `pnpm check`. |
| EMAIL | `card-email-multi-provider-gateway.md` | P1 | verified | EmailProvider ABC, SMTP/Resend/Cloudflare/SES providers, DynamicMailService fallback/retry/switching, Admin provider settings, security alert templates, i18n, and focused/provider tests shipped. Final gates: `pnpm api:check` and `pnpm admin:check`. |
| SENTRY | `card-sentry-sdk-integration.md` | P2 | planned | Backend (sentry-sdk[fastapi]) + Frontend (@sentry/react) + ErrorBoundary + env-based config. |
| SCHEDULE | `card-scheduled-publish-task-center.md` | P1 | planned | PublishJobRecord model + Taskiq cron task + /system/jobs page + scheduled_at in ContentReleaseRecord. |
| AUDIT | `card-platform-audit-log-page.md` | P3 | planned | System-wide audit log page reusing existing ActivityTimeline + ActivityFilterPopover components + event catalog completion. |

## Per-Task Completion Contract

At the end of every implementation round, the executing agent must:

1. Update the corresponding row in this README.
2. Record files changed and tests run in the task card's `Execution Log`.
3. Run the narrowest relevant checks, with `pnpm api:check`, `pnpm admin:check`, or `pnpm check` as the final gate according to scope.
4. Run GitNexus change detection before any commit.
5. Commit only the files owned by the current task when the user expects commits.

## Spec Context Index

Use these spec indexes when curating Trellis context for future tasks:

- API backend: `.trellis/spec/api/backend/index.md`
- API frontend: `.trellis/spec/api/frontend/index.md`
- Admin frontend: `.trellis/spec/admin/frontend/index.md`
- Shared thinking guides: `.trellis/spec/guides/index.md`

The implementing agent must read the concrete guideline files listed by the relevant index before editing code.

## Documents

| File | Content | Lines |
|------|---------|-------|
| `AUDIT_REPORT.md` | Headless CMS full-flow capability audit (frontend + backend + infra vs Contentful) | 367 |
| `IMPLEMENTATION_PLAN.md` | 14-task implementation plan across 4 phases | 444 |
| `card-i18n-content-localization.md` | Content i18n: translation groups, locale fallback, field-level localization | ~260 |
| `card-email-multi-provider-gateway.md` | Multi-provider email gateway: SMTP/Resend/Cloudflare/SES + DynamicMailService | ~240 |
| `card-sentry-sdk-integration.md` | Sentry SDK: FastAPI + React error monitoring and APM | ~150 |
| `card-scheduled-publish-task-center.md` | Scheduled publishing + platform job center page | ~260 |
| `card-platform-audit-log-page.md` | Platform audit log page reusing existing activity components | ~200 |
