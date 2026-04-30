# P02: Review Workflow

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 审阅工作流
> Matrix category: partial implementation
> Source audit anchors: sections 8.2 and 14.
> Default batch: 3
> Coupling: high

## Objective

Extend the current review workflow from a stage enum into a governed editorial workflow with stage assignment, stage-level permissions, and publish-stage constraints.

## Context

- Four stages exist: `drafting`, `in_review`, `changes_requested`, and `approved`.
- Stage assignment is missing.
- Stage permissions are missing.
- Required publish stage constraints are missing.

## Scope

- Add workflow configuration model or extend existing content workflow models.
- Add stage assignment to users or roles.
- Add stage transition validation.
- Add stage-level permission checks.
- Add publish constraint requiring the configured publish-ready stage.
- Add Admin UI only for workflow settings required by the backend contract.

## Exclusions

- Full process automation engine changes unless workflow transitions already use it.
- RBAC management UI. That belongs to `f08-rbac-management-ui.md`.
- Notification workflow unless required for tests.

## Dependencies

- Should follow `p07-conditional-permissions.md` and `f08-rbac-management-ui.md` if stage permissions need the visual editor.
- Can be scoped to backend first if UI is deferred explicitly.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/admin/frontend/index.md`
- `docs/guidelines/frontend-design.md` when Admin UI changes.
- Source audit section 8.2.

## Execution Instructions

1. Inspect content status and workflow state models.
2. Define workflow configuration for stages, assignees, transition rules, and publish stage.
3. Add service-level transition validation.
4. Enforce permissions at mutation boundaries.
5. Add audit logging for workflow transitions.
6. Add Admin UI only after API behavior is tested.
7. Add tests for valid transitions, invalid transitions, assignment, publish blocking, and permission failures.

## Acceptance Criteria

- Stages can be assigned to roles or users.
- Stage transitions enforce configured rules.
- Publishing requires the configured publish-ready stage.
- Permission failures are explicit and tested.

## Verification

- Run focused workflow API tests.
- Run focused Admin tests when UI changes.
- Run `pnpm api:check` and `pnpm admin:check` as needed.
- Run GitNexus `detect_changes` before commit.

## Execution Log

- Status: verified
- Last updated: 2026-04-30
- Files changed:
  - `apps/api/src/modules/projects/content/contracts/schema.py`
  - `apps/api/src/modules/projects/content/items/workflow_policy.py`
  - `apps/api/src/modules/projects/content/items/canonical_service.py`
  - `apps/api/src/modules/projects/content/items/domain_helpers.py`
  - `apps/api/src/modules/projects/content/items/router.py`
  - `apps/api/src/modules/projects/automation/service.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_workflow_integration.py`
  - `apps/admin/src/pages/projects/content/models/components/content-model-settings-tab.tsx`
  - `apps/admin/src/pages/projects/content/models/utils.ts`
  - `locales/en-US/content.json`
  - `locales/zh-CN/content.json`
  - `packages/openapi/src/content-models.ts`
  - `packages/openapi/src/generated/types.gen.ts`
  - `docs/plans/full-repo-audit-gap-execution-2026-04-29/README.md`
  - `docs/plans/full-repo-audit-gap-execution-2026-04-29/p02-review-workflow.md`
- Notes:
  - Added `ContentWorkflowContract` fields for editorial stages, configured transitions, stage assignments, stage permissions, and publish-ready stage.
  - Added workflow policy resolution and transition validation at the content item workflow mutation boundary.
  - Enforced configured publish-ready stage in publish blockers and response metadata.
  - Added audit coverage for workflow transition events and passed project id through automation workflow updates.
  - Added Admin content model workflow settings for publish stage, allowed transitions, role/user stage assignment, and role/user stage permissions.
  - Synced OpenAPI/admin types and duplicate-model payload preservation for the expanded workflow contract.
- Verification:
  - `rtk timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -vv tests/modules/workspaces/publish/test_publish_workflow_integration.py` — passed, 7 passed.
  - `rtk pnpm -C apps/admin typecheck` — passed.
  - `rtk pnpm -C apps/admin test -- test/components/layout/admin-side-nav.test.tsx` — ran the full Admin Vitest suite, passed, 232 files / 953 tests.
  - `rtk pnpm api:check` — passed, 614 passed / 192 skipped.
  - `rtk pnpm admin:check` — two runs hit the same unrelated `admin-side-nav.test.tsx` hover-expanded assertion at `test/components/layout/admin-side-nav.test.tsx:604`.
  - `rtk pnpm exec turbo run lint format typecheck test --filter=@arclayer/admin --concurrency=1` — passed, 4/4 tasks successful; Admin Vitest passed 232 files / 953 tests.
  - GitNexus `detect_changes(scope="all")` — low risk, no affected execution processes reported.
