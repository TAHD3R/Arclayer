# Spec: Arclayer Headless CMS Backend + SDK Commercial V1

日期：2026-04-17
状态：Draft for implementation planning
范围：Backend / Delivery / GraphQL / SDK / API Key / Publish semantics

## Objective

本 spec 定义 Arclayer Headless CMS 第二阶段的正式后端与 SDK 交付合同。

本阶段目标是把当前已经存在的 Headless CMS Core 基座，推进为一套商业级可用的内容平台主干，交付以下六个一级能力：

1. `Content Management API`
2. `Delivery API`
3. `GraphQL Query Layer`
4. `Management SDK`
5. `Delivery SDK`
6. `API Key / AuthZ / Scope System`

目标用户有三类：

- 使用管理 API 和管理 SDK 的开发者、CLI、自动化脚本
- 使用 Delivery REST / GraphQL / Delivery SDK 的应用开发者
- 使用 API keys、发布、preview、审计能力的团队与平台集成方

成功标志是：

- 内容管理、交付、发布、预览、GraphQL 查询、SDK 使用、密钥治理形成完整闭环
- Published / Preview 拥有稳定、一致、可缓存、可回滚的正式合同
- 官方 TypeScript SDK 达到成熟商业产品可用水平
- 整体验收评分达到 `>= 90 / 100`

## Scope

本阶段包含：

- Workspace 级内容管理 API
- Published / Preview 交付 REST API
- Read-only GraphQL 查询层
- Personal / Workspace / Delivery 三类 API Key
- Workspace-scoped atomic release 发布语义
- 两个官方 TypeScript SDK
- OpenAPI 与 GraphQL schema 的正式版本化产物

本阶段明确排除：

- 前端 Admin IA 与可视化编辑器深化实现
- 自定义模型系统
- Datasets 正式对象化
- GraphQL mutations
- 非 TypeScript 官方 SDK
- AI 站点生成和 AI session materialization

## Locked Product Decisions

以下决策已确认，属于正式合同：

### Platform Boundary

- `workspace = one site = one management boundary`
- `organization` 继续承载账户、billing、plan 壳
- `dataset` 暂缓到 `v2+`

### Delivery Perspectives

- `published`：只读取已发布 release
- `preview`：只读取当前最新草稿世界

### GraphQL Boundary

- `GraphQL v1` 为 read-only query layer
- 所有 mutations 保留在 `Management REST/OpenAPI`

### API Key Families

- `Personal Management Key`
- `Workspace Service Key`
- `Delivery Key`

### SDK Product Shape

- `@arclayer/management-sdk`
- `@arclayer/delivery-sdk`
- 官方 SDK 语言首发只支持 `TypeScript`

### Publish Model

- 采用 `workspace-scoped atomic release`
- `published perspective` 始终读取最新成功 release
- 发布切换单位是完整内容世界

### GraphQL Type Strategy

- `Article`、`Page`、`Section`、`Category` 的系统字段走强类型 schema
- 用户扩展字段进入显式 `customFields` 容器

## Repo Truth Baseline

当前仓库已经具备以下基座：

- `apps/api` 已存在内容域模型、内容管理模块、delivery 路由与发布快照相关模块
- `packages/openapi` 已存在 OpenAPI 导出与生成式 client 基线
- Headless CMS Core 的官方模型协议、路由匹配、single primary context、server-side flattening 已有基础实现

当前仓库尚未具备以下完整正式能力：

- 商业级 GraphQL query layer
- 正式 API key 治理系统
- 正式 `@arclayer/management-sdk`
- 正式 `@arclayer/delivery-sdk`
- 完整 published / preview / release / rollback 交付闭环

## Tech Stack

现有基础栈：

- Backend：`FastAPI` + `Pydantic v2` + `Tortoise ORM`
- Monorepo：`pnpm workspaces` + `Turborepo`
- OpenAPI generation：`@hey-api/openapi-ts`
- SDK language：`TypeScript`

本阶段技术方向：

- Management API：继续基于 `FastAPI` + `Pydantic v2`
- Delivery REST：继续基于 `FastAPI`
- GraphQL：接入 FastAPI 兼容的 GraphQL server implementation，提供 read-only schema
- SDK generation：
  - Management：以 OpenAPI 为基础生成与包装
  - Delivery：以 hand-written client + generated GraphQL types 为主

实现计划默认采用以下技术假设，进入计划阶段后再落到具体库选型：

- GraphQL server 选择一套 FastAPI 集成良好的 Python 实现
- GraphQL client types 采用 codegen 生成
- SDK transport 默认基于 `fetch` 兼容接口

## Commands

### Current Baseline Commands

以下命令已经存在，作为当前 repo truth：

```bash
pnpm api:check
pnpm check
pnpm -C apps/api dev
pnpm -C apps/api db:upgrade
pnpm -C apps/api openapi:sync
pnpm -C packages/openapi generate
pnpm -C apps/api test
pnpm -C apps/api test:integration
```

### Completion Commands

以下命令在本阶段完成时必须存在并可执行：

```bash
pnpm api:check
pnpm -C packages/openapi generate
pnpm --filter @arclayer/management-sdk typecheck
pnpm --filter @arclayer/management-sdk test
pnpm --filter @arclayer/delivery-sdk typecheck
pnpm --filter @arclayer/delivery-sdk test
pnpm check
```

### Focused Verification Commands

后端实现和验收期间优先使用窄验证：

```bash
pnpm -C apps/api uv -- python -m compileall src/models src/modules src/migrations
pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content
pnpm -C apps/api uv -- pytest -q tests/modules/sites
pnpm -C apps/api uv -- pytest -q tests/modules/auth
```

## Project Structure

### Existing Core Paths

```text
apps/api/src/models/content/                         -> 内容域持久化模型
apps/api/src/modules/workspaces/content/            -> workspace 管理平面内容模块
apps/api/src/modules/sites/delivery/                -> delivery REST 现有入口
apps/api/src/modules/sites/publishing/              -> 发布与快照相关实现
packages/openapi/                                   -> OpenAPI 导出与生成 client 基线
docs/superpowers/specs/                             -> 产品与架构 spec
```

### Target Structure By Completion

```text
apps/api/src/modules/workspaces/content/            -> Management API 主体
apps/api/src/modules/sites/delivery/                -> Delivery REST 主体
apps/api/src/modules/sites/graphql/                 -> GraphQL Query Layer
apps/api/src/modules/workspaces/api_keys/           -> Personal / Workspace / Delivery key 管理
apps/api/src/modules/workspaces/releases/           -> publish / rollback / release read model
apps/api/src/models/content/                        -> release, key, audit, delivery 相关模型扩展
packages/openapi/                                   -> 管理 API schema 与生成 client
packages/management-sdk/                            -> 正式管理 SDK
packages/delivery-sdk/                              -> 正式交付 SDK
docs/superpowers/specs/                             -> 正式合同文档
docs/plans/                                         -> 实施计划与阶段拆解
```

## Formal Contract Boundaries

### 1. Content Management API

职责：

- 管理 `Article` / `Page` / `Reusable Section` / `Category`
- 管理官方模型扩展字段
- 管理 route / binding / layout slot / global set 绑定
- 管理 draft、publish、rollback、release 元数据
- 管理 API keys

合同：

- 管理平面统一走 `REST/OpenAPI`
- 所有管理写操作都以 `workspace` 为边界
- `Delivery Key` 不进入 management 平面
- `Personal Management Key` 和 `Workspace Service Key` 使用统一 scopes 系统

### 2. Delivery API

职责：

- 提供高确定性交付接口
- 返回已完成 `server-side flattening` 的交付 JSON
- 显式暴露 `published` / `preview` 两个 perspective

首发能力：

- `pages.resolve(path, perspective)`
- `pages.byId(id, perspective)`
- `sections.byAlias(alias, perspective)`
- `globalSets.resolve(key, perspective)`

合同：

- `published` 永远读取 release 快照
- `preview` 永远读取最新草稿图
- Delivery REST 返回的是最终可消费视图，不要求调用方再执行模板求值

### 3. GraphQL Query Layer

职责：

- 提供开发者自定义查询
- 支持结构化内容查询、关系字段查询、分页、排序、过滤、字段选择
- 支持查询页面解析后的只读 delivery view

合同：

- `v1` 只支持 query
- 不支持 mutation
- 与 Delivery REST 共享相同的 `published` / `preview` perspective 语义
- 系统字段强类型，扩展字段进入 `customFields`

### 4. API Key / AuthZ / Scope System

正式密钥族：

- `Personal Management Key`
- `Workspace Service Key`
- `Delivery Key`

正式权限模型：

- `effective permission = principal boundary × workspace boundary × scopes`
- `Personal Management Key`
  - 权限上限继承用户在目标 workspace 的真实成员权限
- `Workspace Service Key`
  - 权限边界固定在单个 workspace
- `Delivery Key`
  - 只允许 delivery / graphql read scopes

首发 scopes：

- `content.read`
- `content.write`
- `models.read`
- `models.write`
- `delivery.read`
- `graphql.read`
- `keys.read`
- `keys.write`
- `settings.read`
- `settings.write`

密钥生命周期：

- secret 只在创建时返回一次
- 服务端只存 `hashed secret`
- key 使用稳定前缀：
  - `ark_mgmt_`
  - `ark_ws_`
  - `ark_deliv_`
- 每个 key 都有：
  - `name`
  - `description`
  - `created_by`
  - `last_used_at`
  - `expires_at`
  - `revoked_at`
- 轮换语义：
  - `create new key + revoke old key`

### 5. Management SDK

产品定义：

- 包名：`@arclayer/management-sdk`
- 语言：`TypeScript`
- 运行时：`Node.js`
- 数据源：`REST/OpenAPI`

必须覆盖：

- 内容管理 API
- 模型治理 API
- 发布与 release API
- API key 管理 API
- 站点级 settings 管理 API

SDK 基线：

- typed client
- typed errors
- auth helpers
- pagination helpers
- request id exposure
- examples 与 recipes

### 6. Delivery SDK

产品定义：

- 包名：`@arclayer/delivery-sdk`
- 语言：`TypeScript`
- 运行时：`Node.js` + `Edge` + 浏览器安全场景
- 数据源：`Delivery REST + GraphQL Query`

必须覆盖：

- `pages.resolve`
- structured content query
- `published` / `preview` perspective
- delivery key auth
- GraphQL query execution helper

SDK 基线：

- typed responses
- typed GraphQL document support
- preview / published helpers
- auth helpers
- consistent error model
- examples 与 recipes

## Publish / Release Contract

发布模型采用 `workspace-scoped atomic release`。

正式规则：

- 每次发布生成一个新的 `release`
- `release` 是 workspace 在某个时间点的完整已发布内容世界
- `published perspective` 始终读取最新成功 `release`
- Page、Section、Global Set、模型合同快照、路由表、绑定关系在同一个发布事务里切换
- 任一依赖校验失败，整个发布事务失败
- rollback 通过切换 `release` 完成

发布前校验至少包含：

- route uniqueness
- route conflict resolution correctness
- props mapping completeness
- source model and primary record integrity
- referenced section / global set existence
- published world dependency closure

## Versioning and Compatibility

本阶段采用以下版本规则：

- Management REST：继续挂在现有版本化 API 前缀下
- Delivery REST：正式定义为外部消费合同，进入版本治理
- GraphQL schema：每次 breaking change 都需要 schema version bump 与 changelog
- `@arclayer/management-sdk` 与 `@arclayer/delivery-sdk` 独立 semver
- OpenAPI 产物与 GraphQL schema 产物都进入版本化输出

## Error Contract

所有正式外部接口都需要稳定错误模型，至少覆盖：

- `unauthorized`
- `forbidden`
- `insufficient_scope`
- `invalid_perspective`
- `route_not_found`
- `content_not_found`
- `release_not_found`
- `binding_resolution_failed`
- `publish_validation_failed`
- `key_revoked`
- `key_expired`

统一要求：

- HTTP 层暴露稳定 machine-readable code
- SDK 层暴露 typed error classes 或 discriminated error unions
- request id 在响应与日志中可关联

## Code Style

核心风格：薄 router、清晰服务边界、显式合同类型、无 silent fallback、无兼容双轨。

Python backend 示例：

```python
@router.post(
    "/workspaces/{workspace_id}/api-keys",
    response_model=CreateApiKeyOut,
    tags=["domain.workspaces.api_keys"],
)
async def create_workspace_api_key(
    workspace_id: PublicUUID,
    payload: CreateApiKeyIn,
    actor: AuthenticatedActor = Depends(require_authenticated_actor),
) -> CreateApiKeyOut:
    """Create a workspace-scoped API key."""

    return await api_key_service.create_workspace_key(
        workspace_id=workspace_id,
        payload=payload,
        actor=actor,
    )
```

TypeScript SDK 示例：

```ts
export async function resolvePage(
  client: DeliveryClient,
  input: ResolvePageInput,
): Promise<ResolvedPage> {
  const response = await client.get("/pages/resolve", {
    query: {
      path: input.path,
      perspective: input.perspective,
    },
  });

  return response.data;
}
```

实现约束：

- backend 严格遵守 router / service / repository / schema 分层
- 不在 router 里直接调用 repository
- 所有外部合同都使用显式 Pydantic / TypeScript types
- 只在真正需要时引入新抽象
- 删除过时路径与兼容壳

## Testing Strategy

### Backend

- 测试框架：`pytest`
- 位置：`apps/api/tests/**`
- 层级：
  - unit：策略、鉴权、release planning、binding flattening、scope calculation
  - integration：content management、publish、rollback、delivery resolve、GraphQL query、key lifecycle
  - contract：OpenAPI export、GraphQL schema snapshot、SDK smoke paths

### SDK

- 测试框架：`vitest`
- 位置：
  - `packages/management-sdk/tests/**`
  - `packages/delivery-sdk/tests/**`
- 层级：
  - unit：client config、auth helpers、error mapping、pagination helpers
  - integration：against local API test app
  - smoke：published / preview / GraphQL / key auth happy path

### Coverage and Gates

- backend 核心域单元测试覆盖率 `>= 85%`
- 关键链路必须有 integration tests：
  - publish
  - rollback
  - pages.resolve
  - GraphQL query
  - key create / revoke / rotate / audit
- backend 单元测试执行必须遵守 `60s` 硬超时
- SDK typecheck 与 tests 为正式发布门槛

## Boundaries

### Always

- 保持 `workspace` 作为唯一管理边界
- 保持 GraphQL 为 read-only query layer
- 保持 `published` / `preview` 双视角语义稳定
- 以 hard cut 方式移除过时路径
- 为所有正式外部合同提供版本化产物
- 为关键链路补全 automated verification
- 为 key / publish / delivery / GraphQL 记录审计与结构化日志

### Ask First

- 引入新的基础设施依赖
- 调整数据库表命名空间规则
- 引入 datasets、service accounts、OAuth machine auth
- 扩展官方 SDK 到 TypeScript 之外的语言
- 修改现有公共 API 路径与版本前缀

### Never

- 存储明文 key secret
- 为赶进度加入 silent fallback 或 fake success
- 在 v1 引入 GraphQL mutations
- 在 delivery 平面读取 management draft 状态的半成品依赖图
- 保留旧路径和新路径并行的兼容壳

## Success Criteria

### Functional Completion

- `Content Management API` 完整覆盖正式管理能力
- `Delivery API` 完整覆盖正式交付能力
- `GraphQL Query Layer` 完整覆盖正式查询能力
- `Management SDK` 达到正式可发布状态
- `Delivery SDK` 达到正式可发布状态
- `API Key / AuthZ / Scope System` 达到正式可发布状态

### Quantitative Acceptance

- backend 核心域单元测试覆盖率 `>= 85%`
- `pages.resolve` p95 `< 200ms`，基于标准本地测试数据集
- GraphQL 单查询 p95 `< 300ms`，基于标准查询模板
- key 鉴权附加开销 p95 `< 20ms`
- 两个 SDK 都具备 typed client、typed errors、auth helpers、examples、smoke tests
- OpenAPI 与 GraphQL schema 都具备版本化产物与变更记录
- key create / revoke / rotate / audit 全链路可验证
- publish / rollback / preview / published 四条链路可验证
- 关键 API 具备 structured logs、request id、audit event

### 90+ Scoring Rubric

总分 `100`，通过线 `90`：

- `Content Management API`：20
- `Delivery API`：20
- `GraphQL Query Layer`：15
- `API Key / AuthZ / Scope System`：15
- `Management SDK + Delivery SDK`：20
- `Testing / Observability / Docs / Release readiness`：10

低于 `90` 视为未达到本阶段交付标准。

## Open Questions

以下问题不阻塞 spec 审批，进入计划阶段定稿：

1. GraphQL server implementation 的具体库选型
2. GraphQL 分页合同采用 cursor-based 还是混合策略
3. SDK 与 schema 的生成链路放在现有 `packages/openapi` 旁边还是拆成独立 codegen package
