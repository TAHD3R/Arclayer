# AI Website Builder Platform Contracts

**Status:** Approved target contract; enforcement is activated per rollout wave in section 19.
**Decision date:** 2026-07-15
**Applies to:** `apps/api`, `apps/admin`, `packages/ui`, generated OpenAPI clients, `plugins/*`, Taskiq workers, and site delivery/publishing.
**Visual source:** `DESIGN.md`.

This spec defines the target product and implementation contracts for Arclayer as a complete AI-native website builder. It is the cross-layer source of truth for the creation editor, multi-Agent runtime, workspace knowledge and skills, design systems, content workflows, background jobs, commercial connectors, project thumbnails, first-publish experience, motion, and loading behavior.

Existing focused specs remain authoritative for their invariants. When this target changes a current product boundary, the hard-cut rules in this document take precedence once the owning rollout wave begins. In particular:

- `docs/spec/api/backend/agents.md` continues to own tenant isolation, tool validation, cancellation, approval checkpoints, and prompt-injection rejection until its runtime surface is migrated.
- `docs/spec/shared/workspace-commercialization.md` continues to own money, Credits, subscription, ledger, and idempotency invariants.
- `docs/spec/admin/frontend/product-ui-toolchain.md` continues to own the Admin component, form, icon, chart, i18n, motion, and Boneyard stack.
- Existing content model, item, version, route, presentation, release, and publish services remain canonical storage and mutation services. The builder composes them; it does not fork them.

## 1. Product outcome and non-negotiable decisions

Arclayer must let a workspace move from a brief to a managed, responsive, accessible, publishable website without leaving the product. The result is not an export-only design concept and not a chat demo. It is a versioned website that can be edited visually, managed operationally, reviewed through explicit changes, and published through canonical services.

The following decisions are binding:

1. Project management and site creation are two modes of the same project.
   - Management pages remain under `/projects/{projectId}/**` inside the Admin shell.
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

## 2. Verified current-state evidence

The target is grounded in the live repository and the authenticated Admin application on 2026-07-15.

| Area | Current evidence | Target implication |
| --- | --- | --- |
| Editor | `ProjectEditorPage` in `apps/admin/src/pages/projects/editor/page.tsx` loads project, domain, content, route, release, and source data into a read-only dashboard and source viewer. | Reuse its query knowledge only where useful; replace the surface and split data orchestration by builder responsibility. |
| Agent catalog | `build_default_agent_registry` in `apps/api/src/agents/registry.py` hard-codes four content-oriented Agents. | Introduce persisted, versioned Agent definitions and assignments; built-ins become official templates. |
| Agent modes | `AIComposerMode` is `build | plan | agent`, and `agentIdForComposerMode` maps Build/Plan to fixed Agents. | Replace with `ExecutionMode = plan | build` plus an independent `leadAgentId`. |
| Chat persistence | `AIChatRuntimeProvider` adapts a large Zustand store through `useExternalStoreRuntime`; the conversation list is custom UI rather than a remote ThreadList adapter. | Make the backend the thread/message source of truth and adopt assistant-ui thread/runtime adapter boundaries. |
| Skill settings | `SkillLibraryEditor` serializes inline/GitHub/npx locators into a line list; the backend registry exposes a static catalog. | Replace locator text with immutable package versions, installations, trust state, compatibility, and tool requirements. |
| Content | Canonical content models, item versions, route bindings, hierarchy nodes, presentation documents, component bindings, impact previews, releases, and published graphs already exist. | Preserve and compose this foundation; do not build a parallel CMS for the editor. |
| Content UI | Content Library and Content Model editing are large management surfaces with dialog- and table-heavy CRUD; the live Content Library also exposed an untranslated column key and internal user identifier. | Recompose around content work, AI changes, preview, and explicit advanced controls while keeping canonical services. |
| Workspace context | No first-class Workspace Knowledge, Workspace Skill installation, or Design System model/API exists. | Add explicit domains rather than storing opaque settings blobs. |
| Taskiq | `apps/api/src/platform/jobs/tasks.py` registers retention, usage, thumbnails, and scheduled publish tasks, but job enablement/deployment and enqueue failure paths are incomplete. | Keep Taskiq, add durable job semantics, queues, worker deployment, and explicit failure handling. |
| Billing | Commerce already has plans, subscriptions, Credits, Stripe Checkout/Portal, signed webhooks, and provider-event idempotency; `build_billing_service` directly constructs Stripe. | Preserve commerce invariants and inject a trusted billing Connector instead of hard-coding Stripe. |
| Plugins | Extension manifests and registries support services/providers, but there is no Connector definition/installation lifecycle and `config_schema` is not a complete product configuration path. | Add typed Connector capability and installation models. |
| Thumbnails | Asset thumbnails exist, but project/site preview thumbnails and capture jobs do not. | Add revision-aware site preview artifacts and surface them separately from project icons. |
| Boneyard | `RouteTransition` wraps the main route content with Boneyard, while capture output mirrors too many small real elements and the global color is primary-tinted. | Keep stable shell chrome real, narrow capture boundaries, simplify capture anatomy, and use neutral loading tokens. |

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

`/projects/{projectId}/editor` is a full-screen route boundary that does not render the Admin sidebar, Admin page header, or `DefaultPage`. It renders `CreationEditorShell` with:

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

These are first-class workspace settings screens and backend domains, not opaque system setting keys.

### 7.1 Workspace Knowledge

Required entities:

- `KnowledgeBase`: workspace-owned collection, name, description, default locale, ACL, status.
- `KnowledgeSource`: manual document, file, URL, repository/document Connector reference, or structured content reference.
- `KnowledgeSourceVersion`: immutable source hash, provenance, fetch metadata, parser version, and indexing status.
- `KnowledgeChunk`: tenant-scoped retrieval unit with source/version/page/section location and embedding reference.

Required behavior:

- manual authoring, file/URL import, refresh, disable, delete, and scoped reindex.
- explicit states: pending, fetching, parsing, indexing, ready, failed, stale, disabled.
- citations to source version/location in Agent outputs.
- ACL and tenant predicates at retrieval time, not only during ingestion.
- prompt-injection scanning and untrusted-content separation; suspicious content remains visible as an explicit failure or quarantine state.
- embedding/model/version metadata so reindex decisions are reproducible.

### 7.2 Workspace Skills

A Skill package manifest includes stable ID, name, description, publisher, source, compatibility, required Tool IDs, resource list, instructions entrypoint, permissions/data-egress declarations, and checksum.

Supported authoring/import paths:

- `builtin`: official Arclayer package, read-only source, installable/enabled per workspace.
- `inline`: workspace-authored instructions/resources with version history.
- `github`: repository/ref/subpath import, resolved to an immutable commit and checksum.

The current `npx` locator is removed from the product Skill contract. Executable packages belong to the trusted plugin/Connector system. GitHub Skill import must never execute repository code during validation or runtime.

GitHub imports resolve a commit before reading content, reject path traversal and escaping symlinks, apply documented repository/file-count/byte limits for resource protection, validate the manifest and resource MIME/types, record every resource digest, and expose the diff for review. Imported instructions and files remain untrusted context; required Tool permissions and external data egress are never inferred from prose.

Required entities:

- `SkillPackage`, `SkillVersion`, `SkillInstallation`, and `SkillValidationResult`.
- installations pin a version and expose enabled/disabled/failed/incompatible states.
- official built-ins render in a dedicated Arclayer catalog section with publisher verification and capabilities.
- updates show manifest/resource diff and require explicit acceptance when permissions, Tool requirements, or data egress change.

### 7.3 Workspace Design Systems

Required entities:

- `DesignSystem`: workspace identity, ownership, default status, description, and linked asset collection.
- `DesignSystemVersion`: immutable primitive/semantic/component/motion tokens, typography, schemes, recipes, compatibility, and provenance.
- `ProjectDesignSystemAssignment`: pinned or tracking assignment with optional project fork.

Required behavior:

- create manually, derive from an existing site, import supported token formats, compare versions, publish a version, and assign/fork for projects.
- preview real shared components rather than styled placeholder rectangles.
- validate contrast, missing semantic roles, theme completeness, component-token references, and reduced-motion alternatives.
- expose the selected version to Site Architect, Visual Designer, and content/media Tools as structured context.

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

Prelaunch HTML is produced by a versioned renderer/template, not CSS assembled in the public-host router. It includes the visitor-facing site identity where configured and remains until an active release exists.

Publishing uses the canonical release domain with staged activation:

1. create an inactive candidate release pinned to the exact Site Revision manifest hash and every canonical input version.
2. build an immutable artifact and run binding, readiness, accessibility, and smoke checks.
3. on success, atomically switch the active release/deployment.
4. after commit, invalidate prelaunch/prior-route caches and emit `release.activated`.
5. on failure, keep the previous active release; if none exists, keep the prelaunch response.

No publish/deployment API may mark a candidate active or `READY` before required build and smoke checks succeed. Published HTML, sitemap, and route caches are keyed by active release ID.

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

The Wave 0 queue-topology ADR must prove the mapping supported by the installed Redis Stream broker. The expected baseline is one explicit broker/stream module and worker process per workload class unless selective worker consumption is proven. Each task belongs to exactly one class; broker modules, worker/scheduler commands, environment keys, replicas, health checks, and queue ownership are version-controlled deployment contracts.

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

Typed entitlement keys and one `EntitlementService.require(...)` boundary replace module-specific reads of free-form plan feature JSON. The unused operator-approved subscription-change request model is removed because it conflicts with the canonical self-service commercialization flow. Commerce expansion also restores the repository/transaction boundary required by the backend service contracts; Connector work must not deepen direct ORM access from the orchestration service.

The official Stripe billing Connector owns:

- Stripe client, Checkout Session and Customer Portal creation.
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

Checkout, portal, and other Stripe POST operations carry business idempotency keys without personal data. Plan prices map to stable external Price IDs per interval/currency rather than creating ungoverned inline prices on every checkout.

If Arclayer later lets a workspace connect its own Stripe account, a separate commerce/funds-flow ADR first decides whether the integration is an API-access Stripe App or a Stripe Connect platform. The selected flow must use OAuth, least privilege, `state` validation, token rotation, disconnect/revoke, and explicit account identity; users are never asked to paste live secret keys into product JSON. It remains separate from the SaaS billing installation.

### 11.4 Billing product surfaces

System Billing settings manage:

- plan/feature/price mapping and active catalog.
- official billing Connector installation, test/live state, health, webhook state, and reconciliation.
- entitlement mapping and provider diagnostics.

Workspace Plan & Usage manages:

- current plan/subscription/entitlements, available/reserved/used Credits, period, and usage.
- upgrade/downgrade checkout, Customer Portal, invoice access where supported, and past-due recovery.
- immutable ledger and provider-independent local state.

Do not rebuild card/payment-method collection in Arclayer when Customer Portal covers it reliably.

Portal-backed plan changes are enabled only for Stripe configurations the Portal supports. Multi-product, usage-based, `send_invoice`, scheduled, or otherwise unsupported subscriptions use explicit Arclayer flows and must not be presented as Portal-manageable.

## 12. Settings information architecture

### 12.1 System Agent settings

Replace the current single long settings wall with routed/sectioned surfaces:

1. **Agents:** official templates, versions, availability, assignments, and default orchestrator.
2. **Models & routing:** providers, model catalog, routing policy, reasoning defaults, and health.
3. **Tools & approvals:** Tool registry, side effects, permission/approval policy, and data egress.
4. **Runtime:** LangGraph/checkpointing, stream recovery, retention, cancellation, and observability.
5. **Usage link:** concise usage/health summary linking to Billing/Observability; detailed budgets remain in Commerce.

Workspace-authored Skills and Knowledge do not live in system Agent settings. System settings may manage official Skill publication/trust policy and built-in catalog only.

### 12.2 Workspace settings dialog/menu

Add the following menu groups/screens with real permissions, loading, empty, error, conflict, and import states:

- Workspace Knowledge.
- Workspace Skills, including “Arclayer official” and “Workspace” catalog sections.
- Design Systems.

These surfaces connect to Agent configuration through assignments/grants. They are not copied into Agent JSON settings.

Settings navigation remains functionally equivalent at every supported breakpoint. Desktop may use a sidebar; narrow layouts expose the current section through a labelled trigger and full-height navigation sheet. Hiding the navigation without an alternate entry is forbidden. Every icon-only close/menu action has a localized accessible name and returns focus correctly.

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

## 14. Boneyard and loading experience

The installed `boneyard-js` `1.9.0` already includes `aria-busy` and `select="container" | "viewport"`. The problem is capture scope/anatomy, not the absence of a second skeleton framework.

Required contracts:

- App sidebar, stable top chrome, persistent actions, and stable editor chrome that remain visible during loading live outside the `<Skeleton>` boundary.
- Use named Boneyard boundaries only around the asynchronous work region. `excludeSelectors`, `excludeTags`, and `leafTags` simplify generated bone anatomy; exclusion alone does not keep an element visible while the boundary is loading.
- For pages with independent data regions, allow progressive local boundaries or explicit `ContentGuard` states instead of withholding the whole page.
- Dense-table capture uses an authenticated, deterministic capture route with representative data. A Boneyard `fixture` may be used only as build-time capture input, never as a runtime success or data fallback. Capture intentionally limits row anatomy instead of assuming Boneyard chooses representative rows automatically.
- Project cards capture one fixed-aspect media block and concise text rows.
- The creation editor does not use a full-canvas shimmer while generation runs. It shows durable phase progress and progressively materialized nodes/pages.
- Use neutral surface/loading tokens; primary blue is reserved for progress/action, not the ambient skeleton color.
- Use `select="container"` or `select="viewport"` per boundary’s actual responsive contract, not one global assumption.
- Honor reduced motion by rendering solid bones and disabling shimmer/pulse.
- Authenticated capture uses explicit CDP/session or environment-injected auth. Credentials never enter config/source control.
- CI/capture verification must prove every production skeleton name resolves. Capture errors remain visible and do not become fake success.
- Generated `.bones.json` and registry artifacts are never hand-edited.

Timing contract:

- delay transient skeleton display by approximately 180-200ms to avoid flashing on fast transitions.
- once shown, keep a short 180ms minimum to prevent a one-frame flash.
- keep progress feedback immediate through the route progress indicator; do not freeze stale page content under a new route identity.

The shared `PageSkeleton` is redesigned around a small set of meaningful macro compositions rather than long arbitrary text-line walls and is used only by routes explicitly declared as non-captured/dynamic. A named production Boneyard boundary whose generated bones are missing is a development/CI error and is not silently replaced by `PageSkeleton`.

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

Before the Wave 0 protocol ADR is accepted, the following are required domain event categories rather than frozen transport event names:

- run lifecycle: created, queued, started, completed, cancelled, failed.
- delegation lifecycle: delegated, completed, failed.
- public message-part lifecycle: started, delta, completed.
- Tool lifecycle: started, progress, completed, failed.
- ChangeSet and interruption lifecycle: proposed, approval required, interrupted, resumed.
- real provider usage updates.

The Wave 0 protocol ADR defines the versioned discriminated-union envelope, payload schemas, whether content updates are deltas or cumulative snapshots, ordering and duplicate rules, replay cursor semantics, terminal behavior, and mapping to the selected assistant-ui runtime/protocol.

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
13. Narrow Workspace/Project settings expose every section through an accessible navigation sheet, and project cards use native link/button semantics for management versus editor entry.
14. An untrusted URL/GitHub/file import proves SSRF/redirect, traversal/symlink, decompression, MIME, secret, quarantine, ACL, and retention behavior.

### 18.2 Required automated evidence

- Backend unit/integration tests for domain invariants, permissions, conflicts, idempotency, prompt injection, Connector signatures/events, jobs/retries/cancellation, and tenant isolation.
- Frontend component tests for keyboard/focus, Agent launcher/mentions, thread filters, Tool/HITL states, editor commands, loading/empty/error/partial/conflict/offline states, settings forms, thumbnails, and reduced motion.
- Generated OpenAPI/client alignment for every changed API.
- visual regression at canonical light/dark viewports, including full-screen editor and stable-shell loading.
- authenticated Boneyard capture at `375`, `768`, and `1280`, plus skeleton-name resolution tests.
- end-to-end flows for brief-to-publish, multi-Agent delegation/approval/resume, content-model proposal, Knowledge/Skill import, thumbnail capture, and Stripe test-mode webhook lifecycle.
- migration fixtures for project authoring-mode classification, baseline Content Structure/Site Revision creation, conversation normalization, tenant readiness, Stripe inbox replay, and pre-/post-hard-cut route removal.
- matching quality gates: `pnpm api:check`, `pnpm admin:check`, or `pnpm check` by change scope.
- `pnpm code-review-engine --scope changed --base HEAD --format json` for review-sensitive waves.

## 19. Rollout order and hard cuts

The dependency order is mandatory; visual surfaces must not invent contracts ahead of their backend ownership.

### Wave 0 — Contract, inventory, and protocol spikes

- ratify implementation ADRs derived from this approved target, update focused specs, capture live baselines, and establish acceptance fixtures.
- spike assistant-ui protocol/runtime against FastAPI/LangGraph and choose the adapter behind the domain boundary.
- define Builder/Agent/Skill/Knowledge/Design System/Connector/job schemas and migration plan.
- repair Taskiq deployment topology and explicit enqueue/job-state behavior needed by later waves.

Wave 0 is complete only when these migration gates have evidence:

1. every existing project has an explicit `ProjectAuthoringMode`; ambiguous CMS-plus-source projects enter `migration_required` and require a recorded owner decision rather than an inferred mode.
2. eligible existing CMS projects receive one baseline `ContentStructureRevision` and Site Revision manifest without inventing historical revisions.
3. valid legacy conversation/message/event JSON is migrated to normalized rows with count/hash fixtures; invalid records are explicitly quarantined/archived. Historical third-mode runs retain original metadata, while new runs require Plan or Build.
4. public migrations and tenant-control migrations complete for every workspace; APIs remain disabled for any tenant that fails readiness verification.
5. official Agent/Skill version references and workspace/user ownership counts are backfilled and verified.
6. Stripe provider receipts migrate to the Connector inbox or prove replay compatibility while the stable webhook path remains served.
7. dispatch outbox, workload workers, health checks, and the single scheduler leader are deployed before any API that creates a durable Job is enabled.
8. old writes are frozen; counts, hashes, authorization, idempotency, replay, and last-known-good publish fixtures pass before routes/generated clients switch and old facades/source-write paths are removed.
9. rollback is supported only before destructive cleanup; after cleanup, recovery uses forward repair plus retained migration evidence.

### Wave 1 — Agent and workspace context foundation

- persist Agent definitions/versions/assignments and split execution mode from identity.
- implement backend-owned threads, messages, runs, delegation, standard parts, durable recovery, and Toolkit renderers.
- add Workspace Knowledge, Workspace Skills, Design Systems, and official built-in catalog.
- hard cut the third composer mode, text-only Skill library, static-only Agent catalog, and local browser thread authority.

### Wave 2 — Unified Builder aggregate and Sitemap

- add `ContentStructureRevision`, `SiteRevisionManifest`/status projections, typed ChangeSet, generation Job, revision conflict, and projection services over existing content/routes/presentation data.
- replace `/editor` with the independent full-screen shell and Sitemap stage.
- add brief/import/onboarding, page/section graph, impact preview, undo/redo, and Agent context.
- remove the current read-only editor surface and placeholder Content Site Builder surface in the same rollout.

### Wave 3 — Wireframe, Style Guide, and Design

- implement component-instance/variant/global-section editing and content bindings.
- implement versioned Design Systems/concepts and project assignment/fork.
- implement responsive/interaction/a11y/SEO state editing, preview builds, visual diffs, and release readiness.

### Wave 4 — AI-native content and settings

- recompose Content Library and Content Models around workbench/proposal/impact flows.
- rebuild System Agent settings IA and add Workspace context screens.
- redesign Website Config and Project General with the ownership split in section 12.
- implement first-publish/prelaunch product states.

### Wave 5 — Rendering, thumbnails, loading, and polish

- make preview build/render/capture durable and generate site thumbnails.
- update home/project grid/list media treatment.
- narrow Boneyard boundaries, capture anatomy, neutral tokens, fallback compositions, and CI capture verification.
- run editor/content/settings motion, responsive, accessibility, visual, and performance convergence passes.

### Wave 6 — Commercial Connector

- add Connector framework and official Stripe billing plugin.
- migrate core billing injection, durable event inbox/worker/reconciliation, stable Price/Entitlement mapping, and Billing product surfaces.
- remove the direct Stripe construction path after parity and webhook replay verification.

### 19.1 Requested-capability completion matrix (Wave 4 checkpoint)

This matrix records verified product authority, not the presence of routes or
screens. “In progress” means at least one production vertical exists but the
remaining evidence named in the last column is still required. It must not be
used to describe the full user goal as complete.

| # | Requested capability | Current status | Verified boundary and remaining evidence |
| --- | --- | --- | --- |
| 1 | Management plus full-screen Sitemap/Wireframe/Style Guide/Design editor | In progress | The independent revision-pinned editor and all four stage authorities exist through typed Design Preview/Apply. Revision-pinned AI Design generation now converges on the same reviewed ChangeSet authority. Compiler/release readiness, server undo/redo, and final visual convergence remain. |
| 2 | assistant-ui multi-Agent conversations, Agent launcher/mention, Plan/Build | In progress | Backend-owned threads/Runs, structured Agent selection, delegation/Tool projections, launcher, mention, and Plan/Build surfaces exist. Full Builder-wide Agent orchestration and final interaction convergence remain. |
| 3 | Agent runtime/control plane and System Agent settings | In progress | Versioned Agent definitions, assignments, grants, approvals, durable execution, and settings surfaces exist. Production operations review and remaining repository/service quality findings are not closed. |
| 4 | AI-native Content Library and Content Models | In progress | Workbench and structured model editing now expose production content-writer and content-modeler proposal paths, real impact evidence, and one shared approval/apply queue. Broader content automation and final Workbench UX convergence remain Wave 4 work. |
| 5 | Workspace Knowledge, Workspace Skills, official Skills, and Design Systems | In progress | Canonical APIs, authoring/import/install/version evidence, settings surfaces, and durable Knowledge jobs exist. Production deployment/operational evidence and final Agent-context convergence remain. |
| 6 | Site thumbnails on Home and Projects | Pending | Asset thumbnail job foundations exist, but revision-pinned site render/capture, project thumbnail projection, and final Home/grid/list media treatment remain Wave 5. |
| 7 | Productized Taskiq workload topology and task catalog | In progress | Durable jobs, broker routing, workers, scheduler leadership, recovery, and owning-domain job verticals are implemented/tested. Production deployment and health evidence remain required. |
| 8 | Connector-based commercialization and Stripe | In progress | Connector registry, Stripe plugin, durable billing event path, and Billing surfaces exist. Provider migration parity, replay/reconciliation, entitlement, and production webhook evidence remain Wave 6 gates. |
| 9 | Productized no-release/prelaunch experience | In progress | The public host has an explicit versioned, noindex prelaunch contract with no fake published success. Final branded visual treatment and release activation convergence remain. |
| 10 | Website Config redesign and ownership | In progress | Identity, discovery, and localization workspaces now have responsive live visitor previews, complete read-only behavior, generated-source invalidation, bilingual copy, and browser-verified UX acceptance. Typed domain facades, optimistic concurrency, Activity evidence, and consuming the Domains-owned resolved primary URL remain open. |
| 11 | Project General redesign and ownership | In progress | Project identity, access/lifecycle boundaries, permissions, and danger actions have production surfaces. Wave 4 final IA/copy/visual acceptance remains open. |

Boneyard and motion are cross-cutting rather than a twelfth capability. The
shared route boundary, reduced-motion primitives, and editor loading states
exist, while authenticated capture anatomy, neutral skeleton convergence, and
the final responsive/accessibility/performance pass remain Wave 5 work.

Each wave removes superseded internal facades and dead UI in the same rollout. No wave may keep a silent fallback to the old behavior simply to make the new path appear successful.

## 20. Self-review decisions

This target was reviewed against product cohesion, repository boundaries, implementation feasibility, security, migration risk, accessibility, and external official documentation. The review produced these refinements:

| Initial temptation | Approved decision | Reason |
| --- | --- | --- |
| Build four editor data stores matching four tabs | One Site Revision aggregate with canonical domain references and four projections | Prevents stage drift and preserves existing content/publish foundations. |
| Put mutable readiness, preview, deployment, and release IDs inside an immutable revision | Keep `SiteRevisionManifest` input-only; status, artifacts, and release links reference it externally | Preserves a stable manifest hash and avoids post-creation mutation cycles. |
| Let visual blueprints and source files both own composition | Require one project-wide `builder_managed` or `source_managed` mode and an approval-gated migration | Makes save, undo, preview, Agent Tools, and publish inputs deterministic. |
| Copy route/hierarchy state into Builder JSON | Add a canonical Content Structure Revision and let the Site Revision reference it | Makes old revisions reproducible without a second Sitemap write surface. |
| Activate a release before build verification | Build an inactive candidate, verify it, then atomically switch active release | Preserves last-known-good delivery and the first-publish prelaunch page. |
| Replace the existing CMS while redesigning content UI | Keep canonical content/model/version/route/presentation services | They already implement difficult versioning, impact, relation, and publication invariants. |
| Treat assistant-ui as the Agent backend | Keep orchestration/permissions/runs in FastAPI/LangGraph; assistant-ui is an adapter/UI | assistant-ui does not own backend multi-Agent semantics. |
| Use current deprecated assistant-ui Tool helpers | Target Toolkit/render-only external Tool UI | Avoids building the rewrite on deprecated APIs. |
| Route `@Agent` by parsing directive text | Send structured Agent IDs and validate server-side | Mention directives are unstable hints, not security boundaries. |
| Add A2A because the product has multiple Agents | Keep internal Agents under one orchestrator; reserve A2A for external interoperability | Avoids protocol complexity without a cross-system requirement. |
| Let GitHub/npx Skills execute code | Make Skills declarative; move executable integration to trusted Tools/Connectors | Protects tenants and clarifies capability ownership. |
| Replace Taskiq as “old code” | Preserve it, make jobs durable, deploy workers/scheduler, and eliminate silent fallbacks | Existing useful tasks and tests provide a foundation; the failure is incomplete productization. |
| Use Stripe Connect for a “Stripe Connector” | Use Checkout/Billing/Portal/Entitlements for Arclayer SaaS billing | Stripe Connect is for multi-party money movement, not ordinary SaaS subscriptions. |
| Keep Stripe as the local entitlement authority | Normalize provider events into provider-neutral local projections | Authorization must survive provider latency/outage and support future providers. |
| Persist a webhook event and immediately enqueue as two unrelated writes | Commit provider inbox plus dispatch outbox, then deliver at least once | Removes the database/broker loss window while retaining explicit failures. |
| Put tenant content and cross-tenant orchestration in one schema by convenience | Use the declared public/tenant matrix and typed PublicUUID descriptors without cross-schema FKs | Preserves tenant migration and authorization boundaries. |
| Hand-build a second skeleton DOM | Keep Boneyard, narrow capture boundaries and simplify capture anatomy | The library already captures real DOM; scope and selection create the visual noise. |
| Show project avatars when no thumbnail exists | Show a neutral site-preview pending frame | Project identity and site preview are different product objects. |

No unresolved product choice blocks Wave 0. The assistant transport selection is intentionally an implementation spike behind a fixed domain/event contract, so it cannot redefine Agent, Thread, Run, Tool, or approval semantics.

## 21. External source notes

Official sources were reviewed on 2026-07-15. Product observations from the user-provided screenshots are treated separately from official architecture claims.

### Relume

- [Relume AI website builder](https://www.relume.ai/)
- [Building a sitemap with AI](https://www.relume.ai/resources/docs/building-a-sitemap-with-ai)
- [Create and edit wireframes](https://www.relume.ai/resources/docs/how-to-create-and-edit-wireframes-in-the-relume-site-builder)
- [Style Guide concept creation](https://www.relume.ai/resources/docs/concept-creation-using-the-relume-style-guide-builder)
- [Design View](https://www.relume.ai/resources/docs/how-to-style-all-pages-using-the-design-view)

### assistant-ui

- [LLM documentation index](https://www.assistant-ui.com/llms.txt)
- [Architecture](https://www.assistant-ui.com/docs/architecture)
- [Picking a runtime](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime)
- [Threads](https://www.assistant-ui.com/docs/runtimes/concepts/threads)
- [Multi-Agent Chat UI](https://www.assistant-ui.com/docs/tools/multi-agent)
- [Mentions in Chat](https://www.assistant-ui.com/docs/guides/mentions)
- [Defining Tools](https://www.assistant-ui.com/docs/tools/defining-tools)
- [Tool UI and approval](https://www.assistant-ui.com/docs/tools/tool-ui)
- [AG-UI runtime](https://www.assistant-ui.com/docs/runtimes/ag-ui/overview)
- [A2A runtime](https://www.assistant-ui.com/docs/runtimes/a2a/overview)
- [Resumable streams](https://www.assistant-ui.com/docs/guides/resumable-streams)
- [Resumable stream deployment](https://www.assistant-ui.com/docs/guides/resumable-stream-deployment)

### Boneyard

- [Overview](https://boneyard.vercel.app/overview)
- [How it works](https://boneyard.vercel.app/how-it-works)
- [CLI](https://boneyard.vercel.app/cli)
- [Configuration](https://boneyard.vercel.app/config)
- [React features](https://boneyard.vercel.app/features)
- [Changelog](https://boneyard.vercel.app/changelog)
- [GitHub release v1.9.0](https://github.com/0xGF/boneyard/releases/tag/v1.9.0)

### Taskiq

- [Getting started](https://taskiq-python.github.io/guide/getting-started.html)
- [Architecture overview](https://taskiq-python.github.io/guide/architecture-overview.html)
- [Scheduling tasks](https://taskiq-python.github.io/guide/scheduling-tasks.html)
- [CLI](https://taskiq-python.github.io/guide/cli.html)
- [Middlewares](https://taskiq-python.github.io/available-components/middlewares.html)
- [Brokers](https://taskiq-python.github.io/available-components/brokers.html)
- [Result backends](https://taskiq-python.github.io/available-components/result-backends.html)

### Stripe

- [Online payments](https://docs.stripe.com/payments/online-payments)
- [Subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview)
- [Customer Portal](https://docs.stripe.com/customer-management)
- [Entitlements](https://docs.stripe.com/billing/entitlements)
- [Webhooks](https://docs.stripe.com/webhooks)
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe Connect](https://docs.stripe.com/connect)
- [Stripe Apps OAuth](https://docs.stripe.com/stripe-apps/api-authentication/oauth)

## 22. Wave 2A implementation evidence (2026-07-20)

Wave 2A completes the first backend slice of the Unified Builder aggregate while preserving the rollout order in section 19.

Delivered:

- explicit Project-wide `builder_managed` / `source_managed` authority, with ambiguous existing Projects durably retained as `migration_required` rather than inferred.
- immutable root `ContentStructureRevision` and input-only `SiteRevisionManifest`, plus an external mutable readiness/status projection.
- exact Design System assignment/version/checksum pinning, exact Content Version and presentation/binding hashing, typed human/Agent/import/system provenance, transactional Activity evidence, and idempotent root initialization.
- composed `GET /projects/{projectId}/builder` and idempotent `POST /projects/{projectId}/builder/initializations` Admin APIs with generated OpenAPI types.
- public migration `0044_auto_20260720_2323`, tenant-control migration v17, clean-chain and tenant readiness evidence.
- assignment-change isolation: later Project Design System assignments affect future contexts only and do not rewrite the retained Site Revision.

Still gated to later Wave 2 slices:

- typed ChangeSet preview/apply and approval/stale-base/saga behavior.
- durable Builder generation Jobs and Agent Builder context; Design System capability remains `builderContext=false`.
- full-screen Sitemap editor and `/editor` hard cut.
- renderer/publication readiness, preview artifacts, candidate builds, release activation, and all Wave 3 stages.

Validation closed with 11 Builder pure tests, 81 related unit tests, Project Activity and tenant/public migration integration evidence, the full Design System/Agent Run/Builder HTTP lifecycle, generated-client/Admin typechecks, `api:check` (2098 passed), `admin:check` (1413 passed), repository `check` (8/8 tasks), and changed audit `status=ok` with zero enforcement-blocking findings. The audit still reports 45 prototype/report-only findings and is not represented as zero findings.

## 23. Wave 2B typed Sitemap preview evidence (2026-07-21)

The first Wave 2B vertical slice now provides a real persisted ChangeSet preview protocol over the unified Site Revision aggregate:

- a closed typed union covers initial Sitemap page and route operations; opaque JSON Patch and arbitrary model-authored storage payloads remain forbidden.
- preview resolves the canonical project runtime/Site/default preview Environment, exact latest Site Revision and ETag, immutable Content Structure hash, exact page-version pins, route constraints, hierarchy constraints, actor, and provenance under tenant scope.
- human and Agent requests share one preview contract, but Agent provenance must resolve to an owned Agent Run bound to the same exact Site Revision. Import/system provenance cannot be self-asserted through the public endpoint.
- normalized operations, affected UUID/client/key targets, visible issues, permission requirements, approval class, immutable provenance, expiry, and command result are persisted. Preview writes no Content, route, hierarchy, Content Structure Revision, Site Revision, release, or artifact state.
- the apply-purpose token binds actor/workspace/project/Site/Environment/base/operation hash/UTC expiry. Storage retains only its hash; exact replay reconstructs the same raw token without persisting it.
- exact replay, conflicting replay, stale ETag, tampering, wrong audience, expiry, destructive delete classification, route/hierarchy conflicts, tenant table readiness, Activity evidence, and generated-client alignment have automated evidence.

At that preview-only checkpoint, apply, approval checkpoints, canonical next-revision writes, durable Builder generation, Agent Builder context, the full-screen Sitemap editor, and `/editor` hard cut were still gated. Section 24 records the subsequent apply activation; `builderContext=false` remains current.

Validation closed with 26 Builder unit tests, the real tenant/RBAC Design System + Agent Run + Builder + ChangeSet HTTP lifecycle, public migration `0045`, tenant migration v18, generated OpenAPI/Admin typechecks, `api:check` (2113 passed), `admin:check` (1413 passed), repository `check` (8/8 tasks), and changed audit `status=ok` with zero enforcement-blocking findings. The audit still contains 45 report-only findings and is not described as zero findings.

## 24. Wave 2B typed Sitemap apply evidence (2026-07-21)

The second Wave 2B vertical slice activates canonical apply without activating the later editor or generation slices:

- exact signed preview identity, latest-revision and live Content/route/hierarchy/version/presentation/binding hashes are revalidated under lock; stale inputs fail and never auto-rebase.
- Sitemap Content, route, hierarchy, next Content Structure Revision, next Site Revision, status supersession/draft creation, ChangeSet state, approval consumption, Activity, and idempotency snapshot commit in one tenant transaction. Canonical Content lifecycle/runtime effects dispatch only after commit.
- destructive/review previews create a requester/hash/class/expiry-bound human checkpoint. The atomic apply request carries the exact checkpoint and approval decision; the checkpoint moves from `pending` to `consumed` in the same commit.
- Agent-origin apply requires an exact Site Revision-bound Run in Build mode and the pinned Agent version's exact Tool grant. This does not ungate general Agent Builder context; `builderContext=false` remains unchanged.
- public migration `0046`, tenant migration v19, and generated OpenAPI expose the approval/apply contract. Focused HTTP, migration, transaction/lifecycle, stale-base, approval, Agent authority, and Content presentation-copy tests provide evidence.

Still gated in rollout order: durable Builder generation, full Agent Builder context, full-screen Sitemap UI and `/editor` hard cut, undo, all Wave 3 projections, renderer/artifacts/thumbnails, and commercialization entitlement enforcement.

Validation closed with 62 focused Builder/Content/EntityManager unit tests, the real tenant/RBAC HTTP apply lifecycle, public clean migration `0046`, tenant migration v19, generated OpenAPI and client typecheck, `api:check` (2144 passed, 435 skipped, 26 warnings; 4/4 tasks), `admin:check` (1413 passed; 4/4 tasks), and repository `check` (8/8 tasks). Changed-scope review reports `status=ok`, zero enforcement-blocking findings, and 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); it is not represented as zero findings.

## 25. Wave 2C durable Sitemap generation evidence (2026-07-21)

The third Wave 2 vertical slice activates exact Agent Builder context and durable Sitemap generation without activating the new editor scene:

- revision-bound Agent Runs now retain one immutable, hash-verified Builder snapshot containing the exact Site Revision manifest, status ETag, Content Structure snapshot, Design System binding, and workspace/project/Site/Environment identities. The runtime consumes this snapshot as untrusted project data; it never reconstructs mutable current Builder state for an older Run. Design System capability therefore truthfully exposes `builderContext=true` for new eligible Runs.
- `POST /projects/{projectId}/builder/generations` atomically persists the generation intent, actor/Run/Tool/base-revision provenance, owner-only actor-revalidated Background Job, dispatch outbox, and Activity evidence. Exact replay is deterministic and public-ID compatible; a changed fingerprint conflicts rather than silently starting different work under the same key.
- `builder.sitemap.generate` v1 uses the `agent-io` workload, Project permission revalidation, all-phase cooperative cancellation, `retryClass=none`, and `maxAttempts=1`. The generic Project Job identity intentionally omits generic `site_id`; exact Site binding remains in the generation/base-revision domain evidence.
- the provider must return exactly one `submit_builder_sitemap_candidate` function Tool call validated against the closed Pydantic candidate schema. Provider and output failures are distinct; successful candidates become canonical Agent-origin ChangeSet previews with `builder.sitemap.apply` provenance, not direct mutations or opaque model payloads.
- candidate results are durable and replay-safe. All requested candidates succeeding yields `succeeded`, mixed results yield `partial`, no valid candidate yields explicit failure, and cancellation preserves already completed candidates. Fenced commits prevent stale workers from writing after lease loss, and raw ChangeSet preview tokens are never stored in generation or Job state.
- create/get/cancel APIs and generated clients expose generation progress, candidates, failures, cancellation request/acknowledgement, and terminal state. Public migration `0047` and tenant migration v20 add `ai_run_builder_snapshots` and `builder_generations` with uniqueness and lookup indexes.

Still gated in rollout order: candidate-selection UI, full-screen Sitemap editing and `/editor` hard cut, undo/redo, all Wave 3 projections, renderer/artifacts/project thumbnails, productized empty-site and loading/motion surfaces, AI-native Content refinements, and commercialization entitlement enforcement. Generation never auto-applies a candidate.

Validation closed with 106 focused Job/Builder tests, the real tenant/RBAC generation + ChangeSet HTTP lifecycle, public clean migration `0047`, tenant migration v20, generated OpenAPI, `api:check` (2169 passed, 435 skipped, 26 warnings; 4/4 tasks), `admin:check` (1413 passed; 4/4 tasks), and repository `check` (8/8 tasks). Changed-scope review reports `status=ok`, zero enforcement-blocking findings, and 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); it is not represented as zero findings.

## 26. Wave 2D full-screen Sitemap vertical evidence (2026-07-21)

The first creation-mode client now closes the read/command loop over the existing Wave 2 authority, revision, Agent, Job, and ChangeSet contracts:

- a new immutable revision read endpoint returns hash-verified structure plus exact manifest-pinned page summaries; the Admin never substitutes current mutable Content rows for an older revision.
- the project Editor route is a dedicated full-screen `creation` scene. The management Site Builder page remains under Admin chrome, preserving the planned management/creation dual-mode product boundary.
- the old iframe/source/dashboard Editor is removed. Sitemap now has a pan/zoom/fit graph, exact page/route inspector, productized empty/loading/error/migration/initialization states, manual typed page creation, and AI candidate generation/review/apply.
- both manual and Agent changes follow preview/apply with base revision/ETag, signed preview token, approval evidence, idempotency, and post-success aggregate invalidation. No model output or form draft mutates the local canonical graph.
- Agent generation uses only an eligible pinned Agent assignment, creates an exact revision-bound Run, starts the durable generation, and presents persisted progress/failure/cancellation/candidates. Candidate apply remains explicit.

Validation closed with 3 new backend revision-reader unit tests, the real tenant/RBAC Builder integration, 8 focused Admin editor/scene tests, generated OpenAPI, `api:check` (2172 passed, 435 skipped, 26 warnings; 4/4 tasks), `admin:check` (317 files, 1409 tests; 4/4 tasks), and repository `check` (8/8 tasks). Changed-scope review reports `status=ok`, zero enforcement-blocking findings, and the same 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings), with no new Wave 2D file reported. Chrome verified the full-screen scene and fatal boundary, while an environment-wide API 502 prevented a truthful successful real-data canvas screenshot; that visual evidence remains pending rather than mocked.

Wave 2 is still not globally complete: server undo/redo, large-graph accessible outline/culling, responsive sheet parity, successful light/dark/reduced-motion real-data capture, and Boneyard route skeleton capture remain open. Wave 3 Wireframe/Style Guide/Design contracts and Waves 4–6 remain gated by the rollout order.

## 27. Wave 3A Wireframe contract and inspection evidence (2026-07-21)

Wave 3 now has its first truthful vertical slice:

- `WIREFRAME` is a separate exact-version Presentation kind, not an alias for final `VISUAL_BLUEPRINT`.
- a strict Wireframe schema pins page, Design System, component catalog, ordered section intent/component identities, typed content placeholders, responsive rules, interaction rules, and Asset references.
- the Builder reader verifies exact Content Version, Presentation, Component Binding, page pin, aggregate hash, and Design System identity before exposing the document. Missing Wireframe is explicit; drift and invalid documents fail.
- the full-screen Editor enables Wireframe inspection with shared page identity, device structure views, section intent spine, binding completeness, and exact pin metadata. It remains read-only because the canonical typed Wireframe ChangeSet write path is not implemented yet.
- migration `0048` and regenerated OpenAPI carry the enum/schema contract through the supported generation workflow.
- final `pnpm check` passes all 8 cross-app tasks from cache misses: API 2175 passed / 435 skipped / 26 warnings; Admin 317 files / 1410 tests passed.

This slice does not advance the rollout past Wave 3. The next required contract is canonical Wireframe mutation that creates a new immutable Content Version and Site Revision in one tenant transaction; Style Guide and Design remain gated behind it.

## 28. Wave 3B Wireframe candidate-to-revision evidence (2026-07-21)

Wave 3 now includes a truthful typed Wireframe mutation vertical:

- human or Agent inputs can express only closed Wireframe operation types. The API rejects opaque document replacement, mixed Sitemap/Wireframe families, stale version pins, missing targets, and invalid structural edits.
- preview hash-verifies the exact revision inputs and returns a server-authored candidate without mutating Content. The full-screen editor overlays only that candidate and requires explicit Apply/Discard; browser state never becomes a parallel canonical document.
- Apply folds all changes for one page into one new immutable Content Version, copies the complete retained Presentation/SEO/Component Binding set, replaces only the Wireframe document, and creates the next Site Revision plus status/idempotency/approval/Activity evidence in the same tenant transaction.
- the Admin inspector supports section ordering/duplication/removal, component/variant, binding, responsive, interaction, and initialization proposals. The server candidate is visibly distinct from the pinned revision and successful apply reconciles through the Builder aggregate.
- OpenAPI generation carries the request/output discriminated unions and candidate documents to TypeScript. Focused backend tests pass 58 cases and focused Admin tests pass 10 cases; API typecheck retains only three existing test diagnostics and Admin/OpenAPI typecheck pass.

Final cross-app verification runs from cache misses and passes all 8 Turbo tasks: API has 2183 passed, 435 integration-disabled skips, and 26 existing warnings; Admin has 317 files and 1411 tests passed. Changed-scope review is `status=ok` with zero enforcement-blocking findings and the existing 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings). `git diff --check` passes.

This does not complete Wave 3. Component-catalog validation, global-section dependency analysis, Agent Wireframe generation, preview rendering, Style Guide, Design, responsive sheets, history/undo, and successful real-data browser capture remain explicit gates. The live Admin environment still returns gateway-level 502 for unrelated and Builder APIs, so success-state visual evidence is not fabricated.

## 29. Wave 3C registered component catalog and atomic composition evidence (2026-07-21)

Wave 3 now has one shared registered-component contract across Design Systems, Builder validation, and Admin authoring:

- the immutable packaged `arclayer-wireframe-v1` catalog has checksum `sha256:4e0ac533318237a2f30d526450e9a802af16712e1039836e2149b42bbacd93e2` and five localized official component contracts. One strict schema/registry/resolver owns component, variant, slot, responsive, interaction, style-slot, renderer, and compiler metadata;
- Design System recipes are strict typed records and foundation validator v2 evaluates exact catalog compatibility/checksum. Builder initialization requires that exact compatible evidence. Workspace and Project read APIs expose registered catalogs for authoring and revision-bound editing;
- Wireframe Preview and Apply both resolve and validate the exact catalog. Compatibility failures are stable blockers, and Apply cannot write a Content Version when any blocker remains;
- `wireframe.section.configure` atomically replaces a section's complete component contract. The Admin uses it to let users choose a new registered component and fill its required slots before Preview, eliminating the blocked intermediate candidate created by separate component/variant operations;
- local slot drafts parse field/literal values explicitly and never become canvas truth. The server candidate remains the only pre-apply projection, and successful Apply still creates one immutable Content Version and next Site Revision through the existing transaction boundary.

Focused evidence passes 24 backend tests, the real Workspace/Project catalog HTTP integration, and 4 Admin files / 16 tests. API lint, Admin lint, Admin/OpenAPI typechecks, and API typecheck (with only three known unrelated test diagnostics) pass. OpenAPI was regenerated through the supported generator.

Final cross-app `pnpm check` passes all 8 tasks from cache misses: API has 2191 passed, 435 integration-disabled skips, and 26 existing warnings; Admin has 317 files and 1413 tests passed.

This is not renderer or publication completion. Real shared visitor React components, catalog-backed rendering, compiler artifacts, Asset/font rights, publication readiness, Design System refresh ChangeSets, plugin catalogs, global-section dependency validation, Agent Wireframe generation, Style Guide/Design writes, server undo/redo, and successful real-data browser capture remain gated. Renderer/compile/publication compatibility remains `not_evaluated` and must not be represented as ready.

## 30. Wave 3 Style Guide immutable project-version authority (2026-07-21)

Wave 3 now has a canonical backend write boundary for project-specific Style Guide evolution:

- a Workspace-owned Design System must first be forked; only a project-owned lineage can be edited through the Project API;
- project version reads, immutable next-version creation, and foundation validation use exact public IDs, parent checksum, registered component catalog, idempotent command snapshots, tenant/project permission boundaries, and Activity events;
- validated project versions can be assigned explicitly and are captured by later Agent Run and Builder initialization snapshots;
- version creation and assignment deliberately do not rewrite an existing Site Revision or active release. The current editor revision therefore remains pinned until a separate `design-system.refresh` ChangeSet is previewed and applied.

The real PostgreSQL lifecycle covers immutable v2 creation, validation, replay/conflict/stale-parent behavior, workspace/cross-Project isolation, assignment, Agent context, Builder pinning, and audit order. Generated OpenAPI and focused static checks pass.

The immutable authority is now consumed by the Admin Style Guide flow recorded in section 32. Project version history, semantic compare/supersede, Agent concept generation, section-scheme and Asset/font review, Design renderer, preview build, compiler artifact, and publication readiness remain active Wave 3 work. This slice must not be presented as a rendered or publishable Design stage.

## 31. Wave 3 Design System refresh authority (2026-07-21)

The accepted Project Design System can now advance an existing Builder canvas without introducing floating state:

- `design-system.refresh` is an isolated, single-operation ChangeSet family with exact assignment/version/checksum/finding inputs and mandatory review approval;
- Preview and Apply independently validate the same assignment, immutable version, validator-v2 result, and registered catalog evidence;
- Apply creates the next Site Revision and changes only its Design System pin. Content Structure, page-version pins, presentation hashes, Project assignment, and active release remain unchanged;
- generated API clients preserve the discriminated operation and `design_system` affected target, while public summaries use public IDs rather than database UUID strings.

Five focused unit tests and the real Design System/Builder HTTP lifecycle pass. The remaining Wave 3 product work is project version history and semantic comparison/supersede, Agent concept generation, section schemes, Asset/font rights, real rendered preview, Design writes, compiler artifacts, and publication readiness.

## 32. Wave 3 Admin Style Guide server-candidate flow (2026-07-21)

The full-screen creation editor now closes the first Style Guide user loop over the immutable Design System and Builder refresh authorities:

- assignment reads resolve the exact Workspace-owned or Project-owned version. Workspace sources expose an explicit fork-then-assign command path with stable replay keys and remain immutable;
- project-owned authoring produces an immutable server candidate through the registered component-catalog version form. Validator v2 findings remain visible server evidence, and invalid candidates cannot be accepted;
- accepting a valid candidate updates only the Project assignment. The signature version track keeps the current canvas pin and candidate lineage distinct until `design-system.refresh` Preview, review approval, and Apply create the next Site Revision;
- Apply reconciles through the Builder aggregate rather than mutating local canvas state. Offline, read-only, missing/error, validation, drift, and approval states are explicit, and the version track adapts from a desktop side rail to a narrow-layout bottom track;
- typed API and Editor DOM seams pass 2 files / 12 focused tests, including exact stable fork/assign/version/validate/refresh keys and invalid-candidate blocking. Admin format, typecheck, and lint pass.

Full `admin:check` passes 4/4 tasks with 318 files / 1417 tests, and cross-app `pnpm check` passes all 8 tasks with the API at 2196 passed / 435 integration-disabled skips / 26 existing warnings. Changed-scope review remains `status=ok`, with zero enforcement-blocking findings and the existing 45 report-only findings rather than a false zero-findings claim.

This does not complete Wave 3. Project version history/list, semantic compare/supersede, Agent-generated concepts, Asset/font rights, section-scheme editing, real visitor rendering, catalog-backed rendered preview, Design writes, compile artifacts, publication readiness, global-section dependency validation, Agent Wireframe generation, server undo/redo, comments/history, and successful real-data browser capture remain gated.

## 33. Wave 3 Style Guide history and deterministic semantic comparison (2026-07-21)

The Project Style Guide now closes the immutable history/read-review loop while preserving the existing command boundaries:

- a newest-first cursor API pages project-owned versions and projects the latest validator evidence without changing the version table;
- an exact from/to comparison API produces a deterministic semantic diff and comparison hash from canonical manifest concerns. It excludes checksum and derived-index noise, performs no write, and requires no idempotency key;
- the full-screen Editor extends its version track with paginated lineage, external Workspace fork-baseline provenance, and distinct Canvas/Assigned/Review target markers;
- selecting an earlier version retrieves and renders the server diff, including stable concern/path/operation entries and exact before/after values. The browser does not calculate, persist, or reinterpret the semantic comparison;
- OpenAPI generation carries the new cursor and comparison resources into the typed Admin seam. Focused backend pure/real-HTTP tests and Admin API/DOM tests pass, along with API/Admin static checks.

Full verification passes `api:check` (2198 passed / 435 integration-disabled skips / 26 existing warnings), `admin:check` (318 files / 1420 tests), and cross-app `pnpm check` (8/8 tasks). Changed-scope review remains `status=ok` with zero enforcement-blocking findings and 45 unrelated report-only findings rather than a false zero-findings claim.

This advances Wave 3 history and review only. Supersede still requires a real lifecycle projection, migration, exact expected-state command, idempotency, Activity, assignment/latest-valid/canvas rules, PostgreSQL integration, and only then Admin controls. Agent concepts, Asset/font rights, section schemes, visitor rendering, Design writes, compile artifacts, publication readiness, global-section dependency analysis, Agent Wireframe generation, server undo/redo, comments, and successful real-data browser capture remain gated.

## 34. Wave 3 Style Guide lifecycle and supersession (2026-07-21)

Wave 3 now includes the governed retirement path for immutable Project Style Guide versions:

- immutable manifest versions are paired with a separate concurrency-controlled lifecycle projection; creation, validation, fork, Workspace default, and Project assignment paths maintain or enforce that projection rather than inferring operational state at read time;
- public migration `0049` and tenant migration v21 establish and backfill the projection. The version payload and retained Site Revision references are never rewritten;
- one Project-scoped supersession command requires exact target state/revision, exact system revision, and a higher validated replacement. It is idempotent, auditable, assignment-aware, cross-Project isolated, and recomputes the latest eligible valid version;
- history pages carry the system revision needed by the command. The full-screen Style Guide rail shows real lifecycle and replacement evidence, exposes the action only when the target is neither assigned nor canvas-pinned, and confirms that historical revisions remain readable;
- successful supersession changes no Project assignment, Site Revision, canvas, or active release. The Admin invalidates Design System queries only and does not fabricate downstream impact or compatibility.

This closes immutable history, deterministic semantic comparison, and explicit supersession as one Style Guide governance loop. It does not complete Wave 3: Agent concept generation, Asset/font-rights evidence, section schemes, renderer/preview/compiler authorities, Design writes, publication readiness, global-section dependency analysis, Agent Wireframe generation, server undo/redo, comments, and successful real-data visual capture remain gated.

The lifecycle slice passes the real PostgreSQL HTTP and tenant migration evidence, generated OpenAPI typecheck, full `api:check` (4/4 tasks; 2198 passed / 435 integration-disabled skips / 26 existing warnings), full `admin:check` (4/4 tasks; 318 files / 1420 tests), and cross-app `pnpm check` (8/8 tasks). Seven Admin timeouts and four worker-start failures from the first full run were isolated as resource starvation only after every affected file passed independently and the complete suite reran green without timeout or fallback changes. Changed-scope review reports `status=ok`, zero enforcement-blocking findings, and 45 report-only findings outside this lifecycle slice; `git diff --check` passes. GitNexus maps the entire long-lived dirty worktree as critical because it spans 177 indexed changed files and 27 affected processes, so that stale whole-worktree signal is retained as aggregate context rather than misrepresented as a supersession defect.

Authenticated visual validation reached the exact full-screen Editor document at 3840×2160, but the Workspace, Project, Builder, authorization/actions, and Agent requests all returned 502. The stable product boundary is captured at `reports/creation-editor-style-supersession-api-502-2026-07-21.png`; no successful Style Guide interaction or visual-mode claim is made from that environment response.

## 35. Wave 3 Style Guide downstream impact preview (2026-07-21)

Wave 3 now extends exact version review with bounded downstream semantic
evidence while preserving all write authorities:

- one read-only Project impact-preview resource binds exact immutable
  source/target versions, their checksums, lifecycle evidence, the current
  assignment, retained source-version Site Revision count, and the latest
  default-preview canvas when it is pinned to the source;
- semantic token alias/replacement propagation reaches component recipes and
  exact Wireframe sections. Removed in-use recipes are blockers; added/changed
  recipes and reachable token changes are warnings. Individual evidence entries
  are retained while affected page/section totals are de-duplicated by actual
  canvas targets;
- historical Site Revisions remain immutable and are represented by an exact
  bounded count. The API does not enumerate an unbounded history or mutate the
  Project assignment, current canvas, Site Revision, lifecycle, or release;
- the Admin requests semantic comparison and downstream impact independently
  for the same selection and renders server evidence, explicit unknowns, and
  unmapped diffs instead of deriving a browser-side safety verdict;
- assignment, source-version Site Revision counts, and current default-preview
  Wireframe mapping are evaluated. Asset authorization remains manifest-only,
  while active release, renderer, and compiler artifacts remain not evaluated.

Three pure analyzer tests, the real PostgreSQL HTTP lifecycle, and 2 Admin files
/ 15 focused tests pass. This is a semantic review aid, not a complete breaking
impact engine, renderer/compile check, Asset/font authorization, Design write,
or publication-readiness authority. Those capabilities remain gated in Wave 3
before the rollout can advance to Wave 4.

Final quality gates pass: `api:check` 4/4 with 2201 tests passed, 436
integration-disabled skips, and 26 existing warnings; `admin:check` 4/4 with
318 files / 1420 tests; generated OpenAPI typecheck; and cross-app `pnpm check`
8/8.

Changed-scope review is `status=ok`, with zero enforcement-blocking findings,
45 unrelated report-only findings, and no impact-preview/Style Guide finding;
`git diff --check` passes. Live same-origin APIs recovered to 200, but the
specified Project remains source-managed and therefore exposes the explicit
Builder-migration boundary rather than a fabricated impact-review success
state. That state is captured at
`reports/creation-editor-impact-migration-required-2026-07-21.png`.

## 36. Wave 3F section-intent authority self-review (2026-07-21)

Live-source review found that the approved four-stage model had no canonical
Sitemap section-intent persistence yet: `ContentStructureSnapshotV1` carried
pages and routes, while `WireframeSectionV1.intentId` accepted an isolated
string. Activating Agent Wireframe generation at that boundary would force the
model to invent the very identity that the Wireframe is required to trace.

Wave 3F therefore precedes Agent Wireframe generation and establishes:

- optional, hash-preserving page purpose and ordered typed section intents in
  the immutable Content Structure Revision;
- `page.create` planning inputs and one complete `page.intent.replace` Sitemap
  operation through the existing Preview/Apply protocol;
- server-side protection against removing in-use intents and against applying a
  Wireframe candidate with unknown intent references;
- a revision-bound traceability projection that distinguishes unplanned,
  not-started, partial, aligned, and historical-orphaned evidence;
- an explicit review path for adopting historical Wireframe IDs instead of a
  migration fallback or browser-side inferred success.

This ordering is a self-review correction, not a new product branch. It keeps
the mandatory Wave 3 scope and makes the subsequent `builder.wireframe.generate`
Job and assistant-ui Tool consume real Sitemap authority. Wave 4 remains gated.

## 37. Wave 3G Wireframe generation authority self-review (2026-07-22)

Live-source review found that the original Sitemap generation client created an
invisible Thread and revision-bound Run before it could start a generation,
while the newer Style Guide flow already supported two honest entry modes:
direct Stage selection by Agent ID and an existing Run-backed conversation
Tool. Wireframe adopts the latter pattern and does not copy the hidden
conversation debt.

The approved platform boundary is:

1. the Editor sends an exact `agentId`, page ID, revision/ETag, and objective;
2. a conversation sends an exact `agentRunId` only after the durable
   `builder.wireframe.generate` approval interrupt is accepted;
3. one backend service resolves and snapshots either authority, then creates the
   same stage-specific durable generation command;
4. the Job reads exact canonical intents, current Wireframe evidence, and the
   pinned component catalog as untrusted data and requests one typed candidate;
5. the server-owned ChangeSet analyzer produces blockers, warnings, approval,
   provenance, and replay evidence;
6. the Editor or Tool UI renders persisted status. Only an explicit later Apply
   may create a new immutable Content Version and Site Revision.

This design deliberately adds direct Agent provenance to generated ChangeSets
instead of mislabelling them as human or minting a synthetic Run. It also keeps
Sitemap and Wireframe Job identities distinct, makes recovery server-owned, and
uses the same idempotency/cancellation/fencing rules across both entry points.
The assistant-ui integration remains a current `"use generative"` /
`defineToolkit` backend renderer registered through the shared provider; the
deprecated `makeAssistantToolUI` family is not reintroduced.

### 37.1 Wave 3G verification evidence

The backend Wireframe/Agent/migration target passes 43 tests and the Admin
Stage/Tool/deep-link target passes 5 files / 51 tests. Full gates pass with
`api:check` 4/4 (2285 passed, 438 integration-disabled skips), Admin 4/4 (321
files / 1455 tests), and cross-app `pnpm check` 8/8. Changed-scope review is
`status=ok` with zero enforcement-blocking findings and no Wireframe-generation
path finding; `git diff --check` passes.

Live verification also exposed and closed two integration-only presentation
edges before the slice was accepted: compact 22-character `PublicUUID` query
values now retain the project validator in FastAPI recovery routing, and the
Wireframe Inspector locally overrides the Radix ScrollArea measurement wrapper
that otherwise clipped content at a 1024px viewport. The exact recovery request
returns 200, desktop and narrow evidence contain no error toast or console
error, and the narrow DOM has no right-edge overflow while retaining a 44px
primary control and real vertical scrolling.

No model generation, candidate Apply, Project migration, or publication was
performed to produce this evidence. The QA Project remains unpublished and the
user-specified source-managed Project remains on its explicit migration gate.

## 38. Wave 3H global-section authority self-review (2026-07-22)

Live-source review found three incompatible partial truths: Builder snapshots
had an untyped `globalReferences` placeholder, Wireframe sections accepted a
`PublicUUID` without a catalog or version pin, and legacy Site Settings stored
arbitrary string IDs for delivery aliases. Reusing the legacy JSON would make
Agent output impossible to validate against an immutable Site Revision and
would create a dual-write authority.

The approved platform boundary is therefore:

1. canonical `reusable-section` Content Items remain the only reusable-content
   storage;
2. the Content Structure Revision records typed global-section nodes and their
   independent planning identities;
3. the Site Revision pins every exact reusable Content Version and presentation
   hash alongside page pins;
4. all manifest-pinned Wireframes project one server dependency graph with
   unknown, missing-target, incoming-impact, self-cycle, and multi-node-cycle
   evidence;
5. planning and set/clear reference writes enter the existing typed
   Preview/approval/Apply transaction and never mutate local canvas state;
6. legacy Settings delivery remains isolated to source-managed behavior until
   visitor rendering and release migration have their own proved hard cut.

This ordering is required before coordinated multi-page Agent generation. It
prevents an Agent from duplicating a shared Header/Footer on each page,
inventing reusable-section versions, or creating an implicit global cycle. The
persisted Wireframe v1 `pageItemId` name remains unchanged but is explicitly
interpreted as the host Content Item ID; renaming it without a full data
migration was rejected.

## 39. Wave 3I coordinated composition self-review (2026-07-22)

Live-source review found that the durable generation, fencing, candidate
Preview, cancellation, and atomic multi-operation Apply foundations already
exist, but the Wireframe request and snapshot still encode exactly one page in
`selectedPageIds` and `wireframeContext`. Repeating that Job per page would
lose site-wide coherence, duplicate shared Header/Footer decisions, expose
partially accepted page state, and make recovery a browser-owned workflow.

The approved platform boundary is therefore:

1. replace the single-page field with ordered typed page/global-section
   targets as one canonical public and persisted contract;
2. resolve every target and the global dependency graph under one exact Site
   Revision, then persist the complete untrusted coordinated context before the
   Job is published;
3. request one typed candidate per alternative, validate every operation
   against its own host plan/version and require complete target coverage;
4. persist only a complete server Preview containing one Wireframe-family
   ChangeSet across all selected hosts;
5. retain one explicit approval/Apply transaction and one resulting Site
   Revision, with no per-page auto-apply or partial write;
6. represent missing-plan recovery later as a durable planning-to-composition
   saga with two visible revision/review gates, never as a mixed-family
   ChangeSet.

Direct Agent selection and approved conversation Tools continue to converge on
the same generation service. Direct use does not mint a hidden Run; Run-backed
use does not create a replacement Run. The browser renders persisted targets,
progress, failures, Preview evidence, and Apply state, but it does not assemble
operations, calculate dependency validity, or claim renderer/publication
success.

This self-review also rejects retaining `selectedPageIds` as an alias, adding a
second multi-page candidate store, splitting one candidate into independently
applicable page fragments, and using model output as a global-section version
selector. Wave 3I must prove the protocol, execution, recovery, Admin
workbench, saga, and full quality gates before Wave 3 advances to delivery,
Design, compiler, or publication authority.

### 39.1 Durable planning-to-composition saga decision

The explicit missing-plan recovery is a parent `BuilderCompositionSaga`, not a
new mode on direct Wireframe generation and not a browser workflow. It owns two
distinct child generations and the verified Revision chain between them:

```text
initial Revision
  -> planning child -> planning ChangeSet -> explicit Apply
  -> planning result Revision
  -> composition child -> Wireframe ChangeSet -> explicit Apply
  -> composition result Revision
```

The parent is created, read, recovered, phase-transitioned, and cancelled as a
durable resource. Its transition command proves a selected child ChangeSet is
already applied and binds the exact resulting Site Revision before advancing.
It never applies a candidate itself. Planning output is restricted to complete
intent replacement for the exact unplanned subset; composition retains the
complete ordered requested tuple. The parent persists child IDs, states,
waiting reasons, revision evidence, and terminal errors so refresh, disconnect,
worker loss, or a lost transition response cannot turn the browser into the
orchestrator.

Self-review rejected four alternatives: extending one generation record across
two Jobs, because its single Job/candidate/base-Revision identity would become
ambiguous; using one mixed ChangeSet, because Apply must expose the Revision
boundary; auto-resuming from an unverified HTTP response, because Apply replay
evidence is canonical; and silently invoking Sitemap generation from the
Wireframe endpoint, because that changes scope and review semantics. Direct
Wireframe generation therefore keeps its strict unplanned-target conflict,
while the dedicated Saga is the only Plan-first entry.

## 40. Wave 3J global-section lifecycle self-review (2026-07-22)

Live-source review confirmed that canonical reusable Content Items, typed
Structure nodes, exact Site Revision pins, dependency analysis, and
caller-owned Content transactions already exist. The missing capability is not
another global-section service; it is a reviewed lifecycle entry into those
authorities. Reusing Site Settings JSON, direct Content Library deletion, or a
browser-maintained catalog would restore the dual truth rejected in Wave 3H.

The approved platform boundary is therefore:

1. add only `global_section.create` and `global_section.delete` to the closed
   Sitemap ChangeSet union;
2. fix creation to the official `reusable-section` Content Model server-side,
   with no model/role/version authority in browser or Agent payloads;
3. require exact target/version identity for deletion and return the complete
   server dependency graph in Preview;
4. block any referenced target, require destructive approval for an
   unreferenced target, and never auto-clear Wireframe references;
5. execute canonical Content create/delete and next-Revision projection in one
   tenant transaction, then expose exact client-ID and pin evidence;
6. reconcile Admin state only from the returned/reloaded Site Revision and keep
   legacy delivery isolated until its explicit hard cut.

Self-review rejects a standalone CRUD endpoint, legacy dual-write, caller model
selection, implicit replacement, force-delete approval, and optimistic local
catalog mutation. The lifecycle must be proved before visitor rendering so the
renderer can depend on a complete, revision-pinned shared-section catalog
rather than an undeletable or ambiguously owned partial model.

## 41. Wave 3K revision-pinned renderer self-review (2026-07-22)

Live-source review found that the immutable Site Revision already pins the
Content Structure, page and shared-section Content Versions, presentation and
binding hashes, and one exact Design System version. The official component
catalog also declares a versioned renderer profile. What was missing was a
strict projection from those inputs into one renderer document; the legacy
public-host path instead guessed copy from unrelated props and could turn route
or binding failures into a successful connected-site placeholder.

The approved first renderer boundary is therefore:

1. expose one read-only page resource under the exact Site Revision, with an
   explicit locale and Design System theme selection;
2. revalidate the manifest and Content Structure hashes, exact page and global
   Content Version pins, aggregate presentation and binding hashes, Design
   System manifest checksum, immutable catalog version/checksum, and renderer
   profile/version before projecting output;
3. resolve slots only from the pinned Content Version `fieldsSnapshot` or an
   explicit literal binding. Missing bindings, absent fields, unsupported
   value shapes, unregistered components/variants/slots, and invalid
   responsive or interaction contracts are blockers, never generated copy;
4. treat a `globalReferenceId` section as a structural reference, recursively
   replace it with the target's pinned Wireframe sections, and preserve the
   complete host/target reference path plus original item/section identity.
   Unknown targets, missing target Wireframes, and cycles fail explicitly;
5. resolve the selected Design System theme, typography, motion, semantic
   tokens, and validated component recipes into typed values. The official
   renderer profile owns stable base layout rules; exact recipes are an
   override layer, not an optional runtime fallback;
6. return SEO metadata from the exact page Content Version and a deterministic
   document hash over the normalized result. Evidence marks renderer input,
   binding, catalog, and Design System interpretation as passed while Asset and
   font rights, compiler output, smoke checks, and publication remain
   `not_evaluated`;
7. render the document in Admin through shared React visitor components. Do not
   use `dangerouslySetInnerHTML`, model-generated markup, or
   `renderToStaticMarkup` as a substitute for an interactive visitor runtime;
8. keep production SSR/compiler work behind a separate build contract with
   client and server bundles. A successful Admin Preview does not mutate
   Design System foundation validation, Site Revision status, a release, or a
   deployment;
9. move the never-published root response into a versioned prelaunch template.
   Only a bound site with no active release at `/` receives `200`; every other
   missing route remains `404`. Both responses are `no-store` and `noindex`,
   and published binding failures surface as failures instead of prelaunch;
10. activate the Editor Preview control only when a revision and selected page
    exist. The workbench exposes viewport, theme, locale, Revision, and
    document evidence; loading, error, offline, empty, and read-only states stay
    explicit.

The product direction is **precision-tool minimalism** (DFII 13/15). Its
recognizable anchor is the real visitor page suspended over a quiet dark
browser workbench, with no decorative dashboard chrome. Arclayer's platform
font, neutral surfaces, action blue, focus system, and reduced-motion contract
override generic aesthetic defaults.

Self-review rejects five shortcuts: rendering current mutable drafts instead of
the requested Revision, accepting arbitrary JSON/HTML slot values, silently
omitting broken shared sections, marking foundation validation as renderer- or
publish-ready, and using the prelaunch page for a published delivery failure.
Wave 3K proves deterministic Preview readiness only. Asset/font authorization,
hydrated production SSR bundles, compiler artifacts, route-level smoke checks,
release activation, thumbnail capture, Design writes, comments, and server
undo/redo remain gated.

## 42. Wave 3L Design authoring self-review (2026-07-22)

Live-source review found three existing authorities that Design must compose
rather than duplicate: Wireframe owns section order, component/variant identity,
content bindings, structural responsive rules, and interaction semantics; the
pinned Design System owns tokens and component recipes; exact Content Versions
own copy and data. The legacy `VISUAL_BLUEPRINT` kind exists, but Builder has no
closed schema, reviewed mutation path, or Editor scene for it. Treating canvas
state or the legacy permissive node graph as Builder truth would reintroduce the
dual-authority problem rejected by the platform contract.

The approved Wave 3L boundary is therefore:

1. define one frozen `VisualBlueprintDocumentV1` per exact page or reusable-
   section Content Version. The containing Presentation record supplies the
   Content Version identity; the payload pins the host item, source Wireframe
   checksum, Design System version/checksum, and component catalog
   version/checksum without duplicating that foreign key;
2. keep section identity one-to-one with the source Wireframe. Design may set
   catalog-declared style slots for named component states, responsive visual
   overrides, typed asset presentation, page SEO, and review evidence. It may
   not add/reorder sections, change component/variant identity, rewrite content
   bindings, or invent interaction targets;
3. admit only a closed `design.*` ChangeSet family. Preview normalizes values,
   validates every pin and style-slot value type, returns full before/after
   candidates plus blockers/warnings, and requires review for Agent-authored
   changes. Apply uses the signed Preview token and creates complete immutable
   Content Versions and one next Site Revision in the existing tenant
   transaction;
4. require exact Content Version, Wireframe checksum, Site Revision/ETag,
   Design System manifest checksum, and catalog checksum at Preview and Apply.
   Any drift returns `SITE_REVISION_STALE` or a stable Design contract conflict;
   there is no silent rebase;
5. make the revision-pinned renderer select a valid Visual Blueprint when one
   exists. It verifies the Blueprint pins and overlays only its typed visual
   values on the matching Wireframe section. If no Blueprint exists, the
   renderer continues to expose the explicit Wireframe preview mode used by
   Wave 3K; it must identify that source as `wireframe_preview` and must never
   call it Design- or publication-ready;
6. keep asset authorization, font rights, automated accessibility execution,
   compiler output, route smoke checks, release activation, and thumbnail
   capture as explicit downstream evidence. A Design Apply does not mark any of
   them passed;
7. activate the Editor Design stage only against an exact selected page and
   Revision. The scene shows the real visitor renderer, section/layer rail,
   state and viewport controls, constrained property inspector, review panel,
   revision evidence, and explicit read-only/loading/empty/error/offline/
   conflict states;
8. reconcile UI only from the returned/reloaded Site Revision. Local form
   drafts and hover/selection state are ephemeral and cannot become the saved
   Blueprint.

The self-review rejects five shortcuts: copying the Wireframe into a second
editable structure, accepting arbitrary CSS/JSON patches, mutating a Design
System recipe for a page-specific choice, rendering an unpinned latest draft,
and enabling Publish because a visual Preview succeeds. Wave 3L establishes
reviewed Design authority; AI Design generation, asset-rights completion,
compiler artifacts, publication, comments, and server undo/redo remain
separate gated capabilities.

### 42.1 Verification and self-approval

Wave 3L is approved as a complete typed Design-authoring vertical. Backend
evidence covers stable catalog token projection, alias resolution, explicit
cycle/default-theme failure, closed Design operations, immutable Content
Version/Site Revision writes, and fail-closed renderer selection. Admin
evidence covers capability gating, pages/layers, constrained state/slot/token
editing, canonical-versus-candidate separation, signed Preview Apply,
read-only/offline/error states, and reconciliation from the returned Builder
aggregate.

Verification on 2026-07-22 passes the 44-test Editor suite, 6-test shared
SiteRenderer suite, 3-test catalog token projection suite,
`pnpm admin:check` (339 files / 1570 tests), `pnpm api:check` (2465 passed / 443
integration-disabled skips), and `pnpm check` (8/8 tasks). React Doctor exits
successfully and reports 116 existing changed-worktree warnings outside the
Wave 3L Design stage/inspector/renderer implementation. Changed-scope review
has zero enforcement-blocking findings and retains 74 report-only prototype
findings (55 `BLOCKER`, 13 `MAJOR`, and 6 `MINOR`) rather than representing the
worktree as clean. GitNexus impact and change detection
remain unavailable because the service returns `Transport closed`, so graph
risk is recorded as unknown rather than inferred.

This self-approval closes Wave 3L only. The requested-capability matrix in
section 19.1 and the overall goal remain active.

## 43. Wave 3M AI Design generation self-review (2026-07-22)

Live-source review found that Wave 3L already owns the complete Design write
authority, while the durable Builder generation pipeline already owns Agent
resolution, revision-bound snapshots, provider isolation, candidate Preview,
fencing, recovery, cancellation, and partial failure. Creating a separate
“AI canvas” or asking a model for a Visual Blueprint document would duplicate
both authorities and make the browser responsible for deciding whether model
output is safe to save.

The approved Wave 3M boundary is therefore:

1. extend the existing generation resource with a distinct `design` Job
   identity and persisted `designContext`, rather than overloading the
   Wireframe `compositionContext`;
2. freeze exact page/version/Wireframe/Blueprint, Design System, and component
   catalog inputs in the creation transaction before Job publication;
3. accept only forced structured Tool output from the closed Wave 3L
   `design.*` operation family and require complete selected-target coverage;
4. project every candidate through the canonical ChangeSet Preview service,
   with Agent provenance, approval, signed token, and replay evidence;
5. keep candidates visibly non-canonical in both the Design canvas and
   assistant-ui Tool surface; Apply remains a separate explicit command;
6. reconcile success only from the returned/reloaded immutable Site Revision;
7. preserve direct Agent selection and Run-backed conversation entry without
   hidden Threads, replacement Runs, automatic approval, or automatic Apply.

Self-review rejects seven shortcuts: generating Blueprint JSON directly,
returning CSS or HTML, using current mutable state at worker execution time,
reusing `compositionContext` for semantically different Design evidence,
persisting candidates as canonical presentations, treating Tool approval as
candidate approval, and falling back to Wireframe rendering when a candidate
Blueprint is invalid.

This design is self-approved for implementation because it composes existing
authorities without adding a second write path, keeps every model decision
inside a typed and replayable review boundary, and preserves durable recovery
semantics. Asset/font rights, automated accessibility execution, compiler
artifacts, release activation, thumbnails, comments, and server undo/redo
remain outside this Wave.

### 43.1 Wave 3M implementation evidence

The approved Wave 3M boundary is implemented on the existing Builder generation
aggregate rather than a parallel AI canvas:

- `builder.design.generate` has its own durable Job identity, queue task,
  migration-backed persistence, handler, provider, recovery, cancellation, and
  partial-candidate projection;
- creation persists the exact revision-pinned `designContext`, including target
  Content Version, Wireframe, current Blueprint, Design System, and component
  catalog evidence before the Job is published;
- the provider accepts only the forced `submit_builder_design_candidate` Tool
  and the closed `design.*` operation family, then sends each candidate through
  canonical ChangeSet Preview rather than persisting model output directly;
- the assistant-ui `builder.design.generate` Tool uses an explicit approval
  interrupt, while the Design Inspector uses the same generation resource for
  direct Agent selection, persisted status, recovery, review, cancel, discard,
  and explicit Apply;
- candidate selection never changes canonical saved-state language. Only the
  existing signed ChangeSet Apply and returned immutable Site Revision reconcile
  the Design canvas.

Fresh focused verification on 2026-07-22 passes 24 backend Design-generation
tests across the runtime gateway, runtime Tool, Job contract, provider, handler,
and service, plus 74 Admin tests across the assistant-ui Tool contract/toolkit
and full Editor page. This accepts the Wave 3M implementation boundary. It does
not claim the out-of-scope compiler, release, asset/font-rights, automated
accessibility, thumbnail, comments, or server undo/redo capabilities.

## 44. Wave 4 AI-native content proposal and approval vertical (2026-07-22)

Live-source review found two incompatible content-writing paths. Content items
already had a safe `/content-draft-proposals` endpoint but no production editor
mount, while the mounted Content Model assistant still invoked the legacy
Workspace action and represented a direct write as success. The approval queue
implemented modify, reject, approve, apply, and target invalidation, but was not
mounted in any production surface.

Wave 4 hard-cuts that split behavior to one review-first vertical:

1. the Content Library article editor passes its explicit Project and item
   identity to the content-writer proposal card; URL parsing is not an authority
   and split/list routes cannot silently retarget the request;
2. the Content Model surface calls the canonical
   `/content-model-draft-proposals` endpoint with the selected model and
   reasoning policy; it no longer treats `workspace_update_content_model` as a
   completed edit;
3. both surfaces require the enabled official `content.writer` or
   `content.modeler` Skill and preserve the backend permission boundary;
4. proposal success means `pending approval` only. The UI exposes the approval
   ID, and Content Model proposals expose affected, recovery, reshape, and
   blocking evidence returned by the canonical impact preview;
5. proposal creation invalidates the shared actionable-approval query. The
   assistant-ui sidebar mounts that queue above the composer so users can
   modify, reject, approve, and explicitly apply without a second browser-owned
   mutation path;
6. successful Apply retains the existing target-specific invalidation for
   Content Models, Content Library items, item detail, and version history.

The product surface follows the existing quiet operational language: neutral
cards, one Action Blue submit, explicit pending state, functional destructive
color only for blockers, keyboard-native controls, live-region result status,
and bilingual `zh-CN` / `en-US` copy. No card claims that content was updated
before approval and Apply complete.

Focused verification passes 5 Admin files / 57 tests, Admin typecheck, lint,
and formatting outside the concurrently edited `system/audit-log/**` tree.
React Doctor remains 61/100 with zero errors and 215 changed-branch warnings;
the proposal cards and editor rail have no reported diagnostic, while an
existing async-effect warning remains in the touched drawer. Changed-scope
review reports 32 report-only findings, all in concurrent Observability/Charts
work rather than this vertical. GitNexus impact and change detection remain
unavailable with `Transport closed`, so graph risk is recorded as unknown.

This closes the first Wave 4 AI-native content proposal/approval/apply slice,
not Wave 4 as a whole. Bulk content orchestration, final Library/Model UX
convergence, Website Config, Project General, and first-publish product-state
acceptance remain active.

## 45. Wave 4 Website Config visitor-preview vertical (2026-07-22)

Live-source review confirmed that Website Config already persisted the real
visitor identity, localized copy, browser assets, title policy, indexing,
sitemap, and contact metadata, but exposed them through one 900-line mixed
component. Only discovery had a preview; identity edits had no immediate public
context, title-policy controls remained locally editable in read-only mode, and
the sticky page-header measurement could lock narrow layouts behind hundreds of
pixels of empty height.

This Wave 4 vertical makes six hard cuts:

1. Website Config retains one real form and existing patch authority while
   Identity, Browser/Discovery, and Localization remain explicit workspaces;
2. Identity and discovery share one live visitor-preview rail driven directly
   from unsaved form state, while copy states clearly that Save is required;
3. wide layouts keep a sticky preview beside the setting axis, and narrow
   layouts stack without a hidden alternate control or horizontal overflow;
4. browser title, search result, share card, assets, indexing, public address,
   and contact state all use actual persisted fields rather than placeholder
   capabilities;
5. read-only mode disables the full title-policy surface and shared switches
   expose real accessible names;
6. sticky-header measurement is output-only. The measured CSS variable may
   position dependent sticky rails but cannot feed back into the measured
   header's own minimum height.

The rollout does not duplicate Domains, Design Systems, or Project General. It
also does not introduce AI buttons without an implemented approval-backed Tool,
does not treat unsaved preview as published state, and does not claim that the
legacy broad settings patch is the final typed facade.

Fresh verification passes the 20-test focused Website Config/page-shell suite,
Admin typecheck, zero-finding changed-scope repository review, and the complete
`pnpm admin:check` gate with 343 test files / 1591 tests. Real browser acceptance
at 1440px and a 500px narrow viewport proves live value propagation, stable
two-column/stacked layouts, named switches, zero horizontal overflow, and the
sticky-header correction from an erroneous 711px lock to its 183px natural
height. React Doctor remains 56/100 for the accumulated branch delta and reports
no finding in this vertical.

This accepts the Website Config frontend field/preview and responsive UX slice.
The capability remains `In progress` until typed website/SEO/localization
facades, optimistic concurrency, Activity evidence, and the Domains-owned
resolved primary address replace the remaining broad-patch/manual-URL boundary.
