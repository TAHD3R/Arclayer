# RFC：组织 / 工作区 / 站点边界重构 + 团队协作邀请（v2）

状态：Approved（已在讨论中定案，待实现）

最后更新：2026-01-31

负责人：
- Backend：TBD
- Frontend：TBD

---

## 1. 背景与问题陈述

CelestialCMS 早期实现了“多组织（Organization）”与组织级 RBAC，并在邀请成员时使用“加入组织”的语义。随着 Admin 端开始支持团队协作，出现了**组织 / 站点 / 工作区作用域不明确**的问题：

- Admin 端的治理对象实际上是“站点/项目级”（内容、模型、插件启用、站点配置、团队协作）。
- 但后端的租户边界与邀请边界落在 Organization 上，导致邀请文案与用户心智错位（例如“邀请你加入组织 Default”）。
- 进一步地，多工作区（博客站、商业站）需求出现后，必须把“组织（账号级）”与“工作区（项目级）”分离，否则后续账单/SSO/审计等组织级能力会与站点治理强耦合。

本 RFC 定义一次性破坏性重构方案：**组织（账号） → 多工作区（项目/站点治理）**，并提供与 Notion/Slack/Contentful/Webflow 相同心智的邀请体系：

- 邮件邀请：可管理的“待处理 / 已接受”列表（按邮箱、可延期、可撤销）。
- 邀请链接：可复用链接，维护与统计“参与者/使用情况”。

> 说明：本 RFC 明确“组织/工作区”边界后，Admin 端默认工作在**工作区作用域**。组织级能力（账单/SSO）暂不实现，但数据模型与权限边界为未来预留。

---

## 2. 术语与边界（强制）

### 2.1 Organization（组织/账号级）

- 含义：一个账号对应一个组织（A2：用户不可加入多个组织）。
- 未来承载：账单、SSO、审计、组织资料、组织级安全策略。
- 当前承载：工作区容器 + 组织 Owner 的可见性策略。

### 2.2 Workspace（工作区=项目=站点治理边界）

- 含义：组织下的项目空间（例如“博客”“商业站”）。
- Admin 端治理范围：内容、内容模型、插件启用/配置、资产库、站点设置、团队协作。
- 路由与 API：使用路径显式作用域（G1：`/workspaces/{workspace_id}/...`）。

### 2.3 Site（站点）

- 短期定义：站点 = 工作区的“对外发布配置”（1 workspace : 1 site）。
- 中期可扩展：如需“一个工作区多个站点（多域名/多品牌/多语言站）”，再引入独立 Site 实体。

---

## 3. 已确认的产品/技术决策（来自讨论结论）

### 3.1 组织与工作区可见性/管理权（Owner 策略）

组织 Owner 的默认能力（必须实现）：

1) 组织 Owner 对组织下**非自己创建的工作区**：
   - 默认：可见（可在列表中看到）
   - 默认：不可管理（需要显式 workspace_membership + 角色授予）
2) 组织 Owner 对组织下**自己创建的工作区**：
   - 默认：拥有 admin 权限（无需额外 membership 绑定）

### 3.2 工作区可见性（1B）

- 用户只应看到自己“有权限进入”的工作区：
  - 自己有 `workspace_membership` 的工作区
  - 或者自己是组织 Owner（可见所有工作区，但不代表可管理）

### 3.3 角色体系（D1）

- 保留现有 Role/Permission 体系（角色码、默认角色、权限码）。
- 工作区内的角色授予绑定在 `workspace_membership` 上。

### 3.4 插件作用域（F3）

- 插件安装：组织级（org-scoped）
- 插件启用/配置：工作区级（workspace-scoped）

### 3.5 API 作用域表达（G1）

- 所有 Admin 端治理 API 使用路径参数显式指定工作区：
  - `/api/v1/workspaces/{workspace_id}/...`

---

## 4. 邀请体系：目标体验与对象拆分（关键）

### 4.1 目标体验（对齐 Notion/Slack/Contentful/Webflow）

在某工作区的“团队/成员”页面，存在三个概念区：

1) 待处理（Pending）
   - 我发出去但对方尚未加入的邀请
   - 列表展示：电子邮件（组合字段：email + inviter + role）、日期、到期日期、操作（延期/删除）
2) 已接受（Accepted）
   - 已经加入成功的邀请记录（邀请历史）
   - 列表展示：与待处理相似，额外可显示 accepted_at、accepted_by
3) 邀请链接（Invite links）
   - 可复用链接列表
   - 列表展示：链接 code、角色、创建者、创建时间、到期/禁用状态、参与者/使用次数

### 4.2 对象拆分（避免再次混淆）

必须同时存在两类邀请对象：

1) **邮件邀请（Email Invite）**：用于“待处理/已接受”
   - email-bound（绑定邮箱）
   - 状态机：pending / accepted / revoked / expired
   - 支持“延期（仅延长有效期）”与“删除（撤销）”
2) **邀请链接（Invite Link）**：用于“邀请链接”Tab
   - 可复用（支持 `max_uses` 可选，默认无限）
   - 可选域名限制（allowed_email_domain）
   - 支持禁用、延期（修改 expires_at）、使用统计与参与者信息

> 结论：若只维护 invite_link，将无法可靠实现“待处理/已接受（按邮箱管理）”的产品体验。

---

## 5. 邀请相关规则（Q1-Q5：已确认）

### 5.1 Q1：延期邀请语义

延期邀请 = **仅延长 expires_at**：

- 不旋转 token
- 不自动重发邮件（如未来需要“重发”，另加显式按钮/能力）

### 5.2 Q2：同一邮箱在同一工作区的 pending 邀请

不允许存在多条 pending：

- 若已存在 pending 邀请，再次邀请时应“更新该条记录”（例如更新 role/expires_at/updated_at）
- 不能创建第二条 pending

### 5.3 Q3：删除邀请语义

删除邀请 = **撤销（revoke）**：

- 设置 `revoked_at`（以及可选 `revoked_by_user_id`）
- 不做硬删除（保留审计/历史）

### 5.4 Q4：邀请链接使用次数

支持 `max_uses` 可选：

- 默认：无限次（`max_uses = NULL`）
- 达到上限后：视作不可用（Forbidden / 403）

### 5.5 Q5：邀请链接域名限制

支持可选域名限制 `allowed_email_domain`：

- 若设置，例如 `example.com`：只允许 `@example.com` 的账号通过链接加入
- 未来可与组织级 SSO/域策略合并（本 RFC 仅定义 invite link 级别的约束）

---

## 6. 数据模型（建议表结构）

### 6.1 组织与工作区

#### organizations

- id (UUID)
- slug (string, unique)
- name (string)
- logo_url (string, nullable)
- is_active (bool)
- created_at / updated_at

#### org_memberships

- id (UUID)
- org_id (FK organizations)
- user_id (FK users)
- is_owner (bool, default=false)
- status (active/disabled)
- created_at / updated_at

约束：
- A2：同一 user 只允许属于一个 org
  - DB 约束建议：`UNIQUE(user_id)`（或业务层强制 + 迁移时校验）

#### workspaces

- id (UUID)
- org_id (FK organizations)
- slug (string, unique within org)
- name (string)
- created_by_user_id (UUID, required)
- is_active (bool, default=true)
- created_at / updated_at

约束：
- `UNIQUE(org_id, slug)`

#### workspace_memberships

- id (UUID)
- workspace_id (FK workspaces)
- user_id (FK users)
- status (active/invited/disabled)
- invited_by_user_id (UUID, nullable)
- created_at / updated_at

约束：
- `UNIQUE(workspace_id, user_id)`

#### workspace_membership_roles

- id (UUID)
- workspace_membership_id (FK workspace_memberships)
- role_id (FK roles)

约束：
- `UNIQUE(workspace_membership_id, role_id)`

### 6.2 邮件邀请（待处理/已接受）

#### workspace_email_invites

- id (UUID)
- org_id (FK organizations)  // 冗余，便于审计与快速查询
- workspace_id (FK workspaces)
- email (string, normalized lower-case)
- role_code (string, nullable) // 对应 roles.code
- token_hash (string, indexed) // 只存 hash
- expires_at (datetime, nullable)
- created_by_user_id (UUID)
- accepted_by_user_id (UUID, nullable)
- accepted_at (datetime, nullable)
- revoked_by_user_id (UUID, nullable)
- revoked_at (datetime, nullable)
- created_at / updated_at

索引与约束建议：
- 查询索引：`(workspace_id, created_at)`、`(workspace_id, accepted_at)`、`(workspace_id, revoked_at)`、`(token_hash)`
- Q2（强烈建议用 DB 约束兜底）：
  - Postgres Partial Unique Index：
    - `UNIQUE(workspace_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL`
  - 语义：一个邮箱在一个工作区最多只有一条“活跃邀请”（pending/expired 都算活跃，可通过延期延长）。

### 6.3 邀请链接（可复用）

#### workspace_invite_links

- id (UUID)
- org_id (FK organizations)  // 冗余
- workspace_id (FK workspaces)
- role_code (string, nullable)
- token_hash (string, unique, indexed)
- code (string, unique, indexed) // UI 展示短码
- expires_at (datetime, nullable)
- disabled_at (datetime, nullable)
- max_uses (int, nullable) // Q4：可选上限
- allowed_email_domain (string, nullable) // Q5
- created_by_user_id (UUID, nullable)
- uses_count (int, default=0)
- last_used_by_user_id (UUID, nullable)
- last_used_at (datetime, nullable)
- created_at / updated_at

#### workspace_invite_link_use_events（推荐）

用于“参与者”列表/审计（可裁剪字段以满足隐私要求）：

- id (UUID)
- link_id (FK workspace_invite_links)
- used_by_user_id (UUID)
- used_at (datetime)
- joined_workspace_membership_id (UUID, nullable)

最小实现也可先不做 events 表，仅保留 `uses_count/last_used_*`，但 UI 的“参与者”能力会受限。

---

## 7. 鉴权与可见性规则（必须实现）

### 7.1 工作区列表（符合 1B + Owner 策略）

`GET /api/v1/me/workspaces` 返回：

- 我有 `workspace_membership` 且 status=active 的工作区
- + 我是组织 Owner 的工作区（即使没有 membership），并标记为 `visible_only=true`

### 7.2 进入/管理工作区的判定

给定 workspace + 当前用户：

1) 若 workspace.created_by_user_id == current_user.id 且 current_user 为该 org 的 owner：
   - 默认拥有 workspace admin（Owner 对自己创建的 workspace 直接 admin）
2) 否则需要 `workspace_membership` + 绑定角色，才可执行管理操作
3) 仅可见（visible_only）但无 membership 的 workspace：
   - 可以在列表展示
   - 进入管理路由时应提示“需要管理员授予权限”（403 / 404 二选一；建议 403 + 明确错误码）

### 7.3 邀请相关权限

工作区邀请管理需要 workspace 级权限（示例）：

- `team:manage` 或 `workspace:admin`

（具体 permission code 可沿用现有 `admin:access` 体系，但建议在本次重构中引入更语义化的 workspace 权限码，避免继续把“admin”当作全局概念。）

---

## 8. API 设计（v1：工作区作用域）

### 8.1 工作区 Team：邮件邀请

#### 创建/更新邮件邀请

`POST /api/v1/workspaces/{workspace_id}/team/email-invites`

输入：
- email
- role_code (nullable)
- expires_in_seconds (nullable)

行为：
- 若存在活跃邀请（Q2）：更新该条（role_code、expires_at 等）
- 否则创建新邀请
- 返回：invite_url（带 raw token，仅返回一次）+ invite 详情

> 邮件发送：由 EmailService 在后台任务执行；若 mail 未启用，仍返回 invite_url 供复制/手动发送。

#### 列表：待处理

`GET /api/v1/workspaces/{workspace_id}/team/email-invites?status=pending`

状态判定：
- pending：accepted_at is null AND revoked_at is null AND (expires_at is null OR expires_at > now)
- expired：accepted_at is null AND revoked_at is null AND expires_at <= now

UI 可在 pending 列表中把 expired 标红，并允许“延期”。

#### 列表：已接受

`GET /api/v1/workspaces/{workspace_id}/team/email-invites?status=accepted`

#### 延期（Q1）

`POST /api/v1/workspaces/{workspace_id}/team/email-invites/{invite_id}/renew`

输入：expires_in_seconds / expires_at
行为：仅更新 expires_at，不旋转 token，不重发邮件。

#### 删除（Q3）

`DELETE /api/v1/workspaces/{workspace_id}/team/email-invites/{invite_id}`

行为：revoked_at=now（软撤销）

### 8.2 工作区 Team：邀请链接

#### 创建邀请链接

`POST /api/v1/workspaces/{workspace_id}/team/invite-links`

输入：
- role_code (nullable)
- expires_in_seconds (nullable)
- max_uses (nullable) // Q4
- allowed_email_domain (nullable) // Q5

输出：
- invite_url（raw token，只返回一次）
- code、过期时间、禁用状态、使用次数等

#### 列表邀请链接

`GET /api/v1/workspaces/{workspace_id}/team/invite-links`

#### 延期邀请链接

`POST /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/renew`

行为：仅更新 expires_at

#### 禁用邀请链接

`POST /api/v1/workspaces/{workspace_id}/team/invite-links/{link_id}/disable`

行为：disabled_at=now

### 8.3 邀请接受（公共入口，auth 作用域）

#### 预览

`GET /api/v1/auth/invitations/preview?token=...`

返回：
- invitation_type: `email_invite` | `invite_link`
- organization: { id, name, slug, logo_url }
- workspace: { id, name, slug }
- inviter: { id, display_name, avatar_url } | null
- role: { code, name, description } | null
- email（仅 email_invite；masked_email 推荐）
- expires_at / disabled_at / max_uses（按类型返回）

#### 接受（新用户）

`POST /api/v1/auth/invitations/accept`

输入：
- token
- username / password / display_name
- email（仅 invite_link 场景需要输入；email_invite 场景必须与 invite.email 一致）

#### 接受（已登录用户加入）

`POST /api/v1/auth/invitations/accept-existing`

输入：token

约束：
- email_invite：必须 `current_user.email == invite.email`，否则 403 `INVITE_EMAIL_MISMATCH`
- invite_link：检查 allowed_email_domain（若设置），以及 max_uses（若达到）

成功后：
- 确保 org_membership（若用户不属于任何 org 且 A2 允许加入：创建；若用户属于其他 org：拒绝）
- 创建/激活 workspace_membership
- 绑定角色（role_code 或默认角色）
- 返回：organization_id、workspace_id、role_code

---

## 9. 前端实现要点（Admin）

### 9.1 工作区上下文（替代 currentOrgId）

- 使用 `currentWorkspaceId` 作为主要上下文
- 所有 API 走 `/workspaces/{workspaceId}/...`（G1）
- 工作区选择器：
  - 普通用户：仅看到自己加入的工作区
  - 组织 Owner：可看到全部工作区（但 visible_only 的进入应提示无权限）

### 9.2 Team 页面三段式

1) 成员（Workspace Members）
2) 邀请（Email Invites）
   - Tab：待处理 / 已接受
   - 支持：延期（renew）、删除（revoke）
3) 邀请链接（Invite Links）
   - 支持：创建、复制、禁用、延期、显示参与者/使用次数

### 9.3 i18n 与文案（建议）

邀请相关文案统一使用“工作区”，避免“组织”抢戏：

- “邀请你加入工作区「{workspaceName}」”
- “加入后将获得工作区角色：{roleName}”
- “工作区是站点/项目的治理范围；组织用于未来账单/SSO”

---

## 10. 破坏性迁移方案（一次性，无兼容层）

本 RFC 允许一次性破坏性重构。建议迁移策略如下：

### 10.1 前置检查

1) 检查是否存在“用户属于多个组织”的数据：
   - 若存在，与 A2 冲突，需要人工决策（合并/选主/删除）
2) 确定“组织 Owner”的定义：
   - 建议：每个 organization 必须有且仅有一个 is_owner=true 的 org_membership（可在迁移时强制）

### 10.2 创建工作区并回填数据

对每个现有 organization：

1) 创建默认 workspace（可命名为原 organization.name，slug 同步或追加后缀）
2) 迁移现有“组织级业务数据”到默认 workspace 作用域（视各表字段而定）：
   - 若现有表使用 `org_id` 且语义其实是“站点/项目级”，建议重命名为 `workspace_id` 并回填默认 workspace
3) 迁移现有 membership_roles 绑定到 workspace_membership_roles

### 10.3 邀请体系迁移

- 现有组织邀请/链接（organization_invitations / organization_invite_links）将被废弃
- 新建 workspace 级 email_invites 与 invite_links
- 旧 token 不保证兼容（允许 breaking）

### 10.4 路由与前端迁移

- 移除 `X-Org-Id` 强依赖
- 引入 workspace 路由与 store
- 所有 team/setting/content 相关请求改为 workspace path

---

## 11. 测试与验收清单（建议）

### 11.1 后端集成测试

1) Owner 可见性：
   - owner 可看到所有 workspaces
   - owner 对非自己创建 workspace 的管理接口返回 403（除非显式加入）
2) 邮件邀请：
   - 创建 invite → pending 列表可见
   - renew 仅延长 expires_at，不旋转 token
   - delete = revoke（revoked_at set）
   - accept-existing 时 email mismatch 拒绝
3) 邀请链接：
   - max_uses 达到后拒绝
   - allowed_email_domain 不匹配拒绝
   - uses_count / last_used_* 更新
4) A2 组织约束：
   - 用户已属于 orgA 时，试图通过 orgB 的邀请加入，必须拒绝（明确错误码）

### 11.2 前端验收

- Team 页面三段式可用
- “待处理/已接受/邀请链接”语义清晰，字段与操作与预期一致
- 邀请预览页显示 workspace 名称为主，组织为辅

---

## 12. 兼容性与非目标

本 RFC 明确采用破坏性重构：

- 不保证旧 token、旧邀请链接可继续使用
- 不提供兼容层双写/双读
- 不在本次实现完整账单/SSO，仅做数据与权限边界预留
