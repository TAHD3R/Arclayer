# Arclayer Product and Platform Context

Arclayer separates customer-facing product work from deployment-wide platform operations so tenant administration and instance governance do not share one ambiguous Admin boundary.

## Language

**Product Application**:
The customer-facing workspace where users create and manage their content, projects, and sites.
_Avoid_: Admin, Admin UI

**Workspace Administration**:
Tenant-scoped management of one Workspace's general details, plan and usage, members, invitations, roles, and permissions.
_Avoid_: Platform administration, system administration

**Customization**:
The Product Application group for Workspace-scoped Knowledge, Skills, and Design Systems that shape AI and site creation.
_Avoid_: Workspace settings, Platform AI Operations, system configuration

**Workspace**:
The customer-governed collaboration and project/site boundary that owns its members, customization, and commercial state.
_Avoid_: Organization, Site, account

**Workspace Owner**:
The single User who holds the Workspace's non-delegable commercial, ownership-transfer, and lifecycle authority.
_Avoid_: Assignable Owner role, ordinary member, Platform Operator

**Workspace Lifecycle Authority**:
The server authority that governs Workspace archive, restoration, explicit Owner deletion, and documented legal or privacy erasure independently of commercial state.
_Avoid_: Commerce cleanup, dunning retention, operator convenience deletion

**Organization**:
An account-level governance container that groups Workspaces and organization memberships without owning their commercial state.
_Avoid_: Commercial Tenant, billing account

**Commercial Tenant**:
The single Workspace-scoped authority that owns a Plan, Subscription, Credits, Entitlements, and Usage.
_Avoid_: Organization billing, account balance, inherited plan

**Plan**:
The stable commercial identity of one product offer across changes to its terms.
_Avoid_: Plan version, price row, Subscription

**Plan Revision**:
An immutable published snapshot of a Plan's display terms, prices, Credits, refresh policy, resource allowances, Entitlements, and provider mappings.
_Avoid_: Mutable Plan configuration, audit copy, Plan code suffix

**Free Plan**:
A non-expiring Workspace Plan with explicitly limited Credits, Entitlements, and resource allowances that remains usable without a payment method or paid-trial countdown.
_Avoid_: Paid trial, Payment Grace, automatic downgrade target

**Free Workspace Allowance**:
The account-level eligibility that permits one User to own at most one Workspace whose Subscription is bound to the Free Plan.
_Avoid_: User Plan, account Subscription, shared Workspace Plan

**Active Project Allowance**:
The maximum number of non-archived Projects that one Workspace's bound Plan Revision authorizes at the same time.
_Avoid_: Lifetime Project count, published-site limit, User Project quota

**Fixed Member Access**:
The one non-Owner Workspace access profile applied to every ordinary member when the bound Plan Revision excludes role management.
_Avoid_: Free role assignment, equal ownership, per-member override

**Feature Seat**:
One unit of a Workspace-owned Plan allowance that may be assigned to an active member for one member-assigned paid capability.
_Avoid_: Personal Entitlement, role permission, per-User rollout

**Feature Seat Assignment**:
The revocable binding of one Workspace **Feature Seat** to one active membership and one Entitlement key.
_Avoid_: Permission grant, User subscription, feature flag

**Plan Access Convergence**:
The previewed effective-boundary transition that retires access configuration unsupported by a Workspace's target Plan Revision.
_Avoid_: Dormant paid configuration, automatic permission restoration, silent downgrade cleanup

**Grandfathered Subscription**:
A Subscription that remains bound to an older Plan Revision after the Plan publishes a newer selling Revision.
_Avoid_: Stale Subscription, outdated Plan, automatic upgrade candidate

**Subscription Revision Transition**:
An explicit, auditable change that rebinds a Subscription from one published Plan Revision to another.
_Avoid_: Plan refresh, latest-version lookup, background upgrade

**Renewal Transition**:
A Subscription Revision Transition scheduled to take effect at the Subscription's next confirmed renewal boundary.
_Avoid_: Immediate migration, publication effect, background upgrade

**Commercial Correction**:
An immediate single-Workspace repair of demonstrably incorrect commercial state with explicit Provider, proration, Credit, and Entitlement consequences.
_Avoid_: Cohort migration, expedited Renewal Transition, manual database edit

**Domain Policy Exception**:
A time-bounded, reasoned, and audited single-Workspace override owned by the domain whose policy-derived deadline it changes.
_Avoid_: Commercial Correction, notification compensation, global policy edit

**Domain State Correction**:
An evidence-backed compensating transition that changes one Workspace's already-effective Commerce or Hosting lifecycle state without rewriting its original history.
_Avoid_: Domain Policy Exception, timestamp edit, payment recovery

**Dunning Policy**:
The configured Provider-aware rules that govern payment recovery, Payment Grace, restriction, and restoration after a failed renewal.
_Avoid_: Hard-coded grace days, immediate Free downgrade, indefinite paid access

**Payment Grace**:
The time-bounded commercial access state after payment failure in which recovery remains available without deleting or silently downgrading Workspace data.
_Avoid_: Active paid period, unlimited grace, Payment Restricted

**Payment Restricted**:
The commercial access state after recovery is exhausted in which paid effects are blocked while Workspace data remains preserved and recoverable.
_Avoid_: Workspace deletion, Free Plan, archived Workspace

**Restricted Recovery Mode**:
The Product Application mode that preserves authenticated read, export, recovery, security, privacy, and lifecycle access while Payment Restricted blocks value-expanding commands.
_Avoid_: Workspace Suspension, read-only Plan, account lockout

**Billing Manager**:
An active Workspace member explicitly delegated to manage tenant-side plan, Provider Portal, payment recovery, and commercial records.
_Avoid_: Platform Operator, settings administrator, Commerce operator

**Commercial Lifecycle Notification**:
A role-sensitive transactional notice triggered by a Commerce or Hosting lifecycle milestone and delivered through the Notifications authority.
_Avoid_: Notification Campaign, Provider-only email, daily billing blast

**Customer-Safe Reason Category**:
A stable localized reason code that explains a Platform intervention without exposing internal evidence, diagnostics, or personnel.
_Avoid_: Operator free text, audit evidence, Provider error

**Hosting Policy**:
The instance-configured rules that govern published-site continuity, delivery suspension, and restoration after commercial access becomes restricted.
_Avoid_: Dunning Policy, deployment mutation, automatic unpublish

**Hosting Continuity Window**:
The time-bounded Hosting state in which the last active release remains publicly served after its Workspace enters Payment Restricted.
_Avoid_: Payment Grace, free hosting, republish period

**Delivery Suspended**:
The recoverable Hosting state in which public delivery is paused without removing the active release, artifacts, domain bindings, or certificate associations.
_Avoid_: Unpublished, deleted site, disconnected domain

**Commerce Platform Domain**:
The Platform Domain that operates the plan catalog, cross-Workspace subscriptions, provider integration, billing events, and audited commercial corrections.
_Avoid_: Workspace Plan & Usage, billing dashboard, system settings

**Commerce Configuration Center**:
The Commerce-owned Platform Console surface that manages Provider and Connector readiness, payment-recovery policy, and persisted Commerce catalog rules while linking to other domains' capability state without owning it.
_Avoid_: Global Settings, Platform Capability Catalog, Workspace Plan & Usage

**Commerce Catalog Rule**:
A persisted Commerce constraint or definition that validates Plan terms across currencies, billing cycles, Credits, Entitlements, resource allowances, and Provider price mappings.
_Avoid_: Plan Revision, Platform Capability, frontend validation rule

**Language Catalog**:
The deployment-owned registry of supported locales and their display metadata, enabled/default state, ordering, and flag presentation; it does not contain arbitrary translation content.
_Avoid_: Translation key editor, browser locale preference, Country directory

**System Settings Platform Domain**:
The authenticated Platform Domain at `/settings` that owns deployment-wide configuration with no other domain authority, including instance identity, domain defaults, Platform language metadata, regional/display defaults, SEO defaults, and explicitly cross-cutting behavior.
_Avoid_: Setup wizard, Account preferences, Global catch-all settings

**Tenant Governance Platform Domain**:
The Platform Domain whose primary work queue is Workspaces and whose peer investigative views cover cross-tenant Users, Projects, access restrictions, and authorized lifecycle or legal cases.
_Avoid_: Tenant Overview, customer dashboard, Workspace Administration

**Support Access Grant**:
A Workspace Owner's time-bound, revocable authorization for named Platform Operators to read explicitly scoped customer content for one support case without becoming Workspace members.
_Avoid_: Impersonation, standing Platform access, tenant role assignment

**Identity & Access Platform Domain**:
The Platform Domain that governs deployment-wide sign-in policy, identity providers, Platform operator authority, multi-factor enforcement, and Platform Sessions.
_Avoid_: User directory, Workspace permissions, Access settings

**Platform AI Operations Domain**:
The Platform Domain that operates cross-Workspace AI tasks, model and provider readiness, official Agent availability, safety policy, and runtime recovery.
_Avoid_: Agent settings, Workspace Customization, AI dashboard

**Platform Agent Definition**:
A deployment-owned official assistant identity whose runnable behavior is supplied by retained Platform Agent Versions.
_Avoid_: Workspace Agent, mutable assistant configuration, Agent settings row

**Platform Agent Version**:
An immutable validated configuration of one Platform Agent Definition that may be published for new tasks or retired while historical attribution remains intact.
_Avoid_: In-place assistant edit, overwritten prompt, disposable revision

**Skill Declaration**:
The server-validated statement of the Tools, permissions, data classes, external destinations, references, and capability labels required by one platform Skill version.
_Avoid_: Arbitrary permission text, implicit Tool access, undocumented data transfer

**Platform AI Policy**:
The single deployment-wide, revisioned maximum policy that governs AI routing, budgets, Tools, approvals, external data transfer, retention, and runtime availability.
_Avoid_: Workspace override, assistant-local security policy, saved-but-unenforced setting

**Hosting & Delivery Platform Domain**:
The Platform Domain that operates cross-Workspace site delivery, domain and certificate readiness, file storage, delivery policy, suspension, and restoration.
_Avoid_: Domains settings, Storage settings, Project publishing

**Communications Platform Domain**:
The Platform Domain that owns feedback triage and replies, announcements and campaigns, message templates, email-service readiness, and recipient delivery evidence.
_Avoid_: Notifications settings, Email settings, messaging dashboard

**Extensibility Platform Domain**:
The Platform Domain that owns instance Extension discovery, installation, trust, compatibility, permission review, upgrade, rollback, disablement, and removal.
_Avoid_: Plugins page, Connector settings, capability configuration

**Monitoring & Audit Platform Domain**:
The Platform Domain that combines operational telemetry investigation and immutable administrative evidence under one navigation boundary while preserving their separate data, retention, and permission contracts.
_Avoid_: Dashboard, Audit Log tabs, Operations Inbox

**Commerce Permission Set**:
The action-scoped Platform Permissions that separately authorize Commerce observation, catalog management, Subscription management, Credit adjustment, provider management, and event reconciliation.
_Avoid_: commerce administrator, commerce.manage, super-admin access

**Platform Console**:
The deployment-wide operations surface for cross-tenant governance and instance capabilities.
_Avoid_: Admin, Workspace settings

**Product API**:
The customer-facing API surface used by the Product Application and Workspace Administration.
_Avoid_: Admin API, Platform API

**Platform API**:
The instance-governance API surface used by the Platform Console.
_Avoid_: Admin API, Product API

**Platform Session**:
An independently authenticated, device-scoped, and revocable session whose authority is limited to the Platform Console and Platform API and whose lifetime cannot be refreshed beyond its absolute expiry.
_Avoid_: Product session, upgraded Product token

**Platform Session Lifecycle Policy**:
The versioned inactivity and absolute-lifetime rules that determine when one device-scoped Platform Session expires and requires a new multi-factor-authenticated sign-in.
_Avoid_: Infinite refresh, Product session policy, fixed session-count cap

**Step-up Platform Verification**:
A fresh multi-factor proof bound to one Platform Session and one high-risk action context before final application.
_Avoid_: Platform Permission, login MFA reuse, verification for every mutation

**Platform MFA Recovery**:
The identity-bound process that lets one non-owner Platform Operator replace unusable multi-factor credentials without preserving a Platform Session or changing Platform Roles.
_Avoid_: Instance Ownership Recovery, password reset, administrator impersonation

**Platform MFA Method**:
A verified security key, passkey, or authenticator-app credential enrolled by one Instance Owner or Platform Operator for Platform authentication challenges.
_Avoid_: Recovery code, email code, SMS code, Product sign-in method

**Phishing-resistant Platform Verification**:
A Step-up Platform Verification completed with a user-verifying security key or passkey when a trusted Platform action requires phishing-resistant assurance.
_Avoid_: TOTP fallback, role name, frontend-inferred risk

**Platform Entry Eligibility**:
A minimal non-authoritative Product API projection indicating that the current identity may attempt to enter the Platform Console.
_Avoid_: Platform Permission, Platform authorization, upgraded Product session

**Platform Permission**:
A named instance-level capability that authorizes one class of Platform API operation.
_Avoid_: Workspace permission, super-admin flag

**Platform Role**:
A reusable set of Platform Permissions assigned to Platform Operators.
_Avoid_: Workspace role, all-access operator flag

**Built-in Platform Role**:
An Arclayer-managed, localized Platform Role that provides a non-editable starting responsibility for common operations.
_Avoid_: Super-admin role, editable default, permission preset

**Custom Platform Role**:
An operator-managed Platform Role created independently or copied from a Built-in Platform Role for deployment-specific delegation.
_Avoid_: Per-user override, Workspace custom role, edited built-in role

**Platform Role Revision**:
An immutable server revision of one Platform Role's permissions used to review, apply, and authorize role changes consistently.
_Avoid_: Session permission snapshot, editable role row, invitation auto-upgrade

**Accepted Platform Operation**:
A durable operation committed after Platform authorization whose original actor, permission, role revisions, scope, and result remain evidenced independently of later authority changes.
_Avoid_: Ongoing session authority, cancellable promise, completed success

**Instance Owner**:
The single transferable principal that holds ultimate governance authority for one Arclayer deployment.
_Avoid_: Super Administrator, Platform Operator

**Instance Ownership Transfer**:
A two-party, MFA-confirmed transition that atomically replaces the deployment's single Instance Owner and explicitly resolves the former owner's later Platform access.
_Avoid_: Owner role assignment, dual-owner handover, immediate reassignment

**Instance Ownership Recovery**:
A deployment-configured break-glass process outside the Platform Console that restores the verified Owner's MFA access or atomically replaces an unavailable Owner without granting ordinary Platform authority to the recovery actor.
_Avoid_: Operator promotion, support impersonation, Platform Role quorum

**Platform Operator**:
An individually authenticated user with delegated instance-level permissions to operate the Platform Console.
_Avoid_: Super Administrator, Workspace administrator

**Deactivated Platform Operator**:
A former Platform Operator whose Platform access and effective role assignments have ended while historical identity and evidence remain attributable.
_Avoid_: Deleted User, paused permissions, suspended Workspace

**Platform Operator Invitation**:
An identity-bound invitation that records intended Platform Roles but grants no Platform authority until acceptance and mandatory multi-factor enrollment complete.
_Avoid_: Active Platform Operator, Platform Session, permission grant

**Delegable Platform Authority**:
The server-authoritative subset of Platform authority that an Instance Owner or Platform Operator may grant to another identity through Platform Roles.
_Avoid_: All current permissions, team-management access, Instance Owner transfer

**Platform Capability**:
An instance-level product or operational function that a deployment may support, enable, configure, and monitor independently.
_Avoid_: Platform Permission, provider capability, feature flag

**Platform Capability Catalog**:
The server-authoritative projection of Platform Capabilities, their runtime availability and configuration state, and the authority required to manage them.
_Avoid_: Static page registry, frontend feature list

**Workspace Capability Rollout**:
A server-authoritative policy that opens one Workspace-facing capability in three explicit stages: not available, available to named eligible Workspaces, or available to every eligible Workspace.
_Avoid_: Per-user feature flag, random percentage rollout, entitlement override, hidden allowlist

**Platform Domain**:
A cohesive Platform Console area that owns the operations, configuration, health, and Operational Signals for one operator concern.
_Avoid_: Settings category, page folder, lifecycle phase

**Operations Inbox**:
The Platform Console landing surface that prioritizes unresolved instance-level conditions requiring operator attention or action.
_Avoid_: Dashboard, summary page, Action Center

**Operational Signal**:
An actionable projection of domain-owned platform state that explains what needs attention, why it matters, and where it can be resolved.
_Avoid_: KPI card, dashboard widget, notification

**Operational Signal Triage**:
The lightweight collaboration state attached to an Operational Signal for assignment, active work, or a time-bounded reminder without changing whether the source condition is resolved.
_Avoid_: Incident lifecycle, manual resolution, duplicate domain state

## Relationships

- The **Product Application** contains **Workspace Administration**.
- The **Product Application** contains **Customization** as a peer navigation group rather than a page inside **Workspace Administration**.
- **Workspace Administration** is scoped to exactly one **Workspace** at a time.
- **Customization** is scoped to the current Workspace and owns Knowledge, Skills, and Design Systems without adding “Workspace” to their primary page labels.
- Every **Workspace** belongs to exactly one **Organization**, and an **Organization** may group multiple Workspaces.
- Every **Workspace** is an independent **Commercial Tenant**; an **Organization** never owns, pools, inherits, or overrides its Plan, Subscription, Credits, Entitlements, or Usage.
- A Workspace created under an available **Free Workspace Allowance** starts on the current selling Revision of the **Free Plan** without checkout, a payment method, or temporary paid Entitlements.
- The **Free Plan** has no expiry or automatic conversion. Its Credits and allowances refresh only according to its bound Plan Revision, and paid access begins only after an authorized checkout is confirmed.
- A User's Workspace memberships do not consume the **Free Workspace Allowance**; only current ownership of a Free Workspace consumes it.
- Creation, downgrade, and ownership transfer enforce the same **Free Workspace Allowance**, so no User can own two Free Workspaces through a different lifecycle path.
- A User who already owns a Free Workspace may create another Workspace only with that new Workspace's independently confirmed paid Subscription; the eligibility check owns no Plan, Credits, Entitlements, or Usage.
- Every Plan Revision explicitly declares an **Active Project Allowance** for its Workspace; Project counts never pool across an Organization or a User's memberships.
- An active Project consumes one place in the **Active Project Allowance**. Archiving releases that place without deleting the Project, while creating or restoring a Project consumes one atomically.
- A Plan change that leaves a Workspace above its **Active Project Allowance** never archives or deletes existing Projects; it blocks further creation and restoration until the Workspace archives enough Projects or changes Plan.
- The **Workspace Owner** is an ownership invariant rather than a selectable role and remains the only non-delegable authority for tenant billing, ownership transfer, and Workspace deletion on every Plan.
- A Plan Revision that excludes Workspace role management applies **Fixed Member Access** to every non-Owner member; invitations cannot choose a role, and member or role mutation routes cannot create an exception.
- **Fixed Member Access** makes ordinary members equal to one another, not equal to the **Workspace Owner**. It grants no Owner-only commercial, transfer, or lifecycle authority.
- A Plan Revision may enable role management without changing the Owner invariant; assigned roles still authorize Workspace actions through the canonical permission engine rather than becoming a second ownership model.
- A member-assigned paid capability exists only when the Workspace Plan Revision includes its Entitlement and declares a **Feature Seat** allowance; the Workspace remains the sole commercial owner.
- A **Feature Seat Assignment** selects which active member may consume that Workspace capability but grants no Workspace Permission, role, rollout inclusion, configuration readiness, or runtime health.
- Using a member-assigned capability requires the Workspace Entitlement, an active **Feature Seat Assignment**, the actor's ordinary Workspace Permission, Workspace rollout inclusion, configuration readiness, and runtime health independently.
- A **Feature Seat Assignment** never targets a User outside the Workspace, survives no membership termination, and does not become a per-User **Workspace Capability Rollout** exception.
- The **Workspace Owner** always manages **Feature Seat Assignments**. A non-Owner may do so only through the exact `workspace:feature-seats:manage` permission when the Plan also enables role management.
- `workspace:feature-seats:manage` allocates only places the Workspace already owns; it cannot buy capacity, change Plan terms, edit roles, grant the capability's action permission, or bypass another use-time gate.
- A Plan change that removes role management, removes a member-assigned Entitlement, or lowers its Feature Seat allowance requires **Plan Access Convergence** before it may be scheduled.
- A **Plan Access Convergence** targeting the **Free Plan** also requires the current **Workspace Owner** to have an available **Free Workspace Allowance** at preview and effectiveness.
- **Plan Access Convergence** previews affected members, invitations, roles, permission responsibilities, and Feature Seat Assignments and records the exact effective-boundary outcome.
- When the target Plan excludes role management, the effective boundary end-dates member role assignments and custom roles, applies **Fixed Member Access** to every non-Owner member, and invalidates role-bearing pending invitations without changing the **Workspace Owner**.
- Ended paid-access configuration remains historical Audit evidence only. A later upgrade creates new configuration explicitly and never reactivates prior roles or **Feature Seat Assignments**.
- A paid-only capability remains discoverable through localized product copy, a clear Plan badge, and a disabled action that links to the exact Plan & Usage explanation; the Product API still enforces the Entitlement independently of presentation.
- Every Workspace deletion originates in the **Workspace Lifecycle Authority** from an explicit Workspace Owner request or a documented legal/privacy process; ordinary settings authority, commercial state, and elapsed nonpayment are not deletion authority.
- Archive, suspension, **Payment Restricted**, and **Delivery Suspended** never create or advance a Workspace deletion or purge deadline.
- An accepted lifecycle deletion may start its own retention and purge process, but Commerce cannot invoke, schedule, cancel, or reinterpret that process.
- A Provider recovery fact received after an independently completed Workspace deletion reconciles commercial records only; it never resurrects deleted Workspace data.
- A **Plan** has one or more **Plan Revisions**, while its stable code identifies the offer rather than one mutable set of terms.
- A published **Plan Revision** is immutable, and every Subscription binds to exactly one Revision so later catalog work cannot reinterpret existing commercial state.
- Checkout, provider events, period grants, Entitlement decisions, and immutable Credit ledger evidence identify the bound **Plan Revision**, not only the Plan code.
- Publishing a new selling **Plan Revision** affects new Subscriptions and explicit Plan selections only; existing Subscriptions become **Grandfathered Subscriptions** and remain pinned indefinitely.
- A **Grandfathered Subscription** changes Revision only through Workspace-initiated Plan selection or an authorized **Subscription Revision Transition**.
- A Platform-initiated **Subscription Revision Transition** is a **Renewal Transition** by default, preserving the current Revision through the already-paid period.
- An immediate Revision change is a **Commercial Correction**, never a timing option on a cohort **Renewal Transition**.
- A **Domain Policy Exception** changes one Workspace's policy-derived deadline without changing its Plan Revision, rewriting the global policy, or becoming a **Commercial Correction**.
- Commerce exclusively owns a Dunning **Domain Policy Exception**, while Hosting exclusively owns a Hosting-continuity **Domain Policy Exception**; neither may alter the other domain's deadline.
- Every **Domain Policy Exception** is explicitly time-bounded and records the Workspace, original and replacement deadline, actor, exact domain permission, reason, evidence, and audit correlation; bulk, cohort, open-ended, and cross-domain exceptions are forbidden.
- A **Domain Policy Exception** may extend only a still-running window before its anchored deadline; once the lifecycle transition occurs, the deadline and transition history are immutable.
- Returning **Payment Restricted** to **Payment Grace** or **Delivery Suspended** to a new **Hosting Continuity Window** requires a separate **Domain State Correction** owned by Commerce or Hosting respectively.
- A **Domain State Correction** appends a compensating transition with stricter permission, evidence, before/after state, new deadline, and audit requirements; it never edits or relabels the expired window.
- A paid **Renewal Transition** changes local commercial state only when the billing Provider confirms the scheduled boundary transition; Provider capability gaps remain explicit blockers.
- Provider lifecycle state and Arclayer commercial access state are separate: `past_due` enters **Payment Grace** according to the **Dunning Policy**, rather than invalidating every Plan Entitlement immediately.
- **Payment Grace** withholds new-period Credit grants and blocks new metered external-cost effects while preserving login, data viewing, ordinary editing, export, payment recovery, and already-published delivery during the grace window.
- Successful payment recovery restores the same bound Plan Revision and grants any now-earned period Credits exactly once.
- Exhausted recovery enters **Payment Restricted** without silently selecting Free, deleting data, or changing the bound Plan Revision.
- **Payment Restricted** activates **Restricted Recovery Mode** without revoking Product Sessions or creating a Workspace access restriction.
- **Restricted Recovery Mode** permits authorized login, existing-data reads and export, payment recovery, support, and security-, privacy-, or lifecycle-reducing actions.
- **Restricted Recovery Mode** blocks content, project, site, Customization, membership-expansion, credential-creation, AI, import, build, publish, deployment, and domain-change commands before new work begins.
- An otherwise allowed recovery-mode action still requires its normal Workspace permission; the mode narrows authority and never grants it.
- Every Workspace Owner has tenant-side billing authority, and a Workspace may have any number of delegated **Billing Managers**.
- A **Billing Manager** receives `workspace:commerce:manage` through Workspace RBAC; the permission does not imply settings, membership, content, Platform, Credit-adjustment, or Provider-configuration authority.
- Only a Workspace Owner may grant or revoke `workspace:commerce:manage`; a **Billing Manager** cannot delegate billing authority onward.
- All Workspace members may see sanitized commercial access state, but only the Owner or a **Billing Manager** may create Checkout or Provider Portal sessions, change the Plan, inspect the detailed Credit ledger, or execute payment recovery.
- Platform Commerce Permissions never substitute for `workspace:commerce:manage`; a Platform Operator may investigate or reconcile through the Platform API but cannot act as the tenant or submit payment information.
- **Commercial Lifecycle Notifications** are emitted for the first payment failure, configured grace-deadline warning, entry into **Payment Restricted**, configured Hosting-continuity warning, **Delivery Suspended**, and successful recovery rather than as daily broadcasts.
- An accepted **Domain Policy Exception** or **Domain State Correction** is also a **Commercial Lifecycle Notification** milestone because an operator changed a Workspace-visible deadline or lifecycle state.
- A Commerce correction that requires Hosting restoration produces two-phase notices: Commerce may report **Payment Grace** and delivery-restoration progress, while only Hosting may later report delivery success or failure from its own durable result.
- Owner and **Billing Manager** intervention notices identify “Arclayer Platform Operations,” the **Customer-Safe Reason Category**, original and new deadline/state, effective time, and support reference without exposing a Platform Operator's personal identity.
- Other Workspace members see only the sanitized capability/delivery effect and effective time; the full actor, reason text, evidence, and Provider diagnostics remain in Platform Audit.
- Commerce owns the Payment Grace, Payment Restricted, and recovery facts behind **Commercial Lifecycle Notifications**; Hosting owns the continuity-warning and Delivery Suspended facts; Notifications owns rendering, channels, the delivery ledger, retries, and recipient interactions.
- The Workspace Owner and current **Billing Managers** receive email and in-app commercial lifecycle notices, while other active members receive only a sanitized in-app state notice.
- Recipient authority is resolved again at actual dispatch, and replayed lifecycle facts cannot duplicate the same milestone for one recipient and channel.
- Notification success or failure never creates, delays, reverses, or fabricates a commercial or Hosting lifecycle transition; persistent critical delivery failure produces an **Operational Signal** instead.
- An unreachable recipient or failed **Commercial Lifecycle Notification** never creates a **Domain Policy Exception** automatically; an authorized operator must request any exception explicitly in the owning domain.
- Successful payment recovery atomically restores `normal` commercial access for subsequent commands without changing memberships, Workspace roles, or Product Sessions.
- Commerce publishes the transition into or out of **Payment Restricted**; Hosting owns the resulting delivery state and never receives authority to reinterpret the Subscription.
- Entering **Payment Restricted** starts the **Hosting Continuity Window** defined by the **Hosting Policy**. The last active release remains live, while rebuild, republish, and domain-change operations that add hosting cost are blocked.
- Expiring the **Hosting Continuity Window** enters **Delivery Suspended** without changing the active release or removing its artifacts, domain bindings, or certificate associations.
- Payment recovery clears **Delivery Suspended** or the active **Hosting Continuity Window** atomically and resumes the same active release without rebuilding or redeploying it.
- A Commerce **Domain State Correction** from **Payment Restricted** to **Payment Grace** publishes a durable corrected commercial-access fact; Hosting consumes it idempotently and restores normal delivery of the same active release because **Payment Grace** includes already-published delivery.
- Hosting records and owns that restoration transition. A Hosting restoration failure produces an **Operational Signal** without rolling back the successful Commerce correction or claiming that delivery recovered.
- A Hosting-only **Domain State Correction** remains distinct: while Commerce still reports **Payment Restricted**, Hosting may move **Delivery Suspended** into a new **Hosting Continuity Window** without changing commercial access.
- Commerce never mutates deployment, release, domain-binding, or certificate records when commercial access changes.
- Entitlement checks, refresh jobs, reconciliation, and provider-event handling never substitute a Plan's latest Revision for the Subscription's bound Revision.
- Users, projects, and sites consume the commercial state of their active **Workspace** rather than an Organization-level or user-level balance.
- **Workspace Administration** owns member-facing plan selection, checkout, portal access, Credits, and Usage for its active Workspace.
- The **Commerce Platform Domain** operates commercial state across Workspaces without becoming its owner or duplicating Workspace self-service.
- Entering the **Commerce Platform Domain** requires `commerce.read`; each commercial mutation additionally requires its matching **Commerce Permission Set** member.
- The **Commerce Permission Set** contains `commerce.catalog.manage`, `commerce.subscriptions.manage`, `commerce.credits.adjust`, `commerce.provider.manage`, and `commerce.events.reconcile`; none grants another mutation class implicitly.
- The **Instance Owner** holds the complete **Commerce Permission Set**, while each Platform Operator receives only the permissions delegated through Platform Roles.
- Tenant directories may project commercial summaries and link to an exact **Commerce Platform Domain** context, but they do not own commercial mutation forms.
- Commercial trends and exploratory revenue or cost analysis belong to the **Monitoring & Audit Platform Domain**; actionable provider, subscription, payment, or Credit failures project **Operational Signals** from the **Commerce Platform Domain**.
- The **Tenant Governance Platform Domain** uses Workspaces as its default governance queue, while Users and Projects remain peer investigative views rather than separate Platform Domains or Workspace subpages.
- The **Tenant Governance Platform Domain** owns cross-tenant directory investigation, access restrictions, and authorized Workspace lifecycle or legal-case entry points, but it never duplicates Workspace Administration or mutations owned by Commerce, Hosting, or other Platform Domains.
- Commerce, Hosting, and Monitoring & Audit may project authorized summaries into the **Tenant Governance Platform Domain** and receive exact deep links from it; the owning Platform Domain remains the only mutation authority.
- The **Tenant Governance Platform Domain** has no Tenant Overview composed of summary cards; its navigation opens the Workspace governance queue by default.
- Tenant Governance exposes only minimum operational metadata and authorized redacted projections by default; customer-authored Project content, Knowledge, Skills, and Design Systems require a valid **Support Access Grant**.
- A **Support Access Grant** is created in the Product Application by an authorized Workspace Owner for one support case, named Platform Operators, explicit content scope, and an expiry; it is not created or self-approved through Platform RBAC.
- A **Support Access Grant** is strictly read-only, creates no Workspace membership or Product Session, and cannot authorize content changes, tenant approvals, Workspace administration, secrets, or impersonation.
- Workspace Owners can inspect, revoke, and audit every **Support Access Grant** and its use; expiry or revocation immediately blocks new content reads without erasing retained evidence.
- The **Identity & Access Platform Domain** opens its Platform team queue by default and keeps sign-in policy, identity providers, Platform Roles and Permissions, multi-factor enforcement, and Platform Session operations in one domain.
- The **Identity & Access Platform Domain** does not absorb ordinary user investigation from Tenant Governance or member, invitation, role, and permission management from Workspace Administration.
- Product navigation and page copy translate the **Identity & Access Platform Domain** into plain operator language such as “Access & Security”; canonical engineering terminology, permission codes, provider diagnostics, and raw session state are not used as unexplained primary copy.
- The **Platform AI Operations Domain** opens its cross-Workspace AI task queue by default and keeps model/provider readiness, official Agent availability, action policy, and runtime recovery in one operator concern.
- The **Platform AI Operations Domain** may investigate a Workspace task waiting for approval but cannot approve, reject, or apply tenant work on behalf of the authorized Workspace actor.
- The **Platform AI Operations Domain** may inspect an AI task's execution attempts, diagnostics, cost, and safe recovery options. Recovery creates a new attributable attempt and preserves the original history; it never rewrites user input, fabricates a tool result, or answers a Workspace-owned decision.
- AI runtime repair preserves the canonical task, message, event, and recovery evidence. A conflicting or orphaned projection may be removed only after its owning execution attempt and references are identified; repair never clears unrelated AI history or disguises an unknown state as success.
- A human-input interruption is part of the durable conversation: the assistant's question and the user's answer remain ordered, reloadable messages after resume. The tool-call projection may show waiting or completed status, but it is not the sole presentation of either message.
- A **Platform Agent Definition** is a deployment-owned official assistant that may be offered to eligible Workspaces. Its identity metadata is mutable, while each runnable configuration is an immutable version that is explicitly published or retired. Referenced definitions are archived rather than hard-deleted so historical tasks retain their agent and version attribution.
- A **Skill Declaration** describes the tools, permissions, data classes, external destinations, and capability labels a platform skill requires. High-risk declaration values come from the server-authoritative capability catalog with localized explanations and risk metadata; a missing catalog entry is a configuration error, not permission to invent an arbitrary value.
- The **Platform AI Policy** is the deployment-wide, revisioned contract for model/provider routing, budgets, concurrency, retries, tools, approval effects, external data transfer, retention, audit, and runtime availability. Agent versions and Skill Declarations may require capabilities but cannot widen the applied policy; each task records the policy revision it used.
- AI monitoring exposes complete operational metadata and sanitized diagnostics by default. Raw customer prompts, responses, tool arguments, and external content require an explicit, case-bound, operator-specific, read-only, expiring **Support Access Grant**; no personal preference switch grants blanket access.
- AI task recovery consists of server-authorized, idempotent actions such as retry, cancel, and projection reconciliation. Each action reports its eligibility and reason, preserves prior attempts and audit evidence, and cannot answer or approve a Workspace-owned interruption.
- A **Platform Agent Version** moves through draft, validated, published, and retired states. New tasks resolve the published version selected by current policy, while running tasks remain pinned to their recorded version; rollback selects an earlier retained version without deleting history.
- A platform skill imported from GitHub or ZIP is an isolated draft until integrity, dependency, capability, permission, and policy validation succeeds. Only a published version is selectable by assistants or Workspaces; import, publish, retire, and rollback remain attributable and reversible where safe.
- Saving a platform AI policy draft is routine session work. Publishing or applying a revision that changes model/provider access, tool or permission scope, external data transfer, approval effects, retention, or runtime availability is a high-risk action requiring an impact preview, explicit reason, current permission, action-bound verification when classified, and audit evidence.
- AI usage investigation combines current runtime health with retained historical telemetry and task-level drill-down. Historical controls never fabricate expired or missing data, and recovery mutations remain in the Platform AI Operations Domain rather than the monitoring surface.
- Workspace-authored Knowledge, Skills, Design Systems, Agents, and project work remain in the Product Application; commercial budgets and Credits remain in Commerce, while historical AI trends remain in the **Monitoring & Audit Platform Domain**.
- Product navigation and page copy translate the **Platform AI Operations Domain** into plain operator language such as “AI services” and “AI tasks”; LangGraph, checkpoint, routing, Provider codes, and runtime enums appear only where technical diagnosis requires them.
- The **Hosting & Delivery Platform Domain** opens its delivery-issue queue by default and keeps domain, certificate, storage, delivery-policy, suspension, and restoration operations together.
- The Product Application owns what one Project publishes and its authorized site/domain choices; the **Hosting & Delivery Platform Domain** owns cross-Workspace delivery readiness and recovery without becoming a second Project settings or content surface.
- Commerce supplies the commercial transition that may start or clear a Hosting delivery gate, but the **Hosting & Delivery Platform Domain** alone owns the Continuity Window, Delivery Suspended state, public unavailable response, and restoration result.
- Historical delivery, storage, certificate, and availability trends belong to the **Monitoring & Audit Platform Domain**; current failures and readiness blockers belong to the **Hosting & Delivery Platform Domain** and may project Operational Signals.
- Product navigation and page copy translate the **Hosting & Delivery Platform Domain** into plain operator language such as “Site delivery,” “Delivery issues,” and “File storage”; DNS, certificate, binding, Provider, and storage diagnostics are secondary technical detail.
- The **Communications Platform Domain** opens the User feedback queue by default and keeps delivery failures, announcements and campaigns, message templates, and email-service operations together.
- Feedback replies, operator-authored Campaigns, and domain-owned transactional notices use one Communications delivery ledger, while their feedback ticket, Campaign, and source-domain facts remain distinct authorities.
- A source Platform Domain owns when and why a transactional notice exists; the **Communications Platform Domain** owns rendering, localization, channel delivery, retries, and recipient interactions without changing the source fact.
- Plugin and Connector installation, upgrade, trust, and rollback do not belong to Communications even when they provide an email channel; Communications owns the channel's messaging configuration and operational use after installation.
- Historical engagement and delivery trends belong to the **Monitoring & Audit Platform Domain**; current feedback work and retryable delivery failures belong to the **Communications Platform Domain** and may project Operational Signals.
- Product navigation and page copy translate the **Communications Platform Domain** into plain operator language such as “Messages & feedback,” “User feedback,” and “Sending issues”; delivery enums, template keys, Provider codes, and transport diagnostics are secondary detail.
- The **Extensibility Platform Domain** opens its Installed extensions list by default and keeps the extension catalog, provided connection capabilities, and durable install/upgrade operations together.
- The **Extensibility Platform Domain** owns package source, integrity, compatibility, requested permissions, dependencies, and lifecycle; the Platform Domain that consumes an installed capability owns its business configuration and operational use.
- Installing an Extension at instance scope never enables it for every Workspace or grants its requested permissions automatically; any Workspace activation requires a separately authorized Product Application contract.
- An installed Extension contributes only trusted registered capabilities to the Platform Capability Catalog; installation, enablement, configuration readiness, runtime health, and operator permission remain distinct facts.
- Product navigation and page copy translate the **Extensibility Platform Domain** into plain operator language such as “Extensions,” “Installed,” and “Install & update history”; manifest, checksum, registry, lifecycle enum, and dependency diagnostics are secondary detail.
- The **Monitoring & Audit Platform Domain** opens Requests & errors by default and provides peer Performance trends, AI usage, Activity trends, and Audit trail surfaces without a separate Overview.
- Monitoring telemetry may be sampled, aggregated, and retained by coverage policy; Audit evidence records actor, action, scope, target, result, and safe before/after state under an independent immutable retention and access contract.
- Monitoring and Audit may share time controls, identity projections, and correlation links, but neither source may fill gaps, infer records, weaken retention, or grant access for the other.
- The **Operations Inbox** remains the Platform Console home outside the **Monitoring & Audit Platform Domain**; it projects current actionable conditions, while Monitoring & Audit provides historical investigation and evidence.
- Product navigation and page copy use “Monitoring & audit,” “Requests & errors,” and “Audit trail”; telemetry schema, percentile source, event codes, correlation identifiers, and retention diagnostics remain secondary detail.
- The **Platform Console** operates across Workspaces and deployment-wide capabilities.
- The **Product Application** and **Platform Console** are distinct application surfaces; neither embeds the other.
- The **Product Application** uses the **Product API**; the **Platform Console** uses the **Platform API**.
- The **Product API** and **Platform API** have distinct application boundaries while sharing Arclayer's domain authority.
- Product and platform access may share one human identity and credential authority, but they establish separate sessions.
- The **Product API** may project **Platform Entry Eligibility** so the Product Application can show an external Console entry, but this discoverability metadata never authorizes the **Platform API**.
- Opening the **Platform Console** transfers no Product session, token, Workspace context, or Platform Permission; the configured Platform Host independently verifies the identity, Instance Owner or Platform Operator status, mandatory multi-factor authentication, Platform Session, and every requested Platform Permission.
- A Product Application session never authorizes the **Platform API**; the **Platform Console** requires a **Platform Session**.
- An external identity provider may authenticate the human identity, but its session, remembered-device state, MFA claim, or assurance claim never satisfies Platform MFA or **Step-up Platform Verification**.
- Every **Platform Session** requires an Arclayer-enrolled **Platform MFA Method** after identity-provider authentication, and every phishing-resistant action requires an Arclayer-verified security key or passkey.
- A **Platform Session** is issued only after the user completes the required multi-factor authentication challenge.
- Each browser or device establishes a separately identifiable **Platform Session**; activity may extend its inactivity deadline only within the absolute deadline defined by the current **Platform Session Lifecycle Policy**.
- An expired **Platform Session** cannot be refreshed or exchanged past its absolute deadline. The actor must complete a new multi-factor-authenticated Platform sign-in, and no arbitrary concurrent-Session cap substitutes for the lifecycle policy.
- An actor can inspect their Platform devices, creation time, recent activity, and expiry and can revoke one device or every other Platform Session without changing Product Sessions; authorized security operations against another actor use their own exact Platform Permission.
- Revoking or expiring a **Platform Session** invalidates every **Step-up Platform Verification** bound to it and blocks subsequent Platform API requests from that device.
- Platform MFA enrollment issues single-use recovery codes that can unlock only **Platform MFA Recovery** after the identity authenticates through the current sign-in authority; a recovery code is not a Platform Session, Platform Permission, or general API credential.
- Using a recovery code invalidates the remaining recovery-code set and every existing Platform Session before the actor enrolls and verifies new multi-factor credentials; only then may the actor establish a new Platform Session under current roles.
- If no recovery code remains, the **Instance Owner** or a Platform Operator with the exact MFA-reset permission may start **Platform MFA Recovery** for another non-owner operator through a step-up-verified action.
- An administrator-started MFA reset preserves the target's active Platform Role assignments but makes them unusable, revokes all target Platform Sessions and recovery codes, and grants only an identity-verification and MFA-enrollment path until setup succeeds.
- **Platform MFA Recovery** never exposes, selects, or generates factors for the recovering operator and cannot target the **Instance Owner**, whose unavailable MFA follows **Instance Ownership Recovery**.
- Platform MFA supports user-verifying security keys and passkeys as the preferred **Platform MFA Method** and time-based codes from an authenticator app as the compatibility method; email and SMS codes are not Platform MFA Methods.
- An **Instance Owner** or **Platform Operator** may enroll multiple Platform MFA Methods, but Platform MFA readiness requires at least one currently verified method and the last method cannot be removed before a replacement is verified.
- Adding, replacing, or removing a Platform MFA Method after activation requires **Step-up Platform Verification**; initial invitation activation and **Platform MFA Recovery** use their bounded identity-verified enrollment contracts because no current method is available yet.
- A recovery code can enter **Platform MFA Recovery** but cannot satisfy an ordinary Platform MFA or Step-up challenge.
- The trusted Platform action catalog declares which critical actions require **Phishing-resistant Platform Verification**; the Platform API enforces that requirement and never downgrades it to an authenticator-app code when WebAuthn is unavailable.
- The **Instance Owner** always retains at least one verified security key or passkey, and ownership transfer or recovery cannot complete until the incoming or restored Owner verifies one.
- A Platform Operator must have a verified security key or passkey before receiving a Platform Role whose permissions include a phishing-resistant action; invitation acceptance, assignment, and Custom Platform Role revision apply enforce the same readiness rule.
- An Owner or Operator whose authority requires phishing-resistant actions cannot remove their last verified security key or passkey before a replacement verifies or the requiring roles are removed.
- Each trusted Platform action contract declares whether **Step-up Platform Verification** is required; ordinary reads and low-risk saves use the baseline Platform Session without repeated MFA.
- A required **Step-up Platform Verification** is bound to the actor, Platform Session, action, target and scope, expected preview/target revisions, idempotency identity, and versioned freshness policy; it cannot authorize another action or substitute for current Platform Permission.
- Ownership transfer, identity-provider authority changes, Platform privilege elevation, critical credential replacement, and other explicitly classified high-risk actions require step-up before final apply, while the owning Platform Domain defines any additional justified action classes.
- Session revocation, permission loss, freshness expiry, preview or target drift, scope change, or action-policy revision invalidates the proof visibly and requires a new review and verification.
- An Instance Owner or Platform Operator with the exact current permission applies a Platform change directly; Arclayer has no platform-wide approver role, approval queue, or deployment-configurable second-person rule.
- High-risk direct apply requires the owning domain's revision-bound impact preview, reason when required, current permission, action-bound verification when classified, explicit confirmation, and Audit evidence, but none of those steps silently creates or waits for another actor's approval.
- A workflow involves two principals only when its domain invariant explicitly requires both parties, as **Instance Ownership Transfer** does; this does not create a reusable approval mechanism for unrelated Platform changes.
- Each deployment has exactly one **Instance Owner** at a time.
- A deployment may have multiple **Platform Operators**, each with an individual identity and delegated permissions.
- A **Platform Operator Invitation** records its intended identity, Platform Roles, inviter, and expiry, but creates no effective Platform Role assignment, Platform Permission, Platform Session, or Platform Entry Eligibility.
- The **Instance Owner** or an active **Platform Operator** with the exact invitation permission may create a **Platform Operator Invitation**, but its combined intended Platform Roles must remain within the inviter's **Delegable Platform Authority**.
- **Delegable Platform Authority** excludes non-delegable Instance Owner authority and is enforced against the union of all intended role permissions so multiple individually assignable roles cannot compose a privilege escalation.
- Accepting a valid **Platform Operator Invitation** requires the intended identity to authenticate, explicitly accept, and complete mandatory multi-factor enrollment before active Platform Operator status and the intended Platform Roles become effective atomically.
- Invitation acceptance revalidates that the inviter remains active and authorized to invite, every intended Platform Role remains on the invitation's recorded revision, and their combined authority remains delegable; failure invalidates the unaccepted invitation instead of silently narrowing or expanding it.
- Expired, revoked, identity-mismatched, or incomplete **Platform Operator Invitations** leave the identity without Platform authority; no partial activation survives a failed acceptance.
- A **Platform Operator** receives authority through one or more **Platform Roles**, and each role contains explicit **Platform Permissions**.
- A Platform Operator's effective delegated authority is the additive union of its assigned **Platform Roles**; Platform Permissions cannot be granted, denied, or overridden directly on an individual operator.
- Arclayer provides a small catalog of immutable **Built-in Platform Roles** with localized responsibility descriptions; copying one creates an independent **Custom Platform Role** rather than changing the built-in definition.
- Changing a **Custom Platform Role** requires a revision-bound preview of permission differences, affected Platform Operators, affected Platform Capabilities, and revision-bound pending invitations before an explicit apply creates a new **Platform Role Revision**.
- Every assignment follows the current **Platform Role Revision** rather than storing a permission snapshot; after apply, all assigned Platform Operators use the new revision atomically and old authorization-cache results are unusable before success is acknowledged.
- A valid **Platform Session** remains authenticated across a role change, but its next Platform API request is authorized from current role revisions; re-login is never required to make a permission removal effective.
- A pending **Platform Operator Invitation** bound to the replaced role revision becomes invalid and must be reissued explicitly rather than inheriting changed authority.
- Removing Platform authority immediately blocks new commands, confirmations, retries, scope expansion, and later human-authorized steps, but does not retroactively erase or pretend to cancel an **Accepted Platform Operation**.
- An **Accepted Platform Operation** continues under its owning Platform Domain's committed idempotency and execution contract while retaining the original authorization evidence; it grants its original actor no authority to interact with it after revocation.
- Cancellation is a separate currently authorized command available only when the owning Platform Domain defines a safe, explicit, idempotent cancellation boundary; irreversible or already-committed effects remain visible rather than reported as cancelled.
- Removing a Platform Operator's access produces a **Deactivated Platform Operator** rather than deleting the identity: Platform Entry Eligibility, Platform Sessions, Delegable Platform Authority, and effective role assignments end behind one revocation barrier.
- Deactivation end-dates role assignments and invalidates pending invitations sent by or addressed to that operator while retaining their historical revisions, Audit attribution, and **Accepted Platform Operations**.
- Deactivation changes no shared Product identity, Product Session, Workspace membership, or tenant authority; the **Instance Owner** is excluded from this workflow and may change only through the ownership-transfer contract.
- A **Deactivated Platform Operator** cannot be resumed with former authority. Returning requires a new **Platform Operator Invitation**, current role review, mandatory multi-factor satisfaction, activation, and a new **Platform Session**.
- Only the current **Instance Owner** may initiate an **Instance Ownership Transfer**, and the target must already be an active Platform Operator who satisfies current multi-factor requirements.
- Until the target completes a fresh multi-factor challenge and explicitly accepts, the current **Instance Owner** retains ownership and the target retains only existing operator authority.
- Acceptance atomically replaces exactly one **Instance Owner**, end-dates the target's operator-role assignments, and either activates the former owner with the revision-bound Platform Roles selected in the transfer preview or produces a **Deactivated Platform Operator** when no roles were selected.
- The transfer revokes both principals' existing Platform Sessions before success is acknowledged; the new owner receives new ownership-bound access after commit, and a former owner retained as an operator must establish a new Platform Session with only the selected roles.
- Pending invitations and other delegated authority originating from the former owner are revalidated against the former owner's post-transfer roles, while **Accepted Platform Operations** retain their original attribution and continue under their owning-domain contracts.
- **Instance Ownership Recovery** is configured before production enablement and cannot be initiated or approved through Platform Roles, Platform Sessions, team-management permissions, or Operator voting.
- A recovery request changes no authority during its deployment-policy notification and hold period; proof, target identity, MFA readiness, current ownership revision, and recovery conditions are revalidated before commit.
- Verified recovery of the same human Owner revokes old Platform Sessions and recovery material, preserves ownership, and requires current multi-factor setup before a new Platform Session; recovery of an unavailable Owner atomically replaces exactly one Owner and leaves the former identity deactivated for Platform access.
- Self-hosted deployments use offline recovery material or infrastructure-custodied authority, while managed deployments use a reviewed support recovery process; neither custodian becomes Owner, receives a Platform Session, or gains ordinary Platform API authority.
- The **Instance Owner** is a distinct governance principal with complete Platform authority and non-delegable ownership capabilities, not a **Platform Role**, role assignment, or template that can be copied.
- Workspace roles and **Platform Roles** are separate catalogs even when they reuse the same authorization infrastructure.
- The **Instance Owner** and authorized **Platform Operators** may use the **Platform Console**; a Workspace administrator may not use it solely because of tenant-level privileges.
- The **Platform Capability Catalog** determines which supported and enabled **Platform Capabilities** may appear in Platform Console navigation for the current operator.
- A disabled but activatable **Platform Capability** is discoverable only through capability management by an operator with the required **Platform Permission**, together with its explicit enablement conditions.
- The **Platform Capability Catalog** describes availability but does not grant authority; the **Platform API** still enforces every required **Platform Permission**.
- Every **Platform Capability** belongs to exactly one **Platform Domain**.
- A **Workspace Capability Rollout** controls only which eligible Workspaces may use one Workspace-facing capability: not available, named eligible Workspaces, or every eligible Workspace.
- Every rollout change uses a server-generated revision-bound impact preview and explicit apply, and the Product API and workers enforce the committed stage on every affected command.
- Installation, instance enablement, configuration readiness, commercial Entitlement, Workspace Permission, and runtime health remain independent requirements; rollout inclusion never supplies or bypasses any of them.
- Rollouts never target individual Users, random percentages, arbitrary expressions, or undisclosed exceptions, and every accepted change records its actor, reviewed scope, previous and next revision, and result in Audit.
- A **Platform Domain** keeps its operational views and configuration together instead of sending configuration to a global Settings area.
- A **Platform Domain** has a landing page only when it can present real work, readiness, or health; otherwise navigation opens its primary operational surface directly.
- The **Operations Inbox** presents **Operational Signals** from platform domains in one prioritized action queue.
- Each platform domain owns the source state and resolution action behind its **Operational Signals**; the **Operations Inbox** owns their cross-domain projection, prioritization, and **Operational Signal Triage** only.
- **Operational Signal Triage** allows an authorized operator to claim or assign an unresolved Signal, mark work in progress, or set a time-bounded reminder with a reason; every transition is revision-checked and audited.
- Assignment, work state, and reminder state never change Signal severity, health, source lifecycle, or authorization and never invoke the owning domain's resolution action implicitly.
- A Signal becomes resolved only when its owning Platform Domain confirms that the source condition cleared or its canonical resolution operation committed. Operators cannot dismiss, close, or manually resolve it from the Inbox.
- Resolved Signals retain their final triage history for attribution, while a reminder remains visible in filtered views and returns to the active queue when its reviewed time arrives.

## Example dialogue

> **Dev:** "Should a Workspace owner manage members and billing in the Platform Console?"
> **Domain expert:** "No. Those are Workspace Administration tasks inside the Product Application. The Platform Console is reserved for cross-tenant and instance-level operations."
>
> **Dev:** "Should Knowledge, Skills, and Design Systems remain tabs in the Workspace settings dialog?"
> **Domain expert:** "No. They form the separate Customization group in the Product Application. Their page labels are Knowledge, Skills, and Design systems without a redundant Workspace prefix."
>
> **Dev:** "If the Product Application shows 'Open Platform Console,' can its session authorize the new Host?"
> **Domain expert:** "No. The entry only says this identity may try to enter. The Platform Host establishes its own MFA-backed session and checks every Platform permission again."
>
> **Dev:** "Should an invited operator receive the Console entry as soon as we choose their roles?"
> **Domain expert:** "No. The invitation grants nothing by itself. The intended identity must accept it and complete multi-factor setup before the operator and roles become active together."
>
> **Dev:** "Can an operator who may invite platform members assign a role with powers they cannot delegate?"
> **Domain expert:** "No. Invitation authority and delegable authority are separate checks, and the server checks the combined roles again when the recipient accepts."
>
> **Dev:** "Should we add one extra permission directly to a single operator instead of creating a role?"
> **Domain expert:** "No. Operators receive only role-based authority. Copy a built-in role or create a clear custom role so the delegation remains understandable and auditable."
>
> **Dev:** "If we remove a permission from a custom role, can existing Platform Sessions keep it until they sign in again?"
> **Domain expert:** "No. The session remains signed in, but its next request uses the new role revision and cannot reuse the removed authority."
>
> **Dev:** "Should revoking that permission automatically cancel the extension installation the operator already started?"
> **Domain expert:** "No. New actions stop immediately, but the accepted installation follows its recorded domain workflow. A currently authorized operator may cancel only at a safe boundary the Extensions domain explicitly supports."
>
> **Dev:** "If a former operator returns next month, should we switch their old roles back on?"
> **Domain expert:** "No. Their history remains, but access does not. They rejoin through a new invitation, current role review, MFA, and a new Platform Session."
>
> **Dev:** "Can the current owner make someone else owner immediately and keep their own full access during handover?"
> **Domain expert:** "No. The active operator must accept with fresh MFA, then ownership changes atomically. The former owner keeps only the roles explicitly reviewed in that transfer."
>
> **Dev:** "Can two Platform Operators promote one of themselves if the Owner loses MFA?"
> **Domain expert:** "No. Ownership recovery uses the deployment's separate recovery proof and review path outside the Console; operator roles never become substitute ownership."
>
> **Dev:** "Should every settings save ask for MFA again because Platform login already requires it?"
> **Domain expert:** "No. Routine work uses the authenticated Platform Session. Only an explicitly classified high-risk apply asks for fresh, action-bound verification."
>
> **Dev:** "After reviewing a high-risk change, must I send it to another operator for approval?"
> **Domain expert:** "No. If you still hold the exact permission, you confirm and apply it directly after any required verification. Only a workflow whose meaning requires another participant, such as ownership transfer, waits for that participant."
>
> **Dev:** "Can refreshing a Platform Session keep one browser signed in forever?"
> **Domain expert:** "No. Activity can postpone inactivity expiry only until that device's absolute deadline. After that, the operator signs in with MFA again, while other devices and Product Sessions keep their own lifecycles."
>
> **Dev:** "If an operator loses every MFA factor, can the Owner give them a temporary Platform Session?"
> **Domain expert:** "No. A recovery code or an authorized reset only opens identity verification and new MFA setup. Existing Sessions are revoked, roles cannot be used during recovery, and only the operator can complete enrollment."
>
> **Dev:** "Should we send an email code when an operator cannot use a security key?"
> **Domain expert:** "No. They can use another enrolled security key, passkey, or authenticator app. Email and SMS delivery are not Platform MFA, and recovery codes remain a separate recovery path."
>
> **Dev:** "Can an operator use an authenticator-app code to approve a role that can change sign-in authority?"
> **Domain expert:** "No. That action requires a security key or passkey. If the operator has not enrolled one, the action stays blocked instead of falling back to a weaker method."
>
> **Dev:** "If our enterprise identity provider already asked for MFA, can we skip Platform verification?"
> **Domain expert:** "No. The provider confirms who the person is; Arclayer still verifies its own Platform method before creating a Platform Session or applying a protected action."
>
> **Dev:** "Should request volume and plan distribution appear as cards in the Operations Inbox?"
> **Domain expert:** "Only when a domain projects a condition that needs attention. Historical metrics and trends belong in Monitoring & Audit."
>
> **Dev:** "Can I assign an Inbox item to myself and close it after I finish investigating?"
> **Domain expert:** "You can claim it, show that work is in progress, or ask to be reminded later. It is resolved only when the owning domain confirms the actual problem is gone."
>
> **Dev:** "Should a self-hosted deployment without a payment provider show an empty Commerce page?"
> **Domain expert:** "No. Authorized capability managers see Commerce and its missing prerequisites in capability management; other operators do not receive an unusable navigation entry."
>
> **Dev:** "If a Workspace is included in a capability rollout, does that give every member access even when its Plan or permissions do not allow it?"
> **Domain expert:** "No. The rollout only opens the capability to that Workspace. The Product API and workers still require configuration readiness, commercial Entitlement, Workspace Permission, and runtime health before work can proceed."
>
> **Dev:** "Should payment-provider configuration live in a global Settings page?"
> **Domain expert:** "No. Commerce owns its catalog, transactions, provider readiness, and configuration as one Platform Domain."
>
> **Dev:** "Should an Organization subscription provide shared Credits to all of its Workspaces?"
> **Domain expert:** "No. Each Workspace is its own Commercial Tenant. An Organization may group Workspaces for governance, but it cannot become a second subscription, balance, or entitlement authority."
>
> **Dev:** "Should a new Workspace receive paid features for fourteen days and then fall back to Free?"
> **Domain expert:** "No. It starts on a useful non-expiring Free Plan with explicit limits. Paid features become available only after the Workspace chooses and completes a paid subscription."
>
> **Dev:** "Does joining several Workspaces use up my free Workspace, or can my current Workspace Plan decide how many others I create?"
> **Domain expert:** "Neither. Membership does not count, and one Workspace never owns its siblings. Your account may own one Free Workspace; every additional Workspace needs its own paid Subscription."
>
> **Dev:** "If a downgrade leaves seven Projects active on a Plan that supports five, should we archive two automatically?"
> **Domain expert:** "No. Keep all seven intact and explain the current usage. Creating or restoring another Project remains unavailable until the Workspace archives enough Projects or changes Plan."
>
> **Dev:** "Free members have the same access, so can any member transfer or delete the Workspace?"
> **Domain expert:** "No. Ordinary members share Fixed Member Access. The Workspace Owner remains uniquely responsible for billing, ownership transfer, and deletion and is not a role another member can assign."
>
> **Dev:** "If I assign an AI capability seat to a member, does that also let them run every AI action?"
> **Domain expert:** "No. The seat only allocates one Workspace-paid capability to that member. Their Workspace permissions and the capability's rollout, readiness, and health checks still apply."
>
> **Dev:** "Does managing members or billing automatically let someone assign paid-feature access?"
> **Domain expert:** "No. The Owner may assign it directly; everyone else needs the exact feature-access management permission, which changes neither the Plan nor the member's roles."
>
> **Dev:** "Should a Workspace's old roles return automatically if it upgrades again after spending time on Free?"
> **Domain expert:** "No. The downgrade preview permanently converges access at its effective boundary. Historical roles remain auditable, but a later upgrade starts with new explicit configuration."
>
> **Dev:** "Should the Workspace Directory contain its own plan-adjustment form?"
> **Domain expert:** "No. It shows an authorized commercial summary and links to that Workspace's subscription in the Commerce Platform Domain, which owns the audited correction workflow."
>
> **Dev:** "Should Tenant Governance open on a card dashboard or split Users, Workspaces, and Projects into three Platform Domains?"
> **Domain expert:** "Neither. It opens the Workspace governance queue, with Users and Projects as peer investigative views in the same domain."
>
> **Dev:** "Can a Platform Operator open a customer's Knowledge document while investigating a ticket?"
> **Domain expert:** "Only when the Workspace Owner granted that named operator time-bound read access to the relevant content for that support case. Platform authority alone is not customer consent."
>
> **Dev:** "Should OAuth, registration, Platform Roles, and Platform MFA remain separate settings pages?"
> **Domain expert:** "No. They are one Identity & Access operator concern, presented to users as understandable Access & Security workflows rather than a wall of protocol and permission terminology."
>
> **Dev:** "Can an AI operator approve a Workspace content change because the task appears in the platform queue?"
> **Domain expert:** "No. The operator may diagnose the blocked task and link to its owner, but only the authorized Workspace actor can decide and apply tenant work."
>
> **Dev:** "Should a Platform Operator edit a Project's pages while investigating a failed deployment?"
> **Domain expert:** "No. Site delivery diagnoses and restores the delivery path; project content and publication intent remain with the authorized Product Application user."
>
> **Dev:** "Can retrying a failed payment notice replay the payment transition or change its deadline?"
> **Domain expert:** "No. Messages & feedback retries the existing recipient delivery only; Commerce keeps ownership of the payment fact and deadline."
>
> **Dev:** "Does installing an email Extension mean Extensions should also choose the active sender?"
> **Domain expert:** "No. Extensions verifies and installs the capability; Messages & feedback owns how the installed email service is configured and used."
>
> **Dev:** "Can a sampled request record stand in for a missing Audit event because both appear under Monitoring & audit?"
> **Domain expert:** "No. They share investigation navigation, not evidence semantics. Audit remains independently complete, immutable, permissioned, and retained."
>
> **Dev:** "Can we increase Premium Credits by editing the current Plan row?"
> **Domain expert:** "No. Premium remains the stable Plan, while the new terms become another Plan Revision. Existing Subscriptions keep an explicit Revision until an adoption action changes it."
>
> **Dev:** "Should the monthly refresh job move old Premium subscribers to the newest Revision?"
> **Domain expert:** "No. They are Grandfathered Subscriptions. Only an explicit Subscription Revision Transition or Workspace Plan selection may change the bound Revision."
>
> **Dev:** "Can an operator choose 'apply now' while migrating every Premium subscriber?"
> **Domain expert:** "No. Cohort adoption is a Renewal Transition at each Subscription's renewal boundary. Immediate change is a separate single-Workspace Commercial Correction with different evidence and consequences."
>
> **Dev:** "Should the first failed renewal remove every paid capability?"
> **Domain expert:** "No. The Dunning Policy enters Payment Grace, withholds unpaid Credits, and blocks new metered costs while keeping the Workspace recoverable. Final failure becomes Payment Restricted without deleting customer data."
>
> **Dev:** "Does Payment Restricted unpublish the Workspace's sites?"
> **Domain expert:** "No. Hosting serves the current release through its Continuity Window, then suspends delivery while preserving the release and domain state so payment recovery can restore it without a deployment."
>
> **Dev:** "Can we delete a Workspace after it has remained Payment Restricted for a year?"
> **Domain expert:** "Not because of payment state. Deletion requires a separate Workspace Owner instruction or documented legal/privacy process through the Workspace Lifecycle Authority."
>
> **Dev:** "Should Payment Restricted show the same full-screen blocker as Workspace Suspension?"
> **Domain expert:** "No. Restricted Recovery Mode keeps the Workspace readable and exportable, but rejects value-expanding commands until payment recovery restores normal access."
>
> **Dev:** "Can a Platform Operator open the Workspace's payment portal to fix an overdue invoice?"
> **Domain expert:** "No. Only the Workspace Owner or a delegated Billing Manager acts through the tenant Provider Portal; Platform Operators investigate and reconcile through Commerce without impersonating the tenant."
>
> **Dev:** "Should we depend on the payment Provider's email or send a daily reminder to every member?"
> **Domain expert:** "Neither. Commercial Lifecycle Notifications follow exact Commerce and Hosting milestones; billing contacts receive email and in-app recovery details, while other members receive only a sanitized in-app state notice."
>
> **Dev:** "If none of the billing contacts receives the warning, should Notifications extend both deadlines?"
> **Domain expert:** "No. Notifications emits an Operational Signal. Any time-bounded exception is a separate, audited action in Commerce or Hosting and can change only that domain's deadline."
>
> **Dev:** "Can an operator extend yesterday's deadline to make the suspension look as if it never happened?"
> **Domain expert:** "No. The expired deadline stays immutable. Restoring an earlier lifecycle state requires an explicit Domain State Correction that appends a compensating transition."
>
> **Dev:** "If Commerce corrects Payment Restricted back to Payment Grace, must another operator restore the published site?"
> **Domain expert:** "No. Commerce publishes the corrected access fact, and Hosting records its own idempotent restoration of the same active release because published delivery is part of Payment Grace."
>
> **Dev:** "Can the Commerce correction email say the site is already restored?"
> **Domain expert:** "No. It reports Payment Grace and that delivery restoration is pending. A separate Hosting result notice reports whether the original active release actually resumed."
>
> **Dev:** "Should the Workspace see which Platform Operator approved the exception and their internal evidence?"
> **Domain expert:** "No. Billing contacts see Arclayer Platform Operations, a customer-safe reason category, the before/after effect, time, and support reference. Personal identity and internal evidence stay in Platform Audit."

## Flagged ambiguities

- "Admin" previously referred to both the entire customer-facing application and the super-administrator control plane. Use **Product Application**, **Workspace Administration**, or **Platform Console** according to the actual boundary.
- "Super Administrator" previously conflated the unique **Instance Owner** with delegated **Platform Operators**. These are distinct identities and authority models.
- "Can open the Platform Console" previously risked conflating discoverability with authorization. **Platform Entry Eligibility** may reveal an entry, but only the Platform Host and Platform API establish and enforce Platform authority.
- "Invited Platform Operator" must not imply an active operator or pre-granted role. Use **Platform Operator Invitation** until acceptance and mandatory multi-factor enrollment complete.
- "Can manage the platform team" must not imply unlimited delegation. Invitation permission allows the workflow, while **Delegable Platform Authority** limits which combined Platform Roles the inviter may grant.
- "Default role" previously risked implying an editable preset or automatic assignment. Use **Built-in Platform Role** for Arclayer-managed responsibilities and **Custom Platform Role** for deployment-owned variants; neither turns the **Instance Owner** into a role.
- "Role update" must not imply an in-place permission mutation or session-local snapshot. A **Platform Role Revision** is previewed and applied atomically to every assignment, while stale invitations remain invalid.
- "Operation started by an operator" must not imply that later permission removal rewrites history or preserves that operator's access. An **Accepted Platform Operation** keeps its original evidence while new interaction uses current authority.
- "Remove operator" must not imply deleting a shared User or temporarily hiding access. A **Deactivated Platform Operator** retains historical attribution but has no resumable Platform authority.
- "Transfer owner" must not imply assigning an all-access role or allowing two owners temporarily. An **Instance Ownership Transfer** is a two-party atomic replacement with explicit former-owner access.
- "Owner recovery" must not imply a support login, Operator vote, or ordinary password reset. **Instance Ownership Recovery** is a separate break-glass authority with same-owner MFA restoration and unavailable-owner replacement outcomes.
- "MFA recovery" must name whose access is being recovered. Use **Platform MFA Recovery** for a non-owner Operator's factor re-enrollment and **Instance Ownership Recovery** for an Owner who cannot satisfy Platform MFA.
- "MFA required" must distinguish baseline Platform Session authentication from **Step-up Platform Verification** for one high-risk action; neither grants Platform Permission by itself.
- "Review changes" must not imply a generic approval request. An authorized Platform actor reviews the server impact and applies directly; only a domain contract that inherently requires another participant may create a two-party workflow.
- "Dashboard" previously described both historical monitoring and a landing page of summary widgets. Use **Operations Inbox** for the prioritized action surface and **Monitoring & Audit Platform Domain** for historical metrics and evidence.
- "Inbox status" must distinguish operator coordination from source truth. Use **Operational Signal Triage** for assignment, in-progress work, and reminders; only the owning domain may determine that the underlying Signal is resolved.
- "Capability" is used elsewhere for provider behavior and Agent/Tool declarations. **Platform Capability** refers only to an instance-level function represented in the **Platform Capability Catalog**; it is not an authorization permission.
- "Rollout" must not imply a client-side flag, per-user experiment, random percentage, or commercial grant. A **Workspace Capability Rollout** is the audited three-stage server policy for which eligible Workspaces may use one Workspace-facing capability.
- "Settings" previously grouped unrelated platform concerns by presentation type. Configuration now belongs to its owning **Platform Domain**; **Workspace Administration** remains a separate Product Application surface.
- "Workspace Knowledge", "Workspace Skills", and "Workspace Design Systems" remain valid technical ownership descriptions, but primary Product Application navigation uses **Customization** with the plain labels Knowledge, Skills, and Design systems.
- "Tenant" previously conflated Organization-level governance with commercial ownership. Use **Organization** for account-level grouping and **Commercial Tenant** for the Workspace that owns commercial state.
- "Tenant Governance" is the proper name of a **Platform Domain**, not a new entity or ownership boundary; its primary work object is a Workspace, with Users and Projects as peer investigative views.
- "Support access" does not mean Platform permission or Workspace membership. Use **Support Access Grant** for the Workspace Owner's case-bound authorization to read explicitly scoped customer content.
- "Access" previously described public registration, identity-provider setup, per-user restrictions, Workspace permissions, and Platform authority. Use **Identity & Access Platform Domain** for deployment authentication and Platform access, Tenant Governance for per-user investigation, and Workspace Administration for tenant roles and invitations.
- "Agent settings" previously mixed official Agent catalog, provider configuration, Workspace usage, approvals, and runtime internals. Use **Platform AI Operations Domain** for deployment operations and plain product labels for its tasks; keep Workspace-authored AI context and tenant approvals in the Product Application.
- "Domains" and "Storage" previously named presentation-oriented settings categories. Use **Hosting & Delivery Platform Domain** for the shared site-delivery responsibility, while Project publishing and domain choices remain Product Application tasks.
- "Notifications" previously described policy switches, Campaign authoring, transactional delivery, and recipient records. Use **Communications Platform Domain** for their shared delivery responsibility while preserving distinct source authorities and plain-language product labels.
- "Plugin" and "Connector" previously mixed package lifecycle with business configuration. Use **Extensibility Platform Domain** for Extension lifecycle and trust, and the consuming Platform Domain for capability-specific configuration and operation.
- "Audit Log" previously mixed request telemetry, performance analysis, and administrative events in tabs. Use **Monitoring & Audit Platform Domain** for the shared investigation boundary, “Requests & errors” for telemetry records, and “Audit trail” for immutable administrative evidence.
- "Billing" previously referred to Workspace self-service, platform configuration, and cross-Workspace operations. Use **Workspace Administration** for self-service and **Commerce Platform Domain** for platform operations.
- "Commerce administrator" previously implied one all-powerful flag. Use the explicit **Commerce Permission Set** so catalog, Subscription, Credit, provider, and reconciliation authority remain independently delegable.
- "Plan" previously meant both a stable product offer and its mutable current terms. Use **Plan** for identity and **Plan Revision** for the immutable commercial contract.
- "Free trial" must not describe the **Free Plan**. Free is a durable limited offer with no paid-feature countdown, automatic charge, or automatic downgrade transition.
- "Workspace limit" must not be modelled as one Workspace Plan owning sibling Workspaces. Use **Free Workspace Allowance** for the account-level one-Free-Workspace ownership rule; each resulting Workspace remains its own **Commercial Tenant**.
- "Project limit" means the Workspace Plan Revision's **Active Project Allowance**, not lifetime creation, retained archives, published sites, or a User-wide Project count.
- "Free members are equal" means all non-Owner members use **Fixed Member Access**. It never makes ownership, billing responsibility, transfer, or Workspace deletion available to every member.
- "Give a paid feature to a member" means create a **Feature Seat Assignment**, not grant a personal Entitlement, alter a role, or add a per-User rollout exception.
- "Pause roles on downgrade" is not the Free Plan contract. Use **Plan Access Convergence** to end unsupported active configuration with preview and Audit; never restore it implicitly after a later upgrade.
- "Site suspension" must not imply unpublishing, deletion, or domain disconnection. Use **Delivery Suspended** for the Hosting-owned reversible delivery gate.
- "Retention after nonpayment" must not imply a Commerce-owned deletion timer. Use the **Workspace Lifecycle Authority** for deletion and its independently authorized retention or purge process.
- "Read-only Workspace" is too broad for commercial recovery because security, privacy, lifecycle, export, and payment actions still mutate state. Use **Restricted Recovery Mode** and its explicit command classes.
- "Workspace manager" previously hid several different authorities. Use **Billing Manager** for tenant-side commercial actions and explicit Workspace permissions for unrelated settings or member management.
- "Billing notification" previously conflated Provider email, operator-authored campaigns, and domain-owned transaction notices. Use **Commercial Lifecycle Notification** for role-sensitive Commerce or Hosting milestone delivery.
- "Commercial Correction" must not describe a goodwill or support extension to a policy deadline. Use **Domain Policy Exception** for the owning domain's explicit single-Workspace deadline override.
- "Extending an expired window" incorrectly implies editable history. Use **Domain State Correction** when an owning domain explicitly returns an already-transitioned Workspace to a recoverable lifecycle state.
- "Operator reason" must not make internal notes or evidence customer-visible. Use a **Customer-Safe Reason Category** for recipient communication and retain the complete reason/actor/evidence only in Platform Audit.
