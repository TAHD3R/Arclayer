# 项目开发规范

本项目为混合架构Monorepo项目，服务端由FastAPI(0.128)实现，前端由Vite7+React19实现。项目目标为提供低耦合、插件化、支持可视化编辑的现代化SaaS/自托管CMS服务。



## 全局约定

**目录约定**

`apps/api` 为FastAPI服务端目录

`plugins` 为插件目录

`apps/web` 为前端项目目录

**常用指令**

项目由turborepo提供统一入口，前端与后端统一通过package.json提供的指令执行，禁止直接调用.venv中的环境

**核心原则**

- KISS：保持简单，优先可读与可维护
- YAGNI：未确认需求不提前实现
- DRY：消除重复逻辑，统一抽象
- SOLID：面向扩展、易于测试、职责单一

**工作流程**

- 理解：澄清需求边界与约束
- 规划：拆解步骤与风险点
- 执行：按计划实现并自检
- 汇报：说明改动、风险与验证结果

**职责**

- 新增文件必须能回答：***\*属于哪个模块？为什么放在这里？未来如何维护？\****
- 新增目录（尤其是跨模块的）必须补充最小说明（README 或 docs 条目）。
- 全局注释以英文标注
-

**进一步说明文档**

- i18n 详细说明与迁移建议：`docs/i18n.md`
- FastAPI 目录架构：`docs/fastapi-folder-architecture.md`
- 前端设计规范：`docs/design-guideline.md`


## 服务端约定

**服务端架构规范**

- 每个 API 模块分层为 `router` / `service` / `repository` / `schema`
- `router` 层作为薄入口，每个路由端点提供summary/description。业务逻辑与异常处理由 `service` 层负责，仅返回 `Response.success`；返回列表数据的接口使用`ResponseModel[PageData[T]]` 禁止直接使用ResponseModel[list[T]]
- `service` 与 `repository` 必须继承自 `BaseService`、`BaseRepository`，多个领域内通用的方法可以考虑提升至基类以减少重复代码
- `schema` 使用 Pydantic v2，统一放在 `schema` 层，禁止使用dataclass实现
- 高频接口必须接入 `fastapi-limiter`
- 受 `VALKEY__ENABLED` 与 `VALKEY__LIMITER_ENABLED` 控制开关

**基础代码组织**

- 避免通用功能混入单一 `bases.py` 文件
- 避免重复编写相同功能的重复方法，多处复用的代码考虑提升为工具函数
- 避免每个文件零散储存常量、枚举，相近类型的常量/枚举可考虑放在同一文件统一管理

**Schema 规范**

- 统一继承 `BaseSchema`，必要时复用 `BaseOut`、`IdMixin`、`TimestampMixin`
- 字段必须使用 `Field` 定义约束、描述与示例
- 复杂校验必须使用 `validator` / `model_validator`/`model_config`

**HTTP 输出规范（强制）**

- 禁止在 API 层手写/拼装 JSON 字典作为业务输出（例如 `return {"items": ...}` 或 `Response.success(data={"items": ...})`）
- 输入/输出只要可以用 Pydantic 表达，就必须使用 Pydantic Schema：
  - Router 层：`response_model` 必须绑定 Schema；返回时优先返回 Schema 实例或 `Schema.model_validate(...)`
  - Service/Repository 层：对外返回的分页/业务结果优先返回 Schema（或可被 `model_validate` 接受的对象），避免散落的硬编码 key
- 例外（允许使用 dict）：`config` 等动态结构、`ResponseModel.meta` 等明确声明为 `dict[str, Any]` 的扩展字段

**模型构建**

- 模型表需以docstring形式提供注释

**日志规范**

- 全项目统一结构化日志风格
- 记录关键上下文：`request_id`、`user_id`、`entity_id`、`org_id`、`action`
- 日志内容需脱敏，敏感字段必须屏蔽或裁剪
- 邮件发送需记录收件人、cid、user_id、token_hint 等关键字段

**异常处理**

- 统一使用 `APIError` 体系转为标准响应
- BackgroundTasks 内部必须捕获异常，避免主流程崩溃
- 不允许未处理异常导致 500 泄露内部细节

**认证与安全**

- Refresh Token 旋转、复用检测、`token_version` 失效机制必须启用
- 退出登录必须使 Token 失效（提升 `token_version` + revoke refresh）

**邮件与通知**

- 使用 `fastapi-mail` + `BackgroundTasks`
- 邮件服务独立封装，模板集中管理
- 发送失败必须记录日志并降级处理

**i18n**

- 用户可见文案必须使用 `t()` 翻译，避免硬编码
- 统一在仓库根目录 `locales/<locale>/*.json` 维护通用命名空间
- 插件自带文案放在 `plugins/<plugin_id>/locales/<locale>/*.json`，系统自动合并
- 新增词条需同时补齐 `zh-CN` 与 `en-US` 并保持Key一致
- 异常提示优先使用 `errors.json` 中的错误码映射
- 异步任务（如邮件发送）需要显式传递 locale，避免丢失请求语言
- 按“职责/功能域”拆分命名空间（namespace），避免单文件膨胀。
- `common` 只放“真正跨模块的通用词条”（例如：通用按钮文案、通用提示、极少量基础文案）。

**测试与质量门禁**

- 覆盖单元测试与集成测试（单元测试覆盖率要求达到70%-90%；集成测试覆盖率要求达到40-60%）
- 路径覆盖优于行覆盖、核心逻辑优先
- Python 代码需通过 Ruff、Pyright（或等效工具）与测试

**文档与注释**

- 日志输出文本使用英文
- 代码注释与技术文档使用英文
- API 文档字段说明使用英文

**强制要求**

- 在任何情况下使用类型推导编写代码

- 使用Pydantic V2语法 (field_validator, model_validator, model_config)
- 以Annotated方式使用依赖注入
- 所有涉及I/O的操作使用async/await语法
- 使用`X | None`避免使用`Optional[X]`
- 返回正确且合理的HTTP状态码
- 为端点编写文档（要求至少提供summary，可视情况以docstring的方式提供description）

**强制拒绝执行目标**

- 使用同步方式操作数据库/Valkey
- 跳过Pydantic校验
- 以明文储存敏感信息
- 在Response中暴露敏感信息
- 使用Pydantic V1语法 (@validator, class Config)
- 不正确混合使用sync与async语法
- 硬编码配置项/可配置项



## 前端约定

**架构与目录约定**

- `apps/web/<app_name>` 遵循模块化架构，禁止跨模块循环引用

- `src/api` 基于tanstack query封装函数式请求，必须与服务端`Schema`保持类型同步
- `src/components` 统一管理项目可复用组件
- - `animate-ui` 及 `ui` 为第一方/第三方Shadcn组件，避免直接使用
  - `app` 项目专用/二次封装组件
- `src/types` 统一管理项目TS类型定义，新建定义优先考虑放置此目录下，避免零散编写
- `src/hooks`  全局通用Hooks，业务相关Hooks必须留在相关目录下
- `src/stores` Zustand全局状态管理，优先使用`React Query`缓存

**核心技术要求**

- 优先使用 `useActionState` 和 `useOptimistic` 处理表单提交与状态更新。
- 使用 `use` 处理 Promise 或 Context，减少嵌套。
- 处理异步 I/O 必须配合 `Suspense` 与 `ErrorBoundary`。
- **Server State**: 统一使用 `@tanstack/react-query`，禁止将 API 数据镜像到全局 Store。
- **UI State**: 优先组件内 `useState`；跨组件共享使用 `Zustand`。
- **样式规范**: 统一使用 Tailwind CSS。配色Token与Tailwindcss定义位于 `package/ui-theme`下，禁止使用内联 Style (除Antd样式workaround、动态计算像素外)。

**接口与数据流 (I/O)**

- **类型安全 (End-to-End Type Safety)**:
  - 前端 `interface` 必须严格匹配服务端 `Pydantic Schema`。
  - 禁止在组件内直接处理原始 `Response` 字典，必须在 API 层进行数据清洗。
- **请求库**: 统一使用异步封装，所有 API 方法必须标明返回类型：`async function getData(): Promise<T>`。
- **Loading 态**: 统一由框架层（Suspense）或组件级 Skeleton 处理，禁止到处手写 `if (loading) return ...`。

**国际化 (i18n)**

- **强制翻译**: 严禁在 JSX 中出现硬编码中文/英文。
- **调用方式**: 统一使用 `const { t } = useTranslation(ns)`，并指定对应的 `namespace`。
- **动态内容**: 带有变量的翻译必须使用插值：`t('welcome', { name: user.name })`。

**TailwindCSS使用规范**

- 避免使用精确px定义尺寸 `w-[16px]` 而是使用 `w-4` 方式
- 使用`TailwindCSS V4`写法

**性能门禁**

- **代码分割**: 路由层级强制使用 `React.lazy` 进行懒加载。
- **资源优化**: 静态资源（图片/字体）必须经过压缩，大图需放置在 CDN 或由服务端处理。
- **依赖控制**: 引入新依赖需评估 Bundle Size，优先选择 `Tree-shaking` 友好的库。

**测试与质量控制**

- **组件测试**: 使用 `Vitest` + `React Testing Library`。
- **覆盖率**:
  - 应用专用工具函数、复杂逻辑 Hooks 要求 80% 以上覆盖率。
  - 关键交互路径（如支付、发布）需编写集成测试。
- **Linting**: 严格执行 `oxlint` 检查。

**强制要求**

- **必须**为所有组件 Props 定义 `interface` 或 `type`。
- **必须**使用 `clsx` 或 `tailwind-merge` 合并动态类名。
- **必须**为所有表单接入 `React Hook Form` + `Zod` 校验，与后端 Schema 逻辑对齐。
- **必须**处理 API 请求的异常捕获，并以用户友好的 `Toast` 提示。

**强制拒绝**

- **严禁**使用 `any` 类型（除非是极特殊的第三方库兼容）。
- **严禁**在 `useEffect` 中处理复杂的业务数据转换逻辑（应移至 `useMemo` 或 `Service` 层）。
- **严禁**手动操作 DOM（除非是集成第三方非 React 库）。
- **严禁**直接在根组件注入全局样式，必须通过 CSS 变量或 Tailwind 类名扩展。

---

## 服务端 Typecheck（Pyright）修复策略（Tortoise ORM 场景）

本节用于约束并沉淀“pyright 类型检查”在 Tortoise ORM 场景下的修复方法，避免为了消除报错而引入不可维护/破坏功能的补丁。

### 总原则

1. **pyright 规则统一由 `pyproject.toml` 维护**：禁止新增 `pyrightconfig.json` 作为额外配置源，避免 monorepo 下配置发现漂移。
2. **禁止在 Tortoise ORM 模型类上添加字段类型注解来“修复”类型问题**：
   - 例如 `id: UUID = fields.UUIDField(...)` 这类写法既不可靠，也容易造成误导。
3. **禁止在模型类中通过 `if TYPE_CHECKING:` 影子属性做类型兜底**：
   - 该方式会把类型问题“分散”进模型层，长期维护成本高，且容易与真实 schema 漂移。
4. **拒绝 Workaround**：
   - 不允许通过 `type: ignore`、大范围 `Any`、随意 `cast(Any, ...)` 来“糊过检查”。
5. **允许且推荐的方式：Protocol + cast（只在使用点收敛类型）**：
   - 只描述“当前函数需要的最小字段集合”，把 ORM 运行时真实存在的字段契约显式化。
   - cast 后应尽量配合运行时转换（例如 `UUID(str(...))`）让逻辑本身更健壮，而不是仅为了通过类型检查。

### 推荐实现模式：最小化 Protocol 集中管理

将 Tortoise ORM 静态类型收敛用的协议统一放在：

- `apps/api/common/utils/tortoise_protocols.py`

协议只做“字段契约声明”，不影响运行时。例如：

- `HasOrganizationId`：声明 `organization_id: UUID | str`
- `PermissionMutableFields`：声明 `description/name_i18n/...: str | None`
- `SettingUpdatedBy`：声明 `updated_by: UUID | None`

### 使用点修复范式（示例）

1) 访问 ORM 动态字段（pyright 报 `Attribute ... is unknown`）

```py
from typing import cast
from uuid import UUID

from apps.api.common.utils.tortoise_protocols import HasOrganizationId

orgm_like = cast(HasOrganizationId, orgm)
org_id = UUID(str(orgm_like.organization_id))
```

2) 可空字段赋值（pyright 报 `str | None -> str` / `datetime | None -> datetime`）

```py
from typing import cast

from apps.api.common.utils.tortoise_protocols import PermissionMutableFields

perm_like = cast(PermissionMutableFields, permission)
perm_like.description = description  # description: str | None
```

3) 设置/系统配置类字段（例如 `updated_by` 允许为 None）

```py
from typing import cast

from apps.api.common.utils.tortoise_protocols import SettingUpdatedBy

cast(SettingUpdatedBy, record).updated_by = updated_by  # updated_by: UUID | None
```

### 执行与排错建议

1. **monorepo 下运行 typecheck 推荐保持统一入口与环境变量**（避免 import resolution 漂移）：

```bash
UV_CACHE_DIR=../../.uv-cache PYTHONPATH=../.. uv run pyright
```

2. 若出现大量 `reportMissingImports`：
   - 优先检查运行命令的 cwd 是否正确、`PYTHONPATH` 是否指向仓库根；
   - 确认 uv/venv 环境是否完整（依赖未安装会导致 pyright 无法解析第三方包）；
   - 不要通过新增 `pyrightconfig.json` 绕过问题，应回到 `pyproject.toml` 与执行方式排查根因。
