# Child Task Spec: Final Workspace-As-Site Cutover

## Goal

完成最后 hard cut：删除旧 `workspace = site` 的前端路由入口与后端公开 site identity 入口，让 admin 主要操作面稳定在 project routes，让公开 runtime/delivery 稳定在 runtime routes。

## Scope

- 移除 admin 旧 `/w/$workspaceId/*` 与 `/workspaces` file routes
- 把 content/assets/extensions/activity 等仍需页面复用的 project routes 指向已有 workspace 页面组件
- 移除后端旧 `/sites/{site_id}` runtime/delivery/preview route 注册
- 清理 stale route tree 与测试期望
- 运行最终 backend/admin/check 验证并更新 parent epic

## Non-Goals

- 不重写底层 content/storage 数据模型
- 不删除 workspace settings 与 workspace team API，它们仍服务 `/settings/workspace/*`
- 不删除 `apps/admin/src/pages/workspaces/**` 页面组件目录，本阶段只切外部路由语义
- 不处理生产数据迁移

## Constraints

- hard cut，不添加兼容 redirect 壳
- 复用已验证页面组件，减少最后阶段风险
- 后端测试使用 60 秒 timeout
- 不回滚任务外 dirty worktree

## Deliverables

- `apps/admin/src/routes/projects/$projectId/**` 覆盖 project 操作面
- `apps/admin/src/routes/w/**` 与 `apps/admin/src/routes/workspaces/**` 删除
- `apps/api/src/core/routes.py` 停止注册旧 site public routers
- tests and route assertions updated to project/runtime routes

## Done-When

- [ ] route tree 不再暴露 `/w/$workspaceId/*`
- [ ] admin 入口文案与路由使用 `/projects`
- [ ] public runtime/delivery tests 使用 `/runtimes/{runtime_id}`
- [ ] final verification evidence recorded

## Final Validation Command

```bash
pnpm check
```
