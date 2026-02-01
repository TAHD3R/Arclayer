# RFC: Accept Invite (v1) - Setup-Style 2-Step Wizard + Existing Account Join + System Roles

> Note (2026-01-31): This RFC is superseded by `docs/rfc/org-workspace-collaboration-and-invites-v2.md`.
>
> The v2 RFC changes the boundary model to **Organization → Workspaces**, and moves team collaboration and invites to the **workspace scope**.

Status: Draft (Approved in discussion; pending implementation)

Last Updated: 2026-01-31

Owners:
- Backend: (TBD)
- Frontend: (TBD)

## 1. Context

CelestialCMS already supports generating organization invitation links in the format:

`/accept-invite?token=<token>`

Backend currently supports **invite-only registration**:

- `POST /api/v1/auth/invitations/accept` creates a new user, creates/activates membership, binds roles, marks invitation as accepted, and returns a TokenPair.

Missing capabilities and UX gaps:

1) There is no public accept-invite page in the admin web app.
2) There is no "preview invitation" endpoint to show inviter/org/role/expires/email before any action.
3) There is no "existing account accept invite" endpoint; invited users with an existing account cannot join.
4) Multi-organization accounts require `X-Org-Id` selection (backend returns 409 if not selected). Frontend currently does not persist/attach an org selection, which can break post-login authz checks.

This RFC defines the v1 implementation for a setup-style onboarding flow that supports both **existing users** and **new users**, while keeping the invitation bound to a specific email address.

## 2. Goals

1) Provide a public `/accept-invite?token=...` onboarding page that reuses the **SetupLayout** visual style.
2) Implement a **2-step wizard**:
   - Step 1: Show invitation preview (inviter/org/role/expires/bound email).
   - Step 2: Let the user join via:
     - already logged-in account (requires confirmation modal),
     - login + join (existing account),
     - register + join (new account).
3) Enforce **email-bound invites**:
   - Accepting an invite must only be possible when `user.email == invitation.email`.
4) Ensure that invited roles can access the admin app:
   - All system built-in roles (Owner/Admin/Architect/Editor/Viewer) must include `admin:access`.
5) Provide a minimal **current organization** mechanism in the frontend:
   - After accepting an invite, automatically set current org to the invited org and attach `X-Org-Id` for subsequent org-scoped requests.

## 3. Non-goals

- No full organization switcher UI in v1 (only minimal currentOrgId persistence + header injection).
- No implementation of finance/project-transfer/global-delete permissions in v1 (future permission codes).
- No enforcement of "only one owner per org" in v1.
- No OAuth changes in v1.

## 4. UX Specification

Route: `/accept-invite?token=...`

Access:
- Public route (no auth required).
- Uses SetupLayout (full-screen background + centered Card + locale/theme toggles).

### 4.1 Step 1: Invitation Preview (Read-only)

The page must call `GET /api/v1/auth/invitations/preview?token=...` on load.

Content (recommended fixed order):

1) Title: "Accept Invitation"
2) Headline: "{inviterDisplayName} invited you to join {orgName}"
   - If inviter is missing: "You are invited to join {orgName}"
3) Organization: logo + name (+ optional slug)
4) Bound email:
   - Display masked email by default (e.g. `so***@example.com`)
   - Hint text: "This invitation is bound to this email and cannot be changed."
5) Role:
   - Display role name + short description
6) Expiration:
   - Show local time and UTC time (or "Never expires")
7) Security note:
   - "Do not forward this link. It contains a one-time token."

Buttons:
- Primary: "Continue"
- Secondary: "Back to Login"

Error states:
- If preview fails due to invalid/revoked/expired/accepted/org inactive:
  - Show an Alert (blocking)
  - Hide "Continue" (or disable)
  - Provide CTA: "Back to Login" and "Contact the inviter"

### 4.2 Step 2: Join Organization

Step 2 has 3 paths:

#### A) User already logged in

If the user is logged in:
- If `currentUser.email != invitation.email`:
  - Show a blocking warning: "Your current account email does not match the invitation email."
  - CTA: "Logout and switch account"
- If `currentUser.email == invitation.email`:
  - Show primary button: "Join organization and enter admin"
  - **Must show a confirmation modal** before performing the join.

Confirmation modal (Option B):
- Title: "Confirm joining"
- Body:
  - "You are about to join {orgName} as {currentUser.email}."
  - "Your role will be: {roleName}."
  - Optional: expiration hint if applicable
  - Optional risk note: "Joining grants admin console access. Ensure the inviter is trusted."
- Buttons:
  - Primary: "Confirm join" (loading during request)
  - Secondary: "Cancel"

On confirm:
- Call `POST /api/v1/auth/invitations/accept-existing` with `{ token }`
- On success:
  - Set `currentOrgId = organizationId` (see Section 7)
  - Navigate to `/`

#### B) Existing account (not logged in): "Login and join"

Default selection if `userExists=true` from preview:
- Email is read-only and equals invitation email
- Ask for password
- Support forgot password link (reuse existing reset flow)

Flow:
1) `POST /api/v1/auth/login` (identifier = invitation.email)
2) `POST /api/v1/auth/invitations/accept-existing` (token)
3) Set `currentOrgId = organizationId`
4) Navigate to `/`

#### C) New account: "Register and join"

Default selection if `userExists=false` from preview, but allow manual switch.

Fields:
- username
- displayName (recommended)
- password + confirmPassword
- email: read-only invitation email

Flow:
- `POST /api/v1/auth/invitations/accept`
- On success:
  - Set `currentOrgId = organizationId` (needs orgId; see Section 6.4 notes)
  - Navigate to `/`

If backend returns `EMAIL_EXISTS`:
- Show user-friendly hint: "This email already has an account. Please use 'Login and join'."
- Auto-switch to path B.

## 5. Backend API Specification

Base prefix: `/api/v1`

### 5.1 GET /auth/invitations/preview (New, Public)

Endpoint:
- `GET /api/v1/auth/invitations/preview?token=...`

Response (InvitationPreviewResult):
```json
{
  "invitation": {
    "email": "someone@example.com",
    "maskedEmail": "so***@example.com",
    "roleCode": "editor",
    "expiresAt": "2026-02-02T12:00:00Z"
  },
  "organization": {
    "id": "uuid",
    "name": "Acme Org",
    "slug": "acme",
    "logoUrl": null
  },
  "inviter": {
    "id": "uuid",
    "displayName": "Alice",
    "username": "alice",
    "avatarUrl": null
  },
  "role": {
    "code": "editor",
    "name": "Editor",
    "description": "Content management and publishing."
  },
  "userExists": true
}
```

Rules:
- `inviter` may be null.
- `role` must be returned with a semantic `name` and `description`.
  - If invitation has a `role_code`, use that role.
  - If missing, return the system default role (viewer) semantics.
- `userExists` is determined by invitation email.
- Add rate limiting (exact policy TBD).

Error mapping (recommended):
- 400 `INVITE_TOKEN_INVALID`
- 404 `INVITE_NOT_FOUND`
- 403 `INVITE_REVOKED`
- 409 `INVITE_ALREADY_ACCEPTED`
- 403 `INVITE_EXPIRED`
- 403 `ORG_INACTIVE`

### 5.2 POST /auth/invitations/accept (Existing)

Existing invite-only registration endpoint.

Recommended additional invariant:
- After role binding, ensure effective permissions include `admin:access`.
- If missing, rollback and return `INVITE_ROLE_MISSING_ADMIN_ACCESS`.

### 5.3 POST /auth/invitations/accept-existing (New, Auth Required)

Endpoint:
- `POST /api/v1/auth/invitations/accept-existing`

Request:
```json
{ "token": "..." }
```

Auth:
- Requires Authorization header (access token).

Rules:
1) Validate invitation state (same as accept).
2) Validate `current_user.email == invitation.email`.
   - If mismatch: 403 `INVITE_EMAIL_MISMATCH`
3) Create or activate membership in org.
4) Bind role(s) according to invitation:
   - If `role_code` present: bind that role.
   - Else: bind default roles (recommended: only viewer should be default).
5) Mark invitation as accepted (atomic).
6) Ensure effective permissions include `admin:access`; otherwise rollback.

Response:
```json
{
  "organizationId": "uuid",
  "roleCode": "editor"
}
```

Concurrency:
- Must lock invitation row with `FOR UPDATE` and operate in a transaction.

## 6. RBAC: System Roles and Default Permissions

### 6.1 System Roles (Built-in)

Codes (stable):
- `owner`
- `admin`
- `architect`
- `editor`
- `viewer`

Recommended role properties:
- owner: `is_superuser=true`, `is_default=false`
- admin: `is_superuser=false`, `is_default=false`
- architect: `is_superuser=false`, `is_default=false`
- editor: `is_superuser=false`, `is_default=false`
- viewer: `is_superuser=false`, `is_default=true` (safe default)

### 6.2 Default Permission Granting Must Support Any Role Code

Current limitation: default grants only honor `admin`/`user`.

Requirement:
- Grant defaults for every role code listed in `PermissionTemplate.default_roles`.
- System roles must exist before syncing permissions (ensure_system_roles first).

### 6.3 Core Permission Defaults (v1)

Hard requirement:
- `admin:access` must be granted by default to: `admin, owner, architect, editor, viewer`.

Viewer read-only system access:
- `system:plugins:read` default_roles includes `viewer` (+ higher roles).
- `system:settings:read` default_roles includes `viewer` (+ higher roles).

Architect plugin management:
- `system:plugins:manage` default_roles includes `architect` (+ admin/owner).

## 7. Frontend: Current Organization Selection (Minimal v1)

Rationale:
- Backend org-scoped endpoints require a resolved organization via `X-Org-Id` or auto-selection.
- Multi-org accounts can trigger 409 `ORG_SELECTION_REQUIRED` if no org is selected.

Requirement:
- Add a persistent `currentOrgId` (local storage) in frontend.
- API client automatically attaches `X-Org-Id: currentOrgId` when present.
- After accepting an invitation successfully, set `currentOrgId = invitedOrgId`.

Note:
- For "new user accept" (`/auth/invitations/accept`) the frontend must obtain the organization id:
  - Either include it in the accept response meta (recommended extension), or
  - Reuse preview organizationId, since token binds to the invitation and org (preferred in v1 to avoid backend response change).

## 8. i18n Requirements

Add namespace: `invite`

UI keys required (non-exhaustive):
- Wizard and buttons: INVITE_TITLE, INVITE_CONTINUE, INVITE_BACK_TO_LOGIN, INVITE_LOGIN_AND_JOIN, INVITE_REGISTER_AND_JOIN, INVITE_JOIN_AND_ENTER
- Confirmation modal: INVITE_CONFIRM_JOIN_TITLE, INVITE_CONFIRM_JOIN_LINE1, INVITE_CONFIRM_JOIN_LINE2, INVITE_CONFIRM_JOIN_RISK_NOTICE, INVITE_CONFIRM_JOIN_OK, INVITE_CONFIRM_JOIN_CANCEL
- Error messages: INVITE_INVALID, INVITE_NOT_FOUND, INVITE_REVOKED, INVITE_EXPIRED, INVITE_ALREADY_ACCEPTED, INVITE_ORG_INACTIVE, INVITE_EMAIL_MISMATCH
- System role fallback: ROLE_OWNER_NAME/DESC, ROLE_ADMIN_NAME/DESC, ROLE_ARCHITECT_NAME/DESC, ROLE_EDITOR_NAME/DESC, ROLE_VIEWER_NAME/DESC

Display strategy (A+B):
- Prefer frontend i18n mapping for built-in roles (stable experience across locales).
- Fallback to backend `role.name/description` for unknown/custom roles.

## 9. Security Considerations

- Do not store raw invite tokens in DB; store only token hash (already implemented).
- Preview endpoint must not leak user data beyond `userExists` boolean.
- Enforce email binding on accept-existing (server-side).
- Rate limit preview/accept endpoints.
- Log only token hints (first 6 + last 4), never raw token.

## 10. Implementation Checklist

Backend:
- [ ] Add `GET /auth/invitations/preview` (public) with the response contract in Section 5.1.
- [ ] Add `POST /auth/invitations/accept-existing` (auth required) with email match enforcement and transactional locking.
- [ ] Extend `ensure_system_roles()` to create owner/admin/architect/editor/viewer with correct flags.
- [ ] Update permission sync to grant defaults for any role_code in `PermissionTemplate.default_roles`.
- [ ] Update core permission templates default_roles for:
  - [ ] `admin:access` -> admin/owner/architect/editor/viewer
  - [ ] viewer read-only -> plugins:read, settings:read
  - [ ] architect manage plugins -> plugins:manage
- [ ] Add integration tests for preview + accept-existing + admin:access invariants.

Frontend:
- [ ] Add `/accept-invite` route + mark it as public + use SetupLayout.
- [ ] Add AcceptInviteView: Step 1 preview + Step 2 login/register/join paths.
- [ ] Implement confirmation modal for logged-in "join" path.
- [ ] Add invitations API module: preview + accept-existing.
- [ ] Add `currentOrgId` store + inject `X-Org-Id` header in API client.
- [ ] After successful accept, set `currentOrgId` to invited org and navigate to `/`.
- [ ] Add `invite` i18n namespace (zh-CN + en-US).
