# Platform Control Plane Productization Rollout

Status: Approved domain rollout contract
Owners: Platform Console, Product Application, API
Applies to: `apps/platform` as the target Platform Console, `apps/app` as the Product Application and migration source, `apps/api`, `packages/ui`, plugin packages
Experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)

## 1. Purpose

This contract coordinates the domain productization of Arclayer's platform control plane. The administration experience redesign owns the final product IA, route names, complete-lifecycle requirement, and visual acceptance.

`product-platform-separation.md` is the canonical integration contract for application ownership, Workspace ownership, Product Application migration, cross-domain rollout order, and the final release gate. This file remains canonical for Platform Console domain behavior and does not create a second Product or Workspace authority.

The rollout is a hard-cut product contract. New work must use the domain contracts linked below; superseded page-local models and UI shims are removed in the same wave unless a migration is explicitly documented.

The monorepo application boundary is explicit: `apps/app` remains the Product Application package `@arclayer/app`, `apps/platform` is the Platform Console package `@arclayer/platform`, and `apps/api` remains the backend package `@arclayer/api` with separate Product API and Platform API composition roots.

## 2. Product and visual intent

Arclayer's Platform Console is a dense operations surface for the Instance Owner and authorized Platform Operators. Its root Overview connects configuration posture, effective state, evidence coverage, active changes, risk, and verified outcomes. Needs attention coordinates cross-domain intervention; charts, long-range trends, request investigation, and Audit evidence remain in focused Monitoring & Audit pages.

The Platform Console shares Arclayer's semantic visual tokens with the Product Application. It supports Light, Dark, and Follow system preferences only; Dark uses the true-black and neutral-charcoal hierarchy in `DESIGN.md`, while operational density comes from composition rather than a second theme, template palette, accent picker, gradient Dashboard, glow, or glass treatment.

All surfaces follow `DESIGN.md`, `docs/guidelines/frontend-design.md`, and `docs/spec/app/frontend/product-ui-toolchain.md`. The preferred composition is:

- one Arclayer-owned Platform Experience Kit built from canonical `@arclayer/ui`; reviewed `satnaing/shadcn-admin` shell patterns remain source-donor evidence only;
- `DefaultPage` for page framing and Header slots;
- `ChromeTabs` for peer views;
- `DataTable`, `DataTableSearchInput`, shared `Filters`, and explicit ordering controls for operational lists;
- `SettingDialog` for focused editing and a shared Drawer for investigative detail;
- `@arclayer/ui` as the only public primitive boundary;
- Lucide for icons and the reviewed shared chart API for visualization.

## 3. Domain contracts

| Contract | Scope |
|---|---|
| [Admin feedback and support](./admin-feedback-support.md) | Scope switcher, feedback composer and center, error reporting, ContentGuard |
| [Platform Monitoring & Audit and cross-domain attention](./admin-observability-dashboard.md) | Request/error investigation, performance and usage trends, Audit trail, source conditions, Needs attention projections |
| [Platform Communications](./admin-communications.md) | Feedback triage and replies, sending issues, announcements and campaigns, templates, email-service readiness |
| [Platform Extensibility](./admin-extensibility.md) | Extension catalog, installation and trust, compatibility, permissions, updates, rollback, connection-capability inventory |
| [Plugin, notification, and mail capability details](./admin-plugin-notification-mail.md) | Supporting Extensibility plugin lifecycle and Communications delivery models during contract separation |
| [Platform Identity & Access](./admin-identity-access.md) | Sign-in policy, identity providers, Platform team, roles and permissions, Platform MFA and sessions |
| [Platform AI operations](./admin-ai-operations.md) | Cross-Workspace AI task operations, models and providers, official Agents, action policy, runtime recovery |
| [Platform Hosting & Delivery](./admin-hosting-delivery.md) | Delivery issues, domains and certificates, file storage, delivery policy, suspension and restoration |
| [Workspace commercialization](./workspace-commercialization.md) | Workspace commercial authority, Commerce Platform Domain, plans, subscriptions, provider operations, Credits, entitlements |
| [Platform tenant governance](./admin-tenant-governance.md) | Workspace-first governance queue, peer User/Project views, cross-domain projections, access restrictions |
| [Workspace invitation and permission experience](./workspace-invitation-permission-experience.md) | Invitation acceptance and tables, dynamic localized permission catalog |

These contracts are normative together. A wave is incomplete if its frontend is shipped without the required backend authority, cache behavior, migrations, tests, or operational telemetry.

## 4. Requirement coverage

| User requirement | Canonical owner |
|---|---|
| 1. Scope switcher width | Admin feedback and support, section 4 |
| 2, 2.1, 2.2. Feedback entry points, center, error reports | Admin feedback and support, sections 5-9 |
| 2.3. ContentGuard shared Empty state | Admin feedback and support, section 10 |
| 3, 3.1-3.4. Audit log and request analysis | Admin observability and cross-domain attention, sections 4-8 |
| 4. Useful card/table drill-down | Admin observability and cross-domain attention, sections 9-10 |
| 5. Prioritized source-condition projection | Admin observability and cross-domain attention, section 11 |
| 6. Bklit-based shared chart capability | Admin observability and cross-domain attention, section 12 |
| 7. Plugin catalog, install, upgrade, detail, configuration | Admin plugins, notifications, and mail, sections 4-8 |
| 8. Notification campaigns, transactional lifecycle delivery, and global surfaces | Admin plugins, notifications, and mail, sections 9-14 |
| 9. Email template DataTable and locale aggregation | Admin plugins, notifications, and mail, sections 15-18 |
| 10-13. Tenant directory interaction and commercial data | Admin tenant governance, sections 4-9 |
| Commerce commercial operations control plane | Workspace commercialization, sections 4-10; Admin tenant governance, section 7 |
| 14. Disabled-state enforcement and blocker | Admin tenant governance, sections 10-14 |
| 15. Replace legacy overview with evidence-backed Overview and Needs attention | Administration experience redesign, sections 5 and 13; observability sections 13-14 |
| 16. Invitation flow and three DataTables | Workspace invitation and permission experience, sections 4-9 |
| 17. Dynamic localized permission page | Workspace invitation and permission experience, sections 10-14 |

Coverage means executable behavior, not visual approximation.

## 5. Universal data and interaction rules

### 5.1 Real data only

- Cards, charts, tables, and detail surfaces render persisted facts or an explicitly labeled unavailable/partial state.
- A detail surface must answer an operational question. A generic list of `Current value`, raw identifiers, or serialized JSON is not an acceptable primary presentation.
- Raw metadata may appear in a secondary diagnostics section after sensitive-field sanitization.
- Entity identifiers are correlation aids, not display names. The API supplies semantic identity projections for users, workspaces, projects, targets, and subjects.

### 5.2 List controls

- Operational lists use the Assets-page control pattern: shared search input, shared `Filters`, a visible ordering control, an active-filter reset, and DataTable tools.
- Filter and ordering state is URL-addressable where the page has a route; overlay-local tables preserve it for the overlay session.
- Filter operators and values are API-owned and validated. The client does not fetch an unfiltered dataset to emulate server filtering.
- Mutation success updates the detail cache and every affected list/count cache before the success notification. A manual page refresh is never required.
- Each domain defines one versioned default view with stable bilingual product copy. Platform Operators may create server-persisted personal Saved views containing filter codes/values, ordering, visible columns, column order, and density; no view stores result data, aggregates, page position, selection, Drawer state, scroll, or free-text search history.
- Selecting a Saved view expands its effective state into the typed URL. Edits are visibly unsaved, and a copied URL reproduces the current state for another operator with equivalent authorization without granting access to the sender's personal view record.
- The server validates a Saved view against the current capability, permission, filter-schema, and column revisions before querying data. Invalid or newly unauthorized conditions are omitted from the effective query with an explicit localized notice rather than sent to the API or converted into an unexplained empty result; the stored view changes only after its owner explicitly updates it.
- Team-shared, locked, published, formula, arbitrary-query, and data-snapshot views are not part of the Platform Console table contract.
- DataTable selection grants no generic mutation capability. Each bulk action belongs to the owning domain and defines an exact action code, eligible states, Platform Permission, input, idempotency, preview/commit semantics, per-item result, retry, Audit, and recovery contract; generic bulk edit/delete does not exist.
- The Action bar distinguishes explicit selected ids from all server-filtered results and shows the localized scope/count, including cross-page and cross-Workspace impact. All-matching or high-risk work requires a revision-bound server scope/impact preview whose eligible, ineligible, already-satisfied, and inaccessible counts fail visibly when source or filter state drifts.
- Cross-Workspace, long-running, or partially successful work is a durable operation. Acceptance remains pending; results expose succeeded, failed, skipped/ineligible, and not-run items, and retry addresses only explicitly eligible failed items without replaying success or widening scope.
- Once committed, an Accepted Platform Operation captures its original authorization and scope evidence. Later authority loss blocks all new interaction but does not fabricate cancellation; only a current exact permission and owning-domain safe idempotent cancellation contract may stop remaining work.
- Instance Owner transfer, commercial correction, credential replacement, permission elevation, and other individually evidenced actions remain single-record workflows unless their owning domain later defines and approves safe bulk semantics.

### 5.3 Drill-down

- Row activation opens a URL-restorable right-side Drawer for investigative data while preserving search, filters, order, pagination, and scroll context; an explicit row action exposes the same destination to keyboard and assistive-technology users.
- The Drawer must add cause, impact, affected scope, chronology, related evidence, and an authorization-aware next action beyond the fields already visible in the row. A repeated key/value list, generic `Current value`, raw JSON, or decorative visualization is not a detail model.
- Objects with multiple durable peer views, long history, multi-step or resumable work, independently linkable evidence, or complex configuration use a dedicated typed route. The Drawer summarizes and links there without embedding the whole workflow.
- Low-risk local changes may edit inline; bounded forms use a Dialog; multi-step, high-risk, or evidence-heavy mutations use the dedicated page. Investigative Drawers are not generic edit forms.
- A row without additional evidence, interpretation, or authorized action has no detail affordance.
- Interactive descendants stop row activation. Opening a hover card, copying a value, or using an action menu must not open the row Drawer.
- Cards and charts expose a visible affordance, keyboard activation, and the same detail model as their textual/table counterpart.

### 5.4 States

Every query and mutation surface defines: initial loading, background refresh, empty, filtered empty, partial data, permission denied, validation error, conflict, offline/network failure, and server error. Error states expose the original stable error and correlation context; they do not silently substitute demo values.

### 5.5 Accessibility and responsive behavior

- All actions are keyboard reachable and have a visible focus indicator.
- Icon-only buttons have localized accessible names and at least a 44 by 44 CSS pixel coarse-pointer target.
- Hover cards also open on focus. Hover-only content is never the sole path to an action.
- Tooltips are used only when rendered content is actually truncated or when explaining an icon-only control.
- Charts provide a localized text summary and an exact-value table or list alternative.
- Layouts work at narrow viewport widths without horizontal page overflow; dense tables may scroll inside their own bounded region.
- Numeric metrics use tabular numerals. Motion honors reduced-motion preferences.

### 5.6 Internationalization

All new product copy, action names, filter values, statuses, chart labels, errors, and accessibility labels use stable keys in both `zh-CN` and `en-US`. Domain APIs return stable codes, typed parameters, and trusted catalog metadata keys where capability discovery requires them; they do not persist translated display strings as authoritative state.

Product copy is not a direct rendering of the glossary, schema, permission catalog, Provider vocabulary, or internal state machine. Primary copy names the operator's object and intended outcome in plain language; technical identity, codes, diagnostics, and raw state remain available only in a clearly separated diagnostic or audit layer. Empty states explain what is absent and the next useful action. Errors explain what failed, what was left unchanged, and how to recover. Destructive and privilege-changing confirmations explain scope and consequence before naming implementation details. Both locales preserve meaning and operator intent rather than mirroring terminology word-for-word.

- `apps/platform` owns `apps/platform/locales/{zh-CN,en-US}` and capability-oriented namespaces. Keys encode stable semantic intent rather than rendered wording, route structure, or component names.
- Legacy `NAV_GLOBAL_PLATFORM_*`, `NAV_SECTION_PLATFORM`, `SYSTEM_*`, `SETTINGS_*`, and other semantically obsolete Product Application keys are removed with their final consumers. Platform resources do not alias or import them.
- The Platform Console disables cross-language fallback. Locale-key asymmetry, missing resources, raw keys, hard-coded product copy, or default English that conceals a missing Chinese entry fail `platform:check`.
- Platform API responses provide stable codes and typed parameters for frontend product-copy mapping. Permission codes, Provider enums, state-machine names, and identifiers are diagnostic facts rather than primary labels.
- User-authored values remain verbatim; only the surrounding product interface is localized.

### 5.7 Capability- and domain-driven information architecture

The Platform API exposes a server-authoritative Platform Capability Catalog assembled from trusted backend modules and concrete deployment configuration. Capability records provide a stable capability id and domain, localized metadata keys, support and enablement state, configuration readiness and missing prerequisites, health, trusted route target, and the Platform Permissions required to view or manage the capability.

- Primary navigation contains only capabilities that are enabled for the deployment and visible to the current operator.
- Disabled but activatable capabilities appear only in capability management for an operator with the required management permission, with explicit prerequisites and a real enablement path.
- Unsupported or uninstalled capabilities do not create navigation items, blank settings pages, or fake successful configuration flows.
- The catalog selects frontend modules registered in the Platform Console build; API metadata cannot inject a component, script, arbitrary URL, or executable configuration UI.
- Capability visibility never replaces authorization. Direct Platform API requests enforce Platform Permissions and non-delegable Instance Owner authority independently of navigation.
- Support, enablement, configuration readiness, and runtime health remain distinct facts; the UI must not collapse them into one ambiguous `enabled` boolean.

#### Workspace rollout policy

Only a Workspace-facing capability whose owning domain contract explicitly requires controlled adoption uses one server-authoritative three-stage Workspace Capability Rollout:

1. **Not available**: no Workspace may use the capability.
2. **Available to selected Workspaces**: only explicitly named Workspaces that also satisfy the capability's eligibility requirements may use it.
3. **Available to all eligible Workspaces**: every Workspace satisfying those same eligibility requirements may use it.

- Every stage or selected-Workspace change starts with a server-generated revision-bound impact preview. The preview explains the current and proposed stage, affected Workspaces, newly available and no-longer-available scope, current blockers, and expected operational consequences in localized plain language. Apply rejects stale policy, capability, eligibility, or selection revisions rather than silently recalculating a different change.
- A successful apply commits one new rollout revision and records actor, permission, reason, reviewed revision and scope, before/after policy, affected counts, and result in Platform Audit. Background propagation is a durable owning-domain operation when it cannot complete atomically, and its partial or failed results remain explicit.
- Product API command boundaries and workers enforce the committed rollout revision server-side. Product navigation, disabled controls, cached Workspace projections, and Platform Console previews are explanatory views and never become enforcement authorities.
- Effective use still independently requires supported installation, instance enablement, configuration readiness, commercial Entitlement, Workspace Permission, and runtime health. Selection or eligibility satisfies none of those checks, and a failed independent check reports its own stable reason rather than being rewritten as a rollout denial.
- Targeting is Workspace-only and explicit. Per-User targeting, random percentages, arbitrary expressions, implicit cohorts, and hidden exceptions do not exist. The selected stage stores stable Workspace identities rather than mutable query results.
- The rollout policy controls adoption scope only. It does not install or enable the capability, change a Plan or Entitlement, grant Workspace authority, conceal degraded health, or create a second capability configuration surface.
- A Plan-governed Feature Seat Assignment is not rollout targeting: it may allocate a Workspace-owned paid capability to an active member only after the Workspace is rollout-eligible and entitled. It cannot add an ineligible Workspace, bypass Workspace Permission, or become a hidden per-User rollout exception.
- Capabilities without a real staged-adoption requirement do not register a rollout record, render a rollout control, or add rollout to their runtime denial chain. AI Services is globally configured and explicitly does not use Workspace Capability Rollout; its former `ai-services` rollout, selections, previews, UI, and Product catalog enforcement are retired in the AI operations hard cut.

Every Platform Capability has exactly one owning Platform Domain. Primary navigation groups capabilities by that domain and follows the operator's work object rather than separating “operations” from “settings.”

- The Platform Console uses one collapsible Sidebar navigation authority. Overview is first; enabled and authorized domains follow in the canonical order, and only the active domain expands its peer pages by default.
- The Header contains breadcrumbs and global utilities rather than a second navigation model. Sidebar, command search, breadcrumbs, and mobile Sheet derive from the same capability/permission projection and stable bilingual copy.
- The Header Command Center shows authorized navigation, recent typed destinations, common workflow entry points, and federated owning-domain search results. Each build-registered provider enforces its own Platform API permission, redaction, ranking, pagination, and typed destination; disabled or unauthorized providers are not queried, and no frontend download or universal copied-data index is created.
- Provider failures remain visible and isolated. Results expose the minimum recognizable identity and context without hidden counts or sensitive snippets, query changes cancel obsolete requests, and search text is not persisted as recent history or analytics/audit content.
- Command Center actions open canonical workflows but never commit mutations directly. Preview, confirmation, idempotency, action-scoped permission, durable operation, and Audit rules remain unchanged.
- The Platform Console frontend root `/` is Overview and `/attention` is Needs attention. All other frontend routes use the exact stable segments in the administration experience redesign without a `/system` or `/platform` prefix; Product and Platform API route prefixes remain separate backend contracts and are not inferred from frontend URLs.
- Domain routes render inside the one Platform Console Shell. Page-local content panes are allowed, but nested settings, directory, monitoring, or other navigation shells are not.
- A domain owns its operational lists, configuration, health/readiness, audit projections, and Operational Signal sources.
- Configuration appears inside the owning domain. The Platform Console has no global Settings or Configuration section that collects unrelated capabilities.
- Cross-domain typed links may open the exact owning-domain surface, but they do not duplicate its form or create a second configuration authority.
- A domain landing page exists only when it presents actionable work, configuration readiness, or meaningful domain health. Otherwise its navigation target is the primary useful queue, list, or configuration workflow.
- “Platform” may remain an owning domain for genuinely cross-cutting instance foundations; it is not a replacement dumping ground for miscellaneous settings.

The internal cross-tenant governance domain is rendered as `Workspaces / 工作空间`, not as “Tenant Governance.” It opens the Workspaces governance queue by default; Users and Projects are peer investigative views. It may show authorized Plans & Billing, Hosting & Domains, and Monitoring & Audit summaries that help resolve a case, but mutations deep-link to the exact owning-domain surface and Workspace Administration is never reproduced in the Platform Console.

Workspaces exposes minimum operational metadata and redacted projections by default. Customer-authored Project content, Knowledge, Skills, and Design Systems require both an exact Platform support-read permission and a time-bound, revocable Support Access Grant created by an authorized Workspace Owner for one support case, named Operators, and explicit scope. The grant is read-only and customer-visible and creates no Workspace membership, Product Session, impersonation, tenant approval, mutation, secret access, or standing Instance Owner visibility.

Identity & Access is one Platform Domain for deployment sign-in and Platform authority. Its product navigation uses `Access & Security / 访问与安全`. It opens the Platform team queue by default and contains sign-in and registration policy, identity providers, Platform Operators, roles and permissions, Platform MFA posture, and Platform Session operations. Ordinary user investigation remains in Workspaces; Workspace People, roles, and permissions remain in Workspace Settings.

Platform Operator onboarding is staged: an identity-bound invitation records intended Platform Roles but grants no Platform authority or entry eligibility. The intended identity must authenticate, explicitly accept, and complete mandatory MFA enrollment before active operator status and the role assignments become effective atomically; expiry, revocation, identity mismatch, or failed acceptance leaves no partial authority. Instance Owner transfer remains a separate non-delegable workflow.

The Instance Owner and active Platform Operators with the exact invitation permission may invite platform members. The server validates the union of revision-bound intended roles against the inviter's Delegable Platform Authority and repeats that check with inviter status, invitation permission, and role revisions at acceptance; authority loss or revision drift invalidates the pending invitation rather than silently changing its roles. Non-delegable Instance Owner authority is never part of this envelope.

Platform Operators receive authority only through Platform Roles. Arclayer supplies a small immutable, localized Built-in Platform Role catalog; deployments may copy a built-in role or create an independent Custom Platform Role, and one operator may hold multiple roles whose effective permissions form an additive deduplicated union. Direct per-operator grants, denies, hidden default roles, and permission overrides do not exist. The Instance Owner remains a separate governance principal rather than a synthetic all-access role.

Custom Platform Role edits use a server-generated revision-bound preview of permission differences, affected operators and capabilities, self-impact, and pending revision-bound invitations, followed by explicit apply. Apply atomically creates the next role revision for every assignment; existing Platform Sessions remain authenticated, but old authorization-cache results are unusable before success and the next Platform API request evaluates current role revisions. Pending invitations tied to the replaced revision become explicitly invalid rather than inheriting changed authority.

Authority removal blocks every new command, confirmation, retry, scope expansion, and later human-authorized step immediately. An already committed Accepted Platform Operation retains its original actor, permission, role revisions, scope, idempotency, and Audit evidence and continues under its owning domain contract without preserving the actor's access; only a currently authorized, explicit cancellation command may stop remaining work when that domain defines a safe idempotent boundary and honest treatment of committed effects.

Platform Operator offboarding removes Platform access rather than deleting or pausing the shared identity. One revision-bound apply barrier removes entry eligibility, revokes Platform Sessions, end-dates roles and Delegable Platform Authority, and invalidates pending invitations sent by or addressed to the operator while preserving Audit and accepted-operation attribution. Product identity and Workspace authority remain unchanged; return requires a new invitation and MFA-gated activation, and the Instance Owner is never an ordinary removal target.

Instance ownership transfer is a two-party workflow from the current owner to an active Platform Operator with a verified security key or passkey. A revision-bound nomination previews non-delegable responsibilities, phishing-resistant readiness, active operations, affected invitations and Sessions, and the former owner's selected post-transfer roles; the target accepts with fresh Phishing-resistant Platform Verification before one transaction preserves exactly one owner, ends the target's operator roles, applies the former-owner role or deactivation outcome, and revokes both principals' old Platform Sessions. There is no immediate promotion, TOTP fallback, dual-owner interval, ownerless state, or implicit former-owner authority.

Instance Ownership Recovery is an out-of-Console, deployment-configured break-glass authority rather than Platform RBAC. Self-hosted deployments use offline or infrastructure-custodied recovery proof; managed deployments use a reviewed support process. A configured notification/hold policy precedes revalidation and either same-owner MFA restoration or atomic unavailable-owner replacement, while the restored or replacement Owner verifies a security key or passkey before ownership-bound access and Operators and custodians cannot self-promote, enter the Console through recovery authority, or bypass exactly-one-owner and Session-revocation invariants.

Baseline Platform Session MFA does not remain universally fresh. Trusted action capability contracts classify explicit high-risk applies for action-bound Step-up Platform Verification and identify the critical subset requiring phishing-resistant WebAuthn assurance; ordinary reads and low-risk saves do not repeat MFA. The proof binds actor, Session, action, permission, verified assurance, target/scope, preview and catalog revisions, idempotency, and versioned freshness policy, while final apply still enforces current authority and state and fails visibly on expiry, weaker-method submission, or drift.

Each browser or device receives an independently identifiable and revocable Platform Session governed by a versioned inactivity timeout and absolute maximum lifetime. Activity and refresh cannot cross the absolute deadline; the actor can inspect creation, recent activity and expiry and revoke one device or every other device, while an expired Session requires a new MFA-backed Platform sign-in and never changes Product Sessions. Concrete durations remain security-policy values rather than hard-coded product constants, and no unsupported Session-count cap is introduced.

Each non-owner Platform Operator receives one-time recovery codes during MFA enrollment. A code, used only after identity authentication, or an authorized step-up-verified reset by the Instance Owner or an Operator with exact reset permission opens the same bounded MFA-setup-required state: all target Sessions, Step-up proofs, old factors, and recovery codes are revoked, existing roles remain assigned but unusable, and only successful new MFA enrollment permits a new Platform Session. The reset actor cannot inspect or choose factors, no temporary authority exists, and the Instance Owner remains exclusively subject to out-of-Console Instance Ownership Recovery.

Platform MFA initially supports multiple user-verifying security keys or passkeys as the preferred phishing-resistant method and multiple authenticator-app time-based codes as the compatibility fallback. At least one supported method must remain verified; add, replacement, and removal after activation require action-bound Step-up verification, and the last method is retired only after its replacement verifies. Email, SMS, voice, recovery codes, Product Sessions, and unverified enrollment cannot satisfy routine Platform MFA or Step-up challenges.

The trusted action and permission catalog is the only authority for phishing-resistant requirements. Ownership transfer, sign-in or identity-provider authority changes, Platform privilege elevation or delegation, administrative MFA reset, and critical credential replacement initially require a fresh security-key/passkey Step-up; the Instance Owner must retain such a method, and a role containing those actions cannot become effective for an Operator without one. TOTP remains valid for baseline login and baseline Step-up but never downgrades a critical action when WebAuthn is unavailable.

External identity providers authenticate the human identity but never satisfy Platform MFA or action-bound verification. Provider Sessions, remembered devices, upstream prompts, and `amr`/`acr` or equivalent assurance claims cannot issue a Platform Session or replace local WebAuthn; every Owner and Operator completes an Arclayer-enrolled method challenge after provider sign-in, and the product explains consecutive verification without exposing claim terminology or offering a trust toggle.

Platform AI Operations is one Platform Domain whose product label is `AI Services / AI 服务`. It opens the cross-Workspace AI tasks queue by default and keeps model/provider readiness, built-in assistant availability, action policy, and runtime recovery together. Workspace-authored AI context and tenant approval remain in the Product Application; Plans & Billing owns commercial budgets and Credits, Monitoring & Audit owns historical trends, and the AI domain links to both without duplicating their authority.

Hosting & Delivery is one Platform Domain whose product label is `Hosting & Domains / 托管与域名`. It opens an actionable delivery-issue queue by default and keeps domains, certificates, file storage, delivery policy, suspension, and restoration together. Project publishing and site/domain choices remain Product Application tasks; Monitoring & Audit owns historical trends, and Plans & Billing can supply lifecycle facts without mutating Hosting delivery state.

Communications is one Platform Domain whose product label is “Messages & feedback.” It opens the User feedback queue by default and keeps sending issues, announcements and campaigns, message templates, and email-service readiness together. Feedback replies, Campaigns, and transactional notices remain distinct source workflows but share one recipient delivery ledger; Plugin lifecycle belongs to Extensibility, and historical engagement analysis belongs to Monitoring & Audit.

Extensibility is one Platform Domain whose product label is “Extensions.” It opens the Installed extensions list by default and keeps the catalog, connection-capability inventory, and durable install/update history together. It owns package trust, compatibility, requested permissions, dependencies, upgrade, rollback, and removal; the consuming Platform Domain owns capability-specific configuration and operational use.

Monitoring & Audit is one Platform Domain whose default product surface is “Requests & errors,” with peer Performance trends, AI usage, Activity trends, and Audit trail pages. Shared navigation and correlation do not merge the contracts: monitoring telemetry may be sampled and aggregated, while Audit evidence remains independently immutable, permissioned, retained, and exportable. Overview remains the global Platform Console home.

Needs attention adds lightweight coordination to domain-owned condition projections: authorized operators may claim or assign an item, mark work in progress, or wait with a time-bounded reminder and reason. Coordination is revisioned and audited but never changes source severity, health, authorization, lifecycle, or outcome. Only the owning Platform Domain may confirm recovery; Needs attention has no manual-resolve authority and does not become a central incident or ticket lifecycle.

The migration is a hard cut: static all-deployment system page arrays, the global system-settings shell, empty overview pages, and `isSuperAdmin`-only navigation filters are removed after every retained page has a capability, domain, and permission owner. No compatibility facade may continue to expose unsupported pages or duplicate configuration authority.

### 5.8 Domain-owned configuration changes

- Every configuration surface belongs to its owning Platform Domain and separately presents effective state, authority/source, readiness, missing prerequisites, affected scope, last successful change, and health. A saved value, enabled capability, ready integration, and healthy runtime are not interchangeable facts.
- Low-risk configuration uses an explicit save action and reports success only from the persisted Platform API result. Platform configuration does not autosave or optimistically claim effective state.
- High-risk or cross-Workspace changes require a server-generated, revision-bound impact preview followed by an explicit apply confirmation. Stale previews, changed prerequisites, concurrent updates, and partial external failure remain visible and never fall through to a generic success message.
- When the trusted action contract classifies an apply as high risk, final apply also requires Step-up Platform Verification bound to the reviewed action, target/scope, revisions, and idempotency identity; the preview itself does not trigger MFA, and low-risk saves remain free of repeated challenges.
- An actor who holds the exact current Platform Permission applies the change directly after satisfying these controls. The Console has no platform-wide approval queue, approver role, draft awaiting approval state, or deployment-configurable second-person policy, and a preview is never represented as an approval request.
- Multiple principals participate only when the owning domain's invariant inherently requires distinct actors, such as current-owner initiation and target acceptance for Instance Ownership Transfer. Such workflows define their own identities, evidence, expiry, conflict, and commit behavior and cannot be reused to make unrelated Platform changes wait for approval.
- Credentials are write-only replacement values with sanitized presence/readiness. Connection testing is a distinct observable operation and cannot imply that the complete capability is enabled, valid, or healthy.
- The owning domain defines risk, validation, atomicity, and async completion semantics from actual consequences. Accepted durable work remains pending until its result commits; every independently committed sub-result is explicit when the operation is not atomic.
- Applied changes emit canonical Audit evidence with actor, scope, safe before/after summary, reason when required, result, and correlation identity. Product copy states whether the requested change was applied, rejected, conflicted, queued, or left unchanged.
- Operational Signal configuration is also domain-owned and typed. A domain may expose meaningful thresholds, observation windows, severity mappings, and optional Inbox admission through revision-bound preview/apply; it may declare exact security, Audit-completeness, or data-integrity policies mandatory with a localized explanation. SQL, arbitrary expressions, cross-domain joins, and generic user-authored rules are forbidden.
- Signal-policy previews report recent data coverage and representative matches but create no Signals or historical evidence. Applied Signals reference their policy revision, and policy changes affect existing items only through explicit source-domain reconciliation rather than deletion or history rewrite.

## 6. Security and authorization

- Platform Console UI visibility is not an authorization boundary. Every Platform API endpoint enforces the canonical Platform Permission or non-delegable Instance Owner authority.
- Product API Platform-entry eligibility is discoverability metadata only. The Platform API never accepts that projection, a Product Session, Product token, or Workspace context as Platform authority; the configured Platform Host independently verifies identity, current operator status, mandatory MFA, Platform Session, and each action-scoped Platform Permission.
- Sending a Platform Operator Invitation never grants Platform authority. Invitation acceptance revalidates the intended identity, invitation, intended roles, mandatory MFA completion, and any derived security-key/passkey readiness before atomically activating the operator and role assignments; failed, stale, or verification-ineligible acceptance creates neither a Platform Session nor entry eligibility.
- Invitation permission never implies unlimited delegation. The Platform API checks the combined intended role permissions against the inviter's server-authoritative Delegable Platform Authority both when sending and accepting, rejects direct API attempts outside that envelope, and never substitutes a narrower role silently.
- Platform API authorization evaluates exact permissions from current Platform Role assignments, not role names, UI visibility, or per-operator exceptions. Built-in and Custom Platform Roles share the Platform permission catalog, while ownership authority remains outside role evaluation.
- A Platform Session authenticates the actor but does not snapshot its Platform Permissions. Custom role apply makes the new revision current for all assignments atomically and prevents any subsequent request from using an old authorization-cache entry; re-login is not a permission-revocation mechanism.
- Accepted-operation authorization evidence is historical proof, not a bearer capability. Workers may execute only the committed original scope; retries, approvals, cancellation, recovery choices, and scope changes are separately authorized current commands, and permission removal never creates a fake rollback or generic cancelled result.
- Deactivated Platform Operators have no eligibility, Platform Session, effective role, Delegable Platform Authority, or restore path. Their historical identity remains attributable, and the removal endpoint cannot disable Product access or target the Instance Owner.
- Only the current Instance Owner may nominate ownership transfer, only an active MFA-ready operator may accept, and the target's fresh MFA plus expected revisions are revalidated before the atomic exactly-one-owner commit. Ownership is never represented by a role or shared between principals.
- Ownership Recovery is unavailable through Platform APIs, Roles, Sessions, or Operator quorum. Its deployment-specific proof, notification/hold policy, target identity and verified security key/passkey, current owner revision, exactly-one-owner commit, Session revocation, proof rotation, and tamper-evident evidence are enforced by a separate monitored trust boundary.
- Step-up and phishing-resistant requirements come from trusted action and permission contracts and are enforced by the Platform API, never UI or role-name inference. Proof of fresh MFA neither grants permission nor survives Session/role/policy/assurance/preview/scope drift, and TOTP cannot be promoted into WebAuthn assurance or replayed for another operation.
- Platform Sessions are device-scoped, independently revocable, and bounded by both versioned inactivity and absolute deadlines. Refresh never crosses the absolute deadline, expiry or revocation invalidates bound step-up proof, new access requires current MFA, and Product Sessions remain isolated.
- Platform Operator MFA Recovery accepts only a one-time recovery code after identity authentication or an action-bound reset by a different currently authorized actor. Both paths revoke target Sessions, proofs, factors, and codes before re-enrollment, preserve but block roles, grant no temporary authority, and cannot target the Instance Owner.
- Platform MFA readiness requires at least one verified user-verifying security key/passkey or authenticator-app method. WebAuthn is preferred, TOTP remains the compatibility fallback, multiple methods are allowed, last-method replacement is atomic, and email/SMS/voice/recovery codes never satisfy ordinary or Step-up MFA.
- The Instance Owner always retains a verified security key/passkey, and Operators must have one before invitations, assignments, or Custom Role revisions make phishing-resistant actions effective. Losing the last required method blocks affected actions and enters enrollment or recovery; it never removes roles, grants a grace period, or downgrades to TOTP.
- Identity-provider authentication and Platform verification remain separate evidence and authority. Upstream MFA, assurance claims, provider Sessions, and remembered-device state never satisfy local enrollment, Session MFA, Step-up, or phishing-resistant actions, and no provider-specific bypass setting exists.
- Platform authority alone never reveals customer-authored content. A content read requires a current exact Platform permission plus a matching Workspace Owner Support Access Grant bound to case, named Operator, scope, expiry, and revision; revocation immediately blocks subsequent reads and never creates impersonation or tenant mutation authority.
- Platform Domains use action-scoped permissions rather than one domain-wide `manage` flag; Commerce separately authorizes read, catalog, Subscription, Credit, provider, and reconciliation operations.
- Workspace and project restrictions are enforced on direct API calls as well as navigation.
- User-supplied URLs, media, feedback metadata, notification content, and plugin packages are validated at their trust boundary.
- Sensitive request bodies, response bodies, credentials, tokens, cookies, authorization headers, and secret query values are never stored in audit or feedback context.
- Destructive and privilege-changing operations write canonical audit events with actor, target, before/after summary, and correlation id.

## 7. Migration rules

- Schema changes require forward migrations, backfill strategy, indexes for every supported list/filter/order path, and a rollback or repair procedure.
- Create `apps/platform` as the only Platform Console frontend package and build artifact. It owns its Vite entry point, TanStack Router tree, Platform Session bootstrap, Platform API client boundary, i18n bootstrap, shared route-skeleton composition, tests, and deployment output.
- Keep `apps/app` as the Product Application. Existing `/system/**` routes, Platform navigation, Platform API clients, Platform-only stores, pages, tests, translations, and route skeletons move to `apps/platform` or are deleted according to their owning domain contract; `apps/app` retains no re-export, redirect, embedded Console, or compatibility facade.
- The target `apps/platform` route tree uses the exact route inventory in the administration experience redesign. It does not reproduce `/system/**`, add `/platform/**`, or retain old frontend aliases and redirects.
- Application packages do not import source from one another. Reusable visual primitives and framework-neutral contracts move to their existing shared package owner only when both applications genuinely consume them.
- Root scripts use `app`, `app:build`, and `app:check` for `@arclayer/app`, plus the corresponding `platform:*` and API commands; `admin:*` is not a Product Application alias.
- Build and verify `apps/platform` outside the official production entry until every retained Platform route and capability satisfies the frontend cutover gate. Production never exposes a route-by-route split, nested legacy page, cross-Shell handoff, or feature flag that switches individual domains back to `apps/app`.
- The cutover release enables the Platform Host and its Platform Session entry while deleting all Platform routes, navigation, pages, API clients, state, translations, route skeletons, and build references from `apps/app` in the same boundary. The Product Application account menu shows a localized typed cross-host Platform target only from a minimal Product API eligibility projection; the link transfers no Product Session, token, Workspace context, or Platform authority, and the Console Header always exposes a normal typed return-to-product link.
- Preparatory database and Platform API changes may land earlier only as an explicit forward-compatible migration. During the rehearsed rollback window, the previous complete application/backend artifacts remain deployable; this does not authorize a user-visible legacy route or a second mutation authority. After cutover acceptance, the declared retirement migration removes superseded API/schema contracts rather than preserving them indefinitely.
- Frontend rollback redeploys the previous complete release boundary. It does not toggle individual pages, embed old components in `apps/platform`, or restore a compatibility facade inside the new build.
- Old feedback categories remain readable only through a documented legacy projection; they are not presented as new submission options.
- Existing notifications and email template rows remain readable while new aggregate projections are introduced.
- Build the new Platform resource catalog independently in `apps/platform` and delete obsolete Platform-only keys from Product Application locale files with their final consumers. No compatibility namespace or key alias survives the frontend cutover.
- Superseded dashboard layout records and page-local widget registries are removed with an explicit data-retirement migration; they are not retained behind a compatibility facade.
- Static system-page registries and the global Settings route family are replaced by the trusted Platform Console module registry plus domain-owned routes and the Platform Capability Catalog; every existing route receives an explicit migration or removal decision.
- The Platform Console uses the Arclayer-owned Platform Experience Kit. Reviewed `satnaing/shadcn-admin` composition remains limited to shell source-donor evidence. The legacy shell, path-selected `SystemSettingsLayout` and `SystemDirectoryShell` navigation authorities, duplicate primitives, demo dashboard content, mixed old/new styling, and temporary compatibility routes are removed in the same frontend hard cut.
- The legacy `/system/tenants` overview/redirect contract is removed. Workspaces opens its Workspace queue directly, with Users and Projects as peer views and no compatibility generic Overview made of KPI cards.
- The legacy `/system/settings/access` and `/system/settings/oauth` presentation categories are removed after their real capabilities move into Identity & Access. No compatibility settings route may duplicate sign-in policy or identity-provider configuration.
- The legacy `/system/settings/agents` settings wall is removed after its retained capabilities move into Platform AI Operations. Workspace-bound usage cards, raw runtime-framework controls, and duplicated Commerce/Monitoring & Audit summaries do not survive as a compatibility page.
- The legacy `/system/settings/domains` and `/system/settings/storage` categories are removed after retained capabilities move into Hosting & Delivery. The hard cut preserves no duplicate settings forms or route aliases, and it does not turn the Platform Console into a second Project publishing surface.
- The legacy `/system/feedback`, `/system/settings/notifications`, and `/system/settings/email` presentation categories move into Communications-owned routes. The old routes, settings forms, and parallel delivery paths are removed after every retained capability has one source authority and one shared delivery ledger.
- The legacy `/system/plugins` card page moves into Extensibility and is removed after the installed list, catalog, connection inventory, and operation history have exact routes. Connector configuration forms move to their consuming Platform Domains rather than remaining as plugin settings or global Settings aliases.
- The legacy `/system/audit-log` tab shell and `/system/observability/**` route split move into one Monitoring & Audit route family. Request records and request analysis become Monitoring surfaces; administrative Events become Audit trail. `/system/observability/overview`, old aliases, tabs, route skeletons, and duplicate page components are removed in the hard cut.
- The legacy global billing-settings route and tenant-directory subscription form move to Commerce-owned routes and workflows; they do not remain as aliases or parallel mutation authorities.
- Existing Workspace capability allowlists, rollout flags, and tenant overrides are inventoried. Capabilities whose owning contract requires staged adoption migrate to one of the three canonical rollout stages; capabilities without that requirement retire their rollout state and rely on their actual installation, enablement, readiness, Entitlement, permission, resource, and health gates. The `ai-services` rollout and selections are deleted rather than translated. User-level flags, percentage experiments, expression rules, and undocumented exceptions are retired; commercial grants remain Entitlements and are not migrated into rollout selection.
- Commerce replaces its router-wide `require_super_admin` dependency with exact Platform Permissions and retires the obsolete plan-change approval queue; no `commerce.manage` compatibility permission remains.
- Commerce replaces mutable Plan rows and Plan-code-only provider Price mappings with stable Plan identities, immutable Plan Revisions, and explicit Subscription-to-Revision bindings; the legacy in-place upsert route is removed.
- New Plan Revisions grandfather existing Subscriptions. Any adoption by existing customers uses the preview-driven Subscription Revision Transition workflow; publication and background processing never imply cohort migration.
- Platform-initiated cohort adoption defaults to Provider-confirmed renewal boundaries. Immediate change is a separate single-Workspace Commercial Correction and never a bulk timing toggle.
- Commerce separates Provider Subscription lifecycle from commercial access state and uses a configured Dunning Policy for Payment Grace, metered-effect blocking, recovery, and Payment Restricted; `past_due` never means immediate deletion or silent Free downgrade.
- Hosting, not Commerce, owns the Hosting Policy and public delivery projection after Payment Restricted. The active release remains live through a configured Hosting Continuity Window, then enters Delivery Suspended without losing artifact, domain-binding, or certificate state; recovery resumes that same release without redeployment.
- Commerce publishes commercial-access transitions only. It never edits release, deployment, domain-binding, certificate, cache, or Hosting delivery records, and Hosting restoration failures surface as Hosting-owned Operational Signals.
- Workspace deletion belongs to the independent Workspace Lifecycle Authority and requires an explicit Workspace Owner instruction or documented legal/privacy process. Payment Restricted duration, Commerce permissions, Hosting expiry, and ordinary settings authority never create or advance deletion.
- The direct settings-manager Workspace hard-delete path and generic Platform directory delete action are removed in the lifecycle hard cut; later Provider recovery reconciles commercial state without resurrecting a lifecycle-deleted Workspace.
- Payment Restricted activates Restricted Recovery Mode rather than Workspace Suspension: Product Sessions and authorized reads/exports remain available, while value-expanding Product API and worker commands fail before dispatch with `402 WORKSPACE_PAYMENT_RESTRICTED`.
- The current status-only Entitlement gate and generic `403 COMMERCE_ENTITLEMENT_REQUIRED` denial are replaced by the central commercial-access command policy; route hiding, module-local status checks, and the Access Restriction blocker are not compatibility paths.
- Tenant Checkout, Provider Portal, detailed ledger, Subscription, and recovery actions require `workspace:commerce:manage`. The Workspace Owner always has it and may delegate it to multiple Billing Managers; Admin/settings roles and ordinary membership receive no implicit migration grant.
- Platform Commerce Permissions never mint tenant Provider sessions or impersonate an Owner/Billing Manager. The broad `require_workspace_manage_access` Commerce route guards are removed in the permission hard cut.
- Commerce and Hosting emit durable Commercial Lifecycle Notification facts at their canonical payment, continuity, suspension, and recovery milestones. Notifications resolves current role-sensitive recipients at dispatch and owns one shared per-recipient/channel delivery ledger; Provider-only email, daily broadcast loops, Campaign-authored audiences, and direct event-runtime email sends are not lifecycle-delivery authorities.
- Commercial Lifecycle Notification success or failure never mutates a Commerce or Hosting transition or its deadline. Persistent critical delivery failure emits an Operational Signal, and Platform Operators may retry an existing delivery but cannot synthesize or replay the source lifecycle state.
- Notification unreachability never extends Payment Grace or Hosting Continuity automatically. Any manual extension is a separate time-bounded, reasoned, audited, single-Workspace Domain Policy Exception owned and authorized independently by Commerce or Hosting; no cross-domain exception or notification-side mutation remains.
- A Domain Policy Exception extends only a still-active window using an expected state/deadline revision; expired deadlines and effective transitions remain immutable. Restoring Payment Grace or Hosting Continuity after restriction/suspension requires an append-only, higher-sensitivity Domain State Correction in the owning domain.
- A Commerce Domain State Correction to Payment Grace commits independently and emits an outbox-backed corrected access fact. Hosting idempotently records its own normal-delivery restoration of the preserved active release; Hosting failure never rolls Commerce back and surfaces as a Hosting Operational Signal.
- Accepted Domain Policy Exceptions and Domain State Corrections emit role-sensitive Commercial Lifecycle Notifications only after commit. Commerce may notify that delivery restoration is pending; Hosting emits the distinct success/failure result, and no consumer infers Hosting success from Commerce state or job dispatch.
- Operator-intervention notices attribute customer-facing action to “Arclayer Platform Operations.” Billing contacts receive a stable localized reason category and before/after/time/support context; ordinary members receive effect and time only. Personal operator identity, internal evidence, and Provider diagnostics remain in Platform Audit.
- Removal of `/system/observability/overview` includes route, navigation, route skeleton, tests, translations, and generated route-tree regeneration.
- OpenAPI changes are generated from the API schema; Admin does not maintain parallel handwritten transport types.

## 8. Delivery waves

### Wave 0: contracts and foundations

1. Resolve canonical spec conflicts and approve this contract set.
2. Create the independent `apps/platform` / `@arclayer/platform` frontend and its build, test, i18n, routing, Platform Session, Platform API, shared route-skeleton, and deployment boundaries while preserving `apps/app` / `@arclayer/app` as the Product Application.
3. Add required migrations, projections, indexes, error codes, and durable-job contracts.
4. Define the Platform Capability Catalog, Platform Domain inventory, trusted frontend module registry, capability-management surface, and permission-aware navigation contract.
5. Define the revisioned three-stage Workspace Capability Rollout contract, migration inventory, server enforcement boundaries, impact preview, Audit evidence, and its separation from eligibility, Entitlement, permission, readiness, and health.
6. Define the cross-domain Operational Signal projection, server-authoritative prioritization, revisioned lightweight triage, action-scoped claim/assignment/reminder permissions, and source-owned resolution contract.
7. Record the reviewed `satnaing/shadcn-admin` shell provenance, then build the Platform Experience Kit compositions defined by the administration experience redesign without importing its application, auth, product, chart, icon, or duplicate primitive stacks.
8. Vendor reviewed Bklit Registry chart sources behind `@arclayer/ui/chart`; do not expose Bklit/Visx directly to application pages.
9. Add shared identity hover-card, investigative Drawer, feedback composer, filter/order, and restriction-boundary primitives where reuse is proven.

### Wave 1: feedback and resilient error surfaces

Deliver the exact scope-switcher width fix, unified feedback entry points and center, cache-coherent triage, and Lucide/shared-Empty ContentGuard.

### Wave 2: Overview, Needs attention, and Monitoring & Audit

Deliver request/error diagnostics, repaired performance analytics, semantic Audit projections, useful drill-down, reviewed charts, the unified Monitoring & Audit route family, evidence-backed Overview, and Needs attention with claim, assignment, in-progress work, and time-bounded waiting. Preserve source-owned recovery and do not merge telemetry, Audit evidence, coordination, or domain lifecycle contracts.

### Wave 3: Communications and plugin operations

Deliver the User feedback and sending-issue queues, announcement Campaigns, the generalized feedback-reply/Campaign/transactional delivery ledger, real modal/banner consumption, localized message templates, and email-service readiness. Deliver the Extensibility installed list, catalog, connection inventory, and durable install/update operations, and remove direct event-runtime email delivery as a parallel unaudited path.

### Wave 4: commerce and tenant governance

Deliver the Plans & Billing commercial operations control plane and the Workspace-first Workspaces domain with peer User/Project views; identity cells and hover cards; commercial projections and exact billing deep links; Workspace Owner-controlled Support Access Grants without impersonation; event-driven Commercial Lifecycle Notifications; Project operational detail; and server-authoritative restriction blockers.

### Wave 5: invitation and permission experience

Deliver the token regression matrix, People/Pending/Invite links/Requests views, coherent acceptance/onboarding behavior, and revisioned dynamic localized permissions.

### Wave 6: Identity & Access productization

Deliver the Platform team queue, identity-bound Platform Operator invitation, explicit invitation permission, Delegable Platform Authority, MFA-gated activation, evidence-preserving offboarding and new-invitation re-entry, two-party phishing-resistant Instance Ownership Transfer, out-of-Console managed/self-hosted Ownership Recovery with security-key/passkey readiness and rehearsal, action-bound Step-up Platform Verification with server-owned phishing-resistant classification, immutable Built-in Platform Roles, revisioned Custom Platform Roles with impact and verification-readiness preview and atomic assignment adoption, role-only operator assignments, sign-in and registration policy, identity-provider readiness without MFA substitution, WebAuthn-preferred/TOTP-compatible local Platform MFA methods, device-scoped Platform Session inventory with inactivity/absolute expiry and precise revocation, and non-owner MFA recovery through one-time codes or exact-permission reset. Remove the legacy Access/OAuth settings categories and replace internal terminology in primary UI copy with localized operator language.

### Wave 7: Platform AI operations

Deliver the cross-Workspace AI task queue, model/provider readiness, built-in assistant operations, action-policy controls, and runtime recovery. Remove the legacy Agent settings wall, prevent Platform Operators from exercising tenant approvals, and move commercial or historical analysis to exact Commerce and Monitoring & Audit deep links.

### Wave 8: Hosting & Delivery productization

Deliver the cross-Workspace delivery-issue queue, domain/certificate readiness, file-storage operations, delivery policy, Delivery Suspended investigation, and restoration. Remove the legacy Domains/Storage settings categories and retain Project publication intent only in the Product Application.

### Platform frontend cutover gate

Backend, migration, and domain implementation commits may land through the waves above, but the production Platform Console entry changes only once. Before cutover:

1. every retained Platform Capability has an enabled/unsupported state, action-scoped permissions, an owning `apps/platform` route, both locale resources, explicit loading/empty/partial/error states, and its required configuration or operational workflow;
2. every capability whose owning contract declares controlled adoption passes all three rollout stages, selected-Workspace and eligibility interaction, revision-bound preview/apply drift, Product API and worker enforcement, Audit, and independent Entitlement/permission/readiness/health denial acceptance without user, percentage, expression, or hidden-exception paths; capabilities without controlled adoption, including AI Services, prove that no rollout route, record, UI, or denial remains;
3. exact-permission direct apply, high-risk preview/reason/step-up/Audit controls, absence of a generic approver or approval queue, and explicitly domain-bound two-party workflows pass direct Platform API and cross-application browser acceptance;
4. Needs attention claim, assignment, in-progress work, time-bounded waiting, concurrency, Audit, permission isolation, reminder return, source-confirmed recovery, and no-manual-resolve behavior pass end-to-end acceptance without creating a duplicate incident or task authority;
5. Identity-provider/local-MFA separation, WebAuthn-preferred/TOTP-compatible Platform enrollment and challenge, server-catalog phishing-resistant critical actions, Owner and privileged-role WebAuthn readiness, multiple-method and last-method behavior, independent-device Session inventory, inactivity/absolute expiry, refresh-boundary and precise-revocation behavior, one-time-code and authorized-reset Operator MFA recovery, action-bound step-up, CSRF/CORS/cookie boundaries, direct Platform API denial, capability-filtered navigation, command search, eligibility-gated Product entry, authority-free typed cross-host links, return-to-product navigation, configured out-of-Console Ownership Recovery rehearsal, Overview, and Needs attention pass end-to-end acceptance;
6. Support Access default-denial, Workspace Owner grant/revoke/history, named-Operator/case/scope/expiry binding, separate Platform permission, read-only projection, secret exclusion, revocation races, and no-impersonation behavior pass direct API and cross-application browser acceptance;
7. the full old-to-new route/component/copy/data migration matrix contains no unresolved Platform surface, placeholder page, decorative KPI replacement, embedded legacy page, duplicate mutation authority, or undeclared retirement item;
8. `apps/app` and `apps/platform` builds prove there is no app-to-app source import, no Platform bundle/module in the Product Application artifact, and no Product page in the Console artifact;
9. desktop, narrow, keyboard-only, reduced-motion, Light, Dark, both-locale, empty, populated, partial, permission-constrained, and failed-network browser evidence passes for the complete Console;
10. the previous complete release rollback is rehearsed against the forward-compatible database/API state, and the superseded API/schema retirement migration is declared before production enablement.

The cutover release then enables the Platform Host and deletes the Product Application's Platform UI in the same release boundary. A rollback redeploys the previous complete artifacts; there is no per-domain production cutover or runtime legacy-page switch.

Each wave may be committed separately, but no commit may mix unrelated pre-existing worktree changes.

## 9. Verification contract

Use staged verification rather than repeatedly running the full monorepo gate:

1. Targeted unit/component tests while editing a domain.
2. Targeted API integration tests start with a 60-second diagnostic timeout for narrow backend nodes; extend it when database, integration, or other inherently slow tests need time to expose a real result.
3. `pnpm app:check` for Product Application-only waves, `pnpm api:check` for API-only waves, and `pnpm check` only at cross-app release boundaries.
4. `pnpm code-review-engine --scope changed --base HEAD --format human` at wave boundaries.
5. GitNexus impact before modifying symbols, and `detect_changes()` before every commit. If the service is unavailable, record the failure and do not claim graph verification.
6. Browser acceptance at desktop, narrow viewport, keyboard-only, reduced motion, dark theme, empty state, populated state, and failed-network state.

## 10. Definition of done

A requirement is done only when:

- the domain and API behavior in the owning spec is implemented without page-local duplicate contracts;
- `apps/platform` is the only Platform Console frontend and `apps/app` contains no Platform route, navigation, page, Platform API client, or compatibility export; neither application imports source from the other;
- the official Platform Host is enabled only after the complete frontend cutover gate passes, the same release removes every Platform UI surface from `apps/app`, and rollback uses the previous complete artifacts rather than per-route flags or embedded legacy pages;
- the Platform Console frontend opens Overview at `/` and Needs attention at `/attention`, matches the canonical route inventory, contains no `/system` or `/platform` route prefix, and retains no old frontend aliases or redirects;
- the Product Application exposes “Open Platform Console” only from the minimal eligibility projection, transfers no Product authority or Workspace context, and direct Platform Host/API tests prove identity, current operator status, MFA, Platform Session, and exact Platform Permission are independently enforced; the Console always retains a localized return-to-product link;
- migrations and backfills succeed against a representative existing database;
- the UI has all required states and interaction paths;
- list mutations are immediately cache coherent;
- every operational DataTable has a versioned domain default and supports server-persisted personal views whose effective state is URL-reproducible, authorization-validated, explicit about invalid conditions, and incapable of storing data snapshots or granting the sender's personal-view access;
- every bulk action is domain-owned and action-permissioned, distinguishes explicit ids from all-matching scope, previews high-risk/revision-bound impact, reports durable per-item partial results, retries only eligible failures, and never derives generic edit/delete authority from table selection;
- authorization is verified by direct API tests, not only by hidden controls;
- both locales are complete;
- exact-value and keyboard alternatives exist for visualization and hover interactions;
- every Drawer is URL-restorable, preserves and returns focus/list context, adds decision evidence beyond its trigger, and escalates complex work to one dedicated typed route; rows with no additional value have no detail affordance;
- no placeholder/demo detail or unbounded payload is shipped;
- no unsupported capability produces an empty route, and no enabled capability bypasses its Platform Permission check;
- every Workspace capability either declares controlled adoption and has exactly the three canonical rollout stages with revision-bound preview/apply, Product API and worker enforcement, and Audit evidence, or declares no rollout and has no rollout route, record, UI, or denial; both paths remain independent from installation, enablement, eligibility, Entitlement, Workspace Permission, readiness, and health, and no per-User, percentage, expression, implicit-cohort, or hidden-exception path remains;
- every authorized Platform change applies directly after its owning-domain controls; no generic approver, approval queue, awaiting-approval draft, or configurable second-person policy exists, while workflows that inherently require distinct participants remain explicit domain contracts and cannot authorize unrelated changes;
- every instance configuration surface has one owning domain, exposes effective/source/readiness facts separately, uses explicit save or revision-bound preview/apply according to real risk, never reveals stored secrets, and cannot present request acceptance or connection-test success as final effective state;
- every configurable Operational Signal uses a typed owning-domain policy, revision-bound coverage preview, action-scoped permission, Audit evidence, and policy-version attribution; mandatory invariants explain why they cannot be disabled, while arbitrary expressions, cross-domain rules, retroactive history edits, and no-action metric alerts do not exist;
- no template-derived surface introduces Clerk, Recharts, a second icon/form/theme/loading stack, demo data, untranslated template copy, or a parallel shell; adopted source retains provenance and uses the Arclayer visual and application contracts;
- Light, Dark, and Follow system are the only theme preferences; both applications consume the same semantic tokens, first paint uses the resolved preference, and Platform Console code contains no template palette, accent picker, foreign font scale, raw page palette, gradient Dashboard, glow, or glass skin;
- Sidebar, command search, breadcrumbs, and mobile navigation expose the same enabled and authorized Platform Capabilities; only the active domain expands by default, Overview remains first, and no route-specific nested navigation Shell survives;
- Command Center providers are build-trusted, capability-selected, server-authorized, redacted, cancellable, and independently fallible; recent history contains destinations rather than queries, no universal data index or hidden-result disclosure exists, and workflow results cannot execute mutations directly;
- Needs attention supports permissioned claim, assignment, in-progress work, and time-bounded waiting with revision conflicts and Audit evidence, while assignment grants no source access, waiting work remains discoverable, only owning-domain facts confirm recovery, and no manual-resolve or duplicate incident lifecycle exists;
- no configuration is duplicated in a global Settings area, and no domain Overview exists without real work, readiness, or health content;
- no tenant directory or legacy settings route retains a commercial mutation form owned by the Commerce Platform Domain;
- Workspaces opens the Workspace queue by default, keeps Users and Projects as peer views, and retains no generic Overview, entity-shaped domain split, or duplicated Workspace Settings surface;
- Identity & Access opens the Platform team queue, retains no legacy Access/OAuth settings duplication, and does not absorb Tenant Governance or Workspace Administration authority;
- no Platform Operator Invitation grants entry eligibility, an effective role, permission, or session before the intended identity accepts and completes mandatory MFA; successful activation commits operator status and intended roles atomically, while stale or failed acceptance leaves no partial authority;
- only the Instance Owner or an active operator with explicit invitation permission may invite, the combined revision-bound roles stay within server-authoritative Delegable Platform Authority at send and acceptance time, and no role composition, stale revision, direct API call, or silent narrowing can escalate authority;
- Platform Operators receive an additive deduplicated union of Built-in or Custom Platform Roles only, Built-in roles remain immutable and copy to independent Custom roles, direct per-operator grants/denies/defaults do not exist, and Instance Owner authority is not represented by a role;
- Custom role changes use revision-bound server impact preview and explicit apply, atomically update every assignment, invalidate bound pending invitations and old authorization results, and affect the next request of an existing Platform Session without requiring logout;
- authority removal immediately blocks every new command while already accepted operations retain original authorization evidence and continue only within committed scope; cancellation requires a current exact permission plus an owning-domain safe idempotent boundary, and partial or irreversible effects remain explicit;
- Platform Operator offboarding atomically removes eligibility, Sessions, effective roles, Delegable Platform Authority, and affected invitations without deleting Product identity or historical evidence; return requires a new invitation and the Instance Owner cannot use this removal path;
- Instance Ownership Transfer requires current-owner nomination, an active target operator with a verified security key/passkey, fresh target Phishing-resistant Platform Verification and explicit acceptance, preserves exactly one owner atomically, ends target operator roles, applies only reviewed former-owner roles or deactivation, and revokes both principals' old Platform Sessions;
- Instance Ownership Recovery is configured and rehearsed before production, remains outside Platform RBAC and Console authority, distinguishes same-owner MFA restoration from unavailable-owner replacement, requires a verified security key/passkey before restored ownership-bound access, enforces notification/hold and exactly-one-owner invariants, and gives no support or recovery custodian normal Platform access;
- classified high-risk actions require server-enforced, action-bound fresh MFA at final apply while ordinary reads and low-risk saves do not; proof never grants permission, changes scope, survives relevant drift, or authorizes another operation;
- every browser or device has an independently identifiable Platform Session with versioned inactivity and absolute expiry, safe self-service inventory, one-device and all-other-device revocation, absolute-deadline MFA re-entry, bound step-up invalidation, Product Session isolation, and no arbitrary Session-count cap;
- every non-owner Platform Operator receives non-disclosing one-time recovery codes and can recover only through identity-authenticated code use or an exact-permission, step-up-verified reset by another actor; either path revokes all target Sessions, proofs, factors, and codes, blocks retained roles until new MFA setup succeeds, grants no temporary authority, and cannot target the Instance Owner;
- every active Owner or Operator retains at least one verified user-verifying security key/passkey or authenticator-app method, may enroll multiple methods, uses WebAuthn as the preferred path and TOTP as compatibility fallback, replaces the last method atomically, and cannot satisfy ordinary or Step-up MFA with email, SMS, voice, recovery codes, Product Sessions, or unverified setup;
- critical action requirements come only from the trusted action and permission catalog; Instance Owner and affected-role WebAuthn readiness is enforced across invitations, assignments, Custom Role revisions, transfer, recovery, and last-method removal, while TOTP cannot satisfy or downgrade phishing-resistant Step-up and no separate UI risk list survives;
- external identity providers authenticate identity only; their MFA prompts, assurance claims, Sessions, and remembered-device state cannot satisfy local Platform enrollment, Session MFA, Step-up, or critical WebAuthn, and the Console exposes no trust or downgrade switch;
- customer-authored content remains unavailable from ordinary Tenant Governance and every Platform Role, including Instance Owner; only a matching Workspace Owner Support Access Grant plus exact Platform permission authorizes a read-only support projection, with customer-visible history, immediate revocation, secret exclusion, and no Product Session, membership, impersonation, approval, or mutation path;
- AI services opens an actionable AI task queue, retains no legacy Agent settings wall or decorative usage cards, and cannot convert Platform operation authority into a Workspace approval or content mutation;
- Hosting & Domains opens an actionable delivery-issue queue, retains no legacy Domains/Storage settings duplication, and cannot convert Platform operation authority into Project content or publication authority;
- Messages & feedback opens the User feedback queue, retains no legacy Feedback/Notifications/Email route split, and uses one delivery ledger without allowing delivery retry to replay or mutate the source-domain event;
- Extensions opens the Installed list, retains no legacy Plugins card page or duplicated Connector configuration, and never treats instance installation as automatic Workspace activation, permission grant, or consuming-domain enablement;
- Monitoring & audit opens Requests & errors, retains no old Audit Log tabs or separate Observability route family, and never uses telemetry sampling, aggregation, retention, or permissions as Audit evidence;
- every primary user-visible label, description, status, empty state, error, and confirmation has stable `zh-CN` and `en-US` copy that explains the operator outcome without requiring knowledge of internal domain, permission, Provider, or state-machine terminology;
- `apps/platform` locale resources have exact bilingual key parity, disable cross-language fallback, contain no legacy key alias or hard-coded primary copy, map API codes to product language, and preserve user-authored values verbatim;
- no Payment Restricted Workspace is rendered as suspended or fully locked, and no synchronous/background entry point bypasses the Restricted Recovery Mode command matrix;
- no tenant billing mutation relies on generic Workspace manage access, and no Platform Operator can exchange Platform Commerce authority for a tenant Provider Portal session;
- no commercial or Hosting transition depends on notification delivery success, and no lifecycle notice bypasses the shared delivery ledger or current-role recipient resolution;
- no notification, Campaign, Operational Signal, or delivery retry can create a Domain Policy Exception, and no exception can change both Commerce and Hosting deadlines;
- no Policy Exception can reopen an expired window or rewrite lifecycle history, and no Domain State Correction can impersonate Provider recovery or mutate the other domain;
- no Commerce correction directly edits Hosting or waits on a distributed transaction, while no Hosting consumer may ignore/reapply the canonical corrected access fact or require an unnecessary second operator correction;
- no exception/correction preview or accepted job emits a tenant success notice, and no Commerce notice claims delivery restoration before a committed Hosting result;
- no tenant notification exposes a Platform Operator's personal identity, internal notes/evidence, Provider diagnostics, or raw audit data, and no customer-safe projection removes the full internal audit trail;
- targeted and release-boundary checks pass with evidence;
- obsolete routes, components, categories, and compatibility shims identified by the domain spec are removed.

## 11. Non-goals

- Replacing the canonical activity/audit store with an external vendor.
- Building a general-purpose BI tool or arbitrary user-authored widgets.
- Allowing executable third-party plugin code without package verification and an explicit trust policy.
- Storing raw HTTP bodies for troubleshooting.
- Treating a blocking Dialog as the security boundary for disabled users or tenants.
