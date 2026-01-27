项目开发规范（Spec）

当前项目采用混合技术栈 Monorepo 架构。在执行任何任务前，请优先参考以下指令集。

**管理后台 (Frontend - Node.js/pnpm)**

管理后台位于 apps/web/admin，使用 pnpm 进行包管理和任务调度。

| 任务             | 指令                   | 描述                     |
| ---------------- | ---------------------- | ------------------------ |
| **启动开发环境** | `pnpm dev:admin`       | 启动前端本地开发服务器   |
| **静态构建**     | `pnpm build:admin`     | 生产环境编译             |
| **代码检查**     | `pnpm lint:admin`      | 运行 ESLint/Linter       |
| **代码格式化**   | `pnpm fmt:admin`       | 自动格式化前端代码       |
| **类型检查**     | `pnpm typecheck:admin` | 运行 TypeScript 类型检查 |
| **运行测试**     | `pnpm test:admin`      | 执行前端单元测试         |

**后端接口 (Backend - Python/uv/FastAPI)**

后端位于 `apps/api`，使用 `uv` 作为包管理器和运行环境。

避免调用`apps/api/.venv/bin/python`操作python环境，而是使用`uv run --project apps/api`

| 任务              | 指令                       | 描述                                |
| ----------------- | -------------------------- | ----------------------------------- |
| **启动 API 服务** | `pnpm dev:api`             | 使用 uvicorn 启动热重载服务         |
| **Lint 检查**     | `pnpm lint:py`             | 使用 Ruff 进行代码静态分析          |
| **自动格式化**    | `pnpm format:py`           | 使用 Ruff 格式化 Python 代码        |
| **类型检查**      | `pnpm typecheck:py`        | 使用 Pyright 验证类型标注           |
| **单元测试**      | `pnpm test:py`             | 运行标准 pytest 测试套件            |
| **集成测试**      | `pnpm test:py-integration` | 运行标注了 `integration` 的集成测试 |

**目录约定**

- `apps/api` 为 FastAPI 服务端目录
- `apps/web` 为前端项目目录

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

**服务端架构规范**

- 每个 API 模块分层为 `router` / `service` / `repository` / `schema`
- `router` 仅返回 `Response.success`，异常由 `service` 层处理
- `service` 与 `repository` 必须继承 `BaseService`、`BaseRepository`
- `schema` 使用 Pydantic v2，统一放在 `schema` 层

**基础代码组织**

- `BaseRepository`、`BaseService` 置于独立文件，明确命名
- 基础类分离：`base_schema.py`、`constants/*.py`、`enums/*.py` 等
- 避免通用功能混入单一 `bases.py` 文件

**Schema 规范**

- 统一继承 `BaseSchema`，必要时复用 `BaseOut`、`IdMixin`、`TimestampMixin`
- 字段必须使用 `Field` 定义约束、描述与示例
- 复杂校验必须使用 `validator` / `model_validator`

**HTTP 输出规范（强制）**

- 禁止在 API 层手写/拼装 JSON 字典作为业务输出（例如 `return {"items": ...}` 或 `Response.success(data={"items": ...})`）
- 输入/输出只要可以用 Pydantic 表达，就必须使用 Pydantic Schema：
  - Router 层：`response_model` 必须绑定 Schema；返回时优先返回 Schema 实例或 `Schema.model_validate(...)`
  - Service/Repository 层：对外返回的分页/业务结果优先返回 Schema（或可被 `model_validate` 接受的对象），避免散落的硬编码 key
- 例外（允许使用 dict）：`config` 等动态结构、`ResponseModel.meta` 等明确声明为 `dict[str, Any]` 的扩展字段

**日志规范**

- 全项目统一结构化日志风格
- 记录关键上下文：`request_id`、`user_id`、`entity_id`、`action`
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

**限流**

- 高频接口必须接入 `fastapi-limiter`
- 受 `VALKEY__ENABLED` 与 `VALKEY__LIMITER_ENABLED` 控制开关

**i18n**

- 用户可见文案必须使用 `t()` 翻译，避免硬编码
- 统一在仓库根目录 `locales/<locale>/*.json` 维护通用命名空间
- 插件自带文案放在 `plugins/<plugin_id>/locales/<locale>/*.json`，系统自动合并
- 新增词条需同时补齐 `zh-CN` 与 `en-US`
- 异常提示优先使用 `errors.json` 中的错误码映射
- 异步任务（如邮件发送）需要显式传递 locale，避免丢失请求语言

**测试与质量门禁**

- 覆盖单元测试与集成测试
- Python 代码需通过 Ruff、Pyright（或等效工具）与测试

**文档与注释**

- 日志输出文本使用英文
- 代码注释与技术文档使用英文
- API 文档字段说明使用英文

**MUST DO**

- Use type hints everywhere (FastAPI requires them)
- Use Pydantic V2 syntax (field_validator, model_validator, model_config)
- Use Annotated pattern for dependency injection
- Use async/await for all I/O operations
- Use X | None instead of Optional[X]
- Return proper HTTP status codes
- Document endpoints (auto-generated OpenAPI)

**MUST NOT DO**

- Use synchronous database operations
- Skip Pydantic validation
- Store passwords in plain text
- Expose sensitive data in responses
- Use Pydantic V1 syntax (@validator, class Config)
- Mix sync and async code improperly
- Hardcode configuration values
