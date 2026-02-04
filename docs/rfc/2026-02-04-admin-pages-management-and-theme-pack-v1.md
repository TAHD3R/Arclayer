# Admin 页面管理与主题包机制（v1 RFC）

本文档是对 `docs/admin-pages-management-and-theme-config-plan.md` 的“设计补全版”，目的不是把所有能力一次性做完，而是把**页面管理**、**沉浸式可视化编辑（WYSIWYG）**、**主题包（整站模板）**、**站点级配置化（theme.config）** 这些能力如何拼起来讲清楚，并回答“为什么这样设计、怎么用、有什么用”。

时间点：2026-02-04（与当前仓库实现保持一致）。

---

## 1. 目标与非目标

### 1.1 目标（面向非技术用户）

- 非技术用户可以：
  - 导入一个主题包（例如 Blog / Corporate 两套就足够）
  - 通过可视化表单配置主题（不写代码，不直接编辑 JSON）
  - 通过可视化编辑器编辑页面内容、布局与样式
  - 预览、发布、下线页面，管理页面树（导航结构）
  - 配置 SEO（站点级 + 页面级），获得良好 Lighthouse/SEO 指标

### 1.2 非目标（v1 暂不强求）

- 不强求“完全自由的像素级排版”（那会导致 UX/可维护性/性能不可控）
- 不强求 v1 即实现“多人实时协作编辑所有内容”（先把保存/发布/回滚/冲突处理链路走通）
- 不强求主题包立刻具备“任意第三方执行代码能力”（SaaS 模式下必须强隔离，v1 先只做安全白名单能力）

---

## 2. 核心领域模型：Workspace / Site / Page / Revision

### 2.1 单 Workspace 单 Site（已落地）

- 组织（Organization）下有多个工作区（Workspace）
- 每个工作区对应一个站点（Site）：**1 workspace -> 1 site**
- 这带来的产品与工程收益：
  - Admin 信息架构更清晰：所有站点管理都挂在 `/w/:workspaceId/...`
  - 权限更清晰：Workspace RBAC 即站点 RBAC
  - 编辑器 URL 更稳定：workspaceId -> siteId 映射固定

### 2.2 Page 是“内容”，Revision 是“状态机”

建议将页面管理视为“内容管理系统”的一个特例：

- Page：页面的元数据与“可寻址性”
  - `pathname`（或 path）：决定 URL
  - `title`：管理端展示
  - `parent_id` / `sort`：页面树
  - `seo`：页面级 SEO 元数据（可选）
  - `i18n`：页面级语言策略（可选）
- Revision：页面在某一时刻的“内容快照”
  - draft revision：编辑中的草稿（可频繁保存）
  - published revision：对外发布的版本（稳定、可回滚）
  - revision id：用于乐观锁（expectedRevision）

### 2.3 页面生命周期（v1 已实现的最小状态机）

- 新建页面
- 保存草稿（draft）
- 发布（publish：draft -> published 指针切换）
- 回滚（rollback：published/draft 指针回到某个历史 revision）
- 下线（unpublish：published 指针置空，草稿仍保留）

这套状态机能支撑：
- 非技术用户的“安全感”：发布前可预览，发布后可回滚
- SEO 与性能：public 只渲染 published revision，避免草稿污染索引
- 协作：expectedRevision 冲突可提示“你的版本已过期”

---

## 3. WYSIWYG：沉浸式与所见即所得如何同时成立？

### 3.1 为什么用 iFrame + RPC？

目标是做到：
- 编辑器画布（Portal）像“真实网站”一样运行（路由、主题、渲染、动效都完整）
- Admin 作为 Host 只负责“管理能力”：保存、发布、权限、资产库、插件管理

iFrame 带来的关键价值：
- **隔离**：样式隔离、运行时隔离、避免把 editor 依赖打进 admin bundle
- **安全**：SaaS 场景可用独立域名 + CSP
- **一致性**：Portal 画布就是最终用户看到的 runtime

RPC（Host <-> Portal）带来的关键价值：
- Portal 不直接写数据库、不直接调用管理 API
- Host 统一把“保存/发布/下线”等能力以 RBAC 保护的 API 调用完成
- 可插拔：后续插件只要遵守协议，就能在 Portal 中扩展 editor 能力

### 3.2 沉浸式（Immersive）与 WYSIWYG 的 UI 策略

建议把编辑器 UI 分为两层：

1) Portal 画布层（尽量 100% 贴近真实站点）
- 不出现 Admin 的侧边栏/顶栏
- 尽量少的编辑 UI 覆盖（选中框、拖拽指示线、轻量工具条）

2) Host 管理层（沉浸式浮层/全屏）
- 采用 `ExpandableScreen` 从内容列表直接展开 editor（已落地）
- 支持 overlay 模式（沉浸）与 page route 模式（可分享 URL）

---

## 4. i18n：页面内国际化如何做才“可维护”？

这里建议把问题拆成两类：

### 4.1 结构化字段（SEO、导航标题、按钮文案）

这类字段适合做成“多语言字段”：
- 在 schema 中提供 `title_i18n` / `label_i18n` 之类结构
- Admin UI 提供语言切换编辑（或并排编辑）
- Runtime 根据 locale 渲染对应语言

优点：可控、可校验、易于被 AI 辅助批量翻译。

### 4.2 富文本/块内容（正文内容、复杂组件）

建议不要把它们变成“强耦合的 key-value 翻译表”，否则非技术用户很难理解 key。

更适合的做法是：
- Editor document 中的文本节点保留“原文 + 可选翻译”
- 或者采用“内容块级别的 locale variant”（例如同一 block 在不同语言下的 props 不同）

工程落地建议（渐进式）：
- v1：document 允许内嵌 locale map（简单但可能冗余）
- v2：抽出 Translation Memory（便于复用与 AI 批处理）

---

## 5. SEO：极致性能与 SEO 的平衡

### 5.1 必须坚持的底线

- public 页面必须 SSR（或 SSG），避免纯 CSR 影响爬虫与首屏
- public 渲染只使用 published revision（草稿不影响索引）

### 5.2 Admin 侧 SEO 配置建议（待实现）

站点级：
- 站点 title / description
- favicon / og 默认图
- robots 策略（index/noindex）
- sitemap 生成策略（包含哪些页面）

页面级：
- title/description/og image
- canonical
- noindex（比如活动页、内部页）
- schema.org JSON-LD（主题包可提供模板）

### 5.3 性能策略（主题包与编辑器需配合）

- CSS：主题 token + Tailwind 生成（避免每页注入大量 style）
- JS：块级别按需加载，编辑器态加载编辑工具，runtime 只加载展示组件
- 图片：强制走 Asset 系统（压缩/多尺寸/懒加载）

---

## 6. 导航与页脚：为什么放在 Site Setting？

导航/页脚属于站点级“结构化内容”，通常需要：
- 多页面共享
- 多语言
- 与页面树联动（可选择自动生成/手动编排）

因此建议：
- 存放在 `SiteSetting`（例如 `nav.header` / `nav.footer`）
- Admin 提供可视化编辑器（同样可走 Portal iFrame，复用 block system）

---

## 7. 样式分离：如何让非技术用户也能做出高级感？

核心原则是“给自由，但限制自由的维度”：

### 7.1 推荐的样式分层

- Theme token（全局）：颜色、字体、圆角、阴影、间距尺度
- Block presets（组件级）：按钮/卡片/标题组件的 preset（可选）
- Page overrides（页面级）：少量页面特例（建议强约束）

### 7.2 为什么不鼓励“任意 CSS 注入”？

- SEO/性能不可控：用户随意注入可能导致 CLS/LCP 指标灾难
- 安全不可控：SaaS 模式存在 XSS/数据泄露风险
- 可迁移性差：主题包/站点迁移会变得脆弱

更推荐：
- 对外暴露“设计系统层面的参数”（token/preset）
- 通过主题包提供“高质量默认值”，用户只改少量关键配置即可

---

## 8. 主题包（Theme Pack）：整站模板的 JSON 规格建议

你们已经确认：
- 主题包是“完整站点方案”（Blog/Corporate 两套足够）
- 仅保留 JSON（不做 TOML）
- 必须支持可配置化（configSchema + theme.config）

### 8.1 建议的包内容（zip 或目录）

- `manifest.json`（主题包元信息 + schema）
- `templates/`（页面模板：home/about/blog 等）
- `blocks/`（可复用块模板/局部组件配置）
- `assets/`（图片、字体等，导入后进入 Asset 系统）
- `README.md`（可选：主题包说明）

### 8.2 manifest.json 推荐结构（示意）

```json
{
  "id": "@celestial/theme-blog",
  "name": "Celestial Blog",
  "version": "1.0.0",
  "type": "site-pack",
  "templates": [
    { "key": "home", "pathname": "/", "title": "Home", "documentRef": "templates/home.json" },
    { "key": "post", "pathname": "/posts/:slug", "title": "Post", "documentRef": "templates/post.json" }
  ],
  "configSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "home": {
        "type": "object",
        "properties": {
          "news": {
            "type": "object",
            "properties": { "limit": { "type": "integer", "minimum": 1, "maximum": 30 } }
          }
        }
      }
    }
  }
}
```

### 8.3 theme.config（站点级配置）的职责边界

- `theme.config` 只存“public-safe、影响渲染输出”的配置
  - 例如：模块开关、列表展示数量、首页 hero 文案、默认主题色
- 明确禁止在其中存 secrets（token、私钥、密码）

配合 runtime：
- SSR 渲染读取 `theme.config`，决定页面渲染与数据区块参数
- Editor 读取 `configSchema` 自动生成“配置面板”

---

## 9. 分类/标签：是否需要？怎么提供？有什么用？

建议把“分类/标签”拆成两种：

1) 页面（Page）本身：
- 多数情况下，页面是“信息架构节点”，分类意义不大
- 更需要的是“页面树 + 导航配置”

2) 内容条目（Entries，例如文章/新闻/产品）：
- 分类/标签非常有价值：
  - 支撑列表页筛选、聚合页、SEO landing pages
  - 支撑迁移导入（从 WordPress/Notion/Markdown）

v1 建议策略：
- 页面管理先不强行内置分类/标签
- 为 entries 模块预留 taxonomy 能力（可作为插件/模块实现）

---

## 10. 建议的下一步拆解（从 MVP 到 “awwwards 级”）

1) 主题配置表单化：读取 `configSchema` 自动生成 UI（替代 JSON 文本框）
2) 导航/页脚可视化编辑：`nav.header` / `nav.footer` settings + Portal 画布编辑
3) 页面级 SEO 面板：站点级默认 + 页面级覆盖，生成 sitemap/robots
4) entries_list 最小动态区块：主题配置驱动列表参数，SSR 输出稳定
5) 协作体验补齐：保存冲突（409）提示 + presence + 评论/批注
