# Implementation Plan: Headless CMS Backend + SDK Commercial V1

关联 spec：
- [2026-04-17-headless-cms-backend-sdk-v1-spec.md](/home/philip/Arclayer/docs/superpowers/specs/2026-04-17-headless-cms-backend-sdk-v1-spec.md)
- [2026-04-17-headless-cms-v1-core-design.md](/home/philip/Arclayer/docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md)

日期：2026-04-17
状态：Ready for implementation
范围：Backend / Delivery / GraphQL / SDK / API Key / Release / Observability

## Overview

本计划把已确认的 Headless CMS Backend + SDK Commercial V1 spec 拆成可执行阶段。执行目标是把当前已有的 Headless CMS Core 基座推进为正式可交付的商业级后端主干，形成一条完整链路：

1. `Content Management API`
2. `Delivery API`
3. `GraphQL Query Layer`
4. `Management SDK`
5. `Delivery SDK`
6. `API Key / AuthZ / Scope System`

执行策略采用基础设施先行、交付闭环优先、SDK 后置封装的顺序。前端实现不在本计划范围内。

## Architecture Decisions

- `workspace = one site = one management boundary`
- `published` 与 `preview` 是唯一正式交付视角
- `GraphQL v1` 只提供 query，不提供 mutation
- API key 分成三类：`Personal Management Key`、`Workspace Service Key`、`Delivery Key`
- 发布模型采用 `workspace-scoped atomic release`
- GraphQL 对系统字段提供强类型，对扩展字段提供 `customFields` 容器
- 官方 SDK 首发只支持 `TypeScript`
- 实施中对过时路径做 `hard cut`，不保留兼容壳

## Dependency Graph

```text
release/key data model
    ->
authz/scopes/effective permission
    ->
management endpoints
    ->
delivery published/preview read model
    ->
graphql query layer
    ->
management sdk / delivery sdk
    ->
observability / benchmarks / release artifacts
```

执行顺序遵循这个依赖图，自底向上推进。

## Phase Summary

### Phase 1: Domain Foundations

- [ ] Task 1: API key domain model and hashing primitives
- [ ] Task 2: Scope evaluator and key authentication pipeline
- [ ] Task 3: Release model and published/preview read boundary

### Checkpoint: Foundations

- [ ] key secret 只在创建时返回一次
- [ ] key auth 可以计算 effective scopes
- [ ] published 与 preview 有清晰读边界

### Phase 2: Management Plane

- [ ] Task 4: API key management REST endpoints
- [ ] Task 5: Release publish and rollback endpoints
- [ ] Task 6: Management contract export and OpenAPI stabilization

### Checkpoint: Management Plane

- [ ] key create / revoke / rotate / list / audit 可验证
- [ ] publish / rollback / release list 可验证
- [ ] OpenAPI 可以稳定导出管理合同

### Phase 3: Delivery Plane

- [ ] Task 7: Published delivery REST resolve endpoints
- [ ] Task 8: Preview delivery REST and dependency error contracts
- [ ] Task 9: Global set and reusable section delivery endpoints

### Checkpoint: Delivery Plane

- [ ] `pages.resolve` published 链路稳定
- [ ] `pages.resolve` preview 链路稳定
- [ ] 依赖缺失错误有稳定 machine-readable contract

### Phase 4: GraphQL Query Layer

- [ ] Task 10: GraphQL server foundation and schema packaging
- [ ] Task 11: Structured content queries and delivery view queries

### Checkpoint: GraphQL

- [ ] GraphQL query auth 与 perspective 生效
- [ ] 系统字段强类型与 `customFields` 容器可验证

### Phase 5: Official SDKs

- [ ] Task 12: Scaffold `@arclayer/management-sdk`
- [ ] Task 13: Implement management SDK typed wrappers and errors
- [ ] Task 14: Scaffold `@arclayer/delivery-sdk`
- [ ] Task 15: Implement delivery SDK REST + GraphQL clients

### Checkpoint: SDKs

- [ ] 两个 SDK 都可 typecheck
- [ ] 两个 SDK 都有 smoke tests
- [ ] 两个 SDK 都有正式 examples

### Phase 6: Operational Readiness

- [ ] Task 16: Structured logs, audit events, and request id propagation
- [ ] Task 17: Performance baselines and benchmark verification
- [ ] Task 18: Final validation and release artifact alignment

### Checkpoint: Complete

- [ ] 所有一级交付物闭环完成
- [ ] 量化验收达到 `>= 90 / 100`
- [ ] spec / plan / repo truth 一致

## Task Details

### Task 1: API key domain model and hashing primitives

**Description:**
建立三类 API key 的底层数据模型、prefix 规则、hashed secret 存储和基础审计字段，作为后续鉴权、管理 API 和 SDK 的基础。

**Acceptance criteria:**
- [ ] 支持 `Personal Management Key`、`Workspace Service Key`、`Delivery Key` 三种 key type
- [ ] 服务端只保存 hashed secret 和 masked display token
- [ ] key record 具备 `name`、`description`、`created_by`、`last_used_at`、`expires_at`、`revoked_at`

**Verification:**
- [ ] Compile passes: `pnpm -C apps/api uv -- python -m compileall src/models src/modules src/migrations`
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/auth tests/modules/workspaces`

**Dependencies:** None

**Files likely touched:**
- `apps/api/src/models/content/_enums.py`
- `apps/api/src/models/content/publish_artifact.py`
- `apps/api/src/migrations/`
- `apps/api/src/modules/workspaces/authz/schema.py`
- `apps/api/tests/modules/workspaces/`

**Estimated scope:** Medium

### Task 2: Scope evaluator and key authentication pipeline

**Description:**
实现 `RBAC × Scopes` 的 effective permission 计算，把三类 key 接入统一鉴权链路，为 management、delivery、graphql 三个平面提供一致 principal 模型。

**Acceptance criteria:**
- [ ] `Personal Management Key` 权限上限受用户 workspace 成员权限约束
- [ ] `Workspace Service Key` 固定归属单个 workspace
- [ ] `Delivery Key` 只允许 `delivery.read` / `graphql.read`

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/auth tests/modules/workspaces`

**Dependencies:** Task 1

**Files likely touched:**
- `apps/api/src/modules/workspaces/authz/http/service.py`
- `apps/api/src/modules/workspaces/authz/schema.py`
- `apps/api/src/modules/workspaces/authz/router.py`
- `apps/api/src/common/constants/authz.py`
- `apps/api/tests/modules/workspaces/`

**Estimated scope:** Medium

### Task 3: Release model and published/preview read boundary

**Description:**
建立正式 `release` 读模型和 workspace-scoped atomic release 边界，让 `published` 总是读取最新成功 release，`preview` 总是读取最新草稿世界。

**Acceptance criteria:**
- [ ] release 具备完整 published snapshot 指针
- [ ] published 不读取 draft 世界
- [ ] preview 与 published 读取路径在服务层显式分离

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/sites`

**Dependencies:** Task 1

**Files likely touched:**
- `apps/api/src/models/content/published_graph.py`
- `apps/api/src/modules/sites/publishing/content_snapshot.py`
- `apps/api/src/modules/sites/publishing/service.py`
- `apps/api/src/modules/sites/content/delivery/service.py`
- `apps/api/tests/modules/sites/`

**Estimated scope:** Medium

## Checkpoint: Foundations

- [ ] key 数据模型、scope evaluator、release 读模型都落地
- [ ] 管理面、交付面都有可复用的 principal / perspective 基础
- [ ] 基础测试保持通过

### Task 4: API key management REST endpoints

**Description:**
新增 key 的创建、列出、查看、吊销、轮换、审计读取接口，形成管理面的正式 key 生命周期闭环。

**Acceptance criteria:**
- [ ] key create 只返回一次完整 secret
- [ ] revoke 与 rotate 合同稳定
- [ ] key audit 与 `last_used_at` 可读取

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces tests/modules/auth`
- [ ] OpenAPI exports: `pnpm -C apps/api openapi:sync`

**Dependencies:** Task 2

**Files likely touched:**
- `apps/api/src/modules/workspaces/api_keys/router.py`
- `apps/api/src/modules/workspaces/api_keys/service.py`
- `apps/api/src/modules/workspaces/api_keys/schema.py`
- `apps/api/src/core/routes.py`
- `apps/api/tests/modules/workspaces/`

**Estimated scope:** Medium

### Task 5: Release publish and rollback endpoints

**Description:**
把 publish、rollback、release list/read 变成正式管理 API，并保证发布事务按完整内容世界切换。

**Acceptance criteria:**
- [ ] publish 成功会生成新 release
- [ ] rollback 可以切回历史 release
- [ ] publish validation failure 返回稳定错误合同

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content tests/modules/sites`

**Dependencies:** Task 3

**Files likely touched:**
- `apps/api/src/modules/workspaces/releases/router.py`
- `apps/api/src/modules/workspaces/releases/service.py`
- `apps/api/src/modules/workspaces/releases/schema.py`
- `apps/api/src/modules/sites/publishing/router.py`
- `apps/api/tests/modules/workspaces/content/`

**Estimated scope:** Medium

### Task 6: Management contract export and OpenAPI stabilization

**Description:**
把新增管理面合同并入 OpenAPI 导出，保证生成物完整覆盖 key、release、settings 与 management auth 行为。

**Acceptance criteria:**
- [ ] OpenAPI 包含 key 与 release 正式接口
- [ ] 导出后的 generated client 不含 stale surface
- [ ] contract 变更进入版本化产物

**Verification:**
- [ ] Generate passes: `pnpm -C packages/openapi generate`
- [ ] Typecheck passes: `pnpm -C packages/openapi typecheck`

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `apps/api/scripts/export_openapi.py`
- `apps/api/scripts/sync_openapi_sdk.py`
- `packages/openapi/openapi-ts.config.ts`
- `packages/openapi/src/index.ts`
- `packages/openapi/README.md`

**Estimated scope:** Medium

## Checkpoint: Management Plane

- [ ] 管理 API 的 key / release 合同可调用
- [ ] OpenAPI 产物完整
- [ ] 管理面具备正式外部合同基础

### Task 7: Published delivery REST resolve endpoints

**Description:**
把 `published` 视角下的页面解析、页面按 id 读取做成正式 delivery REST 能力，并输出已经 flatten 的交付 JSON。

**Acceptance criteria:**
- [ ] `pages.resolve(path, perspective=published)` 返回 flatten 后页面文档
- [ ] `pages.byId(id, perspective=published)` 读取 release 世界
- [ ] published 世界只读取 release 快照

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites`

**Dependencies:** Task 3, Task 5

**Files likely touched:**
- `apps/api/src/modules/sites/delivery/router.py`
- `apps/api/src/modules/sites/delivery/schema.py`
- `apps/api/src/modules/sites/content/delivery/service.py`
- `apps/api/src/modules/sites/publishing/routes/service.py`
- `apps/api/tests/modules/sites/`

**Estimated scope:** Medium

### Task 8: Preview delivery REST and dependency error contracts

**Description:**
为 `preview` 视角实现完整读取路径，并补齐 `route_not_found`、`content_not_found`、`binding_resolution_failed`、依赖缺失等错误合同。

**Acceptance criteria:**
- [ ] `preview` 读取最新草稿世界
- [ ] route / record / binding 错误都有 machine-readable code
- [ ] key expired / revoked 行为在 delivery 平面一致

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites tests/modules/auth`

**Dependencies:** Task 2, Task 7

**Files likely touched:**
- `apps/api/src/modules/sites/delivery/router.py`
- `apps/api/src/modules/sites/preview/router.py`
- `apps/api/src/modules/sites/content/delivery/service.py`
- `apps/api/src/core/exceptions.py`
- `apps/api/tests/modules/sites/`

**Estimated scope:** Medium

### Task 9: Global set and reusable section delivery endpoints

**Description:**
为 layout slots 和 “万物皆 Section” 模型提供 `globalSets.resolve`、`sections.byAlias` 等交付入口，支撑 Header / Footer / reusable section 的正式 delivery 行为。

**Acceptance criteria:**
- [ ] `sections.byAlias` 支持 reusable section published/preview 读取
- [ ] `globalSets.resolve` 支持全局绑定读取
- [ ] Header / Footer 作为 section 实例进入同一 delivery 合同

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites tests/modules/workspaces/content`

**Dependencies:** Task 7

**Files likely touched:**
- `apps/api/src/modules/sites/delivery/router.py`
- `apps/api/src/modules/sites/delivery/schema.py`
- `apps/api/src/modules/sites/content/delivery/service.py`
- `apps/api/src/modules/workspaces/content/bindings/router.py`
- `apps/api/tests/modules/sites/`

**Estimated scope:** Medium

## Checkpoint: Delivery Plane

- [ ] Delivery REST 已覆盖 page / section / global set
- [ ] published 与 preview 行为稳定
- [ ] delivery key 可以完整驱动交付链路

### Task 10: GraphQL server foundation and schema packaging

**Description:**
引入 GraphQL server、基础 schema 装配、auth 接入和 perspective 输入合同，为 query-only GraphQL 建立正式入口。

**Acceptance criteria:**
- [ ] GraphQL endpoint 可用且只支持 query
- [ ] GraphQL auth 可识别 delivery key
- [ ] schema 产物可单独导出或快照化

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites tests/modules/auth`

**Dependencies:** Task 2, Task 7

**Files likely touched:**
- `apps/api/src/modules/sites/graphql/router.py`
- `apps/api/src/modules/sites/graphql/schema.py`
- `apps/api/src/modules/sites/graphql/service.py`
- `apps/api/src/core/routes.py`
- `apps/api/tests/modules/sites/`

**Estimated scope:** Medium

### Task 11: Structured content queries and delivery view queries

**Description:**
实现 `Article`、`Page`、`Section`、`Category` 的 query schema、分页过滤排序，以及页面解析后的只读 delivery view 查询。

**Acceptance criteria:**
- [ ] 系统字段是强类型
- [ ] `customFields` 容器可以读取扩展字段
- [ ] GraphQL query 支持 published / preview perspective

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/sites tests/modules/workspaces/content`

**Dependencies:** Task 10

**Files likely touched:**
- `apps/api/src/modules/sites/graphql/schema.py`
- `apps/api/src/modules/sites/graphql/service.py`
- `apps/api/src/modules/sites/content/delivery/service.py`
- `apps/api/src/modules/workspaces/content/views/service.py`
- `apps/api/tests/modules/sites/`

**Estimated scope:** Medium

## Checkpoint: GraphQL

- [ ] GraphQL query layer 已正式成型
- [ ] perspective、auth、typed system fields 合同稳定
- [ ] GraphQL 进入外部消费能力集合

### Task 12: Scaffold `@arclayer/management-sdk`

**Description:**
创建正式管理 SDK package，建立 package 边界、tsconfig、入口文件、测试基线和与现有 `packages/openapi` 的引用关系。

**Acceptance criteria:**
- [ ] `packages/management-sdk` 可安装、可 typecheck
- [ ] package 边界与 `packages/openapi` 清晰
- [ ] SDK 测试基线可执行

**Verification:**
- [ ] Typecheck passes: `pnpm --filter @arclayer/management-sdk typecheck`
- [ ] Tests pass: `pnpm --filter @arclayer/management-sdk test`

**Dependencies:** Task 6

**Files likely touched:**
- `packages/management-sdk/package.json`
- `packages/management-sdk/tsconfig.json`
- `packages/management-sdk/src/index.ts`
- `packages/management-sdk/tests/smoke.test.ts`
- `pnpm-workspace.yaml`

**Estimated scope:** Medium

### Task 13: Implement management SDK typed wrappers and errors

**Description:**
基于 OpenAPI 生成物实现管理 SDK 的 typed wrappers、auth helpers、typed errors、pagination helpers 和最小正式示例。

**Acceptance criteria:**
- [ ] SDK 暴露稳定 client factory
- [ ] SDK 提供 typed errors 与 auth helpers
- [ ] SDK 覆盖 key / release 管理主路径

**Verification:**
- [ ] Typecheck passes: `pnpm --filter @arclayer/management-sdk typecheck`
- [ ] Tests pass: `pnpm --filter @arclayer/management-sdk test`

**Dependencies:** Task 12

**Files likely touched:**
- `packages/management-sdk/src/index.ts`
- `packages/management-sdk/src/client.ts`
- `packages/management-sdk/src/errors.ts`
- `packages/management-sdk/src/helpers.ts`
- `packages/management-sdk/tests/smoke.test.ts`

**Estimated scope:** Medium

### Task 14: Scaffold `@arclayer/delivery-sdk`

**Description:**
创建正式 delivery SDK package，建立 Node/Edge/browser-safe 运行时边界、入口文件和测试基线。

**Acceptance criteria:**
- [ ] `packages/delivery-sdk` 可安装、可 typecheck
- [ ] package 声明 Node + Edge + browser-safe 定位
- [ ] SDK 测试基线可执行

**Verification:**
- [ ] Typecheck passes: `pnpm --filter @arclayer/delivery-sdk typecheck`
- [ ] Tests pass: `pnpm --filter @arclayer/delivery-sdk test`

**Dependencies:** Task 9, Task 11

**Files likely touched:**
- `packages/delivery-sdk/package.json`
- `packages/delivery-sdk/tsconfig.json`
- `packages/delivery-sdk/src/index.ts`
- `packages/delivery-sdk/tests/smoke.test.ts`
- `pnpm-workspace.yaml`

**Estimated scope:** Medium

### Task 15: Implement delivery SDK REST + GraphQL clients

**Description:**
实现 delivery SDK 的 REST resolve helpers、GraphQL query client、preview/published helpers、typed errors 和示例。

**Acceptance criteria:**
- [ ] SDK 支持 `pages.resolve`
- [ ] SDK 支持 GraphQL query 执行
- [ ] SDK 支持 delivery key 鉴权与 perspective helpers

**Verification:**
- [ ] Typecheck passes: `pnpm --filter @arclayer/delivery-sdk typecheck`
- [ ] Tests pass: `pnpm --filter @arclayer/delivery-sdk test`

**Dependencies:** Task 14

**Files likely touched:**
- `packages/delivery-sdk/src/index.ts`
- `packages/delivery-sdk/src/rest-client.ts`
- `packages/delivery-sdk/src/graphql-client.ts`
- `packages/delivery-sdk/src/errors.ts`
- `packages/delivery-sdk/tests/smoke.test.ts`

**Estimated scope:** Medium

## Checkpoint: SDKs

- [ ] 两个官方 SDK 都已具备正式 package 边界
- [ ] 管理面和交付面都有 typed client 与 typed errors
- [ ] examples 与 smoke tests 具备发布最低标准

### Task 16: Structured logs, audit events, and request id propagation

**Description:**
把 key lifecycle、publish/rollback、delivery resolve、GraphQL query 的审计事件、structured logs、request id 串起来。

**Acceptance criteria:**
- [ ] key 使用、吊销、轮换都会产生日志与审计事件
- [ ] publish / rollback / delivery / graphql 都带 request id
- [ ] 关键外部调用可关联到 actor、key、workspace、scope

**Verification:**
- [ ] Tests pass: `timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/auth tests/modules/sites tests/modules/workspaces`

**Dependencies:** Task 4, Task 5, Task 7, Task 10

**Files likely touched:**
- `apps/api/src/core/middleware/`
- `apps/api/src/modules/workspaces/api_keys/service.py`
- `apps/api/src/modules/workspaces/releases/service.py`
- `apps/api/src/modules/sites/delivery/router.py`
- `apps/api/src/modules/sites/graphql/service.py`

**Estimated scope:** Medium

### Task 17: Performance baselines and benchmark verification

**Description:**
建立 `pages.resolve`、GraphQL 单查询、key 鉴权开销三条性能基线，形成可重复执行的 benchmark 或 test harness。

**Acceptance criteria:**
- [ ] `pages.resolve` p95 `< 200ms` 有本地标准数据集验证
- [ ] GraphQL 单查询 p95 `< 300ms` 有标准查询模板验证
- [ ] key 鉴权附加开销 p95 `< 20ms` 有可重复测量方式

**Verification:**
- [ ] Benchmarks recorded: `pnpm -C apps/api uv -- pytest -q tests/modules/sites`
- [ ] Results written to benchmark artifact under `docs/plans/2026-04-17-headless-cms-backend-sdk-v1/`

**Dependencies:** Task 8, Task 11, Task 16

**Files likely touched:**
- `apps/api/tests/modules/sites/`
- `apps/api/tests/modules/auth/`
- `docs/plans/2026-04-17-headless-cms-backend-sdk-v1/`

**Estimated scope:** Small

### Task 18: Final validation and release artifact alignment

**Description:**
执行最终全链路验证，确保 OpenAPI、GraphQL schema、两个 SDK、spec、plan 与 repo truth 一致，并记录验收分数。

**Acceptance criteria:**
- [ ] `pnpm api:check` 通过
- [ ] `pnpm -C packages/openapi generate` 通过
- [ ] 两个 SDK typecheck + test 通过
- [ ] 最终验收评分 `>= 90 / 100`

**Verification:**
- [ ] Check passes: `pnpm api:check`
- [ ] Generate passes: `pnpm -C packages/openapi generate`
- [ ] SDK checks pass: `pnpm --filter @arclayer/management-sdk typecheck && pnpm --filter @arclayer/delivery-sdk typecheck`

**Dependencies:** Task 13, Task 15, Task 16, Task 17

**Files likely touched:**
- `docs/superpowers/specs/2026-04-17-headless-cms-backend-sdk-v1-spec.md`
- `docs/plans/2026-04-17-headless-cms-backend-sdk-v1/implementation-plan.md`
- `packages/openapi/`
- `packages/management-sdk/`
- `packages/delivery-sdk/`

**Estimated scope:** Medium

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GraphQL server 选型和 FastAPI 集成细节会拖慢前两阶段 | High | 在 Task 10 前完成最小技术 spike，并保持 GraphQL 只做 query |
| release snapshot 与当前发布实现存在数据模型偏差 | High | 先完成 Task 3 和 Task 5，再推进 delivery/GraphQL |
| API key 模型与现有 authz/member 体系耦合深 | High | 在 Task 2 先做独立 effective permission evaluator，再接各平面 |
| OpenAPI 生成产物容易发生 stale drift | Medium | 每完成一个 management contract phase 就立即跑 `packages/openapi generate` |
| SDK 包结构引入后可能影响 workspace scripts | Medium | 先做 package scaffold，再加 scripts 和 tests |
| 当前工作区已有未跟踪 migration 文件 | Medium | 执行阶段严格区分本轮任务改动和已有迁移修复改动，提交前单独审查 |

## Open Questions To Resolve In Implementation

1. GraphQL server implementation 选型
2. GraphQL codegen 产物与 `packages/openapi` 的目录关系
3. release rollback 的对外 REST path 细节

## Execution Notes

- 本计划只覆盖后端与 SDK，不包含 Admin UI 深化实现。
- 每完成一个 phase 都需要做真实验证，并把结果回写到本目录后续文档中。
- 进入执行阶段时，建议继续用 `taskmaster` 维护 phase truth 与进度文件。
