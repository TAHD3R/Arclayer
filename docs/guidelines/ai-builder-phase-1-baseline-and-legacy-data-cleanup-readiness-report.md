# 阶段 1：现状基线与旧数据清理准备报告

> 调查范围：AI 创建链路、Project Editor、Builder 初始化、旧 `site-builder` 路由、Content Library、Project Settings、Platform Console、测试、数据模型与迁移。
>
> 调查性质：只读基线。本文记录仓库当前事实，不构成新的实现合同；实现合同仍以 `docs/spec/**` 为准。

## 结论摘要

当前仓库同时存在两套 AI 建站执行路径：

1. `workspace.create_project` 直接创建 Project，并在同一请求内创建内容模型、Home 内容、Presentation、层级、`PUBLISHED` 版本和 Release。
2. Project Editor 已经使用 Builder projection、revision、ChangeSet、durable Generation/Saga，但 Sitemap 生成前又自行创建 Agent Thread 和 Agent Run。

Builder 的 canonical baseline 初始化能力已经存在，但当前 AI 创建链路没有调用它。结果是旧 Bootstrap 的内容状态与 `ContentStructureRevision`/`SiteRevisionManifest` 体系可能脱节；Editor 初始化或迁移状态仍会把用户送到旧的 `/content/site-builder` 管理页。

方向文档第 26 节要求的目标是单一链路：

```text
Workspace Thread brief → Coordinator Plan → 用户确认 → Build Run
  → Project/Site/Preview Environment/Builder baseline
  → /projects/{projectId}/editor
```

本阶段未修改产品行为、未删除数据、未提交代码。

## 1. 当前 AI 创建链路

入口与执行：

- API 全局 `/api/v1/chat` 前缀：`apps/api/src/core/routes.py:136`
- AI Router 挂载 Workspace Actions：`apps/api/src/modules/ai/router.py:19`
- Workspace Actions 路由前缀：`apps/api/src/modules/ai/workspace_actions.py:112`
- Planner 与 chat/clarification/tool 分流：`apps/api/src/modules/ai/workspace_actions.py:658-695`
- Plan 模式只读限制：`apps/api/src/modules/ai/workspace_actions.py:697-704`
- `create_project` 分支：`apps/api/src/modules/ai/workspace_actions.py:710-745`

当前真实调用顺序：

```text
POST /api/v1/chat/workspace-actions
  → WorkspaceActionPlanner.plan()
  → workspace.create_project
  → ProjectService.create_project()
  → ProjectSettingsService.patch_core()
  → _bootstrap_created_project_content()
  → ProjectSourceService.get_source_manifest()
```

旧 Bootstrap 的写入事实：

- 获取 Runtime 和 production Environment：`apps/api/src/modules/ai/workspace_actions.py:1413-1423`
- 创建 `page` 模型：`apps/api/src/modules/ai/workspace_actions.py:1424-1434`
- 创建 `reusableBlock` 模型：`apps/api/src/modules/ai/workspace_actions.py:1435-1441`
- 创建 Home 内容项和草稿：`apps/api/src/modules/ai/workspace_actions.py:1442-1472`
- 写入旧 site-builder presentations、Bootstrap Shape、approved workflow 和 hierarchy root：`apps/api/src/modules/ai/workspace_actions.py:1461-1512`
- 直接将版本切到 `ContentVersionState.PUBLISHED`：`apps/api/src/modules/ai/workspace_actions.py:1513-1523`
- 直接发布 Release：`apps/api/src/modules/ai/workspace_actions.py:1524-1528`

没有发现该链路调用 Builder 初始化，也没有发现它创建或绑定 `ContentStructureRevision`、`SiteRevisionManifest`、`SiteRevisionStatus` 或 exact Design System assignment/version。

## 2. Builder canonical 路径

Builder Router 已由 Projects Router 挂载：

- import：`apps/api/src/modules/projects/router.py:23`
- include：`apps/api/src/modules/projects/router.py:68`
- prefix `/projects/{project_id}/builder`：`apps/api/src/modules/projects/builder/router.py:79-82`

关键端点：

- projection/revision/render document：`apps/api/src/modules/projects/builder/router.py:208-287`
- baseline initialization：`apps/api/src/modules/projects/builder/router.py:290-316`
- ChangeSet preview/apply：`apps/api/src/modules/projects/builder/router.py:319-376`
- composition saga：`apps/api/src/modules/projects/builder/router.py:379-496`
- durable generation/recovery/cancel：`apps/api/src/modules/projects/builder/router.py:497-622`

初始化 Service：

- idempotency、request fingerprint、Project lock、replay：`apps/api/src/modules/projects/builder/service.py:302-338`
- Builder authority、Site、Environment、重复初始化校验：`apps/api/src/modules/projects/builder/service.py:338-362`
- exact Design System resolution：`apps/api/src/modules/projects/builder/service.py:363-370`
- root baseline creation：`apps/api/src/modules/projects/builder/service.py:371-396`

Baseline 写入内容：

- structure snapshot 和 hash：`apps/api/src/modules/projects/builder/initialization.py:77-126`
- `content_structure_revisions`：`apps/api/src/modules/projects/builder/initialization.py:128-148`
- manifest（含 Design System id/version/checksum）：`apps/api/src/modules/projects/builder/initialization.py:149-169`
- `site_revision_manifests`：`apps/api/src/modules/projects/builder/initialization.py:170-198`
- 初始 `site_revision_statuses`：`apps/api/src/modules/projects/builder/initialization.py:199-227`
- 审计事件 `project.builder.initialized`：`apps/api/src/modules/projects/builder/initialization.py:263-290`

Projection 会返回 `initialization_required` 和 blockers：

- `apps/api/src/modules/projects/builder/projection.py:77-91`
- `apps/api/src/modules/projects/builder/projection.py:394-421`

## 3. Editor 与旧入口

唯一目标 Editor 路由已经存在：

- Route：`apps/app/src/routes/projects/$projectId/editor/index.tsx:5-8`
- Lazy route：`apps/app/src/routes/projects/$projectId/editor/index.lazy.tsx:6-23`
- 页面：`apps/app/src/pages/projects/editor/page.tsx:38-46`

Editor 已分配 fullscreen Creation scene：

- Scene registry：`apps/app/src/lib/routing/scene-registry.ts:16-30`
- route predicate：`apps/app/src/lib/routing/route-identity.ts:37-39`
- layout：`apps/app/src/layouts/creation-layout.tsx:3-5`

仍存在的旧分支：

- `openBuilderManagement()` 指向旧路径：`apps/app/src/pages/projects/editor/page.tsx:98-100`
- migration/non-builder boundary 指向旧路径：`apps/app/src/pages/projects/editor/page.tsx:120-134`
- initialization boundary 指向旧路径：`apps/app/src/pages/projects/editor/page.tsx:135-145`

旧路由和旧页面：

- route source：`apps/app/src/routes/projects/$projectId/content/site-builder/index.tsx:3-5`
- lazy route：`apps/app/src/routes/projects/$projectId/content/site-builder/index.lazy.tsx:3-11`
- Admin 风格旧页面：`apps/app/src/pages/projects/content/site-builder/page.tsx:45-61`
- route transition 仍为旧页面保留 skeleton 分支：`apps/app/src/components/layout/route-transition.tsx:66-78`
- Content Library item resolver 仍 import 旧页面：`apps/app/src/pages/projects/content/library/item-resolver/page.tsx:30`

`routeTree.gen.ts` 仍包含旧路由；清理时应修改源路由后重新生成，不能手工编辑生成文件。

## 4. 新旧路径、重复模型与风险

| 领域 | 当前路径 | 目标路径 | 风险 |
| --- | --- | --- | --- |
| AI 创建 | `workspace.create_project` 直接写 Project/Content/Release | Plan 后由 Build Run 写入 | Plan 阶段已发生建站副作用 |
| 初始化 | `_bootstrap_created_project_content()` | Builder baseline initialization | 内容版本和 Builder revision 可能不一致 |
| 发布 | Bootstrap 直接 `PUBLISHED`/Release | 可编辑 draft + Preview，发布独立 | 违反“不自动发布” |
| AI Run | Editor 自建 Thread/Run | Coordinator 维护 Workspace Thread/Build Run | Run、审计、恢复状态重复 |
| Builder 执行 | Generation、ChangeSet、Composition Saga 并存 | 统一 Build Run + Typed Tool | 多状态机可能脱节 |
| 权限 | `project:content:site-builder:write` | Editor/Build 专属合同 | 旧权限名称继续泄漏 |
| 失败边界 | Editor 缺 baseline 时进入旧管理页 | Editor 呈现真实初始化/失败/恢复状态 | 用户进入错误产品入口 |

## 5. 内容库、模型与项目设置

Content Library：

- route：`apps/app/src/routes/projects/$projectId/content/library/index.tsx:14-33`
- page：`apps/app/src/pages/projects/content/library/page.tsx`
- Admin 壳与 Data Table：`apps/app/src/pages/projects/content/library/page.tsx:23-24`
- 真实内容 API：`apps/app/src/api/content.ts`

Content Models：

- route：`apps/app/src/routes/projects/$projectId/content/models/index.tsx:3-5`
- Admin `DefaultPage`：`apps/app/src/pages/projects/content/models/page.tsx:18-20`
- 管理权限：`apps/app/src/pages/projects/content/models/page.tsx:68-74`
- 仍保留 `site_builder` category：`apps/app/src/pages/projects/content/models/components/content-models-toolbar.tsx:76`、`apps/app/src/pages/projects/content/models/utils.ts:212,334,346,395`

Project Settings 当前仍集中展示 General、Guidance、API、Environments、Databases：

- tab/route contract：`apps/app/src/pages/projects/settings/project/page.tsx:34-55`
- environments/databases 导航项：`apps/app/src/pages/projects/settings/project/page.tsx:92-105`

后续需要把 Project General、Website Config、Preview/Production 和开发者设置按 spec 收敛为 typed facades；阶段 1 不修改这些行为。

## 6. Platform Console

Platform 是独立应用：

- app/router/auth composition：`apps/platform/src/app.tsx:5-22`
- capability targets：`apps/platform/src/capabilities/module-registry.ts:33-72`
- `/projects` 为 TenantProjectsPage：`apps/platform/src/routes/_authenticated/projects.tsx:14-44`

当前 Platform 导航覆盖 Workspace/Tenant、AI services、Hosting/Site Delivery、Access/Security、Communications、Extensions、Billing、Monitoring/Audit。未发现其 import Product Application source 或持有 Product Editor/Content route ownership。后续应继续保持 Platform 只负责部署级管理，Product Application 只保留 eligibility/入口。

## 7. 数据表与迁移

核心 Builder 模型：

- `content_structure_revisions`：`apps/api/src/models/builder/content_structure.py:13-38`
- `site_revision_manifests`、`site_revision_statuses`、`builder_initialization_commands`：`apps/api/src/models/builder/site_revision.py:14-105`
- `builder_change_sets`、commands、approvals：`apps/api/src/models/builder/change_set.py:19-129`

AI Runtime 表定义于 `apps/api/src/models/agents/runtime_v1.py:41-256`，包括 `ai_threads`、`ai_runs`、`ai_messages`、`ai_message_parts`、`ai_run_events`、`ai_approvals`、`ai_tool_responses`。

Builder Generation/Saga/Snapshot：

- `builder_generations`、`ai_run_builder_snapshots`：`apps/api/src/migrations/0047_auto_20260721_0158.py:17-75`
- `builder_composition_sagas`：`apps/api/src/migrations/0055_auto_20260722_1317.py:17-74`

Tenant-owned 表清单：`apps/api/src/migrations/models/tenant_control.py:13-67`。

Tenant migration readiness：

- v17 foundation：`apps/api/src/migrations/models/tenant_control.py:551-563`
- v18/v19 ChangeSet preview/approval：`apps/api/src/migrations/models/tenant_control.py:564-579`
- v20 generation：`apps/api/src/migrations/models/tenant_control.py:580-584`
- v24-v28 agent context、typed targets、composition/design context：`apps/api/src/migrations/models/tenant_control.py:668-827`

当前 public migration 文件最高为 `0138_platform_language_catalog_revisions.py`。

## 8. 测试基线

API 测试仍锁定旧语义：

- `create_project` 响应和旧 Bootstrap：`apps/api/tests/modules/ai/test_workspace_actions_unit.py:1320-1328`
- Bootstrap 验证两个模型、Home、presentations、approved、published、release：`apps/api/tests/modules/ai/test_workspace_actions_unit.py:1510-1582`

Editor 测试仍锁定旧路径和重复 Run：

- 初始化 boundary 点击后导航 `/content/site-builder`：`apps/app/test/pages/projects/project-editor-page.test.tsx:3463-3481`
- Sitemap 生成前创建 Thread、Run，再调用 Builder generation：`apps/app/test/pages/projects/project-editor-page.test.tsx:3484-3519`

旧页面/resolver 测试包括：

- `apps/app/test/pages/workspaces/content/content-site-builder-shell.test.tsx`
- `apps/app/test/pages/workspaces/content/content-surface-routing.test.tsx`
- `apps/app/test/pages/workspaces/content/content-library-resolver-route.test.tsx`
- `apps/app/test/lib/project-boundary-contract.test.ts`
- `apps/app/test/lib/i18n/content-library-site-builder-copy.test.ts`

本阶段未运行 Playwright，因此未读取本地管理员凭据文件。

## 9. 旧入口与旧数据清理边界

方向文档已明确采用硬切：不迁移旧项目和旧数据，不允许新流程继续写入旧路径；删除前必须完成备份/导出和用户提示。

清理范围应按项目/Workspace/Environment 精确限定，至少盘点：

1. 旧 Project、Runtime、Site、Environment、Project Settings、Domain/Deployment 关联；
2. Tenant Content Model、Content Item、Content Version、Presentation、Route、Hierarchy、Release/Publish artifact；
3. Builder `content_structure_revisions`、`site_revision_manifests`、`site_revision_statuses`、initialization commands、ChangeSets、approvals、generations、composition sagas；
4. AI `ai_threads`、`ai_runs`、messages/events/tool responses、Builder snapshots，以及关联 background jobs/recovery/effects；
5. 仅属于旧项目的 Design System assignment/version 和验证状态。

不能在阶段 1 直接删表或清空整个 Tenant schema。需要先完成 FK/依赖顺序、活动 Run/Job 终止策略、审计保留、备份导出和清理结果记录。

## 10. 开发/测试环境清理前置条件

必须同时满足：

1. Coordinator Plan/Build 最小真实主链路已稳定；
2. public migrations 达到当前分支版本；
3. 所有目标 Tenant schema 完成 v17-v28 相关迁移；
4. 暂停写入并处理活动 AI Run、Builder Generation、Composition Saga 和后台 Job；
5. 完成旧项目范围的备份/导出、用户提示和计数快照；
6. 确认 public/tenant schema、tenant context、isolation mode 与事务边界；
7. 清理后验证 FK、表计数、审计记录和新链路刷新恢复结果。

推荐顺序：

```text
暂停写入/后台消费
  → 处理活动 Run/Job/Generation/Saga
  → 导出旧 Project 范围
  → 清理 Builder/AI 执行状态
  → 清理 tenant Content/Design System 数据
  → 清理 Project/Site/Runtime/Environment
  → 校验迁移、FK、计数和审计
```

## 11. 阶段 2/3 依赖

阶段 2 依赖：

- Workspace Thread brief → Coordinator Plan 的真实持久化 API；
- Plan 阶段零 Project/Site/Environment/Content Model 副作用；
- 用户确认后的 Build Run、Typed Tool、ChangeSet、idempotency、ETag/provenance；
- Build Run 调用 Builder baseline 初始化并返回真实 project/site/status；
- Editor 不再自行创建重复 Thread/Run，也不再跳转旧 `site-builder`。

阶段 3 依赖：

- canonical Page/Reusable Section/Article 内容模型合同；
- ContentStructureRevision/SiteRevisionManifest 与 Content Library 的一致投影；
- typed Content/Route/Hierarchy/Presentation ChangeSet；
- Preview 与 Publish 分离，刷新后恢复相同 revision；
- 替换 Content Library item resolver 后，才能移除旧 `site-builder` 源路由和页面。

## 12. 验证与本阶段状态

- `git diff --check`：通过。
- `npx gitnexus status`：索引针对当前 commit `9667a95`，状态 `up-to-date`。
- 未修改函数、类或方法，因此没有触发修改前 impact gate。
- 未提交代码，未运行 `gitnexus_detect_changes()`。
- 未运行静态检查、焦点测试或 Playwright；本阶段没有产品行为变更。

### 未完成项与真实阻塞

阶段 2/3 仍依赖 Coordinator/Build API 合同、清理脚本与备份策略、Tenant schema readiness 核验，以及旧 resolver 的替换方案。当前不能用兼容层、假实现或直接删除数据绕过这些依赖。
