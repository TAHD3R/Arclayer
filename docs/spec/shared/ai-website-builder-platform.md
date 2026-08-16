# AI Website Builder Platform Contracts

Administration experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)

**Status:** Approved contract.
**Applies to:** `apps/api`, `apps/app`, `packages/ui`, generated OpenAPI clients, `plugins/*`, Taskiq workers, and site delivery/publishing.
**Visual source:** `DESIGN.md`.

This spec defines the target product and implementation contracts for Arclayer as a complete AI-native website builder. It is the cross-layer source of truth for the creation editor, multi-Agent runtime, workspace knowledge and skills, design systems, content workflows, background jobs, commercial connectors, project thumbnails, first-publish experience, motion, and loading behavior.

Existing focused specs remain authoritative for their invariants. When this target changes a current product boundary, the hard-cut rules in this document take precedence once the owning rollout wave begins. In particular:

- `docs/spec/api/backend/agents.md` continues to own tenant isolation, tool validation, cancellation, approval checkpoints, and prompt-injection rejection until its runtime surface is migrated.
- `docs/spec/shared/workspace-commercialization.md` continues to own money, Credits, subscription, ledger, and idempotency invariants.
- `docs/spec/app/frontend/product-ui-toolchain.md` continues to own the Product Application component, form, icon, chart, i18n, motion, and shared route-skeleton stack.
- Existing content model, item, version, route, presentation, release, and publish services remain canonical storage and mutation services. The builder composes them; it does not fork them.

## 1. Product outcome and non-negotiable decisions

Arclayer must let a workspace move from a brief to a managed, responsive, accessible, publishable website without leaving the product. The result is not an export-only design concept and not a chat demo. It is a versioned website that can be edited visually, managed operationally, reviewed through explicit changes, and published through canonical services.

The following decisions are binding:

1. Project management and site creation are two modes of the same project.
   - Management pages remain under `/projects/{projectId}/**` inside the Product Application shell.
   - `/projects/{projectId}/editor` becomes an independent full-screen creation shell.
   - The current read-only editor dashboard is removed in the same hard-cut rollout; it is not preserved as a legacy mode.
2. Sitemap, Wireframe, Style Guide, and Design are projections of one versioned site model. They must not own four drifting copies of the website.
3. Design is a publishable end state. Unlike export-oriented builders, it includes responsive rules, motion, content bindings, SEO, accessibility, preview, and release readiness.
4. Agent identity and execution policy are separate.
   - `Plan` and `Build` are execution policies.
   - Agents are versioned identities with capabilities and grants.
   - The ambiguous third mode currently labelled “smart project assistant” is removed.
5. assistant-ui is the interaction/runtime adapter, not the multi-Agent orchestrator. Delegation, permissions, approvals, persistence, recovery, and auditing are backend responsibilities.
6. A Skill is a declarative instruction/resource package. It is not an arbitrary executable plugin. Executable external capabilities are Tools or Connectors.
7. AI changes are never applied as untracked prompt side effects. Every write is a typed command or `ChangeSet` with a base revision, provenance, preview/diff, idempotency key, and explicit result.
8. Long-running work is durable. Refreshing the page or losing the stream must not lose the Agent run, generation job, build, or publish outcome.
9. No background or provider failure may silently fall back to fake success, hidden inline execution, or an invented result.
10. New product copy uses stable i18n keys and ships in both `zh-CN` and `en-US`.

## 3. Product model and source-of-truth ownership

### 3.1 Aggregate model

The creation experience is one aggregate with four projections:

```text
Project / Site
├── ProjectAuthoringMode
└── SiteRevisionManifest
    ├── SiteBrief
    ├── PageTree
    │   ├── Page
    │   ├── PageGroup
    │   └── NavigationRelationship
    ├── SectionGraph
    │   ├── SectionIntent
    │   ├── SectionPrompt
    │   ├── ComponentInstance
    │   ├── ComponentVariant
    │   ├── GlobalSectionReference
    │   └── ContentBinding
    ├── DesignSystemVersion
    │   ├── SemanticTokens
    │   ├── Typography
    │   ├── ColorSchemes
    │   ├── ComponentRecipes
    │   └── MotionTokens
    ├── AssetReferences
    ├── ResponsiveRules
    ├── InteractionRules
    └── RevisionProvenance
```

`SiteRevisionManifest` is the immutable authoring-input manifest and orchestration boundary. It references only inputs that exist when the revision is created: canonical content/structure versions, presentation documents, component bindings, the Design System version, planning documents, and asset references. It never contains mutable lifecycle state, a preview/deployment artifact, or a resulting release ID. This spec uses “Site Revision” as the product-facing shorthand for the manifest plus its external status/projection records.

### 3.2 Authoring authority and stage persistence

Every project declares exactly one `ProjectAuthoringMode`:

- `builder_managed`: content versions, a Content Structure Revision, presentation documents, component bindings, and the pinned Design System version own the editable experience. Generated source, bundles, and deployment artifacts are deterministic immutable derivatives and are never written back as an alternate editing truth. Source-write Tools are disabled.
- `source_managed`: the existing project source/runtime owns page composition. CMS content may remain a bound data source, but the creation editor cannot round-trip or overwrite source-owned layout.

Changing mode is an approval-gated migration Job with impact preview, an explicit rollback boundary, and a compatibility report for unsupported code, runtime behavior, and assets. A Builder-to-source export is a versioned derivative; editing it does not update the Builder revision. A project cannot mix composition authorities per page, and an Agent cannot bypass the selected mode through a lower-level Tool.

The four stages persist through existing versioned content/presentation foundations plus new typed kinds:

| Stage | Persistence contract |
| --- | --- |
| Sitemap | Existing page content-item identities and route/hierarchy command services remain the mutation truth. The Content domain adds an immutable `ContentStructureRevision` for one site/environment. Site Brief and Section Intent are immutable Builder planning documents and never duplicate visitor-facing content. |
| Wireframe | A new `ContentPresentationKind.WIREFRAME` document is tied to an exact content version. It is non-publishable by itself and cannot overwrite `VISUAL_BLUEPRINT`. |
| Style Guide | A pinned immutable `DesignSystemVersion`; project forks create a new version rather than mutating a workspace version. |
| Design | Existing `VISUAL_BLUEPRINT`, slot mapping, SEO, and component-binding contracts tied to the same exact content version. |

Every accepted page-composition change creates a new content version and its complete immutable presentation/binding set in one tenant transaction. Wireframe and Visual Blueprint payloads pin a schema version, component-catalog version, Design System version, asset references, responsive rules, and interaction rules. `SiteRevisionManifest` references `ContentStructureRevision` and exact content/presentation versions; Builder does not copy route/hierarchy rows or expose a second Sitemap mutation API.

### 3.3 Ownership matrix

| Concern | Canonical owner |
| --- | --- |
| Project identity, membership, lifecycle | Existing Project domain |
| Site identity, localization, browser assets, default SEO | Existing site/project website settings domain, recomposed by section 12 |
| Page and record content | Existing content items and immutable content versions |
| Content shape | Existing content models, fields, storage-sync and impact-preview contracts |
| URL and page hierarchy | Existing route bindings and hierarchy nodes |
| Page composition | Existing presentation documents and component bindings, extended with builder revision ownership |
| Site design language | New versioned Design System domain |
| Creation orchestration | New Builder domain and immutable `SiteRevisionManifest` |
| AI changes | New `ChangeSet` aggregate plus canonical command services |
| Published visitor state | Existing release, published graph, publish artifact, and delivery domains |
| Preview thumbnail | New site preview artifact referencing a rendered revision/release |

### 3.4 Revision and ChangeSet contracts

A `SiteRevisionManifest` includes at minimum:

- `id`, `workspaceId`, `projectId`, `siteId`.
- monotonic `revisionNumber`; `baseRevisionId` is absent only for the root revision.
- `projectAuthoringMode` plus references to the brief/section-intent documents, `ContentStructureRevision`, exact presentation/content versions, Design System version, component bindings, and asset inputs.
- a stable manifest hash/ETag.
- provenance: actor, source (`human | agent | import | system`), Agent/run/tool IDs, and correlation ID.
- creation timestamp.

A separate concurrency-controlled `SiteRevisionStatus` projection records `draft | review | ready | superseded` and readiness findings. Generation/build failures belong to durable Job/Attempt records. `published` is derived exclusively from the active canonical Content Release. `SitePreviewArtifact` and `SiteRevisionReleaseLink` reference the manifest from outside its hash.

A `ChangeSet` includes at minimum:

- `id`, scope, target aggregate, and `baseRevisionId`/ETag.
- typed operations; opaque model-authored JSON patches are forbidden at the public boundary.
- impact summary, affected downstream projections, warnings, blockers, and required approvals.
- before/after preview references and human-readable localized summary keys.
- idempotency key, author/run provenance, expiration, and status.
- `previewToken` signed by the server for write operations that require a fresh impact preview.

Applying a stale `ChangeSet` fails with a stable conflict error. It must not silently rebase. The user or Agent may request an explicit re-preview against the new base.

### 3.5 Persistence, tenancy, and hard-cut migration

Storage ownership is explicit:

- public control plane: system and workspace Agent definitions/versions/assignments, official Skill/Tool/Connector definitions, Connector installations/routing/secret references/inbox/outbox, Commerce/Credits, AI threads/messages/parts/runs/steps/events/approvals, durable background jobs/attempts/dispatch outbox, and cross-tenant project-list preview projections.
- tenant schema: Builder revisions/ChangeSets/planning documents, Workspace Knowledge source content/chunks/vectors, custom Skill versions/resources/validation/installations, Design Systems, and the existing content/presentation/route/hierarchy/release records.
- media bytes and content-sensitive preview assets keep existing Asset ACL/storage ownership even when a public project-list projection references their authorized delivery ID.

Public run/job records reference tenant targets through validated public-ID descriptors, not cross-schema foreign keys. Every lookup re-resolves tenant/workspace/project scope. Public orchestration and tenant mutations use idempotent command outcomes/outbox reconciliation; they do not assume one cross-database transaction. Every new tenant-owned table is added to the tenant-control migration path and verified across existing workspaces.

Migration uses one-time backfill and an observed hard cut, not permanent dual write:

1. create and migrate the new schemas, permissions, typed APIs, and generated clients.
2. backfill current conversation JSON into append-only thread/message/part rows; convert hard-coded Agents into official templates; import existing valid style settings into an initial Design System version; classify legacy Skill locators as migration-review records rather than claiming they are installed.
3. verify row counts, hashes, tenant readiness, event ordering, and replay fixtures while old mutation endpoints are frozen.
4. switch backend/frontend consumers together, remove old write paths and compatibility stores in the owning wave, then remove obsolete tables/fields with generated migrations.

Generated migrations and OpenAPI artifacts are produced through repository scripts and are never hand-edited.

## 4. Management mode and creation mode

### 4.1 Route and shell contract

`/projects/{projectId}/editor` is a full-screen route boundary that does not render the Product Application sidebar, page header, or `DefaultPage`. It renders `CreationEditorShell` with:

- top editor bar: back to management, project identity, save/sync state, four stage tabs, preview, share, and publish/release action.
- compact left tool rail: AI brief/generate, add page/section, comments/history, and context-dependent tools.
- infinite canvas: pan, zoom, selection, multi-select, keyboard navigation, viewport culling, and stage-specific scene.
- optional right inspector: selection properties, bindings, validation, and responsive controls.
- bottom controls: breadcrumb/minimap, viewport/device selector where relevant, zoom, fit, undo/redo, and revision indicator.
- contextual Agent panel that can dock, collapse, and bind to the current stage and selection.

Management mode retains operational pages for content, releases, domains, analytics, settings, activity, and access. It links to the creation editor through a prominent “Open editor” action. The editor links back without losing the current revision or Agent run.

### 4.2 Surface shape

Assumptions resolved from the user brief, live product, and repository design language:

- Primary user: a non-technical site creator working with content/design operators; power users need keyboard and bulk workflows.
- Primary action: turn a site brief or selected object into an accepted, publishable site revision.
- First paint: current stage, canvas, revision state, primary AI action, and publish readiness.
- Success: a reviewed revision is ready for preview or published through the canonical release service.
- Desktop is the primary composition, but all functions remain reachable at the repository breakpoints. Narrow layouts convert rails to sheets; they do not claim unsupported success.

Content priority:

- **P0:** project identity, stage tabs, canvas, revision/sync state, AI generate/edit entry, preview, publish readiness.
- **P1:** page/section tree, selection inspector, Agent panel, history, comments, device/zoom controls.
- **P2:** export/integration settings, diagnostics, advanced component metadata, raw source references.

Desktop:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Back  Project / revision       Sitemap Wireframe Style Guide Design  Preview│
├───────┬───────────────────────────────────────────────────────────┬─────────┤
│ tools │                                                           │ inspector│
│ AI    │                    infinite canvas                        │ binding  │
│ add   │                                                           │ a11y     │
│ hist  │                                                           │ variants │
│       │                                                           │          │
├───────┴───────────────────────────────────────────────────────────┴─────────┤
│ context / minimap                   viewport    zoom   undo/redo   revision │
└─────────────────────────────────────────────────────────────────────────────┘
```

Narrow viewport:

```text
┌──────────────────────────────┐
│ Back  Project   Preview  More│
│ Sitemap Wireframe Style Design│
├──────────────────────────────┤
│                              │
│          canvas              │
│                              │
├──────────────────────────────┤
│ tools   context   zoom   AI  │
└──────────────────────────────┘
```

On narrow screens, tools, inspector, page tree, and Agent UI open as one sheet at a time. Canvas selection and editing remain available through the same command model.

### 4.3 Required states

| State | Requirement |
| --- | --- |
| Loading | Keep editor chrome stable; load only the canvas/work region. Show after a short anti-flash delay and mirror macro layout. |
| Empty | First-run site brief with import option and example intent; no generic blank card grid. |
| Generating | Durable job progress by page/section, cancel action, partial results, and explicit failures. |
| Partial | Successful pages remain usable while failed pages show scoped retry. |
| Conflict | Show base/current revision and require re-preview or deliberate discard. |
| Offline | Stop server-owned mutations, preserve only unsent composer or form drafts, and show an explicit reconnect state. Offline command replay and multi-revision reconciliation require a separately approved conflict protocol. |
| Error | Specific cause, recovery action, correlation/support ID, and no fake canvas. |
| Review | Show ChangeSet summary, visual/text diff, blockers, and approval requirements. |
| Ready | Preview and publish actions reflect real readiness checks. |
| Published | Show release/revision relationship and subsequent draft changes separately. |

## 5. Four-stage editor contracts

### 5.1 Sitemap

Sitemap owns site intent and structural planning, projected from the Site Revision manifest's `ContentStructureRevision` and Builder planning documents.

It must support:

- site-level brief, audience, goals, language, page-count intent, import URL, and knowledge/design-system selection.
- pages, page groups, navigation relationships, global sections, page paths, and per-page purpose.
- ordered section intents with section prompts; these prompts drive Wireframe generation.
- AI alternatives that can be compared as candidate ChangeSets before acceptance.
- manual add, rename, move, duplicate, group, and delete with downstream impact preview.
- route uniqueness, localization, hierarchy, and reserved-path validation.
- an accessible tree/list representation in addition to spatial canvas nodes.

Deleting or moving a page/section must enumerate affected wireframes, content bindings, global references, SEO, and published routes. It never silently deletes downstream data.

### 5.2 Wireframe

Wireframe maps section intent to component instances and content slots.

It must support:

- one-to-one traceability from page/section intent to component instance.
- component variant selection, replacement while retaining compatible copy/bindings, reorder, duplicate, and global-section references.
- desktop/tablet/mobile structural views without treating device comments as one undifferentiated stream.
- inline content drafting and AI rewrite through content-version/ChangeSet contracts.
- explicit placeholders for missing content, media, or binding; placeholders must not be published as fake content.
- validation for incompatible variants, missing required slots, invalid bindings, and global-reference cycles.

Wireframe creation and Sitemap edits are bidirectionally reflected through commands against the same revision aggregate, not through duplicated documents.

### 5.3 Style Guide

Style Guide owns a candidate or accepted `DesignSystemVersion`.

It must support:

- multiple visual concepts derived from the site brief and selected Workspace Design System.
- primitive, semantic, and component token layers.
- typography roles, color schemes, spacing, radii, borders, elevation, imagery, component recipes, and motion tokens.
- a real light/dark theme contract where enabled; a visual inversion preview is not labelled as full theme support.
- section-level scheme assignment with accessible contrast validation.
- generated assets with provenance, rights/source metadata, focal point, crop, and alt-text review.
- compare, accept, branch from, and supersede concepts through immutable versions.

The project may fork a workspace Design System version. Forking creates a project-owned version and does not mutate the workspace version.

### 5.4 Design

Design resolves page structure, component variants, content, assets, design tokens, responsive rules, and interactions into the publishable experience.

It must support:

- precise component properties and layout constraints.
- responsive behavior and breakpoint-specific overrides.
- content/model binding, localization, and content-state previews.
- image generation/replacement, crop/focal point, and alt text.
- SEO/Open Graph/structured-data review.
- focus order, semantics, contrast, reduced motion, and automated accessibility findings.
- state previews: default, hover, focus, active, loading, empty, error, and content overflow.
- preview build, visual diff, readiness checks, release creation, and rollback.

Design is not an 80% export handoff. Export may be added later, but the canonical outcome is an Arclayer preview/release.

## 6. Agent platform domain

### 6.1 Vocabulary

| Term | Contract |
| --- | --- |
| Agent | Versioned identity, instructions, model policy, delegation policy, tool/skill/knowledge grants, and approval profile. |
| Orchestrator | Lead Agent allowed to delegate typed tasks to specialist Agents. |
| Skill | Declarative instructions/resources that improve how an Agent performs a class of work. No arbitrary code execution. |
| Tool | Executable, schema-validated capability owned by the backend or a trusted Connector. |
| Knowledge | Tenant-scoped retrievable source with provenance, indexing state, ACL, and citations. |
| Connector | Installed, configured integration that can expose Tools/providers/events under an explicit trust boundary. |
| Thread | User-visible conversation with a stable lead Agent identity and workspace/project scope. Each Run captures the exact mutable context it uses. |
| Run | Durable execution of one user turn, pinned to Agent/Skill versions and a context snapshot, including delegations, tools, approvals, usage, and terminal state. |

### 6.2 Agent definition and scoping

The target model separates templates, versions, and assignments:

- `AgentDefinition`: stable identity, scope (`system | workspace`), owner, slug, display name, avatar, description, and lifecycle state.
- `AgentVersion`: immutable instructions, model/routing policy, skill/tool/knowledge grants, delegation targets, approval profile, compatibility, and version provenance.
- `AgentAssignment`: enables a version for a workspace/project and can supply scoped defaults without mutating the version.
- `AgentRun`: references the exact Agent versions and policies used.

Conversation execution is normalized and append-only:

- `AIThread`: stable user-visible identity, lead Agent definition, scope, title, archive state, and optimistic metadata version.
- `AIMessage` and ordered `AIMessagePart`: text/source/file/image/tool-call/error parts with append semantics; clients never replace an entire message-history JSON array.
- `AIRun` and ordered `AIRunStep`: execution mode, exact Agent/Skill revisions, context snapshot, budget, lifecycle, cancellation, and terminal outcome.
- `AIToolCall`: validated arguments, risk, approval metadata, idempotency, status, result/error references, and Tool version.
- `AIApproval`, `AIDelegation`, and sequenced `AIRunEvent`: resumable human checkpoints, parent/child runs, and public event history without whole-array overwrites.

Official built-ins are system-owned templates and include at minimum:

- Arclayer Coordinator: default orchestrator and user-facing primary Agent.
- Site Architect: brief, Sitemap, information architecture, and Wireframe planning.
- Visual Designer: Style Guide, Design, responsive and motion decisions.
- Content Writer: website copy, reusable content, articles, localization, and tone.
- SEO Strategist: metadata, structure, content opportunities, and readiness.
- Data Analyst: analytics interpretation, content performance, and experiment recommendations.

Workspaces may create their own Agents from a template or from scratch. A specialist Agent does not become a separate top-level thread when delegated; its work is nested under the orchestrator run.

### 6.3 Plan and Build

Replace `AgentMode = build | plan | agent` with an execution policy independent of Agent identity:

```text
ExecutionMode = plan | build
```

- `plan` permits scoped reads, retrieval, analysis, candidate `ChangeSet` generation, and human-choice tools. It cannot apply changes, publish, delete, install, or mutate external systems.
- `build` permits tools granted by the selected Agent and current user, but all writes still flow through typed command services and the approval matrix.
- Mode is enforced on the server for every tool call. Frontend controls and prompt text are not security boundaries.

### 6.4 Tool and approval policy

Every Tool definition declares:

- stable tool ID and version.
- JSON input/output schemas and renderer contract.
- required workspace/project permission.
- side-effect class: `read | draft_write | external_write | publish | destructive`.
- idempotency and retry policy.
- data egress class and Connector dependency where applicable.
- approval policy and supported dry-run/preview behavior.
- audit and redaction contract.

Default approval behavior:

| Action | Interaction |
| --- | --- |
| Choose concept, target audience, date, page, or candidate | Human tool; the user supplies a result. |
| Reversible draft edit in a new revision | ChangeSet preview plus undo; no modal for every edit. |
| Bulk rewrite/translation | Approval gate with affected count and sample diff. |
| Content-model migration | Server approval gate with impact preview token. |
| Publish/deploy, production domain/DNS, or release rollback | Server approval gate. |
| Delete page/model/content/asset | Server approval gate with dependency impact. |
| Install/enable Connector or send data externally | Server approval gate and data-egress disclosure. |
| Change billing/payment configuration | Server approval gate with elevated permission. |

“Always allow” decisions are persisted by Arclayer under a scoped policy record; assistant-ui state is not authoritative.

### 6.5 Delegation

The orchestrator delegates through a typed backend Tool such as `agent.delegate`, not through frontend fan-out. A delegation includes target Agent version, objective, input references, allowed tools, budget, and parent run/span IDs.

The backend must:

- verify the target assignment and delegation allowlist.
- compute the intersection of user permissions, lead-Agent grants, target-Agent grants, execution mode, workspace policy, and plan entitlements.
- persist parent/child run relationships and public progress summaries.
- return structured sub-Agent message parts or artifacts.
- never expose hidden chain-of-thought. Public trace shows declared actions, tool calls, evidence, outputs, and errors only.

### 6.6 Thread, mention, and Agent launcher UX

The conversation sidebar places a horizontally scrollable row of pinned/recent Agent avatars above Select/Filter. Clicking an avatar:

1. initializes a backend thread idempotently.
2. fixes the stable `leadAgentId` in thread metadata.
3. snapshots the resolved Agent version, current workspace/project permissions, site revision, selected objects, and route context on the first Run; each later Run captures its own exact context.
4. opens the thread with capability summary and relevant starters.

The composer supports `@Agent` through an Arclayer adapter around assistant-ui mention primitives. Mention directives are display/LLM hints only. The send envelope carries deterministic metadata:

```json
{
  "threadId": "public-id",
  "leadAgentId": "public-id",
  "mentionedAgentIds": ["public-id"],
  "executionMode": "plan",
  "workspaceId": "public-id",
  "projectId": "public-id-or-null",
  "siteRevisionId": "public-id-or-null",
  "message": "user text",
  "idempotencyKey": "opaque-key"
}
```

The server validates every referenced Agent and decides direct routing versus orchestrated collaboration. Multiple mentions request collaboration; the browser must not independently invoke Agents in parallel.

Conversation list filtering and search are server-side and support Agent, project, status, archive, and updated ordering. Unselected icon-only tabs require accessible names.

### 6.7 assistant-ui integration contract

The target uses assistant-ui primitives and runtime adapters while keeping Arclayer domain types independent:

- retain the existing Thread/Composer/message/action/branch primitives and proven Tool/HITL renderers; replace their backend authority and registration path instead of creating a second chat UI runtime.
- adopt the `useRemoteThreadListRuntime` and `RemoteThreadListAdapter` contract for backend-owned list, initialize, rename, archive, unarchive, delete, pagination, and metadata; keep the Arclayer domain independent of those React API names.
- persist message history on the backend; Zustand may retain only transient panel, draft, and preference state.
- initialize a thread before the first message to eliminate the first-message race.
- render standard text, source, file, image, and tool-call parts. Approval is metadata on a tool-call part, and delegated sub-Agent conversations use the tool-call part's nested `messages`; neither becomes a frontend-only part type.
- use current Toolkit APIs (`defineToolkit`, render-only external tools, `Tools`/equivalent) for new Tool UI. Deprecated `makeAssistantTool*` and `useAssistantTool*` APIs are not target architecture.
- isolate unstable mention APIs behind an Arclayer component/adapter.
- render child Agent messages as read-only nested messages within the parent delegation Tool call. They do not appear as user threads.
- expose explicit pagination/resume errors; default adapter behavior must not silently preserve a failed cursor.

The backend-to-frontend protocol remains behind an adapter boundary. Wave 0 must choose and prove two separate contracts:

1. the assistant-ui runtime/wire adapter used for text, Tool calls, approvals, nested Agent messages, cancellation, and state updates; and
2. the durable reconnect mechanism used to recover an Agent run after refresh or connection loss.

The spike compares AG-UI with an Assistant Transport/custom-stream adapter against the existing FastAPI/LangGraph model. It must not assume that the AI SDK `AssistantChatTransport` resumable integration applies unchanged to AG-UI. The selected design must prove owner validation, replay/cursor behavior, cancellation, terminal recovery, and no backend dependency on React packages. A2A remains reserved for external Agent interoperability.

### 6.8 Usage, budgets, and Credits

- A parent Run reserves a server-computed upper bound before provider execution; delegated child Runs consume explicit sub-budgets from that reservation and cannot independently escape it.
- Provider usage events are provisional until reconciled. Unused reservation is released on success, failure, or cancellation.
- A terminal `run.completed` event and successful assistant message status are persisted only after actual usage is committed to the Credits ledger.
- If actual usage exceeds the reservation, the service atomically extends and commits the reservation when entitlement/balance allows. Otherwise the Run fails explicitly before exposing a terminal success; it never returns a successful result and then hides a billing failure.
- Model, Tool, job, and Connector limits are enforced through typed `EntitlementService` keys, not by reading unvalidated `plan.features` JSON inside each module.

## 7. Workspace Knowledge, Skills, and Design Systems

These are first-class Workspace-scoped backend domains and Product Application **Customization** pages, not opaque setting keys or tabs inside Workspace Administration. Their primary creation and application paths live in Agent and Project work; Customization governs team reuse, quality, adoption, change, and retirement. The administration experience redesign owns their full lifecycle and composition.

### 7.1 Workspace Knowledge

Every Workspace has one shared-guidance layer and every Project has one Project-guidance layer. Effective Agent context resolves the Workspace baseline plus Project additions and explicit overrides, exposing conflicts, exclusions, access limits, and freshness. The primary experience never requires creation of a named Knowledge Base.

Reusable files, URLs, maintained pages, and Connector content remain separate references. When used, internal source/version/chunk entities support import, preview, ACL, sync, processing, retrieval, citations, freshness, recovery, and reproducibility, but do not dictate navigation or primary copy. Agent outputs retain access-safe use/citation evidence where relevant.

### 7.2 Workspace Skills

A Skill is a reusable way of completing a job inside Agent work. Team Skills begin through a guided Agent conversation or by saving a successful run, then move through review, retained realistic tests, publication, visible recommendation/application, outcome evidence, revision, disabling, and retirement. Arclayer-built and team-created Skills share the same invocation model.

Internal versioned artifacts may preserve stable identity, trust, required Tools, permissions, data egress, resources, validation, and immutable evidence. Supported imports remain secondary and never execute untrusted repository code. `SKILL.md`, package manifests, Git refs, repository paths, checksums, raw resources, and semantic versions are not primary customer concepts.

Automatic matching may recommend a Skill but never authorizes external writes, publication, deletion, access change, or spending. Applied Skills are visible in the Agent run and proven by real outcomes rather than declaration validity.

### 7.3 Workspace Design Systems

A Design System combines brand and interface foundation: logos, imagery direction, colour, typography, voice, semantic tokens, components, layout, motion, and accessibility rules. It may be created or refined through Agent conversation, a brand manual, an existing site or Project, or a supported import.

Internal version and assignment entities preserve immutable releases and Project-pinned adoption. One Project connects to exactly one revision at a time. Local adjustment remains local; a durable shared change becomes a proposal or fork. Release requires representative real-output preview and validation. Connected Projects receive a revision-bound update offer and impact preview; publication never silently updates them.

Generation records applied rules, deviations, safe fixes, and unresolved adherence. Customization prioritizes representative output, connected Projects, adoption, update impact, validation, and history rather than raw token tables.

## 8. AI-native content management

### 8.1 Content Library

The Content Library remains the operational source for pages, reusable sections, globals, structured records, and articles. Its default experience is a workbench, not a table configuration demo.

Required composition:

- P0: content scope/views, search, create/generate/import, status, title/model, updated state, and preview/open action.
- P1: compact filters, saved views, bulk selection, locale/translation state, preview/inspector, and AI actions.
- P2: column density, raw identifiers, runtime diagnostics, advanced routing/presentation details.

Required AI workflows:

- generate content from site brief, Sitemap section intent, Knowledge citations, and Design/content constraints.
- rewrite tone/length, translate, derive SEO metadata, produce variants, and fill missing fields.
- bulk operations run as durable jobs and return affected counts, sample/full diff, validation, and approval state.
- Agent output writes only through content command services and immutable draft versions.
- content provenance identifies human/Agent/import source and referenced Knowledge versions.

Internal identifiers and untranslated keys must not appear as primary product content. Advanced diagnostics remain available behind an explicit diagnostics surface.

The Content Library read path is a database-backed query contract, not in-memory filtering after loading every item. It supports cursor pagination, stable ordering, search, model/status/workflow/publication/locale/updated-by/date filters, selected field projections, facet counts, and saved-view descriptors. Project runtime and thumbnail projections are batch-loaded; adding the new media surface must not add per-row queries.

Create/generate/import uses a task-level `createItemWithDraft` command that can atomically or through an explicit persisted saga create the item, initial immutable draft version, fields, presentations, route, and hierarchy intent. It composes existing canonical services and returns the real partial/failure state; Admin and Agent callers do not duplicate this orchestration.

### 8.2 Content Models

Preserve the existing canonical model/field/storage-sync/impact-preview services. Recompose the UI around model intent and safe evolution:

- template or AI-assisted start based on the site brief and selected content needs.
- schema outline and field list as the primary view; advanced storage/API/workflow metadata is progressive disclosure.
- AI proposals are strict typed schema operations, never loose schema blobs.
- every update runs existing impact preview, continuation, relation, and storage-sync planning before save.
- affected content, breaking changes, migration/recovery plan, and preview token are shown together.
- reusable field/component patterns may come from official/workspace Skills, but validation remains server-owned.

### 8.3 Editor bindings

Builder sections bind to canonical content through typed `ContentBinding` records containing model/item/field or query references, locale behavior, fallback policy, and presentation slot. Missing bindings are explicit readiness blockers; the renderer must not invent content.

## 9. Site lifecycle, first-publish states, and thumbnails

### 9.1 Product state machine

The Admin and public site distinguish:

```text
blank → generating → draft_ready → publish_blocked → published
                     ↘ failed / cancelled
published → draft_changes → published
```

- `blank`: guided site brief, import, or start-from-template choice.
- `generating`: real durable job progress and partial results.
- `draft_ready`: preview available; readiness checks visible.
- `publish_blocked`: blockers grouped by content, design, domain, accessibility, or build.
- `published`: active release and separate pending draft state.
- `failed/cancelled`: exact failed phase, retained partial work, and scoped retry.

Before the first release, Admin preview renders a product onboarding/readiness scene. A connected public domain renders a deliberately branded “site is being prepared” page with no false published claim, internal IDs, stack traces, or fake content. Public delivery follows this binding matrix:

| Scenario | HTTP | Cache | Robots |
| --- | ---: | --- | --- |
| Unknown/unbound host | `404` | `no-store` | `X-Robots-Tag: noindex` |
| Bound, never published, `/` | `200` prelaunch | `no-store` | header and meta: `noindex, nofollow, noarchive` |
| Bound, never published, any other path | `404` | `no-store` | `noindex` |
| Authorized preview token | Actual route status | `private, no-store` | `noindex, nofollow, noarchive` |
| Published HTML | Route-specific `200/404/redirect` | active-release-keyed ETag and revalidation | normal published policy |
| New candidate building after a release | Continue serving last-known-good | existing active-release cache | normal published policy |
| Suspended project | `403` | `no-store` | `noindex` |
| Deleted/tombstoned project | `410` | short documented cache | `noindex` |

Prelaunch HTML is produced by the versioned `arclayer-prelaunch-v2` renderer/template, not CSS assembled in the public-host router. It reads only the public runtime's localized site name, subtitle, description, logo, and favicon; every external value is escaped before rendering. Missing identity stays explicit through localized generic copy and a neutral site-document mark rather than an invented brand.

The template uses a responsive identity/blueprint composition with light and dark color tokens and no horizontal overflow. Its first frame is the complete stable state: it does not depend on entrance animation or screenshot-specific waits, so public delivery and revision thumbnail capture observe the same result. These presentation changes do not alter the `200` root response, `404` non-root response, `no-store`/robots directives, or active-release authority. Once an active release exists, delivery never falls back to prelaunch.

Publishing uses the canonical release domain with staged activation:

1. create an inactive candidate release pinned to the exact Site Revision manifest hash and every canonical input version.
2. build an immutable artifact and run binding, readiness, accessibility, and smoke checks.
3. on success, atomically switch the active release/deployment.
4. after commit, invalidate prelaunch/prior-route caches and emit `release.activated`.
5. on failure, keep the previous active release; if none exists, keep the prelaunch response.

No publish/deployment API may mark a candidate active or `READY` before required build and smoke checks succeed. Published HTML, sitemap, and route caches are keyed by active release ID.

Public delivery availability is a separate Hosting-owned projection and does not redefine publication. When a Workspace enters Payment Restricted, its active release continues through the Hosting Policy's Continuity Window while rebuild, republish, and domain-change commands are blocked before new hosting work begins. Window expiry enters Delivery Suspended: custom domains receive a neutral temporary-unavailable response, while Arclayer-managed subdomains may receive a branded recovery response. Neither response discloses payment state, and suspension never deactivates the release or removes artifacts, domain bindings, or certificate associations.

Provider-confirmed payment recovery or a Commerce Domain State Correction to Payment Grace publishes a durable commercial-access transition with a distinct cause. Hosting consumes it idempotently, records its own restoration, clears the delivery gate atomically, and resumes the same active release without rebuilding or redeploying it. Commerce cannot mutate release, deployment, domain, certificate, cache, or delivery records; Hosting owns deadline evaluation, visitor responses, restoration, retry, and any resulting Operational Signal. Hosting failure does not roll back the committed Commerce transition.

### 9.2 Site preview artifact

Project/site thumbnails are not project icons. Add a revision-aware `SitePreviewArtifact` with:

- project/site/revision/release IDs and capture status.
- source preview URL and viewport/theme/locale.
- image asset references for required card variants.
- width/height, dominant color or compact placeholder, content hash, capture time, and error metadata.
- provenance and idempotency key based on revision/release plus capture profile.

Capture is triggered after a preview build becomes ready and after a published release changes. The home Recent Projects surface and `/projects` grid/list use the latest successful thumbnail as a subtle media background. If no capture exists, show a neutral site-frame placeholder that communicates “preview pending”; do not fall back to a centered project avatar pretending to be a site preview.

Project cards use native link/button semantics. “Open management” and “Open editor” are distinct accessible targets; the thumbnail is a media layer, while the project icon remains compact identity metadata and never substitutes for site preview.

Capture uses a short-lived, audience-limited preview credential, a fixed capture profile, and a renderer readiness signal. It must not browse an authenticated user session or include private/editor-only data. A successful new asset is made active atomically; failure records the real error and keeps the previous successful thumbnail without labelling the failed revision as captured.

## 10. Taskiq and durable background work

Taskiq remains the asynchronous execution system. The current seven task categories are retained where valid and expanded; it is not replaced solely because current deployment is incomplete.

### 10.1 Job contract

Every user-visible or business-critical task has a durable application job record with:

- public ID, job type, workspace/project/site scope, actor, correlation/trace IDs.
- idempotency key and source revision/hash.
- public `queued | running | waiting_for_user | succeeded | failed | cancelled` state, derived from explicit internal dispatch/attempt states.
- progress phase, completed/total units where meaningful, and localized status key.
- retry classification/count/next attempt, timeout, cancellation state, structured terminal error, and result references.
- audit metadata and timestamps.

Taskiq delivery is treated as at-least-once. Domain writes and provider calls must be idempotent before retries are enabled. Taskiq result storage is infrastructure, not the canonical website/Agent/billing state.

Creating durable work transactionally inserts `BackgroundJob` plus `JobDispatchOutbox`. Internal states include `pending_dispatch`, `queued`, `running`, `retry_scheduled`, `waiting_for_user`, `succeeded`, `failed`, `dead_lettered`, and `cancelled`. Each delivery atomically claims a `JobAttempt` with `leaseUntil`, heartbeats while running, and may be reclaimed only after an expired lease. `cancelRequestedAt` is separate; the Job becomes `cancelled` only when a worker acknowledges it at a documented safe point.

Every dispatch message carries a minimal serialized tenant target descriptor. The worker binds and validates `TenantContext` before loading tenant rows. Full tenant content, prompts, secrets, and generated documents are not copied into broker messages.

### 10.2 Workload queues

Define resource-oriented logical workload classes. Wave 0 maps each class to the existing broker's supported routing primitive—stream, broker instance, or dedicated worker pool—before physical queue names become binding:

- `agent-io`: long Agent runs, delegation continuations, retrieval, and external model/API I/O.
- `render-browser`: preview rendering, visual verification, screenshots, and site thumbnails.
- `asset-cpu`: image metadata, transform, optimization, and variants; CPU work uses process isolation where required.
- `publish`: build, preview deployment, release activation, rollback, and smoke checks.
- `connector`: GitHub import/refresh, provider event processing, reconciliation, and external sync.
- `maintenance`: retention, usage aggregation, stale reservations, orphan cleanup, and scheduled checks.

A broker change requires load, delivery, or routing evidence; the logical workload split alone does not require one. The current single `RedisStreamBroker`/`queue_name` topology is an implementation baseline to migrate, not evidence that one worker pool can safely serve every resource class.

The Wave 0 queue-topology contract must prove the mapping supported by the installed Redis Stream broker. The expected baseline is one explicit broker/stream module and worker process per workload class unless selective worker consumption is proven. Each task belongs to exactly one class; broker modules, worker/scheduler commands, environment keys, replicas, health checks, and queue ownership are version-controlled deployment contracts.

### 10.3 Required tasks

At minimum, design and implement tasks for:

- Knowledge source fetch/parse/index/reindex and GitHub Skill import/refresh/validation.
- multi-page Sitemap/Wireframe/Design generation and resumable Agent continuation.
- bulk content generation/rewrite/translation/SEO analysis.
- preview build, publish build, smoke test, screenshot, and thumbnail variants.
- asset optimization and generated-image processing.
- scheduled release dispatch and execution.
- AI usage aggregation, reservation recovery, conversation/checkpoint retention.
- provider event processing, subscription/entitlement reconciliation, and Connector health refresh.
- observability/audit retention and explicit orphan cleanup.

The scheduler sends tasks; it does not execute a due batch serially in the scheduler process. Scheduled publish scans use a bounded page, atomically claim due rows with a lease/`SKIP LOCKED`-equivalent contract, and dispatch one idempotent execute Job per release. Deploy one scheduler leader or an explicit leader-election mechanism. Schedules use UTC or a documented IANA timezone.

Advisory locks are allocated through one namespaced registry or a collision-tested stable-key derivation; jobs do not hand-author reused numeric keys.

### 10.4 Failure behavior

- Enqueue failure for durable work is returned/stored as an explicit failure or remains in a transactional outbox for retry. It must not silently run expensive work inline.
- Retry only transient network, provider, rate-limit, and worker failures. Validation, permission, authentication, invalid prompt/config, and deterministic build failures do not retry blindly.
- Use exponential backoff plus jitter with a documented maximum for retryable external operations.
- Cancellation is cooperative application behavior, not an assumed Taskiq hard-kill primitive. The API durably records a cancellation request, and the worker/Tool checks it between documented meaningful steps before persisting a terminal `cancelled` state.
- Worker and scheduler processes are part of the supported deployment configuration and health/readiness checks.

## 11. Connector framework and commercialization

### 11.1 Connector capability

Extend the plugin contract with a typed Connector capability rather than resolving arbitrary generic providers by convention.

Required concepts:

- `ConnectorDefinition`: plugin-owned type, capabilities, config schema, secret schema, scopes, webhook/events, health contract, trust level, and version.
- `ConnectorInstallation`: system/workspace installation, pinned definition version, config, secret references, mode, state, and activation revision.
- `ConnectorSecretRef`: reference to a server-side secret store; plaintext secrets are never returned or stored in product JSON.
- `ConnectorEventInbox`: durable raw/normalized provider event metadata, unique provider event ID, processing state, attempts, and audit.

Plugin manifest capability registration must fail at startup when declared Connector definitions are missing. Arbitrary third-party plugins must not receive global billing secrets; the SaaS billing connector is an official trusted plugin.

### 11.2 Billing ownership

The core Commerce domain keeps provider-neutral ownership of:

- plan/price/feature catalog and workspace subscription projection.
- AI Credits balance/reservation/commit/release ledger.
- workspace entitlements and authorization projection.
- provider-event inbox, reconciliation state, and audit.
- provider-neutral checkout/portal API contracts.

Tenant Checkout, Provider Portal, detailed Credit ledger, Subscription selection, and payment recovery require the Workspace-scoped `workspace:commerce:manage` permission. The Workspace Owner always has this authority and may delegate it to multiple Billing Managers through Workspace RBAC. Platform Commerce Permissions, ordinary membership, Admin, and general settings authority never substitute for the tenant permission.

Typed entitlement keys and one `EntitlementService.require(...)` boundary replace module-specific reads of free-form plan feature JSON. The unused operator-approved subscription-change request model is removed because it conflicts with the canonical self-service commercialization flow. Commerce expansion also restores the repository/transaction boundary required by the backend service contracts; Connector work must not deepen direct ORM access from the orchestration service.

The current Wave 6 foundation implements a closed typed entitlement registry,
an injected subscription/plan projection repository, and fail-closed
`check(...)` / `require(...)` decisions. Its current active/inactive status
gate is superseded by the canonical Dunning Policy and commercial-access
projection: Payment Grace retains non-metered product/data capabilities while
new metered external-cost effects fail before dispatch, and Payment Restricted
starts both Restricted Recovery Mode in the Product Application and the
Hosting-owned Continuity Window without pretending to be Free, suspending the
Workspace, or unpublishing the active release. Restricted Recovery Mode keeps
authorized reads, preserved-data export, recovery, and security/privacy/lifecycle
exceptions while every value-expanding command fails with
`402 WORKSPACE_PAYMENT_RESTRICTED` before dispatch. Invalid persisted
configuration or recovery metadata is a stable service-unavailable error rather
than an implied denial, unlimited grace, or grant. `sites.generate` is the only
registered key because it is the only entitlement currently backed by an
existing production capability. Enforcement in Jobs, Builder, Agents, and
Connectors remains gated until those composition boundaries inject this
authority explicitly.

Commercial Lifecycle Notifications consume durable Commerce and Hosting facts rather than Provider-only email or a daily broadcast. Commerce emits the Payment Grace, configured grace-warning, Payment Restricted, and recovery milestones; Hosting emits the configured continuity-warning and Delivery Suspended milestones. Notifications resolves the current Workspace Owner and Billing Managers for email plus in-app delivery and other active members for sanitized in-app delivery, using one idempotent per-recipient/channel ledger. Notification success, failure, retry, or interaction never changes the Dunning, Restricted Recovery, Hosting Continuity, Delivery Suspended, or recovery projection.

Unreachable recipients produce notification-owned delivery failures and an Operational Signal, never an automatic grace or continuity extension. An authorized manual extension is a separate single-Workspace, time-bounded Domain Policy Exception: Commerce alone may change its Dunning deadline and Hosting alone may change its continuity deadline, with independent permissions, reason, evidence, idempotency, and audit. Neither exception changes the Plan Revision, Credits, Provider facts, active release, Workspace deletion state, or the other domain's deadline.

A Domain Policy Exception succeeds only while its source window and expected deadline revision remain active; it cannot backdate or reopen Payment Restricted or Delivery Suspended. After expiry, the owning domain must use an append-only Domain State Correction with stricter permission/evidence and a new deadline. Commerce may compensate into Payment Grace and Hosting may compensate into Hosting Continuity, but the original transition remains immutable and neither correction claims Provider recovery, grants Credits, or rebuilds the release. A Commerce correction does not directly change Hosting, but its durable corrected access fact canonically causes Hosting to record its own normal-delivery restoration because Payment Grace includes already-published delivery.

Committed Policy Exceptions and State Corrections are Commercial Lifecycle Notification milestones. Owner and Billing Managers receive email plus in-app delivery, while other active members receive sanitized in-app state. A Commerce correction with a suspended Hosting projection reports Payment Grace and delivery restoration pending; only a committed Hosting result may separately report delivery restored or failed. Preview, command acceptance, dispatch, and retry never claim success.

Billing-contact notices attribute the action to “Arclayer Platform Operations” and include a stable localized customer-safe reason category, original/new deadline or state, effective time, and support reference. Other members receive only sanitized capability/delivery effect and effective time. Individual operator identity, internal reason/evidence, Platform permission, Provider diagnostics, and raw audit data remain restricted to Platform Audit.

The official Stripe billing Connector owns:

- Stripe client, Checkout Session and Customer Portal creation.
- Subscription Schedule/change, schedule cancellation, and proration preview required by Renewal Transitions and Commercial Corrections.
- Product/Price/Feature mapping and external identifier validation.
- webhook signature verification and Stripe event normalization.
- provider health, request IDs, test/live isolation, and reconciliation adapter.

The core service receives a `BillingConnector` interface through dependency injection. It must not import or instantiate `StripeBillingProvider` directly.

### 11.3 Stripe SaaS billing flow

Arclayer charging its workspaces uses Stripe Checkout Sessions, Billing Subscriptions, Customer Portal, and optionally Entitlements. It does not use Stripe Connect; Connect is reserved for a future marketplace/multi-party money flow.

The target flow is:

```text
Webhook request
  → read raw body
  → verify Stripe signature/timestamp with the official server library
  → transactionally insert or load the unique
    (provider, mode/account, providerEventId) event
  → in the same transaction create an outbox record when no pending or
    completed processing record exists
  → return 2xx only after durable event and outbox acceptance

Outbox dispatcher
  → enqueue the provider-event record id
  → retain and retry the outbox record on broker failure

Connector worker
  → claim the provider event idempotently
  → tolerate duplicate delivery and out-of-order events
  → fetch current provider object when needed
  → normalize subscription/invoice/entitlement
  → idempotently update local projections and ledger
  → record audit/result
```

The inbox stores payload hash, encrypted raw payload, event type, signature timestamp, Connector definition/adapter version, retention deadline, and processing status. Invalid signatures return `400`; failure to commit inbox/outbox state returns `5xx`. After durable acceptance, duplicate delivery returns `2xx`, and temporary broker failure remains explicit on the outbox without changing that accepted response. Replay uses the pinned adapter version. The official Connector retains the stable `/commerce/webhooks/stripe` external path unless a timed provider-side endpoint migration is explicitly approved.

Checkout, portal, and other Stripe POST operations carry business idempotency keys without personal data. Plan Revision prices map to stable external Price IDs per provider mode, interval, and currency rather than resolving mutable Plan-code terms or creating ungoverned inline prices on every checkout. Checkout metadata and normalized provider events retain both stable Plan code and immutable Revision identity.

If Arclayer later lets a workspace connect its own Stripe account, a separate commerce/funds-flow contract first decides whether the integration is an API-access Stripe App or a Stripe Connect platform. The selected flow must use OAuth, least privilege, `state` validation, token rotation, disconnect/revoke, and explicit account identity; users are never asked to paste live secret keys into product JSON. It remains separate from the SaaS billing installation.

### 11.4 Billing product surfaces

Plans & Billing manages the internal Commerce domain:

- stable Plan identities, immutable Revision history, Entitlement snapshots, Revision-scoped Price mappings, and active catalog lifecycle.
- official billing Connector installation, test/live state, health, webhook state, scheduling/proration readiness, and reconciliation.
- entitlement mapping and provider diagnostics.

Workspace Plan & Usage manages:

- current plan/subscription/entitlements, available/reserved/used Credits, period, and usage.
- upgrade/downgrade checkout, Customer Portal, invoice access where supported, and past-due recovery.
- immutable ledger and provider-independent local state.

Do not rebuild card/payment-method collection in Arclayer when Customer Portal covers it reliably.

Portal-backed plan changes are enabled only for Stripe configurations the Portal supports. Multi-product, usage-based, `send_invoice`, scheduled, or otherwise unsupported subscriptions use explicit Arclayer flows and must not be presented as Portal-manageable.

## 12. Settings information architecture

### 12.1 Platform AI Operations domain

Replace the current single long settings wall with one Platform AI Operations domain whose product label is `AI 服务 / AI Services`. It opens actionable cross-Workspace `AI 任务 / AI tasks` rather than a metric-card overview.

1. **AI tasks:** failed, stuck, retrying, Provider-blocked, and approval-waiting Runs with Workspace/Project context, durable progress, safe failure reason, and authorized recovery actions.
2. **Models & providers:** provider configuration readiness, model catalog, routing policy, reasoning defaults, availability, health, and safe credential rotation.
3. **Built-in assistants:** official templates, versions, availability, assignments, and the default assistant.
4. **Built-in skills:** official Skill packages, immutable versions, validation evidence, publication, Workspace adoption impact, disabling, and retirement. Platform edits package metadata in place with optimistic revision; instruction or resource changes always publish a new immutable version.
5. **Actions & policies:** Tool registry, external/write effects, maximum Platform policy, permission and approval requirements, data-egress disclosure, routing, and recovery policy. Queue/worker/recovery/retention configuration appears in the relevant provider, task, or policy dossier rather than a technical Runtime settings page.

An approval-waiting task may be diagnosed and linked to its owning Workspace surface, but a Platform Operator never approves, rejects, or applies the Workspace change on behalf of the authorized actor. Workspace-authored Agents, Skills, Knowledge, and Design Systems do not live in Platform AI Operations. The domain manages official Skill publication/trust policy and the built-in catalog only; it never edits Workspace installations. Detailed budgets and Credits remain in Plans & Billing; historical costs, throughput, latency, and failure trends remain in Monitoring & Audit.

Primary copy uses the task names above. Terms such as posture, governance, LangGraph, checkpointer, routing enum, and raw Provider error are restricted to authorized diagnostics when no plain-language explanation can preserve the required technical detail.

### 12.2 Workspace Administration and Customization

Workspace Administration remains the current-Workspace management dialog/overlay and contains only:

- General.
- Plan & Usage.
- People, with People, Pending, Invite links, and Requests where supported.
- Roles & Permissions when the bound Plan makes role management available; otherwise its disabled Plan-badged entry opens the exact Plan & Usage explanation without mounting the page.

Knowledge, Skills, and Design Systems move out of that dialog into one peer **Customization** navigation group in the Product Application:

- **Knowledge** governs Workspace guidance, reusable references, effective-context inheritance, conflicts, freshness, access, use, and citations where relevant. Project guidance remains in its Project.
- **Skills** governs Arclayer-built and team-created Skills, tests, publication, availability, adoption, update impact, disabling, and retirement; creation and application remain centred in Agent work.
- **Design systems** governs connected creative foundations, representative previews, releases, Project adoption, update impact, adherence, proposals/forks, and retirement.

These surfaces connect to Agent configuration through assignments/grants. They are not copied into Agent JSON settings.

Primary navigation and headings use stable bilingual product copy:

| i18n key | `zh-CN` | `en-US` |
|---|---|---|
| `customization:NAV_GROUP` | 自定义 | Customization |
| `customization:KNOWLEDGE_TITLE` | 知识 | Knowledge |
| `customization:SKILLS_TITLE` | 技能 | Skills |
| `customization:DESIGN_SYSTEMS_TITLE` | 设计系统 | Design systems |
| `customization:OFFICIAL_SKILLS_SECTION` | Arclayer 官方 | Arclayer official |
| `customization:WORKSPACE_SKILLS_SECTION` | 由你的工作空间添加 | Added by your workspace |

Internal schemas, API descriptions, audit evidence, and diagnostics may say Workspace Knowledge, Workspace Skill, or Workspace Design System when ownership must be precise. Customer-facing navigation does not expose those longer technical names or architecture terms.

Workspace Administration navigation remains functionally equivalent at every supported breakpoint. Desktop may use a sidebar; narrow layouts expose the current section through a labelled trigger and full-height navigation sheet. Hiding the navigation without an alternate entry is forbidden. Every icon-only close/menu action has a localized accessible name and returns focus correctly.

Customization uses the Product Application's normal responsive navigation rather than embedding the Workspace Administration dialog as a second shell. Its three pages expose the complete page/evidence, edit/operation, and object-lifecycle states defined by the administration experience redesign and never fall back to opaque settings JSON, technical package forms, or read-only governance summaries.

### 12.3 Website Config versus Project General

Avoid duplicated site/project identity fields:

- **Project General** owns team-facing project name/description, ownership/access summary, lifecycle/archive/delete, internal slug/identity, and project-level defaults.
- **Website Config** owns visitor-facing site name/subtitle/description, locale behavior, public/canonical URL selection, browser assets, SEO defaults/title rules, structured discovery, analytics references, and support/contact metadata.
- **Domains** owns domain/DNS/verification and primary-domain selection; Website Config consumes the resolved primary URL instead of presenting a conflicting source of truth.
- **Editor Style Guide** owns visual tokens and component recipes; Website Config links to the assigned Design System rather than duplicating it.

Website Config uses a section navigation plus live metadata/browser/share preview. Project General uses compact settings panels with local save/reset feedback and a clearly separated danger area.

The existing unbounded `/projects/{projectId}/settings/core` JSON patch is not a product-page contract. `SettingRecord` may remain internal storage, but Admin pages and Agent Tools use typed domain facades for project identity, website identity, SEO/discovery, localization, source/authoring mode, and publish settings. Each facade has a Pydantic/OpenAPI schema, permission, optimistic version/ETag, Activity event, stable errors, and explicit ownership. After migration, unknown legacy keys are audited and the broad patch endpoint is restricted to its remaining internal/system owner.

Admin forms use the repository `react-hook-form`/Zod and shared Field/SettingPanel contracts. Project identity and lifecycle/danger operations are separate forms/commands; archive/delete are never mixed into a normal save payload.

## 13. Motion, interaction, and performance

Arclayer’s existing visual language remains binding: neutral canvas, Action Blue for action/selection, Poppins for hierarchy, Figtree for work, and motion for orientation/confirmation.

Target design intent for core product surfaces:

- craft level: 9 for the creation editor and Agent interaction; 8 for management/settings.
- motion intensity: 6, interpreted as purposeful spatial continuity, not ambient spectacle.
- visual density: 5 for the editor, 7 for content operations, 4 for onboarding/empty states.
- design variance: 5 for the editor shell, 3-4 for settings and data management.
- signature detail: revision-aware spatial transitions that show an AI/human ChangeSet settling into the canvas while keeping provenance and undo visible.

Motion contracts:

- color/opacity feedback: 70-120ms.
- high-frequency hover/list navigation: no movement or at most 100-150ms.
- menus/tooltips: 120-180ms.
- inspector/panel/sheet: 180-250ms; exit is faster than enter.
- stage/canvas focus transition: 220-320ms when it communicates spatial continuity.
- no routine bounce, `transition: all`, decorative infinite motion, or interaction blocked by animation.
- `prefers-reduced-motion` keeps all state changes understandable with near-instant opacity/state replacement.

Canvas performance contracts:

- transforms run on compositor-friendly properties; pan/zoom does not re-layout the full graph.
- virtualize/cull off-viewport nodes and expensive previews.
- perform automatic graph layout or heavy validation off the main interaction path, using a worker where measurement proves benefit.
- coalesce pointer updates, preserve selection during server sync, and expose sync/conflict state.
- large Tool/asset outputs stream references and summaries, not entire binary or generated documents.

## 14. Route skeleton and loading experience

`RouteTransition` is the one shared route-level loading boundary for both applications. It uses Arclayer-owned compositions built from `@arclayer/ui` `Skeleton`, rather than a third-party capture, CLI, registry, or generated-bone workflow.

Required contracts:

- App sidebar, stable top chrome, persistent actions, and stable editor chrome remain visible outside the route skeleton boundary.
- Route skeletons cover only asynchronous work regions and match the final macro layout: title/action row, filters, summary blocks, table or card body, and editor frame. They never replicate every text line, control, or dense table cell.
- For pages with independent data regions, allow progressive local boundaries or explicit `ContentGuard` states instead of withholding the whole page.
- Dense tables use a representative table-frame composition with header, filter, and row blocks; project cards use a fixed-aspect media block and concise text rows.
- The creation editor does not use a full-canvas shimmer while generation runs. It shows durable phase progress and progressively materialized nodes/pages.
- Use neutral surface/loading tokens; primary blue is reserved for actual progress/action, not ambient placeholder color.
- Honor reduced motion by rendering solid placeholders without shimmer or pulse.
- Page-local loading remains explicit: the route skeleton never replaces blank, partial, conflict, offline, permission, migration, error, or fatal domain states.
- Visual verification uses the affected responsive breakpoints and either authenticated real data or test fixtures. Fixtures are test-only and never a runtime success or data fallback.

Timing contract:

- delay transient skeleton display by approximately 180-200ms to avoid flashing on fast transitions.
- once shown, keep a short 180ms minimum to prevent a one-frame flash.
- keep progress feedback immediate through the route progress indicator; do not freeze stale page content under a new route identity.

The shared `PageSkeleton` is redesigned around a small set of meaningful macro compositions rather than long arbitrary text-line walls. It is selected explicitly for compatible route shapes; production code must not silently replace a declared route composition with a generic placeholder and report loading as successful.

## 15. Target API surfaces

Paths below are domain-router-local paths; `apps/api/src/core/routes.py` owns the global `/api/v1` Admin prefix. Admin routes use existing envelopes, `PublicUUID`, permissions, browser CSRF/auth, camelCase payloads, stable error codes, and generated clients. Governed external Connector webhook routes instead use provider authentication, dedicated rate limits, untouched raw-body preservation, and explicit provider response contracts.

### 15.1 Builder

| Method/path | Purpose |
| --- | --- |
| `GET /projects/{projectId}/builder` | Read current site revision, stage readiness, assignments, and job state. |
| `GET /projects/{projectId}/builder/revisions/{revisionId}` | Read one immutable revision manifest and projections. |
| `POST /projects/{projectId}/builder/change-sets/preview` | Validate typed operations and return impact/diff/preview token. |
| `POST /projects/{projectId}/builder/change-sets/{changeSetId}/apply` | Apply a fresh, approved ChangeSet through canonical domain services. |
| `POST /projects/{projectId}/builder/generations` | Start durable Sitemap/Wireframe/Style/Design generation. |
| `GET /projects/{projectId}/builder/generations/{jobId}` | Read durable phase/progress/partial result. |
| `POST /projects/{projectId}/builder/generations/{jobId}/cancel` | Request cancellation. |
| `GET /projects/{projectId}/builder/preview-artifacts` | Read revision/release thumbnail and preview artifacts. |

Publishing continues through the canonical release/publish APIs; builder readiness links to those services rather than creating a second publish surface.

### 15.2 Agents and threads

| Method/path | Purpose |
| --- | --- |
| `GET/POST /system/agents` | List/create system Agent definitions; creation atomically publishes an immutable initial version. |
| `GET/PATCH /system/agents/{agentId}` | Read or update mutable Definition metadata/lifecycle; official manifest-owned definitions reject mutation. |
| `GET/POST /system/agents/{agentId}/versions` | List or publish immutable Agent versions. |
| `PATCH /system/agents/{agentId}/versions/{versionId}` | Retire a custom version when no enabled Assignment references it; version content is never edited in place. |
| `GET/POST /system/agent-assignments` | List or create version-pinned workspace/project Assignments from the system control plane. |
| `PATCH /system/agent-assignments/{assignmentId}` | Change Assignment availability/default/pinning/order or move a custom Agent to another published version. |
| `GET/POST /workspaces/{workspaceId}/agents` | List/create workspace Agent definitions. |
| `POST /workspaces/{workspaceId}/agents/{agentId}/versions` | Create an immutable version. |
| `GET/POST /workspaces/{workspaceId}/agent-assignments` | List/create version-pinned workspace/project Assignments. |
| `PATCH /workspaces/{workspaceId}/agent-assignments/{assignmentId}` | Explicitly enable, disable, or reconfigure an Assignment without deleting snapshot evidence. |
| `GET/POST /workspaces/{workspaceId}/ai/threads` | Server-filtered thread list and idempotent initialization. |
| `GET/PATCH/DELETE /workspaces/{workspaceId}/ai/threads/{threadId}` | Read metadata/history, rename/archive, or delete. |
| `POST /workspaces/{workspaceId}/ai/threads/{threadId}/runs` | Start a structured Plan/Build run. |
| `GET /workspaces/{workspaceId}/ai/runs/{runId}` | Recover durable run state. |
| `GET /workspaces/{workspaceId}/ai/runs/{runId}/events` | Stream authorized public run events and resume from an explicit sequence cursor or documented `Last-Event-ID` contract. |
| `POST /workspaces/{workspaceId}/ai/runs/{runId}/resume` | Supply human/approval result and continue. |
| `POST /workspaces/{workspaceId}/ai/runs/{runId}/cancel` | Request cancellation. |
| `POST /workspaces/{workspaceId}/ai/tool-calls/{toolCallId}/responses` | Approve, reject, modify, or satisfy a human Tool checkpoint. |

Run creation, Tool response, and resume require `Idempotency-Key`. Resume also requires checkpoint ID and expected durable sequence; stale or consumed checkpoints fail with a stable conflict. Event recovery is cursor-paginated. If a cursor predates retention, the API returns the latest authorized Run snapshot with `EVENT_CURSOR_EXPIRED` recovery metadata rather than pretending the stream is complete.

Agent Assignment hard deletion is intentionally absent. Threads and Runs retain exact Definition, Version, and Assignment IDs as execution evidence; removing an Assignment row would make queued work and historical snapshots unverifiable. Operators disable an Assignment explicitly, and retention/erasure work must preserve or cryptographically seal the execution snapshot through a separately approved lifecycle contract.

Thread `DELETE` is user-visible soft deletion and never erases auditable Runs/Approvals. Legal/retention purge is a separately authorized durable Job.

The current generic `/chat`, project Agent, and workspace-action behavior is migrated to this canonical thread/run/tool surface. Compatibility facades are removed in the hard-cut wave unless a separately approved external API migration requires a timed deprecation.

### 15.3 Workspace context

| Prefix | Domain |
| --- | --- |
| `/workspaces/{workspaceId}/knowledge-bases/**` | bases, sources, versions, indexing jobs, retrieval diagnostics. |
| `/workspaces/{workspaceId}/skills/**` | packages, versions, validation, installations, official catalog. |
| `/workspaces/{workspaceId}/design-systems/**` | systems, versions, validation, preview, project assignments/forks. |
| `/system/connectors/**` | trusted definitions/installations, health, config and secrets references. |
| `/workspaces/{workspaceId}/connectors/**` | workspace installations for non-platform integrations. |

Webhook routes are registered by trusted Connector definitions under governed external routes and preserve raw-body/signature contracts.

### 15.4 Content workbench and typed settings

| Method/path | Purpose |
| --- | --- |
| `GET /projects/{projectId}/content/workbench` | Cursor-paginated search/filter/order/facets and saved-view projection. |
| `POST /projects/{projectId}/content/items-with-draft` | Task-level item/draft/presentation/route creation command with explicit transaction/saga result. |
| `GET/PATCH /projects/{projectId}/identity` | Team-facing project identity and defaults. |
| `GET/PATCH /projects/{projectId}/website-settings` | Visitor-facing identity and browser/share metadata. |
| `GET/PATCH /projects/{projectId}/seo-settings` | Typed SEO/discovery defaults and validation. |
| `GET/PATCH /projects/{projectId}/localization-settings` | Typed locale/routing behavior. |
| `GET/PATCH /projects/{projectId}/source-settings` | Authoring/source mode and provider configuration. |
| `GET/PATCH /projects/{projectId}/publish-settings` | Typed release/readiness policy. |

## 16. Required public Agent/run event semantics

Before the Wave 0 protocol contract is accepted, the following are required domain event categories rather than frozen transport event names:

- run lifecycle: created, queued, started, completed, cancelled, failed.
- delegation lifecycle: delegated, completed, failed.
- public message-part lifecycle: started, delta, completed.
- Tool lifecycle: started, progress, completed, failed.
- ChangeSet and interruption lifecycle: proposed, approval required, interrupted, resumed.
- real provider usage updates.

The Wave 0 protocol contract defines the versioned discriminated-union envelope, payload schemas, whether content updates are deltas or cumulative snapshots, ordering and duplicate rules, replay cursor semantics, terminal behavior, and mapping to the selected assistant-ui runtime/protocol.

Every persisted event carries `eventVersion`, run/thread IDs, a monotonic per-run sequence number, timestamp, and correlation ID. Delegation and Tool events also carry public span/parent IDs. Stream IDs and cursors are opaque replay locators, never credentials; every resume validates workspace/user/thread ownership.

AI terminal success ordering is binding:

```text
provider terminal usage received
→ actual usage/cost finalized
→ budget and Workspace Credits commit succeeds atomically
→ terminal assistant message part is persisted as complete
→ AIRun is persisted as completed
→ durable run-completed domain event is appended
→ the mapped terminal transport event is published
```

Partial usage is informational and never proves settlement. If Credits commit fails, the Run enters `failed:billing_reconciliation_failed`; streamed assistant parts remain explicitly incomplete, and neither a completed message nor a run-completed event is stored or emitted.

## 17. Security, privacy, and authorization

- Every retrieval, Tool, ChangeSet, job, Connector, thread, and run resolves workspace/project context through canonical dependencies.
- Effective Tool access is the intersection of user permission, Agent version grant, assignment, execution mode, workspace policy, plan entitlement, and Connector state.
- Mention text, model output, Skill instructions, Knowledge sources, imported repository content, Connector responses, and generated source are untrusted input.
- Prompt-injection detection remains explicit and fail-closed for write proposals; content is not silently scrubbed and executed.
- Tool/model output is schema validated before persistence or execution. Loose Markdown cleanup and implied successful writes are forbidden.
- GitHub Skill imports pin commit/checksum, validate paths and size, and never run repository code.
- Knowledge retrieval preserves citations and enforces ACL at query time.
- Connector secrets use environment/secret-manager references with least privilege and rotation; secrets and raw provider keys never enter run events or Tool results.
- External data egress is declared by Tool/Connector and shown at installation/approval time.
- Approval results, “always allow” policies, run provenance, provider events, and published revisions are audited.
- Payment Restricted, Hosting Continuity, and Delivery Suspended never authorize deletion of Workspace-scoped Builder, Content, Agent, Knowledge, Skill, Design System, asset, release, domain, or audit data. Only the independent Workspace Lifecycle Authority may begin deletion from an explicit Workspace Owner instruction or documented legal/privacy process.
- Restricted Recovery Mode permits authorized reads and preserved-data export but blocks AI Runs, Tools with write/external effects, imports, ChangeSets, generation, Customization changes, Connector enablement, builds, publishing, deployment, and domain mutation at both Product API and worker effect boundaries. It is never represented as `workspace_suspended`.

All URL/repository/file ingestion runs through a shared untrusted-ingest boundary. It rejects private, loopback, link-local, and cloud-metadata destinations after every DNS resolution and redirect; limits bytes, file count, depth, and decompression ratio; rejects path traversal and escaping symlinks; validates MIME independently of file extension; and records the immutable fetched commit/object hash.

Imports run secret detection and malware/content-safety classification before indexing or Agent assignment. Quarantined material remains visible as an explicit state and cannot be retrieved by Agents. Knowledge source bodies, Skill resources, Connector raw events, and generated artifacts each have named encryption-at-rest, redaction, retention, purge, and audit policies. Connector secrets and imported credentials are never copied into these payload stores.

## 18. Acceptance and verification matrix

### 18.1 Cross-product scenarios

1. A new workspace user creates a project, provides a brief, accepts a Sitemap candidate, generates Wireframes and a Style Guide, edits Design, previews, resolves blockers, and publishes without using a hidden legacy editor.
2. A user starts a thread from the Content Writer avatar and uses `@SEO Strategist`; the request envelope contains structured Agent IDs, the backend validates/delegates, and nested specialist output appears in the lead thread.
3. Plan mode produces a ChangeSet/diff but cannot apply it. Build mode applies a reversible draft edit and requires approval for publish/destructive/external actions.
4. Refresh during a long generation restores the run/job and stream; a cancel request is durably recorded, observed at the next documented cancellation point, and produces an explicit terminal state.
5. A workspace imports a GitHub Skill, sees the resolved commit/checksum and validation, installs it without executing code, and assigns it to an Agent.
6. Knowledge retrieval cites exact source versions and never returns another workspace’s chunks.
7. A content-model AI proposal uses the canonical impact preview and is rejected on a stale revision.
8. A preview build produces a site thumbnail; home and project views use it independently of the project icon.
9. A Stripe webhook is signature-verified, durably accepted, queued, and may be delivered or replayed more than once, while idempotent processing produces one subscription/entitlement/ledger effect. Persistence or dispatch failure remains explicit and retryable.
10. Navigation keeps stable shell chrome, shows a restrained content skeleton only when needed, and preserves keyboard/focus/reduced-motion behavior.
11. A `builder_managed` project cannot mutate page composition through source Tools; a `source_managed` project cannot claim visual round-trip support without a successful migration Job.
12. A candidate release that fails build/smoke checks never replaces the active release; a first failed publish leaves the exact prelaunch HTTP/cache/robots response intact.
13. Payment Restricted keeps the active release live through the configured Hosting Continuity Window, blocks new hosting-cost effects, then suspends delivery without deleting release/domain/certificate state; recovery resumes the same release without a build or deployment job.
14. Narrow Workspace/Project settings expose every section through an accessible navigation sheet, and project cards use native link/button semantics for management versus editor entry.
15. Payment Restricted remains unresolved without creating a Workspace deletion deadline; an independently authorized lifecycle deletion may purge scoped product data, and a later Provider recovery never recreates it.
16. Restricted Recovery Mode preserves authenticated read/export and security/privacy/lifecycle exceptions for authorized members; only the Workspace Owner or a previously delegated Billing Manager can open tenant Checkout/Provider recovery, while Platform Operators cannot impersonate either actor.
17. Commercial Lifecycle Notifications follow exact Commerce/Hosting milestones, re-resolve current role-sensitive recipients, suppress payment details for ordinary members, deduplicate replay by recipient/channel, and leave lifecycle state unchanged when delivery fails.
18. Notification failure never extends a deadline automatically; an authorized manual Domain Policy Exception is single-Workspace, time-bounded, domain-owned, and incapable of changing the other domain's deadline or unrelated commercial/Hosting state.
19. A Domain Policy Exception extends only an active window; post-expiry restoration appends a separately authorized Domain State Correction while preserving the expired deadline, original transition, Provider facts, Credits, release, and other domain's state.
20. A Commerce State Correction to Payment Grace commits before an outbox-backed Hosting projection restores normal delivery of the preserved active release; replay is idempotent and Hosting failure is explicit without rolling Commerce back.
21. Policy Exception/State Correction notifications fan out only after commit; Commerce reports Hosting restoration pending, and a distinct Hosting result reports success/failure without leaking internal evidence or claiming success from job dispatch.
22. Operator-intervention recipient projections use customer-safe reason categories and Platform Operations attribution while keeping personal operator identity, internal evidence, Provider diagnostics, and raw audit data out of tenant channels.
23. An untrusted URL/GitHub/file import proves SSRF/redirect, traversal/symlink, decompression, MIME, secret, quarantine, ACL, and retention behavior.

### 18.2 Required automated evidence

- Backend unit/integration tests for domain invariants, permissions, conflicts, idempotency, prompt injection, Connector signatures/events, jobs/retries/cancellation, and tenant isolation.
- Frontend component tests for keyboard/focus, Agent launcher/mentions, thread filters, Tool/HITL states, editor commands, loading/empty/error/partial/conflict/offline states, settings forms, thumbnails, and reduced motion.
- Generated OpenAPI/client alignment for every changed API.
- visual regression at canonical light/dark viewports, including full-screen editor and stable-shell loading.
- shared route-skeleton visual verification at `375`, `768`, and `1280`, plus reduced-motion component tests.
- end-to-end flows for brief-to-publish, multi-Agent delegation/approval/resume, content-model proposal, Knowledge/Skill import, thumbnail capture, and Stripe test-mode webhook lifecycle.
- end-to-end Restricted Recovery Mode coverage for retained shell/read/export behavior, exact blocked-command errors across synchronous and background entry points, in-flight safe cancellation, absence of the access-restriction blocker, and atomic payment restoration.
- end-to-end Commercial Lifecycle Notification coverage for milestone ownership, current Owner/Billing Manager resolution, ordinary-member sanitization, source replay, shared-ledger retry/failure evidence, Operational Signal escalation, and lifecycle-state independence.
- end-to-end Domain Policy Exception coverage for explicit domain-owned authorization, deadline/evidence/audit requirements, rejection of cross-domain or automatic notification-driven changes, and preservation of unrelated commercial, Hosting, and Workspace lifecycle state.
- end-to-end deadline/correction coverage for active-window concurrency, immutable expired history, stricter append-only Domain State Correction, explicit new deadlines, and absence of false payment recovery or cross-domain mutation.
- end-to-end corrected-access projection coverage for Commerce-first commit, durable outbox handoff, Hosting-owned idempotent restoration of the same active release, distinct correction versus payment-recovery cause, retryable Hosting failure, and no distributed rollback or second operator correction.
- end-to-end operator-intervention notification coverage for post-commit-only emission, role-sensitive audience/content, Commerce restoration-pending state, separate Hosting success/failure result, and rejection of preview/dispatch-derived success.
- end-to-end disclosure coverage for localized customer-safe reason codes, Platform Operations attribution, billing-contact/ordinary-member field boundaries, and complete internal audit retention without tenant leakage.
- migration fixtures for project authoring-mode classification, baseline Content Structure/Site Revision creation, conversation normalization, tenant readiness, Stripe inbox replay, and pre-/post-hard-cut route removal.
- matching quality gates: `pnpm api:check`, `pnpm app:check`, or `pnpm check` by change scope.
- `pnpm code-review-engine --scope changed --base HEAD --format json` for review-sensitive waves.

## 19. Rollout order and hard cuts

The dependency order is mandatory; visual surfaces must not invent contracts ahead of their backend ownership.

The wave-by-wave rollout plan (Waves 0-6 with their migration gates) is an active plan and lives in [docs/plan/ai-website-builder-rollout-waves.md](../../plan/ai-website-builder-rollout-waves.md), tracked alongside the implementation conversations in `docs/plan/ai-builder-product-direction.md`.

Each wave removes superseded internal facades and dead UI in the same rollout. No wave may keep a silent fallback to the old behavior simply to make the new path appear successful.
