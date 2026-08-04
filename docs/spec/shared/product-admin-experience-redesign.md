# Product and Platform Administration Experience Redesign

Status: Approved implementation contract; visual direction selected 2026-08-01
Owners: Product Application, Platform Console, API, Product Design
Applies to: `apps/admin`, `apps/platform`, `apps/api`, `packages/ui`, generated Product and Platform API clients, locale resources, route skeletons, and browser acceptance

## 1. Purpose and authority

This contract defines the final product experience for Arclayer administration. It replaces the delivered read-only, README-like, subsystem-oriented pages with complete commercial SaaS management workflows. It owns administration information architecture, customer-facing language, route inventory, page composition, complete-lifecycle delivery, state coverage, visual acceptance, and the integrated release gate.

The result must feel and behave like a production administration product used every day, not a technical demonstration, internal operations experiment, documentation browser, or generic dashboard template.

Contract routing is:

1. `CONTEXT.md` owns canonical domain entities and relationships.
2. This file owns the Product and Platform administration experience.
3. [Product and Platform separation](./product-platform-separation.md) owns application, deployment, Session, and authority boundaries.
4. Topic specs own exact domain rules, permissions, persistence, operations, and Audit evidence.
5. [Product UI toolchain](../admin/frontend/product-ui-toolchain.md), `DESIGN.md`, and `docs/guidelines/frontend-design.md` own implementation mechanics and visual language.

When contracts disagree, implementation stops and the conflict is resolved in the canonical docs. Current code is migration evidence, not authority for retaining an obsolete route, read-only surface, technical label, or incomplete action.

## 2. Product promise and hard boundaries

The Platform Console is an object-centred control plane whose promise is:

> Configure platform capabilities and continuously prove that they are taking effect and operating as intended.

Configuration and observability are connected facets of the same managed-object loop. The Console therefore connects desired configuration, effective state, readiness, health and use, problems and impact, permitted action, operation progress, verification, recovery, and immutable change evidence. It does not split the product into unrelated global “settings” and “monitoring” modes.

The application boundary is absolute:

- Platform Console contains only cross-Workspace or deployment-wide administration for the Instance Owner and authorized Platform Operators.
- Product Application contains customer work, current-Workspace administration, Knowledge, Skills, Design Systems, Plan & Usage, and People.
- Platform authority does not create Workspace membership, Product Session, tenant impersonation, customer-content visibility, or Product mutation authority.
- Workspace authority does not create Platform entry or Platform Permission.
- Customer content is visible to Platform Operators only through the exact time-bound, read-only Support Access Grant contract.
- Product and Platform retain independent route trees, Sessions, locale trees, API clients, and deployment artifacts.

## 3. Experience principles

Every retained surface follows these rules:

- Start with the object, decision, or outcome an administrator recognizes. Backend modules, permission codes, provider enums, jobs, queues, API paths, manifests, checksums, Git refs, and raw identifiers do not define primary copy or navigation.
- Use compact headers and one dominant reading axis. Do not use hero panels, card walls, oversized explanations, or large bordered empty containers.
- Use tables or structured lists for comparable objects. Cards are reserved for heterogeneous summaries or genuine visual previews.
- Connect configuration with effective state and proof when the same person needs both. Evidence, health, and history appear only where they support a real decision; they do not turn every page into an observability console.
- Every summary links to a typed object, condition, operation, change, or investigation. Decorative metrics and charts are forbidden.
- Preserve Product and Platform boundaries even when one visual direction demonstrates both families.
- Do not ship a route as a read-only projection, placeholder, disconnected button, disabled promise, or explanation of future implementation.

## 4. Canonical information architecture and routes

All frontend routes use stable non-localized path segments. No Platform route uses `/system`, `/platform`, a legacy alias, or a redirect retained for compatibility.

### 4.1 Platform Console

| Navigation | Canonical route | Retained surfaces |
|---|---|---|
| Overview / 总览 | `/` | global posture, evidence coverage, active changes, capacity risks, verified recent changes |
| Needs attention / 待处理 | `/attention` | ranked actionable conditions, assignment, work state, reminders, owning-domain remediation |
| Workspaces / 工作空间 | `/workspaces` | Workspaces, `/users`, `/projects`, route-backed object detail and governed support access |
| AI Services / AI 服务 | `/ai/tasks` | `/ai/providers`, `/ai/assistants`, `/ai/policies`, task and runtime recovery detail |
| Hosting & Domains / 托管与域名 | `/hosting/issues` | `/hosting/domains`, `/hosting/storage`, `/hosting/policies`, route-backed detail |
| Messages & Feedback / 消息与反馈 | `/messages/feedback` | `/messages/deliveries`, `/messages/campaigns`, `/messages/templates`, `/messages/email` |
| Extensions / 扩展 | `/extensions/installed` | `/extensions/catalog`, `/extensions/connections`, `/extensions/history`, route-backed detail |
| Plans & Billing / 套餐与计费 | `/billing/subscriptions` | `/billing/plans`, `/billing/payments`, `/billing/credits`, `/billing/configuration` |
| Access & Security / 访问与安全 | `/access/team` | `/access/roles`, `/access/sign-in` |
| Monitoring & Audit / 监控与审计 | `/monitoring/requests` | `/monitoring/performance`, `/monitoring/ai-usage`, `/monitoring/activity`, `/monitoring/audit` |

Overview is first. Enabled and authorized domains follow in the order above. Only the active domain expands by default. Sidebar, mobile navigation, breadcrumbs, and command search derive from one capability- and permission-aware projection.

Unsupported or uninstalled capabilities create no destination. Disabled but activatable capabilities appear only in authorized capability management with exact prerequisites and a real enablement workflow. A domain without a meaningful landing page opens its primary useful queue or list.

### 4.2 Product Application

Customization remains a peer Product Application group:

| Destination | Route | Primary job |
|---|---|---|
| Knowledge | `/customization/knowledge` | shared guidance, reusable references, effective-context preview, conflicts, freshness, access, and use |
| Skills | `/customization/skills` | discover, create, test, publish, govern, observe, disable, and retire reusable ways of working |
| Design Systems | `/customization/design-systems` | create and release visual foundations, preview real output, connect Projects, review impact and adoption |

Workspace Settings contains:

1. General.
2. Plan & Usage.
3. People, with People, Pending, Invite links, and Requests views when supported.
4. Roles & Permissions when the current Plan Revision includes role management.

Members and Invitations are not separate destinations. Knowledge, Skills, and Design Systems are not settings tabs and never move into the Platform Console.

## 5. Platform page model

### 5.1 Overview

Overview is a compact operating surface, not a revenue dashboard, arbitrary widget canvas, or documentation page. It presents:

- effective global posture and the scope and freshness of supporting evidence;
- domain posture with exact destinations;
- active changes and their current operation or verification state;
- ranked conditions requiring intervention;
- capacity, spend, delivery, or commercial risks with affected scope;
- recent changes and their observed outcome;
- clear ownership and the next permitted action.

Healthy state still shows monitored scope, last successful verification, active operations, and recently recovered conditions. Missing, stale, or partial evidence explicitly means current posture cannot be confirmed; it never becomes healthy by omission.

### 5.2 Needs attention

Needs attention contains only conditions requiring an operator decision or intervention. Related signals correlate into one condition. Priority derives from severity, affected scope, urgency, customer impact, and policy deadline.

Coordination states are Unclaimed, In progress, Waiting, and Source-confirmed recovered. Authorized operators may claim, assign, transfer, add notes, mark work in progress, or wait with a reason and return time. Assignment grants no source-domain authority.

Operators cannot manually resolve an active source condition. Suppression or a not-actionable decision requires an explicit reason, expiry where applicable, exact permission, and Audit evidence. Remediation invokes the owning domain's canonical operation; Needs attention never owns a simplified mutation path.

### 5.3 Domain control surfaces

A domain landing surface combines only the information required to operate its owned capabilities:

- configuration posture and missing prerequisites;
- important managed objects and current effective state;
- health, usage, capacity, or delivery evidence where relevant;
- unresolved conditions and affected scope;
- active operations and recent verified changes;
- safe next actions.

It is not a wrapper around empty tabs or a summary of backend services.

### 5.4 Managed-object dossier

A managed object uses up to five facets: Overview, Configuration, Observability, Issues, and Change history. A facet appears only when it contains a real object-specific job or evidence type.

- Overview connects desired and effective state, readiness, important evidence, unresolved issues, ownership, and actions.
- Configuration exposes editable product concepts and effective source; technical representation is secondary detail.
- Observability preserves object context and links to deeper Monitoring & Audit evidence.
- Issues contain correlated product conditions, not undifferentiated logs.
- Change history records before and after state, actor, reason, operation, outcome, and post-change verification.

Desktop directories use route-backed master-detail or dedicated detail routes. A Drawer or Sheet supports quick inspection and context-preserving transition; it cannot hide an object's complete lifecycle. Narrow layouts use list-to-route navigation and restore search, filters, sorting, selection, and scroll context on return.

## 6. Complete Platform lifecycle matrix

| Surface | Required complete jobs |
|---|---|
| Overview | inspect evidence-backed posture; refresh without losing content; open exact condition, object, operation, or change; distinguish healthy, stale, partial, unavailable, and failed evidence |
| Needs attention | filter, sort, save view, claim, assign, transfer, mark in progress, wait with reminder, add notes, open canonical remediation, observe source-confirmed recovery, preserve list context |
| Workspaces | search and inspect Workspace/User/Project relationships; view restrictions and lifecycle state; apply or remove supported restrictions with impact; start and track legal/lifecycle operations; review commercial/hosting/monitoring projections; create, inspect, revoke, and audit customer-authorized read-only Support Access |
| AI tasks | inspect cross-Workspace task state; retry eligible failed work; request safe cancellation; reconcile partial or unknown outcomes; observe actual metering and verification; open owning Workspace only through an authority-free Product link |
| AI providers | connect credentials through a non-disclosing secret flow; edit routing and availability; test readiness; enable or disable; preview rollout impact; diagnose and recover failures; rotate or remove credentials safely; review use and change history |
| Built-in assistants and policies | create or revise supported definitions; validate and test realistic cases; publish or enable; preview affected scope; disable or retire; review adoption, failures, and change history |
| Hosting issues | investigate affected sites and domains; invoke source-owned retry, certificate, routing, storage, suspension, or restoration actions; track partial outcomes and verification |
| Domains and certificates | add and verify domain ownership; inspect effective routing and certificate state; renew or recover; change routing with impact preview; remove only after dependency and consequence review |
| Storage and delivery policies | configure and test; show effective source, capacity, readiness, and health; preview and apply cross-Workspace changes; reconcile drift; restore supported prior state |
| Feedback and deliveries | inspect feedback; send governed replies; inspect recipient deliveries; retry eligible delivery without replaying source events; diagnose suppression, bounce, provider, or template failure; retain complete evidence |
| Campaigns and templates | draft, preview, validate audience or variables, schedule or send, pause or cancel when safe, inspect per-recipient outcomes, clone or revise, archive, and review history |
| Email service | configure sender and route; verify domain and credentials; send a test; inspect readiness and delivery health; rotate credentials; disable safely; recover and audit |
| Extensions | discover trusted catalog entries; inspect provenance, permissions, compatibility, dependencies, and consumers; install, configure in owning domains, enable, update, verify, roll back, disable, remove, recover, and review durable history |
| Plans | create draft Plan Revisions; validate; preview affected Workspaces; publish immutable revisions; deprecate future selection without rewriting active history; inspect adoption and audit |
| Subscriptions, payments, and Credits | investigate state and provider evidence; reconcile events; retry or recover payment where domain-safe; preview and apply authorized corrections; inspect Credit sources, expiry, depletion, usage, and reconciliation; never edit commercial state through a generic Workspace form |
| Billing configuration | configure provider readiness and mappings; verify webhooks and credentials without disclosure; test; rotate; diagnose; recover; review changes and affected scope |
| Platform team | invite intended identity and roles; resend or revoke; accept with current-authority revalidation and MFA enrollment; inspect active operators; preview and apply offboarding; preserve operation and Audit attribution |
| Roles & permissions | inspect built-in roles; create or copy a custom role; preview permission, operator, invitation, and self-impact; apply revision atomically; assign additive roles; retire eligible custom roles; never use direct per-user grants or denies |
| Sign-in and account security | configure deployment sign-in and identity providers on `/access/sign-in`; from the Sidebar account settings overlay, enroll and manage the current actor's supported local methods, protect the last method, inspect and revoke device Sessions, apply current action-bound Step-up requirements, and review account security evidence |
| Monitoring & Audit | investigate requests and errors; correlate objects, actors, Workspaces, changes, and operations; inspect trends with exact-value alternatives; save authorized views; export according to policy; review immutable Audit evidence; deep-link to owning-domain actions without duplicating them |

Every omitted lifecycle action must be forbidden by an explicit domain rule, not absent implementation. A retained page without its required jobs is removed from navigation and routing until the complete vertical exists.

## 7. Product Customization lifecycle

Knowledge, Skills, and Design Systems are for ordinary Workspace Owners, content owners, designers, and collaborators. Their primary language is not a developer package model. `SKILL.md`, manifests, Git repository paths, checksums, blobs, hooks, semantic versions, indexing internals, and immutable artifact terminology stay out of primary UI.

The shared creation-context loop is discover or inherit, apply in a Project or Agent run, observe the result, refine, and govern reuse and change. Agent and Project workflows are primary creation and application contexts; `/customization/*` is the team management centre.

### 7.1 Knowledge

Each Workspace owns one shared-guidance layer; each Project owns project guidance that supplements or explicitly overrides it under a visible precedence and conflict contract. Users do not create a “Knowledge Base” container before entering useful guidance.

The page must support editing and publishing shared guidance, previewing effective Workspace and Project context, identifying overrides, conflicts, and unavailable instructions, inspecting where guidance is used, restoring prior content, and removing content with impact review.

Files, websites, manual pages, and Connectors are optional reusable references. When used, the complete source lifecycle includes add, permission validation, processing, preview, synchronization, freshness, retrieval test, citations, failure recovery, detach or removal impact, and history. These mechanics do not dominate the default guidance experience.

### 7.2 Skills

Skills are reusable ways of completing a job inside Agent work. The library distinguishes Arclayer-built and team-created Skills without changing invocation semantics.

A team Skill is created through guided Agent conversation or saved from a successful task, then reviewed, tested with realistic cases, and published. Manual editing and supported import are secondary portability paths presented with preview, mapping, validation, and recovery rather than Git plumbing.

The product must support discovery by outcome and example, explicit composer selection, visible automatic matching, removal or rerun without a matched Skill, risk-appropriate confirmation for external effects, team ownership, adoption and outcome evidence, revision and retest, disablement, and retirement. Declaration validity alone is not a successful test.

### 7.3 Design Systems

A Design System connects a reusable brand foundation and interface system to real Project output. It may contain logos, imagery direction, colours, typography, voice, guidance, semantic tokens, components, layouts, motion, and accessibility rules.

Users can create or refine one through Agent conversation, brand-manual parsing, derivation from a website or Project, or supported import. A Workspace may own several Design Systems; one Project connects to exactly one at a time, and a Workspace may set one default for new Projects.

The lifecycle is draft, representative real-page preview and validation, release, Project connection or update offer, adoption and adherence evidence, revision, replacement, and retirement. Releasing a revision never silently updates connected Projects. Each Project receives a revision-bound impact preview and accepts the update under current authority. Durable Project-local change becomes a proposal or fork, not a silent mutation of the released source.

## 8. Plan & Usage

Plan & Usage is one Workspace commercial control loop answering what the Workspace has, what it can do, what it has consumed, what will happen next, and how an authorized Owner can act.

It connects current Plan and billing state, Credits and other real capacities, current-period usage, forecast, attribution, invoices, plan and refill actions, cancellation, and recovery. Credits show their source, applicability, issue or refresh event, expiry or rollover, and depletion order. Usage attributes consumption to Projects, people, Agent work, and meaningful capabilities under exact visibility permissions.

Owners can upgrade, downgrade, refill, configure automatic refill with an explicit monetary ceiling, manage billing, inspect invoices, cancel, and recover payment failures. A Plan change previews timing, billing consequence, changed capabilities and limits, affected Projects and people, preserved data, and access convergence before checkout.

Materially variable Agent, generation, build, or publish actions show an estimated Credit range and assumptions at the point of use. Completion records actual Credits, balance source, variance, Workspace, actor, Project, and operation. Partial, cancelled, retried, or failed work exposes the actual metered and reconciliation outcome.

Invalid dates, missing limits, stale usage, Provider synchronization failure, and reconciliation gaps are explicit commercial errors. They never render as normal data.

## 9. People and invitations

People represents a person's relationship to the Workspace across active membership, Project-only collaboration, pending named invitation, reusable invite link, and supported access request while preserving each authority source.

- People view manages active members and Project-only collaborators, roles or Fixed Member Access, feature allocation, source, state, usage, and removal impact.
- Pending view shows recipient, intended access, delivery state, expiry, sender, resend, revoke, conflict, acceptance, and Audit evidence. Accepted people move into active membership.
- Invite links view shows resulting access, forwarding risk, verified-domain policy, expiry, capacity or redemption policy, redemption history, rotation, and disablement.
- Requests view supports approve or reject with exact resulting access and commercial impact when the deployed identity capability supports it.

A named invitation pre-authorizes only the named recipient and is revalidated at acceptance. A reusable link creates a join request by default. Direct join is allowed only under an explicit eligible verified-domain, maximum-access, expiry, capacity, and redemption policy. Link possession alone never silently grants Workspace membership.

Workspace membership is invited from People. Project-only access is invited from Project Share. Each flow previews access scope, role or common access, feature allocation, Credit or capacity consequence, policy restrictions, and current authority before sending.

## 10. Risk-tiered mutations and operations

- Routine reversible actions execute directly and expose a real undo only when the domain guarantees reversal.
- Impactful actions show exact scope, affected objects or people, before and after state, timing, and a required reason.
- High-risk actions use a server-generated revision-bound impact preview, current permission and state revalidation, the required fresh Step-up Platform Verification, and explicit consequence confirmation.
- Asynchronous work persists server-side and exposes queued, running, cancellation requested, partially applied, succeeded pending verification, verified effective, failed unchanged, failed with unknown outcome, recovering, and cancelled-with-effect states as applicable.
- API acceptance is not completion. Completion requires effective-state and relevant observability verification.
- Retry targets only eligible failed work under the original idempotency and metering contract. Cancellation acts only at a domain-defined safe boundary.
- Partial and irreversible outcomes remain durable and visible. A Toast is never the only result or recovery path.
- Audit connects actor, Session, authority revision, reason, preview, target, before and after state, operation progress, external evidence, actual billing or metering, outcome, and verification.

## 11. Three-layer state model

Every page implements three separate connected layers.

### 11.1 Page and evidence state

Initial loading preserves final structure. Background refresh retains content and reports progress and last update. Fresh, stale, partial, true empty, filtered empty, missing prerequisite, unsupported, uninstalled, permission denied, offline, server failure, source synchronization failure, and reconciliation failure are distinct states.

Each state names affected scope, whether existing data remains trustworthy, whether an attempted change was applied, and the next authorized recovery action. Missing evidence never becomes success. Filtered empty preserves active criteria and provides reset.

### 11.2 Edit and operation state

Edit flows distinguish unchanged, dirty, validating, invalid, preview generation, preview ready, preview expired, and concurrent conflict. Operations distinguish verification required, queued, running, cancellation requested, partial, succeeded pending verification, verified effective, failed unchanged, unknown final outcome, recoverable, recovering, and cancelled with actual effect.

Server state is authoritative. Operation progress restores after navigation, refresh, Session renewal, or sign-in when the principal remains authorized.

### 11.3 Object lifecycle state

Shared labels such as Draft, Processing, Ready, Needs attention, Active or Published, Disabled, Failed, and Retired are used only when their meaning and actions match. Configured is not Ready; stored is not usable; accepted is not applied; succeeded is not verified effective.

Each object state defines bilingual label and explanation, actions, transition authority, evidence and freshness, non-colour treatment, and Audit projection.

## 12. Platform Experience Kit and visual direction

### 12.1 Shadcn Admin boundary

The previous implementation adopted only selected `satnaing/shadcn-admin` Sidebar, Header, collapsed navigation, mobile shell, and theme references. It did not deliver a complete administration foundation. This shell-only adoption is an explicit redesign defect.

Shadcn Admin remains a reviewed MIT source donor, not a runtime framework or second application. Its routing, auth, dashboard data, theme tokens, typography, cards, charts, icons, and duplicate primitives do not become Arclayer architecture. No replacement full admin framework may introduce a second route, form, data, token, icon, chart, or design system.

The reusable foundation is an Arclayer-owned Platform Experience Kit built from `@arclayer/ui`. It provides tested compositions for Overview, Needs attention, domain landing, managed-object dossier, operational directory and Saved Views, master-detail, inline configuration, bounded forms, impact preview, durable operations, evidence and change history, and the full page-state matrix. Feature pages do not reimplement these patterns locally.

### 12.2 Selected direction: A · Operational Ledger

Selected by the user on 2026-08-01. The approved reference is `output/imagegen/product-admin-visual-directions-2026-08-01/a-operational-ledger.html`.

“Operational Ledger” names the information grammar, not a product label and not a mandate to turn every screen into a table or monitoring console.

- Use compact titles, standard toolbars, dense structured records, clear state, exact actions, and route-backed detail.
- Keep desired state, effective state, evidence freshness, issues, latest change, and next action together only where the administrator needs that control loop.
- Use previews where the object is visual or the consequence is easier to understand visually: Design Systems, effective Knowledge context, Plan trends, and impact review.
- Product Customization and Workspace Settings retain the Product shell. The reference's combined review navigation exists only to compare seven representative screens and must not be copied into production.
- Evidence, health, and history are contextual supporting information. They must not dominate simple Product tasks or create artificial observability panels.
- Copy must read like a commercial SaaS product. Abstract labels such as “command surface”, “operational ledger”, “control plane object”, implementation modules, or diagnostics are not customer-facing names.
- Use the selected direction across desktop and narrow layouts without mechanically copying static sample data, fake actions, or combined information architecture.

The visual target is quiet, composed, low-noise, and operationally dense: soft neutral canvas, white work surfaces, cool neutral ink, blue only for action and selection, restrained semantic colours, platform-native mixed Chinese/Latin typography, crisp borders, minimal shadow, and the existing Arclayer token system. No gradients, glassmorphism, neon, blue haze, marketing dashboard, or cyberpunk styling.

## 13. Product language and i18n

Every visible label, description, status, action, validation message, error, confirmation, operation outcome, and Audit summary uses a stable semantic i18n key in the owning app. `zh-CN` and `en-US` ship together and preserve the same meaning and action hierarchy.

Platform uses its independent locale tree. It disables cross-language runtime fallback and fails checks on missing keys, locale asymmetry, raw keys, hard-coded product strings, concatenated sentences, or default English that conceals missing Chinese copy.

Copy is direct, calm, and outcome-oriented. It leads with recognizable objects and consequences. Authorized diagnostics first show a plain-language summary, then clearly labelled technical evidence. User-authored names, notes, reasons, and content remain verbatim and are never machine-translated.

Dates, amounts, currencies, percentages, durations, Credits, counts, and units use shared locale-aware formatting. Billing copy distinguishes Plan, billing period, granted, used, reserved, available, renewal, and cancellation; ambiguous “quota” language is forbidden.

## 14. Accessibility and responsive acceptance

Every retained route targets WCAG 2.2 AA. Pages use correct landmarks, heading order, tables, lists, fields, labels, descriptions, buttons, and links. Navigation, search, filters, Saved Views, tables, menus, drawers, dialogs, editors, previews, and risk-tiered operations are keyboard operable.

Focus is visible and intentional. Overlays receive and return focus correctly. Route transitions focus the new primary heading or work region. Required actions are never hover-only. State is never colour-only. Form errors retain input, associate with fields, and provide a focusable summary when several errors block submission. Motion respects reduced-motion preference.

Routes are verified at 1280, 768, and 375 CSS pixels, at 200% zoom, and at 400% reflow for critical workflows. Narrow layouts reprioritize and recompose; they do not merely shrink desktop tables or create permanent page-level horizontal scrolling. Secondary filters may move into a Sheet while search, active-filter count, and primary action remain available. Task-critical columns become prioritized row content and secondary values move to detail.

Charts use `@arclayer/ui/chart`, include visible title, accessible summary, localized units, explicit loading/empty/error states, and an exact-value list or table when exact values affect a decision.

## 15. API and delivery unit

Frontend, Product or Platform API, domain service, permissions, persistence, background jobs, Audit, generated OpenAPI client, i18n, tests, and browser evidence are one delivery unit for every retained job.

- The API returns stable domain/result codes and typed parameters, not translated primary copy.
- Reads expose desired, effective, source, readiness, health, freshness, permission projection, current revision, and permitted actions where relevant.
- Mutations enforce authority and object state directly; hidden or disabled controls are not security boundaries.
- High-risk changes use server previews and revision-bound apply. Concurrent drift fails visibly.
- Long-running work has durable identity, progress, per-target outcomes, idempotency, cancellation semantics, actual metering, recovery, and Audit evidence.
- Secret values are write-only and never returned after storage.
- No mock response, optimistic fake success, silent fallback, compatibility alias, or frontend-only state may satisfy a required lifecycle.

## 16. Implementation and release gate

Implementation proceeds as cohesive verticals but the redesign releases only when the retained scope is globally complete:

1. Establish the Experience Kit, canonical routes, capability projection, product-language resources, and full state primitives.
2. Replace the root with real Overview and move cross-domain triage to `/attention` without retaining Operations Inbox aliases.
3. Complete Platform domain verticals with real mutations, operations, verification, recovery, and Audit.
4. Complete Knowledge, Skills, and Design Systems in Agent, Project, and Customization contexts.
5. Complete Plan & Usage and unified People, including commercial, invitation, access, and point-of-use Credit flows.
6. Remove every legacy route, shell, read-only projection, duplicate authority, technical primary label, and obsolete locale key.

A requirement is complete only when:

- its retained routes match section 4 and legacy aliases are absent;
- the lifecycle in sections 6–9 is available through real server-enforced contracts;
- all states in section 11 have correct semantics and recovery;
- copy is natural in both locales with no primary technical leakage;
- permission, capability, readiness, rollout, commercial, health, and evidence failures remain distinct;
- desktop, tablet, narrow, zoom, reflow, keyboard, focus, reduced-motion, light, and dark evidence passes;
- `pnpm platform:check`, `pnpm admin:check`, API checks for changed contracts, and final `pnpm check` pass without hiding pre-existing or new failures;
- representative browser evidence covers Overview, Workspaces, AI Services, Knowledge, Design Systems, Plan & Usage, and People in both locales and includes populated, empty, filtered-empty, partial, stale, permission, error, editing, operation-progress, and recovery states as applicable;
- GitNexus impact review and changed-scope detection show only the expected execution flows;
- repository rule review reports no unresolved finding.

There are no deferred retained pages, read-only exceptions, mock-success paths, compatibility facades, or implementation-status placeholders in the accepted result.
