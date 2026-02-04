# Activity（原 Audit Log）分域治理落地说明（Org / Workspace）

> 日期：2026-02-04
> 状态：已实现（第一阶段）

## 背景

项目需要引入组织级（Org scope）、工作区级（Workspace scope）、用户级（User scope）的行为记录能力，用于：

- 安全审计与排障（谁在什么时候做了什么）
- 关键操作追溯（权限/成员/邀请等）
- 为后续治理能力（组织级配置、工作区级配置）提供一致的产品交互基础

本阶段聚焦 **Activity（操作记录）** 的“可用性”与“分域治理骨架”：

1) 组织级 Activity 与工作区级 Activity 在信息架构上隔离（路由 + 侧边栏菜单）。
2) 后端 API 对外名称统一为 `/activity`。
3) 前端筛选体验升级为 Select + 搜索（防抖）。
4) 增加 team/rbac 关键事件覆盖，确保 Activity 表里能看到真实变更。

## 路由与菜单（关键设计）

### 组织域（Org scope，路由不带 `/w/:workspaceId`）

- 组织设置中心：`/settings/organization`
- 组织级 Activity：`/settings/organization/activity`

在组织域路由下，侧边栏展示 **组织级菜单**（ORG_NAV_ITEMS），不展示工作区菜单。

进入组织域的入口在账号菜单（Organization settings）。

### 工作区域（Workspace scope，路由带 `/w/:workspaceId`）

- 工作区级 Activity：`/w/:workspaceId/settings/maintenance/activity`

在工作区域路由下，侧边栏展示 **工作区菜单**（ADMIN_NAV_ITEMS），并自动加上 `/w/:workspaceId` 前缀。

## 后端 API（对外）

### 组织级（system）

- `GET /api/v1/system/activity`
- `GET /api/v1/system/activity/{id}`

权限：阶段 1 使用 OrgRole 兜底（owner/admin），不引入真正 org-scoped RBAC 引擎。

### 工作区级（workspace）

- `GET /api/v1/workspaces/{workspace_id}/activity`

### 用于 Select 的操作者搜索（分页 PageData）

为支持前端 “操作者 Select + 搜索（防抖）”，新增：

- `GET /api/v1/workspaces/{workspace_id}/team/users/options?q=&page=&size=`

返回：`ResponseModel[PageData[{ value, label, avatar_url }]]`

安全边界：严格限定在 workspace 成员范围内。

## 前端页面与筛选体验

### 组织级 Activity 页面

- 页面：`apps/web/admin/src/pages/settings/organization/activity/page.tsx`
- 路由：`apps/web/admin/src/routes/settings/organization/activity/index.tsx`

筛选：
- 时间范围
- 事件名
- 工作区 Select（本地过滤 + 防抖交互）
- 操作者 Select（依赖已选工作区；调用 workspace users/options）

### 工作区级 Activity 页面

- 页面：`apps/web/admin/src/pages/settings/maintenance/activity/page.tsx`
- 路由：`apps/web/admin/src/routes/w/$workspaceId/settings/maintenance/activity/index.tsx`

筛选：
- 时间范围
- 事件名
- 操作者 Select（调用当前 workspace users/options）

### DebounceSelect 组件

位置：`apps/web/admin/src/components/inputs/debounce-select.tsx`

- 使用 `lodash/debounce`（与 Antd 官方示例一致）
- 内置 fetchRef 防止乱序回写

## 事件覆盖（已补充的重点）

### workspace/team

- `workspace.member.roles.updated`
- `workspace.member.status.updated`
- `workspace.invite.email.created` / `updated` / `renewed` / `revoked`
- `workspace.invite.link.created` / `renewed` / `disabled`

### rbac

- `rbac.role.created` / `updated` / `deleted`
- `rbac.permission.roles_set`

## 已知限制与下一步

1) 当前 analytics 配置字段仍沿用历史命名（`audit_log`），后续可做“配置层命名统一”重构（可考虑兼容旧 env）。
2) Activity 事件名仍以 `event_name` 形式展示（偏技术）。下一步可在前端做 `event_name -> i18n` 映射，提供更产品化的动作描述。
3) 组织级 actor 搜索目前采用 “先选 workspace 再选 actor” 的安全策略，不提供 org-wide user search。
