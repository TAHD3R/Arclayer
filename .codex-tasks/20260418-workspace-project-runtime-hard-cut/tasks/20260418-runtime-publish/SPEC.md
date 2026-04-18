# Child Task Spec: Runtime Publish And Delivery Cutover

## Goal

把当前 project facade 背后的 `workspace/site` 发布链正式切到 `runtime` 边界，使项目级发布、preview、delivery、runtime 配置读取都先解析 `primary runtime`，再由 runtime-owned 服务对接底层存量 `site` 数据。

## Scope

- 新增 runtime 请求上下文与 runtime service/repository 边界
- 新增 runtime-scoped preview/runtime/delivery 正式路由
- 让 project facade 的 preview token、api keys、releases、publish impact、preview contract 改走 runtime context
- 补齐 runtime contract schema 与 targeted backend tests
- 每个阶段通过验证后更新 taskmaster 账本

## Non-Goals

- 本子任务不删除旧 `/sites/*`、`/workspaces/*` 发布入口
- 本子任务不做底层 content/release 表结构迁移
- 本子任务不扩展多 runtime UI
- 本子任务不重写 admin 内容编辑器的 workspace-scoped content API

## Constraints

- 保持 hard cut 方向，避免 silent fallback
- v1 继续采用 `1 Project = 1 Primary Runtime`
- 旧底层数据模型允许暂时保留 `site_id`，但 runtime 需要成为正式公开边界
- 验证命令使用 repo script：`pnpm api:check`

## Deliverables

- `apps/api/src/modules/projects/runtime/**` runtime context 与 runtime facade 支撑
- `apps/api/src/modules/runtimes/**` 或等价 runtime-owned 路由/服务边界
- project facade 改走 runtime identity
- runtime publish/delivery 相关 integration tests

## Done-When

- [ ] Project facade 发布与交付链不再直接向 workspace/site 请求上下文取主键
- [ ] Runtime-scoped preview/runtime/delivery 正式路由可用
- [ ] `pnpm api:check` 通过

## Final Validation Command

```bash
pnpm api:check
```
