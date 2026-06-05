# Arclayer AI Agent System — 任务组

> **权威 Spec:** [AI-AGENT-SPEC.html](AI-AGENT-SPEC.html)
> **总工期:** 15-21 周（Phase 1-3B）
> **状态:** Phase 1 开始前
> **审计:** Codex R1→v2.0, R2→v2.1, R3→通过（4 项实现级阻塞已标注）

---

## Phase 1 — AI 基础设施 [4-6 周]

**目标:** `curl /api/v1/chat` → LiteLLM → OpenAI → 返回结果，含审计+预算+流式

### 1.1 — LiteLLM 运维就绪
- **产出:** docker-compose.yml 追加 litellm 服务；`docker/litellm/config.yaml`；健康检查端点；故障注入测试；本地 mock
- **验证:** `curl localhost:4000/health` → OK；故障注入测试通过
- **依赖:** 无

### 1.2 — LLMRuntime + 预算账本
- **产出:** `apps/api/src/llm/runtime.py`（LLM 调用唯一入口）；`ai_budgets` + `ai_budget_reservations` 表；原子预算预留 SQL；reservation 状态机（reserved→committed/released/expired）；统一货币单位 `cost_micros`
- **验证:** 并发预算预留不超额；reservation 过期回收正确；幂等创建测试
- **依赖:** 1.1
- **⚠️ R3 阻塞项:** 预算账本合约必须修正——统一货币单位、单事务创建、status-guarded 转移、幂等化所有终结路径

### 1.3 — src/llm/ 基础模块
- **产出:** `provider.py`（BaseLLMProvider + LLMProviderFactory）；`litellm_client.py`（LiteLLM HTTP 客户端封装，不暴露 virtual_key_id 参数）；`token_counter.py`（tiktoken）；`rate_limiter.py`（TokenBucket + Valkey 分布式）；`utils.py`
- **验证:** 单元测试全覆盖
- **依赖:** 1.1

### 1.4 — AISettings + ModelPolicy
- **产出:** `config.py` 追加 AISettings（环境变量前缀 `AI__`）；`model_policies` 表；`.env.example` 追加 AI__ 环境变量
- **验证:** Settings 加载测试；ModelPolicy CRUD
- **依赖:** 无

### 1.5 — 数据库迁移
- **产出:** Migration `0004_ai_infrastructure.py`——`ai_audit_log`, `ai_api_keys`, `ai_budgets`, `ai_budget_reservations`, `ai_usage_daily`, `model_policies`, `user_key_workspace_grants`
- **验证:** Apply + rollback；已有数据兼容
- **依赖:** 1.2, 1.4

### 1.6 — POST /api/v1/chat
- **产出:** `apps/api/src/modules/ai/router.py`（纯 LLM chat，非 Agent）；LLMRuntime 集成；Workspace-First Key 解析；SSE 流式（10 种事件类型契约）；Correlation ID 全链路；熔断策略（LiteLLM 不可用/Provider 不可用/Model 不可用/速率限制）
- **验证:** curl 全链路；SSE 流式测试；断连清理测试
- **依赖:** 1.2, 1.3, 1.4
- **⚠️ R3 阻塞项:** Phase 1 端点是纯 LLM chat（非 Agent）。Session/Cancel/Recovery 推迟到 Phase 3A。SSE 事件集收窄为 chat 相关事件。

### 1.7 — 用量追踪
- **产出:** `ai_usage_daily` 聚合任务（Taskiq 定时任务）；`GET /api/v1/workspaces/{id}/usage?period=YYYY-MM`；`GET /api/v1/workspaces/{id}/usage/daily?days=30`
- **验证:** 聚合数据准确；查询 API 正确
- **依赖:** 1.5, 1.6

### 1.8 — 可观测性基线
- **产出:** 结构化日志（correlation_id 贯穿）；metrics（latency buckets, token/cost counters, error taxonomy）；Grafana dashboard
- **验证:** Dashboard 可观测 AI 调用全链路
- **依赖:** 1.6

### 1.9 — 前端 AI Tab (Phase 1)
- **产出:** `create-content-type-dialog.tsx` AI Tab 替换占位 UI 为真实 chat 界面；流式文本显示；错误处理；取消按钮
- **验证:** 手动 E2E：输入 prompt → 流式返回结果
- **依赖:** 1.6
- **注意:** Phase 1 不做 diff preview / write 操作 / 审批 UI（那是 Phase 3B）

### 1.10 — 集成 + 合约测试
- **产出:** LiteLLM request/response/error 格式合约测试；Mock LLM 集成测试；预算并发预留测试；SSE 断连/取消测试
- **验证:** CI 全部通过
- **依赖:** 1.1-1.9

---

## Phase 2 — Extension 框架底层 [3-4 周]

**目标:** 可扩展地基就绪；arclayer-core Extension 替换 CorePlugin stub

**降域声明:** 不做 Marketplace、npm/git 安装、Admin Slot 动态加载、不受信任 Extension 隔离。

### 2.1 — Manifest 解析 + 三状态机
- **产出:** `src/core/extensions/manifest.py`——读取 extension.json，验证 Schema；Package/Process/Workspace 三个独立状态机 + 协调规则
- **验证:** 单元测试：有效/无效 manifest；合法/非法状态转换
- **依赖:** 无

### 2.2 — Tenant-Aware Registry + Workspace Revision
- **产出:** `src/core/extensions/tenant_registry.py`——所有 Registry Consumer 接受 workspace_id + extension_revision；`workspaces.extension_revision` 字段；缓存 key 格式；缓存失效机制
- **验证:** 多 Workspace 并发激活/停用测试；revision 变更后缓存失效
- **依赖:** 2.1

### 2.3 — TenantAwareExtensionMiddlewareDispatcher
- **产出:** ASGI 中间件；放在 auth 解析之后；按 workspace_id 分发 hooks；Extension hooks 永不接收未激活 Workspace 的请求
- **验证:** 中间件顺序正确；未激活 Workspace Extension 代码不可观测请求
- **依赖:** 2.2

### 2.4 — arclayer-core Extension
- **产出:** `plugins/arclayer-core/extension.json` + `src/plugin.py`；注册核心 Service（健康检查/系统信息）；注册内置 ContentType；验证三状态机协调逻辑
- **验证:** Extension 加载 → register → bootstrap → ready 全流程
- **依赖:** 2.1, 2.2

### 2.5 — ExtensionManager + 迁移兼容
- **产出:** `src/core/extensions/manager.py`——替代 PluginManager；三状态机协调；启动加载；兼容现有 `core/plugin/`
- **验证:** 现有功能全量回归；CorePlugin stub 被 arclayer-core 替代
- **依赖:** 2.3, 2.4

### 2.6 — 集成测试
- **产出:** 多 Workspace Extension 激活隔离；Middleware Dispatcher 隔离；现有 plugin/ 兼容性
- **验证:** CI 全量回归通过
- **依赖:** 2.5

---

## Phase 3A — 只读 Agent [4-5 周]

**目标:** 3 个 Agent 上线，仅读权限，对话可用，事件驱动自动化（只读分析）

### 3A.0 — Extension Auth Boundary (Tenant Middleware)
- **产出:** `src/core/middleware/tenant_context.py`——在 Dispatcher 前校验 workspace membership；从 auth token/session 解析 authenticated user；从请求上下文（URL path 或 header）取得 requested workspace candidate；用 membership 校验后才写入 `request.state` 的 `workspace_id`、`user_id`、`workspace_membership_id`；替换当前仅从 URL 提取而不校验的 `WorkspaceContextMiddleware`；Extension hooks 永远看不到未授权 Workspace 请求
- **验证:** 未授权用户构造 victim workspace URL 时，Extension hooks 不可见请求；有效 membership 可正常通过；非成员访问返回 403
- **依赖:** Phase 2 完成
- **Spec 引用:** reports/AI-AGENT-SPEC.html §1.4 — Dispatcher 必须在 auth/tenant 解析之后

### 3A.1 — PydanticAI + BaseAgent
- **产出:** `apps/api/pyproject.toml` 追加 pydantic-ai 依赖；`src/modules/agents/agents/base.py`——AgentRunEngine 委托 PydanticAI Agent.run()（非手工 tool call 循环）
- **验证:** 单元测试：Agent 创建和基础调用
- **依赖:** Phase 1 完成, 3A.0

### 3A.2 — Tool Registry + 4 只读工具
- **产出:** `src/modules/agents/tools/registry.py`（MCP 格式描述 + PydanticAI 执行）；`content_tools.py`——search_content, list_content_types, get_content, analyze_content；三重校验（执行时权限重检 + Argument-Level 策略 + Prompt Injection 防护）
- **验证:** 工具注册/列表/调用测试；权限不足时拒绝；注入防护测试
- **依赖:** 3A.1, Phase 2 Tenant-Aware Registry, 3A.0

### 3A.3 — AgentSessionManager + Cancel
- **产出:** `src/modules/agents/runtime/session.py`——创建/恢复/取消会话；上下文窗口裁剪；Taskiq 协作式取消；预算预留释放
- **验证:** 会话 CRUD；取消后预算正确释放；断连恢复
- **依赖:** 3A.1

### 3A.4 — 3 个只读 Agent
- **产出:** `ContentAnalyzerAgent`（搜索+分析）、`ContentAdvisorAgent`（搜索+建议）、`ContentModelAdvisorAgent`（类型+结构分析）
- **验证:** 每个 Agent E2E：输入自然语言 → Agent 使用只读工具 → 返回分析结果
- **依赖:** 3A.2, 3A.3

### 3A.5 — 事件驱动自动化 (只读)
- **产出:** 订阅 EventBus；`content.created` → 自动摘要/标签/SEO 建议（不修改原内容）；结果存储为 content metadata/annotation
- **验证:** 创建内容 → 自动生成分析报告；dedup/idempotency；预算来源正确
- **依赖:** 3A.4

### 3A.6 — 前端 Agent 对话面板
- **产出:** Admin UI 中 SSE 对话式 Agent 交互；会话列表；会话恢复；审批 UI 框架准备（不激活审批功能）
- **验证:** 手动测试完整对话流程；SSE 断连恢复
- **依赖:** 3A.4

### 3A.7 — 安全测试
- **产出:** Prompt Injection fixture（直接+间接注入）；跨 Workspace Agent 隔离验证；会话隐私验证（跨用户不可见）
- **验证:** 安全测试集通过
- **依赖:** 3A.4

---

## Phase 3B — 可写 Agent + 审批 [4-6 周]

**目标:** Agent 可控写入；Dry-Run → 审批 → 执行；防注入；防重放

### 3B.1 — 写工具 + Argument-Level Policy
- **产出:** `create_content`, `update_content` 工具；参数级策略校验（content_type 白名单、field 级别限制）；`is_destructive: true` 标记
- **验证:** 工具级 + 参数级权限测试；未授权 content_type 拒绝
- **依赖:** Phase 3A 完成

### 3B.2 — Dry-Run + 审批引擎
- **产出:** `src/modules/agents/approval.py`——Dry-Run 引擎（绑定 content/schema version）；`agent_approvals` 表；审批状态机（pending→approved/rejected/modified）；防重放（approval_id 一次性）；过期审批拒绝；执行时重验（版本/权限/参数一致性）
- **验证:** Dry-Run 输出准确性；stale-diff 拒绝；replay 拒绝；expired 拒绝
- **依赖:** 3B.1
- **⚠️ R3 阻塞项:** Grant 授权谓词需要在 Phase 1 就明确——"workspace member AND (admin approval OR bring_own_key)" + 审批状态机 + 失败错误码

### 3B.3 — 审批 UI + API
- **产出:** `GET/POST /api/v1/agents/sessions/{id}/approvals`；前端审批面板（diff 展示 + Approve/Reject/Modify 按钮）；可配置审批策略（always/bulk_only/schema_only/auto_approved）
- **验证:** 审批/拒绝/修改全流程；审批策略生效
- **依赖:** 3B.2, 3A.6

### 3B.4 — ContentWriterAgent + ContentModelAgent
- **产出:** 2 个可写 Agent——ContentWriterAgent（create_content + update_content）、ContentModelAgent（create_content_type + update_content_type，Schema 变更需更严格审批）
- **验证:** 每 Agent E2E：写操作 → Dry-Run → 审批 → 执行 → 审计
- **依赖:** 3B.2, 3B.3

### 3B.5 — Prompt Injection 深度防御
- **产出:** 间接注入测试语料库（恶意 CMS 内容）；taint tracking for retrieved content/tool outputs；per-tool argument validators；secrets/key/PII 泄露检测
- **验证:** 注入攻击测试集；系统 prompt 泄露测试
- **依赖:** 3B.4

### 3B.6 — 集成 + 渗透测试
- **产出:** 审批 replay/stale-diff/并发竞态测试；可写 Agent 完整 E2E；安全渗透测试报告
- **验证:** CI + 安全审计通过
- **依赖:** 3B.5

---

## Phase 4 — 高级能力 (按需)

每个能力独立触发，无固定工期：

| # | 能力 | 触发条件 | 技术方案 |
|---|---|---|---|
| 4.1 | RAG 内容问答 | 需要跨内容类型语义搜索 | LlamaIndex + pgvector |
| 4.2 | LangGraph 多步工作流 | 需要审核→修改→发布多步管线 | Agent 状态图 + PostgreSQL Checkpoint |
| 4.3 | @platejs/ai 编辑器集成 | 需要编辑器内 AI 辅助写作 | Plate.js AI 插件 + 后端 API |
| 4.4 | Langfuse 可观测性 | 需要 Prompt 调试/A/B 测试 | OpenTelemetry 追踪 |
| 4.5 | Billing 系统完善 | 需要按 Workspace 月结计费 | 用量聚合 + 账单生成 |
| 4.6 | 自动化策略白名单 | 特定内容类型可免审批 | Auto-approved Agent 配置 |
| 4.7 | 不受信任 Extension | Marketplace 上线 | 进程/容器/WASM 隔离 |

---

## 依赖关系图

```
Phase 1 (AI Infra) ────────────────┐
      │                             │
      ├── Phase 2 (Extensions) ◄────┘ (可并行开始，共享 Auth 中间件顺序)
      │        │
      │        └── arclayer-core Extension
      │
      ├── Phase 3A (Read-Only Agents) ← 依赖 Phase 1 + Phase 2 Tenant-Aware Registry
      │        │
      │        └── Phase 3B (Write Agents) ← 依赖 Phase 3A 全部
      │
      └── Phase 4 ← 各能力独立，按需触发
```

---

## 文件变更总览

| Phase | 新增 | 修改 | 
|---|---|---|
| 1 | 11 文件 | 4 文件 |
| 2 | 8 文件 | 1 文件 |
| 3A | 6 文件 | 1 文件 (pyproject.toml) |
| 3B | 4 文件 | 2 文件 |

详见 [AI-AGENT-SPEC.html §A4](AI-AGENT-SPEC.html)

---

## R3 审计阻塞项 (Phase 1 开始前必须解决)

| # | 阻塞项 | 影响任务 | 解决方案 |
|---|---|---|---|
| 1 | 预算账本货币单位不一致 + 非幂等路径 | 1.2 | 统一 `cost_micros`；单事务 CREATE；status-guarded COMMIT/RELEASE/EXPIRE；最终态共享状态机 |
| 2 | Phase 1 chat 端点与 Phase 3A session 边界模糊 | 1.6 | Phase 1 实现纯 `/api/v1/chat`（非 Agent）；SSE 事件收窄；Session 推至 Phase 3A |
| 3 | Grant 授权谓词未精确合约化 | 1.5, 1.6 | 定义 approval_state 枚举 + API schema + LLMRuntime 错误码 |
| 4 | Provider data_retention 无实现语义 | 1.4 | 映射到 OpenAI/Anthropic 请求 header/参数；不可遵守时审计警告 |
