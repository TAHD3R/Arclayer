# 资源库治理与通用入口计划（Folders / Trash / Purpose / Indexable / Settings Entry）

最后更新：2026-01-30
适用范围：CelestialCMS（`apps/api` FastAPI + `apps/web/admin` React + 插件系统）

> 本文档在 `docs/plans/2026-01-28-storage-upload-asset-library-plan.md` 的基础上，扩展“资源治理与通用入口”能力。
> 目标是让资源库从“能上传能看”演进为“全项目资源配置的统一入口”，同时遵循“用户无感”的产品原则。

---

## 0. 背景与核心决策（已对齐）

### 0.1 产品与部署形态

- 当前：单站点模式开发。
- 未来：计划支持 SaaS 在线产品（轻量用户在线管理）+ 自托管（开发者/隐私/企业定制）。
- 规划：存在组织（Organization）与多站点（Site）配置；存在多租户/多团队。

### 0.2 本阶段关键约束（已确认）

- 上下文来源：以 token/会话上下文方式（不通过 URL 参数传 org/site）。
- 默认归属：资源默认归属于 site（`site_id`）。
- 可见性语义：
  - `public`：公开可访问（真正公开，允许被索引与否由 indexable 策略决定）。
  - `shared`：共享（通过分享链接 token 访问，不等于公开）。
- 引用模型：同一份资源允许被多个地方引用。
- 扩展性：`entity_type` 使用“字符串 + 约定”，支持插件扩展。
- 非图片深度预览：暂不纳入本阶段（先以“稳定治理与统一入口”为主）。

---

## 1. 产品目标（PM 视角）

### 1.1 北极星目标

让“资源库”成为项目内所有涉及资源（图片/图标/附件等）的**统一配置入口**：

- 业务模块不再保存 raw URL；统一保存 `asset_id` 并由系统解析 canonical URL。
- 删除/回收站/权限/索引策略变更能够精确提示影响范围（靠引用关系，而不是靠猜测）。
- 有需求的用户能快速找到治理能力；无需求的用户不被额外开关与概念打扰（用户无感）。

### 1.2 本阶段落地范围（优先级）

1. 回收站（Recycle Bin）完整闭环：列表、恢复、彻底删除（purge）。
2. 文件夹（Folders）树结构：用于组织与查找；为未来权限边界预留。
3. 引用关系（AssetUsage）最小闭环：能写入 usage、能在资源详情看到“被哪里使用”。
4. Purpose 与 Indexable 的“策略承载”：先建立数据与最小 UI，再逐步强化预设/治理。
5. 通用入口接入（第一批）：站点 Logo、favicon、默认头像占位图（1/2/5）。

---

## 2. “用户无感”体验原则（必须遵守）

采用渐进式显露（Progressive Disclosure）：

### 2.1 默认层（80% 用户）

- 资源列表：上传、搜索、基础筛选、预览、复制链接、下载、删除。
- 不在卡片上展示 indexable/purpose 等治理字段，避免信息噪音。

### 2.2 管理层（明确管理行为时出现）

- 左侧固定视图提供：全部资源 / 最近上传 / 回收站。
- 文件夹树默认折叠，或只显示少量常用节点。
- 资源详情页固定展示“被引用位置（Where used）”与基础元数据。

### 2.3 治理层（设置页集中呈现）

- 所有策略类开关（默认 indexable、purpose 预设、回收站保留天数、允许类型/大小等）
  收敛到：设置 → 资源库（Assets）。

---

## 3. 领域模型与数据设计（Engineering 视角）

### 3.1 作用域（Scope）与可见性（Visibility）分离

为满足未来 SaaS 多租户 + 多站点：

- Scope（归属范围）：`org_id` + `site_id`（默认 site）
- Visibility（访问可见性）：`private/org/site/public/shared`

> 注：本阶段如果你们尚未实现 org/site 两级完整权限，也应在数据层预留字段与约束，
> 以避免未来迁移困难。

### 3.2 assets（核心表）建议调整

在现有 `assets` 基础上补齐/调整：

- `org_id`（必填，来自会话上下文）
- `site_id`（必填，默认当前 site）
- `folder_id`（可空）
- `default_purpose`（可空：仅用于“主用途标记/默认筛选”；引用用途以 AssetUsage 为准）
- `indexable`：建议三态 `NULL | TRUE | FALSE`
  - `NULL`：继承站点/用途默认策略（默认无感）
  - `TRUE/FALSE`：显式覆盖
- 回收站审计字段：
  - `deleted_at`（已有）
  - `deleted_by_user_id`
  - `purged_at`（可选）
  - `purged_by_user_id`（可选）

### 3.3 asset_folders（真实树结构，强烈建议）

- `id`
- `org_id`
- `site_id`（可空：组织共享文件夹；本阶段默认创建 site 文件夹）
- `parent_id`（可空）
- `name`
- `path`（可选冗余：用于排序/展示，避免频繁递归计算）
- `created_by_user_id`
- timestamps

### 3.4 asset_usages（通用入口地基，必须引入）

用于实现“Where used”与“删除影响提示”：

- `id`
- `org_id`
- `site_id`
- `asset_id`
- `purpose`（必填）
- `entity_type`（字符串约定；插件扩展友好）
- `entity_id`
- `field_key`（点路径，例如 `branding.logo`）
- `created_by_user_id`
- timestamps

后续预留（非本阶段必须）：

- `variant_pref` / `preferred_width`
- `alt_text`
- `crop` / `focal_point`

---

## 4. API 计划（后端）

### 4.1 资源列表（回收站支持）

在现有 `GET /api/v1/admin/assets` 基础上增加过滤参数：

- `deleted`：
  - `exclude`（默认）
  - `only`（回收站）
  - `include`（包含已删除）

### 4.2 回收站恢复与彻底删除

- `POST /api/v1/admin/assets/{asset_id}/restore`
  - 行为：清空 `deleted_at`，记录审计字段。
- `DELETE /api/v1/admin/assets/{asset_id}?hard=true`
  - 行为：彻底删除 DB 记录与底层对象（主文件 + 变体 + 相关 share links/usages 处理策略）
  - 处理策略建议：
    - share links：可直接删除或标记 revoke（保持审计）
    - usages：保留审计记录或级联删除（二选一；建议保留软审计，或保留 usage 但标记失效）

### 4.3 资源引用（AssetUsage）

最小闭环接口：

- `GET /api/v1/admin/assets/{asset_id}/usages`
  - 返回：引用列表（entity_type/entity_id/field_key/purpose/created_at/created_by）
- `POST /api/v1/admin/assets/{asset_id}/usages`
  - 用于业务模块写入 usage（或也可做为通用的 upsert）
  - 建议支持幂等：`(asset_id, entity_type, entity_id, field_key)` unique

### 4.4 indexable 行为闭环（public/share）

本阶段目标：先把 `indexable` 字段引入与透传，行为闭环可分两步：

1. Phase A（本阶段）：
   - public/share 响应加入 `X-Robots-Tag`（若最终策略判定为 noindex）
2. Phase B（后续）：
   - 引入 purpose preset 与站点策略继承，形成最终策略计算。

---

## 5. 前端计划（Admin）

### 5.1 AssetsView：信息架构（IA）

左侧/顶部的默认结构建议：

- 固定视图：
  - 全部资源
  - 最近上传
  - 回收站
- 文件夹树：
  - 默认折叠
  - 支持创建/重命名/移动（可后置）

无感原则：

- purpose/indexable 等治理字段不在卡片上展示。
- 仅在详情页/高级筛选里展示。

### 5.2 资源详情页（Sheet）：Where used（必做）

在详情页增加一个 Accordion（默认展开）：

- 标题：被引用位置
- 内容：列表展示引用点（模块/字段/更新时间），并提供“跳转到配置页”的能力（若有路由）

### 5.3 通用入口：AssetPicker（第一批接入 1/2/5）

创建一个复用组件（建议放在 `apps/web/admin/src/views/assets/components/` 或 `packages` 里）：

- `AssetPickerDialog`（或 `AssetPickerPopover`，优先 dialog）
- 支持传入：
  - `purpose`（site_logo / favicon / avatar_placeholder）
  - `acceptMime`（默认图片）
  - `defaultFolderId`（可选）
  - `allowUpload`（默认 true）
- 交互：
  - 打开后默认按 purpose 过滤（用户无感）
  - 上传成功自动选中最新资源
  - 选中后返回 `asset_id`（业务保存 `asset_id`，不保存 URL）

接入点（第一批）：

1. 站点 Logo
2. favicon
3. 默认头像占位图

> 说明：接入点页面路径/组件要在实施时结合现有 settings 页面结构确认。

### 5.4 i18n 与文案

- 资源库相关文案放入 `locales/*/assets.json`。
- 通用按钮文案（如 retry）放 `common.json`（已存在）。
- “无感”原则：默认 UI 文案尽量简短，不暴露过多概念；治理文案仅在设置页出现。

---

## 6. 设置项设计（Settings → Assets）

本阶段建议只做“最小治理入口”，避免过度设计：

### 6.1 站点级（Site policy）

- 默认 indexable（public 的默认策略）
- 回收站保留天数（先做配置项占位也可）
- favicon/Logo/默认头像占位图 的 purpose 预设（仅用于 Picker 默认过滤与提示）

### 6.2 后续扩展（不在本阶段）

- Purpose presets：每个 purpose 的默认可见性、默认 indexable、允许 mime、推荐尺寸/比例等。
- 存储/CDN/限额等组织级配置（更多偏 SaaS）。

---

## 7. 迁移与兼容策略

### 7.1 URL 迁移策略

- 管理后台与业务配置统一使用 `asset_id`。
- 前端展示/复制链接统一使用 canonical：
  - public：`/assets/{asset_id}`
  - thumb：`/assets/{asset_id}/thumb?w=...`
  - download：`/assets/{asset_id}/download`
  - share：`/s/{token}`

### 7.2 老数据兼容

- 若历史配置仍保存 URL：
  - 在读取时尝试解析出 `asset_id`（如果 URL 结构可识别）
  - 或提供一次性迁移脚本（后续）

---

## 8. 风险与对策

### 8.1 “引用关系”不完整导致误删风险

风险：如果业务模块未写入 usage，Where used 不可信。
对策：

- 第一批接入（Logo/favicon/avatar placeholder）必须在保存配置时写入 usage。
- 删除弹窗提示：“引用信息可能不完整”（仅在早期过渡阶段显示，后续移除）。

### 8.2 shared 与 public 的索引策略混淆

风险：share link 被搜索引擎收录带来泄露风险。
对策：

- 默认 share 预览响应加 `X-Robots-Tag: noindex`（即使 public 可 indexable，也建议 share 默认 noindex）。

### 8.3 多租户/多站点未来迁移成本

对策：

- 所有新表都带 `org_id/site_id` 字段，即使当前单站点也要写入。
- 服务层从会话上下文读取 org/site，避免未来大规模改 API。

---

## 9. 里程碑与交付物（建议拆分）

### Milestone A（数据与 API）

- assets：补齐 `org_id/site_id/default_purpose/indexable(三态)/deleted_by_user_id`
- 新增 `asset_usages` 表 + list/create（幂等）
- assets 列表支持 `deleted` 参数
- restore + hard delete（purge）接口

### Milestone B（前端管理）

- AssetsView 增加回收站视图入口（deleted=only）
- 资源详情页增加 Where used 区块
- 删除弹窗提示引用数（至少显示 usages 数量）

### Milestone C（通用入口接入：1/2/5）

- 建立 `AssetPickerDialog`
- 接入：
  - 站点 Logo
  - favicon
  - 默认头像占位图
- 保存时写入 usages（entity_type/field_key 约定落地）

---

## 10. 验收清单（Definition of Done）

### 产品验收

- 用户在设置页更换 Logo/favicon/默认头像占位图，全程无需理解 URL，保存成功后即时生效。
- 资源详情页能看到这些资源被引用在何处（Where used）。
- 删除资源时能提示影响范围（至少显示引用数），删除后进入回收站。
- 回收站可恢复、可彻底删除。
- 不使用这些能力的用户，在资源列表默认视图几乎看不到额外概念（无感）。

### 工程验收

- 前端：`pnpm lint:admin`、`pnpm typecheck:admin` 通过。
- 后端：`pnpm lint:py` 通过；pyright 视情况执行（本阶段可跳过）。
- API：关键路径具备最小单测或集成测试（按仓库现状决定）。
