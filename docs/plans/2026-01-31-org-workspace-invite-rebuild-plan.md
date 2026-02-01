# 实施计划：组织/工作区边界重构 + 团队协作邀请（一次性破坏性迁移）

日期：2026-01-31

本文是 `docs/rfc/org-workspace-collaboration-and-invites-v2.md` 的工程落地清单（可直接作为迭代工作指南）。

---

## 1. 目标（验收口径）

1) Admin 端所有“站点/项目治理”能力切换为 **workspace scope**（路径显式：`/workspaces/{workspace_id}/...`）。
2) Team 协作邀请能力达到 Notion/Slack 心智：
   - 邮件邀请：待处理/已接受，支持延期（只延长 expires_at）、删除（revoke）。
   - 邀请链接：可复用，支持 max_uses（可选，默认无限）、可选域名限制、禁用/延期、使用统计（参与者）。
3) 一次性破坏性迁移完成，无兼容层：
   - 旧组织级邀请体系下线
   - 旧组织级 RBAC/作用域替换为 workspace 级
4) 组织 Owner 规则生效：
   - owner 可见所有工作区
   - owner 对非自己创建的工作区默认不可管理（需显式加入）
   - owner 对自己创建的工作区默认 admin

---

## 2. 后端改造清单（FastAPI）

### 2.1 新增/调整数据模型（Tortoise Models）

建议新增目录与文件（按现有分层习惯组织）：

- `apps/api/models/workspace.py`
  - Workspace
  - WorkspaceMembership
  - WorkspaceMembershipStatus（可复用现有 MembershipStatus 或新建 enum）
- `apps/api/models/org_membership.py`
  - OrgMembership（包含 is_owner）
- `apps/api/models/workspace_invite.py`
  - WorkspaceEmailInvite
  - WorkspaceInviteLink
  - WorkspaceInviteLinkUseEvent（可选但推荐）

并移除/废弃：

- `apps/api/models/invitation.py`（组织级邀请）
- `apps/api/models/organization.py` 中的 Membership（组织级 membership）

注意：
- 若需要一次性切换，建议在迁移中直接删除旧表/旧代码引用，避免双写。

### 2.2 Settings 作用域（必须调整）

按 RFC 建议将 settings 从全局 namespace 升级为 scoped：

- 方案：新增 `scope_type`、`scope_id`，唯一键为 `(scope_type, scope_id, namespace)`
- 将现有 “core/site/localization/seo” 等全部迁移为 `workspace` scope
- 组织级与系统级设置可先预留 schema，不强制实现 UI

涉及文件（按现有结构）：

- `apps/api/models/setting.py`
- `apps/api/routers/v1/admin/settings/*`
- `apps/api/settings/runtime.py`
- `apps/api/core/middleware/locale.py`（默认语言读取位置需跟随 workspace）

### 2.3 RBAC：从 org-scoped 切到 workspace-scoped

最小落地策略：

1) RBAC 引擎以 `workspace_id` 作为权限边界（替代原 organization_id）。
2) 组织 Owner 特权不通过 RBAC 表达（先通过 OrgMembership.is_owner 规则表达）。

涉及文件（示例）：

- `apps/api/core/rbac/*`
- `apps/api/routers/*` 中依赖注入/权限依赖（如 require_permission_strict）

### 2.4 新增路由（workspace scope）

建议新增：

- `apps/api/routers/v1/workspaces/router.py`（工作区列表、当前 workspace 相关）
- `apps/api/routers/v1/admin/team/router.py` 重构为 workspace 版本，或新增：
  - `apps/api/routers/v1/workspaces/team/router.py`
  - service/repository/schema 分层

路由建议：

- `GET /api/v1/me/workspaces`
- `GET /api/v1/workspaces/{workspace_id}/team/members`
- `POST /api/v1/workspaces/{workspace_id}/team/email-invites`
- `GET /api/v1/workspaces/{workspace_id}/team/email-invites?status=pending|accepted`
- `POST /api/v1/workspaces/{workspace_id}/team/email-invites/{invite_id}/renew`
- `DELETE /api/v1/workspaces/{workspace_id}/team/email-invites/{invite_id}`
- `POST /api/v1/workspaces/{workspace_id}/team/invite-links`
- `GET /api/v1/workspaces/{workspace_id}/team/invite-links`
- `POST /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/renew`
- `POST /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/disable`

Auth 公共入口（保留在 auth router）：

- `GET /api/v1/auth/invitations/preview?token=...`
- `POST /api/v1/auth/invitations/accept`
- `POST /api/v1/auth/invitations/accept-existing`

### 2.5 邀请安全规则（实现要点）

- Email invite：强制 email 匹配（mismatch 返回 403）
- Invite link：检查
  - disabled_at
  - expires_at
  - max_uses
  - allowed_email_domain

并更新：
- uses_count / last_used_by / last_used_at
- 如实现 UseEvent：插入 event 记录

---

## 3. 前端改造清单（Vite + React）

### 3.1 引入 workspace 上下文

- 新增 `useWorkspaceStore`（替代 `useOrgStore`）
  - currentWorkspaceId
  - workspace list cache（或用 react-query）
  - visible_only 标记处理

### 3.2 路由结构

- 推荐以 workspace 为前缀：
  - `/workspaces/:workspaceId/settings/...`
  - `/workspaces/:workspaceId/team/...`

### 3.3 Team 页面 UI

- 成员列表（members）
- 邮件邀请（pending/accepted）
  - 组合字段显示（email / inviter / role）
  - 延期（renew）与删除（revoke）
- 邀请链接（invite links）
  - 参与者展示：优先 uses_count + last_used_by
  - 若后端实现 events：支持展开详情

---

## 4. 数据迁移（一次性破坏性迁移）

### 4.1 迁移顺序建议

1) 加新表（organizations 保留，新增 workspaces、memberships、invites、scoped settings）
2) 回填默认 workspace（每个 organization 至少一个 workspace）
3) 把原 org-scoped 资源数据迁移到默认 workspace scope（字段改名/回填）
4) 删除旧表/旧接口（组织级邀请、组织级 RBAC 绑定等）
5) 前端切换到 workspace 路由与新 API

### 4.2 风险点

- A2：如果发现 user 属于多个 org，需要人工处理后再迁移（禁止自动猜测）
- settings scope：若不先迁移 settings，workspace 化后站点配置会混乱

---

## 5. 测试与质量门禁（建议最小集合）

后端：
- workspace list：owner 可见所有、非 owner 仅成员可见
- email invite：创建/延期/撤销/接受（email mismatch）
- invite link：domain/max_uses/disable/expires 校验
- 迁移后：默认 workspace 存在且资源可访问

前端：
- 路由切换 workspace 后 API 调用路径正确
- Team 页面三个区块工作正常
