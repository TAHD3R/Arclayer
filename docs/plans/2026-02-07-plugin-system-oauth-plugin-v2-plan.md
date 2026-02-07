# 插件系统重构（V2）与 OAuth 登录插件落地方案（社交登录 / 企业 SSO 拆分）

日期：2026-02-07  
状态：Draft（用于讨论与迭代）  
范围：`apps/api`、`apps/web/admin`、`plugins/plugin-oauth-social`、（规划）`plugins/plugin-enterprise-sso`、（可选）DB migrations

> 本文档沉淀“插件系统改进 + 第一个新版插件（OAuth）”的完整解决方案，用作后续讨论、拆解与实施的基准版本。  
> 备注：历史插件 `plugins/plugin-admin-dynamic-menu` 仅保留为参考，不作为交付目标。

---

## 0. 当前实现概览（已存在的能力）

你们当前代码库中，实际上已经具备“新版插件系统”的关键骨架（并非从 0 开始）：

- **后端插件引擎**：`apps/api/plugin/*`
  - `PluginManager` 扫描 `plugins/*/plugin.toml`（不会扫描 `.disabled`）
  - 支持：依赖校验、启停、插件路由挂载、插件模型迁移（Aerich）、i18n locale 注册、事件总线（EventBus）、pluggy hooks
- **Admin 菜单注入（seeds）**：manifest `admin_menu[]`
  - 在 `apps/api/core/registry.py` startup best-effort 创建缺失 seeds（`update_existing=False`，不会覆盖用户编辑）
  - 插件菜单默认挂载到 core seeds 的 `plugins` group 下（见 `apps/api/modules/system/admin/menus/bootstrap.py`）
- **Admin UI slot 扩展**：manifest `admin_ui_extensions[]`
  - 后端输出：`/workspaces/{workspace_id}/extensions/admin`
  - 前端渲染：`apps/web/admin/src/components/extensions/admin-extensions-slot.tsx`
- **Portal 扩展（MVP）**：manifest `portal_extensions[]`（SSR `<head>` 注入）
- **工作区级插件中心**：`apps/api/modules/workspaces/plugins_center/*` + `workspace_plugins` 表

结论：本次重构应以“补齐缺口 + 明确契约 + 打通端到端闭环”为主，而不是推倒重写。

---

## 1. 问题与能力缺口（本次必须解决）

1) **Admin 端插件详情/配置页尚未落地**
   - 目前 `/plugins/$pluginSlug` 与 `/w/$workspaceId/plugins/$pluginSlug` 为 Coming Soon
   - 这导致“插件提供元信息 + 配置页”的产品目标无法闭环

2) **插件配置存在 `secret` 标记，但缺少“加密落库 + 读取脱敏”的强制实现**
   - 项目规范明确禁止明文存储敏感信息
   - 当前插件配置主要挂在 `PluginRecord.config` 上，尚未复用系统设置的加密能力

3) **Auth 登录页没有插件扩展点**
   - OAuth 插件需要在 Admin `/login` 提供 SSO 入口与回调闭环

4) **SaaS vs 自部署下的“配置权属”需要明确**
   - 本期目标是“降低注册/登录摩擦”的社交登录（Google/GitHub）：**平台统一维护一套配置（instance/system scope）**
   - “租户自带 IdP / 企业 SSO（OIDC/SAML）”是另一类需求，应作为**独立插件**（enterprise-sso）规划（更常见于自部署或收费企业版）
   - 插件系统需要能表达：
     - 插件配置的作用域（system/org/workspace/site/none）
     - 插件配置在 SaaS 模式下是否对租户可见/可编辑（通常不应）

---

## 2. 目标与成功标准（验收口径）

### 2.1 目标

1) 插件系统支持多形态插件：
   - 纯后端增强（hooks / routes / jobs / permissions / i18n / models）
   - 纯前端增强（先用 Admin UI extension slot + link/route 注入完成 MVP）
   - 后端增强 + Admin 配置页（schema-driven）+ 菜单注入（manifest seeds）

2) 交付 OAuth 社交登录插件（第一个新版插件）：
   - 插件：`plugin-oauth-social`
   - 支持 **Google**、**GitHub**
   - **Admin 登录页**直接展示可用的社交登录入口（无需 tenant 定位）
   - 配置为**平台统一维护**（system scope），用于整个实例的登录体验
   - OAuth 登录后支持“自动创建账号”（可配置策略；默认关闭）

3) 同时规划第二个插件（不作为本期交付）：
   - 插件：`plugin-enterprise-sso`
   - 目标：租户自带 IdP（OIDC / 未来可扩展 SAML），适配自部署/企业版
   - 配置为 org/workspace scope，并引入 tenant 定位（Email-first / org slug / domain mapping 等）

4) 插件配置的 `secret` 字段实现 **加密落库 + 读取脱敏**

### 2.2 成功标准

- Admin `/login`
  - 直接展示 Google/GitHub 的 SSO 按钮（当平台配置启用时）
  - 完成 OAuth 登录后拿到 `TokenPair`，并进入已存在的登录态流程
- Admin 插件页
  - `/plugins/oauth`（以及 workspace 路由）展示插件元信息与配置表单
  - `client_secret` 等 secret 字段：
    - 后端返回时为 `null`（脱敏），同时能标识“是否已设置”
    - 更新时不提交则不清空
    - DB 存储为 `enc:v1:*`（AESGCM）而非明文
- OAuth 插件：完成身份绑定/创建，并可用于后续访问 admin
- 测试：覆盖配置加密/脱敏、OAuth 交换码（one-time exchange）关键路径

---

## 3. 总体架构与关键决策（补齐契约，不推倒重写）

### 3.1 插件配置从 `PluginRecord.config` 迁移到 Scoped Settings（`SettingRecord`）

原因：

- `SettingRecord` 已有成熟的 secret 加密/脱敏实现（系统设置、workspace 设置均已使用）
- 支持 scope_type（system/org/workspace/site），天然满足 SaaS 多租户的 “org 各自一套”

策略（本期落地重点）：

- **`plugin-oauth-social` 配置只使用 `SettingRecord`（system scope）**
  - 理由：社交登录是平台统一能力，租户不应持有/编辑 OAuth secrets
- 兼容考虑：短期不删除 `PluginRecord.config` 字段与既有接口；后续逐步统一到 scoped settings

### 3.2 OAuth 登录采用 “Backend callback -> one-time exchange code -> Frontend exchange TokenPair”

原因：

- 避免把 Token 暴露在 URL
- 与前端现有 `applyLogin(TokenPair)` 逻辑兼容

---

## 4. 后端改造（API / Service / Repo / Schema）

### 4.1 插件配置管理：优先复用现有 System Settings（system scope）

现状：

- 已存在 `apps/api/modules/system/settings/*`：
  - `GET /system/settings`（列出 namespace，包含 `plugin:<plugin_id>`）
  - `GET /system/settings/{namespace}`（返回 schema + value（脱敏）+ secrets）
  - `PATCH /system/settings/{namespace}`（支持 patch + 校验 + secret 加密）
  - 安全门禁：仅在 self_host 模式开放（`require_self_host_deployment_mode`），且需要 org owner

本期策略：

1) `plugin-oauth-social` 的配置管理入口：
   - **自部署（self_host）**：直接复用 `/system/settings/plugin:plugin-oauth-social`
   - **SaaS**：该入口对租户不可见（系统级 secrets 不可交由租户编辑）；配置由平台运维侧维护（后续可做 operator console，但不在本期范围）

2) `plugin-enterprise-sso`（规划项）：
   - 未来新增 org/workspace scope 的“租户级插件配置 API / UI”（本期不实现）

#### 4.1.1 secret 加密 AAD 规则（必须稳定）

- AAD：`"{scope_type}:{scope_id}:plugin:{plugin_id}:{path}"`
  - path 形如 `"section.key"`
- 加密实现：复用 `apps/api/settings/crypto.py`（`enc:v1:` + AESGCM）
- master key：复用 `settings.setup.master_key_path`；缺失时写操作返回 `MASTER_KEY_MISSING`

---

### 4.2 新增：Auth SSO API（供前端 /login 使用）

新增模块建议：

- `apps/api/modules/auth/sso/router.py`
- `apps/api/modules/auth/sso/service.py`
- `apps/api/modules/auth/sso/schema.py`

并在 `apps/api/modules/auth/router.py` include 相关路由。

#### 4.2.1 API（本期：社交登录，不做 tenant 定位）

- `GET /auth/sso/providers`
  - public 接口，无需登录
  - rate limit（新增常量，例如 `SSO_OPTIONS_RATE_LIMIT`）
  - 返回：`AuthSSOProvidersOut`
    - `providers`: `[{ provider: "google"|"github", label, start_url, icon_url? }]`
    - 语义：返回“当前实例启用的社交登录入口”（由 `plugin-oauth-social` 提供）

- `POST /auth/sso/exchange`
  - 入参：`{ code: str }`
  - 返回：`TokenPair`
  - 语义：一次性消费 exchange code（one-time）

#### 4.2.2（规划）企业 SSO 的 tenant 定位

该部分移至 `plugin-enterprise-sso` 规划，不在 `plugin-oauth-social` 的本期范围内。

---

### 4.3 插件 hookspec 扩展：登录方式扩展点（社交登录）

修改：

- `apps/api/plugin/hooks.py`：新增 hookspec
  - `def auth_sso_providers(self) -> list[Any]: ...`
- `apps/api/plugin/core_impl.py`：返回空列表

约定 provider 最小协议（建议用 Protocol 收敛，集中管理，避免循环依赖）：

- `provider: Literal["google", "github", ...]`
- `async is_enabled() -> bool`
- `async build_start_url(redirect) -> str`
- `label` / `label_i18n`
- `icon_url`（可选，用于前端按钮；无则走 fallback）

`AuthSSOService` 将通过 `plugin_host.hook.auth_sso_providers()` 汇总并按 system 配置过滤。

---

## 5. OAuth 登录插件（拆分为两个插件）

### 5.1 本期交付：社交登录插件（plugins/plugin-oauth-social）

`plugins/plugin-oauth-social/`

- `plugin.toml`
- `locales/zh-CN/oauth.json`
- `locales/en-US/oauth.json`
- `src/oauth/`
  - `plugin.py`（`OAuthPlugin(BasePlugin)`，提供 hookimpl）
  - `routers.py`（`public_router`：start/callback；可选 `admin_router`：debug/health）
  - `service.py` / `repository.py` / `schema.py`
  - `models.py`（若需要 OAuthIdentity 映射表）

#### 5.1.1 plugin.toml 关键字段（MVP）

- `id = "plugin-oauth-social"`, `slug = "oauth"`, `entrypoint = "oauth.plugin:OAuthPlugin"`
- `config_scope = "system"`
- `icon = "assets/logo.svg"`（可选；用于 Admin 插件列表与详情页展示；无则 fallback）
- `config_schema`：
  - section `google`：`enabled(bool)`, `client_id(str)`, `client_secret(str, secret=true)`
  - section `github`：`enabled(bool)`, `client_id(str)`, `client_secret(str, secret=true)`
  - section `provisioning`：
    - `auto_provision_enabled(bool, default=false)`
    - （可选）`auto_accept_email_invites(bool, default=true)`（仅在你们采用“邀请驱动加入 workspace”的产品策略下启用）

#### 5.1.2 OAuthIdentity 模型（建议）

`OAuthIdentity`：

- `provider`（"google"/"github"）
- `subject`（provider user id / sub）
- `user_id`（FK users）
- `email`（冗余，便于排障）
- unique：`(provider, subject)`

约束：

- **不存第三方 access_token/refresh_token**（避免扩大敏感面）

#### 5.1.3 public_router（插件路由）

插件路由挂载规则参考 `apps/api/plugin/routes.py`：

- public: `/plugins/{slug}/...` => `/plugins/oauth/...`（slug 仍为 `oauth`，对外保持稳定）

#### 5.1.3.1 Start

- `GET /plugins/oauth/start/{provider}`
  - query：`redirect`（可选）
  - 逻辑：
    1) 校验 provider
    2) 读取 system-scope 插件配置（SettingRecord）
    3) state + PKCE，写 Valkey `oauth:state:{state}` TTL=10min，payload：
       - provider, redirect, code_verifier
    4) 302 到 provider authorize URL

#### 5.1.3.2 Callback

- `GET /plugins/oauth/callback/{provider}`
  - query：`code`, `state`
  - 逻辑：
    1) 消费 `oauth:state:{state}`
    2) 用 code + code_verifier 换 token（httpx async）
    3) 拉取 userinfo（Google userinfo；GitHub user + emails）
    4) 解析：subject、email、email_verified（可得则用）
    5) 绑定/创建用户：
       - 若 `OAuthIdentity(provider, subject)` 存在：使用其 user_id
       - 否则优先用 email 找 user；找不到则：
         - 若 `AUTH__ALLOW_PUBLIC_REGISTER=true` 或 system 配置 `auto_provision_enabled=true`：创建 User
         - 否则拒绝（回跳前端显示“请联系管理员/需要邀请”）
    6) （可选推荐）自动接受 email invite：
       - 查 `WorkspaceEmailInvite`，把用户加入对应 workspace 并赋 role
    7) 生成 `TokenPair`（建议抽取 `AuthService.issue_token_pair_for_user(user_id)`）
    8) 生成一次性 exchange code：Valkey `oauth:exchange:{code}` TTL=60s
    9) 302 回前端：`/login?oauth_code=...&redirect=...`

### 5.2（规划）企业 SSO 插件（plugins/plugin-enterprise-sso）

目标（不在本期范围）：

- 支持租户自带 IdP（Generic OIDC discovery；未来可扩展 SAML）
- 配置作用域为 org/workspace/site（按产品与隔离要求确定）
- 引入 tenant 定位策略（Email-first / org slug / 域名映射）
- 通常面向自部署或收费企业版

---

## 6. Admin 前端改造

### 6.1 插件详情/配置页（schema-driven 通用配置页）

目标：补齐现有 Coming Soon，并成为所有插件统一配置页的基础设施。

路由：

- `/plugins/$pluginSlug`：若存在 current workspace，则 redirect 到 `/w/{id}/plugins/{pluginSlug}`
- `/w/$workspaceId/plugins/$pluginSlug`：实际渲染插件页

页面结构建议：

1) Overview：元信息（name/desc/version/author/status），workspace enabled toggle
2) Settings：schema-driven 配置表单
3) Diagnostics（可选）：比如 OAuth redirect/callback URL 提示

新增组件建议：

- `apps/web/admin/src/components/plugins/plugin-settings-form.tsx`
  - `React Hook Form` + 动态 Zod
  - secret 字段：
    - 默认空输入框 + “已设置”提示
    - 用户未输入则不提交该字段（保持原值）

调用 API（本期优先复用 system settings + 插件中心）：

- 插件启停（workspace）：继续走插件中心 API（已存在）
- 插件配置（system）：`/system/settings/plugin:plugin-oauth-social`（仅 self_host 可见）

UI 门禁建议（避免 SaaS 租户误看到“平台级配置”入口）：

- Admin 端先调用 `GET /system/runtime`（已存在）
  - 当 `capabilities.deployment_settings_enabled=false`（通常是 SaaS 模式）：
    - 插件详情页 Settings 面板显示为“由平台维护/不可配置”（或直接隐藏）
  - 当 `deployment_settings_enabled=true`（self_host）：
    - 显示 Settings 表单并调用 `/system/settings/*`

### 6.2 登录页 SSO（社交登录）

改造目标：在登录页直接展示当前实例启用的 Google/GitHub SSO 按钮。

交互：

1) 页面加载后（或在登录区块内）调用 `GET /auth/sso/providers`
2) 渲染 providers buttons（显示 icon；无 icon 则 fallback）
3) 点击 provider：跳转 `start_url`
4) 回跳带 `oauth_code`：调用 `POST /auth/sso/exchange` 获取 `TokenPair`，执行 `applyLogin` 并跳转

---

## 7. 测试计划（必须覆盖）

### 7.1 后端（pytest）

1) 插件配置 secret 加密/脱敏：
   - patch 提交 secret 明文 -> 落库为 `enc:v1:*`
   - GET detail -> secret 字段为 `null`，`secrets[path]=true`
   - patch 不包含 secret -> secret 不清空

2) Auth SSO providers 列表：
   - 配置启用时返回 google/github provider
   - 未启用时返回空列表（前端不展示按钮）

3) exchange code one-time：
   - exchange 成功一次后再次 exchange -> 失败

### 7.2 前端（Vitest + RTL）

1) `PluginSettingsForm`：
   - secret 字段未输入不提交
   - 非 secret 字段提交 patch 正确

2) login SSO：
   - providers query -> 渲染 provider buttons
   - oauth_code exchange 成功 -> applyLogin + redirect

---

## 8. 迁移与兼容性

- DB：
  - OAuth 插件若引入 `models`，需要插件 migrations（你们已有插件迁移机制）
  - `SettingRecord` 表已存在，本方案复用，不新增表
- 配置：
  - 需要 master key 才能写入 secret；缺失时必须返回 `MASTER_KEY_MISSING`
- 兼容：
  - 不删除旧的 `PluginRecord.config`，仅新增“更安全的配置通道”
  - `plugins/plugin-admin-dynamic-menu` 保留 `.disabled` 仅供参考

---

## 9. 本方案已做出的默认选择（便于后续讨论时聚焦修改点）

- OAuth 目标：降低注册/登录摩擦（社交登录）
- 插件拆分：`plugin-oauth-social`（本期交付）+ `plugin-enterprise-sso`（规划）
- Provider：Google + GitHub（企业专属 OIDC/SAML 作为 enterprise-sso 插件能力）
- 配置 UI：schema-driven 通用配置页
- 配置作用域：system（平台统一维护一套配置）
- 租户定位：不需要（社交登录不做 tenant 自带 IdP）
- OAuth 登录后账号策略：支持自动创建（由配置/开关控制，默认关闭）
- Token 下发：exchange code（one-time）而非直接在 URL 返回 token

---

## 10. 插件 Icon（新增契约）

目标：插件在 Admin（插件列表、详情、设置入口等）能够展示插件 logo；若未提供则 fallback。

### 10.1 manifest 新增字段

在 `plugin.toml` 的 `[plugin]` 下新增可选字段：

- `icon: str | None`

约定：

- `icon` 为插件包内相对路径（推荐）：例如 `assets/logo.svg`
- `icon` 也允许为绝对 URL（`https://...`）用于外部托管（可选策略）
- 若 `icon` 缺失或无法加载，前端 fallback 使用内置默认图标（如 `Package`）

### 10.2 icon 资源的对外访问方式（实现建议）

为避免每个插件都手写静态文件路由，建议由宿主提供统一的资源读取接口，并进行路径安全校验：

- `GET /workspaces/{workspace_id}/plugins-center/{plugin_ref}/icon`
  - 权限：`system:plugins:read`
  - 仅用于读取插件 icon 文件（不暴露任意文件）
  - 若插件未声明 icon 或文件不存在：返回 404
  - 前端收到 404 后走 fallback

（可选）若未来需要在无 workspace 上下文的页面展示插件 icon（例如公共插件市场页），可再补充一个 system 级读取接口：

- `GET /system/plugins-manager/{plugin_ref}/icon`
  - 权限：`require_org_admin`
  - 语义同上

> 备注：若后续要支持更多插件静态资源（如前端注入 bundle），再扩展为 `/assets/*`，但本期仅做 icon 即可。
