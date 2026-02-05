# 动态菜单与工作区本地化问题修复执行计划（按顺序交付）

日期：2026-02-05
范围：`apps/web/admin`、`apps/api/modules/system/admin/menus`、`apps/api/modules/system/admin/menus/seeds.py`、`apps/api/modules/workspaces/settings`（少量联动）
目标：消除侧栏闪烁、修复菜单语言一致性、修复“高权限缺项”、补齐工作区级路由访问门禁（防路径绕过）

---

## 0. 背景与问题描述（现状）

上一阶段为了支持插件注入菜单，将 Admin 端静态菜单改为后端动态菜单（`/workspaces/{workspace_id}/menus/me`）驱动渲染。方向正确，但引入了四类问题：

1. **侧栏闪烁**：动态菜单返回前，会短暂显示 fallback 静态菜单，随后切换为动态菜单。
2. **语言不一致**：工作区默认语言配置为 `zh-CN` 且请求头 `X-Locale=zh-CN` 时，菜单仍显示英文；同时 `apps/web/admin/src/pages/settings/workspace/page.tsx` 的“工作区本地化-默认语言”Select 保存后疑似不生效。
3. **高权限缺项**：最高权限账号仍缺少 `content.library`、`appearance.navigation`、`settings.maintenance.activity` 等菜单项。
4. **路径绕过漏洞（重大）**：菜单项不显示，但用户知道 URL 仍可直接访问对应页面；若意图是限制访问范围，这是严重问题。

补充事实（来自现有排查）：

- `admin_menu_items.is_active` 已确认全部为 `true`。
- 数据库中包含 core 菜单记录（含 `code/title/title_i18n`），例如 `content.library`、`appearance.navigation`、`settings.maintenance.activity` 等。

路由结构约定：

- `/w/{workspaceId}/...` 为工作区级路由（需要工作区权限/菜单门禁）
- 不带 `/w/` 的路由为组织级路由或非登录态路由（不应被工作区菜单门禁误伤）

---

## 1. 总体修复策略（按顺序交付）

严格按以下顺序完成，每一阶段可独立验收：

- **Phase 1**：侧栏闪烁 → 使用项目内自研骨架屏（不再渲染静态菜单 fallback）
- **Phase 2**：语言一致 → 后端菜单接口输出本地化 title + 前端缓存/生效链路补齐
- **Phase 3**：缺项修复 → 聚焦“可见性过滤链路”，重点排查/修复 `meta.plugin_id` 归属与树结构（`parent_id` / `deleted_at`）
- **Phase 4**：路径绕过漏洞 → 仅对 `/w/` 工作区路由做“菜单前缀门禁”，渲染 403（Forbidden）

---

## 2. Phase 1：消除侧栏闪烁（自研骨架屏优先）

### 2.1 现象根因（代码定位）

- AdminLayout 中动态菜单 query 未返回时直接 fallback 静态菜单 `ADMIN_NAV_ITEMS`，造成必然闪烁。
- 文件：`apps/web/admin/src/layouts/admin-layout.tsx`
- 关键点：`workspaceMenuQuery.data` 未就绪时使用静态菜单。

### 2.2 实施方案（必须）

不在 loading 阶段渲染静态菜单；改为侧栏骨架屏。

#### 修改点

- `apps/web/admin/src/layouts/admin-layout.tsx`
  - 引入 `isWorkspaceMenuBooting = !isOrgScopeRoute && workspaceId && workspaceMenuQuery.isLoading && !workspaceMenuQuery.data`
  - 当 `isWorkspaceMenuBooting` 为 `true` 时：
    - 侧栏区域：渲染自研 `SidebarMenuSkeleton` 列表（8~12 行）
    - 不渲染 `AdminSiderNav`（避免静态菜单闪烁）
- 骨架组件复用：
  - `SidebarMenuSkeleton` 已存在于 `apps/web/admin/src/components/ui/sidebar.tsx`

#### 骨架渲染建议（自研方案）

- 首层 skeleton 适当 `showIcon=true`，其余为 `false`，模拟真实侧栏结构。
- skeleton 行数建议 10 行（可微调）。

### 2.3 同步约束（为 Phase 4 铺垫，推荐一起做）

在菜单首次加载期间，主内容区也应阻塞渲染 `<Outlet/>`，避免出现“短暂窗口期可绕过访问”。

- 在 AdminLayout 的内容区：
  - `isWorkspaceMenuBooting` 时渲染 `PageSkeleton` 或等价 loading 占位
  - 菜单 ready 后再渲染 `RouteTransition + <Outlet/>`

### 2.4 验收用例

- 冷启动（清 localStorage + 强刷）进入 `/w/{id}`：
  - 侧栏不出现静态菜单闪现
  - 仅出现骨架 → 菜单返回后一次性出现真实菜单

---

## 3. Phase 2：修复菜单语言一致性与“默认语言保存不生效”

### 3.1 菜单语言根因（后端必须修）

当前 `/menus/me` 返回的 `AdminMenuNode.title` 直接来自 DB 字段 `title`（core seeds 为英文），并未基于 `title_i18n` 和当前 locale 做翻译。因此即便 `X-Locale=zh-CN`，返回仍可能是英文 title。

- 文件：`apps/api/modules/system/admin/menus/service.py`
- 当前行为：`title=item.title, title_i18n=item.title_i18n`

### 3.2 后端修复方案（后端输出本地化 title）

#### 修改点

- `apps/api/modules/system/admin/menus/service.py`
  - 在 `get_menu()`、`get_catalog()` 的 `_build_node` 中：
    - 若 `title_i18n` 存在：解析 `namespace:key`（如 `nav:NAV_CONTENT`）
    - 用 `t(namespace, key, default=item.title)` 生成本地化 title
    - 仍然返回 `title_i18n` 字段（便于前端兜底/排障）
  - 注意：locale 来源应依赖现有 `LocaleMiddleware` 设置的 current locale（不在 service 内重复读 header）

相关基础设施已存在：

- Locale middleware：`apps/api/modules/system/middleware/locale.py`
- i18n 工具：`apps/api/core/i18n.py`

### 3.3 前端同步增强：缓存按 locale 隔离（避免英文响应被缓存）

#### 修改点

- `apps/web/admin/src/layouts/admin-layout.tsx`
  - 将 `workspaceMenuQuery.queryKey` 从 `["workspace","adminMenu", workspaceId]` 改为 `["workspace","adminMenu", workspaceId, effectiveLocale]`
  - `effectiveLocale` 建议取 `usePreferencesStore((s)=>s.locale)`（它会被 workspace default locale / 用户 preference 驱动变化）

### 3.4 Workspace 默认语言 Select “保存不生效”的解释与修复（UX + 生效链路）

#### 常见原因拆解（必须向用户解释清楚）

- 产品逻辑：若用户设置了个人语言偏好（`localePreference != null`），工作区默认语言不会覆盖当前用户 UI（这是合理策略，但会被误解为“不生效”）。
- 权限逻辑：保存 workspace core settings 需要 `system:settings:manage`，若权限不足会 403，需要 UI 明确提示并禁用保存动作。

#### 修改点（前端）

- `apps/web/admin/src/pages/settings/workspace/page.tsx`
  1. 增加说明文案（当 `localePreference != null`）：
     - “工作区默认语言仅对未设置个人语言偏好的用户生效；你当前已设置个人偏好，因此不会覆盖你的界面语言。”
  2. 保存成功后：
     - 若 `localePreference == null`：主动调用 `setEffectiveLocale(savedLocale)` 使当前 UI 立即生效
     - 同时 invalidate 菜单 query：`invalidateQueries(["workspace","adminMenu", workspaceId, ...])`
  3. 若无 `system:settings:manage`：
     - 禁用 confirm/save 入口，给出明确权限提示（避免“看起来保存没反应”）

### 3.5 验收用例

- workspace 默认语言=zh-CN：
  - `/menus/me` 返回 title 为中文（无需依赖前端翻译）
- 切换 UI 语言后：
  - 菜单自动刷新，不出现“缓存的英文菜单”
- 在有个人语言偏好的账号上：
  - 保存 workspace 默认语言成功但 UI 不强制切换；提示文案明确

---

## 4. Phase 3：修复“高权限缺项”（DB 有数据但菜单缺）

> 已确认 `is_active=true`，因此重点排查：`deleted_at`、`meta.plugin_id`、`parent_id`、以及 `/menus/me` 的过滤策略。

### 4.1 高概率根因 1：meta.plugin_id 归属错误导致被当作插件菜单过滤

后端 `/menus/me` 可见性规则（简化）：

- 如果 `meta.plugin_id` 非空且不为 `"core"`：只有插件在当前 workspace enabled 才显示，否则隐藏（fail-closed）

因此：即便 DB 有 `content.library` 等记录，如果其 `meta.plugin_id` 被污染为某插件 id，且该插件未在 workspace 启用，则该项会被隐藏，造成“缺项”。

涉及文件：

- `apps/api/modules/system/admin/menus/service.py`（`_allowed` 逻辑）
- `apps/api/modules/system/admin/menus/seeds.py`（seed 写 `meta.plugin_id`）

### 4.2 高概率根因 2：树结构不可达（parent_id 指向不可见/已软删节点）

菜单树构建方式是从 root（`parent_id is null`）递归构建。如果某个 item 的 `parent_id` 指向一个不在候选集合的节点（例如 parent `deleted_at` 非空），则该 item 永远不可达，从而在输出中“缺项”。

候选集合过滤条件：

- `deleted_at is null AND is_active = true`（`is_active` 已确认全 true，但 `deleted_at` 未确认）

涉及文件：

- `apps/api/modules/system/admin/menus/repository.py`（`query_items_for_user`）
- `apps/api/modules/system/admin/menus/service.py`（children 映射与 roots 构建）

### 4.3 修复方案（后端，必须具备自愈能力）

#### 目标

- core 菜单的 code 集合必须稳定且不受插件污染；
- 重启后自动修复历史数据（idempotent）。

#### 修改点

- `apps/api/modules/system/admin/menus/seeds.py`
  - 调整冲突策略：当 `owner_plugin_id == "core"` 且发现 existing item 的 `meta.plugin_id != "core"`：
    - core 必须“夺回”该条记录（覆盖关键字段 + `meta.plugin_id` 重置为 core）
    - 记录 warning 日志包含 `code/previous_owner`
  - 这能确保启动时 `ensure_core_admin_menus_ready(update_existing=True, restore_deleted=True)` 真正具备纠偏能力。

#### 验收用例

- 重启服务后 `/menus/me`：
  - owner/creator-admin 能看到完整 core 菜单项（`content.library` / `appearance.navigation` / `settings.maintenance.*` 等）
- 插件启停不影响 core 菜单项存在与可见性。

---

## 5. Phase 4：修复“知道路径仍可访问”的绕过漏洞（仅工作区级 /w/）

### 5.1 根因

前端路由守卫仅处理 token/setup，不处理菜单可见性与权限，导致 URL 直达可访问页面壳。

涉及文件：

- `apps/web/admin/src/routes/__root.tsx`
- `apps/web/admin/src/routes/w/$workspaceId.tsx`

### 5.2 修复方案（前端，按菜单 path 前缀门禁）

对 `/w/{workspaceId}/...` 生效：从动态菜单树提取允许访问 path 前缀集合，拒绝不在集合内的 pathname。

#### 修改点

- `apps/web/admin/src/layouts/admin-layout.tsx`（推荐统一拦截）
- 复用 403 页面：`apps/web/admin/src/pages/builtin/forbidden-page.tsx`

#### 实施细节

1. 仅对 `pathname.startsWith(workspaceBase)` 的请求做门禁（`workspaceBase=/w/{id}`）。
2. 菜单首次加载期（Phase 1 已阻塞）：
   - 菜单没 ready 前不渲染 `<Outlet/>`，避免绕过窗口期
3. 菜单 ready 后计算 allow prefixes：
   - 遍历 `AdminMenuNode` 树，收集所有有 `path` 的节点，对应到前端已拼接 base 后的 `to`
   - 允许访问条件：`pathname === prefix` 或 `pathname.startsWith(prefix + "/")`
4. allowlist：
   - 对一些不在菜单里但必须存在的 workspace 页面做白名单（按实际路由补齐，例如通知中心等）
5. 不符合 allow 条件：
   - 渲染 `ForbiddenView variant="admin"`

### 5.3 后端配套说明（安全边界）

- 前端门禁解决“页面壳绕过”，但不能作为最终安全边界；
- 后端各 API 必须继续使用 `require_workspace_permission(...)` 作为强制鉴权。

### 5.4 验收用例

- 无权限用户：
  - 菜单不显示该项
  - 手动输入对应 `/w/{id}/...` 路径：直接 403 页面
- 有权限用户：
  - 菜单路径与其子路径可正常访问

---

## 6. 验证与回归清单（建议执行顺序）

### 6.1 后端

1. 单测（新增/补齐）：
   - 菜单 title 本地化：`title_i18n` 存在时输出中文（`locale=zh-CN`）
   - core seed 冲突夺回：existing `meta.plugin_id != core` 时 core 仍能覆盖纠正
2. 手工验证：
   - `/menus/catalog` vs `/menus/me` 对比（缺项应仅来源于权限过滤，而不是树不可达）

### 6.2 前端（admin）

- `pnpm -C apps/web/admin typecheck`
- `pnpm -C apps/web/admin lint`
- 手工：
  - 冷启动无闪烁
  - 切换语言菜单立即刷新
  - `/w/` 路由绕过被拦截为 403

---

## 7. 风险与降级策略

- 若菜单接口异常：
  - 不建议回退到静态菜单（会引入权限误闪），建议保持 skeleton + toast + 重试按钮
- 路由门禁误伤风险：
  - 通过 allowlist 控制非菜单入口页；逐步补齐 allowlist 而不是一次性放开

---

## 8. 明确假设（已由当前信息锁定）

- `admin_menu_items.is_active` 全部为 true（已确认）
- `/w/` 路由为工作区级，需执行菜单门禁；非 `/w/` 路由不执行该门禁（已确认）
