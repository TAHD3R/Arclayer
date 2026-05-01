# F03: Data Transfer Engine

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: 数据传输引擎
> Matrix category: completely missing
> Source audit anchors: sections 6, 13.5, 14, 15.
> Default batch: 4
> Coupling: high

## Objective

Implement a content and schema transfer engine that supports export, import, schema transfer, diagnostics, and future remote transfer flows.

## Context

- `modules/projects/content/transfer/` exists but is empty.
- The audit identifies missing export, import, schema transfer, remote transfer, encryption, filters, CLI commands, and diagnostics.
- Contentful migration DSL and Strapi stream transfer are both relevant reference models.

## Scope

- Add a backend transfer module with explicit phases.
- Support local export and local import first.
- Include content models, content items, assets metadata, releases, and configuration where supported by live models.
- Add diagnostics with severity levels.
- Define a transfer manifest format.
- Provide service APIs that future CLI commands can call.

## Exclusions

- Full remote WebSocket transfer in the first implementation round unless a follow-up task explicitly includes it.
- CLI command implementation. That belongs to `f05-cli-tools.md`.
- Multi-environment transfer until `f10-environment-system.md`.

## Dependencies

- Should follow `f06-dynamic-schema-sync.md` when transfer depends on physical schema.
- Should precede CLI export/import commands.
- Informs environment migration later.

## Required Context

- `.trellis/spec/api/backend/index.md`
- `docs/guidelines/backend-folder-architecture.md`
- Source audit section 6.

## Execution Instructions

1. Inspect content model, content item, asset, release, project, site, and workspace data models.
2. Define a transfer manifest that records schema version, project identity, exported resource counts, and integrity checks.
3. Implement export phases with streaming where data volume can grow.
4. Implement import phases with validation before mutation.
5. Add diagnostics as structured records with severity.
6. Keep import failures explicit and transactional where possible.
7. Add focused tests for export manifest, import validation, conflict handling, and diagnostics.

## Acceptance Criteria

- Export produces a deterministic manifest and resource payload.
- Import validates manifest compatibility before writing.
- Diagnostics identify blocking and warning conditions.
- Transfer service APIs are callable by future CLI work.

## Verification

- Run focused transfer unit and integration tests.
- Run `pnpm api:check`.
- Run GitNexus `impact` before editing content service symbols and `detect_changes` before commit.

## Execution Log

- Status: verified
- Last updated: 2026-05-01
- Files changed:
  - `apps/api/src/modules/projects/content/transfer/__init__.py`
  - `apps/api/src/modules/projects/content/transfer/schema.py`
  - `apps/api/src/modules/projects/content/transfer/repository.py`
  - `apps/api/src/modules/projects/content/transfer/service.py`
  - `apps/api/tests/modules/projects/test_project_content_transfer_integration.py`
  - `.trellis/tasks/05-01-05-01-05-01-f03-data-transfer-engine/prd.md`
  - `.trellis/tasks/05-01-05-01-05-01-f03-data-transfer-engine/research/f03-audit-context.md`
  - `.trellis/tasks/05-01-05-01-05-01-f03-data-transfer-engine/research/f03-transfer-decision.md`
  - `.trellis/tasks/05-01-05-01-05-01-f03-data-transfer-engine/implement.jsonl`
  - `.trellis/tasks/05-01-05-01-05-01-f03-data-transfer-engine/check.jsonl`
- Notes:
  - Implemented a backend project content transfer service with explicit export/import phases, schema versioned manifest, resource counts, stable integrity checks, structured diagnostics, and future CLI-callable service APIs.
  - Export covers workspace, project, runtime, site, content models, fields, relations, views, content items, versions, presentation documents, SEO profiles, component bindings, route bindings, hierarchy nodes, releases, published graph, publish artifacts, and asset metadata.
  - Import performs validation before mutation, blocks non-empty targets with `CONTENT_TRANSFER_TARGET_NOT_EMPTY`, and writes transfer rows transactionally after diagnostics are clear.
  - Asset binary movement remains delegated to storage tooling and is surfaced with `CONTENT_TRANSFER_ASSET_METADATA_ONLY`.
  - GitNexus impact before editing: `ProjectContentItemsRepository` returned HIGH blast radius across content reads, automation, SEO/presentation helpers, and site delivery imports; `ProjectContentModelsRepository` returned LOW blast radius. This implementation added a dedicated transfer repository/service and did not modify those existing repositories.
- Verification:
  - `rtk pnpm -C apps/api uv -- python -m compileall src/modules/projects/content/transfer tests/modules/projects/test_project_content_transfer_integration.py` passed.
  - `rtk timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -vv tests/modules/projects/test_project_content_transfer_integration.py` passed: 4 passed.
  - `rtk pnpm -C apps/api typecheck` passed: All checks passed.
  - `rtk pnpm api:check` passed: lint, format, typecheck, and test completed with 614 passed, 196 skipped.
  - GitNexus `detect_changes(scope="all")` passed pre-commit scope review with low risk and no affected processes reported.
