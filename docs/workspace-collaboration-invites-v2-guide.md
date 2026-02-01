# 工作指南：工作区（Workspace）协作与邀请体系（v2）

最后更新：2026-02-01

本指南是 `docs/rfc/org-workspace-collaboration-and-invites-v2.md` 的“可执行落地版”，用于指导后端/前端在同一套边界模型下持续迭代，避免再次出现「组织/站点/工作区」混淆。

如果你只想快速理解“我们到底应该怎么做”，建议按以下顺序阅读：

1) **边界模型与心智模型**（第 1-2 节）
2) **权限与可见性**（第 3 节）
3) **邀请对象与状态机**（第 4-5 节）
4) **API 清单**（第 6 节）
5) **前端对接建议**（第 7 节）
6) **测试用例覆盖**（第 8 节）

---

## 1. 结论先行（统一口径）

### 1.1 我们的边界模型（强制）

- **Organization（组织）= 账号级容器**
  一个账号对应一个组织；组织未来承载：账单、SSO、审计、组织级安全策略。
  当前阶段：组织只负责“容器 + owner 可见性策略”，不提供组织级设置 UI。

- **Workspace（工作区）= 项目 = 站点治理边界**
  Admin 端（`apps/web/admin`）的治理范围默认只涵盖 workspace：内容、模型、插件启用/配置、站点设置、团队协作等。

- **Site（站点）= 工作区的“对外发布配置”**（短期）
  短期不引入独立 Site 实体，默认 1 workspace : 1 site。
  未来如需“一个工作区多个站点（多域名/多品牌/多语言站）”，再引入 Site 并让其挂在 workspace 下。

### 1.2 单组织约束（A2）

- **一个用户只能属于一个 Organization**。
  这意味着我们不做“跨组织切换账号/组织选择器”的复杂流程；用户只需要选择 workspace（项目）。

> 注意：单组织并不妨碍未来做“组织间迁移/转移”，那是显式的管理员动作，不是常规登录态的组织切换。

---

## 2. API 作用域表达（避免歧义）

### 2.1 路径必须显式 workspace（G1）

所有 Admin 端治理能力的 API，必须以路径参数显式指定工作区：

`/api/v1/workspaces/{workspace_id}/...`

禁止隐式从 header / session 推导当前 workspace（除非是“当前用户默认 workspace”这种只读入口）。

### 2.2 允许存在 system/org/workspace 三种 settings scope

- **system scope**：部署级/全局（例如邮件 SMTP、默认 locale、master key 指纹等）
- **org scope**：为账单/SSO/组织安全策略预留（当前可不提供 UI）
- **workspace scope**：站点配置、内容治理、插件启用与配置（Admin 治理的主战场）

实现上使用 `(scope_type, scope_id, namespace)` 作为唯一键，避免把不同 scope 混到一个 namespace 下。

---

## 3. 权限与可见性（Owner 策略）

### 3.1 Org Owner 的默认规则（E1 + 1B）

组织 owner 的默认能力：

1) 对组织下**非自己创建的 workspace**：
   - 默认可见（能在 workspace 列表看到）
   - 默认不可管理（访问管理接口会被拒绝，除非显式加入该 workspace）
2) 对组织下**自己创建的 workspace**：
   - 默认拥有 admin 权限（无需显式授予）

### 3.2 可见（visible）与可管理（manageable）必须分离

- “可见”用于列表/导航：让 owner 知道组织下有哪些项目。
- “可管理”用于写接口/敏感读接口：必须拥有 `workspace_membership` + RBAC 权限。

后端对外输出使用：

- `visibleOnly: true` 表示“仅可见不可管理”
- `isCreatorAdmin: true` 表示“该 workspace 的 creator 对其拥有隐式 admin”

对应 API：`GET /api/v1/me/workspaces`

---

## 4. 邀请体系：对象、状态机与 UI 心智

目标：对齐 Notion / Slack / Contentful / Webflow 的协作邀请体验。

### 4.1 我们维护两类邀请对象（这是产品体验所需）

1) **WorkspaceEmailInvite（邮件邀请）**
   - 用于 UI 的 “待处理 / 已接受” 两个列表
   - email-bound：接受时必须满足 `current_user.email == invite.email`
   - 可延期（只改 expires_at），可撤销（revoke），可沉淀“邀请历史”

2) **WorkspaceInviteLink（邀请链接）**
   - 可复用链接：复制后可以再次复制/再次生成同一个 token（token 可重建）
   - 支持 max_uses / allowed_email_domain / disabled / expires
   - 用于 UI 的 “邀请链接” Tab，并能展示参与者/使用次数

> 经验结论：如果只维护 invite link，不维护 email invite，很难做出“按邮箱管理待处理/已接受”的协作体验；同一条链接可以被任意人使用，无法可靠映射到某一个“已发送的邀请”。

### 4.2 状态机（Email Invite）

字段驱动的状态：

- pending：`accepted_at is null` 且 `revoked_at is null` 且（`expires_at is null` 或 `expires_at > now`）
- accepted：`accepted_at not null`
- revoked：`revoked_at not null`
- expired：`accepted_at is null` 且 `revoked_at is null` 且 `expires_at <= now`

UI 映射：

- “待处理” = pending
- “已接受” = accepted

### 4.3 邀请链接参与者（Invite Link Participants）

为了满足“参与者为 -”的产品缺口，我们新增使用事件：

- `WorkspaceInviteLinkUseEvent`：每次通过链接加入 workspace 时写一条记录
  UI 可展示最近 N 个参与者（默认 3 个），并与 `uses_count/last_used_by/last_used_at` 形成互补。

---

## 5. 邀请规则（Q1-Q5 对齐产品）

### 5.1 Q1：延期邀请

- 延期 = 只延长 `expires_at`
- **不旋转 token**（同一 code 可重建 token，延长不会导致链接变化）
- 不自动重发邮件（如未来需要“重发”，加独立按钮/接口）

### 5.2 Q2：同邮箱同工作区仅一条 pending

- 同一 `(workspace_id, email)` 不允许存在多条 pending
- 重复邀请时：更新原 invite（role/expires），不创建第二条

### 5.3 Q3：删除邀请

- 删除 = 撤销（revoke）
- 记录 `revoked_at`（可选记录 `revoked_by_user_id`），不做硬删除

### 5.4 Q4：邀请链接 max_uses

- `max_uses = null` 表示无限次
- 达到上限后拒绝（403）

### 5.5 Q5：邀请链接域名限制 allowed_email_domain

- 允许设置 `example.com`，只允许 `@example.com` 的邮箱加入
- 未来可与组织级 SSO/域策略合并（当前仅 link 级别约束）

---

## 6. API 清单（后端实现对照）

说明：以下接口均遵循标准 Response 包装与分页约定（PageData/PageParams）。

### 6.1 Workspace 列表

- `GET /api/v1/me/workspaces`
  返回当前用户可见的 workspaces（owner 可见所有；非 owner 仅成员可见），并标注 `visibleOnly/isCreatorAdmin`。

### 6.2 Workspace Team：成员

- `GET /api/v1/workspaces/{workspace_id}/team/members`（permission：`team:members:read`）
- `PUT /api/v1/workspaces/{workspace_id}/team/members/{membership_id}/roles`（permission：`team:members:roles:manage`）
- `PATCH /api/v1/workspaces/{workspace_id}/team/members/{membership_id}`（permission：`team:members:manage`）
  更新成员的用户资料（email/display_name/avatar_url），但必须在 workspace 作用域下执行，避免跨项目篡改。
- `POST /api/v1/workspaces/{workspace_id}/team/members/{membership_id}/disable`（permission：`team:members:manage`）
- `POST /api/v1/workspaces/{workspace_id}/team/members/{membership_id}/enable`（permission：`team:members:manage`）
- `POST /api/v1/workspaces/{workspace_id}/team/members/{membership_id}/reset-password`（permission：`team:members:reset-password`）
  重置成员密码（影响全局账号），但授权仍限定在当前 workspace。

### 6.3 Workspace Team：邮件邀请（待处理/已接受）

- `POST /api/v1/workspaces/{workspace_id}/team/email-invites`（permission：`team:invitations:manage`）
  Create-or-update（Q2），返回 `token/invite_url` 便于复制链接。

- `GET /api/v1/workspaces/{workspace_id}/team/email-invites?status=pending|accepted|revoked|expired`（permission：`team:invitations:manage`）

- `POST /api/v1/workspaces/{workspace_id}/team/email-invites/{invite_id}/renew`（permission：`team:invitations:manage`）
  Q1：只延长 expires_at，不旋转 code。

- `DELETE /api/v1/workspaces/{workspace_id}/team/email-invites/{invite_id}`（permission：`team:invitations:manage`）
  Q3：撤销。

### 6.4 Workspace Team：邀请链接

- `POST /api/v1/workspaces/{workspace_id}/team/invite-links`（permission：`team:invite-links:manage`）
- `GET /api/v1/workspaces/{workspace_id}/team/invite-links`（permission：`team:invite-links:manage`）
  返回 `uses_count/last_used_*`、`recent_participants`，并包含可直接复制分享的 `token/invite_url`（用于消费路径）。
- `GET /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/participants`（permission：`team:invite-links:manage`）
  分页列出参与者（使用事件）。前端在“参与者”列中点击展开时使用，用于大规模参与者列表的搜索与分页展示。
- `POST /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/renew`（permission：`team:invite-links:manage`）
- `POST /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/disable`（permission：`team:invite-links:manage`）

### 6.5 Accept Invite（公共入口，给 accept-invite 页使用）

- `GET /api/v1/auth/invitations/preview?token=...`
  返回 org + workspace + inviter + role（可空）+ email（仅 email invite 才有）。

- `POST /api/v1/auth/invitations/accept`
  邀请制注册：创建新用户并加入 workspace（email invite / invite link 均支持）。

- `POST /api/v1/auth/invitations/accept-existing`
  已登录用户加入 workspace。
  - email invite：强制 email 匹配
  - invite link：要求传 email（用于域名限制校验）

- `GET /api/v1/auth/me/invitations`
  列出发到“当前用户邮箱”的 workspace 邮件邀请（便于 inbox/通知中心类 UI）。
  v2 必须包含 workspace 信息，否则多 workspace 下无法区分。

### 6.6 Workspace RBAC（只读）

用于前端在 workspace 上下文内展示“可选角色/权限”，避免依赖 system 级接口。

- `GET /api/v1/workspaces/{workspace_id}/rbac/roles`（permission：`team:members:read`）
- `GET /api/v1/workspaces/{workspace_id}/rbac/permissions`（permission：`team:members:read`）

### 6.7 System（部署级能力，owner gate）

这些接口属于部署/系统级，不属于 workspace 治理边界，默认仅 org owner 可调用（不走 workspace RBAC 引擎）：

- `GET /api/v1/system/settings`
- `GET /api/v1/system/settings/{namespace}`
- `PATCH /api/v1/system/settings/{namespace}`
- `POST /api/v1/system/mail/test`
- `GET /api/v1/system/plugins-manager`
- `POST /api/v1/system/plugins-manager/install` 等插件管理
- `GET /api/v1/system/rbac/roles` 等角色/权限管理

### 6.8 Workspace Plugins（插件 admin 路由挂载约定）

插件提供的 `admin_router` 必须挂载到 workspace 作用域：

`/api/v1/workspaces/{workspace_id}/plugins/{slug}/...`

---

## 7. 前端对接建议（Admin）

### 7.1 Admin 的“当前上下文”应从 org 切换为 workspace

- 以 workspace 为主的路由结构（前端 URL 显式携带 workspaceId）：
  - `/w/:workspaceId/...`（例如 `/w/:workspaceId/team/members`、`/w/:workspaceId/assets`、`/w/:workspaceId/settings/general`）
- 对应 API：`/api/v1/workspaces/{workspaceId}/...`（后端治理接口全部显式 workspace scope）

补充：**self-host 单工作区**与 **SaaS 多工作区**不做“部署模式分支”，而是基于 `GET /api/v1/me/workspaces` 返回数量自适应：

- 仅 1 个 workspace：登录后自动进入该 workspace（1B）
- 多个 workspace：进入 workspace 选择页；右上角提供 workspace switcher

### 7.2 Team 页（Members / Invitations / Invite links）的映射

以 `apps/web/admin/src/views/team/TeamMembersView.tsx` 与 `apps/web/admin/src/views/team/TeamInvitationsView.tsx` 为例：

- Members：调用 `GET /workspaces/{id}/team/members`
- Pending（待处理）：调用 `GET /workspaces/{id}/team/email-invites?status=pending`
- Accepted（已接受）：调用 `GET /workspaces/{id}/team/email-invites?status=accepted`
- Invite links（邀请链接）：调用 `GET /workspaces/{id}/team/invite-links`

创建邀请：

- 发送邮件邀请：`POST /workspaces/{id}/team/email-invites`
  UI 复制链接使用返回的 `invite_url`（或拼接 `/accept-invite?token=...`）
- 创建链接：`POST /workspaces/{id}/team/invite-links`

### 7.3 接受邀请页的文案

preview 返回包含 workspace 后，accept-invite 页面应把文案从：

“{inviter} 邀请你加入组织 {org}”

调整为：

“{inviter} 邀请你加入工作区 {workspace}”（可在副标题中展示 org 名称）

---

## 8. 测试覆盖（后端）

集成测试入口：

- `apps/api/tests/test_workspace_team_invites_v2_integration.py`

覆盖点（关键路径）：

- owner 可见全部 workspaces，但对非自己创建的 workspace 为 `visibleOnly=true`
- invite link accept-existing 会创建 UseEvent，并在 invite-links 列表中回显 recentParticipants
- max_uses 强制限制
- allowed_email_domain 强制限制
- A2：拒绝跨 org 接受邀请
- email invite：pending 唯一更新；accept-existing 成功；email mismatch 403
- invite link disable 后 accept 403
- `/auth/me/invitations` 返回 workspace 信息（多 workspace 必须可区分）

## 8.1 测试覆盖（前端）

前端不做“端到端”依赖后端环境的测试（避免 CI / 本地缺环境导致不稳定），但需要对关键路由/跳转决策做单元测试兜底：

- `apps/web/admin/src/utils/workspaceRouting.test.ts`
  - 1B：选择默认 workspace 的决策（lastWorkspaceId / 单 workspace / 多 workspace）
  - workspace switcher 的路径替换逻辑（保持页面不变，仅替换 `/w/:workspaceId` 前缀）

---

## 9. 未完成与后续演进（明确 TODO，避免隐藏债务）

以下是“边界模型已定，但尚未全量迁移为 workspace scope”的部分：

1) **仍可能存在少量“未 workspace 化”的旧接口/页面**
   - 原则：要么迁移为 `/api/v1/workspaces/{workspace_id}/...`，要么明确为 system/org scope，并在 UI 上做出边界隔离（不要混在 workspace 管理里）。
2) **插件 F3（org 安装 / workspace 启用）未全量落地**
   - 当前 PluginRecord 仍偏全局；未来需引入 org_id + workspace config/enable 表。
3) **更多 settings namespace 的 workspace 化**
   - 当前仅新增了 workspace core settings；站点相关（site_name/url/logo/seo 等）应迁移到 workspace scope。

建议后续迭代时，把这些 TODO 拆成独立 plan/rfc，逐步收敛到“admin 全面 workspace 化”的终局。
