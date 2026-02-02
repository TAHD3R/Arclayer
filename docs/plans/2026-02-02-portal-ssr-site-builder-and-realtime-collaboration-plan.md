# 实施计划：Portal（Vite SSR + TanStack Router）+ 站点构建器（Page/Entry 真实视角）+ 实时协作（收费点）
日期：2026-02-02

> 本文是下一阶段“站点能力”核心功能的工程落地清单，目标是在不引入 Next.js/Astro 的前提下，基于 **Vite SSR + TanStack Router** 构建可维护、可扩展、可商业化的现代 CMS 站点系统。
>
> 现状前置：已完成工作区治理（Workspace Settings / Site Identity 基础占位 / Members & Invites / Roles & Permissions 矩阵）。Portal 端尚未启动（`apps/web/portal` 为空）。

---

## 0. 目标与验收口径（必须可验证）

### 0.1 核心产品目标

1) **Portal 真实渲染**：访问站点域名/路径可输出 SSR HTML，具备优秀 SEO 基础（可爬、可缓存、可注入 meta）。
2) **编辑体验一致性**：在 Admin 端编辑页面/文章时，呈现效果与直接访问 Portal 完全一致（同主题、同字体、同样式、同布局、同错误页）。
3) **完整 IA（信息架构）**：
   - 页面树（父子层级、排序、可见性、草稿/发布）
   - 动态路由模板（如 `/blog/:slug`）
   - 分类/标签（至少为文章/集合内容服务）
   - sitemap/feed 生成（先做到可生成数据与输出 endpoint）
4) **多人协作（收费点 v1）**：presence + 乐观锁（先把“可用性”做出来）
   - presence：在线用户、当前编辑者提示（“谁正在编辑”）
   - 乐观锁：基于 `rev/etag` 检测冲突，冲突返回 409，并提供“拉取最新/对比/覆盖”策略
   - v2 扩展（后置）：结构 ops 强协作（insert/delete/move）与 OT/CRDT（富文本/复杂字段）
5) **主题/模板/插件扩展基础打牢**（同仓构建）：
   - 主题：决定 Header/Footer/Block 渲染外观
   - 模板：一组页面/内容的 IR（可导入）
   - 插件：可注入 Admin 页面、可扩展前台 block/注入点（v1 先内建扩展点与协议）

### 0.2 v1 非目标（明确不做，避免失控）

- 不做运行时远程加载主题/插件 bundle（同仓构建为主）
- 不做复杂富文本多人强协作（Google Docs 级别 CRDT/OT）
- 不做完整发布/部署平台（CDN/多环境/流水线），但要做“内容发布状态机 + revision”
- 不做 OAuth/SSO/MFA（留扩展点与安全边界即可）

---

## 1. 关键设计决策（已确认）

1) Portal 技术栈：**Vite SSR + TanStack Router**
2) 页面编辑范式：**区块/Section 流式编辑**
3) Block props：**仅允许 schema 声明字段**（禁止任意 JSON）
4) 多语言：**字段级 i18n map**（LocalizedString/LocalizedValue），禁止“复制两份页面/组件”
5) 主题/插件前端代码：**同仓构建**（开发者本地全环境开发，打包分发）
6) 导航/页脚：**hybrid**（一键从页面树生成 → 手工编排/排序/插入外链；v1 不做拖拽层级，子菜单通过显式操作设置）
7) 字体：v1 **仅自托管/上传字体**（不依赖 Google Fonts）

---

## 2. 架构总览（推荐落地形态）

### 2.1 应用与包的边界

- `apps/web/portal`
  - 站点访问入口（SSR/CSR）
  - 预览入口（preview token）
  - 编辑器入口（editor mode，用于 Admin 内嵌）
- `apps/web/admin`
  - 工作区治理、成员/权限、站点管理入口
  - “站点编辑”页作为壳：内嵌 portal editor mode（iframe 或同源嵌入）
- `packages/site-renderer-core`（新增）
  - 唯一渲染内核：输入 `SiteRuntimeConfig + DocumentRevision(IR) + ViewerContext`，输出 React 树
  - Theme registry：根据主题选择具体渲染器集合
- `packages/site-block-registry`（新增）
  - Block 类型注册表：schema + 默认值 + 编辑器表单元数据（不含渲染实现）
- `packages/site-theme-default`（新增，第一方主题）
  - 提供 Header/Footer + 基础 blocks 外观（作为 v1 基准）

### 2.2 “编辑与访问一致”的实现策略（推荐）

为保证一致性与 CSS 隔离：

- Portal 提供 `editor mode` 路由（例如 `/__editor/site/:siteId/*`）
  - editor mode 使用与 public mode 完全相同的渲染流程
  - 仅额外叠加 overlay（选中框、拖拽把手、右侧属性面板容器挂点等）
- Admin 端通过 iframe 内嵌 editor mode
  - 优点：Portal 与 Editor 共享同一套 CSS/字体/主题，保证像素级一致
  - 可通过 postMessage/RPC 在 Admin 与 iframe 间同步状态（选中 block、保存、发布、预览、presence 等）
  - 推荐引入 **penpal**（或同类库）封装跨 iframe RPC：减少手写 postMessage 的协议/握手/反序列化样板代码，并统一做 origin 校验与版本升级

> 备选方案（不推荐 v1）：Admin 直接在同 DOM 内渲染 renderer core（容易被 Antd 全局样式污染，难以保证一致性）。

---

### 2.3 Admin ↔ Portal（iframe）通信协议（v1 必须先定）

目标：把“编辑器壳（Admin）”与“真实渲染视图（Portal editor mode）”解耦，避免两边状态互相耦合导致重构成本爆炸。

建议原则：

- **强类型 + 可版本化**：协议有 `version`，并且在 TS 侧定义 request/response union，避免隐式字符串协议。
- **最小消息集合**：v1 只覆盖“选中/高亮、脏数据预览、保存/发布触发、presence 展示”，不要把业务逻辑塞进消息。
- **安全边界**：固定允许的 `origin`；所有 RPC 入口都做鉴权与 permission check（Portal editor mode 侧仍是最终裁决者）。

推荐实现：

- 使用 **penpal**（或同类库）建立 parent/child 双向 RPC：
  - parent（Admin）暴露：`selectBlock(id) / pushDraftIR(ir) / requestSave() / requestPublish()`
  - child（Portal）暴露：`getViewportState() / setOverlayMode(mode) / reportPresence(presence)`
- “脏数据预览”必须做到 **毫秒级重绘**：
  - Admin 修改 IR → `pushDraftIR(ir)` → Portal 通过局部 store（如 Zustand）更新，不刷新 iframe。
  - 允许用 `key` 强制局部 subtree 重建，但禁止全页 reload（否则体验崩）。

## 3. 数据模型与 API 设计（后端，FastAPI）

> 说明：RBAC 当前是 workspace scope。站点/页面/文章范围控制采用“workspace permission + 资源级约束（service 层检查）”的组合，后续再演进到更细粒度 scope。

### 3.1 核心实体（建议）

#### Site（站点）

- `Site`
  - `id, workspace_id`
  - `primary_domain`（可选）
  - `status`（active/disabled）
  - `default_locale, fallback_locale`
  - `theme_id`（当前启用主题）
  - `created_by, created_at`

- `SiteDomain`（可选拆表）
  - `site_id, domain, is_primary, verified_at, redirect_to_primary`

#### Page（页面树）

- `SitePage`
  - `id, site_id`
  - `parent_id`（nullable）
  - `slug`（用于树结构标识）
  - `path`（最终访问路径，需保证唯一）
  - `order`
  - `visibility`（public/private）
  - `status`（draft/published）

- `SitePageRevision`
  - `page_id`
  - `rev`（递增）
  - `state`（draft/published）
  - `ir_json`（block IR 快照）
  - `seo_json`（可与 ir_json 分开，或放入 ir 的 meta 区）
  - `created_by, created_at`

#### 动态路由与文章（EntryType/Entry）

- `EntryType`
  - `id, site_id`
  - `code`（如 `blog_post`）
  - `fields_schema`（字段声明；同样只允许声明字段）

- `Entry`
  - `id, entry_type_id`
  - `slug`（用于路由参数）
  - `status`（draft/published）
  - `taxonomies`（categories/tags，建议规范化拆表）

- `EntryRevision`
  - `entry_id, rev, state, data_json, ir_json?`
  - 说明：文章可采用“主题提供的文章模板 + data_json 渲染”，也可允许文章有 blocks（建议 v1 即支持 blocks，满足真实视角编辑）

- `RouteTemplate`
  - `id, site_id`
  - `path_pattern`（如 `/blog/:slug`）
  - `entry_type_id`
  - `template_page_revision_id`（用于渲染该 entry 的页面骨架/布局块）

#### SiteSettings（按 namespace 拆分）

- `SiteSetting`
  - `site_id`
  - `namespace`（如 `layout.header`, `layout.footer`, `assets`, `seo`, `runtime`）
  - `payload_json`

> 强制：禁止把所有配置塞进一个巨型 JSON；按 namespace 拆分，利于插件扩展与差量更新。

### 3.2 关键 API（建议 v1）

#### Portal 消费（公开/预览）

- `GET /sites/resolve?host=...` → siteId + runtimeConfig key（可缓存）
- `GET /sites/{site_id}/runtime?mode=public|preview&token=?` → `SiteRuntimeConfig`（含导航/页脚/字体/CSS/注入点）
- `GET /sites/{site_id}/routes/resolve?path=/x&mode=...` → 返回 page 或 routeTemplate 命中结果
- `GET /sites/{site_id}/pages/{page_id}/revisions/{state}` → draft/published revision
- `GET /sites/{site_id}/entries/{entry_id}/revisions/{state}` → draft/published revision
- `GET /sites/{site_id}/sitemap.xml`、`GET /sites/{site_id}/feed.xml`（v1 可先返回最小可用格式）

#### Admin 管理（编辑/发布）

- Page 树管理：list/create/update/move/delete
- Page revision：save draft、publish、rollback
- EntryType 管理：create/update schema
- Entry 管理：list/create/update（draft/publish）
- RouteTemplate 管理：定义 path_pattern 与 entry_type 的绑定
- Layout 设置（导航/页脚）：读写 `layout.header/layout.footer` namespace

#### Preview token

- `POST /sites/{site_id}/preview-tokens` → 返回短期 token（绑定 user、site、可选 page/entry）
- `GET /preview/...` 在 portal SSR 校验 token 后允许读取 draft

### 3.3 Block Protocol（地基：必须先定义，再写 UI）

痛点回顾：过去“组件 JSON Schema + 多语言双份内容 + 组件库表格化管理”的方案会迅速失控。v1 必须把协议收敛到“可实现、可验证、可演进”的最小集合。

v1 的 Block Protocol 约束（必须）：

- **单一 IR**：页面/文章的结构使用统一 IR（block tree/slot），不要为 Page/Entry 再做两套。
- **props 严格声明**：block 的 `props` 只允许写入 schema 声明过的字段（前后端双重校验）。
- **字段级 i18n map**：任何需要多语言的字段采用 `LocalizedValue`/`LocalizedString`（map），不复制页面/组件。
- **后端 Pydantic v2 校验**：保存 draft 时强校验；发布时做更严格校验（如必填字段、seo 约束）。
- **前端 TS 类型对齐**：与 Pydantic schema 一致的 interface/type，避免“前端随便写 JSON”。

建议最小结构（示意）：

- `DocumentIR`
  - `meta`：seo、openGraph、layout overrides（少量）
  - `blocks`：block 列表/树
  - `slots`：可选（用于 header/footer、page body 等插槽）
- `BlockNode`
  - `type`（string，来自 registry）
  - `id`
  - `props`（严格 schema）
  - `children`（可选）

说明：v1 先把协议跑通（hardcode JSON → SSR 输出正确 HTML + CSS），再进入 Admin UI 构建，避免“UI 先行导致协议反复返工”。

---

## 4. Portal（Vite SSR + TanStack Router）落地要点

### 4.0 SSR 管道选型（强烈建议不要从零手写）

为了避免陷入“手写 renderToString/stream 管道 + asset manifest + preload + 多环境差异”的工程泥潭，建议：

- **优先选择 vike（原 vite-plugin-ssr）**：让其负责 SSR 入口、路由映射、assets 注入、生产构建形态等基础设施，我们只实现“路由解析 + 数据获取 + renderer core”。
- 备选参考：**TanStack Start** 的目录与渲染管线组织方式（即便不直接采用，也可作为架构范式参考）。

不推荐 v1 行为：完全从零手写 SSR 管线（除非团队对 Node/Stream/构建产物非常熟练，否则会显著拖慢 Sprint 1）。

### 4.1 路由匹配与渲染流程（SSR）

1) `host` → resolve site
2) `path` → resolve page 或 routeTemplate
3) `mode`：
   - public：读 published
   - preview：需 token，读 draft 或指定 revision
   - editor：需 admin 授权（workspace 权限 + site 权限）
4) 组装 `ViewerContext`（locale、features、permissions、mode）
5) 通过 `site-renderer-core` 渲染 React 树 → 输出 HTML（含 SEO meta）

#### 4.1.1 RouteTemplate（动态路由）Resolver：最复杂的后端查询逻辑（必须单独设计/测试）

`RouteTemplate` 看起来只是一个 `path_pattern`，但真正难点在于 **SSR 阶段必须在 1 次请求内正确判定“当前 URL 属于静态 Page 还是动态 Entry”**，并取到渲染所需数据。

建议的解析优先级（避免歧义）：

1) **静态 Page 优先**：先按 `SitePage.path == requestPath` 精确命中（public/preview/editor 读取不同 state）。
2) **再尝试 RouteTemplate**：对该 site 下所有 `RouteTemplate.path_pattern` 做预编译匹配（只允许 `:param` 形式的单段参数，v1 不支持 splat/可选段）。
3) **匹配成功后加载 Entry**：
   - 根据 `entry_type_id` + 参数（例如 `slug`）定位 Entry
   - 读取 entry 的 draft/published revision（受 mode 控制）
4) **组合渲染输入**：`template_page_revision`（布局骨架）+ `entry_revision`（文章内容/blocks/data）→ renderer core

性能与可维护性建议：

- **预编译与缓存**：RouteTemplate 在保存/发布后预编译为 regex（或段匹配器），并缓存到内存/Valkey（带版本号）。
- **索引设计**：`(site_id, path)` 对 `SitePage` 建唯一索引；`(entry_type_id, slug)` 对 `Entry` 建索引；避免全表扫描。
- **失效策略**：page path 变更 / routeTemplate 变更 / entry slug 变更 / publish 切换，都要触发 resolver cache 失效。

最低测试要求（建议在 Sprint 3 前完成）：

- 静态与动态冲突：`/blog/about` 同时可能匹配 `/blog/:slug`，必须命中静态 page。
- 多 routeTemplate 冲突：`/blog/:slug` vs `/blog/:year/:slug` 的优先级规则（建议“更具体优先”）。
- mode 行为：public 读 published，preview/editor 可读 draft；权限不足应 403。

### 4.2 错误处理（必须标准化）

- route-level：404/403/500 使用主题的 error page
- block-level：单 block 崩溃不拖垮全页（editor mode 显示诊断信息）

### 4.3 字体与样式注入（v1 自托管）

- runtimeConfig 提供 font-face 描述与 CSS variables
- SSR head 注入 `<style data-fonts>` 与 `<style data-custom-css>`
- editor mode 默认禁用第三方脚本注入（避免影响编辑器/协作）

---

## 5. 导航/页脚（hybrid）具体实现

### 5.1 HeaderSettings（layout.header namespace）

- `mode = hybrid`
- `items`：导航编排清单（pageRef/link），支持排序
- “一键生成”：Admin 端按钮，根据 pageTree 生成 items（深度默认 2）
- 不支持拖拽层级：v1 通过“设为子项/取消子项”按钮实现（产生结构 ops，协作更稳定）

### 5.2 Resolver 规则（摘要）

- public：只包含 published + public 的 pageRef
- editor/preview：可显示 draft，但必须标记（仅 editor 可见）
- pageRef 丢失：editor 显示占位错误；public 跳过

---

## 6. 协作与并发编辑（收费点 v1：先做“可用”，后做“强同步”）

核心观点：v1 不要一上来实现 OT/CRDT 或结构 ops 强协作，否则极易把 Sprint 3 拖死。先把 **Revision + 发布闭环 + 冲突检测 + Presence 提示** 做扎实，协作能力自然可渐进增强。

### 6.1 并发编辑的底线：乐观锁（rev/etag）+ 409 冲突

- 文档单位：draft revision（page 或 entry）。
- 保存接口必须带版本号：
  - 方案 A：请求头 `If-Match: "<rev>"`（更标准）
  - 方案 B：body 里带 `rev` 字段（实现更直接）
- 服务端规则：
  - `client_rev != current_rev` → 返回 **409 Conflict**（并返回当前最新 revision 摘要）
  - `client_rev == current_rev` → 允许保存，生成新 revision（rev + 1）
- Admin/Editor 的 UX（v1 必须）：
  - 提示“已被他人更新”，提供：拉取最新 / 查看差异（可后置）/ 强制覆盖（需要额外权限或二次确认）

### 6.2 Presence（谁在编辑）：先做轻量提示，再做实时会话

v1 Presence 推荐落地为“编辑占用 + 心跳”即可：

- `POST /sites/{site_id}/docs/{doc_id}/presence`（心跳）
- `DELETE /.../presence`（离开）
- 服务端存储：Valkey key（带 TTL），按 doc_id 聚合在线用户与最后心跳时间
- UI 展示：右上角 avatar 列表 + “某某正在编辑”

通信形态可选：

- v1：轮询（5-10s）也可接受（最保守）
- v1.5：SSE（比 WebSocket 简单）
- v2：WebSocket（为结构 ops/细粒度 presence 预留）

### 6.3 v2 扩展（后置到核心闭环完成之后）

- 结构 ops 强协作：insert/delete/move 的可重放与冲突处理
- 富文本/复杂字段：OT/CRDT（高风险，必须在有充分测试与明确收益时再做）
- 字段软锁/权限范围限定：可作为更明确的收费点（例如“允许对某些字段启用锁定/审批流”）

### 6.4 权限与开关（保留收费点入口，但不绑死在 v1 实现）

- workspace RBAC 权限码建议：
  - `site:read`, `site:write`, `site:publish`
  - `site:layout:manage`（导航/页脚）
  - `content:types:manage`, `content:entries:write`, `content:entries:publish`
  - `collab:presence:use`（是否允许进入 presence）
  - `collab:realtime:use`（v2：是否允许加入实时协作会话）
- 付费开关建议（workspace plan）：
  - `collab.presence_enabled`
  - `collab.realtime_enabled`（v2）
  - `collab.max_concurrent_editors`
  - `collab.field_locking_enabled`（v2）
  - `collab.audit_retention_days`

---

## 7. 插件/主题/模板（同仓构建）路线

### 7.1 v1 目标

- 第一方主题：`packages/site-theme-default`
- 第一方 blocks：`packages/site-block-registry`（schema）+ theme renderer（外观）
- 插件扩展点先定义协议（extension points），v1 可先只支持第一方插件参与

### 7.2 分发与安装（未来）

- 主题/插件打包为 zip 或 marketplace 条目
- 安装后需要重启/重建 portal（同仓构建的自然代价）
- 后续可引入签名与版本约束（避免供应链风险）

---

## 8. 迁移与第三方集成（预埋）

### 8.1 迁移（Importers）

- 定义统一导入格式：以 Page IR / EntryType / Entry 为目标
- 提供导入器接口：Halo/Ghost/Contentful 等可逐步实现

### 8.2 第三方集成（Integrations）

- Webhooks：发布/回滚/内容更新事件（v1 可先定义事件结构与发送点）
- API Token：面向第三方应用读取/写入（后续与 OAuth/SSO 分离）

---

## 9. 里程碑（建议 3 个 Sprint）

### Sprint 1：核心渲染器验证（Sprint 1 修正：先打地基，不急做 Admin UI）

目标：把 Block Protocol、SSR 输出、主题 CSS 注入三件事跑通，否则后续都属于“空中楼阁”。

- 定义 Block Protocol：
  - 后端：Pydantic v2 schema（DocumentIR/BlockNode/LocalizedValue）
  - 前端：TS interface/type（与后端一一对应）
- 新建 `apps/web/portal`：
  - 建议采用 vike（或参考 TanStack Start）搭 SSR 管线
  - TanStack Router 负责路由与数据加载组织
- Hardcode 渲染验证：
  - 手写一个 `DocumentIR` JSON（代表页面结构）
  - Portal SSR 能渲染为 HTML（public mode），并能在浏览器 hydration
- CSS/字体注入验证：
  - JSON/RuntimeConfig 配置的“主题色”必须变成 SSR 输出的 CSS 变量
  - 自托管字体注入先跑通（可先 stub 数据源）
- 错误处理基建：notFound/forbidden/error（主题风格）+ block-level error boundary

### Sprint 2：编辑器“壳”与 iframe 通信（Sprint 2 修正：体验先行）

目标：实现“真实视角编辑”的关键体验：选中高亮 + 脏数据预览，不刷新 iframe。

- Portal 增加 editor mode（例如 `/__editor/...`）：
  - Admin 发送 `{ type: 'SELECT_BLOCK', id }` → Portal 能画出蓝框/选中态
  - 叠加 overlay（选中框、拖拽把手挂点），但渲染内核保持与 public mode 一致
- Iframe 通信：
  - 推荐引入 penpal 做 RPC（selectBlock/pushDraftIR/requestSave 等）
- “脏数据”预览：
  - Admin 修改 IR → 通过 RPC 推送 → Portal 毫秒级重绘（局部 store 更新），不刷新 iframe
- v1 暂不强求完整页面树/发布闭环（可以先用 hardcode 或 stub API），把编辑体验打磨到可用

### Sprint 3：后端存储与发布闭环（Sprint 3 修正：把 CMS 变成“可交付产品”）

目标：建立 Revision 系统与发布动作，并完成 RouteTemplate resolver（后端最复杂部分）。

- 后端实体与 API 落地：
  - Site/SiteSettings、SitePage/PageRevision
  - EntryType/Entry/EntryRevision
  - RouteTemplate + resolver（见 4.1.1：优先级/缓存/失效/测试）
- Revision 系统：
  - 每次保存产生新 revision（rev + 1）
  - publish：将某个 draft revision 标记为 published（或复制到 published）
  - 乐观锁：If-Match/rev 冲突返回 409（见第 6 章）
- Preview：
  - preview token 支持读取 draft（避免“未发布内容可被爬”）
- SEO 基础映射：
  - meta/OG/hreflang（字段级 i18n map）
  - sitemap v1：至少包含 pages + entries（最小可用）
- 协作（v1）：只做 presence + 乐观锁（不做 OT/CRDT，不做结构 ops 强协作）

---

## 10. 风险清单与预防

1) **一致性风险（Admin vs Portal CSS）**：采用 portal editor mode + iframe 隔离（v1 推荐方案）
2) **配置失控风险**：SiteSettings 按 namespace 拆分；props 严格 schema；禁止任意脚本注入默认开启
3) **RouteTemplate Resolver 复杂度**：静态/动态路由判定、冲突优先级、缓存与失效、权限与 mode 行为都容易出 bug；必须单独设计与测试（见 4.1.1）
4) **协作复杂度**：v1 降级为 presence + 乐观锁（409）；OT/CRDT 与结构 ops 强协作后置到 v2
5) **插件供应链风险**：v1 同仓构建 + 本地安装；marketplace 后置并引入签名/审核

---

## 11. 待确认事项（不阻塞 Sprint 1，但需尽早定）

- Portal 与 Admin 的部署域名策略（同域/子域）→ 影响 iframe 同源策略与 token 传递
- 内容模型（EntryType）字段类型集合 v1 范围（text/richText/image/ref 等）
- 图片处理策略（SEO + 性能）与 assets pipeline（可复用现有 asset library）
