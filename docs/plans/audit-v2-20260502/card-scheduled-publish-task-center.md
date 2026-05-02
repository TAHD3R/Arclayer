# Plan: 定时发布 + 平台任务中心

> **审计来源**: `docs/plans/audit-v2-20260502/AUDIT_REPORT.md` §5 (AUDIT-05)
> **创建日期**: 2026-05-02 | **优先级**: P1 | **估时**: 2-3 周
> **依赖**: Taskiq 基础设施已就位 (无需前置)

---

## 1. 问题定义

Arclayer 发布流程仅支持手动即时发布 (`POST /publish` → `activated_at` 即刻设置)。无定时调度能力。`ContentReleaseRecord` 无 `scheduled_at` 字段。Taskiq 基础设施已就位但未用于发布调度。前端 `/system/jobs` 导航已定义但路由和页面均为空。

**验收目标**: 发布支持 `scheduled_at` 定时执行 + Taskiq scheduler 自动触发 + 发布作业状态追踪 + 前端 "平台 → 任务中心" 页面。

---

## 2. 现状分析

### 2.1 已具备的能力

| 组件 | 文件 | 说明 |
|------|------|------|
| 即时发布 | `modules/projects/releases/` + `publish/` | 完全可运行 |
| Taskiq 基础设施 | `platform/jobs/taskiq_app.py` | RedisStreamBroker + TaskiqScheduler |
| Taskiq 已有任务 | `platform/jobs/tasks.py` | 缩略图生成 + 审计日志保留清理 |
| `ContentVersionState.SCHEDULED` | `models/content/_enums.py:109` | 内容版本已存在 "scheduled" 状态 |
| 版本调度端点 | `content/items/router.py:679-718` | `POST /items/{id}/versions/{num}/schedule` |
| 导航定义 | `constants/menu/global.ts:74-80` | `"global.platform.jobs"` → `/system/jobs` |
| turbo 任务定义 | `turbo.json` | `jobs:worker` + `jobs:scheduler` |

### 2.2 缺失

1.  `ContentReleaseRecord` 无 `scheduled_at` 字段
2.  无定时发布 Taskiq 任务
3.  无发布作业追踪模型/API
4.  前端 `/system/jobs` 路由不存在
5.  前端 `SystemSettingsShell` 无 "jobs" 标签
6.  项目导航中发布入口已注释

---

## 3. 架构设计

### 3.1 定时发布流程

```
用户创建 Release + 设置 scheduled_at
  → ContentReleaseRecord(scheduled_at=T, status="scheduled")
  → Taskiq scheduler 每分钟检查
  → 到达 T 时间 → enqueue publish task
  → PublishJobRecord(status="running") 追踪进度
  → 调用 ProjectReleasesService.publish_release()
  → 成功 → PublishJobRecord(status="completed", completed_at=now)
  → 失败 → PublishJobRecord(status="failed", error=msg)
  → 发送通知 (应用内通知 + webhook)
```

### 3.2 数据模型

**新建** — `PublishJobRecord`:

```python
class PublishJobRecord(Model):
    id = fields.UUIDField(pk=True)
    workspace_id = fields.UUIDField()
    project_id = fields.UUIDField()
    release_id = fields.UUIDField(null=True)  # FK to ContentReleaseRecord
    job_type = fields.CharField(max_length=32)  # "scheduled_publish" | "manual_publish" | "rollback" (reserved)
    status = fields.CharField(max_length=16)  # "pending" | "running" | "completed" | "failed" | "cancelled"
    scheduled_at = fields.DatetimeField(null=True)
    started_at = fields.DatetimeField(null=True)
    completed_at = fields.DatetimeField(null=True)
    error_message = fields.TextField(null=True)
    created_by_user_id = fields.UUIDField()
    created_at = fields.DatetimeField(auto_now_add=True)
```

**修改** — `ContentReleaseRecord`:
- 新增 `scheduled_at: fields.DatetimeField(null=True)`
- 新增 `status: fields.CharField(max_length=16, default="active")`  # "active" | "scheduled" | "published"

---

## 4. 实现步骤

### Step 1: 数据模型

**修改** — `apps/api/src/models/content/release.py`:
- `ContentReleaseRecord`: 新增 `scheduled_at`, `status`

**新建** — `apps/api/src/models/content/publish_job.py`:
- `PublishJobRecord` 模型

**数据库迁移**: `pnpm --filter @arclayer/api db:migrate`

### Step 2: 定时发布 Taskiq 任务

**新建** — `apps/api/src/platform/jobs/scheduled_publish.py`:

```python
@taskiq_app.task()
async def task_check_scheduled_publishes():
    """每分钟检查是否有到达预定时间的发布"""
    # 查询 status="scheduled" AND scheduled_at <= now()
    # 对每个: enqueue task_execute_scheduled_publish(release_id)

@taskiq_app.task()
async def task_execute_scheduled_publish(release_id: str):
    """执行单个定时发布"""
    # 创建 PublishJobRecord(status="running")
    # 调用 ProjectReleasesService.publish_release()
    # 更新 PublishJobRecord(status="completed"|"failed")
    # 发送通知
```

**修改** — `apps/api/src/platform/jobs/taskiq_app.py`:
- 注册 `task_check_scheduled_publishes` 为 cron 任务 (每分钟)

### Step 3: Release Service 扩展

**修改** — `apps/api/src/modules/projects/releases/service.py`:
- `publish_release()`: 支持 `scheduled_at` 参数
  - 如果 `scheduled_at` 为 None → 即时发布 (现有行为)
  - 如果 `scheduled_at` 在未来 → 设置 status="scheduled"，不立即执行
- 新增 `cancel_scheduled_publish(release_id)`: 取消定时发布
- 新增 `get_publish_jobs(release_id)`: 获取发布作业历史

### Step 4: Publish Job Service + API

**新建** — `apps/api/src/modules/projects/publish/jobs/service.py`:
- `PublishJobService`: CRUD + 状态追踪

**新建** — `apps/api/src/modules/system/jobs/`:
- `router.py`: `GET /api/v1/system/jobs` (超级管理员) — 列表/筛选
- `schema.py`: `PublishJobOut`, `PublishJobListQuery`
- `service.py`: `SystemJobsService`

### Step 5: 通知集成

**修改** — `apps/api/src/platform/jobs/scheduled_publish.py`:
- 发布成功 → 应用内通知 (`notifications/` 模块)
- 发布失败 → 通知 + webhook
- 使用已有的 `system/admin/notifications/` 基础设施

### Step 6: 前端 — 任务中心页面

**新建** — `apps/admin/src/pages/system/jobs/`:
- `page.tsx`: 作业列表 (数据表格)
- `components/jobs-table.tsx`: TanStack Table (ID / 类型 / 状态 / 项目 / 预定时间 / 执行时间 / 操作)
- `components/job-detail-dialog.tsx`: 作业详情 (状态 + 错误信息)
- `components/job-status-badge.tsx`: 状态标记 (pending/running/completed/failed/cancelled)

### Step 7: 前端 — 路由 + 导航

**新建** — `apps/admin/src/routes/system/jobs/index.tsx`:
- 路由 `/system/jobs`

**修改** — `apps/admin/src/pages/system/system-settings-shell.tsx`:
- `ChromeTabs` 新增 "任务中心" (jobs) 标签

**修改** — `apps/admin/src/constants/menu/global.ts`:
- `"global.platform.jobs"` → 设置 `disabled: false`

### Step 8: 前端 — 发布页面恢复

**修改** — `apps/admin/src/constants/menu/project.ts`:
- `"content.releases"` → 取消注释

### Step 9: 前端 — 发布时间选择器

**修改** — `apps/admin/src/pages/projects/content/releases/`:
- 发布创建表单新增 `scheduled_at` 日期时间选择器
- "立即发布" / "定时发布" 切换

### Step 10: i18n

**修改** — `locales/zh-CN/` + `locales/en-US/`:
- 新增 `jobs` 命名空间
- 新增 key: `PLATFORM_JOBS_*`, `SCHEDULED_PUBLISH_*`, `JOB_STATUS_*`

### Step 11: 测试

| 测试文件 | 覆盖 |
|---------|------|
| `tests/modules/projects/test_scheduled_publish.py` | 定时发布创建/取消/执行 |
| `tests/platform/jobs/test_scheduled_publish_task.py` | Taskiq 任务 mock |
| `tests/modules/system/test_jobs_api.py` | 作业列表 API |
| 前端 | 作业列表渲染 + 定时选择器 UI |

---

## 5. 涉及文件清单

### 后端 (新建)

| 文件 | 说明 |
|------|------|
| `apps/api/src/models/content/publish_job.py` | PublishJobRecord 模型 |
| `apps/api/src/platform/jobs/scheduled_publish.py` | 定时发布 Taskiq 任务 |
| `apps/api/src/modules/projects/publish/jobs/service.py` | PublishJobService |
| `apps/api/src/modules/system/jobs/router.py` | 系统作业列表 API |
| `apps/api/src/modules/system/jobs/schema.py` | 作业 Schema |
| `apps/api/src/modules/system/jobs/service.py` | SystemJobsService |

### 后端 (修改)

| 文件 | 变更 |
|------|------|
| `apps/api/src/models/content/release.py` | 新增 scheduled_at + status |
| `apps/api/src/modules/projects/releases/service.py` | 支持定时发布 |
| `apps/api/src/platform/jobs/taskiq_app.py` | 注册 cron 任务 |
| `apps/api/src/modules/system/router.py` | 注册 jobs 子路由 |

### 前端 (新建)

| 文件 | 说明 |
|------|------|
| `apps/admin/src/pages/system/jobs/page.tsx` | 任务中心页面 |
| `apps/admin/src/pages/system/jobs/components/jobs-table.tsx` | 作业表格 |
| `apps/admin/src/pages/system/jobs/components/job-detail-dialog.tsx` | 作业详情 |
| `apps/admin/src/pages/system/jobs/components/job-status-badge.tsx` | 状态标记 |
| `apps/admin/src/routes/system/jobs/index.tsx` | 路由定义 |

### 前端 (修改)

| 文件 | 变更 |
|------|------|
| `apps/admin/src/pages/system/system-settings-shell.tsx` | 新增 "任务中心" 标签 |
| `apps/admin/src/constants/menu/global.ts` | 启用 jobs 导航 |
| `apps/admin/src/constants/menu/project.ts` | 取消 releases 注释 |
| `apps/admin/src/pages/projects/content/releases/` | 定时选择器 |
| `locales/zh-CN/` + `locales/en-US/` | 新增 jobs 命名空间 |

---

## 6. 验收标准

1.  [x] Release 创建支持设置 `scheduled_at` 定时
2.  [x] Taskiq scheduler 每分钟检查并在到达时间时自动执行发布
3.  [x] 发布作业全程状态追踪 (pending → running → completed/failed)
4.  [x] 失败作业记录错误信息，可手动重试
5.  [x] 定时发布可在执行前取消
6.  [x] "平台 → 任务中心" 页面可用 (仅超级管理员)
7.  [x] 任务中心列表支持按状态/类型筛选
8.  [x] 发布成功/失败触发应用内通知
9.  [x] 现有即时发布行为不变
10. [x] 现有测试全部通过

---

## 7. 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| Taskiq cron 分钟级精度不够 | 低 | 当前场景分钟级精度可接受；如需要秒级，改用 Redis 延迟队列 |
| 定时发布与手动发布并发冲突 | 中 | 发布前检查 release status，已发布的 release 跳过 |
| 前端任务中心数据量大 | 低 | 分页 + 索引；定期清理已完成作业 |

---

## 8. 估时

| Step | 估时 |
|------|------|
| Step 1-2: 数据模型 + Taskiq 任务 | 2.5 天 |
| Step 3-5: Service 扩展 + API + 通知 | 2.5 天 |
| Step 6-9: 前端 (任务中心 + 发布时间选择器) | 4 天 |
| Step 10: i18n | 0.5 天 |
| Step 11: 测试 | 2 天 |
| **总计** | **~2.5 周** |

---

## 9. Execution Log

### 2026-05-02

- Implemented scheduled release publishing through `ReleasePublishIn.scheduled_at`, `ContentReleaseRecord.status/scheduled_at`, and `PublishJobRecord` tracking.
- Added `PublishJobService`, Taskiq scheduled publish tasks, system jobs API, super-admin `/system/jobs` Admin page, job filters, and failed-job retry.
- Added release-center scheduling controls, cancel-schedule action, project releases navigation, platform jobs navigation, i18n copy, and regenerated OpenAPI/TanStack route outputs.
- Added public migration artifacts and tenant-control migration version 6 so existing workspace tenant schemas receive release scheduling columns.
- Added integration coverage for scheduled publish create/cancel/execute/notification, system jobs filtering, and tenant schema release columns; updated Admin navigation and release center tests.
- GitNexus impact analysis: `TenantMigrationRunner` upstream impact was MEDIUM; direct dependents are tenancy registry/migration tests and workspace tenant context creation.
- Verification:
  - `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -vv tests/modules/workspaces/publish/test_scheduled_publish_integration.py tests/modules/system/test_system_jobs_integration.py tests/modules/tenancy/test_tenant_registry_integration.py::test_workspace_tenant_context_creates_ready_schema` — passed, 4 tests.
  - `pnpm -C apps/admin typecheck` — passed.
  - `pnpm -C apps/admin test -- --run test/pages/workspaces/content/content-release-center-page.test.tsx test/layouts/sidebar-route-state.test.tsx test/lib/project-scene-nav.test.ts test/lib/workspace-nav-regression.test.tsx test/lib/admin-topbar-breadcrumbs.test.ts` — passed, 232 files / 955 tests because the project script ran the full Admin Vitest suite.
  - Final gate: `pnpm check` — passed.
  - GitNexus change detection before commit — completed for the task-owned diff.
- Reproduced `pnpm --filter @arclayer/api db:upgrade` failure from the old generated/hand-edited migration chain: `0002_auto_20260502_1453` attempted to create an index on `translation_group_id` before adding the column.
- Removed the invalid migration chain (`0002_auto_20260502_1453`, `0003_auto_20260502_1703`, and untracked `0004/0005` intermediates) and regenerated a single command-produced migration, `0002_auto_20260502_1844.py`, from the final model state.
- Aligned source state by making `TranslationGroupRecord.primary_item_id` an explicit UUID field and removing the problematic `ContentItemRecord.Meta.indexes` declaration that caused Tortoise to emit invalid operation ordering.
- Verification: `pnpm --filter @arclayer/api db:upgrade` exited 0 with `No migrations to apply`; `pnpm -C apps/api typecheck` exited 0; `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -vv tests/modules/workspaces/content/test_content_models_unit.py tests/modules/workspaces/publish/test_scheduled_publish_integration.py tests/modules/system/test_system_jobs_integration.py tests/modules/tenancy/test_tenant_registry_integration.py::test_workspace_tenant_context_creates_ready_schema` passed 45 tests.
