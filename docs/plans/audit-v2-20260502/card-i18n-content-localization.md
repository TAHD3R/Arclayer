# Plan: 内容国际化 (Content i18n) 完整实现

> **审计来源**: `docs/plans/audit-v2-20260502/AUDIT_REPORT.md` §1.2 / §2.2
> **创建日期**: 2026-05-02 | **优先级**: P0 | **估时**: 3-4 周
> **依赖**: 无 (独立可执行)

---

## 1. 问题定义

Arclayer 的 ContentItem 虽然有 `locale` 字段，但各 locale 条目完全独立、无关联。`localizable` 字段标记已声明但无运行时行为。Content Delivery API 的 `?locale=` 参数仅为内存后过滤（非 SQL 层）。运行时 locale fallback 仅用于设置字符串，不用于内容。

**验收目标**: 实现 Contentful 对等的 Locale 管理 + 内容条目跨语言关联 + 字段级本地化值存储 + Content API locale 参数 + Admin 翻译管理 UI。

---

## 2. 现状分析

### 2.1 已具备的能力

| 组件 | 文件 | 说明 |
|------|------|------|
| ContentItem.locale 字段 | `models/content/content_item.py:61` | `CharField(max_length=16, default="zh-CN")` |
| PublishedGraph.locale | `models/content/published_graph.py:40` | 发布图带 locale |
| `localizable` 字段标记 | `fields/base.py:17` | `FieldConfig.localizable: bool = False` (仅元数据) |
| `?locale=` REST 参数 | `api_generator/content_api.py:276` | 内存后过滤 (非 SQL) |
| 站点本地化设置 | `sites/runtime/localization/service.py` | default/fallback/supported locales |
| Admin locale 切换器 | `components/layout/admin-toggle-locales.tsx` | UI 语言切换 |
| 内容库 locale 筛选 | `content-library-toolbar.tsx:308` | 前端筛选器 |
| Protocol "localizable" | `protocol_registry.py:200` | 声明但未接线 |
| LocalizedStringMapField | `localized-string-map-field.tsx` | 已实现但仅用于设置页 |

### 2.2 缺失的能力 (需实现)

1.  **No translation group**: 不同 locale 的同一条目无法关联
2.  **No localized field storage**: `fields_snapshot` JSONB 无 per-locale 结构
3.  **No DB-level locale filter**: `filter_records_by_locale()` 是 Python 内存过滤
4.  **No locale fallback in delivery**: 请求的 locale 无内容时返回空，不 fallback
5.  **No GraphQL locale filter**: `SiteGraphQLService.list_records()` 不接受 locale 参数
6.  **No translation management UI**: 无法创建翻译、查看翻译状态

---

## 3. 架构决策

### 3.1 条目级 vs 字段级本地化

**决策: 条目级本地化 + 可选的字段级覆盖**

- 每个 ContentItem 属于一个 `translation_group` (同一概念的多语言版本)
- 每个 locale 有独立的 ContentItem (条目级)
- 未来可选支持字段级本地化值 (字段值按 locale 存储的 JSONB 结构)

**理由**: 条目级方案与现有 ContentItem 模型兼容，实现成本最低。Contentful 的字段级方案需要重构 `fields_snapshot` 存储结构，风险高、周期长。

### 3.2 Translation Group 模型

```
ContentItem.translation_group_id (FK -> TranslationGroup.id, nullable)
TranslationGroup:
  - id (UUID)
  - primary_item_id (FK -> ContentItem, 规范条目)
  - created_at
```

所有 locale 变体共享一个 `translation_group_id`。创建第一条目时自动创建 translation group。

### 3.3 Locale Fallback 链

```
请求 locale=X → 查找 X 的条目 → 找到? 返回
  → 未找到? 尝试 fallback_locale → 找到? 返回
  → 未找到? 尝试 default_locale → 找到? 返回
  → 未找到? 返回 translation_group 中任一可用条目
```

---

## 4. 实现步骤

### Step 1: 数据模型 (后端)

**新建模型** — `apps/api/src/models/content/translation_group.py`:

```python
class TranslationGroup(Model):
    id = fields.UUIDField(pk=True)
    workspace_id = fields.UUIDField()
    primary_item_id = fields.ForeignKeyField("models.ContentItem", null=True, related_name="primary_of_groups")
    primary_locale = fields.CharField(max_length=16, default="zh-CN")
    created_at = fields.DatetimeField(auto_now_add=True)
```

**修改模型** — `apps/api/src/models/content/content_item.py`:
- 新增 `translation_group: fields.ForeignKeyField("models.TranslationGroup", null=True)`
- 新增复合索引: `("translation_group_id", "locale")`

**数据库迁移**: 运行 `pnpm --filter @arclayer/api db:migrate`

### Step 2: Locale 管理 CRUD (后端)

**新建模块** — `apps/api/src/modules/projects/content/locales/`:

| 文件 | 内容 |
|------|------|
| `router.py` | `GET/POST/PUT/DELETE /projects/{id}/locales` |
| `schema.py` | `ProjectLocaleOut`, `ProjectLocaleCreateIn`, `ProjectLocaleUpdateIn` |
| `service.py` | `ProjectLocaleService` — CRUD + 校验 (不能删除 default locale) |
| `repository.py` | `ProjectLocaleRepository` |

**复用已有设置**: Locale 列表从 `core.site_localization.supported_locales` 读取，本模块提供管理 API。

### Step 3: Translation Group Service (后端)

**新建** — `apps/api/src/modules/projects/content/items/translation_service.py`:

```python
class ContentTranslationService:
    async def get_or_create_translation_group(item_id) -> TranslationGroup
    async def link_translation(item_id, group_id)
    async def get_translations(group_id) -> list[ContentItem]  # 各locale
    async def create_translation(source_item_id, target_locale) -> ContentItem
    async def get_item_by_locale(group_id, locale, fallback=True) -> ContentItem
```

### Step 4: 更新 ContentItem Service (后端)

**修改** — `apps/api/src/modules/projects/content/items/canonical_service.py`:
- `create_item()`: 自动创建 TranslationGroup 或链接到已有 group
- 新增 `create_translation(source_item_id, target_locale)`: 复制基础字段 + 设置 locale + 链接到同 group
- `get_item()`: 支持 `?locale=` 查询参数进行 locale fallback

**修改** — `apps/api/src/modules/projects/content/items/input_schema.py`:
- `ContentItemCreateIn`: 新增 `translation_group_id: UUID | None`
- 新增 `ContentTranslationCreateIn`: `source_item_id`, `target_locale`

### Step 5: DB-level Locale Filter (后端)

**修改** — `apps/api/src/modules/sites/runtime/repository.py`:
- `list_content_entries_by_model_key()`: 新增 `locale: str | None` 参数 → SQL WHERE
- `list_active_release_nodes_by_model_key()`: 新增 `locale: str | None` 参数

**修改** — `apps/api/src/core/api_generator/content_api.py`:
- `filter_records_by_locale()`: 标记为 deprecated
- `ContentApiGeneratedController.list_entries()`: 使用 repository 层 locale 过滤替代内存过滤

### Step 6: Locale Fallback in Delivery (后端)

**修改** — `apps/api/src/modules/sites/content_api/entries_router.py`:
- `ContentDeliveryServiceBinding.list_records()`: 实现 locale fallback 链
- 新增 `_resolve_locale_fallback(model_key, requested_locale, supported_locales, fallback_locale)`

### Step 7: GraphQL Locale Support (后端)

**修改** — `apps/api/src/modules/sites/graphql/service.py`:
- `SiteGraphQLService.list_records()`: 新增 `locale: str | None` 参数
- `_to_structured_record()`: 已有 locale 字段，保持不变

**修改** — `apps/api/src/modules/sites/graphql/schema.py`:
- 查询参数新增 `locale: str`

### Step 8: REST API 端点

**新建** — `apps/api/src/modules/projects/content/items/translation_router.py`:

| 端点 | 方法 | 说明 |
|------|------|------|
| `/items/{id}/translations` | GET | 列出所有翻译版本 |
| `/items/{id}/translations` | POST | 创建新翻译 (指定 target_locale) |
| `/items/{id}/translation-group` | GET | 获取 translation group 详情 |

### Step 9: Admin 前端 — Locale 管理

**修改** — `apps/admin/src/pages/projects/settings/`:
- 将已有的 `localization-settings-tab.tsx` 复用
- 新增 `ProjectLocalesPage` (如果不存在): 显示可用 locale 列表 + 添加/删除

### Step 10: Admin 前端 — 内容库 locale 列 (已部分存在)

**修改** — `apps/admin/src/pages/projects/content/library/`:
- 确认 locale 列、筛选器正常工作
- 新增 "创建翻译" 操作按钮 (行操作菜单中)

### Step 11: Admin 前端 — 翻译编辑器

**新建** — `apps/admin/src/pages/projects/content/library/components/content-translation-create-dialog.tsx`:
- 选择目标 locale 的下拉菜单
- 显示源条目预览
- 创建翻译按钮

**新建** — `apps/admin/src/pages/projects/content/library/components/content-translation-status-badge.tsx`:
- 每个条目的翻译状态指示器
- "3 locales" / "Missing: en-US" 等

### Step 12: Admin 前端 — 编辑器 locale 切换器

**修改** — `apps/admin/src/pages/projects/content/library/article-editor/`:
- 新增 locale 切换下拉菜单 (在编辑器工具栏中)
- 切换到其他 locale 的同一 translation group 条目

### Step 13: i18n 资源

**修改** — `locales/zh-CN/content.json` + `locales/en-US/content.json`:
- 新增 key: `CONTENT_TRANSLATION_*`, `CONTENT_LOCALE_*`, `CONTENT_TRANSLATION_GROUP_*` 等

### Step 14: 测试

| 层 | 测试文件 | 覆盖 |
|----|---------|------|
| 后端 | `tests/modules/content/test_translation_group.py` | TranslationGroup CRUD, locale fallback |
| 后端 | `tests/modules/content/test_translation_service.py` | 创建翻译, 链接, 查询 |\n| 后端 | `tests/modules/content/test_locale_fallback_delivery.py` | Delivery API locale 参数 |
| 前端 | `apps/admin/test/` | Locale 选择器 UI 测试 |

---

## 5. 涉及文件清单

### 后端 (新建)

| 文件 | 说明 |
|------|------|
| `apps/api/src/models/content/translation_group.py` | TranslationGroup 模型 |
| `apps/api/src/modules/projects/content/locales/router.py` | Locale CRUD 路由 |
| `apps/api/src/modules/projects/content/locales/schema.py` | Locale Schema |
| `apps/api/src/modules/projects/content/locales/service.py` | Locale Service |
| `apps/api/src/modules/projects/content/locales/repository.py` | Locale Repository |
| `apps/api/src/modules/projects/content/items/translation_service.py` | Translation Service |
| `apps/api/src/modules/projects/content/items/translation_router.py` | Translation REST 端点 |

### 后端 (修改)

| 文件 | 变更 |
|------|------|
| `apps/api/src/models/content/content_item.py` | 新增 translation_group_id FK |
| `apps/api/src/modules/projects/content/items/canonical_service.py` | 翻译创建 + locale fallback |
| `apps/api/src/modules/projects/content/items/input_schema.py` | 新增 translation 字段 |
| `apps/api/src/modules/sites/runtime/repository.py` | DB 层 locale 过滤 |
| `apps/api/src/core/api_generator/content_api.py` | 废弃内存过滤 |
| `apps/api/src/modules/sites/content_api/entries_router.py` | locale fallback 链 |
| `apps/api/src/modules/sites/graphql/service.py` | GraphQL locale 参数 |
| `apps/api/src/modules/sites/graphql/schema.py` | locale 查询参数 |

### 前端 (新建)

| 文件 | 说明 |
|------|------|
| `apps/admin/src/pages/projects/content/library/components/content-translation-create-dialog.tsx` | 创建翻译对话框 |
| `apps/admin/src/pages/projects/content/library/components/content-translation-status-badge.tsx` | 翻译状态标记 |

### 前端 (修改)

| 文件 | 变更 |
|------|------|
| `apps/admin/src/pages/projects/settings/site/components/tabs/localization-settings-tab.tsx` | (复用，确认完整性) |
| `apps/admin/src/pages/projects/content/library/components/content-library-table-columns.tsx` | 新增翻译状态列 |
| `apps/admin/src/pages/projects/content/library/components/content-library-toolbar.tsx` | locale 筛选确认 |
| `apps/admin/src/pages/projects/content/library/article-editor/` | locale 切换器 |
| `locales/zh-CN/content.json` | i18n keys |
| `locales/en-US/content.json` | i18n keys |

---

## 6. 验收标准

1.  [x] 用户可管理项目可用 Locale 列表 (通过设置或独立 API)
2.  [x] 创建内容条目时自动创建 TranslationGroup
3.  [x] 可从已有条目创建其他 locale 的翻译
4.  [x] 内容库可按 locale 筛选 (SQL 层)
5.  [x] 内容库显示每个条目的翻译状态 (已翻译 locales 数)
6.  [x] Content Delivery API 支持 `?locale=` 参数，未找到时 fallback
7.  [x] GraphQL API 支持 `locale` 参数
8.  [x] 文章编辑器支持 locale 切换 (同 group 内切换)
9.  [x] TypeScript 类型检查通过
10. [x] 全部现有测试保持通过
11. [x] 新增测试覆盖 TranslationGroup CRUD + locale fallback

---

## 7. 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| DB migration 对现有 ContentItem 的影响 | 中 | 所有现有条目的 `translation_group_id` 允许为 null；提供回填脚本 |
| locale fallback 性能 | 低 | TranslationGroup + locale 复合索引确保查询走 index |
| 与现有发布流程的集成 | 中 | PublishedGraph 已有 locale 字段，发布时按 translation_group 处理 |

---

## 8. 估时

| Step | 估时 |
|------|------|
| Step 1-2: 数据模型 + Locale CRUD | 3 天 |
| Step 3-4: Translation Service | 3 天 |
| Step 5-7: DB filter + Delivery + GraphQL | 4 天 |
| Step 8: REST 端点 | 2 天 |
| Step 9-12: 前端 | 5 天 |
| Step 13: i18n 资源 | 1 天 |
| Step 14: 测试 | 3 天 |
| **总计** | **~4 周** |

---

## 9. Execution Log

### 2026-05-02

**Status**: verified

**Implementation Summary**

- Added `TranslationGroupRecord`, nullable `ContentItemRecord.translation_group`, migration `0002_auto_20260502_1453.py`, and repository/service methods for group creation, translation listing, and locale-specific lookup.
- Wired content item creation so new canonical items create a translation group automatically, translation creation reuses the source group, and duplicate locales return a conflict.
- Added translation response contracts, translation endpoints under project content items, translation status hydration on content item reads, and SQL-level locale filtering for content item lists.
- Added delivery and GraphQL `locale` support with fallback chain resolution across requested locale, fallback locale, default locale, and an available group peer.
- Added Admin content library translation status UI, create-translation dialog, row action, editor locale switcher, API wrappers, generated OpenAPI types, and productized i18n keys in `en-US` and `zh-CN`.
- Reused the existing project/site localization settings contract for locale management. Field-level JSONB localization remains the future optional path described by the architecture decision; this rollout ships the entry-level translation group contract.

**Files Changed**

- Backend model/migration: `apps/api/src/models/content/translation_group.py`, `apps/api/src/models/content/content_item.py`, `apps/api/src/migrations/0002_auto_20260502_1453.py`.
- Backend content services/routes/contracts: `apps/api/src/modules/projects/content/items/{canonical_service.py,domain_helpers.py,input_schema.py,read_service.py,repository.py,router.py}`, `apps/api/src/modules/projects/content/contracts/schema.py`, `apps/api/src/core/entity_manager/manager.py`.
- Delivery and GraphQL: `apps/api/src/core/api_generator/content_api.py`, `apps/api/src/modules/sites/content_api/entries_router.py`, `apps/api/src/modules/sites/graphql/{schema.py,service.py}`, `apps/api/src/modules/sites/graphql/artifacts/v1/{manifest.json,schema.graphql}`, `apps/api/src/modules/sites/runtime/repository.py`.
- Admin UI/API: `apps/admin/src/api/content.ts`, `apps/admin/src/types/api/content.ts`, `apps/admin/src/pages/projects/content/library/**`.
- Generated/API/i18n: `packages/openapi/src/admin-types.ts`, `packages/openapi/src/generated/{index.ts,sdk.gen.ts,types.gen.ts}`, `locales/en-US/content.json`, `locales/zh-CN/content.json`.
- Tests: `apps/api/tests/core/test_api_generator_content_api_unit.py`, `apps/api/tests/modules/sites/*`, `apps/api/tests/modules/workspaces/content/*`, `apps/admin/test/pages/workspaces/content/*`.

**Verification**

- `pnpm -C packages/openapi generate` — passed.
- `pnpm -C packages/openapi typecheck` — passed.
- `pnpm -C apps/admin typecheck` — passed.
- `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-table-columns.test.tsx test/pages/workspaces/content/content-library-editor-toolbar-ui.test.tsx` — 2 files / 9 tests passed.
- `pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-article-editor-page.test.tsx` — 1 file / 10 tests passed.
- `pnpm admin:check` — 232 files / 955 tests passed.
- `pnpm -C apps/api uv -- pytest -q tests/modules/workspaces/content/test_content_translations_unit.py tests/modules/sites/test_sites_content_api_unit.py` — 4 tests passed.
- `pnpm -C apps/api uv -- ruff check tests/modules/sites/test_sites_content_api_unit.py tests/modules/workspaces/content/test_content_translations_unit.py` — passed.
- `pnpm -C apps/api typecheck` — passed.
- `pnpm api:check` — 633 passed, 198 skipped, 26 warnings.
- `pnpm check` — Turbo 8/8 tasks successful; Admin test 232 files / 955 tests passed; API test 633 passed / 198 skipped.
- GitNexus `detect_changes(scope=all)` — 40 changed files, 142 changed symbols, 11 affected processes, risk level high. Impact is concentrated in the expected content library, article editor, content item read/write, delivery, and GraphQL flows.
