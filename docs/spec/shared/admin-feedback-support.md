# Platform Feedback and Support Contract

Status: Approved canonical implementation contract
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)
Domain: [Platform Communications](./admin-communications.md)

## 1. Scope

This contract defines:

- pixel-exact trigger/content sizing for the Platform scope switcher;
- one feedback-composer contract for the Header, AI side panel, and error surfaces;
- the operator Feedback Center and its immediate-update behavior;
- the shared ContentGuard error/empty presentation.

This file is the canonical feedback contract. It owns submission, lifecycle, privacy, audit, authorization, replies, and operator triage.

The operator Feedback Center is the default User feedback queue inside the Communications Platform Domain, not an independent top-level Platform Domain. External replies use the Communications delivery ledger; internal notes never enter recipient delivery.

## 3. Non-goals

- A public community forum or live chat system.
- Showing diagnostic identifiers, stack traces, or transport metadata to end users.
- Replacing explicit support replies with automated AI responses.
- Preserving obsolete categories as selectable options for new submissions.

## 4. Scope switcher width contract

### 4.1 Single authority

The active Popover content border box MUST equal the trigger border box width, including border and padding calculations.

- The Radix trigger-width custom property is the single CSS width authority for the root content: `width: var(--radix-popover-trigger-width)` with `box-sizing: border-box`.
- Root Popover padding, border, and nested panel borders must be included inside that width. No descendant may add an independent outer width.
- Secondary workspace/project panels inherit `width: 100%` and `min-width: 0`; they do not reapply the measured trigger width.
- JavaScript measurement may determine placement or height but must not compete with the CSS width authority.
- Collision handling may move the Popover but must not widen it. At narrow viewport widths, the trigger itself and content use the same available width.

### 4.2 Acceptance evidence

At 100%, 125%, and 150% browser zoom and in both themes, compare trigger and Popover `getBoundingClientRect().width`. The absolute difference must be less than one physical pixel after device-pixel rounding. Main and secondary panels must pass the same check without horizontal overflow.

The project section remains absent whenever the active route has no concrete project context. Hiding only its label while retaining project controls is non-conforming.

## 5. Feedback intent model

### 5.1 New submission shape

New feedback uses a small user-intent taxonomy:

| Code | Product meaning |
|---|---|
| `problem` | Something is broken, incorrect, or blocking work |
| `idea` | A capability or workflow improvement |
| `question` | Help understanding or completing a task |
| `praise` | Positive feedback worth sharing |

The Header, AI side panel, and Feedback Center offer all four intents. ContentGuard fixes the intent to `problem` and does not ask the user to classify an already known error. The UI must not expose the old `usability`, `performance`, `billing`, or generic `other` categories.

The canonical submission includes:

- `intent`;
- `message`;
- `source`: `header`, `ai_sidebar`, `content_guard`, or `feedback_center`;
- `clientRequestId` for idempotency;
- optional structured `context` containing route identity, workspace/project ids, release/build identity, browser summary, error code, and correlation/request id;
- optional attachment Asset ids, subject to the configured asset policy.

The request/correlation id is diagnostic context only. It must never be rendered in the composer or success message.

### 5.2 Legacy migration

Existing rows retain their original category in a nullable `legacyCategory` projection. Backfill maps only when semantics are unambiguous; otherwise the row displays a localized `Legacy feedback` marker in operator detail, not as a current intent. New writes populate `intent` and do not populate the legacy field. After the migration, API filters distinguish `intent` from `legacyCategory` explicitly.

## 6. Shared FeedbackComposer

Header, AI side panel, ContentGuard, and Feedback Center use one domain component and submission hook. Entry points supply only source, initial intent, and sanitized context.

### 6.1 Composition

```text
┌──────────────────────────────────────────────┐
│ [message-circle icon] Share feedback      × │
│ Help us understand what you need             │
│ [ Problem ] [ Idea ] [ Question ] [ Praise ] │
│ ┌──────────────────────────────────────────┐ │
│ │ Tell us what happened or what would help │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│ Optional context/attachment affordance       │
│                              Cancel  Send     │
└──────────────────────────────────────────────┘
```

- The editor is a visually unified field: container radius, focus ring, textarea background, padding, and clipping share one border box. An inner textarea must not create a conflicting radius or border.
- The surface is compact but not skeletal. It provides intent, a useful prompt, remaining/validation guidance, optional attachment context, and explicit actions.
- Do not include the obsolete sentence promising that every item is read but cannot be answered.
- Success confirms receipt and exposes `View my feedback` only when that destination exists for the current user.
- Submission failure preserves the draft and exposes the real localized error.

### 6.2 Header behavior

- The Header icon opens an anchored Popover sized for the composer, constrained by viewport height.
- Initial focus moves to the intent group or message depending on whether intent was preselected.
- Escape closes only when no submission is pending and does not erase the draft without confirmation.

### 6.3 AI side-panel behavior

- Add a feedback icon button immediately to the left of Conversation History.
- Activating it toggles a non-modal feedback card directly above the AI composer and inside the side-panel layout.
- The card does not cover messages, detach from the side panel, or prevent the user from continuing the conversation.
- Context may include thread id and recent run/error identifiers, but never message bodies or tool payloads unless the user explicitly attaches them.
- Closing preserves the local draft for the life of the drawer; successful submission clears it.

### 6.4 ContentGuard behavior

- `Report issue` opens the same composer with `source=content_guard` and `intent=problem`.
- Error code, route, scope, and correlation id are attached silently in context.
- The user sees plain-language impact and recovery actions, not the request id.

## 7. Feedback Center queue contract

### 7.1 Page controls

The queue uses the Assets-page pattern:

```text
[Search feedback/person] [Order ▼] [Filters] [Reset]              [Table tools]
```

- Search covers message text and reporter display name/email through a backend search index/query.
- Filters support intent, lifecycle status, priority, assignee, reporter, source, created range, and last-activity range.
- Ordering supports newest/oldest created, newest/oldest activity, priority, and status SLA. The API validates an allowlist of order fields.
- Active filter/order state is encoded in route search parameters.
- Filter chips use stable codes and localized labels. `allowMultiple` is enabled for independent fields and repeated values where the backend supports them.

Required list request parameters:

`search`, repeated/multi-value `intent`, `status`, `priority`, `assigneeUserId`, `reporterUserId`, `source`, `workspaceId`, `projectId`, `createdFrom`, `createdTo`, `activityFrom`, `activityTo`, `ordering`, and the canonical page parameters.

### 7.2 Columns

| Column | Contract |
|---|---|
| Selection | Shared DataTable multi-select; visible only when at least one valid batch action exists |
| Feedback | Intent icon/label, message preview, attachment indicator, and last-activity summary; no legacy category as the primary label |
| Reporter | Avatar plus display name; email is secondary only when space permits; hover/focus opens the identity card |
| Status | Localized lifecycle tag |
| Priority | Localized semantic priority |
| Assignee | Avatar plus display name, or explicit unassigned state |
| Updated | Localized absolute/relative time with exact value available |
| Actions | Ghost primary `Details` button plus an unlabeled accessible ellipsis menu; no `View feedback details` column heading |

### 7.3 Reporter identity card

The card must support a triage decision. It includes:

- avatar, name, email, account status, locale, and join date;
- last sign-in/activity when authorized;
- workspace and project counts plus current feedback count;
- recent feedback summary and any open-item count;
- actions: open user directory detail, filter queue to this reporter, copy email, and open the relevant workspace when known.

Security-sensitive actions such as disable user or reset password remain in the user directory, not the hover card. Every hover action is also focus reachable.

### 7.4 Action model

- Primary ghost action opens the feedback detail Sheet/Drawer.
- Menu contains context-appropriate actions: assign to me/change assignee, change status, set priority, copy link, and close/reopen.
- Batch actions are limited to assign, priority, and valid state transitions. Reply and delete are never blind batch actions.
- Destructive or irreversible transitions require confirmation and explain affected tickets.

## 8. Detail and reply contract

The detail surface presents:

1. intent, status, priority, SLA/age, source, reporter, assignee, and scope;
2. full user message and safe attachments;
3. sanitized environment/error context in a secondary diagnostics section;
4. chronological user replies, operator replies, internal notes, and state changes;
5. reply/internal-note composer with visually distinct modes;
6. audit metadata and copyable ticket link.

Internal notes never cross the user-facing API. Reply delivery failure remains a visible failed delivery linked to the message; it is not marked sent.

## 9. Cache and concurrency contract

Every feedback mutation returns the updated ticket projection and revision/version. On success the Platform client:

1. replaces the detail cache;
2. patches or invalidates every matching queue cache;
3. refreshes summary counts/SLA widgets;
4. reconciles selection if the row no longer matches active filters;
5. only then shows success.

Optimistic status/priority/assignment changes are permitted when the prior snapshot is retained. Failure rolls back all affected caches and displays the server error. Revision mismatch returns an explicit conflict with the latest ticket; the client never overwrites silently.

## 10. ContentGuard presentation contract

All large error/empty/forbidden states use `packages/ui/src/empty.tsx` composition and Lucide icons.

- Remove custom illustration groups, page-local SVG scenes, and the bespoke Motion animation wrapper.
- Select icons by state (`LockKeyhole`, `SearchX`, `WifiOff`, `ServerCrash`, or another semantically correct Lucide icon) with no decorative bouncing/floating animation.
- Title and description are concise, productized, and localized.
- Actions render in one wrapping inline group:

```text
[Try again] [Report issue]
```

- Primary recovery precedes the secondary report action.
- A server-internal error exposes `Try again` and `Report issue`; permission/not-found states expose only actions that can actually resolve the state.
- ContentGuard does not fabricate recovery success or replace a backend failure with an empty state.

## 11. API and model changes

The feedback API adds the new intent and list-query contract while preserving lifecycle endpoints. OpenAPI projections include reporter and assignee summaries, revision, SLA timestamps, attachment summaries, and safe context-field availability.

| Method and path | Contract |
|---|---|
| `POST /feedback` | Submit one intent-based, idempotent ticket |
| `GET /feedback/mine` | List the current user's tickets and visible replies |
| `GET /system/feedback` | Server-paginated multi-filtered/operator-ordered queue |
| `GET /system/feedback/{ticketId}` | Full authorized operator detail |
| `PATCH /system/feedback/{ticketId}` | Revision-checked status, priority, or assignee update |
| `POST /system/feedback/{ticketId}/messages` | Add an operator reply or internal note |
| `POST /system/feedback/batch` | Validate and execute supported assign/priority/state transitions with a per-ticket result ledger |

`POST /system/feedback/batch` is all-or-none when every selected row has the same valid transition. If the API cannot guarantee atomicity across the set, it returns a per-ticket result ledger and the Platform client reconciles each row; it never reports one global success for partial execution.

The server must:

- validate intent and bounded metadata;
- sanitize diagnostic context by allowlist;
- enforce idempotency by authenticated actor and client request id;
- audit submission, assignment, status, priority, reply, internal note, and batch changes;
- enqueue reply delivery when an external channel is used and retain delivery state;
- index supported search/filter/order fields.

## 12. State and failure matrix

| Situation | Required behavior |
|---|---|
| Empty draft | Send disabled; accessible validation explains required message |
| Rate limited | Preserve draft and show retry information from the stable error |
| Duplicate retry | Return the original ticket without creating another row |
| Attachment rejected | Keep message/intent and identify the rejected attachment |
| Queue empty | Shared Empty with create-date/filter guidance, no fake CTA |
| Filtered empty | Show active filters and a reset action |
| Mutation conflict | Roll back optimistic state and load latest ticket revision |
| Reply delivery failed | Keep failed delivery visible with retry for authorized operator |
| Network offline | Preserve drafts and selections; expose explicit offline state |
| Internal server error | Preserve context and offer the unified report action |

## 13. Tests and acceptance criteria

- Unit tests for intent/category migration, context sanitization, and request-id non-rendering.
- API tests for idempotency, multi-filter/order validation, revision conflicts, batch authorization, internal-note privacy, and reply delivery state.
- Component tests for all three composer entry points, unified field radius/focus, AI-card placement, inline ContentGuard actions, reporter card keyboard behavior, and immediate cache updates.
- Browser evidence for trigger/content width at required zoom levels and secondary panels.
- Browser evidence for desktop/narrow Header composer, AI sidebar, ContentGuard, queue filters, hover/focus identity card, and failed mutation rollback.

Acceptance requires that a queue action visibly updates without refresh, no new submission offers an obsolete category, no user-facing feedback surface displays a request id, and ContentGuard contains no custom illustration or page-local Motion state.
