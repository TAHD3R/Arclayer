# Admin 页面管理与主题配置化（单 Workspace 单 Site）实施方案与落地记录

本文档用于沉淀 CelestialCMS 在 **2026-02-04** 阶段的 Admin 端页面管理能力设计与实现落地，覆盖：

- 单 Workspace 单 Site 的领域模型收敛与数据库约束
- Admin（Workspace RBAC）下的页面树管理、草稿保存、发布、回滚、下线（unpublish）
- Admin Host + Portal iFrame 的沉浸式 WYSIWYG 编辑器壳
- 主题包的“可配置化能力”（theme.config + configSchema）在系统中的位置与最小可用闭环
- 为后续“最小动态数据区块（entries_list）”预留的接口/数据形态（本期仅做基础设施）

设计补全与机制说明（更偏 RFC）：`docs/rfc/2026-02-04-admin-pages-management-and-theme-pack-v1.md`

> 注意：本仓库的后端 Schema 默认使用 Pydantic `alias_generator=to_camel`，因此 API 输出字段名为 camelCase。

---

## 1. 关键决策（Decision Log）

### 1.1 组织/工作区/站点关系

- 一个用户即一个组织（Organization）
- 一个组织下可以有多个工作区（Workspace）
- **每个工作区对应一个站点（Site），即 1 workspace -> 1 site**
- 因此 Admin 不需要 Site Switcher，所有站点能力按 workspaceId 入口组织即可

### 1.2 主题包模板数量

- 主题包代表“完整站点方案”，并非零散模板合集
- **只需要两套主题包**（例如 Blog / Corporate）即可满足 MVP
- 单个主题包内部可以包含多个 page templates/blocks，但“主题包数量”不追求多

### 1.3 主题包格式

- **仅保留 JSON manifest**（不引入 TOML，不做兼容层）

### 1.4 主题配置能力（必须）

- 主题包必须提供 `configSchema`
- 站点侧必须保留 `theme.config`（site-scoped）作为唯一配置来源（MVP）
- 配置例：首页某特定配置、新闻页展示条数、列表分页大小等

---

## 2. 数据库与后端约束（Single-site workspace）

### 2.1 ORM 模型变更

- `apps/api/modules/sites/models/site.py`：
  - `SiteRecord.Meta.unique_together` 调整为 `(("workspace_id",),)`，表达“每个 workspace 只能有一个 site”

### 2.2 数据库迁移

- 新增迁移：`apps/api/migrations/models/7_20260204130000_single_site_per_workspace.py`
  - upgrade：
    1) 删除 legacy 脏数据（同一 workspace 多个 site 时，保留最早 created_at 的一条，其余删除）
    2) drop 旧约束：`uid_sites_workspa_ed7f39`（workspace_id, slug）
    3) add 新约束：`uid_sites_workspa_single_3d5c2a`（workspace_id）
  - downgrade：
    - 恢复旧约束

> 说明：由于当前运行环境可能无法访问 DB（sandbox 限制 socket/asyncpg），该迁移文件的 `MODELS_STATE` 留空。
> 更新：已改为 **离线生成** `MODELS_STATE`（不连接 DB），避免 Aerich 因“旧格式迁移文件”而中断后续 `aerich migrate`。
> 若未来模型继续演进，可正常通过 Aerich 生成后续迁移并自动携带最新 state。

---

## 3. 后端 API（Workspace RBAC 入口）

目标：Admin 不通过 preview token 来做管理操作；preview token 仅用于 Portal editor/preview 运行模式。

### 3.1 Workspace -> Site 解析

新增模块：

- `apps/api/modules/workspaces/site/`
  - `router.py`
  - `service.py`
  - `repository.py`
  - `schema.py`

新增接口：

- `GET /api/v1/workspaces/{workspace_id}/site`
  - 返回 workspace 绑定的 site 元信息（并在缺失时自动创建默认 site）
  - Admin 前端用它来拿 `siteId`，用于拼 Portal editor URL

- `POST /api/v1/workspaces/{workspace_id}/site/preview-tokens`
  - Workspace RBAC 保护
  - 内部调用 `SiteService.create_preview_token(site_id=...)`
  - 用于 Portal editor/preview 模式的 token

### 3.2 Site settings（用于 theme.config / nav.header / nav.footer / seo.*）

新增接口（workspace RBAC 保护）：

- `GET /api/v1/workspaces/{workspace_id}/site/settings?namespace=...`
- `PUT /api/v1/workspaces/{workspace_id}/site/settings?namespace=...`

> 本期重点：`namespace=theme.config`（站点级主题配置）

### 3.3 Pages 管理（页面树 + 编辑器 revision）

新增接口（workspace RBAC 保护）：

- `GET /api/v1/workspaces/{workspace_id}/site/pages/tree`
- `GET /api/v1/workspaces/{workspace_id}/site/pages/{page_id}`
- `POST /api/v1/workspaces/{workspace_id}/site/pages`
- `PATCH /api/v1/workspaces/{workspace_id}/site/pages/{page_id}`
- `POST /api/v1/workspaces/{workspace_id}/site/pages/{page_id}/move`
- `DELETE /api/v1/workspaces/{workspace_id}/site/pages/{page_id}`

修订/补齐：页面下线（unpublish）

- `POST /api/v1/workspaces/{workspace_id}/site/pages/{page_id}/revisions/unpublish`
  - 语义：将 `published_rev` 置空（发布态不可见），保留草稿

revision 操作（workspace RBAC 保护）：

- `GET /.../pages/{page_id}/revisions/draft`
- `GET /.../pages/{page_id}/revisions/published`
- `POST /.../pages/{page_id}/revisions/draft`（保存草稿）
- `POST /.../pages/{page_id}/revisions/publish`
- `POST /.../pages/{page_id}/revisions/rollback`

---

## 4. Portal 编辑器（沉浸式 WYSIWYG）与 Admin Host 的边界

### 4.1 URL 结构

Portal editor URL：

- `/editor/site/:siteId/...` + `?token=...&parentOrigin=...`

Admin 端：

- workspace 入口：`/w/:workspaceId/...`
- 页面编辑器路由：`/w/:workspaceId/content/pages/:pageId/edit`

### 4.2 RPC 协议

沿用：

- `@celestial/site-editor-protocol`（HostEditorRpcApi / PortalEditorRpcApi）
- `@celestial/site-editor-bridge`（Penpal connector）

Host 负责：

- 接收 `requestSave({ siteId, pathname, document })`
- 将 document 保存到 workspace RBAC 的 page draft endpoint（带 expectedRevision 乐观锁）
- 提供 publish/unpublish 控制按钮

---

## 5. Admin 前端落地（MVP）

### 5.1 页面列表（页面树）

实现文件：

- `apps/web/admin/src/pages/content/pages/page.tsx`
- `apps/web/admin/src/routes/w/$workspaceId/content/pages/index.tsx`
- i18n：
  - `locales/zh-CN/content_pages.json`
  - `locales/en-US/content_pages.json`
  - `apps/web/admin/src/lib/i18n/resources.ts` 注册新 namespace：`content_pages`

功能：

- 拉取页面树：`GET /workspaces/{workspaceId}/site/pages/tree`
- 展平显示（含层级缩进）
- 新建页面（仅输入 path）：`POST /workspaces/{workspaceId}/site/pages`
- “Edit” 作为可视化编辑器入口：使用 `ExpandableScreen` 在列表页内直接展开沉浸式编辑器（无硬跳转）

### 5.2 页面编辑器壳（iframe + 保存/发布/下线）

实现文件：

- `apps/web/admin/src/pages/content/pages/editor.tsx`
- `apps/web/admin/src/routes/w/$workspaceId/content/pages/$pageId/edit.tsx`

功能：

- 获取 workspace 的 siteId：`GET /workspaces/{workspaceId}/site`
- 发放 preview token：`POST /workspaces/{workspaceId}/site/preview-tokens`
- 以 `buildEditorIframeHref` 拼出 Portal editor URL
- RPC 接收 `requestSave`，保存 page draft：`POST /workspaces/{workspaceId}/site/pages/{pageId}/revisions/draft`
- 发布：`POST /.../revisions/publish`
- 下线：`POST /.../revisions/unpublish`

---

## 6. 主题配置化（theme.config）的推荐约定（本期只做基础设施）

### 6.1 存储位置

- SiteSetting namespace：`theme.config`
- value 形态建议（示例）：

```json
{
  "version": 1,
  "themeId": "@celestial/theme-blog",
  "data": {
    "home": {
      "news": { "limit": 6 }
    }
  }
}
```

### 6.2 读取方式

Portal runtime 已包含 `theme.config`（通过 `SiteService.get_runtime` 返回 theme.config）。

### 6.3 Admin UI（下一步）

当前已提供最小可用入口（MVP）：

- Admin `/w/:workspaceId/appearance/themes`：提供 `theme.config` 的 JSON 编辑与保存（用于快速验证后端设置链路）

下一步建议（面向非技术用户的“可视化配置”）：

- Theme 包导入时将 manifest.configSchema 入库（现有 themes 模块已存 manifest）
- Admin `/appearance/themes`：
  - 读取当前 active theme
  - 用 configSchema 自动生成表单
  - 保存写入 `theme.config`

---

## 7. 后续迭代（不在本期实现范围）

1) entries_list 数据区块（最小动态）
2) Navigation/Footer 可视化编辑（写入 nav.header/nav.footer）
3) SEO 面板与 sitemap/robots 自定义策略
4) 主题包签名与受限代码（runtime/editor entrypoints）在 SaaS 模式下的安全策略（CSP/隔离域名）
