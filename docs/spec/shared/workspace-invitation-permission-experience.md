# Workspace Invitation and Permission Experience Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Product and Platform Separation Implementation Contract](./product-platform-separation.md)

## 1. Scope

This contract defines the workspace settings invitation experience, token preview/authentication/acceptance/onboarding flow, Pending/Accepted/Invitation links DataTables, Plan-governed Fixed Member access, and a server-driven localized permission and role matrix that updates when the catalog changes, including Owner-delegated Billing Manager authority.

It extends `identity-access-contracts.md` and `conditional-permissions.md`. Server authorization remains authoritative; this document defines product projections, state transitions, and Admin behavior.

## 2. Current-state evidence

- workspace invitations already expose Pending, Accepted, and Links tabs with create, renew, revoke/disable, copy, and pagination, but the tables and cache behavior still carry legacy implementation patterns;
- current invitation links use a code-plus-HMAC token, including `il_`/`ilg_` link prefixes and `ei_`/`eig_` email prefixes;
- preview and existing-account acceptance endpoints exist, and unauthenticated flows return through Login/Register to `/invitations` before onboarding completion;
- existing-account acceptance currently needs regression coverage for users with memberships in organizations other than the invitation's target organization; target membership lookup must never select an arbitrary first organization;
- workspace permission and action APIs plus a backend permission catalog already exist, and core templates include some i18n metadata;
- tenant Checkout, Customer Portal, and Credit Ledger routes currently use broad membership/manage-access dependencies rather than a dedicated billing permission, so ordinary membership and settings roles are not safely separated from payment authority;
- the workspace settings permission screen currently wraps a locally managed role matrix; some action definitions still have only English descriptions and catalog revision/refresh semantics are incomplete.

## 3. Non-goals

- Changing the cryptographic token format without a verified security need and migration plan.
- Exposing signed tokens in historical list responses after creation/renewal.
- Hardcoding a second permission catalog in Admin.
- Granting plugin permissions after plugin uninstall without retained/deprecated lifecycle handling.
- Claiming optimistic role changes succeeded before the server accepts the revision.
- Treating Workspace Billing Manager authority as Platform Commerce permission, general settings administration, or an immutable frontend role list.
- Treating Free Plan member equality as shared Workspace ownership or permitting a frontend-hidden role mutation through an API, invitation, link, or replayed payload.

## 4. Invitation lifecycle and token contract

Canonical invitation types remain email invitations and reusable invitation links. Each record has a target organization/workspace, Plan-valid access projection, inviter, status, created/expiry timestamps, use limit/count where applicable, revision, and audit linkage. A role/grant selection exists only when the Workspace's bound Plan Revision includes `workspace.roles.manage`; otherwise acceptance always applies Fixed Member access.

- Signed token plaintext is returned only at create or renew/rotate time and is displayed once with an explicit copy action.
- List/detail projections return a safe code/id and token suffix/fingerprint when useful, never a reusable signed token.
- Preview validates signature, type, expiry, revocation/disabled state, use limit, target workspace state, and email binding before presenting acceptance.
- Acceptance is idempotent for the user/invitation pair and uses an explicit transaction around membership/grants/use count/audit state.
- Target organization membership lookup is scoped by target organization/workspace. An unrelated membership must not trigger a cross-organization denial.

## 5. End-to-end acceptance flow

```text
Open invitation link
  → server preview
  → invalid/expired/revoked/used/disabled explicit state
  → authenticated?
      no  → Login or Register with signed return target
              → restore preview after auth
      yes → review workspace, inviter, Plan-valid access, email binding
  → Accept
  → transactional membership/grants
  → required onboarding steps
  → open accepted workspace
```

- The return target is server/route validated and cannot become an open redirect.
- Registration and Login preserve only the invitation reference needed to resume; they do not expose it to unrelated analytics/logging.
- A new account completes the canonical onboarding flow with invitation context. An existing account runs only missing required steps.
- Already-member acceptance returns a stable idempotent result and navigates to the target workspace when permitted.
- Email-bound mismatch explains the expected account and offers safe account switching; it does not reveal additional user data.
- Disabled/suspended/archived target states use the restriction contract and do not create membership.

## 6. Required regression matrix

The exact token shape represented by the reported `il_...<dot>...` link must be covered through a non-secret generated fixture with the same prefix and structure.

| Case | Expected result |
|---|---|
| Valid link, signed-out existing user | Login, restored preview, acceptance, workspace open |
| Valid link, new user | Register, restored preview, acceptance, onboarding, workspace open |
| Existing user with unrelated organization membership | Target-scoped acceptance succeeds when policy allows |
| Already target member | Idempotent accepted/already-member result |
| Email-bound invitation and matching account | Acceptance succeeds |
| Email-bound invitation and different account | Explicit mismatch, no use count consumed |
| Expired token | Stable expired state, renewal contact guidance |
| Revoked/disabled link | Stable unavailable state, no membership |
| Maximum uses reached | Stable exhausted state, no membership |
| Invalid signature/type | Invalid invitation state without parsing detail leak |
| Workspace archived/suspended | Restriction state, no membership |
| Concurrent final use | Exactly one transaction consumes the remaining use |
| Repeated accept request | Same result, no duplicate membership/audit side effect |

## 7. Invitations settings composition

```text
Invitations                                        [Invite member] [Create link]
[ Pending ] [ Accepted ] [ Invitation links ]
───────────────────────────────────────────────────────────────
[Search] [Order ▼] [Filters] [Reset]                [Table tools]
[DataTable]
```

All three tabs use the shared DataTable, search/filter/order controls, server pagination, column preferences, explicit loading/empty/filtered/error states, and keyboard row/actions.

### 7.1 Pending

Columns: selection for safe batch revoke/resend, Invitee, Role/access, Delivery state, Expires, Inviter, Created, Actions.

Primary ghost action opens detail/edit where supported. Menu actions: copy safe link only when the current operation explicitly returned it, resend email, renew/rotate, change role before acceptance, revoke, and view audit. A stored signed token must not be reconstructed from the row.

When `workspace.roles.manage` is excluded, Role/access renders the localized Fixed Member access label and no create, edit, filter, or batch control accepts a role. “Change role” is absent rather than disabled inside a dialog that cannot succeed.

### 7.2 Accepted

Columns: Member identity, Accepted role/access, Inviter, Accepted at, Source/type, Actions. This is an acceptance history view, not a second member-management surface. Actions navigate to member detail/audit and do not duplicate unrelated security controls.

On Fixed Member access, this column uses the same stable access label for every non-Owner acceptance and never implies that the inviter selected a role.

### 7.3 Invitation links

Columns: Name/label, Role/access, Status, Uses/limit, Expires, Creator, Updated, Actions. Menu actions: copy only a newly created/rotated token held in ephemeral UI state, rotate/renew, enable/disable, view acceptance history, and revoke/delete according to retention policy.

Invitation links created under Fixed Member access bind no selectable role. A later request cannot add one unless the current Plan includes role management and the actor passes the normal permission and revision checks.

## 8. Cache and concurrency contract

Invitation mutations return updated projections and revision. On success the client updates/invalidate Pending, Accepted, Links, workspace member count/list, and invitation summary caches as applicable before success notification. Status, use count, and row eligibility change without page refresh.

Optimistic enable/disable/role edits retain prior rows. Failure rolls back all caches. Accept/renew/revoke use idempotency keys. Revision mismatch returns explicit conflict and latest row.

## 9. Invitation authorization, audit, and delivery

- Creating, changing access, rotating, resending, and revoking require explicit workspace permissions.
- Invitation creation and acceptance re-evaluate the current bound Plan Revision. When role management is excluded, any supplied or retained selectable role fails with `WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED`; the server never ignores it and silently applies different access.
- The server validates granted roles/permissions against the live catalog and inviter delegation authority.
- Email delivery is durable and its delivery state is visible; accepted membership is never rolled back because a confirmation email failed.
- Audit invite create, send, delivery failure, rotate, role/access change, revoke, preview denial category, accept, already-member result, and membership creation without recording signed tokens.

## 10. Dynamic permission catalog

### 10.1 Catalog item

Every public permission/action has:

- stable code;
- module/group and deterministic order;
- localized name key and localized description key with `zh-CN` and `en-US` resources;
- scope and action/resource semantics;
- owner (`core` or plugin id);
- condition-support schema/reference;
- lifecycle: `active`, `deprecated`, or `retained_unavailable`;
- replacement code when deprecated;
- catalog revision.

Descriptions explain what the permission allows and its meaningful boundary. Raw codes remain secondary operator diagnostics.

### 10.2 Workspace Commerce permission

The core catalog includes `workspace:commerce:manage` with Workspace scope, Commerce grouping, complete `zh-CN`/`en-US` metadata, no condition schema in the first contract, and a sensitivity description that it can create Provider-hosted Checkout/Portal sessions and change the tenant Subscription.

- The Workspace Owner is always authorized and its effective grant is immutable.
- Only a Workspace Owner may add or remove the permission from a custom role.
- When the bound Plan Revision includes `workspace.roles.manage`, any number of active members may receive the permission through Owner-managed custom roles; an effective holder is presented as a Billing Manager. A Plan without role management has no non-Owner Billing Managers.
- Billing Manager is a derived responsibility, not a new hard-coded system role. It grants no settings, team, content, Platform, Provider-configuration, Credit-adjustment, or lifecycle authority.
- Admin, `system:settings:manage`, organization roles, existing membership, and Platform Commerce Permissions never imply this permission.
- Restricted Recovery Mode preserves existing effective Billing Managers but rejects new role or permission grants until commercial access returns to normal.

Role projections include the count and safe identities of affected Billing Managers when the viewer may manage roles. A draft that adds or removes `workspace:commerce:manage` shows the exact members whose tenant billing authority will change before save.

### 10.3 Plan-governed Workspace role management

The registered `workspace.roles.manage` Entitlement governs the role-management product capability without replacing Workspace authorization:

- the Free Plan explicitly excludes it and applies the immutable built-in Fixed Member access profile to every active non-Owner member;
- Workspace Owner is an ownership invariant, not a selectable role; it remains the sole tenant billing, ownership-transfer, and Workspace-deletion authority regardless of Plan;
- excluded Workspaces cannot create, edit, duplicate, or delete roles; edit permission grants; select invitation roles; or assign member roles through any Product API, Job, Tool, import, or replay path;
- included Workspaces receive the revisioned role-management surface only when the actor also holds its exact Workspace permission; the Entitlement alone grants no action;
- a Plan badge and plain-language explanation may advertise role management, but navigation visibility and disabled controls never enforce it.

Fixed Member access is not an empty or inferred role. Its permission set comes from the immutable built-in member profile, is resolved by the canonical Workspace authorization engine, and cannot be changed per member. Owner-only authority is evaluated separately and cannot be copied into that profile.

### 10.4 Member-assigned paid capability access

A Feature Seat Assignment allocates one Workspace-owned paid capability to one active membership without modifying that member's roles or permissions.

- Plan & Usage owns the commercial capacity summary; Members owns assignment to active people. Neither surface copies Plan editing or role management.
- Seat assignment is never offered on an invitation or reusable invitation link. Acceptance first creates an active membership; a separately authorized assignment may follow.
- Member detail shows localized capability names, assigned/not assigned state, and a plain-language reason when the Workspace Plan does not include the capability or has no place remaining. Raw Entitlement keys and commercial authority terms remain secondary diagnostics.
- Removing, deactivating, or accepting a member departure releases their Feature Seat Assignments transactionally. Renewing an invitation, changing a role, or rejoining never restores them implicitly.
- Role and permission editors contain no Feature Seat assignment controls. The permission catalog may grant `workspace:feature-seats:manage`, but a seat itself grants no permission. Assignment APIs revalidate active membership, Workspace Entitlement, current seat limit, expected revision, idempotency, and immutable Owner or exact permission authority.
- A member-assigned capability is evaluated only after the Workspace passes rollout eligibility. Assignments cannot target a User outside the Workspace or create a per-User rollout exception.
- The Workspace Owner always manages Feature Seat Assignments. A non-Owner needs `workspace:feature-seats:manage`; broad team, settings, Billing Manager, Organization, Project, or Platform authority does not imply it. The permission allows self-assignment within current capacity because assignment is its explicit responsibility and every result is audited.
- `workspace:feature-seats:manage` cannot change the Plan, Subscription, seat limit, role definitions, membership, the capability's action permission, or runtime gates. On a Plan without role management it cannot be delegated, leaving assignment with the Owner alone.
- An access-reducing Plan change uses the Commerce-owned Plan Access Convergence preview rather than preserving this page's roles or assignments as inactive state. The preview names affected members, roles, pending invitations/links, Billing Managers, Feature Seat managers, and Feature Seat Assignments before the Plan change is scheduled.
- At the effective boundary, a target without role management end-dates custom roles and member role assignments, applies Fixed Member access, and invalidates role-bearing pending invitations and links atomically with the target Revision binding. A lower Feature Seat allowance retains only the assignments explicitly selected in the reviewed plan.
- Ended access configuration remains history only. Role, member, invitation, and feature-access screens expose no “restore previous configuration” action after re-upgrade and never repopulate drafts from the ended records.

### 10.5 Revision and refresh

The catalog endpoint returns an HTTP `ETag` derived from the catalog revision. Admin sends `If-None-Match` and treats `304 Not Modified` as unchanged. It performs this conditional refetch on:

- settings overlay open/focus;
- window reconnect/refocus after staleness;
- plugin install/enable/disable/uninstall success;
- role mutation conflict indicating a newer catalog revision.

Automatic refresh preserves compatible local drafts and explicitly flags permissions added, changed, deprecated, or removed. It never silently discards unsaved role changes.

## 11. Permission and role API contract

Required responses include catalog revision, localized metadata, roles with permission grants/conditions, system/custom source, immutable/system semantics, and row revision.

Role update requests contain:

- role revision and catalog revision;
- complete intended permission/grant set or an explicit patch contract;
- condition sets validated by `conditional-permissions.md`;
- idempotency key for save retries.

The server validates permission existence/lifecycle, workspace scope, actor delegation, protected/system role constraints, condition schema, and plugin availability in one transaction. Revision mismatch returns the latest catalog/role diff.

Before role or grant validation, the server evaluates the bound Plan Revision. Excluded role management returns `WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED` with stable current/required Plan metadata and performs no mutation; it does not downgrade the request into Fixed Member access or leak the permission catalog.

For `workspace:commerce:manage`, delegation validation additionally requires the actor to be a Workspace Owner. Possessing the permission, `system:settings:manage`, or team-role management is insufficient. The resulting audit identifies affected roles and members without recording Provider URLs or payment details.

## 12. Permission page composition

```text
Roles & permissions                                  [Create role]
Manage who can perform workspace actions. Catalog revision ...

[Search permissions or roles] [Group filter] [Changed only]
┌ Permission                                    Owner │ Role A │ Role B │
│ Content                                                    ...       │
│  Edit entries — create and update ...        Core  │   ✓    │   —    │
│  Publish entries — release approved ...      Core  │   ✓    │   ✓    │
│ Integrations                                               ...       │
│  Manage provider ...                        Plugin │   —    │   ✓    │
└──────────────────────────────────────────────────────────────────────┘
[Discard changes] [Save 2 roles]
```

- Render entirely from the server catalog and role projections. Frontend code may define presentation components, not permission inventories.
- Group rows use localized module names. Each permission shows localized name and description, condition count/editor affordance, owner, and lifecycle warning.
- System roles are visibly read-only with localized source/rationale.
- Custom roles support create from live templates, rename/description, grant conditions, duplicate, and confirmed delete when membership dependencies permit.
- The Workspace Commerce group renders `workspace:commerce:manage` with a high-sensitivity explanation and Billing Manager impact preview. Non-Owner editors see its effective grants read-only rather than an enabled checkbox.
- The matrix uses a bounded sticky region and remains operable at narrow widths through an accessible role-first alternative view; horizontal scrolling must not hide the selected permission context.

When role management is excluded, Admin does not mount this matrix or issue its catalog/role queries. The disabled Roles & Permissions navigation entry shows the eligible Plan badge and opens the exact `Plan & Usage` explanation. Member and invitation surfaces use localized Fixed Member access copy and omit role selectors, matrices, role filters, and edit affordances.

## 13. Optimistic save and conflict behavior

- Checkbox/condition edits update a local immutable draft and visibly mark changed roles.
- Save may batch changed roles only when the API provides one atomic/batched contract; parallel page-level mutations that partially succeed without a result ledger are prohibited.
- On success, role, membership-context, permission-access, and invitation-role caches reconcile before success notification.
- On validation failure, keep the draft and annotate the exact permission/role.
- On revision/catalog conflict, show added/removed/changed definitions and offer intentional rebase or reload. No silent last-write-wins.
- Discard restores the latest server baseline after confirmation when multiple edits exist.

## 14. Plugin permission lifecycle

Plugin disable/uninstall first calculates affected roles, members, policies, invitations, and running operations.

- A permission with retained grants becomes `retained_unavailable`, remains visible with source/status, and grants no executable capability while unavailable.
- Re-enabling a compatible plugin restores availability only after validation.
- Permanent removal requires an audited migration to a replacement or explicit grant removal review.
- The catalog must not silently delete a code and thereby make the UI appear more restrictive while stale backend grants remain.

## 15. State and failure matrix

| Situation | Required behavior |
|---|---|
| Invitation list empty | Tab-specific shared Empty and real create action when authorized |
| Mutation removes row from filter | Cache/selection reconcile immediately |
| Token no longer available after reload | Explain rotate/create requirement; do not fabricate link |
| Email delivery failed | Pending row shows failed delivery and authorized retry |
| Catalog refresh with local draft | Preserve compatible changes and show definition diff |
| Permission deprecated | Visible warning/replacement; existing role is not silently changed |
| Plugin unavailable | Retained permission visible but non-executable |
| Role save partially invalid | Atomic rejection or structured batch ledger; never false global success |
| Non-Owner grants or revokes `workspace:commerce:manage` | Reject the complete role mutation with an Owner-required error and preserve the draft |
| Owner grants permission to several custom roles | Recompute and deduplicate effective Billing Managers before showing the saved result |
| Restricted Recovery Mode attempts a new Billing Manager grant | Reject as access expansion; existing Owner and Billing Managers keep recovery authority |
| Platform Operator or settings Admin expects billing access | Show no tenant billing grant unless the user independently holds `workspace:commerce:manage` in that Workspace |
| Free member or invitation supplies a role code | Reject with `WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED`; do not ignore, persist, or partially apply the code |
| Free member opens Roles & Permissions | Open the exact Plan explanation from the disabled navigation entry; do not mount the matrix or fetch protected catalog data |
| Free ordinary members compare access | Show the same Fixed Member access label; identify Owner separately without presenting ownership as an assignable role |
| Member has required role but no Feature Seat Assignment | Show the member-allocation explanation; do not present an upgrade or permission-denied message |
| Member has Feature Seat Assignment but lacks Workspace Permission | Deny with the normal permission explanation; the seat does not elevate the member |
| Invitation attempts to reserve or carry a Feature Seat | Reject; create the active membership first and use the separate assignment workflow |
| Last available Feature Seat is assigned concurrently | Exactly one revisioned assignment succeeds; the loser receives current usage without a partial grant |
| Member manager or Billing Manager expects Feature Seat authority | Deny unless the actor is Owner or independently holds `workspace:feature-seats:manage` |
| Authorized seat manager assigns a seat to themselves | Apply the normal revision/capacity/audit contract; do not grant the capability's action permission |
| Restricted Recovery Mode receives a seat mutation | Allow revocation, but reject new assignment or movement as access expansion |
| Downgrade target excludes role management | Require a named-member convergence preview; at effectiveness apply Fixed Member access and invalidate role-bearing pending invitations |
| Downgrade target has fewer Feature Seats | Require exact retained assignments within the target limit; never choose members automatically |
| Later upgrade follows a Free period | Start from current Fixed Member access and no Feature Seat Assignments; expose no automatic restore action |
| Offline | Preserve drafts; disable save/accept with explicit offline state |

## 16. Tests and acceptance criteria

- API integration tests for the full invitation matrix, especially target-scoped organization membership lookup and concurrent final use.
- Tests prove signed token absence from list/detail/audit/log projections and idempotent acceptance.
- Component/browser tests for three DataTables, URL/overlay controls, token one-time display, immediate mutations, failed delivery, Login/Register resume, and onboarding.
- Permission contract tests ensure every public core/plugin item has both locale resources, deterministic grouping, revision, lifecycle, and valid condition metadata.
- Role API tests for delegation, protected roles, catalog/role conflicts, atomic save, plugin lifecycle, and cache-impact projections.
- Billing permission tests for immutable Owner authority, Owner-only delegation, multiple custom roles, deduplicated effective Billing Managers, no implicit Admin/settings/organization/Platform grant, Restricted Recovery denial of new grants, and safe impact/audit projections.
- Free Plan tests for Fixed Member access, Owner invariants, invitation acceptance without role selection, rejection of role-bearing payloads, and direct denial of role/member-role/permission-grant mutations across API, Job, Tool, import, and replay entry points.
- Entitlement/permission composition tests proving `workspace.roles.manage` inclusion grants no Workspace permission and exclusion never bypasses the permissions required for invitations, membership, or ordinary Workspace actions.
- Component/browser tests for live catalog refresh, local-draft preservation, localized semantic labels/descriptions, system-role read-only state, narrow alternative view, keyboard matrix operation, and rollback/error annotation.
- Component/browser tests for the disabled Plan-badged Roles & Permissions entry, exact bilingual Plan explanation, absent role controls and catalog requests on Free, common non-Owner access labels, and separate immutable Owner presentation.
- Feature Seat tests for active-member-only assignment, no invitation reservation, role/seat independence, concurrent last-place allocation, membership-removal release, no implicit rejoin restoration, and distinct Plan, assignment, permission, rollout, readiness, and health explanations.
- Feature Seat permission tests for immutable Owner authority, exact delegable permission, self-assignment, no broad-authority implication, inability to change Plan/roles/membership, and Restricted Recovery revoke-versus-expand behavior.
- Plan Access Convergence tests for affected-member preview, role and invitation retirement, explicit retained-seat selection, Fixed Member application, historical-only records, no later automatic restore, and direct API denial of stale or missing convergence identity.

Acceptance requires the reported link token shape to complete a tested acceptance path, no invitation mutation requiring a page refresh, no signed token in persistent list data, no frontend-hardcoded permission inventory, no permission without complete bilingual semantic metadata, and no tenant billing action authorized by generic Workspace manage access.
