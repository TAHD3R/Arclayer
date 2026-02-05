# Admin 动态菜单硬化（闪烁 / 本地化 / 缺项 / 路由门禁）

日期：2026-02-06
范围：`apps/web/admin`、`apps/api/modules/system/admin/menus`
关联：`docs/plans/2026-02-04-plugin-system-pluggy-watchfiles-workspace-plugin-center.md`

> 本文档用于承接上一阶段“静态菜单 -> 动态菜单（服务端输出 + 前端渲染）”的落地后问题修复与安全加固。

---

## 1. 问题清单（现象 -> 风险）

### 1.1 侧栏菜单闪烁（静态 fallback 瞬间出现）

- 现象：页面加载瞬间先渲染静态 `ADMIN_NAV_ITEMS`，随后切换为动态菜单树。
- 风险：
  - 体验问题（闪烁）。
  - 安全窗口期：在“动态菜单未加载完成”时短暂暴露不应出现的菜单项（即使点击后可能被 API 拒绝，也会造成混乱）。

### 1.2 菜单语言与工作区默认语言不一致

- 现象：
  - 已设置工作区默认语言为中文，且请求 Header `X-Locale=zh-CN`，菜单仍返回英文。
  - `apps/web/admin/src/pages/settings/workspace/page.tsx` 的“工作区本地化 -> 默认语言”选择并保存后，效果不明显/不生效。
- 风险：
  - UI 与工作区治理意图不一致。
  - 菜单缓存（React Query）可能被“不同 locale”复用，导致语言错乱。

### 1.3 高权限账号仍缺少菜单项（DB 有数据，is_active=true）

- 现象：最高权限账号仍缺少如 `content.library`、`appearance.navigation`、`settings.maintenance.activity` 等菜单项；确认 DB 内存在这些记录，且 `is_active=true`。
- 风险：
  - 菜单树过滤逻辑或 seed 冲突策略导致“应可见项被误隐藏”。
  - 影响 RBAC 与插件中心治理的可用性。

### 1.4 路由绕过漏洞（菜单不显示但可直接访问路径）

- 现象：即使菜单项不可见，用户知道路径仍能进入页面。
- 风险：
  - 若菜单可见性被视为访问边界，则属于重大漏洞（前端路由未门禁 + 可能缺少后端统一鉴权）。
  - 即使后端 API 有鉴权，前端页面也可能出现“先渲染后报错”的信息泄露/体验问题。

---

## 2. 修复目标与原则

目标：

1) 彻底移除“动态菜单加载期使用静态菜单 fallback”的渲染路径，改为骨架屏占位。
2) 菜单语言与 `locale` 一致：工作区默认语言在无个人偏好时应生效；菜单缓存按 locale 隔离。
3) 修复菜单缺项：核心 seeds 具备自愈能力（core 优先），避免被错误 owner 覆盖而在过滤中丢失。
4) 补齐工作区路由门禁：对 `/w/:workspaceId/**` 生效，基于“当前用户可见菜单路径集合”做前端访问拦截（fail-closed），避免绕过。

原则：

- 骨架屏优先使用项目自研方案（`SidebarMenuSkeleton` / `PageState` / `PageSkeleton`）。
- `/w/` 前缀为工作区级路由门禁边界；不影响组织级/未登录态路由。
- 门禁按“菜单 path 前缀”判定可访问范围，并为少量系统路由提供显式 allowlist（如通知中心、组织设置重定向）。

---

## 3. 实施步骤（按顺序）

### Phase 1：侧栏闪烁治理（骨架屏替代静态 fallback）

- 前端：`apps/web/admin/src/layouts/admin-layout.tsx`
  - 动态菜单 query 初次加载时：
    - 侧栏区域渲染 `SidebarMenuSkeleton` 列表；
    - 禁止渲染 `ADMIN_NAV_ITEMS` 作为加载态 fallback（仅允许在“请求失败”时作为兜底/排障模式）。

验收：

- 首次进入工作区页面时侧栏无“静态菜单闪一下”。

### Phase 2：菜单本地化与工作区默认语言链路修复

- 后端：`apps/api/modules/system/admin/menus/service.py`
  - 构建菜单输出时使用 `title_i18n` 进行本地化（仍保留 `title_i18n` 字段返回用于前端兜底/调试）。
- 前端：`apps/web/admin/src/layouts/admin-layout.tsx`
  - React Query 的菜单 queryKey 必须包含当前 effective locale（避免缓存串语言）。
- 前端：`apps/web/admin/src/pages/settings/workspace/page.tsx`
  - 保存工作区默认语言后：
    - 若用户没有显式个人语言偏好（`localePreference==null`），立即应用为 effective locale；
    - 失效并刷新菜单 query（确保菜单语言/内容同步）。

验收：

- 在 `zh-CN` 下菜单显示中文；切换语言后菜单会随之刷新，不出现语言错乱/缓存复用。
- “工作区本地化 -> 默认语言”保存后，在无个人偏好时能即时生效。

### Phase 3：菜单缺项修复（core seed 自愈 + 超管可见性）

- 后端：`apps/api/modules/system/admin/menus/seeds.py`
  - 当 core seed 与已存在记录 code 冲突且记录 owner 非 core 时，core 应夺回（覆盖 meta.plugin_id=core），避免被插件/旧数据污染。
- 后端：`apps/api/modules/system/admin/menus/service.py`
  - 超级用户（superuser）应优先放行（避免被“插件启用过滤”误伤）。

验收：

- 重启后 core 菜单项完整可见（含 `content.library` / `appearance.navigation` / `settings.maintenance.activity` 等）。

### Phase 4：工作区路由门禁（阻断“知道路径即可访问”）

- 前端：`apps/web/admin/src/layouts/admin-layout.tsx`
  - 对 `/w/:workspaceId/**` 路由启用门禁：
    - 菜单加载中：阻塞内容区渲染（Page skeleton），避免窗口期；
    - 菜单加载失败：fail-closed，提示错误并提供重试；
    - 菜单加载成功：若当前 pathname 不匹配任一“可见菜单路径前缀”且不在 allowlist，显示 403（`ForbiddenView`）。
  - allowlist（最小集合）：
    - 通知中心：`/w/:workspaceId/notifications`
    - 组织设置重定向：`/w/:workspaceId/settings/organization`（该路由 beforeLoad 会 redirect 到 `/settings/organization`）
    - 兼容别名路由：如当用户可见 `team/members` 时允许访问 `/w/:workspaceId/team`

验收：

- 隐藏的菜单页面无法通过手动输入 URL 访问（直接 403）。
- 菜单尚未加载时不会短暂渲染页面内容。

---

## 4. 回归与验证

- 后端：
  - `pnpm -C apps/api typecheck`
  - `pnpm -C apps/api test`（或项目既定测试入口）
- 前端：
  - `pnpm -C apps/web/admin typecheck`
  - `pnpm -C apps/web/admin lint`（若有）
- 手动回归：
  - 语言：在无个人偏好时，切换 workspace 默认语言应改变 UI 与菜单；有个人偏好时应保持个人优先。
  - 权限：不同角色只看到允许的菜单；尝试直达未授权路径应被拦截。
