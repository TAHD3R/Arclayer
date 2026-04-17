# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-phase3-delivery-plane`
- **Task dir**: `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/tasks/20260417-phase3-delivery-plane/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-backend-sdk-v1-spec.md`
- **Plan**: `TODO.csv`
- **Environment**: Python / FastAPI / pytest

---

## Context Recovery Block

- **Current milestone**: Phase 3 active
- **Current status**: IN_PROGRESS
- **Last completed**: Task 1 — audit of runtime and delivery seams
- **Current artifact**: `TODO.csv`
- **Key context**: Existing `/sites/{site_id}/routes/resolve` already performs flattened page resolution with public and preview behavior, but the formal delivery router still exposes only menu and style reads.
- **Known issues**: No formal `pages.byId`, `sections.byAlias`, or `globalSets.resolve` endpoints exist yet, and delivery error codes still follow legacy `PAGE_*` runtime naming.
- **Next action**: Extend delivery schemas and router surface, then reuse and reshape the publishing/content services behind a formal delivery contract.

---

## 2026-04-17 — Delivery Plane Audit

- Audited existing repo truth before coding:
  - `apps/api/src/modules/sites/delivery/{router.py,schema.py}`
  - `apps/api/src/modules/sites/runtime/{router.py,schema.py,repository.py}`
  - `apps/api/src/modules/sites/content/delivery/service.py`
  - `apps/api/src/modules/sites/publishing/{service.py,routes/resolve/service.py,routes/resolve/content/service.py}`
  - `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`
- Findings:
  - The current delivery router is still a narrow legacy surface for menu and style.
  - The current runtime router already contains the strongest page resolve behavior in the repo, including static-vs-dynamic route precedence and preview/public perspective handling.
  - Current runtime errors expose `PAGE_*` codes and do not yet match the formal delivery-plane machine-readable contract requested by the spec.
  - Reusable-section and global-set delivery reads are absent from the public API surface even though the official model registry already defines `reusable-section`.
- Execution direction:
  - Promote the runtime route resolver into formal delivery endpoints rather than building a second resolver stack.
  - Keep preview-token enforcement explicit at the router boundary.
  - Add delivery-specific schema wrappers and error translations where the spec requires a different formal contract.

---

## 2026-04-17 — Delivery Plane Implementation And Closeout

- **Status**: DONE
- **Completed**: 2026-04-17T12:50:47+08:00
- **What was done**:
  - Added formal delivery REST endpoints for `pages.resolve`, `pages.byId`, `sections.byAlias`, and `globalSets.resolve`.
  - Extended publish artifacts and release graph records with `route_contract` so published delivery resolves against the active release world instead of live mutable routing state.
  - Reused the existing route resolver for flattening, then added delivery-specific strict binding failures and public-vs-preview perspective handling.
  - Added delivery integration coverage for static-vs-dynamic route precedence, reusable section alias resolution, global set section binding, binding failures, and `pages.byId` rejection for non-deliverable section ids.
  - Updated the stale portal protocol integration test to assert the current runtime contract where versioned page field data lives under `context.primary.data`.
- **Key review findings fixed before close**:
  - `pages.byId` now restricts published reads to release nodes with a route contract and preview reads to items with an active route binding.
  - `resolve_delivery_page_by_id` argument formatting was normalized after Serena highlighted a readability issue in the patched call site.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_portal_protocol_integration.py::test_sites_public_preview_draft_publish_flow`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_delivery_integration.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish/test_publish_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py`
  - Review: `code-review-graph detect_changes_tool` found no additional concrete blocker after the by-id hardening pass.
  - Review: `serena` symbol review confirmed release-route filtering and by-id route-binding guards on the final implementation.
