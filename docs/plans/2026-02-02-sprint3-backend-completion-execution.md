# Sprint 3（后端）补全执行文档：页面模型最佳实践 + 主题契约 + 生产级稳定性（不含 Admin 可视化编辑）
日期：2026-02-02

> 目标：在不引入 OT/CRDT、不建设复杂 Admin 可视化编辑 UI 的前提下，把 CelestialCMS 的 **服务端能力**补齐到“可交付产品”的标准，并为后续的现代化 WYSIWYG 与主题生态打牢契约与数据模型基础。

---

## 0. 范围与约束（必须明确）

### 0.1 本阶段范围（In Scope）

- **完整 IA（信息架构）后端能力**：Page Tree、EntryType、Entry、RouteTemplate 的完整 CRUD + 严格约束。
- **页面模型最佳实践**：将页面拆分为 Structure / Content / Metadata / Style，并以 **Revision 为事实来源**实现回滚一致性。
- **动态路由与 SSR 上下文**：RouteTemplate 支持 `:param`，并将 params 注入 Portal SSR ViewerContext。
- **主题包机制（后端契约面）**：Theme Manifest、主题变量（Scoped Config）、Page Variants 的协议与存储落地。
- **生产级稳定性（后端侧）**：缓存策略（含 SWR）、Valkey 韧性、观测与安全边界、SaaS/自托管兼容的 Host-aware 架构。

### 0.2 本阶段非目标（Out of Scope）

- 不做复杂 Admin 可视化编辑 UI（拖拽、属性面板、复杂表单生成等）——放到后续阶段。
- 不做 OT/CRDT / 结构 ops 强协作（保留扩展点与开关）。
- 不做 feed.xml（保持 sitemap v1 最小可用即可）。
- 不做 OAuth/SSO/MFA（但需要预埋权限位与安全边界）。

---

## 1. 当前状态（基线事实，用于差距评估）

### 1.1 已具备的核心闭环能力（已验收）

- DB 模型（Tortoise + Aerich）已落地：Site/Page/PageRevision/EntryType/Entry/EntryRevision/RouteTemplate。
- 站点解析与渲染闭环：
  - `GET /api/v1/sites/resolve?host=...`
  - `GET /api/v1/sites/{siteId}/runtime?mode=public|preview&token?`（DB-backed：`site.runtime`）
  - `GET /api/v1/sites/{siteId}/routes/resolve?path=...&mode=...&token?`（静态 page 优先；模板匹配；支持 redirect stub）
- Draft/Publish（Revision 指针 + 乐观锁）：
  - page draft/publish、entry draft/publish 已可用（409 optimistic lock）。
- Presence v1（Valkey TTL）：heartbeat/list 已验证。
- sitemap v1：`GET /api/v1/sites/{siteId}/sitemap.xml` 已验证。
- Portal editor-host / editor-mode 已跑通基础通信与保存链路，但 expectedRevision 初始化仍待对齐后端 resolver revision pointers（避免刷新/换 tab 后首次保存 409）。

### 1.3 状态更新（滚动，按日期追加）

- 2026-02-02：已补齐 Page Tree v1（后端）：
  - `GET /api/v1/sites/{siteId}/pages`：以 tree 形态返回（PageData 包装，v1 不做分页）
  - `POST /api/v1/sites/{siteId}/pages`：创建页面
  - `PATCH /api/v1/sites/{siteId}/pages/{pageId}`：更新页面（支持 parent/sort/path/visibility）
  - `POST /api/v1/sites/{siteId}/pages/{pageId}/move`：移动/重排页面
  - `DELETE /api/v1/sites/{siteId}/pages/{pageId}`：删除页面（v1 禁止删除含子节点的页面，返回 409）
  - 单元测试：`apps/api/tests/test_sites_pages_tree_unit.py`

- 2026-02-02：已补齐 RouteTemplate CRUD v1（后端，管理端点，preview token required）：
  - `GET /api/v1/sites/{siteId}/route-templates`：列表（分页 PageData）
  - `POST /api/v1/sites/{siteId}/route-templates`：创建（校验 pattern 仅支持单段 `:param`）
  - `PATCH /api/v1/sites/{siteId}/route-templates/{templateId}`：更新
  - `DELETE /api/v1/sites/{siteId}/route-templates/{templateId}`：删除
  - resolver cache：写操作后显式 invalidate（避免仅依赖短 TTL）

- 2026-02-02：已补齐 EntryType / Entry CRUD v1（后端，管理端点，preview token required）：
  - EntryType：
    - `GET /api/v1/sites/{siteId}/entry-types`：列表（分页 PageData）
    - `POST /api/v1/sites/{siteId}/entry-types`：创建（严格校验 `code` 仅允许 `[A-Za-z_][A-Za-z0-9_]*`）
    - `PATCH /api/v1/sites/{siteId}/entry-types/{entryTypeId}`：更新（name/fields_schema）
    - `DELETE /api/v1/sites/{siteId}/entry-types/{entryTypeId}`：删除（若被 entries 引用则 409）
  - Entry：
    - `GET /api/v1/sites/{siteId}/entries?entryTypeCode=...`：列表（分页 PageData）
    - `POST /api/v1/sites/{siteId}/entries`：创建
    - `PATCH /api/v1/sites/{siteId}/entries/{entryId}`：更新（slug）
    - `POST /api/v1/sites/{siteId}/entries/unpublish`：下线（published -> draft-only）
    - `DELETE /api/v1/sites/{siteId}/entries/{entryId}`：删除（必须先 unpublish，否则 409）
  - 单元测试：`apps/api/tests/test_sites_entry_type_code_unit.py`
  - 集成测试（需 `RUN_INTEGRATION_TESTS=1`）：`apps/api/tests/test_sites_entries_integration.py`

- 2026-02-02：已为低频 public 读取接口补齐基础缓存头（Cache-Control）：
  - `GET /api/v1/sites/resolve`：`public, max-age=300, stale-while-revalidate=600`
  - `GET /api/v1/sites/{siteId}/runtime`：public 模式 `public, max-age=300, stale-while-revalidate=3600`；preview 模式 `no-store`
  - `GET /api/v1/sites/{siteId}/routes/resolve`：public 模式 `public, max-age=60, stale-while-revalidate=300`；preview 模式 `no-store`

- 2026-02-02：已补齐 Rollback v1（Revision 指针回滚，preview token required）：
  - `POST /api/v1/sites/{siteId}/pages/{pageId}/revisions/rollback`：回滚 page 的 draft/published 指针到指定 revision
  - `POST /api/v1/sites/{siteId}/entries/{entryId}/revisions/rollback`：回滚 entry 的 draft/published 指针到指定 revision
  - 最小审计：通过结构化日志记录 rollback 行为（完整操作日志表后置到“操作记录日志”里程碑）
  - 集成测试（需 `RUN_INTEGRATION_TESTS=1`）：`apps/api/tests/test_sites_rollbacks_integration.py`

- 2026-02-03：开始推进 M2（Revision 分层落库）：
  - revision 表字段扩展（nullable，向后兼容）：
    - `site_page_revisions`：新增 `meta/style_overrides/variant_id/deps`
    - `entry_revisions`：新增 `meta/style_overrides/variant_id/deps`
  - draft 保存输入扩展（向后兼容）：
    - `POST /api/v1/sites/{siteId}/routes/draft`
    - `POST /api/v1/sites/{siteId}/entries/draft`
  - revision snapshot 输出扩展（向后兼容）：
    - `GET /api/v1/sites/{siteId}/pages/{pageId}/revisions/draft|published`
    - `GET /api/v1/sites/{siteId}/entries/{entryId}/revisions/draft|published`
  - deps v0 校验（assets only）：
    - publish/rollback 指针切换前校验 `deps.assetIds`，缺失返回 409 `REVISION_DEPS_MISSING`，meta 带 `missingAssets`
  - 迁移文件（Aerich）：
    - `apps/api/migrations/models/2_20260203070558_plugin_plugin_admin_dynamic_menu.py`
    - `apps/api/migrations/models/3_20260203070605_plugin_plugin_admin_dynamic_menu.py`
  - 集成测试（需 `RUN_INTEGRATION_TESTS=1`）：
    - `apps/api/tests/test_sites_revision_deps_integration.py`

### 1.2 当前差距（后端视角）

- IA 管理面（API）不完整：缺少 Page Tree / EntryType / Entry / RouteTemplate 的全套 CRUD 与约束校验。
- 页面模型分层不完整：PageRevision/EntryRevision 仅存 `document`（或 `data/document`），缺少独立的 metadata/style/deps/variant 等字段。
- RouteTemplate resolver 虽可用，但缺少：
  - 规则系统化（冲突优先级、更具体优先等）
  - 缓存与失效的工程化（不能只依赖短 TTL）
- 主题契约缺失：Theme Manifest、主题变量/配置的后端存储与 runtime 输出规范未完成。
- 生产级能力缺口：SWR 缓存、回滚一致性校验、观测/审计、Valkey 降级策略、多租户隔离与 feature toggles。

---

## 2. 页面模型最佳实践（核心设计）

### 2.1 设计目标

把“页面只是 blocks JSON”的做法升级为“四层分离”，并让 **Revision 成为单一事实来源**：

- **Structure**：页面树/slug/path/visibility/sort_order（可变、需要强约束）
- **Content**：blocks（严格 schema）
- **Metadata**：SEO/i18n（结构化，字段级 i18n map）
- **Style**：页面级主题覆盖（不侵入渲染内核）

### 2.2 数据模型（建议增量升级）

以现有 Tortoise 模型为基础（`apps/api/models/site_page.py`、`apps/api/models/site_entry.py`），建议对 revision 表补齐字段：

#### 2.2.1 `site_page_revisions`（PageRevision）

- `document`（已存在）：DocumentIR（blocks）
- `meta`（新增，JSON，nullable）：SEO + i18n 元信息（建议结构化）
- `style_overrides`（新增，JSON，nullable）：页面级样式覆盖（仅声明式字段）
- `variant_id`（新增，string，nullable）：页面变体 id（由主题 manifest 定义）
- `deps`（新增，JSON，nullable）：依赖声明（assets/plugins/settings snapshot）

#### 2.2.2 `entry_revisions`（EntryRevision）

- `data`（已存在）：结构化字段（来自 EntryType）
- `document`（已存在/nullable）：若允许 entry 也用 blocks
- `meta`（新增，JSON，nullable）
- `style_overrides`（新增，JSON，nullable）
- `variant_id`（新增，string，nullable）
- `deps`（新增，JSON，nullable）

### 2.3 回滚策略（Revision Archive）

#### 2.3.1 回滚语义（v1）

- rollback 的最小可用行为：将 `draft_rev`（或 `published_rev`）指向目标 revision。
- rollback 必须产出审计日志（action、operator、from_rev、to_rev、site_id/page_id）。

#### 2.3.2 依赖一致性（deps）

为避免“回滚后引用的资源/插件状态不一致”，在 v1 即引入 deps（最小实现）：

- 资产引用：被 document/meta/style 引用的 assets 列表（asset_id or url ref）。
- 插件状态：启用插件 id + version（若插件系统已存在则写入；否则留空）。
- settings snapshot：关键 namespace 的 hash 或 version（例如 `theme.active/theme.vars/theme.config`）。

rollback/publish 时：

- 若 deps 校验失败（例如 asset 已删除），返回 409，meta 中给出缺失列表，避免 silent broken pages。

---

## 3. RouteTemplate Resolver（动态路由）工程化补全

### 3.1 解析规则（必须固定，避免歧义）

按计划文档 4.1.1 的要求，强制以下优先级：

1) 静态 Page 精确命中优先（`SitePage.path == requestPath`）。
2) 再匹配 RouteTemplate（仅支持单段 `:param`，v1 禁止 splat/可选段）。
3) RouteTemplate 命中后按 `entry_type_id + slug`（或其他 param）定位 Entry。
4) 根据 mode 选择 draft/published revision，并将 `params` 注入 ViewerContext。

### 3.2 缓存与失效（v1 必须做工程化）

#### 3.2.1 缓存对象

- RouteTemplate matcher（预编译后的段匹配器/regex）
- 站点路由解析辅助索引（page path、entry slug 等热点索引）

#### 3.2.2 失效触发点

- page path 变更 / page publish
- routeTemplate 变更（create/update/delete/enable/disable）
- entry slug 变更 / entry publish

建议实现为：

- 内存缓存 + 版本号（site-scoped version）
- 版本号存储于 DB 或 Valkey（SaaS 多实例一致性）
- API 写操作成功后 bump version

---

## 4. API（后端）需求功能清单（v1 完整度）

> 说明：以下以 REST 为主，保持 service/repository/schema 分层；所有 I/O 使用 async/await；返回统一 ResponseModel；列表返回 PageData。

### 4.1 Site / Runtime / Resolve（已存在，需补齐缓存策略）

- `GET /sites/resolve?host=...`（public）
- `GET /sites/{site_id}/runtime?mode=public|preview&token?`（preview 需 token）
- `GET /sites/{site_id}/routes/resolve?path=...&mode=...&token?`（preview 需 token）

补齐：

- public mode 输出 `cache-control`（含 `stale-while-revalidate`，见第 6 章）

### 4.2 Page Tree（必须新增/补全）

- `GET /sites/{site_id}/pages`：返回树（支持 parentId/sortOrder/visibility/status）
- `POST /sites/{site_id}/pages`：创建页面（path/parentId/sortOrder/visibility）
- `PATCH /sites/{site_id}/pages/{page_id}`：更新基础属性（含 path 变更）
- `POST /sites/{site_id}/pages/{page_id}/move`：移动/重排（v1 建议单独端点）
- `DELETE /sites/{site_id}/pages/{page_id}`：删除（v1 建议禁止删除有 children 的页面，返回 409）

### 4.3 Page Revisions（draft/publish/rollback）

- `POST /sites/{site_id}/pages/{page_id}/revisions/draft`
  - 输入：`document` + `meta` + `styleOverrides` + `variantId` + `expectedRevision`
  - 输出：新 `revision` + pointers（draft/published）
- `POST /sites/{site_id}/pages/{page_id}/revisions/publish`
  - 输入：`revision`（可选，默认发布当前 draft）
- `POST /sites/{site_id}/pages/{page_id}/revisions/rollback`
  - 输入：`revision` + `target`（draft 或 published）

### 4.4 EntryType（内容模型）

- `GET /sites/{site_id}/entry-types`
- `POST /sites/{site_id}/entry-types`
- `PATCH /sites/{site_id}/entry-types/{entry_type_id}`
- `DELETE /sites/{site_id}/entry-types/{entry_type_id}`（需校验是否被 entries 引用）

### 4.5 Entry（内容实例）+ Revisions

- `GET /sites/{site_id}/entries`（支持按 entryType/slug 搜索）
- `POST /sites/{site_id}/entries`（创建 entry）
- `PATCH /sites/{site_id}/entries/{entry_id}`（修改 slug 等，触发 resolver 失效）
- `DELETE /sites/{site_id}/entries/{entry_id}`
- `POST /sites/{site_id}/entries/draft`（已存在，需扩展支持 meta/style/variant/deps）
- `POST /sites/{site_id}/entries/publish`（已存在）
- `POST /sites/{site_id}/entries/rollback`（新增，与 page rollback 对齐）

### 4.6 RouteTemplate CRUD

- `GET /sites/{site_id}/route-templates`
- `POST /sites/{site_id}/route-templates`
- `PATCH /sites/{site_id}/route-templates/{template_id}`（path_pattern/entry_type/template_page_revision/is_active）
- `DELETE /sites/{site_id}/route-templates/{template_id}`

### 4.7 SiteSettings（namespace-scoped，已存在，需扩展主题契约）

- `GET /sites/{site_id}/settings?namespace=...`（preview 需 token）
- `PUT /sites/{site_id}/settings?namespace=...`（preview 需 token）

约定新增 namespace：

- `theme.active`
- `theme.vars`
- `theme.config`
- `layout.header`、`layout.footer`（hybrid 导航/页脚，后置到 P2/P3 也可）

---

## 5. 主题包机制（后端契约面）

### 5.1 Goals (Theme Contract v0)

Theme must be a **portable, distributable artifact** (import/export/download) that can be installed per workspace.

Sprint 3 scope (v0):

- Theme Package **MUST be a zip** that contains metadata + static resources only.
- Theme Package v0 **MUST NOT contain executable code** (`.js/.ts/.mjs/.cjs/.wasm` are forbidden).
- `themeId` adopts **npm-like naming** (e.g. `@celestial/theme-modern` or `celestial-theme-modern`).
- `variants/*.json` reuses the **PageRevision subset** (document + meta + style_overrides + deps), to keep one source of truth for validation and editor/runtime flows.

Non-goals (explicitly out of Sprint 3):

- No “theme runtime code” / React components shipped in theme packages.
- No complex Admin UI; only API contract and minimal persistence.

Minimum APIs (workspace-scoped governance):

- `GET /api/v1/workspaces/{workspaceId}/themes` (list installed packages)
- `POST /api/v1/workspaces/{workspaceId}/themes/import` (import from an uploaded zip asset)
- `GET /api/v1/workspaces/{workspaceId}/themes/{themeId}/{version}` (detail)
- `DELETE /api/v1/workspaces/{workspaceId}/themes/{themeId}/{version}` (uninstall; must not be in use)
- `GET /api/v1/workspaces/{workspaceId}/themes/{themeId}/{version}/download` (admin-only artifact download)

### 5.2 Terminology (must not be mixed)

- Theme Package (artifact): an immutable zip file developers can distribute.
- Theme Config (site-scoped): end-user values configured per site (form-driven, mutable).
- Global Styles:
  - Kernel global styles: portal/core baseline (stability).
  - Theme global styles: theme tokens/base CSS (appearance).
- Style Overrides: page/block-level exceptions, versioned with revisions.

### 5.3 Layering / Precedence (low -> high)

1) Kernel base CSS (Portal/core)
2) Theme package `tokens.css` / `base.css` (theme global styles)
3) Site theme vars (from `theme.vars`) -> injected as CSS variables
4) PageRevision `style_overrides` -> injected as CSS variables
5) Block-level overrides (future)

Rule of thumb: **theme defines defaults; content defines exceptions**.

### 5.4 Theme Package format (zip) and `manifest.json`

Theme package structure (recommended):

- `manifest.json` (required)
- `styles/tokens.css` (required) - CSS variables (theme tokens)
- `styles/base.css` (optional) - minimal global CSS, keep conservative
- `preview.png` (optional)
- `presets/*.json` (optional) - predefined config bundles
- `variants/*.json` (optional) - default page templates using PageRevision subset
- `assets/**` (optional) - static resources (images/fonts, etc.)
- `locales/*.json` (optional, future)

`manifest.json` must declare:

- `themeId` (npm-like)
- `version` (semver)
- `entrypoints.tokensCss` (path)
- optional `entrypoints.baseCss`, `entrypoints.previewImage`
- optional `configSchema` (typed site config requirements)
- optional `presets[]` (id/name/path)
- optional `variants[]` (variantId/name/path)
- optional `compat` (`cmsMin`, etc.)

Security requirements for import:

- Forbid executable extensions: `.js`, `.ts`, `.mjs`, `.cjs`, `.wasm`.
- Forbid absolute paths and path traversal in zip entries.
- Forbid external CSS `@import` is recommended (v0 may implement as a validator or post-import linter).

### 5.5 Site binding via SiteSettings (namespaces)

We bind theme to a site via `SettingRecord` (scope=site):

- `theme.active`
  - `{ "themeId": "...", "version": "...", "presetId"?: "..." }`
- `theme.vars`
  - `{ "cssVars": { "--color-primary": "#1677ff", ... } }`
- `theme.config`
  - `{ ... }` (freeform JSON that should conform to the theme manifest schema; validation can be phased in)

Note: `site.runtime` (existing) is a separate namespace for runtime bootstrap tokens/fonts. During v0 migration we keep it
backward-compatible, but runtime response should be able to emit theme package information based on the above namespaces.

### 5.6 Runtime output contract (public/preview)

`GET /sites/{siteId}/runtime` must be able to include (backward-compatible):

- `theme.cssVars` (existing, derived from defaults + `theme.vars.cssVars`)
- `theme.themeId`, `theme.version` (from `theme.active`)
- `theme.tokensCssUrl` (derived from the installed ThemePackageRecord entrypoint)
- `theme.baseCssUrl` (optional)
- `theme.config` (optional; avoid leaking sensitive values to public mode if required by product policy)

### 5.7 Page Variants and revisions

- `SitePageRevision.variant_id` refers to a theme manifest `variants[].variantId`.
- Variant JSON (`variants/*.json`) uses the PageRevision subset:
  - `{ "document": { "version": 1, "meta"?: ..., "blocks": [...] }, "meta"?: {...}, "style_overrides"?: {...}, "deps"?: {...}, "variant_id"?: "..." }`
- Resolver injects `variant_id` into ViewerContext (renderer can switch layouts/variants deterministically).

---

## 6. 生产级稳定性（后端侧）

### 6.1 缓存策略（边缘友好 + SWR）

最低要求：

- public mode：
  - `routes/resolve`、`runtime` 返回 `cache-control`，推荐形态：
    - `public, max-age=60, stale-while-revalidate=300`
- preview/editor mode：
  - 禁止缓存或短缓存（避免草稿泄露）：`private, no-store`

### 6.2 Valkey 韧性与降级

- presence 是非关键路径：
  - Valkey 不可用 → heartbeat/list 返回可解释的降级输出（或空列表），不影响页面 resolve/save/publish
- preview token：
  - v1 使用 Valkey TTL，但必须有明确的错误码；Portal 不支持无后端/无 Valkey 的 fallback（避免产生错误的运行假设）

### 6.3 观测与审计（最小可用）

- 结构化日志（英文 message）必须覆盖：
  - publish/rollback/save（含 site_id/page_id/entry_id/revision/user_id/request_id）
- 失败场景要可追踪：
  - 409 冲突 meta（expectedRevision/currentRevision）
  - deps 校验失败 meta（missingAssets 等）

---

## 7. SaaS / 自托管兼容（后端原则）

### 7.1 Host-aware：host -> siteId

- `sites/resolve` 是 SaaS 基础能力
- 要求：
  - 端口剥离/标准化 host
  - 支持多域名（SiteDomain 或 equivalent）
  - 缓存：host->siteId 的短缓存 + 失效策略

### 7.2 存储驱动抽象

本阶段至少要避免“把存储类型写死在业务逻辑里”：

- DB：PostgreSQL/SQLite（自托管）差异隐藏在 repo 层
- Object storage：本地盘 / S3 compatible（后置，但要在接口层预留）

### 7.3 Feature Toggles（预埋）

- workspace plan / org config 的开关点（先做后端 enforce）：
  - `collab.presence_enabled`
  - `collab.realtime_enabled`（v2）
  - `theme.advanced_enabled`
  - `animations.advanced_enabled`

---

## 8. 里程碑与交付物（执行顺序）

> 目标：先把后端做到“完整 + 可演进”，再进入 Admin 可视化编辑阶段。

### M1：IA 管理 API 完整化（P0）

- Page Tree CRUD
- EntryType/Entry CRUD
- RouteTemplate CRUD + 失效
- 最小集成测试（覆盖静态优先、动态命中、publish 生效）

### M2：Revision 分层落库（P1）

- PageRevision/EntryRevision 增加 meta/style/variant/deps
- draft/publish/rollback 支持新字段并保持向后兼容
- deps 校验的最小实现（资产缺失返回 409）

### M3：主题契约（P2）

- theme.active/theme.vars/theme.config namespaces 定义
- runtime 输出 theme 元信息
- variant 注入 ViewerContext（SSR 可验证）

### M4：生产级能力最小闭环（P3）

- cache-control（含 SWR）
- Valkey 降级策略
- publish/rollback 审计日志与错误码规范化

---

## 9. 验收清单（Definition of Done）

- API 层严格 schema：extra=forbid；输入/输出均为 Pydantic schema，不手写 dict
- optimistic lock：保存必须可稳定返回 409，并提供可恢复信息（meta）
- resolver 行为确定性：静态 page 优先；模板冲突更具体优先（需单测）
- 缓存策略可验证：public 有 SWR；preview/editor 不缓存
- presence 不影响主链路：Valkey 断开仍可 resolve/save/publish
- 关键路径测试：
  - Page：create -> draft -> publish -> public resolve -> sitemap
  - Entry：create -> draft -> publish -> public resolve -> sitemap
  - RouteTemplate：静态优先 + 动态命中 + 失效
