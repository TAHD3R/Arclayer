# 设置板块信息架构改造计划（Site Identity / Workspace Policies / Organization Settings）

日期：2026-02-01
范围：`apps/api` + `apps/web/admin`
目标：修正设置项的“语义归属层级”，为 SaaS/self-host 双模式提供稳定可扩展的入口与页面壳，避免未来在组织/域名/计费/安全等方向上反复返工。

---

## 1. 背景与问题

现状存在结构性矛盾：

1) **设置项归属混乱**
“通用配置（General）”混入 SMTP/S3 等运维配置，使页面无法回答“这个站点是谁？”，也让 SaaS 租户看到不该配置的部署能力。

2) **工作区设置缺少“工作方式”语义**
`WorkspaceSettingsView` 当前仅提供少量元信息编辑，无法承载协作策略、内容策略、集成策略等“治理能力”。

3) **组织级设置缺少入口与壳**
未来“钱、人、安全、全局能力”（成员中心、全局角色、SSO、审计、API Keys、域名绑定等）需要一个稳定的组织设置容器，但目前缺失。

4) **SaaS/self-host 展现缺少统一机制**
需要由后端运行时决定 capabilities（而不是前端构建时常量），才能支持同一套 admin 单例前端在不同部署模式下正确隐藏/显示设置入口。

---

## 2. 已确认决策（强约束）

### 2.1 路由与体验

- 保留 `/settings/general` 路径不变，但语义改为「站点身份（Site Identity）」。
- 组织设置路径为 `/settings/organization`。
- 组织设置实际展示采用 alias：`/w/:workspaceId/settings/organization`，保持 Admin Shell（侧边栏/头部/通知中心）一致。
- 组织设置仅 org owner 可见/可访问。

### 2.2 SaaS/self-host 策略

- SaaS 模式：隐藏 Storage/Messaging（部署级运维能力）。
- self-host：显示部署级运维能力入口。
- 采用后端运行时能力（capabilities）驱动前端展示（B）。
- runtime 能力接口无需登录可访问（A）。
- runtime 获取失败时默认按更安全策略：**视为 SaaS**，隐藏部署设置（你选择：2）。

### 2.3 SaaS 域名策略（未来）

- portal：支持 `orgslug.celestial.io`（基础/免费）与自定义域名（Pro/Enterprise）。
- admin：独立域名 `admin.celestial.io`（单例）。
- 自定义域名主要作用于 portal，不影响 admin 登录入口。

---

## 3. 目标与非目标（YAGNI 边界）

### 3.1 本期目标（必须交付）

1) 建立清晰的三层设置模型，并提供稳定入口：
- Site Identity（站点身份，workspace scope）
- Workspace Settings（工作区设置/工作策略，workspace scope）
- Organization Settings（组织设置，org scope，owner gate）

2) 组织设置提供信息架构壳（A/B/C/D 分区）：
- Members & Access（占位）
- Billing & Assets（占位）
- Security & Audit（占位）
- Developer（占位）

3) Storage/Messaging 从 `/settings/general` 剥离，作为“部署设置（Deployment Settings）”支线，仅 self-host 可见。

4) 后端新增最小基础设施 API：
- `GET /api/v1/system/runtime`（无需登录）
- `GET /api/v1/me/organization`（需登录，返回 `isOwner` + org 基本信息）

### 3.2 非目标（本期不做）

- 不实现组织成员管理、全局角色定义、SSO、Billing、审计、IP 白名单、域名绑定验证等真实业务（仅占位）。
- 不实现 SaaS 平台运维后台（instance admin）机制（仅做安全收敛：SaaS 禁用部署级 system endpoints）。
- 不引入迁移脚本与兼容层（破坏性更新可接受；但本期尽量避免 DB schema 变更）。

---

## 4. 信息架构与页面职责（核心设计）

### 4.1 `/settings/general`：站点身份（Site Identity，workspace scope）

回答问题：“这个站点是谁？”

页面内容收敛为：
- 站点名/副标题/描述/站点 URL
- Logo/Favicon/默认头像占位图
- 本地化（默认语言/时区/日期格式）
- SEO 默认信息（如已存在）

强制约束：
- 不展示 SMTP/S3/provider/secret/端口连通性等部署运维项

UI 风格要求：
- 保持现有设置页风格：`DefaultPage` + `ChromeTabs` + `SettingPanel/SettingActionItem/SettingAccordionItem`
- 文案统一改为“站点身份”（i18n 与 nav 同步）

### 4.2 `/settings/workspace`：工作区设置（Workspace Policies，workspace scope）

回答问题：“在这个站点里怎么干活？”

页面结构（先搭壳，未来逐步填充）：
- `DefaultPage`
- `ChromeTabs`（建议固定以下 tabs）：
  - Basics（基础）
  - Collaboration（协作策略）
  - Content Strategy（内容策略）
  - Integrations（集成）
  - Resource Processing（资源处理）

本期真实可编辑项：
- Basics：workspace name/slug（迁移到统一设置页风格：ActionItem + Sheet/Accordion）

占位项（disabled，但必须语义化）：
- Collaboration：默认成员角色、编辑锁、审核流
- Content Strategy：自动保存间隔、版本保留
- Integrations：Webhook、预览 URL 模板
- Resource Processing：图片处理、CDN 前缀覆盖

### 4.3 `/settings/organization`：组织设置（Organization Settings，org scope，owner gate）

回答问题：“全站通用 / 钱、人、安全 / 全局能力”

路由策略：
- canonical：`/settings/organization`
  - 若已选择 workspace：重定向到 alias
- alias：`/w/:workspaceId/settings/organization`
  - 组织设置真实页面承载（保持 Admin Shell 连贯）

页面结构：
- `DefaultPage`
- `ChromeTabs` 或分区列表（按 A/B/C/D 固化结构）
- 每个分区使用 `SettingPanel + SettingActionItem` 占位，并明确“未来能力解决的问题”

owner gate：
- 前端入口隐藏（依赖 `GET /me/organization` 的 `isOwner`）
- 页面也要做双保险：非 owner 展示无权限状态（即使用户手动输入 URL）

### 4.4 Deployment Settings：部署设置（仅 self-host）

归属位置：
- Organization Settings 页面中的一个分组（例如 “Deployment” tab/section）

内容：
- Storage（部署级）：S3/provider/密钥等（复用/迁移现有 StorageSettingsTab）
- Messaging（部署级）：SMTP/模板 allowlist（复用/迁移现有 MessagingSettingsTab）

显示规则：
- 仅当 runtime capabilities 显示 `deploymentSettingsEnabled=true` 时出现
- runtime 获取失败时默认隐藏（安全优先）

---

## 5. 后端实现计划（最小必要 + 安全优先）

### 5.1 新增：`GET /api/v1/system/runtime`（无需登录）

目的：
- 让前端在启动时决定是否渲染 Deployment Settings（Storage/Messaging）

返回（最小字段）：
- `deploymentMode: "saas" | "self_host"`
- `capabilities: { deploymentSettingsEnabled: boolean }`

实现来源：
- 从后端配置读取（建议新增配置项，例如 `APPLICATION__DEPLOYMENT_MODE`，默认 `self_host`）

安全要求：
- 不返回任何敏感配置（smtp host、s3 key 等一律不返回）

测试：
- integration：无需登录可访问，字段存在

### 5.2 新增：`GET /api/v1/me/organization`（需登录）

目的：
- 前端账号菜单隐藏/显示组织设置入口
- 组织设置页显示组织基本信息（name/slug/logo）

返回（最小字段）：
- `organization: { id, name, slug, logoUrl }`
- `membership: { id, isOwner, status }`

错误码：
- 未登录 401
- 无 org membership：403 `ORG_MEMBERSHIP_REQUIRED`

测试：
- integration：owner/non-owner 两种返回值正确

### 5.3 SaaS 模式下禁用部署级 system endpoints（安全强制）

问题：
目前 system settings/mail 等接口通过 org owner gate 防护，这在 self-host OK，但在 SaaS 下会导致任意租户 owner 误改“实例级配置”（严重越权）。

本期策略：
- 当 `deploymentMode == "saas"` 时：禁用以下部署级接口（403/404，按实现约定）：
  - `/api/v1/system/settings/*`
  - `/api/v1/system/mail/*`
  - 以及任何“部署级运维接口”

备注：
这不是 YAGNI，而是 SaaS 上线前的必要安全约束；即使本期先不做完整 instance admin，也必须做到“租户 owner 无法改实例运维配置”。

---

## 6. 前端实现计划（admin）

### 6.1 runtime 注入（全局）

- 新增 `api/system.ts`：`getSystemRuntime()`
- 新增 `useRuntimeStore`（Zustand）或 react-query 缓存封装
- App 启动时拉取 runtime：
  - 若失败：默认 `deploymentSettingsEnabled=false`（安全优先）
  - 该值用于控制：
    - `/settings/organization` 中 Deployment 分组显示与否
    - 任何 Storage/Messaging 入口显示与否

### 6.2 组织 owner 信息获取与入口隐藏

- 新增 `api/me.ts`：`getMyOrganization()`
- `adminAccountMenu.tsx`：
  - `isOwner=true` 才显示 “组织设置”
  - 点击优先跳 alias：`/w/:workspaceId/settings/organization`
  - 未选 workspace 则跳 canonical：`/settings/organization`

### 6.3 组织设置路由与页面壳

新增路由（canonical + alias）：
- `/settings/organization`：若 workspace 已选则 redirect
- `/w/:workspaceId/settings/organization`：组织设置主页面

页面 UI：
- DefaultPage
- Tabs（A/B/C/D）
- 每个 Tab：SettingPanel + disabled ActionItem（语义化说明）
- Deployment 分组：仅当 runtime 允许且 self-host 时显示，并容纳 Storage/Messaging

### 6.4 `/settings/general` 内容收敛（站点身份）

- 修改 title/desc/nav 文案（i18n）
- 移除/迁移 Storage/Messaging 相关 UI（不再出现在站点身份页）

### 6.5 `/settings/workspace` 改造为同类设置风格

- 改造 `WorkspaceSettingsView`：ChromeTabs + SettingPanel/ActionItem
- 将 workspace name/slug 编辑改为 Sheet/Accordion 风格，与 general settings 保持一致
- 其余策略先占位（disabled + 文案），确保未来扩展不改结构

---

## 7. 测试计划（不运行也要写，防回归）

后端：
- `test_system_runtime_public_endpoint`
- `test_me_organization_owner_flag`
- `test_system_endpoints_disabled_in_saas_mode`（关键安全用例）

前端（最小建议）：
- runtime 获取失败时默认隐藏 Deployment
- `isOwner=false` 时账号菜单不出现组织设置入口

---

## 8. 验收标准（DoD）

1) `/settings/general` 语义能回答“这个站点是谁？”，且不包含部署运维项。
2) `/settings/workspace` 以同类设置风格呈现，能回答“怎么干活？”（占位可接受，但结构必须稳定）。
3) org owner 才能看到并访问组织设置；非 owner 入口隐藏。
4) SaaS 模式完全不出现 Storage/Messaging；self-host 才出现 Deployment 分组。
5) runtime 获取失败时默认隐藏 Deployment（安全优先）。
6) 关键后端测试覆盖存在（尤其 SaaS 禁用 system endpoints）。

---

## 9. 仅剩待确认（不阻塞实现）

无额外阻塞点；按当前决策即可开始实现。
