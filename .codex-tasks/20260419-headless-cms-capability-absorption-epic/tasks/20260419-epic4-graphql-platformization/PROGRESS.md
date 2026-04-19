# Progress Log

---

## Session Start

- **Date**: 2026-04-19
- **Task name**: `20260419-epic4-graphql-platformization`
- **Task dir**: `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic4-graphql-platformization/`
- **Spec**: See `SPEC.md`
- **Plan**: See `TODO.csv` (3 milestones)
- **Environment**: Python / FastAPI / React / TypeScript / pnpm / pytest / vitest

---

## Context Recovery Block

- **Current milestone**: #12 — 回写 Epic4 progress 并准备下一批 GraphQL runtime/frontend work
- **Current status**: DONE
- **Last completed**: #10 / #11 — backend + SDK focused verification
- **Current artifact**: `packages/delivery-sdk/src/graphql-query-input.ts`
- **Key context**:
  - Epic4 目标是把当前 hand-crafted GraphQL read layer 推进成 schema-aware query platform。
  - 当前 live entrypoints 是 `apps/api/src/modules/sites/graphql/schema.py`、`service.py`、`router.py`、`artifacts/v1`、`apps/api/scripts/export_graphql_schema.py`、`apps/api/scripts/verify_graphql_schema.py` 和 `packages/delivery-sdk/src/graphql-client.ts`。
  - Epic2 已将 GraphQL preview/published listing 接到 `DocumentQueryBoundary`。
  - Epic3 已将 GraphQL delivery access 接到 `PolicyEvaluationService`，并在 `SiteGraphQLService.list_records` 内加了 model-aware query field allowlist。
  - 已完成第一批 Epic4 schema builder/artifact slice：新增 `apps/api/src/modules/sites/graphql/registry.py`，把 built-in model 的 entry type、query names、filter/sort inputs、system fields 和 SDK contract names 收口成正式 registry。
  - `apps/api/scripts/export_graphql_schema.py` 的 manifest 已改为 registry-backed contract；`apps/api/src/modules/sites/graphql/artifacts/v1/manifest.json` 已随 live schema/export 刷新。
  - 新增 `apps/api/tests/modules/sites/test_sites_graphql_artifacts_unit.py`，覆盖 registry model contract、manifest metadata、artifact freshness 边界。
  - 已完成第二批 Epic4 query runtime slice：新增 `apps/api/src/modules/sites/graphql/planner.py`，把 model-aware filters、sort、perspective、pagination bounds 收口到 `GraphQLQueryPlan` contract，并让 `SiteGraphQLService.list_records` 只负责 plan execution。
  - `apps/api/tests/modules/sites/test_sites_graphql_service_unit.py` 已补 planner contract 和 `list_records` planner execution coverage。
  - 已完成第三批 Epic4 extensibility slice：新增 `apps/api/src/modules/sites/graphql/hooks.py`，明确 schema field provider 与 query post-processor hook contracts，并把 hook metadata 落进 artifact manifest。
  - 已完成第四批 Epic4 subscription contract slice：新增 `apps/api/src/modules/sites/graphql/subscriptions.py`，定义 `publish.release` 与 `preview.collaboration` 的 subscription event contract，并把 contract-only runtime metadata 落进 artifact manifest。
  - Epic4 当前 focused verification 已通过：`pnpm -C apps/api graphql:schema:verify` 与 `pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/sites/test_sites_graphql_artifacts_unit.py tests/modules/sites/test_sites_graphql_subscriptions_unit.py`，结果为 31 tests passed。
  - 已完成第五批 Epic4 delivery SDK slice：新增 `packages/delivery-sdk/src/graphql-manifest.ts`，SDK 可读取 committed GraphQL manifest，按 model/list query/single query/subscription event 暴露 schema-aware helper。
  - 同步修复 `packages/delivery-sdk/src/rest-client.ts` 的 runtime delivery OpenAPI operation drift：当前生成包只导出 `externalRuntimes*Delivery*`，SDK 外部仍接受 `siteId`，内部映射到 `runtime_id`。
  - SDK focused verification 已通过：`pnpm --filter @arclayer/delivery-sdk test` 结果 8 tests passed；`pnpm --filter @arclayer/delivery-sdk typecheck` 通过。
  - 已完成第六批 Epic4 frontend/shared query input slice：新增 `packages/delivery-sdk/src/graphql-query-input.ts`，共享层可基于 manifest metadata 构造 schema-aware list query filter/sort/pagination variables。
  - Epic4 backend final focused verification 已通过：`env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites/test_sites_graphql_integration.py tests/modules/sites/test_sites_graphql_service_unit.py tests/modules/sites/test_sites_graphql_artifacts_unit.py tests/modules/sites/test_sites_graphql_subscriptions_unit.py`，结果为 33 tests passed。
  - Epic4 SDK final focused verification 已通过：`pnpm --filter @arclayer/delivery-sdk test` 结果 9 tests passed；`pnpm --filter @arclayer/delivery-sdk typecheck` 通过。
  - GitNexus 当前能定位 `sites/graphql/service.py`、`schema.py`、export/verify scripts 与 delivery SDK GraphQL client；后续如需符号级调用链，优先查这些入口。
- **Known issues**:
  - `apps/admin typecheck` 有既有阻塞，Epic4 当前第一刀先聚焦 backend schema artifact 和 delivery SDK。
  - `apps/api/src/modules/sites/graphql/artifacts/v1` 里已有 committed SDL snapshot，任何 schema shape 改动都必须同步 export 和 verify。
- **Next action**: Epic4 is complete; the next GraphQL follow-up belongs to cross-epic frontend adoption work that consumes the shared delivery SDK query input helpers.

---

## Execution Notes

- 2026-04-19: Expanded Epic4 `TODO.csv` from 3 scaffold rows to 12 leaf steps covering schema registry, artifact workflow, query planner, hooks, realtime, SDK, and frontend query contracts.
- 2026-04-19: Added `apps/api/src/modules/sites/graphql/registry.py` to formalize GraphQL model entry types, single/list query names, filter/sort inputs, system fields, and SDK type names.
- 2026-04-19: Upgraded `scripts.export_graphql_schema.build_manifest` so the committed GraphQL manifest now includes registry-backed model metadata in addition to schema hash and perspectives.
- 2026-04-19: Re-exported `apps/api/src/modules/sites/graphql/artifacts/v1/schema.graphql` and `manifest.json` through the repo script and verified them with `pnpm -C apps/api graphql:schema:verify`.
- 2026-04-19: Added focused unit coverage for schema registry and artifact freshness in `tests/modules/sites/test_sites_graphql_artifacts_unit.py`; combined GraphQL artifact + service unit verification passed with 24 tests.
- 2026-04-19: Added `apps/api/src/modules/sites/graphql/planner.py` to formalize query plan validation, normalized filters, and bounded pagination for built-in GraphQL models.
- 2026-04-19: Refactored `SiteGraphQLService.list_records` to build and execute a `GraphQLQueryPlan` before filtering, sorting, and slicing records.
- 2026-04-19: Expanded `tests/modules/sites/test_sites_graphql_service_unit.py` with planner contract coverage and service execution checks; combined service + artifacts unit verification passed with 26 tests.
- 2026-04-19: Added `apps/api/src/modules/sites/graphql/hooks.py` with explicit hook contracts for schema field providers and query post-processors; GraphQL artifacts now publish hook metadata.
- 2026-04-19: Added `apps/api/src/modules/sites/graphql/subscriptions.py` with contract-only publish release and preview collaboration event definitions; GraphQL artifacts now publish subscription metadata.
- 2026-04-19: Added focused unit coverage for hook metadata, post-processor execution, and subscription event contracts; service + artifact + subscription verification passed with 31 tests.
- 2026-04-19: Added `packages/delivery-sdk/src/graphql-manifest.ts` to expose schema-aware GraphQL model/query/subscription metadata to SDK and frontend consumers.
- 2026-04-19: Repaired delivery SDK REST client drift from old `externalSitesDelivery*` OpenAPI functions to current runtime delivery generated functions and updated smoke expectations to `/api/v1/runtimes/{runtime_id}`.
- 2026-04-19: Delivery SDK verification passed with `pnpm --filter @arclayer/delivery-sdk test` and `pnpm --filter @arclayer/delivery-sdk typecheck`.
- 2026-04-19: Added `packages/delivery-sdk/src/graphql-query-input.ts` so frontend consumers can build schema-aware list query inputs from one shared helper instead of hand-coding filter/sort/pagination payloads.
- 2026-04-19: Epic4 final focused backend verification passed with 33 GraphQL tests across integration, service, artifacts, and subscription contracts.

---

## Final Summary

- **Total milestones**: 12
- **Completed**: 0
- **Failed + recovered**: 0
- **External unblock events**: 0
- **Total retries**: 0
- **Files created**: 3
- **Files modified**: 0
- **Key learnings**:
  - This child task inherits scope from the 2026-04-19 capability absorption implementation plan.
- **Recommendations for future tasks**:
  - Keep child progress and docs index aligned before execution starts.
