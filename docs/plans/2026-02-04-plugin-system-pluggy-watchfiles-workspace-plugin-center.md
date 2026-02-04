# 插件系统升级（Pluggy + Watchfiles）与工作区级插件中心落地记录

日期：2026-02-04
最后更新：2026-02-05
范围：`apps/api`、`apps/web/admin`、`apps/web/portal`、`apps/api/migrations`

> 本文档用于沉淀本次“插件架构升级 + 多端扩展能力 + 插件治理边界 + 运维/排障”方案与落地细节，偏实施记录与验收清单，可直接用于交付与复盘。

---

## 1. 背景与目标

### 1.1 背景

项目此前已实现过一版“手搓插件系统/扩展点”，但随着能力扩展，逐步暴露出：

- 扩展点契约分散，缺少统一规范（扩展点命名/返回值/生命周期/调试方式）。
- 插件能力需要从“仅服务端增强”扩展到：
  - Admin 端：侧边栏菜单注入、页面扩展（slot）。
  - Portal 端：运行时增强（本次先做 SSR head 注入作为 MVP）。
- 插件治理需要更清晰的边界：
  - 插件包安装/升级是全局行为；
  - 插件启用/禁用与配置更符合工作区（workspace）治理。
- 开发体验问题：
  - 插件开发/调试时，需要文件变更后能触发安全的重启/缓存刷新；
  - WSL / Docker bind mount 场景下 watch 日志容易刷屏，影响开发效率。

### 1.2 目标（本次交付）

1) 使用 **pluggy** 建立规范 hooks（可扩展、可测试、可追溯）。
2) 引入 **watchfiles** 实现开发期文件监控：
   - 语言包变化：清 i18n 缓存；
   - 插件代码变化：请求重启（避免不安全热重载）。
3) 插件架构升级为“三端扩展”：
   - 后端能力增强（hooks / routes / jobs / permissions / i18n）
   - Admin 菜单注入 + Admin UI slot 扩展
   - Portal 扩展（MVP：SSR head 注入）
4) 建立 **工作区级插件中心**：
   - 全局安装（PluginRecord）
   - 工作区启停与配置（workspace_plugins）
   - Admin 插件管理页可用（安装/启停/重置/卸载）
5) RBAC 与菜单治理：
   - 初始账号/创建者应具备最高权限（creator-admin 自动绑定 owner 角色）
   - 角色“可见菜单范围”配置入口（不做菜单 CRUD）
6) arq 任务体系与插件扩展能力可对接（functions/cron jobs）。

### 1.3 非目标（明确不做）

- Admin 端不提供“菜单 CRUD”作为产品能力（即使后端保留了相关接口，前端不作为产品入口开放）。
- Portal 扩展暂不做复杂运行时组件注入（先从 head 注入闭环开始）。
- 插件“按工作区配置生效”的运行时读取入口仅实现存储与接口（后续可增强为 host.get_effective_config）。

---

## 2. 核心决策与边界

### 2.1 插件治理边界：全局安装 + 工作区启停/配置

- **全局安装**：插件包的安装/升级/卸载属于系统级操作（落库到 `PluginRecord`）。
- **工作区启停与配置**：插件是否在某个 workspace 生效，属于工作区治理：
  - 表：`workspace_plugins`
  - 作用：控制 Admin 菜单/扩展点、插件路由 gate、未来按工作区配置生效。

### 2.2 多端扩展边界

- 后端：通过 pluggy hooks 承载“可声明的扩展能力”（storage/rbac/arq 等）。
- Admin：
  - 菜单树：服务端输出菜单树，前端动态渲染；
  - 扩展点：服务端输出 `admin_ui_extensions`，前端按 slot 渲染。
- Portal：
  - MVP：后端输出 `portal_extensions`，Portal SSR 在 `<head>` 注入（link/script/style）。

### 2.3 菜单治理原则：不做 CRUD，但允许“边界途径新增页面”

从产品角度，Admin 不开放菜单 CRUD；新增页面的边界途径为：

1) Core 菜单 seeds（产品内置页面，随版本演进）。
2) 插件 manifest 声明 `admin_menu` seeds（插件可携带菜单与路由信息）。

角色可见菜单范围的调整通过“权限集合”完成，而不是菜单结构编辑。

---

## 3. 后端插件系统（Pluggy）设计与实现

### 3.1 Pluggy hooks 规范

核心文件：

- `apps/api/plugin/hooks.py`：hookspec 定义（`CelestialHooks`）
- `apps/api/plugin/host.py`：全局 `PluginHost`，负责 pluggy PluginManager、EventBus
- `apps/api/plugin/core_impl.py`：core 作为 pluggy plugin 注册（默认能力）

当前 hooks（实现已落地）：

- `storage_provider_factories()`：存储 provider factory 扩展
- `rbac_role_resolvers()`：RBAC 角色解析器扩展
- `arq_functions()`：插件声明 arq job functions
- `arq_cron_jobs()`：插件声明 arq cron jobs

设计约束：

- hooks 保持同步（sync），返回“声明性对象”（factory/handler/descriptor）。
- 需要 I/O 的 async 操作在消费侧（service/worker）执行，而不是在 hook 内部执行。

### 3.2 插件发现与 manifest

插件目录默认：`PLUGIN__ROOT_DIR`（默认值见 `apps/api/config.py` 的 `PluginSettings.root_dir`）。

发现规则：

- `apps/api/plugin/manager.py` 扫描：`plugins/*/plugin.toml`
- slug 需全局唯一，冲突直接报错（避免路由与 UI 混乱）

manifest 模型：

- `apps/api/plugin/manifest.py`（Pydantic v2）
- 关键字段：
  - `plugin.id`、`plugin.slug`、`plugin.entrypoint`、`plugin.requires`、版本信息等
  - `permissions[]`：插件权限模板（可进入 RBAC）
  - `models[]`：插件模型模块（ORM init / migration）
  - `admin_menu[]`：Admin 菜单 seed
  - `admin_ui_extensions[]`：Admin UI slot 扩展声明
  - `portal_extensions[]`：Portal 扩展声明（本次落地 MVP）

示例（历史示例文件，供参考）：

- `plugins/plugin-admin-dynamic-menu/plugin.toml.disabled`

> 注意：示例文件为 `.disabled`，实际启用需命名为 `plugin.toml` 才会被发现。

---

## 4. watchfiles（开发期文件监控）落地说明

### 4.1 行为

实现位置：`apps/api/plugin/watch.py`

- 仅在开发环境启用：
  - `settings.app_env == "development"`
  - `PLUGIN__WATCH_ENABLED == true`
- 监听路径：
  - 插件目录：`PLUGIN__ROOT_DIR`（当 `PLUGIN__WATCH_PLUGINS=true`）
  - 语言包：
    - repo 根目录 `locales/`
    - 插件内部 `plugins/**/locales/`（当 `PLUGIN__WATCH_LOCALES=true`）
- 触发动作：
  - `locales/**/*.json` 变化：清理 i18n JSON 缓存（`apps/api/core/i18n.py:clear_locale_cache()`）
  - `plugins/**` 变化：通过现有重启机制请求重启（避免热重载带来的 module 状态污染）

### 4.2 启动与停止

实现位置：`apps/api/core/registry.py`

- FastAPI lifespan startup：
  - `start_plugin_watchers(app, settings, plugin_manager=plugin_manager)`
  - `start_restart_watcher(app, settings)`
- shutdown：
  - `stop_plugin_watchers(app)`
  - `stop_restart_watcher(app)`

### 4.3 WSL/Docker 下 watchfiles debug 刷屏治理

问题现象（WSL 常见）：

- 控制台反复输出 `rust notify timeout, continuing`（来自 `watchfiles.main` 的 debug 日志）

治理策略（只抑制 watchfiles，不影响全局 debug 输出）：

- 配置项：`LOGGING__WATCHFILES_LEVEL`（默认 `INFO`）
- 实现：`apps/api/core/logging.py` 对 `watchfiles` / `watchfiles.main` 单独设置 level

建议：

- 本地开发（WSL/Docker bind mount）：保持默认 `INFO` 即可。
- 若确实需要排查 watchfiles 细节，可临时设置：

```bash
LOGGING__WATCHFILES_LEVEL=DEBUG
```

---

## 5. Admin 菜单系统：动态菜单树 + RBAC + 工作区插件门禁

### 5.1 菜单输出接口

路由：`apps/api/modules/system/admin/menus/router.py`

- `GET /workspaces/{workspace_id}/menus/me`
  - 用途：获取“当前用户在当前工作区可见”的菜单树（RBAC + 插件启用过滤后的结果）
  - 依赖：`admin:access`
- `GET /workspaces/{workspace_id}/menus/catalog`
  - 用途：获取“完整菜单目录”（不按用户过滤），用于配置角色菜单范围
  - 依赖：`rbac:roles:write`

> 额外：后端仍保留菜单 CRUD 接口（`admin:menu:read/write`），但前端不将其作为产品能力入口开放。

### 5.2 核心菜单 seeds（Core Seeds）

实现位置：

- `apps/api/modules/system/admin/menus/bootstrap.py`
- `apps/api/modules/system/admin/menus/seeds.py`

关键策略（重要）：

- core seeds 使用 `update_existing=True`（保证旧库也能同步 permission_code 与 i18n key）
- `restore_deleted=True`（恢复被软删除的 core 菜单，避免版本升级丢菜单）

### 5.3 插件菜单 seeds（Plugin Seeds）

实现位置：`apps/api/core/registry.py`（startup 期间 best-effort 执行）

- 从插件 manifest 读取 `admin_menu` seeds
- 落库时写入 `meta.plugin_id`，用于所有权与后续过滤

默认挂载策略：

- 若插件 seed 未显式指定 parent 且不是 core，则默认挂在 `plugins` 根节点下（约定优先）。

### 5.4 工作区插件启用门禁：菜单与扩展点过滤

目标：插件即使“全局安装并启动”，也必须在 workspace 启用后才能影响该 workspace 的 Admin UI。

实现点：

- 菜单过滤：`apps/api/modules/system/admin/menus/service.py`
- Admin UI 扩展过滤：`apps/api/modules/system/admin/extensions/service.py`
- 插件路由 gate：`apps/api/plugin/deps.py:require_plugin_enabled()`

fail-closed 策略：

- 当 `workspace_plugins` 表不存在或查询异常时，默认视为“未启用”，阻止插件菜单/扩展/路由（安全优先）。

### 5.5 前端动态渲染

实现位置：`apps/web/admin/src/layouts/admin-layout.tsx`

- workspace scope 路由下，优先请求 `/menus/me` 生成 sider 菜单
- 若接口不可用/失败，退回静态常量 `ADMIN_NAV_ITEMS`（用于极端降级）

---

## 6. 刷新后缺菜单/权限不全：根因与修复

### 6.1 根因概述

现象：

- 初次启动/进入工作区菜单正常；
- 刷新后进入菜单变英文、缺少部分菜单项；
- 接口可能仍返回正确，但 UI 权限/语言状态不一致。

常见根因组合：

1) 创建者 membership 在某些路径下未及时绑定 `owner` 角色，导致 RBAC snapshot 缺权限。
2) Core 菜单 seeds 在旧库未更新 permission_code，导致 `/menus/me` RBAC 过滤行为与预期不一致。
3) 前端语言初始化优先级不稳定，刷新时短暂落回浏览器语言/默认英语。

### 6.2 后端修复：creator-admin 幂等绑定 owner

实现位置：`apps/api/modules/workspaces/deps.py`

- 当走 creator-admin 自动创建 `WorkspaceMembership` 的路径时，立即幂等绑定系统角色 `owner`。

### 6.3 前端修复：语言优先级链路

目标优先级：

1) Admin 本地语言 preference（用户显式选择）
2) 工作区本地化配置的默认语言（workspace default）
3) 服务端/系统 fallback（`zh-CN` / `en-US`，以及浏览器语言兜底）

实现位置（核心）：

- `apps/web/admin/src/stores/use-preference-store.ts`
- `apps/web/admin/src/layouts/admin-layout.tsx`
- `apps/web/admin/src/constants/storage.ts`

策略：

- 总是缓存 workspace default locale（按 workspaceId 存）
- 当用户没有显式 preference 时，刷新优先使用该缓存恢复语言，避免闪回英文

---

## 7. “角色可见菜单范围”配置（不做菜单 CRUD）

### 7.1 目标

- 不让 Admin 提供“菜单结构编辑（CRUD）”，但允许管理员控制“某个自定义角色能看到哪些菜单/页面”。
- 通过配置权限集合达成菜单可见范围控制。

### 7.2 后端接口

- `GET /workspaces/{workspace_id}/menus/catalog`（菜单目录树，包含节点 `permission_code`）
- `PUT /workspaces/{workspace_id}/rbac/roles/{role_code}/permissions`
  - 行为：替换某个**自定义角色**的权限集合（系统角色不可编辑）

### 7.3 前端入口

实现位置：

- `apps/web/admin/src/pages/team/roles/page.tsx`
- 入口按钮：“菜单范围”（Dialog）

保存策略（重要）：

- 仅替换“菜单目录引用到的权限子集”，保留角色已有的其他权限，避免误伤。

---

## 8. 工作区级插件中心（Plugin Center）

### 8.1 后端模块与路由

模块：`apps/api/modules/workspaces/plugins_center/`

路由前缀：`/workspaces/{workspace_id}/plugins-center`

关键接口（简表）：

- `GET /workspaces/{workspace_id}/plugins-center`
  - 权限：`system:plugins:read`
  - 返回：`WorkspacePluginListOut`
- `POST /workspaces/{workspace_id}/plugins-center/install`
  - 权限：`system:plugins:manage`
  - 参数：上传 zip（`file`），可选 `checksum`，可选 `enable_in_workspace`
  - 返回：`WorkspacePluginInstallResult`（包含 `requires_restart`）
- `POST /workspaces/{workspace_id}/plugins-center/{plugin_ref}/enable|disable`
  - 权限：`system:plugins:manage`
- `POST /workspaces/{workspace_id}/plugins-center/{plugin_ref}/uninstall`
  - 权限：`system:plugins:manage`
  - 语义：从工作区卸载（detach workspace state），不一定全局删除插件包
- `POST /workspaces/{workspace_id}/plugins-center/{plugin_ref}/reset`
  - 权限：`system:plugins:manage`
  - 语义：重置工作区级配置
- `PUT /workspaces/{workspace_id}/plugins-center/{plugin_ref}/config`
  - 权限：`system:plugins:manage`
  - 语义：更新工作区级配置（前端 UI 可后续补齐）

### 8.2 数据模型与迁移

表：`workspace_plugins`

- 模型：`apps/api/modules/workspaces/plugins_center/models.py`
- 迁移文件：`apps/api/migrations/models/9_20260205012745_update.py`

强提醒：

- 若未执行 `db:upgrade`，工作区启停表不存在，会导致插件 UI/菜单/扩展点被 fail-closed（表现为“插件怎么也启用不了/菜单不出现”）。

### 8.3 前端插件管理页

实现位置：

- 页面：`apps/web/admin/src/pages/plugins/installed/page.tsx`
- API 封装：`apps/web/admin/src/api/workspace-plugins.ts`
- 路由：
  - `/w/$workspaceId/plugins/installed`
  - `/plugins/installed`（无 workspace 时重定向/空态）

功能点：

- 安装（上传 zip）+ “安装后立即在当前工作区启用”
- 列表卡片：icon、标题、描述、版本、全局状态、workspace enabled 状态
- enable/disable 开关
- 更多操作：重置、从工作区卸载
- 预留扩展插槽：
  - `AdminExtensionsSlot(slot="admin.plugins.center.cards")`

---

## 9. Portal 扩展（MVP：SSR head 注入）

### 9.1 后端接口（public boundary）

- `GET /sites/{site_id}/extensions/portal`
  - query：`mode=public|preview`，`token`（preview 需要）
  - public 模式：默认只返回 permission_code 为空的扩展（避免把管理能力暴露给公网）

实现位置：

- `apps/api/modules/sites/portal_extensions/router.py`
- `apps/api/modules/sites/portal_extensions/service.py`

### 9.2 Portal SSR 注入

实现位置：

- `apps/web/portal/renderer/+onRenderHtml.tsx`

注入策略（安全优先）：

- URL 仅允许：
  - 相对路径 `/...`（推荐用于后端 `/assets/...`）
  - `http://`、`https://`
- `style` 文本防止 `</style>` 注入（替换为转义形式）

---

## 10. arq：插件 jobs/cron 扩展能力

入口：`apps/api/infra/jobs/worker.py`

设计要点：

- worker 在启动时会 discover plugins，并尝试加载插件实例（不要求 DB 在 import-time 可用）
- 每个插件可声明：
  - `arq_functions()`：返回 async job functions
  - `arq_cron_jobs()`：返回 `CronJob` 列表
- 运行时 gate：
  - job wrapper 会检查 `PluginRecord.status` 是否 disabled，禁用则跳过执行

注意：

- 当前 gate 为“全局插件状态”，非工作区维度；若需要 workspace 维度，需要将 workspace 作为 ctx 或拆分队列。

---

## 11. 配置项速查表

### 11.1 插件系统（PLUGIN__）

| 配置 | 默认值 | 说明 |
|---|---:|---|
| `PLUGIN__ENABLED` | `true` | 是否启用插件系统 |
| `PLUGIN__ROOT_DIR` | `./plugins` | 插件目录 |
| `PLUGIN__AUTO_MIGRATE` | `true` | 插件启用时自动迁移（谨慎） |
| `PLUGIN__AUTO_RESTART` | `true` | 插件启用/升级后可能触发重启 |
| `PLUGIN__WATCH_ENABLED` | `false` | 开发期 watchfiles 总开关 |
| `PLUGIN__WATCH_DEBOUNCE_MS` | `300` | watch 事件防抖 |
| `PLUGIN__WATCH_LOCALES` | `true` | watch locales 并清 i18n cache |
| `PLUGIN__WATCH_PLUGINS` | `true` | watch plugins 并请求重启 |

### 11.2 日志（LOGGING__）

| 配置 | 默认值 | 说明 |
|---|---:|---|
| `LOGGING__WATCHFILES_LEVEL` | `INFO` | 仅调高 `watchfiles.*` 的日志级别，避免 WSL/Docker 下 debug 刷屏 |

---

## 12. 迁移与部署步骤（建议）

### 12.1 本地开发（推荐路径）

1) 生成迁移（在线 DB 模式）：

```bash
pnpm -C apps/api db:migrate
```

2) 应用迁移：

```bash
pnpm -C apps/api db:upgrade
```

3) 启动 API / Admin / Worker（按你们 monorepo 的脚本）：

```bash
pnpm dev
```

> 注意：仓库根目录的 `pnpm api:migrate` 可能会触发 turbo 的 UI 限制；更稳定的做法是直接在 `apps/api` 目录脚本下执行（`pnpm -C apps/api ...`）。

### 12.2 无法连接 DB 的离线迁移（仅用于特殊环境）

```bash
UV_CACHE_DIR=../../.uv-cache PYTHONPATH=../.. uv run aerich migrate --offline
```

> 该方式用于“生成迁移文件”，并不等价于已应用迁移；仍需在线 DB 环境下 `db:upgrade` 生效。

---

## 13. 验收清单（手动）

### 13.1 菜单与权限

1) 用初始账号（创建者）进入某个 workspace：应拥有 owner 权限与完整菜单。
2) 刷新页面：菜单不应缺项；语言不应闪回英文（无显式 preference 的情况下，应遵循 workspace default）。
3) 角色页面（Team -> Roles）：打开“菜单范围”对话框可正常加载目录树。
4) 对某自定义角色保存菜单范围后，该角色下菜单可见性随权限变化。

### 13.2 插件中心

5) 插件中心页面能列出插件 + 显示全局 status 与 workspace enabled 状态。
6) 上传 zip 安装成功后：
   - 若 `requires_restart=true`：页面出现重启提示；
   - 启用后插件菜单/扩展点在当前 workspace 生效。
7) disable 后插件菜单/扩展点应消失。
8) reset 后 workspace config 被重置（接口层面可验证）。
9) 从工作区卸载后，该 workspace 不再启用该插件（全局安装可保留）。

### 13.3 Portal 扩展

10) `GET /sites/{site_id}/extensions/portal?mode=public` 返回 items（若有声明且插件在 workspace 启用）。
11) Portal SSR 生成的 HTML `<head>` 中包含插件注入的 `<link>`/`<script>`/`<style>`。

---

## 14. 常见问题（FAQ）与排障

### Q1：为什么服务端一直输出 `rust notify timeout, continuing [watchfiles.main]`？

这是 watchfiles 在 WSL / Docker bind mount 下常见的 debug 噪音，通常不代表业务异常。
本次已提供 `LOGGING__WATCHFILES_LEVEL`，默认 `INFO` 会抑制该 debug 输出，同时不影响你们项目其他 logger。

### Q2：插件启用了但菜单/扩展点不出现？

优先检查：

1) 是否已执行 `pnpm -C apps/api db:upgrade`（`workspace_plugins` 表存在）。
2) 插件是否在当前 workspace 也启用（全局 started 不等于 workspace enabled）。
3) 若数据库迁移未应用，系统将 fail-closed：菜单/扩展/插件路由默认不可用（安全优先）。

### Q3：刷新后菜单变英文、缺少菜单项，但接口返回正确？

常见原因：

- 前端语言初始化没用上 workspace default cache（检查 preference/store 初始化链路）。
- creator-admin 未绑定 owner 角色导致 RBAC snapshot 不完整（检查 workspace membership role）。
- 旧库 core 菜单 permission_code 未同步（本次 core seeds 已改为 upsert，需确认启动时执行到了）。

---

## 15. 未来工作（可选）

1) 插件“按工作区配置生效”的 runtime 读取入口（例如 host.get_effective_config）。
2) Portal 扩展从 head 注入扩展到 runtime slot（按路由/按页面/按组件注入）。
3) 插件中心补齐 workspace config 的可视化编辑 UI（基于 config_schema 渲染表单）。
4) 若引入更多 hooks：建议将 hook 返回类型从 `Any` 收敛为轻量 Protocol（避免循环依赖）。
