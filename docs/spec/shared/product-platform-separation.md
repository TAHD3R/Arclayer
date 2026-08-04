# Product and Platform Separation Implementation Contract

Status: Approved boundary contract; administration experience amended 2026-08-01
Owners: Product Application, Platform Console, API
Applies to: `apps/admin`, `apps/platform`, `apps/api`, `packages/ui`, generated OpenAPI clients, deployment routing, and the retained Platform and Workspace domain modules

## 1. Purpose

This contract integrates the approved Product Application, Platform Console, Workspace Administration, commercialization, instance governance, capability configuration, visual language, product-copy, and hard-cut migration decisions into one executable rollout boundary.

It does not duplicate field-level or domain-specific behavior from the topic contracts. It defines which application and authority owns each concern, the order in which the repository reaches that target, the cross-domain scenarios that must remain coherent, and the release gate for removing the legacy mixed Admin surface.

The product outcome is:

- customers use one Product Application for building sites and administering their current Workspace;
- the Instance Owner and authorized Platform Operators use a separate Platform Console for deployment-wide operations;
- both applications consume one modular backend codebase through independent FastAPI composition roots;
- Workspace commercial and lifecycle authority never becomes Platform authority, and Platform authority never becomes tenant impersonation;
- every retained page answers a real user or operator question, exposes useful configuration or action, and uses bilingual plain-language product copy;
- obsolete dashboard cards, duplicated settings, mixed navigation, compatibility routes, and implicit authority are removed rather than hidden.

## 2. Contract authority and routing

The following precedence applies:

1. `CONTEXT.md` owns canonical domain language and relationships.
2. [Product and Platform administration experience redesign](./product-admin-experience-redesign.md) owns administration IA, product language, complete-lifecycle delivery, page composition, state coverage, and the integrated experience gate.
3. This file owns the cross-application, deployment, Session, and authority boundary.
4. The topic contracts below own their exact domain behavior, API semantics, state matrices, copy keys, and tests.
5. `DESIGN.md` owns the shared visual language; `docs/guidelines/frontend-design.md` explains its Admin-era implementation context without becoming a contract source.
6. ADRs under `docs/adr/` preserve why hard-to-reverse decisions were made. They do not override a newer canonical Spec.
7. Live code is evidence of current state, not authority for retaining legacy behavior that conflicts with these contracts.

| Contract | Canonical responsibility |
|---|---|
| [Administration experience redesign](./product-admin-experience-redesign.md) | final Product/Platform IA, route inventory, complete lifecycle, Experience Kit, state model, visual gate, language, accessibility, rollout, and acceptance |
| [Platform control-plane rollout](./admin-control-plane-rollout.md) | Platform domain invariants, capability-driven navigation, operational interaction rules, migration details, and Platform release gate |
| [Product and Platform UI toolchain](../admin/frontend/product-ui-toolchain.md) | shared components, shadcn Registry use, source-donor rules, charts, route skeletons, motion, and bilingual product copy |
| [Workspace commercialization](./workspace-commercialization.md) | Plans, Plan Revisions, Subscriptions, Credits, Entitlements, Free eligibility, active Project limits, Feature Seats, dunning, and Commerce |
| [Workspace invitations and permissions](./workspace-invitation-permission-experience.md) | invitations, Fixed Member Access, Workspace roles and permissions, and member-level feature allocation |
| [AI Website Builder platform](./ai-website-builder-platform.md) | Product Application builder, Project and Workspace setting ownership, Customization, and Product runtime contracts |
| [Platform Identity & Access](./admin-identity-access.md) | Instance Owner, Platform Operators, Platform Roles, MFA, Platform Sessions, transfer, and recovery |
| [Platform Tenant Governance](./admin-tenant-governance.md) | cross-tenant Workspace, User, and Project investigation, restrictions, lifecycle and support-access boundaries |
| [Monitoring & Audit](./admin-observability-dashboard.md) | Needs attention source projections, request investigation, trends, and Audit evidence |
| [Platform AI Operations](./admin-ai-operations.md) | cross-Workspace AI task operations, provider readiness, official assistants, action policy, and recovery |
| [Platform Hosting & Delivery](./admin-hosting-delivery.md) | delivery issues, domains, certificates, storage, delivery policy, suspension, and restoration |
| [Platform Communications](./admin-communications.md) | feedback operations, sending issues, campaigns, templates, and delivery configuration |
| [Platform Extensibility](./admin-extensibility.md) | Extension trust, install/update lifecycle, compatibility, permissions, and capability registration |

When this integration contract and a topic contract appear to disagree, implementation stops and resolves the documentation conflict explicitly. It must not choose one silently or add a compatibility branch.

## 3. Verified current-state delta

The 2026-07-30 repository state is a migration source with these known gaps:

| Current evidence | Required target |
|---|---|
| `apps/admin` contains Product routes and Platform routes in `src/constants/menu/global.ts` under `/system/*`. | `apps/admin` contains Product Application code only; every Platform route, menu item, page, client, state store, locale key, skeleton, and test moves to `apps/platform` or is deleted. |
| `apps/platform` is absent from `pnpm-workspace.yaml`, root scripts, and the application tree. | `apps/platform` is an independent `@arclayer/platform` workspace with its own build, checks, locales, route tree, OpenAPI consumer, host, and deployment artifact. |
| `apps/api/src/main.py` exposes one `create_app()` composition. | `apps/api` exposes independently startable Product API and Platform API FastAPI compositions with separate routes, OpenAPI documents, boundary middleware, and host-facing entrypoints. |
| Product and Platform access currently share legacy super-admin assumptions in multiple routes and projections. | Product Session, Platform Session, Workspace authority, Platform Roles, and non-delegable Instance Owner authority are separate, server-enforced contracts. |
| `Workspace.owner_user_id` exists, but Workspace creation does not consistently populate it and access still derives `is_creator_admin` from Organization Owner plus creator identity. | `Workspace.owner_user_id` is the sole Workspace ownership authority; creation initializes it, transfer changes it explicitly, and every creator-admin or assignable Owner-role compatibility path is removed. |
| Root build and quality scripts target only `@arclayer/admin` and `@arclayer/api`. | root scripts include `@arclayer/platform`, and `platform:check` independently enforces lint, formatting, types, tests, build, route generation, and locale parity. |

These gaps are implementation inventory, not permission to preserve the old model.

## 4. Application and deployment boundaries

### 4.1 Product Application — `apps/admin`

`apps/admin` remains package `@arclayer/admin` and is the customer-facing Product Application. Its historical directory name is not a product term and does not authorize instance-level code to remain there.

It owns:

- customer sign-in and Product Sessions;
- Workspace selection, building, Projects, sites, content, and publishing;
- Workspace Administration and Customization;
- tenant checkout, Plan & Usage, Credits, billing recovery, and authorized Provider Portal entry;
- customer-created support access grants and customer-visible support access history;
- the minimal account-menu link to the separately hosted Platform Console when the Product API reports Platform Entry Eligibility.

It does not own Platform routes, Platform Sessions, Platform Roles, cross-tenant operations, provider reconciliation, instance capability configuration, or Platform Audit.

### 4.2 Platform Console — `apps/platform`

`apps/platform` is package `@arclayer/platform` and produces an independent frontend artifact on a configured Platform Host. It owns all instance-level navigation, pages, clients, query state, local state, translations, route skeletons, tests, and browser acceptance.

It may consume `@arclayer/ui`, generated Platform API types, and other explicitly public shared packages. It must not import source files from `apps/admin`, mount Product Application pages, reuse a Product Session, or preserve an embedded `/system` shell.

The Console root `/` is `Overview / 总览`; `/attention` is `Needs attention / 待处理`. Stable frontend routes use the exact non-localized business segments in the administration experience redesign contract; a `/system` or `/platform` frontend prefix is forbidden.

### 4.3 Shared backend — `apps/api`

`apps/api` remains one modular monolith, package `@arclayer/api`, with one database authority, migration history, domain service layer, job system, and internal event contracts. Product and Platform API compositions reuse those modules without mounting one FastAPI application inside the other.

Each composition has:

- an independently startable host-facing entrypoint;
- an explicit router allowlist;
- independent authentication and Session middleware;
- independent CORS, CSRF, cookie, origin, rate-limit, security-header, and request-context policy;
- an independent OpenAPI document and generated client boundary;
- boundary tests proving Product credentials cannot authorize Platform endpoints and Platform credentials cannot become Product or Workspace authority.

This split is not a microservice or database split. A future service extraction requires a separate decision.

### 4.4 Shared packages

`packages/ui` owns Arclayer's public visual primitives, semantic tokens, shared charts, and reviewed application-agnostic composition. Shared packages must not contain either application's route tree, navigation policy, authenticated app state, product-specific copy catalog, or authority decisions.

Application packages never import one another's source. Reuse occurs through a reviewed shared package with a real multi-consumer contract, not an alias or facade created only to avoid moving legacy code.

## 5. Canonical principals and authority

| Principal or scope | Authority | Explicit exclusion |
|---|---|---|
| Instance Owner | exactly one deployment-wide, non-delegable owner; complete Platform governance; instance ownership transfer and recovery participation | not a synthetic Platform Role; no standing customer-content access; no Workspace ownership by implication |
| Platform Operator | deployment-wide operations allowed by the additive union of assigned Platform Roles | no direct per-user grants or denies; no tenant impersonation; no authority from a Workspace role |
| Workspace Owner | exactly one User identified by `Workspace.owner_user_id`; non-delegable tenant commercial, ownership-transfer, and lifecycle authority | not an assignable Workspace role; not derived from Organization ownership; not copied by Fixed Member Access |
| Workspace member | Product authority from Fixed Member Access or current Workspace roles plus independent capability gates | no commercial ownership, lifecycle authority, or Platform authority by membership alone |
| Organization Owner or member | account-level grouping and Organization membership governance only | no automatic Workspace ownership, Plan, Subscription, Credits, Entitlements, Usage, Feature Seats, or Workspace lifecycle authority |

Workspace creation sets the creator as the initial `Workspace.owner_user_id` and creates the required active membership. Later ownership changes use one explicit, audited Workspace ownership-transfer workflow that rechecks the target's Free Workspace Allowance and preserves exactly one Owner.

The following legacy concepts are removed together:

- `is_creator_admin` projections and request-context fields;
- Organization Owner plus Workspace creator as implicit Workspace authority;
- creator-admin membership or Owner-role bootstrap;
- a selectable or assignable Workspace `owner` system role used as ownership authority;
- permissions that infer tenant billing, transfer, or deletion from generic Admin or settings access.

Organization-level governance may provide an authorized directory or grouping view, but it cannot mutate Workspace-owned commercial or lifecycle state without the exact independent Workspace or Platform authority required by the owning domain.

## 6. Product Application information architecture

### 6.1 Workspace Administration

Workspace Administration remains the current-Workspace dialog or overlay and contains only:

1. **General** — Workspace identity and ordinary tenant settings.
2. **Plan & Usage** — current Plan, Subscription state, Credits, Usage, resource allowances, active Project usage, member-assigned capability capacity, checkout, Provider Portal, and recovery.
3. **People** — active members, Project-only external collaborators, pending named invitations, reusable invite links, join requests where supported, and member-level feature allocation.
4. **Roles & Permissions** — one combined role and permission experience when the bound Plan Revision includes role management.

Knowledge, Skills, and Design Systems are not Workspace Administration tabs.

When role management is unavailable, the Product Application does not mount the Roles & Permissions data surface or issue its protected catalog queries. A disabled navigation entry remains discoverable with a localized eligible-Plan badge and opens the exact Plan & Usage explanation. People views omit role selectors and describe the common non-Owner access in plain language.

### 6.2 Customization

Customization is a peer Product Application navigation group for the current Workspace:

1. **Knowledge**
2. **Skills**
3. **Design systems**

Primary navigation and headings omit the redundant “Workspace” prefix. Technical APIs and ownership contracts may retain Workspace-scoped names. Customization uses the Product Application shell and real typed pages; it is not embedded in the settings dialog, moved into Platform AI Operations, or represented as opaque settings JSON.

### 6.3 Plan-governed product access

The Free Plan is non-expiring and has no paid-feature trial, automatic paid conversion, payment-method requirement, or hidden downgrade timer. A User may own at most one Free Workspace and may join any number of other Workspaces. Each additional owned Workspace requires its own Provider-confirmed paid Subscription before becoming usable.

Every Plan Revision declares explicit Credits, Entitlements, resource allowances, and an Active Project Allowance. Creating or restoring a Project consumes an active place atomically; archiving releases it without deleting the Project. Being above a newly lowered allowance preserves existing Projects and blocks only further creation or restoration.

Paid-only features remain honestly discoverable. Their controls show a localized Plan badge, remain disabled, and open the exact Plan & Usage explanation. The UI must preserve distinct reasons for:

- unsupported or uninstalled capability;
- instance disabled;
- configuration not ready;
- Workspace rollout exclusion;
- Plan Entitlement missing;
- member allocation missing;
- Workspace Permission denied;
- insufficient Credits or resource allowance;
- runtime health failure.

An upgrade prompt must not replace a different denial reason.

### 6.4 Fixed Member Access and member-assigned paid capabilities

A Plan Revision without role management gives every non-Owner member one immutable Fixed Member Access profile. Ordinary members are equal to one another, not equal to the Workspace Owner. Invitations cannot choose a role, and direct API submissions of role codes fail visibly.

A member-assigned paid capability uses Workspace-owned Feature Seats and active-membership assignments. Primary customer copy says “使用名额” in Chinese and “access” in English rather than exposing Entitlement or seat terminology.

- Plan & Usage shows assigned and available capacity.
- People owns assignment and revocation for active people.
- role and permission editors contain no capacity or assignment controls.
- the Workspace Owner always manages assignments.
- a non-Owner requires the exact `workspace:feature-seats:manage` permission, available only when role management exists.
- assignment grants no role, permission, rollout inclusion, readiness, Credits, or runtime health.
- membership termination releases assignments transactionally; rejoining restores nothing implicitly.

### 6.5 Plan Access Convergence

An access-reducing Plan change cannot be scheduled until a revision-bound server preview records the exact effect on members, roles, invitations, Billing Managers, feature-access managers, assignments, queued actor-bound work, and effective time. A target Free Plan also rechecks the current Owner's Free Workspace Allowance at preview and effectiveness.

At the effective boundary, unsupported custom roles, role assignments, invitation role bindings, and Feature Seat Assignments are end-dated. Fixed Member Access applies when role management is absent, and a lowered Feature Seat allowance retains only the exact assignments selected in the reviewed preview.

Ended configuration is immutable Audit history, not dormant configuration. A later upgrade restores no roles, invitations, permissions, or assignments automatically.

## 7. Platform Console information architecture

The Platform Console uses one collapsible domain Sidebar. Overview is first, only the active domain expands by default, and the Header contains breadcrumbs and global utilities rather than a second navigation model. Configuration lives inside its owning domain; there is no global Settings, Configuration, Dashboard, or miscellaneous Platform domain. The exact route inventory is canonical in the administration experience redesign contract.

| Navigation label | Default surface | Peer pages and owned capability |
|---|---|---|
| **Overview** | global effective posture and evidence coverage | Needs attention; domain posture, active changes, capacity risk, and verified recent changes |
| **Workspaces** | Workspaces | Users; Projects; restrictions, lifecycle/legal-case entry, customer-safe support access, and exact cross-domain deep links |
| **AI Services** | AI tasks | Models & providers; Built-in assistants; Actions & policies; Runtime recovery |
| **Hosting & Domains** | Delivery issues | Domains & certificates; File storage; Delivery policies |
| **Messages & Feedback** | User feedback | Deliveries; Campaigns; Message templates; Email service |
| **Extensions** | Installed | Extension catalog; Connections; Install & update history |
| **Plans & Billing** | Subscriptions requiring attention | Plans and immutable Revisions; Subscriptions; provider events and payments; Credits and corrections; provider configuration and readiness |
| **Access & Security** | Platform team | Roles & permissions; Sign-in & registration |

Current-actor profile, MFA methods, device Sessions, language, and theme are account settings reached from the Sidebar user menu. They are not Platform Domain navigation destinations and do not create a global Settings route or nested settings shell.
| **Monitoring & Audit** | Requests & errors | Performance trends; AI usage; Activity trends; Audit trail |

Primary navigation renders only deployment-enabled capabilities visible to the current operator. Unsupported or uninstalled capabilities create no blank page. Disabled but activatable capabilities appear only in authorized capability management with exact prerequisites and a real enablement path.

Domain landing pages exist only when they present actionable work, readiness, or meaningful health. Decorative metric-card overviews, revenue dashboards, arbitrary widgets, repeated current-value details, and charts whose source values are already obvious are forbidden.

## 8. Platform capability, configuration, and rollout model

The Platform API owns one trusted Platform Capability Catalog. Each record has a stable capability id and owning domain, localized metadata keys, support state, enablement state, configuration readiness and missing prerequisites, runtime health, build-registered route target, and required Platform Permissions.

Support, installation, enablement, readiness, rollout, commercial Entitlement, member allocation, Workspace Permission, resource allowance, and runtime health are independent gates. They never collapse into one `enabled` flag.

Configuration changes use the owning domain's risk tier:

- low-risk saves validate, apply, and audit directly;
- consequential changes require a revision-bound impact preview and explicit confirmation;
- classified high-risk applies additionally require action-bound Step-up Platform Verification;
- cross-Workspace or long-running work becomes a durable operation with partial-result evidence and idempotent retry boundaries.

There is no global approval queue. A currently authorized actor applies a change after the controls required by its owning domain. Multiple participants are required only when the domain invariant itself needs distinct actors, such as Instance Ownership Transfer.

Workspace-facing Platform capabilities use exactly three rollout stages:

1. not available;
2. available to explicitly selected eligible Workspaces;
3. available to all eligible Workspaces.

Every rollout change uses a revision-bound impact preview, explicit apply, Platform Audit, and Product API plus worker enforcement. Per-User targeting, random percentages, arbitrary expressions, hidden exceptions, implicit cohorts, and compatibility feature flags are forbidden. Feature Seat Assignment remains a separate commercial allocation and never becomes rollout targeting.

## 9. Platform identity and security

There is exactly one Instance Owner. Platform Operators receive authority only through one or more Platform Roles; effective permissions are the additive deduplicated union. Built-in roles are immutable and localized. Deployments may copy them into independent Custom Roles. Direct per-operator grants, denies, overrides, hidden defaults, and a synthetic all-access Owner role do not exist.

Platform Operator invitation records intended identity and roles but grants no authority. The intended person authenticates, accepts, and completes mandatory Platform MFA before operator activation and role assignment commit atomically. The inviter's exact invitation permission and Delegable Platform Authority are revalidated at acceptance.

The Platform Host issues or validates an independent device-scoped Platform Session after local Platform MFA. Product Sessions, identity-provider MFA, remembered-device claims, and upstream `amr` or `acr` values never satisfy Platform MFA or Platform API authorization.

Platform MFA supports user-verifying security keys or passkeys as the preferred method and authenticator-app time-based codes as the compatibility fallback. Critical actions declared by the trusted action catalog require fresh phishing-resistant WebAuthn verification and never downgrade to TOTP.

Platform Sessions have independent idle and absolute expiry and per-device revocation. Role changes affect the next request without requiring re-login. Removing Platform authority blocks every new command, confirmation, retry, expansion, or human-authorized step; already accepted durable operations retain their original evidence and continue only under their owning-domain contract.

Instance Ownership Transfer is a two-party nomination and phishing-resistant acceptance workflow that preserves exactly one Owner. Instance Ownership Recovery is a deployment-configured, out-of-Console break-glass authority and never becomes a Platform Role or ordinary Platform API.

## 10. Cross-domain authority scenarios

### 10.1 Product-to-Platform entry

The Product API may return only Platform Entry Eligibility. The Product Application shows an external “Open Platform Console” entry, and the Platform Host independently authenticates and authorizes the actor. No Product token, Session, Workspace context, role, or permission crosses the boundary.

### 10.2 Support access to customer content

Platform authority alone exposes only minimum operational metadata and redacted projections. Reading customer-authored Project content, Knowledge, Skills, or Design Systems requires both an exact Platform support-read permission and a current time-bound Support Access Grant created by the Workspace Owner for one case, named operators, and explicit scope.

The grant is read-only, customer-visible, revocable, and audited. It creates no Workspace membership, Product Session, impersonation, tenant approval, mutation authority, secret access, or standing Instance Owner visibility.

### 10.3 Tenant billing versus Platform Commerce

The Workspace Owner always has tenant-side commercial authority and may delegate `workspace:commerce:manage` to active members only through the Workspace role engine when the Plan allows role management. Those Billing Managers may use tenant Checkout, Provider Portal, ledger, Plan selection, and recovery flows.

Platform Commerce permissions authorize investigation, catalog management, Subscription operations, Credit correction, provider management, and reconciliation through Platform APIs. They never produce a tenant Provider Portal session, permit payment submission, or impersonate a Workspace Owner or Billing Manager.

### 10.4 Payment restriction, Hosting, and deletion

Commerce owns Payment Grace and Payment Restricted. Hosting owns Hosting Continuity, Delivery Suspended, and restoration. Neither domain edits the other's state directly.

Restricted Recovery Mode preserves authorized read, export, security, privacy, lifecycle, billing-recovery, and access-reduction actions while blocking new content, Project, Customization, membership-expansion, credential, AI, import, build, publish, deployment, and domain-change work at Product API and worker boundaries.

Commercial or Hosting state never authorizes Workspace deletion. Deletion begins only from an explicit Workspace Owner instruction through Workspace Lifecycle Authority or a documented legal/privacy process.

### 10.5 Operational Signals and source truth

Needs attention projects actionable conditions but does not own their resolution. Assignment, work-in-progress, waiting, and reminders coordinate work without changing severity, health, or source lifecycle. Only the owning domain confirms resolution or a committed recovery result.

Monitoring telemetry, Audit evidence, Communications delivery evidence, and source-domain state remain separate even when linked by correlation identity.

## 11. Product experience, visual language, and copy

Product Application and Platform Console share `DESIGN.md`, semantic tokens, `@arclayer/ui`, Lucide icons, and the reviewed shared chart boundary. They do not share an application shell or navigation model.

The Platform Console adapts `satnaing/shadcn-admin` as a reviewed MIT source donor. It is not a runtime dependency, Git subtree, package alias, or second design system. Donated code is copied selectively, reconciled with current dependencies, accessibility, i18n, `DESIGN.md`, and `@arclayer/ui`, and then owned by Arclayer.

Operational UI follows these rules:

- queues and directories use server pagination, search, Filters, visible ordering, reset, and typed URL state;
- rows open an investigative Drawer only when the detail adds cause, impact, chronology, evidence, or an authorized next action;
- durable peer views, long history, and complex workflows receive stable full-page routes;
- cards and charts exist only when they answer a question more clearly than a list or sentence and provide exact accessible alternatives;
- all loading, refresh, empty, filtered-empty, partial, permission, validation, conflict, offline, and server-error states are explicit;
- no fake values, silent fallback, swallowed error, manual-refresh dependency, generic JSON detail, or frontend-derived financial total is allowed.

Every new product string uses a stable semantic i18n key with exact `zh-CN` and `en-US` resources. Platform locales live in `apps/platform/locales/{zh-CN,en-US}` and disable cross-language fallback. Locale asymmetry, raw keys, hard-coded primary copy, or obsolete key aliases fail `platform:check`.

Primary copy explains the object, outcome, consequence, and recovery action in natural language. It does not expose RBAC, Entitlement, Provider state machines, protocol names, permission codes, database fields, or internal lifecycle enums as user-facing explanations. Diagnostics retain those facts in a clearly separated authorized layer.

## 12. API, persistence, and operational behavior

- Product API and Platform API return stable codes and typed parameters; frontend applications own localized presentation.
- Each mutation has an exact owning domain, action-scoped permission or non-delegable authority, idempotency identity, expected revision when state can drift, Audit evidence, and explicit failure behavior.
- Preview never grants authority and never substitutes for apply-time validation.
- Background acceptance is not completion. Durable operations expose queued, running, partially completed, failed, cancelled-when-safe, and terminal results honestly.
- Authorization is re-evaluated at every command and effect boundary required by the domain contract. A queued request does not preserve a revoked Feature Seat, Workspace permission, rollout inclusion, Platform role, or configuration readiness.
- Generated OpenAPI clients remain the frontend type source. Handwritten duplicate request or response types and shared compatibility envelopes are forbidden.
- Database migrations fail explicitly on ambiguous ownership, unresolved trial state, mismatched Plan/Price mappings, invalid role bindings, or impossible authority invariants. They do not guess, discard, or silently normalize conflicting state.

## 13. Implementation waves and hard cuts

Implementation may use multiple focused changes, rehearsals, and deployable backend migrations. The official Platform frontend still cuts over at one release boundary after every retained capability passes the final gate.

### Wave 0 — Contract freeze and inventory

- treat this file and every routed topic contract as the implementation baseline;
- inventory every `/system` route, Platform component, API client, store, locale key, route skeleton, test, backend route, super-admin dependency, creator-admin path, mutable commercial record, trial state, and existing Workspace Owner value;
- define deterministic migration outcomes and stop on ambiguous records;
- establish focused residue scans and contract tests before moving code.

### Wave 1 — Workspace ownership and authority hard cut

- backfill and enforce one non-null `Workspace.owner_user_id` per active Workspace;
- initialize ownership on every creation path and add explicit transfer authority;
- remove `is_creator_admin`, creator-admin membership/role bootstrap, Organization-derived Workspace authority, and assignable Owner-role semantics;
- update Workspace, Project, billing, support-access, deletion, invitation, and permission boundaries to consume canonical ownership;
- prove Free Workspace Allowance under creation, downgrade, and transfer concurrency.

### Wave 2 — Monorepo and application foundations

- add `apps/platform`, package scripts, Turbo tasks, workspace registration, build output, test setup, locale parity checks, and host configuration;
- adapt the reviewed shadcn-admin donor shell through `@arclayer/ui` and Arclayer tokens;
- establish independent Product and Platform route trees, app bootstrap, error boundaries, and shared route-skeleton composition;
- keep Platform inaccessible as the official production entry until the final cutover gate.

### Wave 3 — API composition and Platform security foundation

- split Product API and Platform API composition roots, OpenAPI documents, generated clients, middleware, origin/cookie/session policy, and route allowlists;
- implement Platform Entry Eligibility as discoverability only;
- establish Instance Owner, Platform Operator invitation, roles, exact permissions, Platform MFA, device Sessions, Step-up verification, transfer, recovery, and Audit;
- prove cross-credential denial before migrating Platform pages.

### Wave 4 — Product Application navigation and Workspace administration

- remove Platform navigation and route ownership from Product Application source;
- hard-cut Workspace Administration to General, Plan & Usage, People, and conditional Roles & Permissions;
- move Knowledge, Skills, and Design Systems into the peer Customization group and remove redundant Workspace copy;
- implement natural bilingual copy, responsive navigation, explicit states, and no protected page mount for unavailable role management.

### Wave 5 — Workspace commercialization and access convergence

- implement non-expiring Free Plan, Free Workspace Allowance, immutable Plan Revisions, active Project limits, tenant billing authority, Feature Seats, assignment UI, and independent runtime gates;
- migrate mutable Plans, Plan-only mappings, trial states, and legacy approval workflows through explicit retirement rules;
- implement Plan Access Convergence, Restricted Recovery Mode, commercial lifecycle notifications, and Commerce-to-Hosting facts without cross-domain mutation.

### Wave 6 — Platform shell, capabilities, and first operational verticals

- implement the capability-driven Sidebar, Command Center, independent locales, personal Saved views, explicit bulk-action capabilities, and domain-owned configuration;
- ship Overview, Needs attention, and Monitoring & Audit from real persisted sources;
- ship Access & Security and Workspaces with exact permissions, redaction, support-access grants, and no duplicated Product management forms.

### Wave 7 — Platform commercial and runtime operations

- ship Plans & Billing with Plan/Revisions, Subscriptions, provider events, Credits, corrections, configuration readiness, and exact Workspace deep links;
- ship AI Services and Hosting & Domains queues, readiness, configuration, durable recovery operations, and cross-domain projections;
- retain commercial, Hosting, AI, Monitoring, and tenant authorities separately.

### Wave 8 — Communications and Extensibility

- ship Messages & feedback with one delivery authority, real feedback operations, Campaigns, templates, provider readiness, and delivery retry evidence;
- ship Extensions with trusted catalog, install/update history, compatibility, permission review, rollback, and consuming-domain configuration links;
- remove legacy Plugins, Notifications, Email, Feedback, and global Configuration page families after their replacement verticals pass acceptance.

### Wave 9 — One-boundary Platform cutover

- enable the independently hosted Platform Console only after all retained Platform capabilities, permissions, migrations, bilingual copy, and browser scenarios pass;
- remove every Platform route, navigation entry, page, client, store, locale key, skeleton, test, and build reference from `apps/admin` in the same release boundary;
- remove legacy Platform API routes, `require_super_admin` compatibility authority, aliases, facades, and old generated client surfaces;
- retain only explicitly documented forward-compatible database changes needed to rehearse rollback of the previous complete release, followed by a declared retirement migration.

## 14. Verification and release acceptance

The rollout is complete only when all of the following pass with reproducible evidence.

### 14.1 Repository and application boundaries

- `pnpm-workspace.yaml`, root scripts, and Turbo tasks include `@arclayer/platform`.
- application packages do not import one another's source.
- `apps/admin` contains no Platform routes, page modules, API clients, stores, locale keys, skeletons, or navigation entries.
- Platform build output and host are independent from Product Application output and host.
- Product API and Platform API generate distinct OpenAPI documents and frontend clients.

### 14.2 Ownership and authorization

- every active Workspace has exactly one canonical Owner and every creation path sets it;
- ownership transfer, Free Workspace Allowance, billing, deletion, support access, invitations, and Feature Seat authority use `Workspace.owner_user_id` rather than creator or Organization authority;
- residue scans find no `is_creator_admin`, creator-admin bootstrap, assignable Workspace Owner role, generic super-admin Platform route guard, or Product credential accepted by Platform API;
- Instance Owner remains exactly one across bootstrap, transfer, recovery, and failure races;
- Platform role changes and Session revocation affect the next request.

### 14.3 Product Application behavior

- Workspace Administration contains the approved four destinations and Customization contains the approved three pages;
- Free ordinary members see Fixed Member Access, no role selectors, and a distinct immutable Owner;
- unavailable paid capabilities show exact Plan badges and explanations without masking other denial reasons;
- active Project limits, member feature access, Plan Access Convergence, Restricted Recovery Mode, and billing recovery pass direct API and browser tests;
- all primary `zh-CN` and `en-US` copy is natural product language with key parity.

### 14.4 Platform Console behavior

- root `/` is an evidence-backed Overview, with actionable source conditions in `/attention`, not a KPI dashboard;
- every enabled and authorized Platform Domain opens its approved default queue and exposes only useful peer pages;
- configuration appears only in the owning domain and unsupported capabilities produce no blank navigation;
- queues, Drawers, full pages, Saved views, bulk actions, explicit states, and accessibility satisfy the Platform control-plane and UI-toolchain contracts;
- customer-authored content remains unavailable without both exact Platform permission and a current Workspace Owner Support Access Grant.

### 14.5 Commercial and cross-domain invariants

- Workspace is the only Commercial Tenant; no Organization or User Plan, Subscription, Credits, Entitlements, or pooled Usage exists;
- no paid trial, automatic paid conversion, silent Free conversion, dormant role restoration, or automatic Feature Seat restoration remains;
- Platform Commerce cannot open tenant Provider Portal or submit payment data;
- Payment Restricted, Hosting continuity, Delivery Suspended, Notifications, and Workspace deletion remain independent authorities;
- notification or retry success never fabricates source-domain success.

### 14.6 Quality gates

- focused migration, API contract, authorization, concurrency, and domain tests pass;
- `pnpm admin:check`, `pnpm platform:check`, `pnpm api:check`, and `pnpm check` run through repository scripts and reach visible final results;
- generated route trees and OpenAPI clients are regenerated through repository generators and are clean;
- `git diff --check`, documentation link checks, locale parity, residue scans, GitNexus `detect_changes`, and Code Review Engine changed-scope audit pass;
- real browser QA covers Product and Platform hosts, both locales, Light/Dark/Follow system, narrow and desktop layouts, keyboard use, deep links, Session separation, error states, and the final route hard cut;
- no mock data, fallback success, ignored exception, compatibility facade, or unexplained skipped acceptance case remains.

## 15. Non-goals

- Splitting `apps/api` into independently owned services or databases.
- Renaming `apps/admin` solely to match its Product Application meaning.
- Rebuilding the Platform Console as a generic analytics dashboard, BI tool, arbitrary widget system, or global settings catalog.
- Making Organization the commercial tenant or allowing Plans, Credits, Usage, or Entitlements to pool across Workspaces.
- Paid trials, temporary paid features, automatic upgrades, or silent downgrades.
- Per-User Entitlements, per-User Workspace rollout targeting, direct operator permission overrides, or a general approval queue.
- Platform impersonation of Workspace Owners, Billing Managers, members, or Product Sessions.
- Moving customer-authored Knowledge, Skills, Design Systems, Agents, or project content into Platform configuration.
- Preserving legacy `/system` routes, Admin terminology, creator-admin authority, mutable published Plans, old route aliases, or dual Product/Platform authority for compatibility.
- Introducing defensive fallback behavior to make a partially migrated deployment appear successful.

## 16. ADR traceability

The approved decision record is grouped as follows:

- Application and API separation: ADR 0001–0006, 0036–0037, 0043–0044, and 0047.
- Platform home, information architecture, interaction, visual language, and configuration: ADR 0007–0009 and 0027–0046.
- Workspace commercialization, restrictions, Hosting interaction, tenant billing, and notifications: ADR 0010–0026.
- Platform operator lifecycle, roles, Sessions, MFA, ownership, and recovery: ADR 0028 and 0048–0061.
- Customer-content support access, capability rollout, change application, and cross-domain attention triage: ADR 0062–0065.
- Free Plan, Workspace eligibility, active Project allowance, Fixed Member Access, Feature Seats, Customization, and downgrade convergence: ADR 0066–0072.

Every implementation change must be explainable through this Spec, one routed topic contract, and the applicable ADR rationale. A decision outside those boundaries requires an explicit contract update before code changes begin.
