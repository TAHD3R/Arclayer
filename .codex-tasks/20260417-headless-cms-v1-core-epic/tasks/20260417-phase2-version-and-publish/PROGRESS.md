# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-phase2-version-and-publish`
- **Task dir**: `.codex-tasks/20260417-headless-cms-v1-core-epic/tasks/20260417-phase2-version-and-publish/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- **Plan**: `TODO.csv`
- **Environment**: Python / FastAPI / pytest

---

## Context Recovery Block

- **Current milestone**: Phase 2 started
- **Current status**: DONE
- **Last completed**: Task 4 — focused Phase 2 verification
- **Current artifact**: `TODO.csv`
- **Key context**: Phase 2 locked page-version snapshot behavior with regression tests and inserted official-model publish validation before a version can enter the published world.
- **Known issues**: Phase 3 still needs formal route matcher persistence and resolve-time flattening.
- **Next action**: Pause for user review before opening `20260417-phase3-route-and-delivery`.

---

## Milestone 2: Content Version And Publish Semantics

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added page-version regression coverage that proves an already published page keeps its own `fields_snapshot`, SEO payload, and slot-binding snapshot after a newer draft version is saved.
  - Hard-cut the article draft fixture to the official article presentation policy: `form_data`, `rich_text_document`, and `seo`; removed stale article `visual_blueprint` expectations from backend coverage.
  - Added explicit publish validation for official models inside `transition_version()` so publish now rejects revisions with missing required system fields or presentation kinds that violate the official protocol.
  - Added machine-readable publish diagnostics under `CONTENT_PUBLISH_VALIDATION_FAILED` and kept the validation contract focused on v1 needs: required system fields, allowed presentation kinds, and a minimal page path shape check.
  - Tightened content-library grouping to rely on resolved role and surface rather than broad capability heuristics, so `Article` stays in general content while `Page` and `Reusable Section` remain site content.
  - Updated continuation-contract tests to match the official protocol truth for `Article`: `defaultPosture = structured`, `defaultSurface = writing`, and `libraryGroup = general-content`.
- **Key decisions**:
  - Decision: publish validation runs only when the target state is `published`.
  - Reasoning: draft and scheduled worlds stay editable; the public boundary is the point where contract integrity must become strict.
  - Decision: article library grouping follows resolved role and surface, not raw `routable` capability presence.
  - Reasoning: the official protocol treats articles as content-library entries even when they participate in delivery routes.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_presentations_integration.py tests/modules/workspaces/content/test_content_items_transition_guards_integration.py tests/modules/workspaces/content/test_content_items_continuation_contract_integration.py`
- **Files changed**:
  - `apps/api/src/modules/workspaces/content/items/canonical_service.py`
  - `apps/api/src/modules/workspaces/content/items/domain_helpers.py`
  - `apps/api/tests/modules/workspaces/content/test_content_items_continuation_contract_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_items_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_items_transition_guards_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_presentations_integration.py`
