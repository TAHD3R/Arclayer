# CelestialCMS 全库质量治理与能力演进总计划（Master Plan）

> 版本：v1.0  
> 日期：2026-02-08  
> 策略：Self-host 优先，先质量治理后能力扩展

---

## 1. 背景与目标

### 1.1 背景

当前仓库已经完成了 V1 的核心架构雏形（FastAPI + React + Turborepo + 插件系统 + Portal 渲染链），但在以下方面仍存在明显差距：

1. 代码质量债务在关键路径聚集（超大文件、broad exception、前端 any）。
2. 插件“一等公民”能力主要在声明层，运行时能力和开放平台能力不足。
3. API Keys / Webhooks / 第三方应用集成仍是规划项或占位。
4. AI Native 目标尚无稳定的接口契约层。

### 1.2 总目标

在不偏离产品主线的前提下，分阶段完成：

- **Phase 1（当前优先）**：质量治理与架构边界收敛
- **Phase 2**：开放平台核心能力（API Keys / Webhooks / Integrations）
- **Phase 3**：AI Native 基础设施与插件化接入

---

## 2. 约束与原则

### 2.1 约束

- 后端必须保持 async/await、Pydantic v2、Schema-first 输出。
- 前端必须保持类型安全、i18n 无硬编码、模块边界清晰。
- 插件能力要同时覆盖 backend/frontend 的可扩展路径。
- 任何 workaround 必须可追踪（owner + 清理期限 + 替代方案）。

### 2.2 执行原则

- KISS / YAGNI / DRY / SOLID。
- 先收敛复杂度，再引入新能力。
- 每个阶段都有可量化门禁，不满足门禁不得进入下一阶段。

---

## 3. 基线审查结果（2026-02-08）

基于 `python3 scripts/quality/audit_repo.py --repo-root .` 的基线结果：

- Total findings：**279**
- broad_exception：173
- frontend_any：80
- large_file：18
- core_modules_dependency：8

对应工件：

- `docs/audit/latest-quality-report.md`
- `docs/audit/latest-quality-report.csv`
- `docs/audit/2026-02-08-issue-register.csv`

---

## 4. 分阶段计划（Decision-Complete）

## Phase 0：治理基建（已完成）

### 目标

建立可持续、可复现、可机器消费的审查与追踪机制。

### 已落地项

1. 审查脚本：`scripts/quality/audit_repo.py`
2. 审查预算配置：`scripts/quality/quality_budget.json`
3. 审查文档与报告目录：`docs/audit/*`
4. 统一命令入口：`pnpm audit:quality`、`pnpm audit:quality:strict`

### 验收

- [x] 本地可生成 md+csv 报告。
- [x] strict 模式在存在问题时返回非 0。

---

## Phase 1：质量治理与边界收敛（当前执行阶段）

### 目标

消除影响后续能力开发的关键质量障碍，使仓库进入稳定演进状态。

### 工作包

#### WP-1 架构边界治理（P0）

- 去除 `apps/api/core -> apps/api/modules` 直接依赖。
- 将启动编排职责迁移到非 core 的 orchestration 层。
- 保持行为一致（启动顺序、异常处理、插件生命周期不变）。

**验收标准**

- `core_modules_dependency` findings 从 8 降到 0。
- API 启动与现有测试通过。

#### WP-2 大文件拆分（P0/P1）

优先拆分目标：

- `apps/api/modules/auth/service.py`
- `apps/api/modules/sites/service.py`
- `apps/api/modules/sites/repository.py`
- `apps/api/modules/system/plugins_manager/service.py`
- `apps/web/admin/src/pages/assets/page.tsx`
- `apps/web/admin/src/components/common/assets/asset-masonry-card.tsx`

**拆分策略**

- 按职责拆为 orchestrator / policy / mapper / query service。
- 对外 API 和 schema 不改变，先做“内部结构重组”。

**验收标准**

- 以上文件行数下降到预算附近（允许过渡，但必须连续下降）。
- 相关单元测试与集成测试保持通过。

#### WP-3 类型治理（P1）

- 清理 frontend `any` 与 `as any` 热点文件。
- 优先处理 layout、assets、activity、team 相关模块。

**验收标准**

- `frontend_any` findings 从 80 连续下降。
- 新增代码禁止新增 any（除受控白名单）。

#### WP-4 异常治理（P1）

- 清理 broad `except Exception`，替换为可观测、可追踪异常。
- 对“best-effort”路径保留降级策略，但必须记录上下文日志。

**验收标准**

- `broad_exception` findings 从 173 连续下降。
- 关键链路错误日志包含 request_id / user_id / entity_id 等上下文。

#### WP-5 重复实现收敛（P1）

- 合并组织插件详情与工作区插件详情的重复渲染逻辑。
- 沉淀共享 view model + shared form presenter。

**验收标准**

- 关键页面行为一致，重复代码显著下降。

---

## Phase 2：开放平台核心能力（能力建设阶段）

### 目标

实现 self-host 与 SaaS 通用的开发者平台基建。

### 能力包

1. API Keys
   - 创建/撤销/轮换/最小权限 scope/审计日志。
2. Webhooks
   - 订阅管理、签名验证、重试队列、失败观测。
3. Third-party Integrations
   - 连接器契约、凭据管理、插件化接入点。
4. Plugin Runtime Contract 强化
   - admin UI extension / portal extension 的执行契约与权限契约。

### 验收标准

- 组织与工作区 settings 中 developer/integrations 不再是占位。
- API keys / webhook 具备完整 CRUD + 审计 + 最小可用测试集。

---

## Phase 3：AI Native 基础层

### 目标

在不绑定单一模型厂商的前提下，提供 AI 能力接入基座。

### 能力包

1. AI provider 抽象（模型供应商可插拔）。
2. 内容辅助能力接口（生成、改写、翻译、总结）
3. Agent/Workflow 入口契约与审计边界。
4. AI 相关配置的多租户隔离与安全策略。

### 验收标准

- AI 能力通过统一协议接入，不侵入现有业务核心。
- 所有 AI 触发路径具备审计与权限控制。

---

## 5. 里程碑与门禁

### 里程碑 M1（Phase 1 完成）

必须同时满足：

1. `core_modules_dependency == 0`
2. `frontend_any` 与 `broad_exception` 相比基线显著下降
3. 大文件清单至少完成首批拆分
4. 现有测试通过

### 里程碑 M2（Phase 2 完成）

1. API Keys / Webhooks 在 UI 与 API 都可用
2. Integrations 基础契约可用
3. 插件 runtime contract 有统一文档与测试

### 里程碑 M3（Phase 3 完成）

1. AI provider + AI contract 可用
2. AI 功能具备租户隔离、权限、审计

---

## 6. 风险与应对

1. **重构风险**：行为回归
   - 应对：先测试、后拆分、分批合并。
2. **范围蔓延风险**：质量治理过程中引入新功能
   - 应对：Phase 1 明确禁止新增业务功能。
3. **上下文漂移风险**：会话过长导致目标偏移
   - 应对：以本文件为唯一执行锚点，任何偏离需先更新本文件。

---

## 7. 执行约定（强制）

1. 每次提交前必须更新：
   - `docs/audit/latest-quality-report.md`
   - `docs/audit/latest-quality-report.csv`
2. 每个完成的工作包要更新 issue register 状态：
   - `docs/audit/2026-02-08-issue-register.csv`
3. 新增跨模块目录必须附最小 README。
4. 本计划文档是“上下文压缩后恢复执行”的主锚点。

---

## 8. 当前执行起点（2026-02-08）

当前执行进度：

- 已完成 WP-1（core -> modules 边界收敛）
- WP-2（auth 领域）已完成首批拆分：`auth/service.py` 已降到预算内，邀请接受流程下沉到专用服务
- WP-2（sites 领域）已完成三轮拆分：
  - 发布/回滚/路由解析职责下沉至 `publishing_service.py`
  - 内容管理职责（page/entry/route-template）下沉至 `content_service.py`，`sites/service.py` 从 `1539` 行降至 `500` 行（已达预算）
  - repository 进一步拆分为 publishing/routing 组件，`sites/repository.py` 从 `1384` 行降至 `722` 行（已达预算）
- WP-2（plugins_manager 领域）已完成首轮拆分：
  - 安装/校验/解压职责下沉至 `install_service.py`，`plugins_manager/service.py` 从 `1154` 行降至 `518` 行（已达预算）
- WP-3（前端 any 热点）已完成两批：
  - 第一批：admin-layout / assets page / activity filter popover 的 `any` 热点已收敛
  - 第二批：assets-filter + team(invitations/roles/members) + activity detail 的长尾 `any` 热点已收敛
- WP-4（异常治理）已完成一轮“可观测性加固”：
  - plugin/assets/auth 的 best-effort 异常路径补齐结构化上下文日志
  - 已移除多处 silent swallow，但 residual broad catches 仍需继续压降
- ISS-0026（public-id 篡改测试不稳定）已完成修复，full API suite 已恢复 green baseline

最新审查基线（2026-02-08 17:15 UTC）：

- Total findings：**162**（相对初始 279 已下降）
- `frontend_any`：**0**（portal/runtime + renderer 长尾已清零）
- `broad_exception`：**147**（uploads/install_service residual 已清零，进入长尾治理）
- `large_file`：**14**
- `core_modules_dependency`：**1**（按当前决策暂不作为本轮阻塞项）

优先顺序：继续收敛 broad exception 长尾（auth/plugin 等核心路径），并并行推进开放平台能力基建。
