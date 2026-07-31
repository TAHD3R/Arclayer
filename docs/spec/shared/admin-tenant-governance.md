# Platform Tenant Governance Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)

## 1. Scope

This contract defines the Tenant Governance Platform Domain: its Workspace-first governance queue; peer User and Project investigative views; useful identity hover cards; Workspace commercial and usage projections with exact Commerce deep links; Workspace lifecycle and deletion authority; case-bound Support Access Grants for customer content; project operational detail; identity cells; truncation-aware tooltips; and server-authoritative disabled/suspended access behavior.

Commercial figures and subscription mutations remain owned by `workspace-commercialization.md`. This contract defines their control-plane projection and interaction, not a second billing calculation.

## 2. Current-state evidence

- the user directory already supports detail/update, avatar, password/session/2FA/OAuth actions, disable/enable, and delete;
- the workspace directory supports detail/update, archive/restore, disable/enable, and delete, but its list/detail projection lacks plan, subscription, credits, and usage;
- the current Workspace delete path accepts `system:settings:manage` and directly deletes the record after name confirmation, which is broader than the canonical Owner-or-legal Workspace Lifecycle Authority and must be replaced rather than retained as an operator convenience path;
- the project directory supports detail/update, disable/enable, and delete, but exposes little operational context beyond workspace, owner, member count, and status;
- workspace and project records already have icon identity fields, while tables frequently render them as generic Tags;
- tenant tables overuse Tooltip regardless of whether text is actually truncated;
- user login checks active status and several workspace/project repositories filter inactive entities, but there is no unified restriction code or app-level blocker and some workspace denial is represented as not-found.

## 3. Non-goals

- Duplicating Subscription, Credit, invoice, payment, or provider mutations owned by the Commerce Platform Domain.
- Treating Payment Restricted, commercial age, archive, suspension, or Hosting delivery state as authorization to delete Workspace data.
- Making every hover card a full edit surface.
- Treating hidden frontend controls or an overlay Dialog as enforcement.
- Exposing internal ids as the primary identity of a user, workspace, or project.
- Adding bulk destructive actions merely because DataTable supports selection.
- Shipping a Tenant Overview made of summary cards, charts, or counts that merely link to the three directories.
- Recreating Workspace Administration or mutations owned by Commerce, Hosting, Monitoring & Audit, or another Platform Domain.
- Giving Platform Roles, Instance Ownership, support employment, or a case record standing access to customer-authored content.
- Impersonating a Workspace member, minting Product Sessions, adding Operators to Workspace membership, or using Support Access to mutate content or perform tenant approvals.

## 4. Domain information architecture and shared directory composition

Tenant Governance is one Platform Domain with three peer directory views:

1. **Workspaces** is the default navigation target and primary governance queue because Workspace is the collaboration, lifecycle, and commercial boundary that most cross-tenant investigations converge on.
2. **Users** is a peer identity, security, membership, and ownership investigation view; it is not a separate Platform Domain or a child of one Workspace.
3. **Projects** is a peer operational and ownership investigation view; it is not a separate Platform Domain or a replacement for Project settings.

The domain has no Tenant Overview route or card dashboard. Authorized Commerce, Hosting, and Monitoring & Audit summaries may appear in directory rows and investigative Drawers only when they help resolve the current case. Every mutation remains in its owning domain, reached through an exact typed deep link; Tenant Governance does not proxy or duplicate those forms.

Every Tenant Governance directory surface uses:

```text
Page title and productized description                     [contextual primary action]
[Search] [Order ▼] [Filters] [Reset]                       [DataTable tools]
[selection actions only when safe]
[DataTable]
```

- Search/filter/order run on the backend and are represented in route search parameters.
- Rows open an investigative Drawer; primary row action remains a ghost button for explicit keyboard access.
- Mutations update detail, list, count, and related identity caches immediately or roll back explicitly.
- Selection is enabled only when safe, homogeneous bulk operations exist. Delete, password reset, subscription adjustment, and other high-risk actions are not blind batch actions.

## 5. Identity cells and truncation

### 5.1 User cell

Avatar plus display name is primary; email is secondary when space permits. Hover/focus opens the shared user identity card. User id is available only in detail diagnostics/copy action.

### 5.2 Workspace and project cells

Use the entity icon/avatar plus resolved name in a single identity row. Status may appear as secondary text or a separate status column. Do not render the entity itself as a Tag.

Deleted/unavailable entities keep a neutral identity icon, last-known name, and explicit state. Raw ids never replace a missing name without a `Deleted/Unavailable` explanation.

### 5.3 Tooltip rule

Only content actually clipped by CSS receives a Tooltip. Use a shared truncation-aware primitive driven by overflow measurement (`scrollWidth > clientWidth` or the vertical equivalent) and ResizeObserver. Normal fully visible cells have no Tooltip wrapper. Icon-only actions may still use explanatory tooltips.

## 6. User directory

### 6.1 User hover/focus card

The card contains useful, authorized facts:

- avatar, name, email, locale/timezone, account/admin status, join date;
- last sign-in/activity and authentication methods/2FA state;
- workspace/project counts and relevant ownership count;
- restriction state and reason category when authorized;
- actions: open detail, copy email, view audit events, view feedback, and navigate to owned workspace/project lists.

Disable, reset password, revoke sessions, unlink OAuth, or delete remain confirmed actions in the Drawer/action menu, not one-click hover-card controls.

### 6.2 Capability review

Retain capabilities with real backend effects and clear operator value. During implementation, inventory every existing action against endpoint, authorization, audit event, failure state, and recovery. Remove UI actions that duplicate another action without distinct semantics or call no effective backend behavior. Missing capability candidates must be justified by a concrete operational need, not generic admin-panel convention.

The minimum complete user Drawer groups:

- identity/profile;
- access and security;
- workspace/project memberships and ownership;
- recent audit/feedback activity;
- restriction history;
- confirmed operator actions.

## 7. Workspace directory and commercial data

### 7.1 Projection

Workspace list/detail returns or composes an authorized commercial summary from the canonical commerce service:

- plan and subscription state;
- billing interval/current period and renewal/cancellation state where applicable;
- Provider lifecycle, commercial access state, recovery deadline, and dunning risk without conflating `past_due` with deletion or Free;
- AI Credits balance, reserved/available amount, and reset/expiry semantics;
- usage summary with explicit measurement window and coverage;
- member/project counts, owner identity, status/archive state, and recent activity;
- effective Billing Manager count and identities only when the Platform actor has authorized tenant-governance visibility; this is an investigative projection, not delegation authority;
- billing-provider sync or data-freshness state without exposing secrets.

The directory never recalculates balances or plan limits from raw rows in the frontend.

### 7.2 Workspace detail

```text
Workspace identity and state
[Overview] [Members & projects] [Billing & usage] [Activity]
```

Billing & Usage explains current plan, entitlement/limit consumption, credits, billing period, invoices/provider navigation when available, and attribution coverage. Exact units and timestamps are shown.

The detail distinguishes the Workspace Owner, delegated Billing Managers, and Platform Commerce actors. It never offers “open as Billing Manager,” returns a tenant Provider Portal URL to a Platform Operator, or implies that `commerce.subscriptions.manage` grants `workspace:commerce:manage`.

Subscription changes are owned by the Commerce Platform Domain through its Renewal Transition and single-Workspace Commercial Correction contracts. The directory links to the exact Workspace Subscription context; Commerce presents source/target Revision, effective timing, Provider schedule or proration effect, Entitlement/Credit consequences, idempotency, and audit impact. The directory does not embed or proxy either mutation workflow.

### 7.3 Workspace actions

Contextual actions include open the Workspace governance record, open its exact Commerce Subscription or billing/usage context, archive/restore, and suspend/restore. “Open Workspace” never means enter the Product Application as a member or expose customer-authored content without the Support Access contract below. Archive, suspension, Payment Restricted, and Delivery Suspended are distinct concepts and copy must explain their effects.

The directory does not expose a generic Platform Operator delete action. An authorized legal/privacy case may deep-link to the exact Workspace Lifecycle workflow, but the directory cannot turn Commerce permission, settings permission, age of nonpayment, or row selection into deletion authority.

### 7.4 Workspace lifecycle and deletion authority

The Workspace Lifecycle Authority is separate from Commerce and access restrictions. It accepts a deletion instruction only from:

- an explicit Workspace Owner action that satisfies the canonical destructive confirmation and authorization contract; or
- an authorized legal/privacy process with case identity, scope, actor authority, evidence, notice status, and audit correlation.

Ordinary `system:settings:manage`, a Platform Role, or any Commerce Permission is insufficient by itself. The current settings-manager hard-delete path is a migration gap, not a compatibility contract. The hard cut replaces it with the lifecycle authority and removes every direct deletion facade that bypasses the accepted instruction.

Archive is reversible and never starts a purge clock. Suspension is an enforced access restriction and never starts a purge clock. Payment Grace, Payment Restricted, Hosting Continuity, and Delivery Suspended never create, advance, or shorten a deletion deadline regardless of duration.

After an instruction is accepted, the independent lifecycle policy owns cancellation eligibility, notices, export opportunity where required, retention, purge ordering, downstream deletion propagation, legal holds, completion evidence, and the minimum tombstone/audit data that may lawfully remain. Those details never derive from a Subscription or Provider timestamp.

If a payment-recovery event arrives after lifecycle deletion has completed, Commerce may reconcile provider and financial state but cannot recreate the Workspace, memberships, projects, sites, releases, customization, or other purged data.

### 7.5 Support Access to customer content

Tenant Governance returns minimum operational metadata and authorized redacted projections by default. Project/page content, prompts and generated output, Knowledge, Skills, Design Systems, uploaded source material, and other customer-authored bodies are outside ordinary Platform visibility even for the Instance Owner. Secrets, credentials, private authentication material, payment instruments, and fields prohibited by the owning data policy are never made visible through Support Access.

A Support Access Grant is an affirmative Product Application action by an authorized Workspace Owner. It binds one support case, the Workspace, named active Platform Operators, explicit content categories and Projects, a stated reason visible to the Workspace, creation and expiry, and a revision. Absence of a response, a support ticket, a Platform Permission, instance ownership, or an operator request never creates a grant.

The grant is strictly read-only and least-scope. It creates no Workspace membership, tenant role, Product Session, Workspace API token, impersonation identity, content-mutation authority, approval authority, export entitlement, or access to data outside the recorded scope. Platform Operators still require the exact Platform support-read permission; the grant supplies tenant consent but never substitutes for Platform authorization.

Customer content is read through a dedicated Platform API support projection bound to the current Operator, case, grant revision, target scope, and Audit correlation. The Product API and Product Application never receive an Operator-as-member Session. A copied URL, cached response, Drawer state, personal Saved view, or case assignment cannot widen or preserve access.

The Workspace Owner can inspect active and expired grants, named Operators, scope, reason, expiry, and access history in the Product Application and can revoke an active grant at any time. Expiry, revocation, Workspace deletion, Operator deactivation, case closure, scope change, or permission loss blocks every new content read and in-progress paginated or streamed continuation at a server revocation barrier; retained Audit evidence remains.

Every grant creation, scope change, use, denial, expiry, and revocation records actor, case, Workspace, named Operator, content category and target summary, grant revision, result, timestamp, and correlation identity without copying customer content into Audit. Workspace-visible history uses customer-safe action language and never exposes unrelated internal notes or other tenants.

Primary copy uses stable bilingual keys such as `tenants:SUPPORT_ACCESS_REQUIRED` for “需要工作空间授权 / Workspace approval required,” `tenants:SUPPORT_ACCESS_EXPIRES_AT` for “访问权限将于 {{time}} 到期 / Access expires {{time}},” and `tenants:SUPPORT_ACCESS_REVOKED` for “工作空间已撤销访问权限 / The Workspace revoked access.” The Product Application uses its owning Workspace-settings namespace for “支持访问 / Support access,” “允许查看以下内容 / Allow access to the following content,” and “撤销访问 / Revoke access,” rather than “impersonate,” “elevate,” or permission-code terminology.

## 8. Project directory capability contract

Project list/detail adds operator-relevant projections:

- workspace and owner identity;
- active/suspended state and restriction reason category;
- environment/runtime/deployment health;
- domain summary and latest release/activity;
- member count and key access context;
- usage/cost attribution summary plus coverage;
- created/updated timestamps and navigation targets.

The Drawer groups Overview, Runtime & domains, Access, Usage, Activity, and Actions. It supports navigation to the Platform project record, Workspace, owner, audit rows, request records, and relevant observability filters. It does not replicate the full project settings UI or show customer-authored content without a valid Support Access Grant.

Implementation must inventory existing project actions and APIs, remove dead/duplicated UI, and add only capabilities backed by authoritative services. Runtime state, domain state, and usage values must identify their data source and freshness.

## 9. Filters, order, and actions

### Users

Filters: account/admin status, authentication/2FA state, created/last-active range, workspace/project ownership or membership. Order: created, last active, name, workspace/project count where indexed.

### Workspaces

Filters: active/archived/suspended, Plan, Subscription lifecycle, commercial access state, Restricted Recovery Mode, recovery deadline, owner, created/activity range, usage/credit risk. Order: created, activity, members/projects, usage/credit risk, renewal or recovery deadline where supported.

### Projects

Filters: active/suspended, workspace, owner, environment/runtime health, domain/release state, created/activity range. Order: created, activity/release, members, usage, health severity where supported.

Menu actions are state-aware and do not repeat the ghost primary Details action. Every mutation reconciles the list immediately and clears selection when a row exits the active filter.

## 10. Unified access-restriction domain

Stable restriction reasons are distinct from lifecycle state:

- `user_disabled`;
- `workspace_suspended`;
- `workspace_archived`;
- `project_suspended`.

The stored restriction includes entity, state, reason category/code, productized operator note, effective timestamp, actor, optional review/expiry timestamp, revision, and audit linkage. Do not persist a translated reason as the only authority.

Archive is an owner lifecycle choice; suspension/disable is an enforced access restriction. UI, API errors, filters, and audit events must not conflate them.

Payment Restricted and Restricted Recovery Mode are commercial access state, not access restrictions. They do not create an `AccessRestrictionRecord`, revoke Product Sessions, or use `WORKSPACE_SUSPENDED`. If both states exist, the security/lifecycle access restriction is evaluated first; lifting it reveals the still-current commercial recovery mode rather than silently restoring normal writes.

## 11. API enforcement

### 11.1 Stable error contract

Restricted access returns HTTP `403` in accordance with `error-contracts.md`, plus one stable code: `USER_DISABLED`, `WORKSPACE_SUSPENDED`, `WORKSPACE_ARCHIVED`, or `PROJECT_SUSPENDED`. An unauthenticated or revoked session still uses the canonical `401` auth contract. Do not disguise a known restriction as `404`.

A value-expanding command denied only by Restricted Recovery Mode returns HTTP `402` with `WORKSPACE_PAYMENT_RESTRICTED`, not a restriction code. Authorized reads, stored downloads, export, payment recovery, support, security reduction, privacy, and lifecycle commands continue through their ordinary contracts.

Safe client metadata may include restriction type, localized reason key/category, effective/review timestamp, support availability, and allowed recovery actions. Internal operator notes and actor identity are not exposed to ordinary users.

### 11.2 Server boundary

- Authentication rejects disabled users and revokes/invalidates active sessions as defined by identity contracts.
- Every workspace/project resolver and read/mutation service applies the same restriction authority; individual repositories must not implement divergent filters.
- After identity, scope, and access-restriction authorization succeeds, the central commercial command policy classifies the requested Product API effect. Route hiding, module-local Subscription checks, and worker-only enforcement cannot replace this boundary.
- Invitation preview/accept, publish/release, background job submission, credential issuance, and write APIs are explicitly covered.
- Running or queued state-changing jobs are cancelled or blocked according to job safety semantics; the restriction transition reports anything that cannot be recalled.
- Super-admin management routes use a narrow explicit recovery exemption so an authorized operator can inspect and restore the entity.

The Dialog is not the security boundary. Direct API requests and DOM editing must still fail.

## 12. Client restriction boundary

The global API transport recognizes stable restriction codes and updates a central restriction state. Scope bootstrap also evaluates restriction metadata before rendering protected content.

The app displays a non-bypassable product blocker for the affected scope:

```text
[Lucide status icon]
Workspace access is suspended
Your workspace is temporarily unavailable because ...
[Switch workspace] [Contact support] [Sign out]
```

- User disable blocks the authenticated application and permits sign-out/support only.
- Workspace/project restriction blocks that scope while allowing an authorized switch to another scope.
- Archive may offer the owner restore flow when permitted.
- Browser Back, deep links, overlay navigation, cached React trees, and edited DOM cannot reveal an operational protected screen because data/API access remains denied and the scope boundary rerenders.
- The blocker does not expose internal notes or raw ids and uses the shared feedback/support entry when contact is available.

Restricted Recovery Mode does not render this blocker. The Product Application retains its normal shell and read navigation with a persistent payment-recovery notice and explicit retained/blocked capabilities. Existing-data views and canonical export remain operational; blocked controls explain the commercial state, while direct requests still fail at the server boundary. The commercial notice never claims that the Workspace is suspended, archived, deleted, or on Free.

The Owner and effective Billing Managers see the primary Provider recovery action. Other members see sanitized state and authorized Billing Manager/Owner contact guidance without payment details or Provider URLs. Platform directory users may investigate the projected authority but cannot launch the tenant recovery surface or delegate Billing Managers.

## 13. Restriction transitions and recovery

Operator suspend/disable confirmation explains:

- affected entity and current active sessions/users;
- blocked reads/writes, invitations, publishing, jobs, and credential effects;
- reason category and user-facing message;
- whether the action is immediate and reversible;
- any work that cannot be recalled.

The restore flow shows the current restriction, revision, and residual manual recovery steps. All transitions use optimistic concurrency and idempotency. A stale revision returns conflict and current state.

## 14. State and failure matrix

| Situation | Required behavior |
|---|---|
| Identity deleted after audit row | Show last-known name plus deleted state |
| Commerce provider stale | Show captured timestamp/stale status; do not invent current totals |
| Usage attribution partial | Show coverage and exclude unsupported claims |
| Plan change conflict/failure | Preserve current subscription and show provider/domain error |
| Payment Restricted remains unresolved indefinitely | Preserve Workspace data; show no Commerce-owned deletion countdown or purge action |
| Settings manager or Commerce operator requests Workspace deletion without Owner/legal authority | Reject; do not reuse the legacy direct delete path |
| Legal/privacy deletion request lacks case evidence or is blocked by a legal hold | Fail explicitly in the lifecycle workflow without mutating Workspace data |
| Provider recovery arrives after completed lifecycle deletion | Reconcile commercial/provider state without resurrecting the Workspace |
| Payment Restricted Workspace opens a read route | Render the normal product view with the persistent recovery notice |
| Payment Restricted Workspace invokes a value-expanding command | Return `402 WORKSPACE_PAYMENT_RESTRICTED` before dispatch; do not set access-restriction state |
| Payment Restricted Workspace performs an authorized export or security reduction | Allow the canonical command and preserve its normal permission/audit requirements |
| Workspace Suspension and Payment Restricted coexist | Return the security/lifecycle `403` blocker first; after restore, expose Restricted Recovery Mode until payment recovery succeeds |
| Ordinary member opens the payment-recovery notice | Show sanitized state and Owner/Billing Manager contact guidance; do not create a Provider session |
| Billing Manager opens recovery | Require `workspace:commerce:manage`, create the actor-bound tenant recovery session, and audit the action |
| Platform Operator inspects a restricted Workspace | Show authorized commercial and Billing Manager projection without impersonation or tenant Provider Portal action |
| Platform Operator opens customer content without an active matching grant | Deny with Workspace-approval guidance; do not return a partial body, membership Session, or existence detail outside the authorized projection |
| Workspace Owner revokes a grant while content is open | Block the next read and every pagination or stream continuation at the server barrier; preserve no usable cached authorization |
| Support case closes or Operator is deactivated | Expire or revoke the grant association and deny future reads without deleting access evidence |
| Suspend while jobs run | Report cancelled, blocked, and non-recallable jobs explicitly |
| Restricted deep link | Render global blocker; protected API remains denied |
| Super-admin recovery | Explicit exempt management endpoint remains audited |
| Bulk selection includes invalid state | Disable action with per-row reason or server returns structured partial validation before execution |
| Network offline | Cached data marked stale; high-risk actions unavailable with explicit reason |

## 15. Audit and telemetry

Audit directory updates, session/security actions, plan/subscription changes, restriction transitions, archive/restore, ownership changes, accepted deletion authority, lifecycle retention/purge transitions, and destructive operations with actor, target, before/after safe summary, idempotency/correlation id, and result.

Support Access Audit records grant lifecycle and every customer-content read with case, Workspace, named actor, explicit scope, grant revision, result, and correlation identity while excluding content bodies and unrelated internal notes. The Product Application exposes the customer-safe history to authorized Workspace Owners.

Operational metrics include directory query latency/result size, commerce freshness, plan-change failures, restriction denials by type, blocker displays, support opens, and restore time. Do not record private hover-card contents as analytics payload.

## 16. Tests and acceptance criteria

- Navigation tests proving Tenant Governance opens Workspaces by default, Users and Projects are peer views, and no Tenant Overview or decorative KPI route remains.
- API tests for list filters/order/indexed pagination, identity projections, commerce authority, plan mutation delegation, and project operational projection.
- Direct API integration tests for every restriction type across read, mutation, invitation acceptance, publish, job submission, and super-admin recovery.
- Component tests for hover/focus identity card, icon-plus-name cells, truncation-only Tooltip, immediate cache reconciliation, exact Commerce deep links, project Drawer, and blocker recovery actions.
- Browser tests that edit/remove the blocker DOM and call protected endpoints to prove server enforcement.
- Browser evidence for all three directories at desktop/narrow widths, populated/empty/filtered/error states, keyboard identity cards, stale/partial commercial data, and suspended scopes.
- Lifecycle authorization tests proving only explicit Workspace Owner instructions or documented legal/privacy cases can begin deletion, while settings managers, Platform Roles, Commerce permissions, commercial age, restriction state, and Hosting state cannot.
- Migration tests proving the direct settings-manager hard-delete path and any Platform directory delete facade are removed at hard cut rather than retained as aliases.
- Retention/recovery tests proving archive and commercial restriction do not advance purge state, legal holds fail visibly, and later Provider recovery cannot resurrect a lifecycle-deleted Workspace.
- Commercial/access interaction tests proving Payment Restricted never creates an Access Restriction record, permitted reads and recovery-mode exceptions remain available, value-expanding commands return exact `402` metadata, and a concurrent security restriction takes precedence without erasing commercial state.
- Tenant-governance tests proving Billing Manager projections obey Platform visibility, Platform Commerce permissions cannot mint tenant Provider sessions, and operator investigation never mutates Workspace RBAC.
- Support Access tests proving Workspace Owner authority, named-Operator and exact-scope binding, case and expiry enforcement, separate Platform permission, default denial, read-only behavior, no Product Session or membership creation, secret exclusion, and direct API denial without both authorization layers.
- Revocation-race tests proving expiry, Owner revocation, case closure, Operator deactivation, permission loss, Workspace deletion, pagination, streaming, copied URLs, caches, and Saved views cannot preserve or widen customer-content access.
- Browser tests covering Workspace-side grant review/revoke/history, Platform-side approval-required/active/expired/revoked states, both locales, keyboard access, customer-safe copy, and absence of impersonation or internal permission terminology.
- Frontend tests proving Restricted Recovery Mode preserves the product shell and read navigation, exposes one persistent recovery notice, never renders the suspension blocker, and cannot be bypassed through hidden controls or direct API calls.

Acceptance requires one Tenant Governance Platform Domain with a Workspace-first queue and peer User/Project views; no Tenant Overview, duplicated cross-domain mutation, or Workspace Administration facade; no standing Platform access or impersonation path to customer-authored content; no customer-content read without a matching Workspace Owner Support Access Grant and exact Platform permission; no workspace/project identity rendered as a generic Tag; no Tooltip on fully visible ordinary text; no frontend-derived billing totals; no restriction represented only as 404; no commercial state authorizing deletion; no Payment Restricted state masquerading as Workspace Suspension; and no protected action succeeding after client-side blocker manipulation.
