# 项目开发规范

本项目为混合架构 Monorepo：

- 服务端：FastAPI (0.128)
- 前端：Vite 7 + React 19（Admin / Portal）
- 目标：低耦合、插件化、支持可视化编辑的现代化 SaaS / 自托管 CMS

---

## 全局约定

### 目录约定

- `apps/api`：FastAPI 服务端
- `apps/admin`：Admin 前端
- `apps/portal`：Portal 前端
- `plugins`：插件目录
- `packages`：跨应用复用包（协议、类型、运行时能力、主题等）

### 命令执行规范（强制）

项目由 Turborepo 统一编排，必须通过 `package.json` scripts 执行命令。

- 必须使用 `pnpm <script>`、`pnpm --filter <pkg> <script>` 或 `pnpm -C <dir> <script>`。
- 禁止直接调用 `.venv` 下二进制（如 `.venv/bin/pyright`、`.venv/bin/pytest`）。
- 禁止绕过脚本入口直接手拼环境变量执行（除排障且已在评审中说明原因）。

推荐命令模板：

- 全局开发：`pnpm dev` / `pnpm dev:full`
- 后端开发：`pnpm api`
- 后端质量：`pnpm api:check`、`pnpm api:test`
- 前端质量：`pnpm admin:check`、`pnpm portal:check`
- 定向执行：`pnpm --filter @celestial/api typecheck`
- 子包执行：`pnpm -C apps/api typecheck`
- 后端临时命令（必须走脚本）：`pnpm -C apps/api uv -- <command>`

### 核心原则

- KISS：优先简单、可读、可维护
- YAGNI：未确认需求不提前实现
- DRY：可复用逻辑必须抽象，禁止复制粘贴扩散
- SOLID：职责单一、面向扩展、可测试

### 工程行为准则

- 新增文件必须回答：属于哪个模块、为什么放在这里、未来如何维护。
- 新增目录（尤其跨模块）必须补最小说明（README 或 docs 条目）。
- 写工具方法或辅助函数前，先全局检索是否已有等效实现；可复用则直接复用。
- 禁止“能跑但不可维护”的实现（过度技巧化、语义不清、调试困难）。
- 禁止把多职责揉进单体大文件；出现职责分叉时立即拆分。
- 全局注释、日志与技术文档使用英文。

### 进一步说明文档

- Guideline 索引：`docs/guidelines/README.md`
- API 契约规范：`docs/guidelines/api-contract-guideline.md`
- i18n 详细说明：`docs/guidelines/i18n.md`
- FastAPI 目录架构：`docs/guidelines/backend-folder-architecture.md`
- 前端目录架构：`docs/guidelines/frontend-folder-architecture.md`
- 前端设计规范：`docs/guidelines/design-guideline.md`
- 安全与数据处理规范：`docs/guidelines/security-and-data-handling.md`
- 测试与质量门禁：`docs/guidelines/testing-and-quality-gates.md`

---

## 服务端约定

### 架构与分层

- 每个 API 模块必须分层：`router` / `service` / `repository` / `schema`。
- `router` 仅作薄入口：参数解析、鉴权依赖、`response_model` 绑定、`summary`/`description`。
- 业务逻辑与异常处理放在 `service`，数据访问放在 `repository`。
- `service` 与 `repository` 必须继承 `BaseService`、`BaseRepository`。
- 禁止 Router 直接调用 Repository，必须经 Service。

### 公共能力与代码组织

- 通用代码、常量、枚举、协议、基础类型统一优先放 `apps/api/common/*`。
- 避免通用能力散落在各模块内部；跨领域复用能力必须上提到 `common`。
- 拒绝单体大文件：当文件出现多职责或维护困难时必须拆分。
- 能复用的代码片段绝不重复编写。

### Schema 与 API 输出规范（强制）

- `schema` 使用 Pydantic v2，统一放在 `schema` 层，禁止 dataclass 作为 API schema。
- 统一继承 `BaseSchema`，必要时复用 `BaseOut`、`IdMixin`、`TimestampMixin`。
- 字段必须通过 `Field` 提供约束、description、example。
- 复杂校验使用 `field_validator` / `model_validator` / `model_config`。
- 禁止在 API 层手写 JSON 业务输出（如 `return {"items": ...}`）。
- 列表接口统一使用 `ResponseModel[PageData[T]]`，禁止 `ResponseModel[list[T]]`。
- 输入/输出只要可被 Pydantic 表达，就必须落在 Schema 上。

### PublicUUID（外部 ID）规范（强制）

- 对外 API 的 path/query/body/response 中，实体 ID 必须使用 `PublicUUID`。
- 禁止向客户端暴露 raw UUID（数据库内部主键）。
- Router 参数与 Schema 字段统一使用 `apps/api/common/types/public_uuid.py` 中的 `PublicUUID`。
- Raw UUID 输入容忍仅限受控 dev/test 配置；生产环境不作为常规契约。
- 日志中的 ID 必须脱敏或使用公开 ID 语义，避免泄露内部主键。

### 异步、稳定性与可观测性

- 所有 I/O 操作使用 async/await；禁止同步数据库/Valkey 调用。
- 并发任务要有边界（超时、取消、异常回收），禁止无控制 `gather`。
- 外部依赖调用（邮件/存储/插件回调）必须定义失败策略（重试/降级/告警）。
- 全项目统一结构化日志，关键上下文至少包含：`request_id`、`user_id`、`entity_id`、`org_id`、`action`。
- 禁止静默吞错（如 `except Exception: pass`）。
- BackgroundTasks 必须捕获异常，避免主流程崩溃。

### 认证与安全

- Refresh Token 旋转、复用检测、`token_version` 失效机制必须启用。
- 退出登录必须使 Token 失效（提升 `token_version` + revoke refresh）。
- 敏感信息必须脱敏存储与输出，禁止明文存储与响应泄露。

### i18n

- 用户可见文案必须使用 `t()`，禁止硬编码。
- 通用文案维护在 `locales/<locale>/*.json`。
- 插件文案维护在 `plugins/<plugin_id>/locales/<locale>/*.json` 并由系统合并。
- 新增词条需同时补齐 `zh-CN` 与 `en-US`，并保持 key 一致。
- 异步任务（如邮件）必须显式传递 locale。

### Pyright（Tortoise ORM）修复规范（精简版）

- Pyright 配置唯一来源是根目录 `pyproject.toml`；禁止新增 `pyrightconfig.json`。
- 禁止通过给 Tortoise 模型补字段注解修复类型问题。
- 禁止在模型中使用 `if TYPE_CHECKING` 影子属性兜底。
- 禁止 `type: ignore`、大范围 `Any`、`cast(Any, ...)` 这类绕过手段。
- 推荐在“使用点”使用最小 `Protocol + cast` 收敛类型。
- Tortoise 相关协议统一收敛在 `apps/api/common/protocols/tortoise.py`。
- 类型检查命令必须通过 package scripts 执行（遵循本文“命令执行规范”）。

### 测试与质量门禁

- 覆盖单元与集成测试（单测 70%-90%，集成 40%-60%）。
- 路径覆盖优先于行覆盖，核心逻辑优先。
- Python 代码必须通过 Ruff、Pyright 与测试。

### 文档与接口语义

- API 文档字段说明必须使用英文。
- 端点必须提供 `summary`，必要时补充 `description`。
- 返回正确且合理的 HTTP 状态码，并保持幂等语义一致。

### 服务端强制要求

- 使用 Pydantic v2 语法（`field_validator`、`model_validator`、`model_config`）。
- 使用 `Annotated` 依赖注入。
- 使用 `X | None`，避免 `Optional[X]`。
- 高频接口必须接入 `fastapi-limiter`（受 `VALKEY__ENABLED` 与 `VALKEY__LIMITER_ENABLED` 控制）。

### 服务端强制拒绝

- 同步方式操作数据库/Valkey。
- 跳过 Pydantic 校验。
- 在 Response 暴露敏感信息。
- 使用 Pydantic v1 语法（`@validator`、`class Config`）。
- 不正确混用 sync/async。
- 硬编码配置项。

---

## 前端约定

### 架构与目录

- `apps/admin` 与 `apps/portal` 必须保持模块边界清晰，禁止循环依赖。
- `src/api` 负责请求封装与数据清洗，组件层禁止直接处理原始响应字典。
- `src/components` 管理可复用组件；业务组件优先放 `components/common`。
- `src/types` 统一管理应用内类型；新增类型禁止零散定义。
- `src/hooks` 仅放全局通用 hooks；业务 hooks 留在业务目录。
- `src/stores` 仅管理必要 UI 状态，Server State 必须用 React Query。
- `src/routes/` 仅承载路由配置（`validateSearch`、`beforeLoad`）和懒加载组件绑定，禁止编写业务逻辑、API 调用、复杂 JSX 或状态 Hook。

### Admin / Portal 共享提升规则（项目特化）

- 跨 Admin 与 Portal 的复用代码出现第 2 次时，必须评估并优先提升到 `packages/`。
- 无 UI 依赖的运行时能力放 `packages/core/runtime`。
- 跨应用共享类型/接口契约优先放到语义明确的 `packages/protocols/*`；仅单应用使用的类型留在各自 `src/types`。
- 禁止在 `apps/admin` 与 `apps/portal` 复制粘贴同类工具函数、常量、类型。

### 类型与可维护性

- 项目强类型约束：严禁 `any`（包含显式与隐式）。
- 必须为所有组件 Props 定义 `interface` 或 `type`。
- 可用 `unknown` + 类型收窄，也不要用 `any`。
- 拒绝“能解决问题但不符合人类编码习惯”的代码（晦涩、难读、难测）。

### 核心技术要求

- 优先 `useActionState`、`useOptimistic` 处理提交与乐观更新。
- 异步 I/O 配合 `Suspense` + `ErrorBoundary`。
- **Server State**：统一 `@tanstack/react-query`，禁止镜像到全局 Store。
- **UI State**：优先局部 `useState`，跨组件共享才使用 Zustand。
- 所有 API 方法必须显式返回类型：`async function getData(): Promise<T>`。

### 表单、错误与交互

- 所有表单必须接入 `React Hook Form` + `Zod`，并与后端 Schema 语义对齐。
- API 请求必须处理异常并以用户可理解的 Toast 提示。
- Loading 态统一由 Suspense 或 Skeleton 处理，禁止到处手写 `if (loading) return ...`。

### 样式与 i18n

- 统一使用 Tailwind CSS（V4）；禁止内联样式（仅保留必要 workaround）。
- 动态类名必须使用 `clsx` 或 `tailwind-merge`。
- 避免 `w-[16px]`，优先使用设计系统 token（如 `w-4`）。
- JSX 中禁止硬编码中文/英文，统一 `useTranslation(namespace)`。

### 性能与质量

- 路由级强制懒加载（TanStack Router `createLazyFileRoute` 双文件拆分，禁止 `React.lazy`）。
- 引入新依赖需评估包体积与 tree-shaking 友好性。
- 组件测试使用 `Vitest` + `React Testing Library`。
- 质量检查严格执行 `oxlint`、`typecheck`、测试。

### 前端强制拒绝

- 使用 `any` 类型。
- 在 `useEffect` 写复杂业务数据转换（应移到 `useMemo` 或 service 层）。
- 手动操作 DOM（第三方非 React 库集成除外）。
- 在根组件注入全局样式（应通过 CSS 变量或 Tailwind 扩展）。
