# Child Task Spec: Team Governance And Project Member Control

## Goal

把 workspace 团队治理固定到 `/settings/workspace/*`，并为项目设置增加 project-scoped 成员控制，使 `/projects/$projectId` 使用真实 project identity。

## Scope

- 修正 workspace 列表、创建、详情返回的 primary project binding
- 修正 Admin project route、switcher、global navigation、post-auth 和 invitation 链路的 workspaceId/projectId 分工
- 增加项目成员后端模型、服务、API 和 schema
- 增加 `/projects/$projectId/settings/members` 页面、菜单、i18n 和前端 API client
- 每个阶段通过 targeted verification 后更新任务账本

## Non-Goals

- 不迁移既有数据
- 不保留 workspace-as-site 双轨入口
- 不复制 workspace invitations/roles 三页到项目级
- 不实现项目级外部邀请流
