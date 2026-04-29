# content models fields editor

## Goal

为 `/projects/$projectId/content/models` 的内容类型编辑侧屏补齐首轮 Fields 编辑能力：当模型还没有字段时，展示产品化空状态并引导创建第一个字段；创建字段时使用两步 dialog 流程，先选字段类型，再填写字段定义；创建后在同一编辑侧屏内使用 `DefaultPage` + 轻量 data-table 管理字段列表，支持 DnD 排序、删除、基础 actions，并保持中英双语与现有 page shell 视觉语言一致。

## What I already know

* 当前 `/content/models` 已有模型列表、复制、删除和一个空白的 `ContentModelEditScreen`。
* 当前后端公开 field scalar 合同只有 `text / long_text / number / boolean / date_time / json`，relation 走单独 `relations` 合同。
* `ContentModelFieldRecord` 与 `ContentModelRelationRecord` 都已有 `sort_order` 字段；当前 router 只有 `fields/reorder`，没有 relation reorder。
* 仓库里有旧的 `page.tsx.bak` 字段编辑原型，已经覆盖 `add/update/delete/reorder field` 和 `json preview` 的基础数据流。
* `docs/plans/AUDIT_REPORT.md` 明确记录了 Strapi 与当前能力差距：字段类型数量是关键缺口，当前 6 种，推荐方向包括 rich text、number 子类型、media、relation 增强等。
* 用户本轮明确给出的产品字段目录是：
  - Rich text
  - Short text
  - Number
  - Date & time
  - Media
  - Boolean
  - JSON object
  - Reference
* 用户明确要求：
  - 编辑侧屏 header 排列：`content model name -> copy ID button -> gap -> menu button -> divider -> close button`
  - 空状态用 `ContentGuard`
  - 字段类型选择 dialog 样式参考 project-card
  - 创建字段的第二步 dialog 按字段类型展示差异化配置项
  - 创建第一个字段后，content 区使用 `DefaultPage`，标题为 `Fields`
  - data-table 需要 `Name / Field Type / Localization / Actions` columns
  - table 支持 DnD
  - `Edit` action 本轮先占位，不实现 field 编辑
  - menu action 本轮只做 `Delete`

## Assumptions (temporary)

* 本轮聚焦“模型定义层”的 fields 编辑，不扩展内容项 runtime、GraphQL、发布态解析等下游消费链。
* 本轮只落地用户点名的 8 类字段产品类型，不一次性追平 Strapi 30+ 类型。
* `Reference` 作为用户可见字段类型，需要和普通 fields 一起出现在同一管理 table 中。
* localization 列本轮先提供稳定占位值与结构，为未来 localizable contract 预留。

## Open Questions

* 无阻塞问题。按当前信息可直接进入实现。

## Requirements (evolving)

* 重构 `ContentModelEditScreen`，让内容模型进入真实 fields 管理流程。
* 当模型无字段时，在 content 区显示 `ContentGuard` 空状态：
  - `Start Building Your Content Model / 开始构建内容模型`
  - 描述文案使用用户提供的双语 copy
  - CTA 为 `+ Add First Field / 添加第一个字段`
* 点击空状态 CTA 或 table 下方 add-field 入口后，进入两步 add-field 流程：
  - 第一步：字段类型选择 dialog，视觉参考 project-card
  - 第二步：字段定义 dialog，按不同类型展示不同配置
* 首轮字段类型目录覆盖：
  - Rich text
  - Short text
  - Number（Integer / Decimal 子型）
  - Date & time
  - Media（One file / Many files 子型）
  - Boolean
  - JSON object
  - Reference（One reference / Many references 子型）
* 第二步 dialog 底部统一提供：
  - `Change field type`
  - `Add and configure`
* 创建字段后，在 edit screen content 区显示 `DefaultPage` 风格的 Fields 管理面。
* Fields table 要求：
  - 轻量 data-table 外观，对齐截图
  - 列：`Name / Field Type / Localization / Actions`
  - 支持 DnD 排序
  - 每行 actions：`Edit` 按钮、menu button
  - menu 本轮只提供 `Delete`
* i18n：
  - 所有新增文案同步写入 `locales/en-US/content.json` 和 `locales/zh-CN/content.json`
* 合同层：
  - 补齐当前模型定义层对首轮字段目录所需的表达能力
  - 保持现有 content model create/list/duplicate/delete 流程稳定

## Acceptance Criteria (evolving)

* [ ] 打开内容模型编辑侧屏时，header 排列与用户要求一致。
* [ ] 无字段模型会显示产品化空状态，并能从 CTA 进入 add-field 流程。
* [ ] 字段类型选择 dialog 展示首轮 8 类字段类型，并使用卡片式选择布局。
* [ ] 每种字段类型都能进入对应的第二步配置 dialog，底部有 `Change field type` 与 `Add and configure`。
* [ ] 成功创建字段后，编辑侧屏切换为 `Fields` 管理面，并显示字段 table。
* [ ] 字段 table 支持排序拖拽与删除动作。
* [ ] 相关 admin 测试新增或更新，至少覆盖空状态、类型选择、字段创建与 table 呈现关键路径。
* [ ] 相关 API / contract 测试新增或更新，覆盖首轮字段定义的最小必要合同。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI-relevant focused checks green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 编辑已有 field 的完整表单能力
* 动态区域、组件嵌套、自定义字段、枚举、邮箱、密码、UID 等未在本轮图例中的字段类型
* 内容项 runtime、GraphQL、发布态和 portal 对新字段类型的完整消费语义
* relation polymorphic 扩展

## Research References

* [`research/field-type-gap.md`](research/field-type-gap.md) — 当前合同、旧原型与 Strapi 审计差距的收敛记录

## Technical Notes

* 重点前端文件：
  - `apps/admin/src/pages/projects/content/models/page.tsx`
  - `apps/admin/src/pages/projects/content/models/components/content-model-edit-screen.tsx`
  - `apps/admin/src/pages/projects/content/models/page.tsx.bak`
  - `apps/admin/src/api/content.ts`
* 重点后端文件：
  - `apps/api/src/modules/projects/content/contracts/schema.py`
  - `apps/api/src/modules/projects/content/models/router.py`
  - `apps/api/src/modules/projects/content/models/canonical_service.py`
  - `apps/api/src/models/content/_enums.py`
  - `apps/api/src/models/content/model_field.py`
  - `apps/api/src/models/content/model_relation.py`
* 设计与实现规范：
  - `DESIGN.md`
  - `docs/guidelines/frontend-design.md`
  - `.agents/skills/frontend-ui-engineering/SKILL.md`
