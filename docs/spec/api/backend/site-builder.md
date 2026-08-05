# Site Builder Backend Contracts

This code-spec defines the canonical backend ownership, persistence, command, revision, preview, and publish contracts for the Arclayer creation editor.

It implements the Builder portion of `docs/spec/shared/ai-website-builder-platform.md`. Existing content, route, hierarchy, presentation, component-binding, release, publish, delivery, Asset, and Activity contracts remain authoritative where this document composes them.

## 1. Scope and trigger

Read this spec before changing:

- `apps/api/src/modules/projects/builder/**`.
- page content, route, hierarchy, presentation, or component-binding behavior used by the Builder.
- Site Revision, ChangeSet, Builder generation, preview artifact, or authoring-mode persistence.
- `/projects/{projectId}/builder/**` Product API routes.
- source-to-Builder or Builder-to-source migration behavior.
- release/build activation used by Builder-managed sites.

This spec does not create a second CMS, source editor, deployment service, or visitor-delivery API.

## 2. Binding vocabulary

| Term | Contract |
| --- | --- |
| `ProjectAuthoringMode` | Project-wide composition authority: `builder_managed` or `source_managed`. |
| `ContentStructureRevision` | Immutable Content-domain snapshot of page IDs, locale paths, hierarchy, ordering, navigation relationships, and global references for one site/environment. |
| `BuilderPlanningDocument` | Immutable Site Brief or Section Intent input. It contains planning intent, not visitor-facing content. |
| `SiteRevisionManifest` | Immutable hashable manifest that pins every Builder authoring input. |
| `SiteRevisionStatus` | Concurrency-controlled readiness/review projection outside the manifest hash. |
| `ChangeSet` | Typed, previewed set of proposed mutations against an exact base manifest/ETag. |
| `BuilderGeneration` | Durable background Job that produces candidate planning documents, presentations, assets, or ChangeSets. |
| `SitePreviewArtifact` | External render/capture result referencing a manifest; never a field mutated into that manifest. |
| Candidate release | Inactive canonical Content Release pinned to a Site Revision manifest and awaiting build/readiness checks. |

## 3. Authoring authority

`ProjectAuthoringMode` is required and project-wide.

### 3.1 `builder_managed`

Canonical page composition is:

```text
ContentStructureRevision
+ ContentVersion records
+ PresentationDocument records
+ ComponentBinding records
+ DesignSystemVersion
+ BuilderPlanningDocument records
```

- source files, build outputs, preview bundles, and release artifacts are deterministic derivatives.
- source-write Tools and direct source mutation endpoints are unavailable for page composition.
- a generated derivative cannot be read back as an implicit Builder mutation.

### 3.2 `source_managed`

- project source owns page composition.
- CMS content may remain a bound data source.
- Builder reads may expose compatibility/inspection data, but no visual command may claim a successful source round trip.
- Site Revision creation is unavailable until an explicit migration succeeds.

### 3.3 Mode migration

Changing authoring mode is an approval-gated durable Job with:

- exact source and target modes.
- base project/settings ETag.
- compatibility and unsupported-feature report.
- affected content, routes, assets, deployments, and source paths.
- reversible boundary and rollback artifact.
- idempotency key and actor/Agent provenance.

Mixed per-page composition authority is forbidden. Ambiguous existing projects use `migration_required`; the service never infers a mode merely to unblock the editor.

## 4. Stage persistence mapping

| Stage | Canonical persistence |
| --- | --- |
| Sitemap | Page `ContentItemRecord` identities plus `ContentStructureRevision`; Site Brief and Section Intent live in immutable Builder planning documents. |
| Wireframe | `ContentPresentationKind.WIREFRAME` attached to an exact `ContentVersionRecord`. |
| Style Guide | Pinned immutable `DesignSystemVersion`. |
| Design | Existing `VISUAL_BLUEPRINT`, `SLOT_MAPPING`, `SEO`, and `ComponentBindingRecord` values attached to the same exact Content Version. |

The new `WIREFRAME` kind is added through the generated migration/OpenAPI workflow and the applicable content-model presentation policies. It is not treated as publishable final design.

Every Wireframe and Visual Blueprint payload declares:

- payload schema version.
- component-catalog version.
- pinned Design System version.
- referenced asset public IDs.
- responsive rules.
- interaction rules.
- content-slot/binding references.

Changing page composition creates a new immutable Content Version with its complete presentation and component-binding set in one tenant transaction. Existing versions are never edited in place.

## 5. Content Structure Revision

The Content domain owns `ContentStructureRevision`; Builder only requests it through a command service.

Required immutable data:

- public ID, workspace/site/environment IDs, locale set, and monotonic revision number.
- parent revision ID for non-root revisions.
- ordered page item IDs, parent relationships, page groups, and navigation relationships.
- locale/path/active state per route binding.
- global/reusable-section references.
- stable structure hash and source command/correlation IDs.
- actor and creation timestamp.

The route and hierarchy services remain the mutation owners. One structure command:

1. locks/validates the expected current structure revision.
2. validates item/site/environment/locale ownership and route uniqueness.
3. applies route and hierarchy changes in the tenant transaction.
4. creates the immutable `ContentStructureRevision` snapshot.
5. returns typed before/after outcomes for the next Site Revision manifest.

There is no public API that edits structure-revision JSON directly.

## 6. Site Revision Manifest and status

### 6.1 Immutable manifest

`SiteRevisionManifest` contains only inputs available at creation:

- public ID, workspace/project/site/environment IDs.
- project authoring mode.
- monotonic revision number and base manifest ID except for the root.
- Site Brief and Section Intent document IDs/hashes.
- Content Structure Revision ID/hash.
- exact page Content Version IDs.
- presentation/component-binding set hashes.
- Design System version ID/hash.
- asset-input descriptors.
- manifest schema version and stable manifest hash/ETag.
- human/Agent/import/system provenance and correlation ID.
- creation timestamp.

It never contains:

- mutable readiness/review state.
- generation/build/deployment status.
- preview or thumbnail artifact ID.
- active/candidate release ID.
- resulting source/build artifact.

### 6.2 External projections

`SiteRevisionStatus` stores readiness and review projection with its own ETag:

- `draft | review | ready | superseded`.
- validation findings grouped by content, binding, design, accessibility, domain, and build.
- review/approval references.
- calculated timestamp and validator version.

`published` is derived only from the active canonical release. `SiteRevisionReleaseLink`, `SitePreviewArtifact`, Jobs, and deployments reference the manifest from outside its hash.

## 7. ChangeSet contract

Every human or AI write is expressed as a typed operation union. Initial operation families are:

- `page.create`, `page.rename`, `page.move`, `page.reorder`, `page.delete`.
- `route.set`, `route.disable`.
- `section.create`, `section.update_intent`, `section.move`, `section.delete`.
- `wireframe.set_component`, `wireframe.set_variant`, `wireframe.reorder`, `wireframe.set_slot`.
- `design.set_property`, `design.set_responsive_rule`, `design.set_interaction`, `design.bind_content`.
- `design_system.assign`, `design_system.fork`.
- `asset.assign`, `asset.set_focal_point`, `asset.set_alt_text`.

Opaque public JSON Patch and model-authored arbitrary storage payloads are forbidden.

### 7.1 Preview

Preview accepts:

- exact `baseRevisionId` and ETag.
- operation union.
- idempotency key.
- actor/Agent/run/tool provenance.

It returns:

- persisted ChangeSet ID and status.
- normalized operations.
- affected content/routes/presentations/global references/releases.
- warnings, blockers, required permissions, and approval class.
- structural/text/visual preview references where supported.
- signed `previewToken`, base ETag, expiry, and localized summary keys.

Preview performs no target-domain mutation.

### 7.2 Apply

Apply requires:

- the persisted ChangeSet ID.
- fresh signed preview token.
- matching base revision/ETag.
- `Idempotency-Key`.
- approval checkpoint where required.

Apply revalidates authorization, entitlement, Tool grants, target ownership, preview freshness, and current revision under lock. It invokes canonical Content/Design System/Asset services and creates the next Site Revision manifest. A stale base fails with a stable conflict and never silently rebases.

Repeated apply with the same idempotency key returns the existing committed outcome. Sitemap operations that share the tenant database commit canonical Content, route, hierarchy, revision, status, approval, Activity, and idempotency state in one transaction. A later operation family that cannot share this transaction must use a durable saga with explicit failure/compensation state; it never returns a successful revision that omits failed operations.

## 8. Command service boundaries

The Builder module owns orchestration, not domain writes.

```text
BuilderRouter
  → SiteBuilderQueryService / SiteBuilderCommandService
      → ChangeSetRepository / SiteRevisionRepository
      → ContentStructureCommandService
      → canonical Content item/version/presentation services
      → DesignSystemService
      → AssetService
      → Release/Publish services
```

- services extend the repository-standard base and receive collaborators by dependency injection.
- repositories contain persistence operations only.
- transactions use repository/BaseService contracts and propagate the tenant connection.
- Builder/Agent code never imports concrete ORM models to bypass canonical services.
- Activity and domain events are required for preview, apply, conflict, migration, generation, and publish candidate/activation outcomes.

## 9. Read projections

`GET /projects/{projectId}/builder` returns a composed projection, not persistence rows:

- project authoring mode/migration state.
- current Site Revision manifest ID/ETag and status projection.
- stage readiness and exact pinned versions.
- page tree with section summaries.
- active/candidate generation Jobs.
- current Design System assignment.
- latest authorized preview/thumbnail summary.
- publish readiness and active release relationship.

Large page/design payloads are fetched by explicit stage/page endpoints or artifact references. The summary endpoint does not embed every blueprint or binary asset.

Projection queries batch related content/runtime/artifact data and must not add per-page or per-project N+1 queries.

## 10. Durable generation

Generation is a `BackgroundJob` defined by `background-jobs.md`; the HTTP request does not hold the model/build work open.

Generation request includes:

- target stage and exact base Site Revision manifest.
- selected pages/sections or full-site scope.
- planning/Knowledge/Design System references.
- lead Agent/run provenance.
- locale, candidate count, and idempotency key.

The Job produces candidate planning documents, presentation sets, assets, or a persisted ChangeSet. It never mutates the current Site Revision without an explicit apply command.

Partial success is page/section-scoped. Successful candidate artifacts remain reviewable and failed units retain structured errors. A future explicit retry may target only a failed deterministic unit when that retry is proven safe; Sitemap generation v1 deliberately sets `maxAttempts=1` and performs no automatic model retry. Cancellation is cooperative and observed between declared model/tool/page steps.

## 11. Preview, build, and publish activation

Publishing uses the existing release domain with staged activation:

1. validate the Site Revision and create an inactive candidate release pinned to its manifest hash and every canonical input version.
2. dispatch an idempotent publish/build Job.
3. build an immutable artifact and run binding, readiness, accessibility, route, and smoke checks.
4. atomically switch active release/deployment only after all required checks succeed.
5. after commit, invalidate release-keyed route/prelaunch caches and emit `release.activated`.

Failure keeps the last-known-good active release. If no active release exists, the exact prelaunch response remains. No service may create a deployment as `READY` before the artifact and smoke checks exist.

### 11.1 Hosting continuity and delivery suspension

Publication state and public delivery availability are separate. `published` remains derived from the active canonical release even when a Hosting-owned delivery gate temporarily prevents that release from being served; Payment Restricted never rewrites the release as inactive or routes the site to prelaunch.

The Hosting Policy defines the Continuity Window. On the first Payment Restricted transition in one uninterrupted restricted period, Hosting persists the anchored deadline and continues serving the current active release. Replayed transition facts are idempotent and do not extend the deadline. Rebuild, republish, domain mutation, and other commands that add hosting cost fail before dispatch during continuity.

At deadline expiry, Hosting marks delivery `suspended` without changing or deleting the active release, immutable artifact, Domain bindings, or certificate associations. The public-host adapter applies the suspended-delivery response before active-release route resolution. A custom domain returns a neutral localized temporary-unavailable page; an Arclayer-managed subdomain may return a branded recovery page. Both return `503`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow, noarchive`, and neither discloses payment state or private Workspace data.

Provider-confirmed payment recovery or a Commerce Domain State Correction from Payment Restricted to Payment Grace supplies a durable commercial-access transition with distinct cause and correlation identity. Hosting consumes either fact idempotently, records its own restoration transition, clears the delivery gate, and invalidates suspended-response caches atomically so the same active release resumes without a build, publish, or deployment Job. Commerce cannot mutate Hosting, release, deployment, Domain-binding, certificate, or cache records.

This handoff is outbox-backed and eventually consistent rather than a distributed transaction. A failed Hosting restoration does not roll back the committed Commerce transition: Hosting retains explicit retryable failure, emits its own Operational Signal, and never claims successful delivery. Replaying the Commerce fact returns the existing restoration result. A separate Hosting State Correction is neither required nor accepted merely to complete a Commerce correction to Payment Grace; Hosting-only correction remains available for an explicitly authorized continuity grant while commercial access stays Payment Restricted.

Hosting publishes a durable restoration-result fact only after its gate/cache transaction commits. The fact distinguishes `restored` from `failed`, references the source Commerce transition and Hosting restoration identity, and drives the second-phase Commercial Lifecycle Notification. Worker acceptance, retry scheduling, or the Commerce correction itself cannot emit a delivery-restored fact.

Restricted Recovery Mode keeps authorized reads of existing Builder projections, Site Revisions, active-release metadata, immutable artifacts, and stored downloads available. It blocks ChangeSet preview/apply, generation, import, preview regeneration, thumbnail capture, build, publish, deployment, and Domain/certificate mutation with `402 WORKSPACE_PAYMENT_RESTRICTED` before a Job or external effect is dispatched. A Workspace export may include already-preserved Builder data and artifacts but never regenerates a missing artifact or activates a release to complete the export.

Preview/thumbnail capture uses a short-lived audience-limited preview credential, fixed capture profile, and explicit renderer readiness. It does not reuse an operator browser session or expose editor/private data.

## 12. Product API surface

Module-local paths are mounted under the global Admin `/api/v1` prefix by `core/routes.py`.

| Method/path | Contract |
| --- | --- |
| `GET /projects/{projectId}/builder` | Current composed projection. |
| `POST /projects/{projectId}/builder/initializations` | Idempotently create the exact root Content Structure/Site Revision baseline from explicit authoring and Design System expectations. |
| `GET /projects/{projectId}/builder/revisions/{revisionId}` | One immutable manifest and authorized projections. |
| `GET /projects/{projectId}/builder/pages/{itemId}/{stage}` | Exact stage payload pinned by revision. |
| `POST /projects/{projectId}/builder/change-sets/preview` | Persist and preview typed operations. |
| `POST /projects/{projectId}/builder/change-sets/{changeSetId}/apply` | Apply a fresh approved ChangeSet idempotently. |
| `POST /projects/{projectId}/builder/generations` | Create a durable generation Job. |
| `GET /projects/{projectId}/builder/generations/{generationId}` | Read the creator-owned generation, authorized Job progress, candidate ChangeSet previews, and structured failures. |
| `POST /projects/{projectId}/builder/generations/{generationId}/cancel` | Record a cooperative cancellation request; terminalization waits for worker acknowledgement. |
| `POST /projects/{projectId}/builder/composition-sagas` | Create the explicit planning-to-composition parent for an ordered unplanned target scope. |
| `GET /projects/{projectId}/builder/composition-sagas/recovery` | Recover the creator-owned parent matching the complete ordered target tuple. |
| `GET /projects/{projectId}/builder/composition-sagas/{sagaId}` | Read both child generations, waiting evidence, and the exact Revision chain. |
| `POST /projects/{projectId}/builder/composition-sagas/{sagaId}/phase-transitions` | Prove an already-applied child ChangeSet and advance idempotently to the next persisted phase. |
| `POST /projects/{projectId}/builder/composition-sagas/{sagaId}/cancel` | Cancel the parent and cooperatively request cancellation of its active child. |
| `GET /projects/{projectId}/builder/preview-artifacts` | List authorized revision/release preview artifacts. |
| `POST /projects/{projectId}/authoring-mode-migrations` | Preview/create approval-gated mode migration Job. |

All unsafe requests require browser CSRF/auth, `PublicUUID`, typed request/response schemas, stable errors, permissions, and generated clients. Create/apply/generation/migration calls require `Idempotency-Key`.

## 13. Errors and conflicts

Required stable error families include:

- `PROJECT_AUTHORING_MODE_REQUIRED`.
- `PROJECT_AUTHORING_MODE_MISMATCH`.
- `AUTHORING_MODE_MIGRATION_REQUIRED`.
- `SITE_REVISION_NOT_FOUND`.
- `SITE_REVISION_STALE`.
- `CONTENT_STRUCTURE_STALE`.
- `CHANGE_SET_NOT_FOUND`.
- `CHANGE_SET_EXPIRED`.
- `CHANGE_SET_PREVIEW_REQUIRED`.
- `CHANGE_SET_ALREADY_APPLIED` with existing outcome metadata.
- `CHANGE_SET_APPROVAL_REQUIRED`.
- `BUILDER_OPERATION_INVALID` with typed operation/path details.
- `BUILDER_BINDING_INVALID`.
- `BUILDER_GENERATION_IDEMPOTENCY_CONFLICT`.
- `BUILDER_GENERATION_JOB_INVALID`.
- `BUILDER_GENERATION_NOT_FOUND`.
- `BUILDER_GENERATION_RESULT_INVALID`.
- `BUILDER_GENERATION_FAILED` with Job reference.
- `BUILDER_GENERATION_PROVIDER_FAILED`.
- `BUILDER_GENERATION_OUTPUT_INVALID`.
- `BUILDER_COMPOSITION_SAGA_NOT_FOUND`.
- `BUILDER_COMPOSITION_SAGA_IDEMPOTENCY_CONFLICT`.
- `BUILDER_COMPOSITION_SAGA_PLANNING_REQUIRED`.
- `BUILDER_COMPOSITION_SAGA_PHASE_CONFLICT`.
- `BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID`.
- `PUBLISH_CANDIDATE_NOT_READY`.

Validation and deterministic conflicts are never retried by infrastructure. Debug details remain server-side; user responses carry stable correlation IDs and localized product messages.

## 14. Authorization and security

- every manifest, structure revision, planning document, content version, Design System, ChangeSet, Job, and artifact resolves through workspace/project/site/environment predicates.
- read, draft-write, destructive, publish, migration, and source-write permissions remain distinct.
- Plan-mode Agent runs cannot apply ChangeSets or create mutation/publish Jobs.
- imported briefs, URLs, Knowledge, Skill instructions, component metadata, generated code, and model output are untrusted.
- Tool output is schema validated before preview/persistence.
- preview tokens bind user/workspace/project/base revision/operation hash/expiry and are single-purpose.
- deleting a page or global section requires dependency impact and approval; no dangling bindings are silently removed.
- preview credentials and artifact URLs never become authorization substitutes.

## 15. Migration and hard cut

Wave 0/2 migration order:

1. add generated public/tenant migrations, enum/presentation policies, repositories, permissions, and typed schemas.
2. classify every project authoring mode; ambiguous projects remain `migration_required`.
3. create a baseline Content Structure Revision and Site Revision manifest only for eligible Builder-managed CMS state; do not invent history.
4. validate route/hierarchy/content/presentation hashes and tenant readiness.
5. deploy generation/build Jobs and workers before enabling APIs that create them.
6. freeze the old editor/source-write path, switch backend/frontend/generated clients together, and remove the old read-only editor in the same rollout.

There is no long-lived dual write. Rollback before destructive cleanup restores old routing and removes only unreferenced new projections. After cleanup, recovery is forward repair using retained migration evidence.

## 16. Tests and verification

Required backend evidence:

- authoring-mode enforcement and migration approval/rollback boundaries.
- Content Structure Revision transaction, route uniqueness, hierarchy ordering, and stale expected revision.
- Wireframe versus Visual Blueprint non-overwrite and full-version presentation/binding set.
- immutable manifest hash and proof that status/artifact/release updates do not mutate it.
- ChangeSet preview/apply token binding, permission intersection, stale conflict, idempotent replay, and partial saga failure.
- tenant isolation for every target descriptor and existing-workspace tenant migration readiness.
- generation Job candidate/partial/failure/cancel behavior without direct mutation.
- candidate build failure preserving last-known-good/prelaunch delivery.
- Restricted Recovery Mode preserving existing Builder/release reads and export while rejecting every mutating, generation, preview, capture, build, publish, deployment, and Domain path before dispatch with exact `402` metadata.
- preview credential scope and private-data exclusion.
- Activity/event coverage and generated OpenAPI/client alignment.

Required cross-layer evidence:

- authenticated brief → Sitemap candidate → apply → Wireframe → Style Guide → Design → preview → publish.
- visual/structural diff and stale conflict UI.
- source-managed project refusal and explicit migration-required UI.
- refresh/cancel recovery for generation and publish Jobs.

During isolated backend implementation, run the closest static check and focused
test. Run `pnpm api:check` at a coherent backend milestone or before handoff;
reserve `pnpm check` for cross-app integration or final delivery. Review-sensitive
changes also run the canonical changed-scope code review engine.

## 26. Wave 3F Sitemap section-intent authority and Wireframe traceability contract

Wave 3F closes the missing authority between Sitemap planning and Wireframe
composition before Agent Wireframe generation is activated. A Wireframe
`intentId` cannot be treated as canonical merely because it is a non-empty
string inside a Presentation Document.

### 26.1 Typed planning projection

- `BuilderPageNodeSnapshotV1` gains an optional page `purpose` and an ordered
  `sectionIntents` tuple. Each `BuilderSectionIntentV1` has a stable `id`, a
  product-facing `label`, a visitor-outcome `goal`, and optional
  `generationGuidance` that is always treated as untrusted project data.
- intent IDs are unique within one page. Labels, goals, and guidance are
  normalized but do not become executable prompts or hidden system
  instructions.
- the additive fields serialize only when configured. Parsing and re-dumping a
  historical v1 snapshot with no planning data therefore preserves its exact
  canonical hash; no migration may rewrite historical Content Structure or Site
  Revision evidence merely to add empty defaults.
- `BuilderRevisionPageOut` exposes the exact purpose and intents from the pinned
  Content Structure Revision. It never derives them from a Wireframe, page
  title, model output, or browser state.

### 26.2 Closed ChangeSet commands

- `page.create` may carry the new typed purpose and section intents for a page
  that is created and planned in one Sitemap candidate.
- `page.intent.replace` replaces the complete typed planning projection for one
  existing page under the exact base Site Revision/ETag. It is a Sitemap-family
  operation and cannot mix with Wireframe or Design System operations.
- Preview compares removed intent IDs against the exact manifest-pinned
  Wireframe. Removing an intent that is still referenced is a blocker with the
  affected section IDs; the service never leaves a newly orphaned Wireframe or
  silently renames a reference. Removing unreferenced intent data is
  destructive and requires the existing bound approval protocol.
- Apply revalidates the same references inside the tenant transaction, updates
  no mutable browser document, and creates the next immutable Content Structure
  Revision plus Site Revision. Pages and Content Versions are not rewritten
  when only planning changes.
- rebuilding a structure snapshot from current hierarchy/routes preserves the
  exact planning projection of surviving pages and overlays only the normalized
  command results. New and deleted page identities are handled explicitly.

### 26.3 Wireframe reference validation

- every candidate Wireframe section must reference an intent that exists on the
  same exact page. Unknown intent references are blocker findings before any
  Content Version can be created.
- a canonical intent without a Wireframe section is allowed in a draft but is
  returned as explicit incomplete traceability. This supports progressive
  composition without inventing placeholder components or fake readiness.
- the revision projection returns one server-authored traceability state:
  `unplanned | not_started | partial | aligned | orphaned`, plus exact missing
  intent IDs and orphaned section IDs. The browser does not calculate a second
  verdict.
- historical Wireframes whose Content Structure has no section intents remain
  readable and project as `orphaned`; they are not silently adopted. A user may
  explicitly author matching intents through `page.intent.replace`, review the
  Preview, and Apply a new revision.

### 26.4 Self-review decisions and remaining gates

The approved boundary rejects four tempting shortcuts: keeping intent only in
Wireframe JSON, auto-deriving intent from section labels, changing historical
hashes by serializing empty defaults, and mixing planning plus composition in an
implicit multi-family transaction. These choices preserve one planning truth,
explicit migration evidence, and the existing ChangeSet transaction boundary.

Still gated after Wave 3F: Agent Wireframe generation and its conversation
Tool, a proved multi-family saga for coordinated intent/composition removal,
global-section dependency and cycle analysis, server undo/redo, comments,
visitor rendering, Design writes, compiler artifacts, publication readiness,
and successful real-data visual capture.

## 27. Wave 3G Agent Wireframe generation contract

Wave 3G activates one durable Wireframe-candidate authority without allowing a
model, browser, or conversation renderer to mutate the canvas. It reuses the
existing Builder generation resource and typed ChangeSet Preview/Apply
protocol, but makes generation stage-specific and removes the hidden
Thread/Run creation used by the first Sitemap client.

### 27.1 Two explicit Agent authorities

- for `targetStage="wireframe"`,
  `POST /projects/{projectId}/builder/generations` accepts exactly one of
  `agentId` or `agentRunId`. A direct Editor request uses `agentId`; an approved
  conversation Tool uses its already-persisted `agentRunId`. Sitemap generation
  remains the version-1 Run-backed contract and still requires `agentRunId`;
  Wave 3G does not silently broaden Sitemap authority.
- direct generation resolves the current Workspace assignment, immutable Agent
  version, `build` execution capability, and exact Tool grant. It persists that
  authority and the exact Builder context used by the Job. It does not create a
  Thread, Run, message, or synthetic conversation identifier.
- Run-backed generation requires a creator-owned Build Run whose immutable
  Builder snapshot is bound to the same Site Revision/ETag. The persisted Agent,
  version, assignment, and context must match the Run snapshot.
- direct and Run-backed candidates retain truthful Agent provenance. A direct
  result is not labelled `human`, and an arbitrary browser request cannot
  substitute unverified version or assignment IDs.

### 27.2 Exact Wireframe input

- `targetStage="wireframe"` requires exactly one `selectedPageId`. The page must
  exist in the exact latest base revision and must have a non-empty canonical
  `sectionIntents` plan. Unplanned pages fail before a Job is created.
- generation captures the page item/version pin, purpose, ordered canonical
  intent IDs, current immutable Wireframe or explicit absence, exact Design
  System version, and registered component-catalog contract. Planning text and
  literal content remain untrusted project data.
- the provider is forced to return one strict typed Tool call containing only
  `BuilderWireframeOperationV1` operations. It may reference only the selected
  page, exact draft version, canonical intent IDs, and registered
  component/variant/slot contracts. Free JSON, JSON Patch, whole Site Revision
  replacement, and success prose are not candidates.
- the existing server analyzer remains authoritative. Unknown intent IDs,
  unregistered components or variants, invalid/missing required bindings, and
  incompatible responsive or interaction rules are explicit blocker evidence.
  Missing canonical intent coverage is an explicit warning and never causes a
  placeholder section to be inserted.

### 27.3 Durable candidate lifecycle

- Sitemap and Wireframe use distinct registered durable Job types and Taskiq
  task names while sharing one generation resource, recovery projection,
  cancellation protocol, idempotency identity, and handler lifecycle.
- every candidate is submitted to the canonical ChangeSet Preview service with
  exact Agent provenance. The generation record stores only replayable
  ChangeSet command references and structured failures; public projections
  rebuild current authorized Preview evidence and never persist preview tokens.
- a candidate is never applied automatically. Review, blockers, approval, exact
  Apply evidence, and the next immutable Site Revision remain separate steps.
  Apply revalidates the base revision, Agent authority, intent references,
  Design System, component catalog, and Content transaction under the existing
  tenant boundary.
- recovery returns the creator's latest active and latest terminal generation
  for an exact stage and optional page. Refresh, reconnect, Tool rendering, and
  the Editor therefore observe the same server state rather than reconstructing
  progress in browser memory.

### 27.4 Self-review decisions and remaining gates

The reviewed design rejects hidden Runs, direct canvas writes, auto-Apply,
optimistic candidate success, browser-side validation, reusing the Sitemap Job
name for Wireframe work, and treating generated placeholder bindings as valid.
Stage direct generation and assistant-ui Tool generation share the same
service; only their Agent authority source differs.

Still gated after Wave 3G: coordinated multi-page generation, a proved
multi-family intent/composition saga, global-section dependency/cycle analysis,
visitor rendering, Design writes, compiler artifacts, publication readiness,
comments, and server undo/redo.

## 28. Wave 3H global-section authority and dependency graph contract

Wave 3H closes the reusable-section ownership gap before coordinated
multi-page generation is allowed. A non-empty `globalReferenceId` inside a
Wireframe is not authority by itself: the same immutable Site Revision must
identify the exact reusable Content Item and Content Version that it resolves.

### 28.1 Canonical ownership and immutable pins

- a Builder global section is a canonical Content Item in the same Workspace,
  Site, Environment, and locale scope with
  `resolvedRole="reusable-section"`. Builder does not introduce a second
  global-section table or copy the reusable payload into Site Settings JSON;
- `ContentStructureSnapshotV1.globalReferences` becomes a typed ordered tuple
  of global-section nodes. Each node carries the stable Content Item identity,
  locale/slug identity, optional purpose, and ordered section intents. Planning
  text remains untrusted project data under the same rules as page planning;
- `SiteRevisionManifestV1.globalSectionVersions` pins the exact Content Version
  plus presentation and component-binding hashes for every typed node. The
  aggregate presentation hash covers page and global-section pins together;
- an empty historical pre-release placeholder remains byte-equivalent. The
  Builder v1 implementation has no accepted non-empty untyped
  `globalReferences` authority, so this is a hard contract completion rather
  than a dual-read fallback;
- the persisted Wireframe v1 field `pageItemId` is retained for hash and payload
  compatibility and is defined as the host Content Item ID. A complete schema
  migration is required before any future rename; aliases or heuristic dual
  reads are forbidden.

The legacy Site Settings global-section JSON and string IDs remain a
source-managed delivery surface only. Builder neither reads nor writes them,
and their arbitrary IDs cannot satisfy a Builder `PublicUUID` reference. A
future delivery hard cut must explicitly migrate release/rendering authority;
Wave 3H does not delete a still-used legacy delivery path.

### 28.2 Server-authored dependency graph

The revision projection returns one deterministic graph derived from every
manifest-pinned page and global-section Wireframe:

- each edge records the host item kind/ID, host section ID, and referenced
  global-section item ID;
- every target must exist in the typed global-section catalog and have the
  exact pinned Wireframe required by the reference;
- only global-section-to-global-section edges participate in cycle detection.
  Self references and multi-node cycles are blockers with a deterministic item
  path; page-to-global edges remain incoming dependency evidence;
- the graph exposes exact incoming dependants so deletion/replacement review
  can enumerate affected pages, global sections, and host section IDs. A
  Builder-managed deletion may not proceed through a direct Content shortcut;
- historical unknown, missing-Wireframe, and cyclic references remain readable
  as explicit server findings. The API does not hide the revision behind a
  generic failure, and the browser does not calculate a second verdict.

Graph ordering, cycle paths, and finding metadata are stable for the same
manifest. The analyzer operates on immutable candidate documents during
Preview and repeats under the Apply transaction after exact version, hash,
scope, and permission revalidation.

### 28.3 Closed planning and reference operations

- `global_section.intent.replace` replaces the complete purpose/intent plan for
  one exact typed global section. It is a Sitemap/planning-family operation;
  removing an in-use intent is destructive and uses the existing approval
  protocol;
- `wireframe.set_global_reference` and
  `wireframe.clear_global_reference` target one exact host Wireframe section.
  The host may be a page or a typed global section and must match the
  manifest-pinned draft version;
- setting a reference resolves through `globalSectionVersions`; models and
  browsers cannot provide a version override. Unknown targets,
  missing-Wireframe targets, or resulting cycles are blocker findings rather
  than silently ignored references;
- while a reference is set, it is the structural authority for that host
  section. The retained local component fields are reversible editor context,
  not an implicit visitor-rendering fallback. Clearing the reference restores
  the local section authority explicitly;
- Preview returns the candidate Wireframe, affected Content/Presentation/global
  targets, dependency graph, warnings/blockers, and approval evidence. Apply
  uses the canonical Content Wireframe transaction command, creates exact new
  page/global-section pins, and commits the next Site Revision atomically.

### 28.4 Self-review decisions and remaining gates

The reviewed boundary rejects a second global-section store, copying reusable
payloads into the manifest, browser-side cycle checks, version overrides on
references, silent use of missing targets, legacy Settings dual-write, and a
`pageItemId` rename without a persisted-payload migration. It also orders this
authority before coordinated multi-page generation so Agents can distinguish
page-local composition from exact shared dependencies.

Still gated after Wave 3H: coordinated multi-page generation, the broader
multi-family intent/composition saga, Builder-managed global-section
create/delete UX, visitor rendering and legacy delivery migration, Design
writes, compiler artifacts, publication readiness, comments, and server
undo/redo.

## 29. Wave 3I coordinated composition generation contract

Wave 3I turns the single-page Wireframe generator into one revision-bound
composition resource that can coordinate pages and reusable sections without
creating a second write path. Coordination means that one candidate is
reviewed and, if explicitly accepted, applied as one Wireframe-family
ChangeSet. It does not mean that model output may mutate several Content Items
incrementally or that planning and composition become one implicit command.

### 29.1 Typed target scope and hard contract cut

For `targetStage="wireframe"`,
`POST /projects/{projectId}/builder/generations` accepts an ordered `targets`
tuple. Every target contains exactly:

- `kind: "page" | "global_section"`;
- `itemId: PublicUUID`.

The tuple is non-empty, contains no duplicate `(kind, itemId)` identity, and is
persisted in request order. The complete tuple, base Site Revision/ETag, actor,
Agent authority, objective, locale, candidate count, and knowledge references
participate in the idempotency fingerprint. The former `selectedPageIds`
field is removed from the public and persisted generation contract; it is not
retained as an alias or dual-read compatibility path. Sitemap generation has
no target tuple because its canonical scope remains the complete immutable
Builder context.

The response projects the exact typed targets. Recovery uses repeated typed
`target` filters (`page:<PublicUUID>` or `global_section:<PublicUUID>`) and
matches the complete ordered tuple; a subset, reordered tuple, or kind mismatch
cannot recover a different generation. `GET /generations/{generationId}` and
cancel remain generation-resource operations and retain owner-only authority.

### 29.2 Server-owned coordinated context

Under the same tenant transaction that creates the durable Job, the service
resolves every target from the exact Content Structure and Site Revision:

- a page must exist in `pages` and use its exact `pageVersions` pin; a reusable
  section must exist in `globalReferences` and use its exact
  `globalSectionVersions` pin;
- every target must have a purpose and canonical section intents. Missing
  planning is an explicit `BUILDER_WIREFRAME_PLAN_REQUIRED` conflict and does
  not cause the model to invent intent identity;
- the service snapshots target kind, Content Item ID, expected draft version,
  planning, current Wireframe, exact Design System version, component catalog,
  and the server-authored global-section dependency graph;
- target order is retained for narrative/site-flow coordination, while graph
  nodes, catalog entries, and validation evidence keep their canonical server
  ordering;
- all snapshot text and Content data remain untrusted model context. None of it
  can override Agent instructions, Tool schemas, permissions, or the selected
  target scope.

The Job validates the persisted snapshot against its canonical input and the
still-resolvable Agent assignment/version/grants before each execution. It does
not reread mutable browser state, choose a newer Content Version, or create a
Thread, message, Run, or synthetic conversation identity.

### 29.3 One candidate, many exact hosts, one ChangeSet family

Each model Tool result contains one complete Wireframe candidate whose
operations may target any member of the persisted target tuple. Server scope
validation requires:

- every operation target and expected draft version exactly match one target
  context;
- every target contributes at least one operation, so a nominally coordinated
  candidate cannot silently omit a selected host;
- intent IDs are valid for the operation's own host, component and variant
  contracts come from the pinned catalog, and global-section references resolve
  through the canonical catalog and dependency graph;
- operation IDs are unique across the complete candidate and the total
  operation count remains inside the existing public ChangeSet contract;
- the resulting Preview is one Wireframe-family ChangeSet. Sitemap and Design
  operations remain forbidden in that ChangeSet.

Candidate alternatives remain the unit of partial failure: one invalid model
Tool result records one candidate failure and does not leak a partially
persisted per-target candidate. Cancellation retains already-persisted complete
candidates. A later explicit Apply replays and revalidates the complete
ChangeSet in one tenant transaction, writes the affected Content Versions, and
creates one next Site Revision or writes nothing.

### 29.4 Multi-family planning-to-composition saga

Coordinated composition does not weaken the planning-first authority. A direct
`targetStage="wireframe"` generation continues to reject an unplanned target
with `BUILDER_WIREFRAME_PLAN_REQUIRED`; it never silently widens itself into a
different workflow. The explicit recovery resource is a
`BuilderCompositionSaga`, created under:

```text
POST /projects/{projectId}/builder/composition-sagas
GET  /projects/{projectId}/builder/composition-sagas/{sagaId}
GET  /projects/{projectId}/builder/composition-sagas/recovery
POST /projects/{projectId}/builder/composition-sagas/{sagaId}/phase-transitions
POST /projects/{projectId}/builder/composition-sagas/{sagaId}/cancel
```

Create accepts the same exact base Revision/ETag, ordered target tuple, Agent
authority, objective, locale, candidate count, and Knowledge references as the
requested Wireframe generation. At least one target must be present and lack
canonical planning. The complete request participates in one parent
idempotency fingerprint. Recovery is owner-only and matches the complete
ordered target tuple; a subset, reordering, or target-kind change is a different
scope.

The parent has one persisted state machine:

```text
planning_queued -> planning_running -> planning_review_pending
    -> composition_queued -> composition_running -> composition_review_pending
    -> completed

any non-terminal state -> failed | cancelled
```

The planning child is a distinct durable generation with its own Job identity.
It may emit only `page.intent.replace` and
`global_section.intent.replace` operations for the exact unplanned subset and
must cover that subset completely. The server previews each alternative as one
Sitemap/planning-family ChangeSet. `planning_review_pending` means the real
candidate is persisted and the parent is waiting for a human decision; it does
not mean the candidate was accepted.

Both direct Agent and existing Run-backed authority are resolved once at parent
creation. The immutable Agent/version/assignment identity is inherited by both
children. The planning child requires the pinned Agent version to retain the
Sitemap generation/apply and Wireframe generation/apply grants used by the two
typed phases; a later assignment change cannot silently substitute another
Agent version. Direct use creates no Thread or Run, and Run-backed use retains
the original revision-bound Run identity.

`POST .../phase-transitions` is an idempotent evidence command, not an Apply
shortcut. For the planning transition it accepts the selected planning
`changeSetId` and the resulting `siteRevisionId`. The service locks the parent,
proves that the ChangeSet belongs to the planning child, has status `applied`,
and produced exactly that next Revision, then reloads the new immutable Builder
context. Only after validating that every original ordered target is now
planned does it create the Wireframe child generation in the same tenant
transaction. The child snapshots composition context from the new Revision and
never reuses the original base snapshot.

The Wireframe child remains the coordinated generation defined by sections
29.1-29.3. Its candidate is reviewed and applied independently. A second
idempotent phase transition proves the selected Wireframe ChangeSet and Apply
result before marking the parent `completed`. Apply endpoints remain the only
writers of Site Revisions; phase transitions only verify their persisted
outcomes and advance orchestration.

The parent persists its identity, current state, ordered original targets,
unplanned planning subset, exact Agent snapshot identity, planning and
composition child generation IDs, initial/planning/composition Revision chain,
waiting reason, cancellation request, and structured terminal failure. Child
failure/cancellation is projected to the parent under the execution fence.
Parent cancellation cooperatively requests cancellation of the active child;
while waiting for review it terminalizes the parent without discarding the
already persisted candidate. Retry or resume always consumes persisted child
and Apply evidence and never fabricates success.

The following are invalid contracts:

- auto-approving or auto-applying the planning candidate;
- accepting a planning ChangeSet that contains page create/move/delete or any
  Wireframe operation;
- starting composition from the original base Revision, a browser-computed
  graph, or an unverified Apply response;
- mixing the planning and Wireframe operations in one ChangeSet or transaction;
- creating a hidden Thread/Run for direct Editor use or a replacement Run for
  the approved Tool path;
- representing child failure, transition conflict, or dispatch failure as a
  successful parent state.

### 29.5 Self-review decisions and remaining gates

The reviewed contract rejects five shortcuts: widening `selectedPageIds` into
an untyped bag, one hidden Job per page, browser-assembled multi-target
previews, model-selected global-section versions, and a mixed-family atomic
transaction. Typed targets make reusable-section authority explicit; one Job
and one complete candidate preserve coordination; one existing ChangeSet and
Apply path preserve transactional truth; and the later saga makes its revision
boundary visible instead of pretending planning and composition share one
version.

Wave 3I implementation is accepted only after the hard request/persistence cut,
coordinated context and provider scope validation, durable recovery/cancel,
Editor target selection and review, the explicit multi-family saga, full API
and Admin gates, changed-scope review, and non-mutating browser evidence. Still
gated: Builder-managed global-section create/delete, visitor rendering and
legacy delivery migration, Design writes, compiler artifacts, publication
readiness, comments, and server undo/redo.

## 30. Wave 3J Builder-managed global-section lifecycle contract

Wave 3J adds creation and retirement to the typed global-section authority from
Wave 3H. It does not add a global-section CRUD resource or a second persistence
model. Both commands remain Sitemap-family operations inside the existing
revision-bound ChangeSet Preview/approval/Apply protocol.

### 30.1 Closed create and delete operations

`global_section.create` accepts exactly:

- `operationId` and a request-local `clientGlobalSectionId`;
- product `title`, stable `slug`, and `locale`;
- `fieldsSnapshot`, whose model-specific data is validated by canonical
  Content creation;
- optional `purpose` and ordered `sectionIntents`. Intents require a non-empty
  purpose and have unique IDs.

The browser and model cannot select a Content Model. The server always creates
through `modelKey="reusable-section"`, writes canonical `title` and
`section_key` fields from the normalized operation, and lets the official
Content Model contract reject invalid remaining fields. No `modelKey`, role,
posture, surface, Content Version, Wireframe, or presentation override appears
in the public operation. `clientGlobalSectionId` values are unique within one
Preview and the Apply response resolves them through
`clientGlobalSectionIds` only after the transaction commits.

`global_section.delete` accepts an exact typed `itemId` and
`expectedDraftVersion`. The target must be present in both the Content
Structure `globalReferences` catalog and `globalSectionVersions`; a page ID,
legacy Settings alias, missing pin, or version mismatch is a stale/invalid
target rather than a best-effort deletion.

### 30.2 Preview dependency and approval semantics

Preview loads all manifest-pinned page and global-section Wireframes whenever a
delete is proposed and returns the server-authored dependency graph with the
ChangeSet:

- an incoming page or global-section reference produces a blocker containing
  exact host kind, host item ID, host section ID, and target item ID. The user
  must first clear each reference through the existing Wireframe ChangeSet;
- no reference is auto-cleared, no local component is promoted implicitly, and
  destructive approval cannot override an incoming-reference blocker;
- an unreferenced delete still emits visible dependency impact evidence and
  requires `destructive` approval;
- create affects the fixed `reusable-section` Content Model, its request-local
  Content/global-section target, and planning when supplied. Delete affects the
  exact Content/global-section target and removes its revision pin;
- a target cannot be deleted twice or be changed by another Sitemap operation
  in the same ChangeSet. Operation order never creates a hidden replacement or
  rewrites a reference to a newly created client identity.

Agent provenance retains at least `review`; deletion elevates the whole
ChangeSet to `destructive`. Both operations require Builder write and canonical
Content item write permissions.

### 30.3 One canonical transaction and exact next revision

Apply repeats Preview analysis under the locked tenant transaction and uses
`ProjectContentItemTransactionCommands.create_item` or `delete_item`. Creation
does not create route/hierarchy records. Deletion does not call legacy Site
Settings and does not bypass canonical lifecycle, Activity, or after-commit
effects.

After the Content commands succeed, the existing revision writer reloads page
and reusable-section records from the transaction, creates the next immutable
Content Structure Revision, and derives exact `globalSectionVersions` and
aggregate presentation hashes. Creation adds one exact initial Content Version
pin; deletion removes the node and pin. Any command, graph, version, permission,
or revision drift aborts the entire transaction. Idempotent Apply replay returns
the original `clientGlobalSectionIds` and revision evidence; it never creates a
second item.

### 30.4 Self-review decisions and remaining gates

The reviewed boundary rejects six shortcuts: caller-selected model keys,
Builder-owned Content writes, legacy Settings dual-write, automatic reference
clearing, approval as a blocker override, and optimistic browser insertion.
This preserves one reusable-content authority and makes retirement impact
reviewable before visitor rendering depends on it.

Wave 3J is accepted only after schema, Preview graph/blocker, canonical
transaction, exact pin, replay/drift, Admin review, full quality gates, and
non-mutating browser evidence pass. Still gated: visitor rendering and legacy
delivery migration, Design writes, compiler artifacts, publication readiness,
comments, and server undo/redo.

## 31. Revision-pinned renderer document

Wave 3K adds one immutable read projection; it does not add a build artifact or
publication state.

### 31.1 Resource and request identity

```http
GET /projects/{projectId}/builder/revisions/{revisionId}/pages/{pageItemId}/render-document
    ?locale={locale}&theme={themeKey}
```

`revisionId`, `pageItemId`, and `locale` are required identities. `theme` is
optional only because the renderer contract defines the unique light-mode
theme as the deterministic default. An unknown locale/theme or a page not
pinned by the requested Revision returns a stable conflict/not-found error; it
never switches to the latest Revision, another page, or another locale.

The response contains:

- document schema version and renderer profile/version;
- Site Revision ID/hash, Content Structure ID/hash, exact page Content Version
  ID/version, Design System ID/version/checksum, and component catalog
  version/checksum;
- selected locale, route, theme key/mode, resolved semantic tokens,
  typography/motion roles, and exact component-recipe overrides;
- SEO title/description/robots from the exact page Content Version;
- ordered flattened render sections with stable instance IDs, original source
  item/content-version/section identity, complete global-reference lineage,
  component/variant identity, typed slots, responsive rules, interaction rules,
  and Asset references;
- deterministic `documentHash`, `renderable=true`, and explicit evidence for
  passed versus `not_evaluated` concerns.

The response is private Admin data and uses `Cache-Control: private, no-store`.

### 31.2 Strict input verification

Before projection, the service must:

1. parse and rehash the stored Site Revision manifest;
2. parse and rehash the exact Content Structure record and verify its
   workspace/project/site/environment identity;
3. load exactly every page/global Content Version pin, recompute each
   presentation and component-binding set hash plus the aggregate hash, and
   reject missing or additional pinned identities;
4. parse the exact Design System version, recompute its manifest checksum,
   resolve the declared immutable catalog, and verify catalog version,
   checksum, renderer profile, and renderer version;
5. parse every pinned Wireframe and verify its item, Design System, and catalog
   identities;
6. validate every renderable component, variant, slot, literal, resolved field
   value, responsive rule, interaction, and component recipe against the
   catalog and renderer profile;
7. analyze the complete global-section dependency graph before expansion.

No validation failure is converted into an empty section, placeholder value,
or warning-only success. `missing` bindings always block rendering. Optional
slots may be absent; required slots may not. A field binding reads only the
selected Content Version's `fieldsSnapshot`; a literal remains the exact
literal. Rich text is treated as text by renderer v1 and never executed as
HTML.

### 31.3 Global-section expansion

A section with `globalReferenceId` is a structural reference node. Its dormant
local component/bindings are not rendered. The renderer replaces the node in
place with the referenced global section's ordered pinned Wireframe sections.
Nested references are expanded recursively. Each resulting section retains:

- the page/global source kind;
- source item ID, Content Version ID, and source section ID;
- a stable instance ID derived from the reference path;
- every host item/host section/target item hop in order.

Unknown references, referenced targets without Wireframes, duplicate expanded
instance identity, and dependency cycles are blockers. There is no depth cap or
best-effort truncation; cycle detection is the semantic boundary.

### 31.4 Design System interpretation

`arclayer-site-v1@1.0.0` owns the base component layouts. The server resolves
the selected theme through the immutable Design System token graph and emits
typed values only. It also resolves matching component recipe state/style-slot
values after catalog compatibility validation. Missing recipes use the
profile's documented base rules; malformed or partially resolvable declared
recipes fail.

This renderer evidence is external to immutable Design System foundation
validation. A successful document must not rewrite `compatibility.renderer`,
`publishReady`, or a validation finding hash.

### 31.5 Readiness evidence and remaining gates

Renderer v1 may mark only these concerns `passed`: manifest, Content Structure,
Content Version pins, presentation/binding hashes, Wireframe/catalog contract,
global dependency expansion, Design System interpretation, and deterministic
document hashing. `assetsAndFontRights`, `compiler`, `smoke`, and `publication`
remain `not_evaluated`.

`renderable=true` means the selected page can be interpreted by this renderer
profile. It does not mean the page has a production bundle, can hydrate, has
passed accessibility/smoke tests, or may activate a release.

### 31.6 Public prelaunch correction

The public-host adapter uses a separately versioned prelaunch template and the
existing active-release authority:

| State | `/` | Other path | Cache | Robots |
| --- | --- | --- | --- | --- |
| Delivery Suspended, custom domain | `503` neutral unavailable | `503` neutral unavailable | `no-store` | `noindex, nofollow, noarchive` |
| Delivery Suspended, Arclayer-managed subdomain | `503` branded recovery | `503` branded recovery | `no-store` | `noindex, nofollow, noarchive` |
| Bound site, no active release | `200` prelaunch | `404` | `no-store` | `noindex, nofollow, noarchive` at root; `noindex` otherwise |
| Active release, missing route | `404` | `404` | `no-store` | `noindex` |
| Published binding/render failure | explicit failure | explicit failure | `no-store` | `noindex` |

The prelaunch response uses `arclayer-prelaunch-v2` and receives only the
localized public runtime identity: site name, subtitle, description, logo, and
favicon. It escapes every external value and renders explicit localized generic
copy when identity is absent; it never receives operator, editor, or preview
data. The responsive light/dark template has a complete static first frame, so
delivery and thumbnail capture do not depend on an entrance animation or a
screenshot-only wait. Legacy visitor delivery remains isolated until the
production renderer/compiler hard cut; this correction only removes the
false-success placeholder behavior. Active-release delivery never falls back to
prelaunch. The suspended-delivery rows take precedence over active-release and
prelaunch resolution without changing either publication state.

Public runtime identity and generated source resolve the canonical site URL from
Domain bindings only: prefer an active, verified Primary binding for the exact
Site, otherwise use the first active verified binding for that Site, otherwise
return `null`. Core Settings `site.url`, inactive or unverified bindings, and
bindings owned by another Site are never fallback canonical addresses.

## 32. Wave 3L typed Design authoring contract

Wave 3L adds the first Builder-owned write contract for
`ContentPresentationKind.VISUAL_BLUEPRINT`. It does not authorize arbitrary
PageBlueprint JSON, generated markup, CSS text, or publication.

### 32.1 Canonical Visual Blueprint

`VisualBlueprintDocumentV1` is frozen and contains:

- `schemaVersion=1`, host `itemId`, and exact `sourceWireframeChecksum`. The
  containing `PresentationDocumentRecord.versionId` is the Content Version
  identity; the payload does not duplicate that foreign key;
- exact `designSystemVersionId`/manifest checksum and
  `componentCatalogVersion`/checksum;
- a sparse ordered set of visual section entries. Every entry repeats only the
  stable `sectionId`, `componentKey`, and `variantKey` required to prove
  alignment with one source Wireframe section;
- state style values keyed by catalog-declared style slot. Values are typed
  token references or catalog-compatible literals; arbitrary CSS properties,
  selectors, HTML, script, and URLs are rejected;
- responsive visual overrides keyed by the catalog breakpoints. They cannot
  alter the Wireframe's structural layout, visibility, binding, or interaction
  target;
- typed asset presentation keyed by an image-capable slot: exact Asset ID,
  focal point, crop/aspect intent, and localized alt text. Authorization and
  rights remain downstream blockers until evaluated;
- page-only SEO values and immutable review evidence. A reusable section
  cannot own page SEO.

Missing visual entries mean “use the pinned Design System recipe”; they do not
mean a generated value. An explicit invalid entry blocks Preview and rendering.

### 32.2 Closed operation family

The public discriminator union contains only these Design operations in v1:

- `design.initialize` creates a Blueprint aligned to the exact Wireframe;
- `design.style.set` and `design.style.clear` update one declared state/style
  slot for one exact section;
- `design.responsive_style.set` and `.clear` update one declared breakpoint,
  state, and style slot;
- `design.asset.set` and `.clear` update one image-capable slot presentation;
- `design.seo.replace` replaces the complete page SEO projection.

Every operation carries `itemId`, `expectedDraftVersion`, and the exact source
Wireframe checksum. A ChangeSet cannot mix Design with Sitemap, Wireframe, or
Design System operations. Duplicate writes to the same semantic key in one
request are rejected rather than resolved by order.

### 32.3 Preview, approval, and Apply

Preview loads the requested current Site Revision, exact Content Versions,
Wireframes, Visual Blueprints, Design System manifest, and catalog. It verifies
all stored hashes before applying operations to an in-memory candidate. The
response includes normalized operations, affected Content/presentation/asset/
SEO targets, complete Blueprint candidates, issue codes, approval class, and a
signed Preview token.

Validation blockers include missing or malformed source Wireframe, Blueprint
pin drift, unknown section/component/variant/style slot/state/breakpoint,
incompatible literal type, non-image asset target, invalid focal/crop/alt
contract, SEO on a reusable section, and unresolved catalog or Design System
identity. Agent-authored Design requires review; clearing an asset or replacing
non-empty SEO is destructive approval only when Preview proves data loss.

Apply re-runs the same analysis against locked live inputs. It replaces the
complete `VISUAL_BLUEPRINT` and, for `design.seo.replace`, the complete `SEO`
presentation through the canonical Content transaction command, preserving all
unaffected presentations and component bindings. All affected hosts receive
new immutable Content Versions; one next Site Revision pins those exact
versions. Dispatch effects run only after commit.

### 32.4 Renderer selection and evidence

Renderer selection is explicit:

| Input | Render source | Readiness meaning |
| --- | --- | --- |
| Valid Blueprint aligned to pinned Wireframe | `visual_blueprint` | Design projection is valid; downstream gates remain separate |
| No Blueprint | `wireframe_preview` | Structural preview only; never publish-ready |
| Blueprint exists but is invalid/stale | error | No fallback to Wireframe or latest mutable state |

The renderer overlays visual section values on matching Wireframe sections,
then resolves Design System recipes/tokens. It never lets a page Blueprint
rewrite global tokens or a shared-section Blueprint escape its own exact host.
The render document exposes the selected source, Blueprint checksum when used,
and separate evidence for Design validity, assets/font rights, accessibility,
compiler, smoke, and publication.

### 32.5 Verification and remaining gates

Required tests cover schema rejection, operation-family isolation, duplicate
semantic writes, Preview normalization, pin/hash drift, catalog type
validation, page versus reusable-section SEO, multi-host transaction rollback,
idempotent Apply/replay, renderer source selection, and invalid-Blueprint
fail-closed behavior. AI Design generation, asset/font authorization,
automated accessibility execution, compiler bundles, release activation,
thumbnail capture, comments, and server undo/redo remain gated.

### 32.6 Revision-pinned Design authoring inputs

The immutable Revision projection exposes the canonical checksum beside every
non-null Wireframe. The browser sends this server-produced
`wireframeChecksum` in each `design.*` operation; it never reconstructs a hash
from local JSON serialization.

The Builder component-catalog read also projects the authoring subset of the
same pinned Design System contract: the unique default light theme key,
declared breakpoints, and a stable sorted token list containing path, type,
theme-resolved value, deprecation state, and replacement path. The projection
is derived from the exact Design System version/checksum and registered
component catalog already pinned by the Site Revision. Missing themes, token
cycles, invalid aliases, or type-invalid resolved values fail explicitly.
Admin must not maintain a local token catalog or submit arbitrary token paths.

## 33. Wave 3M revision-pinned AI Design generation contract

`POST /projects/{projectId}/builder/generations` accepts `targetStage=design`
through the existing durable generation resource. The request retains the
exact base Site Revision and ETag, ordered typed targets, one direct `agentId`
or Run-backed `agentRunId`, objective, locale, candidate count, and optional
Knowledge references. Every Design target must already have one manifest-pinned
Content Version and a valid Wireframe.

Before publishing the Job, the service resolves and persists one immutable
`designContext` containing:

- every exact target kind, item ID, expected draft version, source Wireframe
  checksum, complete Wireframe, and current Visual Blueprint when present;
- the exact Design System manifest/version/checksum selected by the base Site
  Revision;
- the exact component catalog version/checksum used by the renderer and Design
  analyzer.

The separately persisted Builder context proves workspace, project, Site
Revision, manifest hash, structure, and version pins. The Job never reconstructs
its prompt from mutable latest state. Recovery, cancellation, actor
revalidation, fencing, idempotency, progress, partial-candidate behavior, and
terminal projection use the existing generation authority.

The provider exposes exactly one forced structured Tool,
`submit_builder_design_candidate`. Its schema contains a summary plus a
non-empty tuple from the existing closed operation family only:
`design.initialize`, `design.style.set`, `design.style.clear`,
`design.responsive_style.set`, and `design.responsive_style.clear`. Output is
invalid unless operation IDs are unique, every selected target is covered, all
target/version/Wireframe pins match, initialize appears exactly when a target
has no current Blueprint, and all section, state, style-slot, breakpoint, token
path, and token-type references exist in the frozen context. Coverage may be
sparse at style-slot level; the model is not required to override every
catalog slot.

Each valid provider candidate is passed to the canonical ChangeSet Preview
service with Agent provenance and `builder.design.apply`. The analyzer remains
authoritative for normalized Blueprint projection, contract validation,
affected targets, issues, approval class, signed Preview token, and replay
snapshot. The generation record stores only candidate ChangeSet references and
structured failures; it does not store a second canonical Blueprint.

`builder.design.generate` and `builder.design.apply` are stable grants. The
official Coordinator and Visual Designer receive both; Run-backed generation
requires Build mode and an explicit approval interrupt. Approval starts a
generation only. It does not approve or Apply a candidate. Direct Editor
selection and approved conversation Tools converge on the same generation
service and Job contract.

Apply remains the existing
`POST /projects/{projectId}/builder/change-sets/{changeSetId}/apply` command.
It verifies the signed Preview, approval, current Revision/ETag, Content
Version, Wireframe checksum, Design System and catalog pins, then writes complete
immutable Content Versions and one next Site Revision. No valid candidate is
automatically applied, rebased, or represented as publication success.

The contract deliberately excludes asset or SEO operations until their
authorization and renderer contracts exist. It also excludes model-authored
CSS/HTML/JSON patches, arbitrary component replacement, latest-state prompt
rebuilds, Wireframe fallbacks for invalid Blueprints, and best-effort partial
target writes.

## 36. Website Config typed settings authority

Website Config has three backend-owned typed projections over the internal
project Core Settings row:

| Facade | Owned fields | Activity event |
| --- | --- | --- |
| Identity | `site.name`, `name_i18n`, `subtitle`, `description`, `description_i18n`, `contact_email` | `project.website.identity.updated` |
| Discovery | `site.logo_*`, `site.favicon_*`, `seo.og_image_*`, `title_policy_v1`, `robots_directive`, `sitemap_enabled` | `project.website.discovery.updated` |
| Localization | supported/default/fallback locales, timezone/browser-time policy, date-format/relative-time policy | `project.website.localization.updated` |

The Identity facade deliberately excludes `site.url`; Domains is the only
public-address authority. Discovery accepts the existing Open Graph storage
aliases when reading and hard-cuts them to canonical `seo.og_image_*` keys when
that typed field is next changed. Localization writes the legacy `locale` key
only as a mirror of `default_locale`, never as an independently editable field.

Every projection has a frozen Pydantic schema and a canonical quoted SHA-256
ETag over normalized camel-case JSON. ETags are per facade rather than per Core
row, so unrelated Website Config sections do not conflict. Replace operations
require the exact prior ETag, materialize the unique project/Core identity row
when absent, acquire `SELECT FOR UPDATE`, validate the merged Core document,
and write only semantically changed owned fields. All other sections and
unknown internal keys are immutable from the facade and remain preserved.

ETag mismatch returns HTTP conflict semantics through stable code
`PROJECT_WEBSITE_SETTINGS_ETAG_MISMATCH` with `facade` and `currentEtag`
metadata. Invalid persisted owned data returns
`PROJECT_WEBSITE_SETTINGS_INVALID`. Neither case falls back to defaults after
an explicit invalid value is present.

Material changes and their facade-specific Activity event commit in one
transaction. Evidence contains exact changed paths and previous/next ETags,
plus `api` or `agent` provenance, but no field values. No-op replacement does
not update the row or emit Activity.

## 37. Project General typed identity authority

Project General now has one backend-owned identity projection over the
canonical Project row. It owns the team-facing `name`, `description`,
`icon_mode`, `icon_color`, `icon_glyph`, `icon_emoji`, and `icon_url` fields.
It deliberately excludes slug, authoring mode/state/revision, runtime state,
archive, deletion, visitor identity, Domain selection, and Website Config.

The projection is a frozen, extra-forbidden Pydantic model. Names and optional
text are normalized at the boundary; icon colors use canonical six-digit
lowercase hex, and glyph/emoji/image modes require exactly their active value.
Inactive legacy icon slots are projected as null rather than becoming a second
active icon source. An invalid active persisted icon fails explicitly with
`PROJECT_GENERAL_IDENTITY_INVALID`.

The facade computes a quoted SHA-256 ETag over normalized camel-case JSON.
Replacement requires the exact prior ETag, locks the Project row with
`SELECT FOR UPDATE`, and updates only semantically changed owned columns. A
stale write fails with `PROJECT_GENERAL_IDENTITY_ETAG_MISMATCH`, the `identity`
facade, and the current ETag. Semantic no-op replacement performs no update.

A material change and `project.general.identity.updated` Activity evidence
commit in one transaction. Evidence contains Project/workspace identities,
exact changed `project.*` paths, previous/next ETags, and `api` or `agent`
provenance; it does not duplicate the name, description, icon value, or URL.
