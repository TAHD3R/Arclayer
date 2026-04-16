# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-phase1-official-model-foundations`
- **Task dir**: `.codex-tasks/20260417-headless-cms-v1-core-epic/tasks/20260417-phase1-official-model-foundations/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- **Plan**: `TODO.csv`
- **Environment**: Python / FastAPI / pytest

---

## Context Recovery Block

- **Current milestone**: Phase 1 complete
- **Current status**: DONE
- **Last completed**: Task 4 — focused backend verification
- **Current artifact**: `TODO.csv`
- **Key context**: Phase 1 replaced generic model truth with an official protocol registry, locked official system fields, and added draft/published contract revision isolation on content models.
- **Known issues**: Phase 2 still needs to apply the same isolation discipline to page composition and publish semantics.
- **Next action**: Pause for user review before opening `20260417-phase2-version-and-publish`.

---

## Milestone 1: Official Model Foundations

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added `protocol_registry.py` as the single backend truth source for `Article / Page / Reusable Section / Category`, including official defaults, capabilities, routing policy, workflow policy, and locked system field keys.
  - Removed the legacy `kind` persistence field from `ContentModelDefinitionRecord` and replaced it with protocol metadata plus model contract revision storage: `protocol_key`, `protocol_version`, `is_system_managed`, `system_field_keys`, `draft_contract_revision`, `published_contract_revision`, and `published_contract_snapshot`.
  - Reworked canonical model creation so v1 only accepts official model keys, merges registry-owned system fields with user-defined custom fields, and rejects custom fields that shadow official system keys.
  - Reworked model patch flow so system-managed contract fields are locked, draft contract revisions increment on mutable edits, and published contract snapshots remain stable while draft schema evolves.
  - Expanded API output and audit events to surface protocol identity and revision state, and updated focused unit/integration coverage to reflect the hard cut to official models.
- **Key decisions**:
  - Decision: Phase 1 enforces official-model-only creation at the backend boundary.
  - Reasoning: The approved v1 design defines system-managed models as the only supported protocol surface. Locking this now keeps SDK, delivery, and later admin cutover aligned with one truth.
  - Decision: Published model contracts stay as a snapshot on the model record while the live row carries draft edits.
  - Reasoning: This provides immediate isolation for later delivery work without inventing a second mutable storage tree in Phase 1.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_unit.py tests/modules/workspaces/test_workspace_content_contracts_unit.py tests/modules/workspaces/content/test_content_models_integration.py tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py`
- **Files changed**:
  - `apps/api/src/models/content/model_definition.py`
  - `apps/api/src/migrations/0001_initial.py`
  - `apps/api/src/modules/workspaces/content/continuation.py`
  - `apps/api/src/modules/workspaces/content/contracts/schema.py`
  - `apps/api/src/modules/workspaces/content/models/canonical_service.py`
  - `apps/api/src/modules/workspaces/content/models/domain_helpers.py`
  - `apps/api/src/modules/workspaces/content/models/protocol_registry.py`
  - `apps/api/src/modules/workspaces/content/models/repository.py`
  - `apps/api/src/modules/workspaces/content/models/router.py`
  - `apps/api/tests/modules/workspaces/content/test_content_model_defaults_preview_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
  - `apps/api/tests/modules/workspaces/test_workspace_content_contracts_unit.py`
  - `apps/api/tests/modules/workspaces/test_workspace_content_models_integration.py`
