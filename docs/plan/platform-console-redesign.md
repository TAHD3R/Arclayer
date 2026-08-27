# Platform 管理台系统性重设计

状态：Confirmed（Phase 1-2 本轮执行，Phase 3-5 为后续轮次 roadmap）
适用范围：`apps/platform`（`@arclayer/platform`），关联 `packages/ui` 共享 token 体系
权威依据：`docs/spec/shared/product-admin-experience-redesign.md`（§4.1 信息架构、§12 视觉方向）、`DESIGN.md`（视觉语言第一权威）、`docs/spec/app/frontend/product-ui-toolchain.md`（工具链契约）、ADR-0035/0037/0038/0040

## 1. 诊断（2026-08-26，逐项代码验证）

现有管理台功能面完整（44 条路由、全量接真实 API、57 个测试文件），但体验层存在四个结构性问题：

1. **视觉体系断裂**。`apps/platform/src/index.css` 以应用级 `:root`/`.dark` 全量覆盖 `packages/ui` 共享 token；暗色机制用 `.dark` class，而共享包与 `apps/app` 均为 `[data-theme="dark"]`——共享暗色 token 在 platform 从未生效，全站渲染的是偏离 `DESIGN.md` 的私有视觉系统（`DESIGN.md` 已知偏差 1）。
2. **导航 IA 偏离权威规格**。规格 §4.1 规定 10 个规范域的顺序与「仅活跃域展开」；现实现把 8 个域能力模块塞进 4 个任意元分组（platform-services / business-operations 等）做折叠子菜单，面包屑仅单层域标签，心智模型混乱。
3. **页面工程混乱**。`pages/ai-services.tsx` 1729 行承载 5 个页面、`commerce-payments.tsx` 1128 行、4 个文件超 900 行；`@arclayer/ui` 130+ 导出仅 data-table 一处真实使用，34 个本地 shadcn 组件自成体系；监控 activity 页使用规格禁止的 recharts。
4. **实用性缺口**。后端 231 个端点中 20+ 组管理能力前端未接：用户处置动作（重置密码/吊销会话/禁 2FA/禁用/删除）、所有权转移、能力灰度执行、订阅纠偏、计划停用、测试邮件/存储测试、插件手工制品评审等。

## 2. 目标信息架构（对齐规格 §4.1，路由零改动）

侧边栏：

- 工作台区：总览 `/`、待处理 `/attention`
- 8 个规范域按规格顺序平铺、仅活跃域展开：
  1. 工作空间 `/workspaces`（用户 `/users`、项目 `/projects`）
  2. AI 服务 `/ai/tasks`（供应商、助手、技能、策略）
  3. 托管与域名 `/hosting/issues`（域名、存储、策略）
  4. 消息与反馈 `/messages/feedback`（投递、活动、模板、邮件服务）
  5. 扩展 `/extensions/installed`（目录、连接、历史）
  6. 套餐与计费 `/billing/subscriptions`（套餐、支付、额度、配置）
  7. 访问与安全 `/access/team`（角色、登录策略）
  8. 监控与审计 `/monitoring/requests`（性能、AI 用量、活动、审计）
- 底部：系统设置 `/settings` + 用户菜单

面包屑升级为「域 → 目的地」两层；导航仍由后端能力目录 + 权限投影驱动，前端注册表保持契约校验。

## 3. 阶段划分

### Phase 1：视觉地基硬切（本轮）

- 重写 `apps/platform/src/index.css`：删除全部应用级 token 覆盖，镜像 `apps/app/src/index.css` 模式消费共享 token；`@custom-variant dark` 对齐 `[data-theme="dark"]`；body 消费共享排版 token。
- `lib/preferences.tsx` 主题应用改为 `documentElement` 的 `data-theme` 属性；`main.tsx` render 前同步设置，避免首绘闪错主题。
- 移除 `ChromeTabsProvider` 死代码。
- 本地 `components/ui/*` 圆角类按 `DESIGN.md` 角色表修正（按钮/输入 6px、卡片/菜单 10px、sheet 16px、大对话框 20px）。
- 契约测试从「现状快照」重锚定为「无应用级 token 覆盖 + data-theme 机制」的合规断言。

### Phase 2：导航与信息架构重构（本轮）

- `capabilities/module-registry.ts`：域标签改为规范域名，声明规格顺序。
- `capabilities/navigation-projection.ts`：投影输出有序域列表，移除元分组；面包屑解析升级两层。
- `components/platform-sidebar.tsx`：删除元分组常量，规范域平铺 + 仅活跃域展开；settings 移底部。
- `components/platform-shell.tsx`：两层面包屑。
- locales `navigation` 命名空间 zh-CN/en-US 同步更新；相关契约测试同步。

### Phase 3：分域页面重设计（结构性拆分已完成）

1. AI 服务——**已完成**（2026-08-26）：`pages/ai-services.tsx` 拆为四个页面文件 + 共享骨架 `ai/ai-page-state.tsx`。
2. 商业化计费——**支付页拆分已完成**（2026-08-27）：`commerce-payments.tsx`（1128 行）拆为页面骨架 + `commerce/payment-*` 四个域组件；`commerce-ui` 导出共享 `AsyncState`/`IdempotencyAttempt`。
3. 监控与运维——**图表栈迁移已完成**（2026-08-26）：`monitoring-activity` 迁至 `@arclayer/ui/chart`（含共享图表 `dateFormatters` 本地化注入口），移除 recharts 依赖。
4. 租户目录——页面文件本已独立（workspaces/users/projects 各一文件），无需拆分。
5. 托管——**已完成**（2026-08-27，Issues 页除外）：domains/storage/rules 独立 + 共享层 `site-delivery/site-delivery-page-state.tsx`；Issues 页保留在 `pages/site-delivery.tsx`（Mimosa 生成前钩子对 `execute*(id, …)` 编排形态的新建文件持续误报，7 次合规改写被拦；待钩子判定修正后补拆）。
6. 消息与反馈——**已完成**（2026-08-27）：`communications/communications-ui.tsx`（1194 行装 5 页）拆为 `feedback-page|campaigns-page|deliveries-page|templates-page|email-service-page.tsx` + 共享层 `messages-page-state.tsx`；两个域契约测试改为拼接读取。

`system-settings.tsx`（931 行）**决策不拆**：单页面、五个 Panel 与三个编辑对话框强耦合于同一设置编辑流，按「内聚优先于行数」规则（AGENTS.md）机械拆分无真实收益；待设置页 UX 重设计时一并处理。

剩余为各域 UX 深度重设计：master-detail（列表 → Drawer → 详情，ADR-0038）、`@arclayer/ui/data-table` 全面采用（注意 `communications-ui-contract` 目前禁止消息域引入 `@arclayer/ui`，采用前需重锚定该契约）、页面四态统一。

### Phase 4：能力补齐（进行中；2026-08-27 起按「可推翻旧契约、按最佳实践实现」的决策执行）

原「后端就绪、前端未用」的盘点经逐项复核后修正：

- **用户处置动作——已完成首个垂直**（2026-08-27）：经决策推翻 `tenant-directory-management-contract` 的旧边界（原仅允许限制类操作），按完整生命周期接入并重锚定契约：
  - API 层新增 `resetTenantUserPassword` / `sendTenantUserResetPasswordEmail` / `revokeTenantUserSessions` / `disableTenantUserTwoFactor` / `deleteTenantUserAccount`（删除走 void 信封解包）。
  - 用户 Dossier 新增「安全与账户操作」区 + 独立危险区：重置密码对话框（双输入确认、最短长度、一次性转交提示）、三个确认型对话框（后果文案分级）、删除走不可逆后果确认并渲染「已删除」终态；错误展示 `TenantDirectoryApiError` 代码。
  - `tenants.json` 双语 27 键；en 术语遵循 copy-quality 门禁（two-step，非 two-factor）。
  - 契约测试重锚定：五个函数与 `unwrapVoid` 转为正向断言，`platformUpdateUser`/`platformUpdateProject`（编辑类）仍禁止，Dossier 断言加入安全操作区与删除终态。
- **项目编辑（platformUpdateProject）与用户编辑（platformUpdateUser）**：仍禁止，属「编辑」语义（字段级 PATCH），需单独设计编辑表单垂直后再接。
- **测试邮件**：已被 `platformTestMailServiceProfile` + `MailServiceTestDialog` 覆盖，不接独立端点。
- **待做垂直**（2026-08-27 全量重盘后修正：此前按 SDK 原始函数名的盘点存在失真，`deactivateCommercePlan`、`testMailService` 等实已接入；真实未接清单以 API 层包装名逐一核对为准）：
  - ~~能力灰度执行~~——**已完成**（2026-08-27）：总览页能力姿态表新增「调整开放范围」行动（`canManage` 时可见），右侧 Sheet 承载完整预览→应用流：阶段选择（全量符合条件 / 仅选定工作空间 / 全部关闭）→ 工作空间多选（活跃且未归档）→ 影响预览（受影响/新开放/将关闭/条件不足跳过 + 后果码 + 预览有效期）→ 理由必填 + 幂等键指纹绑定应用 → 回执（策略版本）。目录 API 扩展 `previewCapabilityRollout` / `applyCapabilityRollout`，契约测试锚定（含幂等指纹模式与禁 fetch）。
  - ~~插件手工制品评审~~——**已完成**（2026-08-27）：扩展目录页新增「上传插件包」行动，`SettingDialog` 承载 zip 文件选择 + 分离签名粘贴 → `platformReviewManualPluginArtifact` 评审 → 通过后展示插件名、包校验和、签名指纹、权限与评审标识；API 层 `reviewManualArtifact`。
  - ~~只读详情类~~——**已完成**（2026-08-27）：
    - 交付操作流水：hosting 三页（问题/域名/存储）行内新增「操作记录」入口，右侧 Sheet 列出该对象的交付操作（动作/状态/结果状态/失败码/完成时间，产品化文案 + mono 证据行）；API 层接入三个 `ListPlatformDelivery{Issue,Domain,Storage}Operations` 与 `platformGetPlatformDeliveryOperation`。（扩展域的操作详情 `ExtensionOperationInspector` 此前已存在。）
    - 系统 Agent 版本与指派：AI 助手页每行新增「详情」入口，Sheet 分两节展示版本历史（版本号/状态/内容校验和）与工作空间指派（工作空间/项目/使用版本/默认/启用态）；API 层 `listAiAssistantVersions` / `listAiAssistantAssignments`。
  - ~~用户安全操作补充~~——**已完成**（2026-08-27）：`platformUnlinkUserOauthIdentity` 接入用户 Dossier 安全区（已绑定第三方登录列表 + 逐项解绑确认对话框 + 双语文案 + 契约正向断言）。

  至此 Phase 4 前端可做项**全部清零**；剩余阻塞项均定性于后端（见 Phase 5）。
  - 已定性不做：用户头像分片上传（管理台低价值）、`platformSendTestEmail`（与已有能力重叠）、`platformUpdateUser/Project`（字段级编辑，需表单设计）。
- **阻塞于后端的项**（归 Phase 5）：订阅纠偏（preview/apply 均为 `ServiceUnavailable` 存根，等待 commerce.commercial-correction.v1 Provider 端口）、所有权转移接受（repository 层 `accept_ownership_transfer` 存在但无 HTTP 端点，仅有提名面）、邀请接受流（`/auth/invitations/{id}/accept` 为预登录流程，属登录页工程）。

### Phase 5：后端缺口立项（需 API 侧）

- ~~jobs/队列监控面~~——**已完成**（2026-08-27，权限码 `platform:jobs:read/manage` 已有种子，无需迁移）：
  - 后端：新增 `src/modules/jobs/platform_router.py`（挂载于 `system/router.py` 的 `/jobs` 前缀），三个只读端点均要求 `platform:jobs:read`：`GET /jobs/queues`（六个 workload 的 DB 视角队列快照——积压（待派发+已入队+等待重试）/运行中/等待用户、窗口内失败与死信计数、outbox 在途与死信、最早积压时间；物理 stream 名由 `TaskiqWorkloadManifest` 派生）、`GET /jobs`（跨 workload 任务列表，内部状态/队列/任务类型等过滤 + 分页）、`GET /jobs/{job_id}`（详情 + 执行尝试历史：失败分类/重试决定/重试延迟/工作进程）。聚合查询落在 `BackgroundJobRepository` 新增只读方法。能力目录 `monitoring-audit` capability 注册 `monitoring.jobs` 导航目标（`JOBS_READ` 投影），后端权威集合测试同步。
  - 前端：监控域新增「后台任务」页 `/monitoring/jobs`——队列卡片总览 + 最近任务表（状态/队列筛选、分页、进度）+ 详情 Sheet（执行尝试时间线）；`monitoring-api.ts` 接入 `platformGetPlatformJobQueues`/`platformListPlatformJobs`/`platformGetPlatformJob`。契约重锚定：`monitoring-contract`（路由清单、SDK 操作、生命周期锚定）、`capability-projection`（目的地权威 + 面包屑）。workload 术语遵守 copy-quality 门禁（zh「AI 交互」避「智能体」，en 避 `agent(s)` 整词）。
  - 附带修复存量缺陷：`platform_site_delivery/router.py` 的 `_operation_read_permission` 用 `is` 对比 `use_enum_values=True` 序列化后的字符串恒为假，存储操作详情权限降级为 `site-delivery:read`；改为值相等比较，守卫测试参数表补齐 jobs 三路由。
  - 验证：`pnpm platform:check` 六项门禁全绿（244 测试）；后端聚焦单测（service/router/守卫/能力目录）全绿。`pnpm api:check` 存量红（与本次改动无关，HEAD worktree 抽样复证）：typecheck 288 个基线告警、`test_site_builder_history_router_contract_unit.py` 一处基线格式债、全量套件 64 个基线失败（权限期望表过期于 observability/commerce/skills、`/platform-api/v1/settings` 组合边界断言、产品侧 Tortoise `default_connection` 环境债等）。
- 系统健康自检、审计导出与留存策略。
- 订阅纠偏 Provider 端口实现（`commerce.commercial-correction.v1`）。
- 所有权转移接受端点（暴露 repository 层 `accept_ownership_transfer`，闭合提名→接受→前任降级流程）。

## 4. 验证门禁

- 里程碑：`pnpm platform:check`
- 亮/暗双主题 × zh-CN/en-US 双语走查
- 提交前 GitNexus 变更检测确认影响面
- 已知基线债（2026-08-27 记录，先于本轮改动）：`pnpm api:check` 三项红——ty typecheck 约 288 个存量告警、一处基线格式债、全量 pytest 64 个存量失败；后续后端轮次修复时应以 HEAD worktree 对照避免误判归属。
