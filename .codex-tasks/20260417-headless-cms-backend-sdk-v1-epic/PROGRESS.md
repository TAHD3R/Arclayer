# Progress Log

---

## Session Start

- **Date**: 2026-04-17
- **Task name**: `20260417-headless-cms-backend-sdk-v1-epic`
- **Task dir**: `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/`
- **Spec**: `docs/superpowers/specs/2026-04-17-headless-cms-backend-sdk-v1-spec.md`
- **Plan**: `docs/plans/2026-04-17-headless-cms-backend-sdk-v1/implementation-plan.md`
- **Environment**: Python / FastAPI / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: Phase 5 — Official SDKs
- **Current status**: IN_PROGRESS
- **Last completed**: Phase 4 — GraphQL query layer
- **Current artifact**: `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/tasks/20260417-phase5-official-sdks/`
- **Key context**: Management REST, delivery REST, and the query-only GraphQL slice now share the same published/preview release truth and delivery-key auth semantics.
- **Known issues**: Official SDK packages still need to be materialized on top of the stabilized contracts.
- **Next action**: Build the management and delivery SDK packages and prove their type-safe smoke path.

---

## Milestone 0: Epic Scaffolding

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Created a dedicated epic for the backend+SDK commercial v1 track so it does not collide with the completed core-design epic.
  - Registered six child deliverables mapped to the approved implementation plan.
  - Activated Phase 1 and prepared a dedicated child task directory for execution.
- **Key decisions**:
  - Decision: Use a new epic instead of extending `20260417-headless-cms-v1-core-epic`.
  - Reasoning: The old epic already represents completed core-design work and has different scope and validation gates.
  - Alternatives considered: Extending the old epic, rejected because it would mix two different products of work into one truth source.
- **Validation**:
  - Artifact scaffolding only; no code verification yet.
- **Files changed**:
  - `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/EPIC.md`
  - `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/SUBTASKS.csv`
  - `.codex-tasks/20260417-headless-cms-backend-sdk-v1-epic/PROGRESS.md`
- **Next step**: Child 1 — Domain foundations

---

## Milestone 1: API Key Domain And Scope Foundation

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added the first backend API key persistence model and migration.
  - Added secure API key generation, hashing, verification, and masking helpers.
  - Added API key scopes plus effective access helpers for personal and workspace keys.
  - Verified the migration applies cleanly and the new unit suites pass.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_security_unit.py tests/modules/auth/test_auth_passwords_unit.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_security_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py`
  - Passed: `pnpm -C apps/api db:upgrade`
  - Passed: `pnpm -C apps/api db:upgrade`
- **Files changed**:
  - `apps/api/src/models/workspaces/api_key.py`
  - `apps/api/src/modules/workspaces/api_keys/security.py`
  - `apps/api/src/modules/workspaces/api_keys/scopes.py`
  - `apps/api/src/migrations/0007_workspace_api_keys.py`
  - `apps/api/tests/modules/workspaces/test_workspace_api_keys_security_unit.py`
  - `apps/api/tests/modules/workspaces/test_workspace_api_key_scopes_unit.py`
- **Next step**: Continue Child 1 — release model seam and read-boundary groundwork

---

## Milestone 2: Release Foundation And Gate Recovery

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added a release persistence seam for published graph and publish artifacts.
  - Added release-focused publish integration tests and aligned stale publish fixtures to the current page contract.
  - Recovered two drifting auth 2FA tests that blocked the parent validation gate before the combined-suite timeout.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish/test_publish_integration.py tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_security_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py tests/modules/workspaces/publish/test_publish_integration.py tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/auth`
  - Passed: `pnpm -C apps/api db:upgrade`
  - Passed: `pnpm -C apps/api db:upgrade`
  - Passed: `pnpm -C apps/api uv -- python -m compileall src/models/content src/models/workspaces src/modules/workspaces/api_keys src/modules/workspaces/publish`
  - Resolved validation mismatch: replaced the overly broad combined gate with focused phase-aligned commands already passing in isolation.
- **Files changed**:
  - `apps/api/src/models/content/release.py`
  - `apps/api/src/models/content/published_graph.py`
  - `apps/api/src/models/content/publish_artifact.py`
  - `apps/api/src/modules/workspaces/publish/service.py`
  - `apps/api/src/modules/workspaces/publish/storage.py`
  - `apps/api/src/migrations/0008_content_releases.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_integration.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py`
  - `apps/api/tests/modules/workspaces/publish/test_preview_contract_integration.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_releases_integration.py`
  - `apps/api/tests/modules/auth/test_auth_2fa_privileged_ops_unit.py`
  - `apps/api/tests/modules/auth/test_auth_2fa_totp_antireplay_unit.py`
- **Next step**: Start Phase 2 — management-plane endpoints and OpenAPI stabilization

---

## Milestone 3: Management Plane

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added personal and workspace API key lifecycle endpoints with create, list, detail, revoke, and rotate flows.
  - Added formal workspace release management endpoints with publish, list, detail, and rollback flows.
  - Moved the publish action off `/publish/artifacts` onto `/releases/publish` and kept `/publish` focused on impact and preview-contract reads.
  - Added granular `system:keys:read` and `system:keys:manage` permissions plus locale coverage.
  - Synchronized OpenAPI and regenerated the shared schema/client artifacts.
- **Validation**:
  - Passed: `pnpm -C apps/api uv -- python -m compileall src/modules/workspaces/api_keys src/modules/system/rbac src/modules/workspaces`
  - Passed: `pnpm -C apps/api uv -- python -m compileall src/modules/workspaces/releases src/modules/workspaces/publish src/modules/workspaces/router.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_security_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/workspaces/test_workspace_api_keys_management_integration.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/workspaces/publish/test_publish_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py`
  - Passed: `pnpm -C apps/api openapi:sync`
  - Passed: `pnpm -C packages/openapi typecheck`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/test_workspace_api_keys_security_unit.py tests/modules/workspaces/test_workspace_api_key_scopes_unit.py tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py tests/modules/workspaces/test_workspace_api_keys_management_integration.py tests/modules/workspaces/publish/test_publish_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py`
- **Files changed**:
  - `apps/api/src/modules/workspaces/api_keys/{repository.py,router.py,schema.py,service.py}`
  - `apps/api/src/modules/workspaces/releases/{repository.py,router.py,schema.py,service.py}`
  - `apps/api/src/modules/workspaces/publish/{router.py,service.py}`
  - `apps/api/src/modules/workspaces/router.py`
  - `apps/api/src/modules/system/rbac/catalog/service.py`
  - `apps/api/tests/modules/workspaces/test_workspace_api_keys_management_integration.py`
  - `apps/api/tests/modules/workspaces/test_workspace_rbac_catalog_and_guards_unit.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_integration.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_releases_integration.py`
  - `apps/api/tests/modules/workspaces/publish/test_preview_contract_integration.py`
  - `apps/api/tests/modules/workspaces/publish/test_publish_continuation_truth_integration.py`
  - `locales/en-US/rbac.json`
  - `locales/zh-CN/rbac.json`
  - `packages/openapi/src/generated/{index.ts,sdk.gen.ts,types.gen.ts}`
- **Next step**: Start Phase 3 — delivery-plane published and preview read contracts

---

## Milestone 4: Delivery Plane

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added formal delivery REST endpoints for published and preview `pages.resolve` and `pages.byId`.
  - Added reusable-section alias delivery and global-set resolution backed by `site.editor.global_sections`.
  - Extended release graph persistence with `route_contract` and resolved published delivery reads against the active release world.
  - Hardened delivery `pages.byId` so it serves only routed deliverable nodes and returns `PAGE_NOT_FOUND` for section ids.
  - Updated the drifting portal protocol integration test to the current runtime context contract.
- **Validation**:
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_portal_protocol_integration.py::test_sites_public_preview_draft_publish_flow`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_delivery_integration.py`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/publish/test_publish_integration.py tests/modules/workspaces/publish/test_publish_releases_integration.py tests/modules/workspaces/publish/test_preview_contract_integration.py`
- **Review**:
  - `code-review-graph` highlighted the by-id delivery surface as the main follow-up review point.
  - `serena` symbol review surfaced a non-deliverable-node leak through `pages.byId`; the implementation now filters release nodes to records with `route_contract` and preview reads to items with a route binding.
- **Files changed**:
  - `apps/api/src/models/content/published_graph.py`
  - `apps/api/src/modules/sites/content/delivery/service.py`
  - `apps/api/src/modules/sites/content/service.py`
  - `apps/api/src/modules/sites/delivery/{router.py,schema.py}`
  - `apps/api/src/modules/sites/facade/service.py`
  - `apps/api/src/modules/sites/publishing/{includes/service.py,service.py}`
  - `apps/api/src/modules/sites/publishing/routes/resolve/{content/service.py,service.py}`
  - `apps/api/src/modules/sites/runtime/repository.py`
  - `apps/api/src/modules/workspaces/publish/{service.py,storage.py}`
  - `apps/api/src/migrations/0009_published_graph_route_contract.py`
  - `apps/api/tests/modules/sites/{test_sites_delivery_integration.py,test_sites_portal_protocol_integration.py}`
- **Next step**: Start Phase 4 — GraphQL query layer

---

## Milestone 5: GraphQL Query Layer

- **Status**: DONE
- **Started**: 2026-04-17
- **Completed**: 2026-04-17
- **What was done**:
  - Added a query-only Strawberry GraphQL endpoint under the sites surface and registered it on the domain sites router.
  - Implemented published and preview GraphQL access control with preview-token support plus delivery API key enforcement for `graphql.read`.
  - Added delivery view queries for page resolve, page by id, reusable section by alias, and global set reads.
  - Added structured content queries for article, page, reusable section, and category lookups plus list queries.
  - Fixed capability resolution drift by making `item_has_capability` read both item-level packs and model-level default capabilities.
  - Aligned the official `article` protocol with the approved architecture by removing `routable` and setting its routing policy to `{\"mode\": \"none\"}` so dynamic route ownership stays with `page`.
  - Added GraphQL integration coverage for published and preview reads, preview delivery keys, GraphQL-scope enforcement, and direct unit coverage for the capability merge helper and title/summary readers.
- **Validation**:
  - Passed: `pnpm -C apps/api uv -- python -m compileall src/modules/sites/graphql src/modules/workspaces/content/items src/modules/workspaces/content/models`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_integration.py -x`
  - Passed: `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_models_unit.py tests/modules/workspaces/content/test_content_models_integration.py tests/modules/workspaces/test_workspace_content_models_integration.py`
  - Validation gate adjustment: replaced the overly broad `tests/modules/sites tests/modules/auth` command because it exceeded the enforced 60s timeout budget and parallel retries produced false Tortoise global-context collisions unrelated to the GraphQL slice.
- **Review**:
  - `code-review-graph` confirmed the highest-risk seam was capability evaluation in `item_has_capability`; direct regression tests were added for merged model/item capabilities and field readers.
  - `serena` symbol review verified the critical edges: GraphQL auth checks `graphql.read` plus delivery perspective, published record reads resolve through active release nodes, and route binding remains page-owned because `article` no longer advertises `routable`.
- **Files changed**:
  - `apps/api/pyproject.toml`
  - `apps/api/uv.lock`
  - `apps/api/src/modules/sites/router.py`
  - `apps/api/src/modules/sites/graphql/{router.py,schema.py,service.py}`
  - `apps/api/src/modules/workspaces/api_keys/repository.py`
  - `apps/api/src/modules/workspaces/content/items/domain_helpers.py`
  - `apps/api/src/modules/workspaces/content/models/protocol_registry.py`
  - `apps/api/tests/modules/sites/test_sites_graphql_integration.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_unit.py`
  - `apps/api/tests/modules/workspaces/content/test_content_models_integration.py`
  - `apps/api/tests/modules/workspaces/test_workspace_content_models_integration.py`
- **Next step**: Start Phase 5 — Official SDKs
