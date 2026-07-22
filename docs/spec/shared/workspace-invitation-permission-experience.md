# Workspace Invitation and Permission Experience Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Admin Control Plane Productization Rollout](./admin-control-plane-rollout.md)

## 1. Scope

This contract defines the workspace settings invitation experience, token preview/authentication/acceptance/onboarding flow, Pending/Accepted/Invitation links DataTables, and a server-driven localized permission and role matrix that updates when the catalog changes.

It extends `identity-access-contracts.md` and `conditional-permissions.md`. Server authorization remains authoritative; this document defines product projections, state transitions, and Admin behavior.

## 2. Current-state evidence

- workspace invitations already expose Pending, Accepted, and Links tabs with create, renew, revoke/disable, copy, and pagination, but the tables and cache behavior still carry legacy implementation patterns;
- current invitation links use a code-plus-HMAC token, including `il_`/`ilg_` link prefixes and `ei_`/`eig_` email prefixes;
- preview and existing-account acceptance endpoints exist, and unauthenticated flows return through Login/Register to `/invitations` before onboarding completion;
- existing-account acceptance currently needs regression coverage for users with memberships in organizations other than the invitation's target organization; target membership lookup must never select an arbitrary first organization;
- workspace permission and action APIs plus a backend permission catalog already exist, and core templates include some i18n metadata;
- the workspace settings permission screen currently wraps a locally managed role matrix; some action definitions still have only English descriptions and catalog revision/refresh semantics are incomplete.

## 3. Non-goals

- Changing the cryptographic token format without a verified security need and migration plan.
- Exposing signed tokens in historical list responses after creation/renewal.
- Hardcoding a second permission catalog in Admin.
- Granting plugin permissions after plugin uninstall without retained/deprecated lifecycle handling.
- Claiming optimistic role changes succeeded before the server accepts the revision.

## 4. Invitation lifecycle and token contract

Canonical invitation types remain email invitations and reusable invitation links. Each record has a target organization/workspace, role/grants, inviter, status, created/expiry timestamps, use limit/count where applicable, revision, and audit linkage.

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
      yes → review workspace, inviter, role, email binding
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

### 7.2 Accepted

Columns: Member identity, Accepted role/access, Inviter, Accepted at, Source/type, Actions. This is an acceptance history view, not a second member-management surface. Actions navigate to member detail/audit and do not duplicate unrelated security controls.

### 7.3 Invitation links

Columns: Name/label, Role/access, Status, Uses/limit, Expires, Creator, Updated, Actions. Menu actions: copy only a newly created/rotated token held in ephemeral UI state, rotate/renew, enable/disable, view acceptance history, and revoke/delete according to retention policy.

## 8. Cache and concurrency contract

Invitation mutations return updated projections and revision. On success the client updates/invalidate Pending, Accepted, Links, workspace member count/list, and invitation summary caches as applicable before success notification. Status, use count, and row eligibility change without page refresh.

Optimistic enable/disable/role edits retain prior rows. Failure rolls back all caches. Accept/renew/revoke use idempotency keys. Revision mismatch returns explicit conflict and latest row.

## 9. Invitation authorization, audit, and delivery

- Creating, changing access, rotating, resending, and revoking require explicit workspace permissions.
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

### 10.2 Revision and refresh

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
- The matrix uses a bounded sticky region and remains operable at narrow widths through an accessible role-first alternative view; horizontal scrolling must not hide the selected permission context.

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
| Offline | Preserve drafts; disable save/accept with explicit offline state |

## 16. Tests and acceptance criteria

- API integration tests for the full invitation matrix, especially target-scoped organization membership lookup and concurrent final use.
- Tests prove signed token absence from list/detail/audit/log projections and idempotent acceptance.
- Component/browser tests for three DataTables, URL/overlay controls, token one-time display, immediate mutations, failed delivery, Login/Register resume, and onboarding.
- Permission contract tests ensure every public core/plugin item has both locale resources, deterministic grouping, revision, lifecycle, and valid condition metadata.
- Role API tests for delegation, protected roles, catalog/role conflicts, atomic save, plugin lifecycle, and cache-impact projections.
- Component/browser tests for live catalog refresh, local-draft preservation, localized semantic labels/descriptions, system-role read-only state, narrow alternative view, keyboard matrix operation, and rollback/error annotation.

Acceptance requires the reported link token shape to complete a tested acceptance path, no invitation mutation requiring a page refresh, no signed token in persistent list data, no frontend-hardcoded permission inventory, and no permission without complete bilingual semantic metadata.
