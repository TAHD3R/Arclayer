# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-phase4-perspectives-and-dependencies`
- **Task dir**: `.codex-tasks/20260417-headless-cms-v1-core-epic/tasks/20260417-phase4-perspectives-and-dependencies/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- **Plan**: `TODO.csv`
- **Environment**: Python / FastAPI / pytest

---

## Context Recovery Block

- **Current milestone**: Phase 4 started
- **Current status**: IN_PROGRESS
- **Last completed**: Phase 3 route and delivery core
- **Current artifact**: `TODO.csv`
- **Key context**: Route resolve now has structured route contracts, primary context assembly, and flattened delivery sections. It still lacks formal primary-unavailable errors and dependency availability semantics for `content_ref` resolution.
- **Known issues**: Dynamic routes can still return `context.primary = null` instead of a formal API error, and dependency references are not yet enforced through the new resolve contract.
- **Next action**: Add focused tests for primary record availability, preview fallback, and dependency diagnostics before implementation.

---

## Milestone: Phase 4 Perspectives And Dependencies

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added route resolve error handling for dynamic primary records so `public` now returns `PAGE_PRIMARY_RECORD_UNAVAILABLE`, `preview` can still read draft or published records, and missing records surface as `PAGE_PRIMARY_RECORD_NOT_FOUND`.
  - Connected `content_ref` dependency resolution back into the new flattened route resolver and enforced dependency availability through the resolve path instead of silent omission.
  - Added preview fallback from draft dependency to published dependency with a structured `DEPENDENCY_FALLBACK_PUBLISHED` warning, and hard failures for unreadable dependencies through `PAGE_DEPENDENCY_UNAVAILABLE` and `PAGE_PREVIEW_DEPENDENCY_UNAVAILABLE`.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_canonical_content_runtime_integration.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_routing_integration.py tests/modules/sites/test_sites_canonical_content_runtime_integration.py`
- **Files changed**:
  - `apps/api/src/modules/sites/publishing/includes/service.py`
  - `apps/api/src/modules/sites/publishing/routes/resolve/content/service.py`
  - `apps/api/tests/modules/sites/test_sites_canonical_content_runtime_integration.py`
- **Next step**: Pause for phase report before activating Phase 5.
