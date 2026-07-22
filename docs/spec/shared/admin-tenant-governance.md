# Admin Tenant Governance Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Admin Control Plane Productization Rollout](./admin-control-plane-rollout.md)

## 1. Scope

This contract defines the system user, workspace, and project directories; useful identity hover cards; workspace commercial and usage controls; project operational detail; identity cells; truncation-aware tooltips; and server-authoritative disabled/suspended access behavior.

Commercial figures and subscription mutations remain owned by `workspace-commercialization.md`. This contract defines their control-plane projection and interaction, not a second billing calculation.

## 2. Current-state evidence

- the user directory already supports detail/update, avatar, password/session/2FA/OAuth actions, disable/enable, and delete;
- the workspace directory supports detail/update, archive/restore, disable/enable, and delete, but its list/detail projection lacks plan, subscription, credits, and usage;
- the project directory supports detail/update, disable/enable, and delete, but exposes little operational context beyond workspace, owner, member count, and status;
- workspace and project records already have icon identity fields, while tables frequently render them as generic Tags;
- tenant tables overuse Tooltip regardless of whether text is actually truncated;
- user login checks active status and several workspace/project repositories filter inactive entities, but there is no unified restriction code or app-level blocker and some workspace denial is represented as not-found.

## 3. Non-goals

- Duplicating invoice/payment-provider administration in the directory.
- Making every hover card a full edit surface.
- Treating hidden frontend controls or an overlay Dialog as enforcement.
- Exposing internal ids as the primary identity of a user, workspace, or project.
- Adding bulk destructive actions merely because DataTable supports selection.

## 4. Shared directory composition

Every `/system/tenants/*` page uses:

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
- AI Credits balance, reserved/available amount, and reset/expiry semantics;
- usage summary with explicit measurement window and coverage;
- member/project counts, owner identity, status/archive state, and recent activity;
- billing-provider sync or data-freshness state without exposing secrets.

The directory never recalculates balances or plan limits from raw rows in the frontend.

### 7.2 Workspace detail

```text
Workspace identity and state
[Overview] [Members & projects] [Billing & usage] [Activity]
```

Billing & Usage explains current plan, entitlement/limit consumption, credits, billing period, invoices/provider navigation when available, and attribution coverage. Exact units and timestamps are shown.

Plan adjustment uses the canonical `PUT /system/commerce/workspaces/{workspaceId}/subscription` behavior. Review shows before/after plan, effective timing, proration/provider effect, entitlement/credit consequences, idempotency, and audit impact. It never directly edits duplicated directory fields.

### 7.3 Workspace actions

Contextual actions include open workspace, adjust plan, view billing/usage, archive/restore, suspend/restore, and delete when policy allows. Archive and suspension are distinct concepts and copy must explain their effects.

## 8. Project directory capability contract

Project list/detail adds operator-relevant projections:

- workspace and owner identity;
- active/suspended state and restriction reason category;
- environment/runtime/deployment health;
- domain summary and latest release/activity;
- member count and key access context;
- usage/cost attribution summary plus coverage;
- created/updated timestamps and navigation targets.

The Drawer groups Overview, Runtime & domains, Access, Usage, Activity, and Actions. It supports navigation to the project, workspace, owner, audit rows, request records, and relevant observability filters. It does not replicate the full project settings UI.

Implementation must inventory existing project actions and APIs, remove dead/duplicated UI, and add only capabilities backed by authoritative services. Runtime state, domain state, and usage values must identify their data source and freshness.

## 9. Filters, order, and actions

### Users

Filters: account/admin status, authentication/2FA state, created/last-active range, workspace/project ownership or membership. Order: created, last active, name, workspace/project count where indexed.

### Workspaces

Filters: active/archived/suspended, plan, subscription state, owner, created/activity range, usage/credit risk. Order: created, activity, members/projects, usage/credit risk, renewal date where supported.

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

## 11. API enforcement

### 11.1 Stable error contract

Restricted access returns HTTP `403` in accordance with `error-contracts.md`, plus one stable code: `USER_DISABLED`, `WORKSPACE_SUSPENDED`, `WORKSPACE_ARCHIVED`, or `PROJECT_SUSPENDED`. An unauthenticated or revoked session still uses the canonical `401` auth contract. Do not disguise a known restriction as `404`.

Safe client metadata may include restriction type, localized reason key/category, effective/review timestamp, support availability, and allowed recovery actions. Internal operator notes and actor identity are not exposed to ordinary users.

### 11.2 Server boundary

- Authentication rejects disabled users and revokes/invalidates active sessions as defined by identity contracts.
- Every workspace/project resolver and read/mutation service applies the same restriction authority; individual repositories must not implement divergent filters.
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
| Suspend while jobs run | Report cancelled, blocked, and non-recallable jobs explicitly |
| Restricted deep link | Render global blocker; protected API remains denied |
| Super-admin recovery | Explicit exempt management endpoint remains audited |
| Bulk selection includes invalid state | Disable action with per-row reason or server returns structured partial validation before execution |
| Network offline | Cached data marked stale; high-risk actions unavailable with explicit reason |

## 15. Audit and telemetry

Audit directory updates, session/security actions, plan/subscription changes, restriction transitions, archive/restore, ownership changes, and destructive operations with actor, target, before/after safe summary, idempotency/correlation id, and result.

Operational metrics include directory query latency/result size, commerce freshness, plan-change failures, restriction denials by type, blocker displays, support opens, and restore time. Do not record private hover-card contents as analytics payload.

## 16. Tests and acceptance criteria

- API tests for list filters/order/indexed pagination, identity projections, commerce authority, plan mutation delegation, and project operational projection.
- Direct API integration tests for every restriction type across read, mutation, invitation acceptance, publish, job submission, and super-admin recovery.
- Component tests for hover/focus identity card, icon-plus-name cells, truncation-only Tooltip, immediate cache reconciliation, plan review, project Drawer, and blocker recovery actions.
- Browser tests that edit/remove the blocker DOM and call protected endpoints to prove server enforcement.
- Browser evidence for all three directories at desktop/narrow widths, populated/empty/filtered/error states, keyboard identity cards, stale/partial commercial data, and suspended scopes.

Acceptance requires no workspace/project identity rendered as a generic Tag, no Tooltip on fully visible ordinary text, no frontend-derived billing totals, no restriction represented only as 404, and no protected action succeeding after client-side blocker manipulation.
