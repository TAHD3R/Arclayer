# Analytics / 审计日志（Audit Log）+ Arq 留存清理落地计划
日期：2026-02-04
范围：`apps/api` + `apps/web/admin` + `docs/`
目标：为项目提供组织级、工作区级、用户级的行为记录能力，首期以“审计日志”可用性优先，并用 **arq** 实现留存清理（不手搓协程），兼顾性能与可维护性。

> 注意：此文档为早期计划草案，当前实现已经演进为 **Activity（操作记录）**，并引入了 Org/Workspace 分域治理（路由与侧边栏隔离）。
>
> 最新落地说明请参考：`docs/plans/2026-02-04-activity-scope-split.md`

---

## 1. 背景与动机

当前系统已存在部分“事件”概念与扩展机制：

- 服务端使用 `structlog` + contextvars 记录结构化请求日志，并通过 `CorrelationIdMiddleware` 提供 `trace_id`。
- 插件系统使用 `EventBus`（`apps/api/plugin/event_bus.py`）实现解耦发布/订阅。
- 部分业务模型已经预留 `event_name` 字段（例如通知、邀请使用事件等），但缺乏统一、可查询、可留存的审计记录能力。

因此需要新增一个统一的 Analytics / Audit Log 能力：

- 高性能：写入不拖慢主链路、批量落库、可降级。
- 实用可用：提供可查询 API 与 Admin 管理端列表页。
- 易用与可扩展：事件命名规范、字段约束、可对接插件事件流；后续可演进到统计/报表。

---

## 2. 范围与非目标

### 2.1 MVP 范围（必须交付）
- 服务端：新增审计事件明细表（Postgres）与高性能写入链路（队列+批量入库）。
- 服务端：提供 system-scope 与 workspace-scope 的审计查询 API（分页/筛选）。
- 前端：Admin 管理端 `/settings/maintenance/audit-log` 实现可用列表页（筛选/分页/详情查看）。
- 留存：事件明细保留 90 天，清理任务由 **arq** worker 通过 cron 执行。

### 2.2 非目标（本次不做）
- 不做前端埋点（页面访问/点击等）。
- 不做导出（CSV/JSON）与异步导出任务。
- 不做漏斗/路径/留存等产品分析仪表盘。
- 不把“每条事件写入”实现成 arq job（避免高频 job 的队列开销）；arq 仅用于维护类任务（留存清理）。

---

## 3. 成功标准（验收）
- 审计记录能覆盖关键管理动作（登录成功、邀请加入、系统设置更新、插件变更等），并在 1 秒内可被查询到（通常 100~500ms）。
- 写入链路对主业务请求 P95 额外开销目标 < 2ms（DB 抖动不阻塞主链路）。
- 查询接口支持常用筛选（时间范围、事件名、actor、workspace、实体关联）并有严格权限控制。
- 留存清理可通过 arq worker 定时执行，删除过程分批、可观测、不会对线上造成长事务抖动。

---

## 4. 架构设计

### 4.1 事件流（数据流）
1) 业务模块在“动作成功后”发布 `EventBus` 事件（best-effort）：
- `Event.name`：事件名（如 `auth.login.succeeded`、`plugin.installed`）
- `Event.payload`：最小必要字段（ids、code、changed_keys 等）
- `Event.trace_id`：从 correlation id 获取（可为空）
- `Event.actor_user_id`：当前用户（可为空）
- `Event.source`：`api` / `core` / `plugin:<id>`

2) Analytics 模块订阅 `EventBus`：
- 通过 allowlist/glob 过滤需要落库的事件，避免把低价值噪声全部写入审计表。
- 将事件规范化（组织/工作区/actor/subject/entity/安全 payload）后入内存队列。
- 后台 flush worker 周期性批量入库（append-only）。

### 4.2 留存清理（Arq）
- 引入 `arq`，运行独立 worker 进程：
  - 定义 cron job：每天 UTC 固定时间执行 retention cleanup。
  - 任务内部使用分批 delete（先取 id 再按 id 批量删除）避免大事务。
  - 建议实现 Postgres advisory lock，避免多 worker 场景下重复执行。
- 若 Valkey 未启用，则 retention job 不运行（不提供协程兜底，保持策略一致性）。

---

## 5. 数据模型（审计明细表）

### 5.1 表：`analytics_audit_events`
字段（MVP）：
- `id` UUID（uuid7）
- `occurred_at` TIMESTAMPTZ（UTC）
- `event_name` VARCHAR(128)
- `organization_id` UUID（尽量填充；系统级事件可为空）
- `workspace_id` UUID NULL
- `actor_user_id` UUID NULL
- `subject_user_id` UUID NULL
- `entity_type` VARCHAR(64) NULL
- `entity_id` UUID NULL
- `trace_id` VARCHAR(64) NULL
- `source` VARCHAR(32) NULL
- `properties` JSONB（已脱敏、已截断）
- `created_at/updated_at`（继承 BaseModel）

索引（MVP 必做）：
- `(organization_id, occurred_at desc)`
- `(workspace_id, occurred_at desc)`
- `(actor_user_id, occurred_at desc)`
- `(event_name, occurred_at desc)`
- `(entity_type, entity_id, occurred_at desc)`（推荐）

---

## 6. API 设计

### 6.1 System scope（组织 owner 可见）
- `GET /api/v1/system/audit-log`
  - Query：`page/size`、`from/to`、`event_name`、`workspace_id`、`actor_user_id`、`entity_type/entity_id`
  - Response：`ResponseModel[PageData[AuditEventOut]]`
- `GET /api/v1/system/audit-log/{id}`
  - Response：`ResponseModel[AuditEventDetailOut]`

权限：
- `Depends(require_org_owner)`（与现有 system settings 一致）

### 6.2 Workspace scope（工作区 manage 可见）
- `GET /api/v1/workspaces/{workspace_id}/audit-log`
  - 与 system 类似，但 workspace_id 强制来自路径参数

权限：
- `Depends(require_workspace_manage_access)` + workspace boundary 校验

---

## 7. Admin 前端页面（MVP）
页面：`/settings/maintenance/audit-log`

功能：
- 默认展示近 7 天事件
- 筛选：时间范围、事件名、workspace、actor（MVP 先支持输入/UUID）
- 表格：时间、事件名、actor、workspace、实体、摘要
- 详情：点击行弹出 Modal/Drawer 展示完整 properties（已脱敏/截断）

i18n：
- 新增 `audit_log` namespace（`locales/zh-CN/audit_log.json` + `locales/en-US/audit_log.json`）

---

## 8. 测试策略（MVP 必须覆盖）
- 单元测试：
  - `sanitize_properties()`：敏感 key 移除、字符串截断、嵌套深度限制、key 数量限制
- 集成测试（可选但推荐）：
  - 创建审计事件记录后，system audit list API 返回包含该事件

---

## 9. 实施步骤（严格顺序）
1) 新增本计划文档（本文件）
2) 后端：新增 analytics 模块（模型/Schema/Repo/Service/Router）
3) 后端：在 app 启动生命周期内初始化审计订阅与 flush worker
4) 后端：在关键业务点发布事件（登录成功、邀请接受等；插件/设置事件复用现有 EventBus）
5) 后端：引入 arq worker 与 retention cron job
6) DB：新增 Aerich migration（创建表+索引）
7) 前端：实现审计日志列表页并接入 API
8) 测试补齐 + 文档补齐（如何启动 API + arq worker）

---

## 10. 默认配置（可调整）
- `ANALYTICS__ENABLED=true`
- `ANALYTICS__AUDIT_LOG__ENABLED=true`
- `ANALYTICS__AUDIT_LOG__RETENTION_DAYS=90`
- arq：`ARQ__ENABLED=true`（需 Valkey 可用）
- cron：每天 UTC 03:30 执行 retention cleanup
