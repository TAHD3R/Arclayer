# Product and Platform UI Toolchain Contracts

This code-spec defines the canonical component, form, icon, chart, loading, motion, and product-copy stack for the Product Application in `apps/app` and the Platform Console in `apps/platform`.

Administration experience authority: [Product and Platform administration experience redesign](../../shared/product-admin-experience-redesign.md)

## Scenario: Building or changing a Product Application or Platform Console surface

### 1. Scope / Trigger

- Trigger: adding or changing a page, dashboard, form, dialog, loading state, chart, icon, animation, or user-visible copy in `apps/app` or `apps/platform`.
- Applies to `apps/app`, `apps/platform`, and their shared primitives exported by `packages/ui`.
- `DESIGN.md` remains the visual-language source of truth.

### 2. Canonical stack

| Concern | Canonical implementation |
|---|---|
| Platform administration compositions | Arclayer-owned Platform Experience Kit composed from `@arclayer/ui` |
| Shell source donor | Reviewed `satnaing/shadcn-admin` Sidebar/Header/mobile/theme composition only |
| Product primitives | Existing `@arclayer/ui/*` exports |
| New generic primitives | shadcn Registry, installed with the repository package runner and reviewed before use |
| Application-local composition | Domain-local components under the owning app's `src/pages/**` or `src/components/**` |
| Forms | `react-hook-form` + `zod`, composed with `@arclayer/ui/field`, `form`, `input`, `select`, and settings primitives |
| Icons | `lucide-react` or an existing semantic icon exported by `@arclayer/ui/icons/*` |
| Charts | `@arclayer/ui/chart` backed by reviewed, Arclayer-adapted Bklit Registry source |
| Route skeletons | Arclayer-owned `RouteTransition`, composed from `@arclayer/ui` `Skeleton` at the shared route boundary |
| Local loading states | `ContentGuard`, `PageSkeleton`, `Skeleton`, `Spinner`, or `Progress` from `@arclayer/ui` |
| Motion | `motion/react` plus CSS transitions that use the durations in `DESIGN.md` |
| Theme | Shared Arclayer semantic tokens with Light, Dark, and Follow system preferences |
| Product copy | i18next keys with both `zh-CN` and `en-US` resources |

Do not add a second icon, chart, form, skeleton, or animation framework when the canonical stack can express the requirement.

### 3. Platform Experience Kit and shell source-donor contract

- `satnaing/shadcn-admin` is the approved MIT-licensed source donor only for responsive Sidebar/Header composition, collapsed navigation, mobile shell behavior, command access, and Light/Dark/Follow-system interaction. It is not installed as a runtime package, copied as a second application, treated as a product-domain model, or used as the page-body administration foundation.
- Each adoption records the upstream repository, commit SHA, MIT notice, and adopted files. Reviewed source is brought into the owning Arclayer module and changed to match repository aliases, tokens, accessibility, localization, and test contracts before use.
- The Arclayer-owned Platform Experience Kit supplies the complete Overview, Needs attention, domain surface, managed-object dossier, operational directory, master-detail, configuration, impact/operation, evidence, and page-state compositions. Dense list, DataTable, and form ideas from the donor may be adapted only through canonical Arclayer primitives when they improve a real workflow.
- Keep Arclayer's TanStack Router/Query/Table integration, `react-hook-form` and `zod` forms, i18next resources, shared `RouteTransition` boundary, and `@arclayer/ui` primitives. Template auth, demo data, mock pages, local product models, and page-level state stores are not authorities.
- Do not import the template's Clerk integration, Recharts, Radix or Tabler icon presentation, duplicate shadcn primitives, theme tokens, toasts, forms, or loading systems. Replace them with the canonical stack in section 2; if a required behavior cannot be expressed without a second stack, the adoption is blocked pending an explicit toolchain decision.
- Template dashboard cards, charts, example detail panels, labels, and navigation are illustrative only. They do not survive unless the owning Platform Domain has a real operator question, persisted authority, permission, state model, action, and localized plain-language copy for them.
- Before broad production implementation, Product Design generates exactly three visual directions from the confirmed brief, current screenshots, Arclayer design language, and approved references. The user selects one direction. Overview, Workspaces, AI Services, Knowledge, Design Systems, Plan & Usage, and People prove representative desktop and narrow compositions against that target before route rollout.
- The visual migration is a dark-built atomic hard cut. `apps/platform` may be developed and verified in non-production or explicitly restricted environments, but it does not become the official operator entry until every retained Platform surface passes the cutover gate. One release enables the Platform Host and removes all Platform routes, navigation, pages, clients, stores, translations, skeletons, and build references from `apps/app`; no route-by-route production migration, old/new theme toggle, embedded legacy page, compatibility facade, or duplicate route family remains.

The Platform Console uses the Arclayer visual language rather than a template skin:

- `packages/ui` semantic color, typography, radius, elevation, focus, and motion tokens remain the only visual-token authority for both applications. `apps/platform` may compose denser operational layouts but does not fork or override a second token system.
- The only preferences are Light, Dark, and Follow system. Follow system resolves to Light or Dark rather than creating a third theme; the resolved preference is applied before first paint so the Shell does not flash the wrong theme.
- Dark mode follows `DESIGN.md`: true-black canvas, neutral charcoal hierarchy, readable neutral text, and no navy haze, neon glow, decorative gradient, or translucent glass layer. Light mode keeps the soft neutral-gray canvas and controlled white work surfaces.
- Blue is reserved for selection, focus, links when semantically needed, and primary actions. Status, risk, and severity use shared semantic colors and never borrow the primary-action blue merely for decoration.
- Do not import a template theme switcher, theme gallery, arbitrary accent picker, foreign font scale, or page-local raw palette. Charts, tags, overlays, tables, loading states, and empty/error surfaces must remain legible in both resolved modes through shared semantic tokens.

The Platform Console uses one responsive Shell:

- Its frontend root route `/` is Overview and `/attention` is Needs attention. All other Platform Console routes use the exact stable, non-localized segments in the administration experience redesign without a `/system` or `/platform` prefix; translated navigation labels never become URL segments.
- Route definitions and all internal links use TanStack typed route builders. Cross-application links use the configured Product Application or Platform Console origin plus a typed target rather than string concatenation; they never append Product Session data, tokens, Workspace context, Platform Permissions, or other authority-bearing state.
- A single collapsible left Sidebar is the primary navigation authority. Overview is first; visible Platform Domains follow in the canonical order, and only the active domain expands its peer pages by default.
- Expanded Sidebar labels, collapsed icon tooltips, command results, breadcrumbs, mobile navigation, and accessible names come from the same stable `zh-CN` and `en-US` i18n records. Architecture terms, permission codes, Provider enums, and state-machine names are not navigation copy.
- Collapsed desktop navigation keeps recognizable icons, localized tooltips, visible focus, and accessible names. Narrow layouts present the same hierarchy in a Sheet rather than a separate mobile information architecture.
- The Header shows the current breadcrumb and global utilities only: permission-filtered command search, a localized `common:RETURN_TO_PRODUCT` external link, locale, theme, and account controls. The return link is always available and does not depend on Platform Permissions. The Header does not duplicate primary navigation or add decorative status cards.
- The Product Application account menu shows `account:OPEN_PLATFORM_CONSOLE` only when its Product API bootstrap returns an affirmative minimal Platform-entry eligibility projection. Loading, absent, denied, and failed projections render no Platform Console entry or related copy, while the Platform Host remains responsible for current identity, operator-status, MFA, Platform Session, and permission checks after navigation.
- Command search derives navigation results from the same Platform Capability and Platform Permission projection as the Sidebar. It may expose authorized workflows and records through typed providers, but cannot reveal or navigate to a hidden capability.
- Domain pages render directly inside this Shell. Route-specific settings, tenant-directory, observability, or other nested application shells are removed; a page may still use `ColumnsPage` for real content panes without becoming a second navigation authority.

The Header Command Center is a federated operator entry rather than a frontend-wide data index:

- Its idle state contains authorized navigation, recent destinations, and common workflow entry points. Recent history stores typed destinations, not search text or record payloads, and entries that are no longer authorized disappear without revealing their former protected content.
- Each enabled product domain may register a trusted build-time search provider selected by the Platform Capability Catalog. The provider calls an owning-domain Platform API search contract and owns permission enforcement, field allowlisting/redaction, ranking, pagination, result identity, and typed destination.
- The frontend does not download domain datasets, query disabled/unauthorized providers, or merge copied records into a universal index. One provider's failure appears as a provider-scoped error while other successful groups remain usable; the UI never substitutes stale/demo results or reports that all systems are healthy.
- Results are grouped under localized product labels and contain only the minimum identity, status/impact context, and destination needed to recognize the object. Hidden result counts, inaccessible matches, raw ids, Provider diagnostics, permission codes, and sensitive snippets are not disclosed.
- Query changes cancel obsolete provider requests. Result ordering is deterministic within each provider, and the Command Center does not invent cross-domain relevance that would imply one domain's severity or priority outranks another.
- A result may navigate to a record Drawer or dedicated page, or open an authorized workflow entry. It never commits a mutation directly; high-risk and bulk actions still require their canonical preview, confirmation, permission, idempotency, and Audit contracts.
- Keyboard navigation, group/result counts, loading, provider-scoped failure, no-results, recent-item removal, and result accessible names use stable bilingual product copy. Search text remains ephemeral and is not recorded in analytics or Audit payloads.

Platform Console detail follows one layered interaction contract:

- Operational work starts from a Queue or DataTable. Activating a row opens a right-side investigative Drawer while preserving the current search, filters, order, page, and scroll context.
- Drawer selection is URL-restorable through typed route/search state. Copying or reopening the URL restores the owning list and selected authorized record; closing the Drawer returns to the unchanged list context rather than navigating to a synthetic overview.
- A Drawer must add decision value beyond the trigger row: cause and impact, affected scope, chronology, related evidence, authorization-aware next action, and an exact full-page destination when the work is too large for the overlay. A repeated field list, generic `Current value`, raw JSON, decorative chart, or labels already visible in the row is non-conforming.
- Use a dedicated typed route when the object has multiple durable peer views, long history, multi-step or resumable work, independently linkable evidence, or a configuration workflow that cannot remain understandable in the list context. The Drawer may summarize and link to that page; it does not embed a second application.
- Low-risk local changes may edit inline. Bounded forms use a Dialog, while multi-step, high-risk, or evidence-heavy mutations use the dedicated page. Investigative Drawers do not become generic form containers.
- If no additional evidence, interpretation, or authorized action exists, omit the detail affordance and keep the row readable without a click target.

Needs attention collaboration remains lighter than a ticket system:

- Each unresolved item shows its current assignee when present and plain-language coordination state. Authorized actions are “Claim” / “领取”, “Assign” / “指派”, “Mark in progress” / “标记处理中”, and “Remind me later” / “稍后提醒”; stable keys exist in both Platform locale trees.
- Setting a reminder requires an explicit return time and a user-authored reason. The reason remains verbatim, the item remains available in a reminded-items view, and it returns to the immediate queue at that time without creating a new item.
- Assignment and coordination changes submit expected revisions and show conflicts explicitly. They never reveal protected source detail, grant the assignee another permission, or optimistically claim success before the Platform API confirms it.
- Needs attention has no generic “Close” or manual “Resolve” mutation. Suppression or a not-actionable decision requires an explicit reason, expiry where applicable, exact permission, and Audit evidence. `Source-confirmed recovered / 来源已确认恢复` appears only after the owning domain verifies the outcome.
- Coordination history identifies who claimed, assigned, changed work state, or scheduled a reminder and when. Product copy distinguishes “work is being handled” from “the source condition has recovered” and never exposes internal signal or lifecycle terminology as the primary explanation.

Platform Console configuration follows one risk-tiered contract:

- Configuration remains inside its owning product domain. Each surface shows the current effective value or sanitized state, authority/source, readiness, missing prerequisites, affected scope, last successful change, and current health separately; it does not collapse these facts into one ambiguous enabled switch.
- Low-risk settings use an explicit `Save` action and become successful only after the owning Platform API confirms the persisted effective result. Field changes are not autosaved and optimistic UI never claims that instance configuration took effect.
- High-risk or cross-Workspace changes require a server-generated impact preview tied to the current revision, an explicit review of affected scope and consequences, and a separate `Apply` confirmation. A stale preview, conflict, or changed prerequisite fails visibly and requires a new preview.
- A trusted action contract may require action-bound Step-up Platform Verification at final apply. The frontend never infers this from field type or presentation, never challenges on the preview itself, preserves the reviewed action and scope through the MFA overlay, and submits no proof for a changed target, revision, scope, or operation.
- An actor with the exact permission applies directly after the required review and verification. Generic `Submit for approval`, `Awaiting approval`, approver inbox, second-person policy, and draft-approval components do not exist; a domain-specific two-party workflow renders its actual participant action in plain language instead of borrowing approval terminology.
- Credentials and secrets are write-only replacement inputs. The UI shows sanitized presence/readiness, never returns the stored value, and exposes connection testing as a separate observable operation whose success does not imply that unrelated configuration is valid or active.
- The owning domain defines risk and validation from real consequences; the frontend does not infer risk from field type. Multi-field application is atomic where the domain promises one change, otherwise every independently committed result and failure is explicit.
- Accepted asynchronous work is labelled pending and links to its durable operation. Request acceptance, connection-test success, or notification delivery is never presented as final configuration success.
- Every applied change records canonical Audit evidence with actor, scope, before/after safe summary, reason when required, result, and correlation identity. Plain-language confirmation and error copy explains whether the change was applied, rejected, conflicted, or left unchanged.

Platform Console operational tables support personal Saved views:

- Each owning domain provides one versioned default view with stable `zh-CN` and `en-US` product copy. The default is a code-backed product definition, not a mutable per-user row or an empty Overview substitute.
- A Platform Operator may save named personal views containing backend filter codes and values, ordering, visible columns, column order, and table density. Views never persist result rows, aggregates, pagination position, selected records, Drawer state, scroll position, or free-text search history.
- Current search, filters, order, columns, density, and page state remain URL-addressable whether or not a Saved view is selected. Loading a Saved view expands its effective state into the URL; subsequent edits are visibly unsaved until the operator updates or saves a view.
- A copied URL contains enough typed state to reproduce the current view for another operator with equivalent capabilities and permissions without granting access to the sender's personal Saved-view record.
- Saved-view reads are server-validated against the current Platform Capability Catalog, Platform Permissions, filter schema, and column registry. Invalid or newly unauthorized conditions are omitted from the effective query with an explicit localized notice; the UI never sends them, reveals hidden data, or silently turns the table into an unexplained empty result.
- The stored personal view remains unchanged until its owner explicitly updates it. The notice distinguishes unavailable capabilities, removed fields, invalid values, and permission-constrained items only to the degree the current operator may know them.
- Personal view names are user-authored content and are not machine-translated. System labels, invalid-condition notices, default names, actions, empty states, and errors use stable bilingual i18n keys.
- Team-shared, locked, published, formula, arbitrary-query, and data-snapshot views are outside this contract.

Bulk actions are domain capabilities rather than automatic DataTable features:

- A table exposes a bulk action only when its owning domain defines the exact action code, eligible object states, action-scoped Platform Permission, input schema, idempotency, preview requirement, commit model, per-item result, retry behavior, Audit evidence, and recovery path. Generic bulk edit and delete are forbidden.
- Selection distinguishes explicit record ids from all records matching the current server filter. The fixed Action bar shows the localized action, selected or matched count, affected scope, and whether the scope crosses pages or Workspaces; a header checkbox never silently changes an id selection into an all-results mutation.
- An all-matching or high-risk operation uses a server-generated, revision-bound scope and impact preview. The preview reports eligible, ineligible, already-satisfied, and inaccessible counts plus authorized reason summaries before confirmation; filter or source revision drift invalidates it visibly.
- Cross-Workspace, long-running, or partially successful work commits as one durable operation with per-item outcomes. Acceptance is `Pending`, not success; the result distinguishes succeeded, failed, skipped/ineligible, and not-run items without collapsing partial completion into a green toast.
- Retry targets only the explicitly eligible failed items through the original operation's idempotency/retry contract. It never replays successful items, widens the scope, or silently creates a new source action.
- Instance Owner transfer, commercial correction, credential replacement, permission elevation, and any other action whose owning domain requires individual evidence remain single-record workflows unless a later explicit domain contract proves safe bulk semantics.
- Bulk labels, eligibility reasons, preview consequences, pending states, result categories, recovery actions, and errors use stable `zh-CN` and `en-US` keys. Canonical Audit retains the actor, exact scope/query revision, action, preview/operation identity, aggregate result, and required per-item evidence.

### 4. Component and Registry contracts

- Search existing `packages/ui/src` exports before creating a component.
- Use shadcn Registry components only when the primitive is absent. Inspect the Registry item and generated source, preserve repository aliases, replace non-canonical icons, and run the owning app gate after installation.
- Shared primitives must not import application routes, stores, API clients, or page-local types.
- Product Application and Platform Console compositions stay in their owning app until they have proven cross-app reuse.
- Form layouts use `FieldGroup`, `Field`, labels, descriptions, and explicit validation states. Do not assemble form semantics from unlabelled styled containers.
- Dialog, sheet, and drawer surfaces require an accessible title and description. Form-oriented flows prefer `SettingDialog`.

### 5. Icon and chart contracts

- Use Lucide icons by direct named import. Icons in buttons use the button component's icon slot/data contract and inherit size from the component.
- Do not introduce icon lookup by arbitrary string or create one-off SVG copies of icons already in the canonical set.
- Charts must be composed through `@arclayer/ui/chart`; feature pages must not import Bklit Registry source, Visx, D3, Recharts, or another chart runtime directly.
- Bklit Registry chart source is vendored and reviewed inside `packages/ui`; foreign aliases, tokens, loaders, and motion defaults must be replaced with Arclayer contracts before export.
- Every chart requires a visible title, a textual summary or accessible description, localized units, a defined empty state, and a non-chart representation when exact values matter (for example a table or metric list).
- Chart colors come from semantic CSS tokens. Do not create page-local raw palettes.

### 6. Shared route-skeleton contracts

- `RouteTransition` is each frontend's one shared route-level loading boundary. It composes `@arclayer/ui` `Skeleton` primitives; route-local code supplies a small, explicit macro composition when the shared default cannot faithfully represent the final page shape.
- Skeleton anatomy matches the final page's major regions—such as title/action row, filters, summary blocks, table/card body, or editor frame—rather than copying individual text lines or controls. Dynamic entity identifiers never change the composition.
- Keep the application Sidebar, top chrome, persistent actions, and already-mounted editor controls real and stable while only the asynchronous content region is skeletonized.
- Use neutral semantic surface/loading tokens. Primary blue communicates actual progress or action, never ambient placeholder color.
- Honor `prefers-reduced-motion`: render stable solid placeholders without shimmer or pulse, and never gate interaction or state comprehension on animation.
- Delay a transient route skeleton only when doing so avoids a visible flash; once shown, retain it briefly enough to avoid a one-frame replacement. Route progress feedback remains immediate and stale content is never presented as the new route.
- Page-local async regions still require explicit `ContentGuard` loading, empty, and error semantics. The route boundary does not replace blank, partial, conflict, offline, permission, migration, or fatal domain states.

### 7. Motion contracts

- Motion communicates state change, hierarchy, or spatial continuity; it is not ambient decoration.
- Routine hover and compact state transitions target `70-150ms`; overlays and route transitions target `150-250ms`.
- Use one entrance treatment per surface. Do not stack page, card, icon, and chart entrance animations for the same event.
- Respect `prefers-reduced-motion` through the shared hook or Motion configuration. Loading feedback and task completion cannot depend on animation.

### 8. Product copy and i18n contracts

- Every new user-visible string must use a stable translation key and ship in both supported locales in the owning application's resource tree.
- `apps/platform` owns an independent resource tree at `apps/platform/locales/{zh-CN,en-US}`. Product-capability namespaces include `common`, `navigation`, `overview`, `attention`, `workspaces`, `access`, `ai`, `hosting`, `messages`, `extensions`, `monitoring`, `billing`, and `errors`; a namespace is added only for a real owning surface.
- Platform keys describe stable semantic intent rather than rendered wording or component location, for example `navigation:OVERVIEW`, `attention:WAIT_UNTIL`, `workspaces:EMPTY_TITLE`, and `hosting:ISSUE_RETRY_FAILED`. Wording may improve without renaming a key whose meaning is unchanged.
- Legacy Product Application keys such as `NAV_GLOBAL_PLATFORM_*`, `NAV_SECTION_PLATFORM`, `SYSTEM_*`, and `SETTINGS_*` are migration sources, not aliases. A changed meaning receives a new Platform key; the old Platform-only key is deleted from Product Application resources with its final consumer.
- Copy is sentence case, direct, calm, and action-oriented. Lead with the outcome, use consistent nouns, and avoid hype, filler, or implementation jargon.
- The domain glossary governs architecture and API contracts; it is not a label generator. Navigation, titles, descriptions, statuses, and actions use the words an operator needs to recognize the object, consequence, and next step without understanding internal domains, permission codes, Provider enums, or state-machine names.
- When technical detail is useful, show a plain-language summary first and place stable codes, provider diagnostics, raw identifiers, and correlation data in a clearly labelled diagnostic or audit section.
- Empty copy explains what is absent and the next useful action. Error copy explains what happened and how to recover without exposing internal details.
- Error copy also states whether the attempted change was applied, rejected, or left unchanged; privilege-changing and destructive confirmations state the affected scope and consequence before asking for confirmation.
- `zh-CN` and `en-US` preserve the same product meaning and action hierarchy; neither locale is accepted as a literal translation that becomes unnatural or ambiguous.
- Platform i18n disables cross-language runtime fallback. Missing namespaces/keys, locale asymmetry, raw key rendering, hard-coded product strings, and default-value English used to conceal a missing Chinese resource fail the Platform check; runtime missing-key diagnostics remain explicit rather than silently substituting another locale.
- Platform API responses return stable domain/result codes and typed interpolation parameters rather than translated primary copy. The Platform Console maps them to product language; permission names, Provider enums, state-machine values, raw identifiers, and diagnostic codes appear only in authorized diagnostic or Audit detail when useful.
- User-authored names, notes, reasons, Saved-view labels, and imported content remain verbatim and are never machine-translated. UI labels that frame those values still use platform resources.
- Billing and usage copy distinguishes plan, billing period, granted credits, used credits, reserved credits, available credits, renewal, and cancellation; do not collapse these into the ambiguous word “quota”.
- Dates, amounts, percentages, durations, token counts, and credit counts use the shared locale-aware formatting path.

### 9. Validation matrix

| Change | Required evidence |
|---|---|
| Template-derived shell or composition | Recorded upstream provenance and license, dependency-diff review, token/i18n/accessibility adaptation, and desktop/narrow/dark-theme browser evidence |
| Platform Console navigation change | Capability/permission visibility tests, Sidebar/command/breadcrumb consistency, collapsed-tooltip keyboard coverage, and mobile Sheet evidence |
| Workspace capability rollout | All three stages, explicit selected-Workspace scope, eligibility interaction, revision-bound preview/apply drift, Product API and worker enforcement, Audit evidence, independent Entitlement/permission/readiness/health denials, no user/percentage/expression/hidden-exception controls, and plain-language bilingual copy |
| Platform Console route change | Typed-link tests, stable search-parameter tests, non-localized path proof, and absence of `/system`, `/platform`, or legacy aliases in the frontend route tree |
| Queue/detail interaction change | List-context restoration, deep-linked Drawer authorization, keyboard focus return, meaningful-detail review, and dedicated-route escalation coverage |
| Needs attention collaboration | Claim/assign/in-progress/waiting permissions, expected-revision conflicts, active-operator assignment, reason/return behavior, filtered discoverability, source-owned recovery, no manual resolve, Audit history, accessible keyboard flow, and bilingual plain-language copy |
| Platform configuration change | Effective/source/readiness projection tests, explicit-save or preview/apply flow, stale-revision behavior, secret non-disclosure, Audit evidence, and server-confirmed result copy |
| High-risk Platform direct apply | Exact current permission, impact/reason/Step-up/Audit controls, direct final apply, absence of generic approval states and endpoints, explicit domain-specific participant behavior, and plain-language bilingual consequence copy |
| Theme or visual-token change | Light/Dark/Follow-system behavior, first-paint correctness, shared-token diff, contrast/focus evidence, and desktop/narrow screenshots in both resolved modes |
| Saved-view change | Per-user CRUD, URL reproduction, schema/revision validation, permission/capability invalidation, no-data-snapshot proof, and bilingual default/error copy |
| Bulk-action change | Explicit-id/all-matching scope tests, action permission, preview drift, idempotency, durable partial results, failed-item retry, Audit evidence, and bilingual consequence copy |
| Platform frontend cutover | Complete route inventory, both-locale audit, eligibility/session/permission smoke tests, authority-free cross-host links, eligible/ineligible/failure/revocation browser states, no-legacy-import/build proof, and rollback-artifact rehearsal before production enablement |
| Platform Operator invitation | Intended-identity and role-consequence review, exact invitation permission, combined-role delegation ceiling, no-authority-before-acceptance proof, acceptance-time inviter/role revalidation, MFA-gated atomic activation, expiry/revocation/identity-mismatch/concurrent-change states, Audit evidence, and bilingual task copy |
| Platform Role change | Immutable localized Built-in roles, independent copy-to-custom behavior, multi-role union, no per-user permission controls, server revision-bound permission/affected-operator/self-impact preview, atomic all-assignment adoption, next-request Session authorization, stale-cache denial, invitation invalidation, owner-not-a-role presentation, stable bilingual keys, and direct API tests |
| Platform authority removal | Active accepted-operation impact, immediate new-command denial, current-authority retry/confirmation/cancel controls, owning-domain safe cancellation boundary, partial/irreversible result copy, original and later actor Audit attribution, and bilingual consequence text |
| Platform Operator offboarding | Revision-bound impact preview, eligibility/session/role/delegation/invitation revocation barrier, active-versus-access-removed presentation, retained history, Product/Workspace isolation, no restore action, new-invitation re-entry, owner exclusion, and bilingual consequence copy |
| Instance Ownership Transfer | Eligible active-operator selection, revision-bound non-delegable/operation/Session/former-owner-role impact, target fresh-MFA acceptance, exactly-one-owner atomicity, both-principal Session revocation, failure-state proof, and bilingual ownership copy |
| Instance Ownership Recovery surface | Separate recovery trust boundary, no Console navigation or ordinary Platform authority, managed/self-hosted proof variants, notification/hold states, same-owner/replacement outcomes, MFA and Session revocation, proof secrecy, abuse controls, exact bilingual copy, and Console-outage rehearsal |
| Step-up Platform Verification | Trusted action classification, preview-before-challenge flow, actor/Session/action/target/scope/revision/idempotency binding, current-permission recheck, drift/replay denial, same-operation network retry, accessible MFA overlay, plain-language bilingual copy, and no routine-action fatigue |
| Platform Session lifecycle | Independent-browser/device issuance, safe current-device/created/recent-activity/expiry inventory, inactivity and absolute-deadline behavior, refresh bounded by absolute expiry, MFA-backed re-entry, one-device/all-other-device revocation, concurrent request denial, bound step-up invalidation, Product Session isolation, keyboard coverage, and bilingual plain-language copy |
| Platform Operator MFA recovery | One-time recovery-code issuance/non-disclosure, regeneration invalidation, identity-first code recovery, all-Session/factor/code/Step-up revocation, no-authority setup-required state, exact-permission step-up administrator reset, Owner exclusion, accessible enrollment, safe Audit evidence, and bilingual plain-language copy |
| Platform MFA methods | Multiple user-verifying security keys/passkeys and authenticator-app credentials, WebAuthn origin/challenge verification, TOTP secret non-disclosure, preferred/fallback guidance, Step-up add/replace/remove, atomic last-method protection, bootstrap isolation, enumeration resistance, accessible ceremonies, and bilingual product copy without protocol jargon |
| Phishing-resistant Platform verification | Server-catalog action requirement, WebAuthn-only critical Step-up, Owner and privileged-role readiness, invitation/assignment/role-revision blockers, last-security-key protection, no TOTP downgrade, method-unavailable recovery path, direct API denial, and bilingual action-oriented copy without assurance jargon |
| Identity-provider and Platform MFA separation | Upstream-MFA/claim non-substitution, mandatory local method challenge, local WebAuthn critical Step-up, consecutive-prompt explanation, provider/local failure distinction, direct API denial, no trust toggle, and bilingual copy without claim or assurance jargon |
| Support Access to customer content | Workspace Owner grant authority, named-Operator/case/scope/expiry binding, separate Platform permission, strictly read-only projection, no impersonation/Product Session, revocation-race denial, customer-visible history, secret exclusion, and bilingual consent-oriented copy |
| Platform copy change | Independent namespace ownership, exact locale key parity, no cross-language fallback/default concealment, no legacy-key alias, code-to-copy mapping, and plain-language review |
| Product paid-capability gate | Stable bilingual Plan badge, disabled-action semantics, exact Plan & Usage destination, current/required Plan explanation, direct API and worker denial, and distinct permission/contracted-rollout/readiness/member-limit/health states |
| Member-assigned paid capability | Workspace Entitlement plus explicit Feature Seat limit, active-member assignment separate from roles, concurrent last-place handling, membership-removal release, actor-bound API/worker revalidation, assignment-denial copy instead of upgrade messaging, and independent permission/contracted-rollout/readiness/member-limit/health states |
| Access-reducing Plan change | Revision-bound named-member/role/seat/invitation preview, explicit retained-seat selection, effective-boundary hard convergence, Fixed Member result, no dormant or automatic-restoration UI, Provider identity correlation, and bilingual irreversible-consequence copy |
| Command Center change | Capability/provider selection, direct API denial, redaction, cancellation, partial-provider failure, recent-destination privacy, keyboard navigation, typed destinations, and no-direct-mutation proof |
| New component or form | Accessible component test and the owning app gate: `pnpm app:check` or `pnpm platform:check` |
| New chart | Empty/loading/error coverage, localized units, and exact-value accessibility |
| Route-skeleton composition change | Route-level component test, owning app typecheck, and visual review at affected responsive breakpoints |
| New copy | Both supported locale resources, no raw product string, plain-language review, and diagnostic terminology separated from primary copy |
| New motion | Reduced-motion behavior and no blocked interaction |
| Shared `packages/ui` change | Package boundary review plus the cross-app gate when consumers span packages |

### 10. Wrong vs correct

#### Wrong

```tsx
import { LineChart } from "recharts";

<div className="animate-pulse bg-slate-200" />
```

#### Correct

```tsx
import { ChartContainer } from "@arclayer/ui/chart";
import { Skeleton } from "@arclayer/ui/skeleton";
```

Feature code consumes the shared visual contract; it does not bypass it with raw framework primitives.
