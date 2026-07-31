# Admin Plugin, Notification, and Mail Contract

Status: Approved canonical implementation contract (spec audit passed 2026-07-22)
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)
Domain owners: Extensibility for sections 4-8; [Platform Communications](./admin-communications.md) for sections 9-18

## 1. Scope

This contract defines:

- the plugin catalog, lifecycle operations, detail, and schema-driven configuration;
- notification campaigns for inbox, email, launch modal, top banner, and transient toast delivery;
- transactional lifecycle notifications emitted by owning domains;
- recipient delivery state and durable fan-out;
- locale-aggregated email template management.

It extends `docs/spec/api/backend/plugins.md`, `docs/spec/api/backend/notifications.md`, and `docs/spec/api/backend/background-jobs.md`. Those contracts remain authoritative for package discovery, event routing, and durable execution where they do not conflict.

This combined file is a migration-era capability contract, not a shared Platform Domain or navigation group. Plugin installation, upgrade, trust, rollback, and package configuration belong to Extensibility. Campaign, transactional, recipient-delivery, global-message, template, and mail-channel operations belong to Communications. Neither domain duplicates the other's routes, forms, permissions, or Operational Signal resolution actions.

## 2. Current-state evidence

- `/system/plugins` renders a basic card grid and the API currently exposes only installed plugin discovery through `GET /system/plugins`.
- plugin metadata already contains provides, permissions, configuration schema, Admin metadata, and connector definitions, but there is no persisted install/upgrade/uninstall lifecycle.
- system notifications can create inbox/email records and render `inbox`, `toast`, `modal`, or `banner`, but a broadcast synchronously walks users and has no campaign, audience estimate, schedule, retry, or delivery ledger.
- the event runtime supports a narrow hard-coded event list and sends email directly after creating an in-app record; `NotificationDeliveryRecord` currently requires Campaign and Campaign-variant foreign keys, so domain-transactional events do not share its idempotent delivery ledger or retry evidence.
- global modal/banner consumption supports only text, severity, one action, and a local dismissed set; it lacks media, secondary action, display policy, and durable recipient state.
- email templates are unique by `(key, locale)` and support CRUD/preview/versioning, but the Admin list renders one row per locale and duplicates Edit in its primary action and menu.

## 3. Non-goals

- Executing an unverified arbitrary package uploaded by an operator.
- Turning notifications into a marketing automation suite with arbitrary scripting.
- Accepting remote media URLs without Asset and URL policy enforcement.
- Storing translated strings as status or permission authority.
- Rendering one email-template row per locale in the redesigned list.

## 4. Plugin domain model

### 4.1 Plugin installation record

Persist one installation record per plugin identity with:

- stable plugin id/name and installation id;
- source type and source locator metadata;
- installed, available, and previous versions;
- package checksum, signature/provenance verification result, and manifest digest;
- compatibility range for Arclayer/API/Admin runtime;
- lifecycle state: `installing`, `installed`, `update_available`, `upgrading`, `disabling`, `disabled`, `uninstalling`, `failed`, or `rollback_required`;
- enabled capabilities, permission grants requested/approved, configuration revision, and secret-reference metadata;
- operation/job id, last success/failure summary, installed/updated actor and timestamps;
- rollback artifact/version when supported.

Package content and secrets are not stored in a list projection. Compatibility, integrity, permission diff, and irreversible migration warnings are server-derived.

### 4.2 Operation model

Install, upgrade, enable/disable, rollback, and uninstall are durable jobs. A request validates intent, writes an idempotent operation, and returns `202` with operation/job state. The job persists phases, progress, logs safe for operators, retryability, and terminal result.

No HTTP request runs package installation synchronously. Repeated requests with the same idempotency key return the existing operation.

## 5. Plugin API surface

| Method and path | Purpose |
|---|---|
| `GET /system/plugins` | Filter/order installed and available plugin projections |
| `GET /system/plugins/catalog` | Search an approved online catalog with compatibility and trust metadata |
| `GET /system/plugins/{pluginId}` | Detail, capabilities, configuration links, versions, and recent operations |
| `POST /system/plugins/installations` | Start catalog or manual installation after validation |
| `POST /system/plugins/{pluginId}/upgrade` | Start an upgrade with permission/config/migration diff |
| `POST /system/plugins/{pluginId}/rollback` | Restore a supported previous version |
| `POST /system/plugins/{pluginId}/enable` | Enable compatible installed capabilities |
| `POST /system/plugins/{pluginId}/disable` | Disable after dependency/impact validation |
| `DELETE /system/plugins/{pluginId}` | Start confirmed uninstall when dependents allow it |
| `GET /system/plugin-operations/{operationId}` | Poll/reconnect to durable operation state |
| `GET/PATCH /system/plugins/{pluginId}/configuration` | Read/update schema-driven non-secret config and secret references |

Every mutation requires its exact action-scoped Extensibility Platform Permission and is audited; UI visibility or a legacy super-admin flag is insufficient. Disable/uninstall returns explicit dependency conflicts rather than leaving partial state.

## 6. Installed extensions composition

```text
Installed extensions                              [Install manually] [Browse extensions]
Review installed capabilities, updates, and work that needs attention.

[Search] [Order ▼] [Filters] [Reset]
[DataTable: Extension | Version | Trust | Capabilities | Consumers | State | Updated | Actions]
```

- Installed uses the shared operational DataTable with an icon-plus-name identity cell, concise capability description, explicit trust/compatibility state, backend filters/order, and an investigative Drawer. The Extension catalog may use cards when publisher identity and visual discovery materially help comparison.
- The Extensibility domain uses peer routes for Installed, Extension catalog, Connections, and Install & update history rather than tabs pretending to be its whole information architecture. Empty surfaces explain the state without fake installation success.
- Header slots contain Install manually and Browse extensions. Manual install accepts only server-supported package/source forms and shows integrity/compatibility validation before confirmation.
- Installed-row activation opens Extension detail. Menu actions are state-aware and never duplicate the primary Details action.

## 7. Extension detail and configuration ownership

Extension detail uses a Drawer or dedicated detail screen with:

- identity, trust/source, installed and available versions, compatibility, lifecycle state;
- capabilities provided and current consumers;
- requested/approved permission diff;
- recent durable operations and failure diagnostics;
- release notes and migration/rollback availability;
- configuration sections and related owning-domain configuration links.

Configuration is rendered from versioned manifest Admin schema. Secret values use secret references and are never round-tripped to the browser. Validation is performed by the plugin/backend owner as well as schema validation.

When configuration belongs to another Platform Domain, the plugin view uses that domain's canonical typed route/section target rather than duplicating its form. For overlay configuration it uses a typed target plus stable section anchor; for routed configuration it uses an equivalent typed domain route and stable section id. The destination scrolls/focuses and temporarily highlights the exact field/section. URL fragments or raw DOM selectors are not the contract.

## 8. Plugin failure and security rules

- Online catalog metadata is untrusted until signature/provenance, checksum, compatibility, and manifest schema pass.
- Permission increases require explicit review; upgrade cannot silently inherit newly requested permission.
- Failed operations remain visible with phase and retry/rollback eligibility.
- Process restart/reload requirements are explicit and coordinated; the UI must not claim completion before runtime activation is verified.
- Uninstall preserves audit/history and handles plugin-owned permission definitions with the retained/deprecated lifecycle from the permission contract.

## 9. Notification campaign domain

### 9.1 Campaign

A `NotificationCampaign` contains:

- id, name, internal description, owner, revision, and audit timestamps;
- state: `draft`, `scheduled`, `dispatching`, `completed`, `partially_failed`, `cancelled`, or `archived`;
- audience definition and captured estimate;
- schedule, timezone, start/end display window, priority, and conflict policy;
- channels/presentations;
- localized variants;
- operation/job id and aggregate delivery metrics.

### 9.2 Variant and presentation payload

Each locale variant has localized title/body and channel-specific content:

- inbox: title, body, icon/severity, click action;
- email: template key/version plus safe variables;
- modal: Asset-backed image or video, title, rich-safe body, primary and optional secondary action, dismiss policy, start/end window;
- banner: compact content, optional action, dismissibility, priority, placement/window;
- toast: short title/body and optional action for transient operational events.

Actions are typed as an internal route/settings target or an allowlisted external HTTPS URL. Media references an Asset id with validated type, size, visibility, and lifecycle. Arbitrary HTML, JavaScript URLs, and arbitrary remote embeds are prohibited.

### 9.3 Delivery ledger

`NotificationDelivery` records exactly one immutable source reference—Campaign plus variant, or transactional dispatch plus template version—together with recipient, channel/presentation, idempotency key, state, attempts, scheduled/sent/delivered/read/clicked/dismissed timestamps, provider/message ids, and sanitized terminal failure.

Per-recipient fan-out is durable and idempotent. One recipient/channel failure does not roll back successful deliveries; it contributes to `partially_failed` for a Campaign or the transactional source's failure projection and remains retryable.

### 9.4 Transactional lifecycle notifications

A transactional lifecycle notification is created only from a durable fact emitted by its owning domain. It is not an editable `NotificationCampaign`: it has no operator-authored audience, arbitrary schedule, display conflict policy, or manual publish action. Its immutable dispatch source records the source domain, event/transition identity, milestone, entity scope, template key/version, source timestamps, and correlation context.

The source domain owns the milestone and semantic payload. Notifications owns template rendering, localization, channel execution, `NotificationDelivery`, retry behavior, and recipient interaction. Recipient resolution occurs at actual dispatch through the source contract's current canonical authority projection; replaying a source fact produces the same dispatch and delivery identities rather than a second fan-out.

Platform Operators may inspect authorized delivery evidence and retry an existing retryable delivery through the Notifications authority. They cannot edit the resolved audience, convert the notice into a Campaign, synthesize or replay a Commerce/Hosting state transition, or mark an undelivered notice successful.

Commercial Lifecycle Notifications are the first required transactional source and follow `workspace-commercialization.md`: Owner and current Billing Managers receive email and in-app delivery, while other active members receive a sanitized in-app notice. Their failures never mutate Commerce or Hosting state; persistent critical failure produces an Operational Signal.

An Operational Signal caused by unreachable billing contacts may link to the owning Commerce or Hosting investigation surface, but Notifications cannot create a Domain Policy Exception or Domain State Correction, carry a proposed replacement deadline, or expose a cross-domain “extend” or “reopen” action. Delivery retry, active-window exception, and post-transition correction are separate commands, permissions, idempotency identities, and audit events.

Committed Domain Policy Exceptions and Domain State Corrections are transactional sources, never operator-authored Campaigns. Preview, request acceptance, and job dispatch cannot fan out a success notice. When Commerce correction starts asynchronous Hosting restoration, Notifications delivers the committed Commerce milestone as “delivery restoration pending”; only the later Hosting-owned result may produce delivery-restored or delivery-failed content.

The Commerce and Hosting notices use distinct source/milestone identities and ledger rows. A Hosting failure cannot overwrite, retract, or reinterpret the valid Commerce correction notice, while a later Hosting success cannot erase the earlier failure evidence.

For Owner and Billing Manager recipients, the renderer exposes only the stable localized customer-safe reason category, “Arclayer Platform Operations” source label, original/new deadline or state, effective time, and support reference. Other members receive only sanitized capability/delivery effect and effective time. The delivery payload never contains the individual Platform Operator identity, internal free-text reason, evidence, permissions, Provider diagnostics, payment details, or raw audit record; those remain available only through authorized Platform Audit projections.

The hard cut generalizes the Campaign-only `NotificationDeliveryRecord` source model and replaces direct event-runtime email sends with the shared delivery authority. Campaign and transactional sources remain distinct aggregates while using one delivery ledger; no parallel unaudited lifecycle-email loop remains.

## 10. Audience and scheduling

Supported audience definitions are server-owned, auditable filters such as:

- all active users;
- locale, account status, created range, or last-active range;
- workspace, workspace status, plan/subscription, or usage/credit condition;
- explicit authorized user/workspace ids for operational targeting.

Before publish, the server returns an audience estimate and sample breakdown without exposing unrelated personal data. Publish captures the resolved audience rule and revision so later membership changes do not rewrite the audit meaning. The implementation declares whether recipients are snapshotted at schedule time or dispatch time and reports that choice in the review step.

## 11. Campaign creation flow

```text
Campaigns                                            [Create campaign]
[All] [Draft] [Scheduled] [Running] [Completed]
[Search] [Order ▼] [Filters] [Reset]                 [Table tools]

Create/edit:
1 Audience → 2 Channels → 3 Localized content → 4 Preview → 5 Review & schedule
```

The flow supports save draft between steps. Review shows audience estimate, locale coverage, channel previews, schedule, action destinations, media policy, and expected delivery volume. Publish/schedule uses a revision-confirmed mutation and explicit confirmation.

Do not send directly from an unreviewed settings form.

## 12. Campaign DataTable and actions

Columns: selection where safe, Campaign, State, Channels, Audience, Schedule, Delivery summary, Updated, Actions.

Primary ghost action is View/Edit according to state. Menu actions are contextual:

- preview;
- duplicate;
- edit draft;
- cancel schedule;
- pause/cancel dispatch only when the job contract safely supports it;
- retry failed deliveries;
- view deliveries/failures;
- archive.

Batch actions are limited to archive compatible completed campaigns or cancel compatible scheduled drafts after confirmation. The table reflects job progress through event/poll updates and query-cache reconciliation.

## 13. Consumer surface behavior

### 13.1 Inbox

Click behavior is driven by a typed action from the campaign variant. The notification is marked read only according to the canonical interaction policy; navigation failure does not silently discard it.

### 13.2 Launch modal

- Renders validated image/video, title, safe content, primary and optional secondary actions.
- Honors priority, schedule/window, locale, once-per-recipient/display policy, and durable dismiss/read state.
- Multiple eligible modals are ordered by server priority and campaign timing; only one is active. The remaining queue persists across navigation.
- Video has controls, poster/fallback, captions when speech is material, and no forced autoplay with sound.

### 13.3 Top banner

- Appears in the canonical app-shell banner slot, not inside an arbitrary page.
- Supports compact responsive content, one action, close policy, priority, and start/end window.
- Shell layout reserves banner height to avoid covering the Header or page content.
- Multiple banners follow a server-defined priority/queue policy and durable per-recipient dismiss state.

### 13.4 Toast

Toast remains appropriate for short-lived operational acknowledgement, not durable announcements. Its request-id support is available for error-report context, but the user-facing toast does not instruct ordinary users to transcribe diagnostic ids when the report composer can attach them.

## 14. Campaign API and failure contract

The canonical system surface is:

| Method and path | Purpose |
|---|---|
| `GET/POST /system/notifications/campaigns` | Paginate campaigns or create a draft |
| `GET/PATCH /system/notifications/campaigns/{campaignId}` | Read or revision-update a draft/campaign |
| `POST /system/notifications/campaigns/{campaignId}/audience-estimate` | Validate and estimate the current audience rule |
| `POST /system/notifications/campaigns/{campaignId}/preview` | Render localized channel previews |
| `POST /system/notifications/campaigns/{campaignId}/publish` | Publish now or schedule through a durable job |
| `POST /system/notifications/campaigns/{campaignId}/cancel` | Cancel a schedule/dispatch and return non-recallable counts |
| `GET /system/notifications/campaigns/{campaignId}/deliveries` | Paginate recipient/channel delivery ledger |
| `POST /system/notifications/campaigns/{campaignId}/retry-failures` | Enqueue idempotent retries for retryable failures |
| `POST /system/notifications/campaigns/{campaignId}/archive` | Archive a terminal campaign |

Recipient read/click/dismiss actions extend the existing `/me/notifications` surface and require the recipient-owned notification/delivery id. Publish enqueues the durable fan-out job; email delivery uses the same delivery ledger rather than a parallel unaudited loop.

The existing `POST /system/notifications/broadcasts` synchronous contract is removed after its Admin caller migrates. It is not retained as a second send path or compatibility fallback.

Failures are explicit:

- invalid/empty audience blocks publish;
- missing locale coverage requires an explicit fallback-locale policy and review warning;
- asset unavailable or unsafe action blocks the affected variant;
- revision conflict reloads the latest draft;
- partial dispatch preserves per-recipient results;
- provider outage records retryable deliveries with backoff governed by the durable-job contract;
- cancellation reports which deliveries were already sent and cannot be recalled.
- transactional delivery failure remains attached to the immutable source milestone and never rolls back, delays, or fabricates the owning domain's transition.
- retrying or reconciling a transactional delivery cannot extend a source-domain deadline or report that a Domain Policy Exception was created.

## 15. Email template aggregate model

The system list returns one row per template key:

- key, localized display name/description, category, ownership (`builtin` or plugin/custom), required/runtime-critical flag;
- `locales[]`, each with locale, enabled, version, updated timestamp, completeness/validation state, subject preview, and override/default state;
- fallback locale and aggregate health.

The API, not JSX, performs grouping and supplies stable locale state. `(key, locale)` remains the storage uniqueness boundary.

The existing `GET /system/mail/templates` becomes the server-paginated aggregate list returning one template-key group per row. Localized record mutation remains id-addressed. The canonical extensions are:

| Method and path | Purpose |
|---|---|
| `GET /system/mail/templates` | Search/filter/order aggregate template-key groups |
| `POST /system/mail/templates` | Add one localized record or custom template according to payload kind |
| `PATCH/DELETE /system/mail/templates/{templateId}` | Revision-update or policy-checked delete one localized record |
| `POST /system/mail/templates/preview` | Render a validated locale/source preview |
| `POST /system/mail/templates/{templateId}/test-send` | Enqueue/render/send a test through the real provider and return delivery state |
| `POST /system/mail/templates/{templateId}/restore-default` | Restore one built-in locale to its shipped version |
| `GET /system/mail/templates/{templateKey}/history` | Paginate locale-aware version/audit history |

OpenAPI changes hard-cut the old flat-list response after all Admin consumers migrate; Admin does not group the transport response locally.

## 16. Email template DataTable

Columns:

| Column | Contract |
|---|---|
| Template | Product name, key as secondary diagnostic text, category/owner |
| Languages | Flag icon as decorative aid, localized language text, locale code, and semantic status tag for every locale |
| Status | Aggregate enabled/completeness/runtime health |
| Version | Active versions summary |
| Updated | Most recent locale update |
| Actions | Ghost primary Edit plus contextual ellipsis menu |

Flags never replace language text. Unknown/custom locales use a neutral language icon rather than an incorrect national flag.

Use shared search, order, filters, reset, column tools, and server pagination. Search covers template name/key/subject; filters cover category, owner, locale availability, enabled, completeness, and overridden/default state.

## 17. Email template actions

Primary ghost `Edit` opens the locale-aware visual editor. The menu must not repeat Edit. Contextual operations are:

- preview a selected locale and representative data;
- send a test email to an explicitly entered/confirmed address;
- add language;
- duplicate into a custom template when allowed;
- enable/disable a locale;
- restore a built-in locale to its shipped default;
- view version/history and compare changes;
- delete a custom locale/template after dependency validation.

Runtime-required built-in templates cannot be deleted. They may be restored, and disabling is allowed only if the runtime has a documented fallback. Test sends use the actual rendering/delivery pipeline, are audited, and never report success before provider acceptance is recorded.

## 18. Email editor and localization rules

- Editing selects one locale at a time while showing completeness across locales.
- Visual/source modes share one validated document model; unsupported markup is rejected explicitly.
- Subject, preview text, body, variables, links, and fallback policy are validated.
- Variable catalog is template-key and plugin-owner driven; unknown required variables block activation.
- Preview renders desktop/mobile and plain-text alternatives using safe representative fixtures.
- Optimistic list updates retain the prior row; revision conflict offers compare/reload and never silently overwrites another operator.

## 19. Audit, telemetry, and authorization

Audit plugin lifecycle/config changes, campaign create/edit/publish/cancel/retry, transactional delivery retries, audience-rule changes, recipient-impact counts, template edits/restores/deletes, and test sends. Do not audit secret values or recipient content beyond necessary identifiers.

Operational metrics include plugin operation duration/failure, campaign and transactional queue lag, delivery success/failure/read/click rates by source kind, locale fallback usage, email provider result, and template-render failures.

All Platform operations require their exact Platform Permission or non-delegable Instance Owner authority. Consumer interaction endpoints authorize the current recipient and cannot mark another user's delivery.

## 20. Tests and acceptance criteria

- Plugin API/job tests for idempotency, signature/compatibility, permission diff, dependency conflict, failure/retry, rollback, and activation verification.
- Plugin UI tests for ChromeTabs, Header slots, card keyboard activation, install review, operation progress, and settings-section highlight.
- Campaign API/job tests for estimate, revision conflict, schedule, idempotent fan-out, partial failure, retry, cancellation, and interaction authorization.
- Transactional notification tests for immutable source identity, current-authority recipient resolution, template-version evidence, replay idempotency, shared-ledger retries, per-channel failure, Operational Signal escalation, and owning-domain state independence.
- Boundary tests proving notification retry, reconciliation, and Operational Signal actions cannot create or combine Commerce/Hosting Domain Policy Exceptions or Domain State Corrections.
- Operator-intervention tests proving post-commit-only fan-out, separate Commerce-pending and Hosting-result identities, no inferred Hosting success, role-sensitive sanitization, and preservation of prior failure/success delivery evidence.
- Disclosure tests proving stable reason-code localization, customer-safe Platform Operations attribution, billing-contact versus ordinary-member projections, and non-disclosure of operator identity, internal notes/evidence, Provider diagnostics, or raw audit data.
- Consumer component tests for media modal, two actions, queue priority, banner shell layout, durable dismissal, typed navigation, narrow viewport, and keyboard/screen-reader operation.
- Email API tests for aggregate projection, locale uniqueness, required-template protection, rendering validation, test delivery, revision conflict, and restore default.
- Email UI tests for one-row-per-key, flags plus language text/tag, non-duplicated actions, filters/order, locale editor, and immediate cache reconciliation.

Acceptance requires no synchronous all-user broadcast loop, no direct lifecycle-email path outside the shared delivery ledger, no page-local-only modal/banner dismissal state, no arbitrary remote media/action, no duplicated Edit menu item, and no one-row-per-locale template table.
