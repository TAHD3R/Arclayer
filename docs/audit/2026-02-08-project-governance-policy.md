# 2026-02-08 Project Governance Policy

## Direction

- Primary strategy: **self-host first**
- Current execution stage: **quality governance and capability-gap closure planning**
- Rule: avoid feature delivery by workaround; every workaround must have owner + removal date

## Non-negotiable gates

1. No new `apps/api/core -> apps/api/modules` dependencies.
2. No growth trend for broad exception handlers in production paths.
3. Frontend `any` usage must trend down every sprint.
4. Large-file budget violations must not increase.

## Implementation policy

### Phase 1 - Quality baseline hardening

- Split large service/repository files into focused collaborators.
- Eliminate redundant duplicated UI flows where behavior is equivalent.
- Replace broad exception fallbacks with typed errors and structured logs.
- Enforce quality reports in daily/CI workflow.

### Phase 2 - Open platform foundations

- Introduce API Keys domain (issue, revoke, rotate, scope, audit).
- Introduce Webhooks domain (subscription, delivery, retry, signature).
- Add plugin hook contracts for open platform capabilities.

### Phase 3 - AI-native foundation

- Define AI capability contracts independent of model vendor.
- Add audit and policy boundaries for AI-assisted operations.
- Keep AI features pluggable at both backend and admin extension levels.

## Acceptance criteria template

Each governance task must include:

- Architectural impact statement
- Backward-compatibility impact statement
- Test additions or adjustments
- Monitoring/logging impact
- Rollback plan

## Reporting cadence

- Regenerate `docs/audit/latest-quality-report.md` on every quality-focused PR.
- Keep date-stamped audit snapshots for major milestone reviews.
