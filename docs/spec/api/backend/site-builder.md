# Site Builder Backend Contracts

This code-spec defines the canonical backend ownership, persistence, command, revision, preview, and publish contracts for the Arclayer creation editor.

It implements the Builder portion of `docs/spec/shared/ai-website-builder-platform.md`. Existing content, route, hierarchy, presentation, component-binding, release, publish, delivery, Asset, and Activity contracts remain authoritative where this document composes them.

## 1. Scope and trigger

Read this spec before changing:

- `apps/api/src/modules/projects/builder/**`.
- page content, route, hierarchy, presentation, or component-binding behavior used by the Builder.
- Site Revision, ChangeSet, Builder generation, preview artifact, or authoring-mode persistence.
- `/projects/{projectId}/builder/**` Admin API routes.
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

Preview/thumbnail capture uses a short-lived audience-limited preview credential, fixed capture profile, and explicit renderer readiness. It does not reuse an operator browser session or expose editor/private data.

## 12. Admin API surface

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
- preview credential scope and private-data exclusion.
- Activity/event coverage and generated OpenAPI/client alignment.

Required cross-layer evidence:

- authenticated brief → Sitemap candidate → apply → Wireframe → Style Guide → Design → preview → publish.
- visual/structural diff and stale conflict UI.
- source-managed project refusal and explicit migration-required UI.
- refresh/cancel recovery for generation and publish Jobs.

Run `pnpm api:check` for backend-only implementation and `pnpm check` for cross-app changes. Review-sensitive changes also run the canonical changed-scope code review engine.

## 17. Wave 2A implementation evidence (2026-07-20)

Wave 2A implements the backend foundation of Wave 2. It does not switch the Admin `/editor` route and does not claim the Sitemap canvas, ChangeSet, generation, renderer, or publish pipeline as complete.

Implemented contracts:

- `ProjectAuthoringMode` is explicitly `builder_managed` or `source_managed`. New Project creation requires the mode in both the HTTP schema and Workspace AI create-project Tool contract.
- existing Projects migrate with `authoring_mode = null`, `authoring_state = migration_required`, and `authoring_revision = 1`; no service infers a mode from current content or source state.
- `ContentStructureRevisionRecord`, `SiteRevisionManifestRecord`, `SiteRevisionStatusRecord`, and `BuilderInitializationCommandRecord` persist in the tenant schema. The Site Revision manifest contains immutable authoring inputs only; mutable readiness remains in the one-to-one status projection.
- `POST /api/v1/projects/{projectId}/builder/initializations` requires `Idempotency-Key`, the exact Project authoring revision, Site, preview Environment, Design System assignment revision, Design System version/checksum, and explicit provenance. Agent provenance additionally requires `agentRunId`; non-Agent provenance rejects it.
- initialization locks the Project and exact Design System assignment, verifies the assignment/version/validation checksums, snapshots canonical route/hierarchy/content state, pins exact Content Versions and presentation/binding hashes, and creates the root structure revision, manifest, status, Activity event, and idempotency result in one transaction.
- exact replay returns the first result snapshot. Reusing the key with a different request fails with `BUILDER_IDEMPOTENCY_CONFLICT`. A later Design System assignment does not mutate the retained root manifest or status.
- `GET /api/v1/projects/{projectId}/builder` composes authoring authority, primary Site, default preview Environment, retained current manifest/status, initialization requirement, and stable blocker codes without writing or auto-initializing data.
- the root status is intentionally `draft`. An empty Site reports `BUILDER_SITE_EMPTY`; the current foundation Design System reports `DESIGN_SYSTEM_RENDERER_NOT_READY` and `DESIGN_SYSTEM_PUBLICATION_NOT_READY` until real renderer/publication evidence exists.
- public migration `0044_auto_20260720_2323` adds the Project authority fields and four Builder tables after `0043`; tenant-control migration v17 clones the four tables for existing/new tenant schemas. The generated OpenAPI client exposes the required authoring fields and both Builder endpoints.

Implementation boundaries remain explicit:

- typed ChangeSet preview/apply, stale-base conflict, approval checkpoints, and partial saga state are not implemented.
- Builder generation Jobs, Agent Builder context, and `builderContext=true` remain gated.
- Sitemap full-screen editing, `/editor` hard cut, undo/redo, Wireframe, Style Guide, and Design are not implemented by Wave 2A.
- preview renderer readiness, preview artifacts, candidate build, publication readiness, and release activation remain gated; no synthetic Site Revision or mock-ready projection exists.

Verification evidence:

- Builder pure contract tests: 11 passed, including deterministic structure/locales, exact Content Version selection, stable presentation/binding hashes, manifest hash recomputation, provenance validation, and authoring-mode refusal.
- Project authoring/Workspace AI/Builder targeted unit group: 81 passed.
- Project Activity integration: 2 passed.
- Workspace Design System + immutable Agent Run context + Builder HTTP lifecycle: 1 passed, including exact replay, conflicting replay, and assignment-change isolation.
- public clean migration to `0044`: passed; tenant schema v17/table readiness: passed.
- OpenAPI package typecheck and Admin typecheck: passed after explicit legacy Project fixtures were updated.
- `pnpm api:check`: 2098 passed, 435 skipped, 26 warnings; 4/4 tasks passed.
- `pnpm admin:check`: 1413 passed; 4/4 tasks passed.
- `pnpm check`: 8/8 tasks passed.
- changed-scope code review report: `status=ok`, zero enforcement-blocking findings, 45 report-only prototype findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings). The report is not described as zero findings.
- GitNexus reported high aggregate risk for the large working tree (158 indexed changed files and 14 affected processes), but its index does not cover the many untracked Wave files; live code, generated contracts, database tests, HTTP tests, and full quality gates are the authoritative evidence.

## 18. Wave 2B ChangeSet preview evidence (2026-07-21)

This historical slice records the persisted, typed Sitemap preview checkpoint before apply was activated. Preview deliberately performs no target-domain write; the later apply state is recorded in section 19.

Implemented contracts:

- `BuilderChangeSetRecord` persists the exact workspace/project/Site/Environment/base Site Revision, normalized typed operations, canonical operation hash, affected targets, issues, permission intersection, approval class, expiry, provenance, and apply lifecycle placeholders. `BuilderChangeSetCommandRecord` persists exact preview/apply idempotency outcomes under `(project, commandKind, Idempotency-Key)`.
- the public preview request is a closed discriminated union for `page.create`, `page.rename`, `page.move`, `page.reorder`, `page.delete`, `route.set`, and `route.disable`. Unknown fields and operations are rejected. Public provenance is limited to `human | agent`; import/system provenance is reserved for future trusted internal command entry points.
- `POST /api/v1/projects/{projectId}/builder/change-sets/preview` requires `project:content:site-builder:write` and `Idempotency-Key`. The request must carry the exact latest `baseRevisionId` and manifest ETag; there is no default revision, rebase, or Site/Environment inference outside the canonical project runtime and default preview Environment.
- preview locks the Project/current Site Revision, verifies immutable manifest and Content Structure hashes, validates route normalization/uniqueness, dynamic-route source contracts, page/version targets, hierarchy cycles, delete conflicts, and operation ordering, then writes only the ChangeSet, command snapshot, and `project.builder.change_set.previewed` Activity in one transaction.
- affected Content Model targets use an explicit `targetKey`; persisted page/route/hierarchy targets use UUIDs and proposed page targets use `clientTargetId`. `page.delete` is classified `destructive` with visible impact evidence; Agent proposals are at least `review`.
- Agent provenance must resolve to a real Agent Run owned by the same actor in the same workspace/project and bound to the exact base Site Revision. Since Agent Builder context remains gated in this slice, an older unbound run fails with `AGENT_BUILDER_CONTEXT_REQUIRED`; the service does not forge or infer a binding.
- the preview token is purpose-bound to `builder_changeset_apply` and signs actor/workspace/project/Site/Environment/base revision/base ETag/operation hash/UTC expiry. Only its SHA-256 hash is persisted. The idempotency command snapshot excludes the raw token; exact replay deterministically rebuilds the same token from retained claims.
- reusing an idempotency key with different actor/input fails with `CHANGE_SET_IDEMPOTENCY_CONFLICT`. A stale manifest ETag fails with `SITE_REVISION_STALE`. Invalid/tampered/wrong-purpose/expired token contracts fail explicitly and never degrade to an unsigned preview.
- public migration `0045_auto_20260721_0009` adds the two ChangeSet tables after `0044`; tenant-control migration v18 clones them into existing/new tenant schemas. Generated OpenAPI types expose the closed operation union and preview endpoint.

Self-review boundaries at this preview-only checkpoint were:

- `POST /builder/change-sets/{changeSetId}/apply` is not implemented. No canonical Content item/version, route, hierarchy, Content Structure Revision, Site Revision, status, release, or artifact is mutated by preview.
- approval checkpoints are represented by `approvalClass` only; apply-time approval verification, fresh authorization/entitlement/Tool-grant intersection, atomic canonical writes, next-revision construction, undo evidence, and partial-saga state remain required.
- Builder generation Jobs and Agent Builder context remain gated; `builderContext=false` remains truthful.
- the full-screen Sitemap scene and old `/editor` hard cut remain gated until apply and generation are complete.

Verification evidence:

- Builder ChangeSet/token/persistence plus existing snapshot unit group: 26 passed. Coverage includes duplicate IDs/deletes, provenance identity, move/reorder, cycles, missing/stale targets, route conflicts, dynamic-route source requirements, destructive approval, repeated disable visibility, timezone-aware expiry, token round-trip/tampering/wrong audience/expiry, token hashing, raw-token exclusion, and deterministic replay.
- Workspace Design System + Agent Run + Builder initialization + ChangeSet HTTP lifecycle: passed with real tenant/RBAC context, including unbound Agent refusal, normalized preview, persisted tenant records, exact replay, idempotency conflict, stale ETag, zero target revision mutation, and transactional Activity evidence.
- public clean migration through `0045`: passed; tenant schema v18/table readiness: passed.
- OpenAPI generation, OpenAPI typecheck, API typecheck, and Admin typecheck: passed. API typecheck retains only the three previously known test warnings.
- `pnpm api:check`: 2113 passed, 435 skipped, 26 warnings; 4/4 tasks passed.
- `pnpm admin:check`: 1413 passed; 4/4 tasks passed.
- `pnpm check`: 8/8 tasks passed.
- changed-scope code review report: `status=ok`, zero enforcement-blocking findings, 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings). No finding points at the new Builder ChangeSet preview files, and the report is not represented as zero findings.

## 19. Wave 2B Sitemap ChangeSet apply evidence (2026-07-21)

This slice completes the first canonical Sitemap apply path over the typed preview protocol. It does not broaden apply to Wireframe, Style Guide, Design, assets, release activation, or arbitrary cross-domain operations.

Implemented contracts:

- `POST /api/v1/projects/{projectId}/builder/change-sets/{changeSetId}/apply` requires `Idempotency-Key`, `project:content:site-builder:write`, `project:content:items:write`, the raw purpose-bound preview token, and the exact Builder approval checkpoint for `review` or `destructive` changes.
- apply locks the Project, ChangeSet, latest Site Revision, base status, and approval checkpoint; it verifies the token signature/hash and exact actor/workspace/project/Site/Environment/base revision/base ETag/operation hash/expiry binding. It re-hashes persisted operations and re-derives current Content structure, selected Content Versions, presentations, and component bindings. Any drift fails with `SITE_REVISION_STALE`; there is no implicit rebase.
- human approval is a typed `BuilderChangeSetApprovalRecord` bound one-to-one to the immutable ChangeSet, requester, operation hash, approval class, and expiry. The current atomic endpoint performs `pending → consumed` while writing `approvedBy`, `approvedAt`, and `consumedAt` in the apply transaction. `approved` is reserved for a future separately persisted approval action and is not emitted by this atomic path.
- Agent-origin apply additionally requires a real actor-owned Run bound to the exact base Site Revision, `build` execution mode, a pinned lead Agent version, and an exact Tool grant. Plan mode and absent grants fail explicitly; the service does not infer or forge Builder context.
- `page.create`, `page.rename`, `page.move`, `page.reorder`, `page.delete`, `route.set`, and `route.disable` execute in operation order. Content creation/rename/deletion go through caller-transaction-aware canonical Content commands; route and hierarchy mutations use canonical routing helpers rather than Builder-owned ORM writes.
- Content lifecycle `before_*` handlers and required Activity writes execute inside the caller-owned tenant transaction. `after_*` lifecycle/runtime effects are retained as typed hooks and dispatched only after the outer transaction commits; a rollback cannot publish a false success event.
- apply creates the next immutable Content Structure Revision and Site Revision, supersedes the base status, creates a new draft status, pins exact Content Versions and presentation/binding hashes, updates the ChangeSet, consumes approval, writes `project.builder.change_set.applied`, and stores the APPLY command snapshot in the same transaction. Empty-site readiness is re-derived in both directions as pages are created or the last page is deleted.
- exact APPLY replay returns the committed snapshot without rewriting domains or Activity. Reusing a different key after application returns `CHANGE_SET_ALREADY_APPLIED`; reusing the same key with a different fingerprint returns `CHANGE_SET_IDEMPOTENCY_CONFLICT`. The raw preview token is never stored in the ChangeSet, apply result, Activity, or command snapshot.
- public migration `0046_auto_20260721_0053` adds `builder_change_set_approvals` after `0045`; tenant-control migration v19 clones it into existing and new tenant schemas. Generated OpenAPI now includes preview approval output, apply input/output, and the apply SDK operation.

Self-review boundaries remain explicit:

- durable Builder generation Jobs and Agent Builder context are still gated; `builderContext=false` remains truthful and older unbound Agent Runs remain unusable for Builder apply.
- the current endpoint covers tenant-atomic Sitemap operations only. Future Wireframe/Design/Asset/Connector operations must either participate in a proven common transaction or implement the durable saga contract from section 7.2; no partial-success fallback exists.
- Builder entitlement enforcement remains part of the commercialization/entitlement wave. Current apply enforces the two project permissions and Agent Tool grant but does not claim a product-plan entitlement boundary that is not yet implemented.
- undo evidence, full-screen Sitemap editing, `/editor` hard cut, renderer artifacts, candidate build, publication readiness, and release activation remain pending.

Verification evidence:

- the full tenant/RBAC Design System + Agent Run + Builder HTTP lifecycle passes with create/apply, exact replay, applied-key refusal, destructive approval requirement/consumption, delete/apply, revision `1 → 2 → 3`, status supersession, empty-site finding restoration, stale preview refusal, token non-persistence, and exact Activity ordering.
- transaction/lifecycle, approval/token binding, Agent Build/Tool grant, live structure/version/presentation drift, and Content rename presentation-copy tests pass in focused unit suites.
- public clean migration through `0046` and tenant schema v19 readiness pass; generated OpenAPI succeeds; API typecheck retains only the three previously known test warnings.

## 20. Wave 2C durable Sitemap generation evidence (2026-07-21)

This slice activates immutable Agent Builder context and durable Sitemap candidate generation over the ChangeSet preview/apply protocol. It does not activate the full-screen editor, automatically apply a candidate, or broaden generation to Wireframe, Style Guide, Design, assets, builds, or publication.

Implemented contracts:

- an Agent Run created with an exact `siteRevisionId` resolves and locks the latest Site Revision, status, Content Structure Revision, manifest, and matching Design System context. `ai_run_builder_snapshots` stores one immutable, hash-verified Builder context per Run, including exact workspace/project/Site/Environment/revision identities, manifest/status/structure hashes, the typed manifest and structure snapshot, context hash, and serialized byte size. Revision drift, missing state, and Design System mismatch fail explicitly; no current-state fallback is reconstructed later.
- the Agent runtime loads that retained snapshot into the Run execution prompt as untrusted project data. Workspace Design System capabilities now truthfully expose `builderContext=true`; older Runs without the snapshot remain invalid for Builder generation.
- `POST /api/v1/projects/{projectId}/builder/generations` requires `project:content:site-builder:write`, `Idempotency-Key`, the exact latest base revision/ETag, a creator-owned revision-bound Agent Run, and the pinned Agent version's `builder.sitemap.generate` Tool grant. The deterministic generation identity is a public-ID-compatible UUID v4 derived from workspace/project/idempotency key; exact replay returns the first projection and a different request fingerprint fails with `BUILDER_GENERATION_IDEMPOTENCY_CONFLICT`.
- `BuilderGenerationRecord` persists the exact intent, owning Job, base Site/Environment/revision/manifest/ETag, actor/Run/Tool provenance, selected pages, Knowledge references, candidate count, structured failures, and terminal state. Generation creation, the public Background Job, dispatch outbox, tenant record, and `project.builder.generation.created` Activity commit atomically before publication.
- `builder.sitemap.generate` v1 runs on `agent-io` as an owner-only, actor-revalidated Project Job requiring `project:content:site-builder:write`. Its generic Project target contains workspace/project/runtime/environment but deliberately leaves generic `site_id` null; exact Site identity remains bound by the generation record, base revision, manifest hash, and typed Job input. Worker authorization re-resolves the exact Project and rejects workspace drift or revoked Project permission before a new effect.
- the Job has `queued → preparing → generating → previewing → finalizing` progress, every phase is cooperatively cancellable, `retryClass=none`, and `maxAttempts=1`. Model calls are not automatically retried because duplicate non-deterministic generation is not assumed safe. A queued cancel records only `cancelRequestedAt`; `cancelled` and `cancellationAcknowledgedAt` are projected only after the worker observes the request and stops effects.
- each model request forces exactly one `submit_builder_sitemap_candidate` function Tool call whose parameters are the Pydantic JSON Schema for a non-empty closed `BuilderSitemapCandidateV1`. The immutable Builder snapshot is explicitly treated as untrusted data. Provider failure stops later candidates with `BUILDER_GENERATION_PROVIDER_FAILED`; malformed or unsupported Tool output records `BUILDER_GENERATION_OUTPUT_INVALID` and may continue to the next requested candidate.
- each valid candidate is server-validated through the canonical Agent-origin ChangeSet preview path with Tool provenance `builder.sitemap.apply`. Candidates are durable typed ChangeSets, never raw model payloads and never direct Site mutations. All candidates succeeding yields `succeeded`; mixed success/failure yields `partial`; zero candidates yields an explicit failed Job. Replay skips already persisted candidate indexes, preserves completed candidates across cancellation, and returns an existing terminal outcome without repeating model or preview effects.
- every generation state write and candidate/failure/terminal commit runs under the active Job fence. Lease or generation loss prevents the stale worker from writing. The typed Job result must bind the exact generation ID and base Site Revision. Public generation projections rebuild authorized ChangeSet previews from retained command evidence and never persist raw preview tokens.
- public migration `0047_auto_20260721_0158` adds `ai_run_builder_snapshots` and `builder_generations` after `0046`; tenant-control migration v20 clones both tables into existing and new tenant schemas. Generated OpenAPI exposes the create/get/cancel requests, projections, SDK operations, and closed generation status union.

Implementation boundaries remain explicit:

- generation produces reviewable Sitemap ChangeSet candidates only. Candidate selection and apply remain explicit human/Agent commands with the existing approval, Tool-grant, stale-base, and token contracts; there is no auto-apply path.
- undo/redo evidence, the full-screen Sitemap scene, and the `/editor` hard cut remain pending.
- Wireframe, Style Guide, Design, renderer artifacts, project/site thumbnails, candidate builds, publication readiness, release activation, and commercialization entitlement enforcement remain in later waves.

Verification evidence:

- 106 focused Job actor/boundary/registry/composition and Builder generation contract/provider/handler tests pass, including exact Tool schema/call parsing, provider/output failures, partial/all-failed outcomes, replay, cancellation, reconciliation, and fenced lease-loss behavior.
- the real tenant/RBAC Design System + Agent Run + Builder lifecycle integration passes generation create, exact replay, conflicting replay, read, cooperative cancel request, persisted tenant/public/outbox records, token non-persistence, Activity ordering, and the earlier ChangeSet apply lifecycle.
- public clean migration through `0047` and tenant schema v20/table readiness pass.
- generated OpenAPI succeeds; API typecheck retains only the three previously known test warnings.
- `pnpm api:check`: 2169 passed, 435 skipped, 26 warnings; 4/4 tasks passed.
- `pnpm admin:check`: 1413 passed; 4/4 tasks passed.
- `pnpm check`: 8/8 tasks passed.
- changed-scope review reports `status=ok`, zero enforcement-blocking findings, and 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); it is not represented as zero findings.

## 21. Wave 2D immutable revision reader and Sitemap editor evidence (2026-07-21)

This slice activates the first full-screen Sitemap authoring client over the Wave 2 aggregate. It does not claim Wireframe, Style Guide, Design, undo/redo, renderer preview, or publication activation.

Backend read contract:

- `GET /api/v1/projects/{projectId}/builder/revisions/{revisionId}` requires `project:site:read` and returns one immutable `BuilderRevisionOut`, not current mutable Content rows.
- the reader resolves the tenant/project/workspace-owned Site Revision, revalidates the manifest hash, loads the exact referenced Content Structure Revision in the same read transaction, revalidates its snapshot hash and Site/Environment identity, and requires the retained readiness status projection.
- page summaries are projected by batching the Content Versions referenced by the manifest pins. Every page must have an exact matching content-version ID, item ID, version number, and retained title; missing or mismatched evidence fails with `BUILDER_CONTENT_VERSION_REQUIRED` instead of falling back to the current item title.
- each page summary exposes only Sitemap needs: exact item/content-version identity, version number, title/summary, parent/order, and retained locale routes. It does not embed mutable editor state or full stage payloads.
- generated OpenAPI now exposes `BuilderRevisionOut`, `BuilderRevisionPageOut`, and `domainProjectsGetProjectBuilderRevision`.

Client command and reconciliation contract:

- `/projects/{projectId}/editor` reads the composed Builder projection and then the exact immutable revision projection. It does not rebuild a graph from the current Content library or old source-manifest APIs.
- human page creation is a two-step typed command: the dialog submits `page.create` to ChangeSet preview with exact base revision/ETag and only offers apply after a real preview. Apply carries the signed preview token and approval evidence when required; there is no local page insertion before the new revision is returned.
- AI generation selects only available Build-capable Agents with the exact `builder.sitemap.generate` Tool grant. The client creates a project Thread, creates an exact `siteRevisionId`-bound Agent Run, then creates the durable generation using that Run ID and base revision/ETag. It polls the persisted Job, exposes partial/failure/cancellation state, and never auto-applies a candidate.
- candidate apply carries the exact retained ChangeSet ID, raw authorized preview token, and typed approval decision. Success invalidates the Builder aggregate and reconciles from the next server revision.

Verification evidence:

- immutable revision projection unit tests: 3 passed, covering exact pinned title/route projection, cross-workspace not-found behavior, and missing pinned-version failure.
- the real tenant/RBAC Builder integration passes initialization plus revision GET, revision-bound Agent Run, durable generation, preview/apply, persistence, and Activity assertions.
- `pnpm api:check`: 2172 passed, 435 skipped, 26 warnings; 4/4 tasks passed. API typecheck retains only the three previously known test warnings.
- `pnpm check`: 8/8 cross-app tasks passed.
- changed-scope review reports `status=ok`, zero enforcement-blocking findings, and the same 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); no new revision-reader or Editor file is reported.
- the real browser confirmed the dedicated full-screen scene and productized API error boundary, but every Admin API request returned gateway-level 502 during visual verification. Successful real-data canvas rendering is therefore not recorded as browser-verified by this slice.

Remaining backend boundaries are unchanged: exact undo/redo commands, stage-specific Wireframe/Style/Design projections, preview artifacts/builds, publication readiness/activation, and commercial entitlement enforcement remain in later waves.

## 22. Wave 3A immutable Wireframe read contract evidence (2026-07-21)

This slice activates the first Wireframe projection without claiming Wireframe mutation, AI generation, rendering, or publishability.

Backend contract:

- `ContentPresentationKind.WIREFRAME` is a first-class value for page and reusable-section presentation policies. Generated migration `0048_auto_20260721_0349` updates the enum field contract; OpenAPI generation exports the new presentation value and Wireframe schemas.
- `WireframeDocumentV1` is strict and immutable at the API boundary. It pins the exact page item, Design System version, and component-catalog version. Each ordered section has stable section/intent/component/variant identity, typed field/literal/missing content bindings, bounded responsive rules, interaction rules, Asset references, and uniqueness validation for section IDs, intent IDs, slot keys, and breakpoints.
- the immutable revision reader now loads Presentation Documents and Component Bindings for the exact manifest-pinned Content Version IDs. It recomputes every page presentation/binding hash and the aggregate presentation hash before returning stage data. Drift fails with `BUILDER_PRESENTATION_SET_INVALID`; malformed, duplicated, wrong-page, or wrong-Design-System Wireframe evidence fails with `BUILDER_WIREFRAME_INVALID`.
- a missing Wireframe remains a valid explicit `null` projection. The reader does not substitute `VISUAL_BLUEPRINT`, current mutable Content, or a generated placeholder.

Focused evidence:

- 8 focused backend tests pass, including exact Wireframe projection, cross-workspace isolation, missing pinned Content evidence, wrong Design System pin, structurally invalid duplicate sections, presentation hash drift, and updated official page/reusable-section policies.
- API typecheck returns only the three pre-existing test diagnostics; OpenAPI typecheck passes and generated clients expose `BuilderRevisionPageOut.wireframe`, `WireframeDocumentV1`, and the typed nested contracts.
- final cross-app `pnpm check` passes all 8 Turbo tasks from cache misses: API has 2175 passed, 435 integration-disabled skips, and 26 existing warnings; Admin has 317 files and 1410 tests passed.

Still gated: typed Wireframe ChangeSet operations, canonical Content Version creation on composition changes, Agent Wireframe generation, registered visitor component-catalog validation, preview renderer artifacts, Style Guide writes, and Design writes.

## 23. Wave 3B typed Wireframe ChangeSet and immutable write evidence (2026-07-21)

This slice closes the first Wireframe write loop without turning browser state or arbitrary model JSON into composition authority.

Command contract:

- `BuilderChangeSetPreviewRequest.operations` is now one closed discriminated union spanning Sitemap and Wireframe families. Wireframe v1 supports explicit initialization, section add/duplicate/remove/reorder, component and variant replacement, binding set/clear, responsive rule set/clear, and interaction-set replacement. Opaque JSON Patch and whole-document replacement remain forbidden.
- one ChangeSet cannot mix Sitemap and Wireframe families. This is a correctness boundary: Sitemap mutations may change Content Version identity while Wireframe operations are pinned to the same base version. Cross-family orchestration requires a later explicit saga/aggregate command; it is not silently sequenced or rebased.
- preview loads the exact manifest-pinned Content Versions, Presentation Documents, and Component Bindings, revalidates per-page and aggregate hashes, applies typed operations in request order, and returns `wireframeCandidates`. Preview performs no target-domain write.
- section removal is classified as destructive and creates a bound approval checkpoint. Agent-origin Wireframe proposals remain review-class unless a destructive operation raises the class. Stable localized conflicts expose missing Wireframe, duplicate initialization, invalid index, missing section, invalid binding, stale revision, and invalid presentation evidence.

Apply and persistence:

- Apply revalidates the signed preview token, exact latest Site Revision, live structure/presentation inputs, approval, actor, execution mode, Agent Tool grant, and operations hash under the existing transaction boundary.
- all operations targeting one page are folded into one server candidate and one `ProjectContentWireframeTransactionCommand.replace_wireframe` call. The command locks the exact item/version pin, creates one new immutable Content Version, preserves the full field snapshot, Presentation set, SEO projection, and exact Component Binding sort order, replaces only `WIREFRAME`, writes Activity, and returns an after-commit effect.
- the same tenant transaction creates the next Content Structure Revision snapshot, immutable Site Revision manifest, page-version/presentation hashes, status transition, approval consumption, Activity, and idempotent apply result. Existing Content Versions are never edited in place and stale input never auto-rebases.
- Sitemap and Wireframe commands remain separate injected canonical collaborators. Builder owns orchestration, not direct Content ORM mutation.

Focused evidence currently passes 58 Builder/Content tests covering the full typed operation fold, initialization, missing/stale targets, destructive approval, one-version-per-page apply, exact Presentation/Binding copy, preview/apply persistence, drift rejection, and immutable revision projection. API typecheck has only the three pre-existing test diagnostics. Regenerated OpenAPI and client typecheck expose the full request union, output union, and server Wireframe candidates.

Final cross-app verification runs from cache misses and passes all 8 Turbo tasks: API has 2183 passed, 435 integration-disabled skips, and 26 existing warnings; Admin has 317 files and 1411 tests passed. Changed-scope review is `status=ok` with zero enforcement-blocking findings and the existing 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); no new Wireframe ChangeSet/transaction/editor file is reported. `git diff --check` passes.

Still gated: registered component-catalog compatibility and required-slot validation, global-section dependency/cycle analysis, Agent Wireframe generation Jobs and Tool grants, multi-family aggregate sagas, preview renderer artifacts, server undo/redo, Style Guide writes, and Design writes.

## 24. Wave 3C registered component catalog and atomic configuration evidence (2026-07-21)

This slice closes the registered-component compatibility boundary without claiming a visitor renderer, compiler artifact, or publication readiness.

Catalog authority:

- `arclayer-wireframe-v1` is an immutable packaged JSON manifest with checksum `sha256:4e0ac533318237a2f30d526450e9a802af16712e1039836e2149b42bbacd93e2`. It declares five official components, localized product metadata, variants, slots/value kinds/binding kinds, responsive limits, interaction pairs, style slots, and renderer/compiler identity.
- one strict schema plus injectable `ComponentCatalogResolver` is shared by Builder and Design Systems. Browsers, generators, validators, and future renderers do not maintain independent component dictionaries.
- `GET /api/v1/projects/{projectId}/builder/component-catalog` resolves the exact Site Revision, exact Design System version/checksum, and exact registered catalog. Missing, mismatched, or incompatible evidence fails explicitly.

Preview/apply compatibility:

- Wireframe Preview resolves the exact catalog pinned by the validated Design System context and turns unknown component/variant/slot, missing required slot, unsupported binding kind, invalid literal type, unsupported responsive rule, and unsupported interaction into stable blocker findings.
- Apply re-resolves the same exact Design System and catalog and repeats compatibility validation under the canonical transaction boundary. A blocker raises `BUILDER_CHANGE_SET_BLOCKED` before `ProjectContentWireframeTransactionCommand` can create a Content Version.
- `wireframe.section.configure` is one closed typed operation that replaces a section's component, variant, complete bindings, complete responsive rules, and complete interaction rules while preserving stable section identity and non-composition metadata. It lets a caller supply a valid new component contract in one Preview instead of creating an intentionally blocked intermediate candidate.
- the legacy fine-grained typed operations remain valid for single-contract edits. Neither operation family permits opaque document replacement, blocker Apply, browser authority, silent slot defaults, or automatic rebase.

Focused evidence currently passes 24 catalog/Design System/generation/Wireframe backend tests, including atomic configuration and no-write blocker Apply; the real Workspace Design System integration passes both Workspace and revision-bound Project catalog reads. API lint, generated OpenAPI typecheck, and API typecheck pass with only the three known unrelated test diagnostics.

Final cross-app `pnpm check` passes all 8 tasks from cache misses: API has 2191 passed, 435 integration-disabled skips, and 26 existing warnings; Admin has 317 files and 1413 tests passed.

Still gated: plugin-contributed catalogs, global-section dependency/cycle validation, Agent Wireframe generation, a real shared visitor React renderer, catalog-backed rendered preview, deterministic compiler artifacts, publication readiness, and successful real-data browser capture.
- `pnpm api:check`: 2144 passed, 435 skipped, 26 warnings; 4/4 tasks passed. API typecheck retained only the three previously known test warnings.
- `pnpm admin:check`: 1413 passed; 4/4 tasks passed.
- `pnpm check`: 8/8 tasks passed.
- changed-scope code review: `status=ok`, zero enforcement-blocking findings, and 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings). The report contains no finding in the new Builder apply/Content transaction files and is not represented as zero findings.

## 25. Wave 3D explicit Design System refresh ChangeSet evidence (2026-07-21)

This slice activates the revision-bound refresh command required after accepting and assigning an immutable project Design System version. It does not make assignment itself rewrite the canvas, Site Revision, or active release.

- `design-system.refresh` is a strict Builder operation carrying the expected assignment revision, exact Design System/version public IDs, exact manifest checksum, and exact validation finding hash. Design System operations cannot mix with Sitemap or Wireframe operations, and one refresh ChangeSet contains exactly one operation.
- Preview resolves the Project-owned exact assignment, valid immutable version, validator-v2 finding, and registered component catalog. Assignment, checksum, finding, catalog, or compatibility drift fails explicitly; the service does not select a newer version or reconstruct a floating default.
- human and Agent refreshes require `review` approval. The server returns one `design_system` affected target and public-ID summary values; internal UUID strings are not exposed through `summaryParams`.
- Apply re-resolves the same exact Design System evidence inside the canonical transaction. It creates the next immutable Site Revision, supersedes the base status, and creates the next draft status while changing only the Design System system/version/checksum pin.
- refresh creates no Content Version and no duplicate Content Structure Revision. It reuses the exact content-structure revision/hash, page-version pins, and presentation-set hash from the base manifest. The Project assignment remains unchanged, and stale state never auto-rebases.
- generated OpenAPI exposes the discriminated operation through both Preview input and stored output unions. Five focused unit tests cover family isolation, single-operation cardinality, already-pinned rejection, assignment drift, and Content Structure reuse. The real PostgreSQL Workspace/Project Design System lifecycle additionally verifies missing approval, approved Apply, revision 4 projection, unchanged assignment revision, and Activity order.

Final validation passes `pnpm api:check` with 4/4 tasks, 2196 tests passed, 435 integration-disabled skips, and 26 existing JWT warnings; API typecheck retains only the three documented unrelated test diagnostics. Repository `pnpm check` passes all 8 tasks. Changed-scope review is `status=ok` with zero enforcement-blocking findings and the existing 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); no Design System refresh path is reported. `git diff --check` passes.

Still gated: the Admin Style Guide compare/accept/assign/refresh experience, Agent-generated Style Guide concepts, Asset/font-rights review, section-scheme editing, a real shared visitor renderer, compile artifacts, Design-stage writes, publication readiness, and successful real-data browser capture.

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

### 27.5 Verification evidence (2026-07-22)

The focused backend contract suite passes 43 tests across direct-Agent and
Run-backed provenance, generation context/provider/service/handler, the
Wireframe runtime Tool, Job registration, recovery routing, and tenant-schema
migration. The recovery route has an explicit regression for the compact
22-character `PublicUUID` query representation: FastAPI receives
`selected_page_id` through `Annotated[PublicUUID, Query(...)]` rather than
silently replacing the project validator with the native UUID query parser.

`api:check` passes all 4 tasks with 2285 tests passed, 438 tests skipped because
integration tests are disabled, 26 existing authentication-test warnings, and
the three previously known typecheck diagnostics. Cross-app `pnpm check`
passes all 8 tasks. Changed-scope review remains `status=ok` with zero
enforcement-blocking findings; its 45 findings are prototype/report-only and do
not include the Builder generation or recovery paths. `git diff --check`
passes.

The authenticated exact-page recovery request returns 200 for the real compact
page ID. No generation, Apply, project migration, or publication command was
issued during browser verification.

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
prelaunch.

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

### 32.7 Wave 3L implementation evidence

The implemented contract now includes the frozen Visual Blueprint schema, the
closed Design ChangeSet family, transaction-owned complete presentation
replacement, exact Wireframe checksum projection, component-catalog authoring
tokens, strict renderer source selection, and revision-pinned Admin transport.
Token projection keeps stable ordering, resolves aliases to typed values,
preserves deprecation/replacement evidence, and fails explicitly on alias
cycles or a missing unique default light theme.

Focused verification passes 3 component-catalog projection tests, including
the public `BUILDER_RENDER_DOCUMENT_INVALID` /
`BUILDER_RENDER_TOKEN_CYCLE` contract, and the 6-test shared SiteRenderer
suite. The complete
`pnpm api:check` passes lint, format, typecheck, and test with 2465 tests
passed, 443 integration-disabled skips, 65 non-blocking type diagnostics, and
26 existing test warnings. The cross-app `pnpm check` passes all 8 tasks.

This accepts typed Design authoring and deterministic renderer selection. It
does not accept AI Design generation, Asset/font-rights completion, automated
accessibility execution, production compilation, release activation,
thumbnail capture, comments, or server undo/redo.

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

### 33.1 Wave 3M implementation evidence

The contract is implemented by the generation aggregate, not a second Design
write service. `generation_job_contract.py` defines the distinct durable Design
Job/task identity; `generation_service.py` freezes and persists `designContext`
before publication; `generation_provider.py` validates the forced structured
candidate; and `generation_handler.py` sends validated candidates through the
canonical ChangeSet Preview authority. Runtime conversation entry resolves the
same command through `runtime_design_tool.py` and
`runtime_model_step_gateway.py` after explicit approval.

Fresh focused verification on 2026-07-22 passes 24 tests across the runtime
gateway/Tool, Job contract, Design provider, handler, and generation service.
This evidence accepts the revision-pinned Design generation contract only; it
does not add compiler, release, asset/font-rights, thumbnail, comment, or
server undo/redo authority.

## 34. Website Config settings/runtime checkpoint

The Wave 4 Website Config frontend continues to consume the existing project
core settings read and merge-patch service. It writes only fields already
projected into generated source and the public runtime:

- `site.name`, localized name, subtitle, description, localized description,
  URL, contact email, logo, and favicon;
- `seo.title_policy_v1`, robots directive, sitemap enablement, and Open Graph
  image;
- existing `site_localization` locale and time-display values.

A successful Admin mutation invalidates the generated project-source query so
the management preview does not remain stale. The browser neither invents
unknown settings nor claims publication before the real patch succeeds.

This checkpoint does not accept the broad `/projects/{projectId}/settings/core`
patch as the final product API. Typed website identity, SEO/discovery,
localization, and resolved-public-URL facades with optimistic version/ETag,
stable errors, Activity events, and Agent grants remain required. Domains must
ultimately own verification and primary-domain selection; Website Config must
consume that resolved address instead of maintaining a conflicting authority.
No backend schema or ownership hard cut is claimed by this frontend rollout.

## 35. Project General settings/lifecycle checkpoint

The Wave 4 Project General frontend composes existing Project authorities
without adding a second settings document:

- Project detail remains the canonical source for team-facing identity,
  lifecycle state, authoring mode/state/revision, stable IDs, and primary
  runtime projection;
- the existing Project patch updates only the submitted name, description, or
  icon fields and preserves normal authorization and query reconciliation;
- authorization/action projections decide whether the current actor can manage
  settings;
- the Project danger-capability projection decides whether archive and delete
  are currently enabled and returns the exact delete-confirmation name and any
  stable blocked reason;
- archive and permanent delete remain dedicated commands and do not enter the
  identity patch payload.

The browser treats permission or capability lookup failure as an explicit
read-only/error state. It does not infer permission from Project detail, enable
a destructive action before capability evidence loads, invent timestamps or
member counts, or represent navigation/removal as success before the canonical
mutation completes.

This checkpoint does not accept the general Project patch as the final domain
contract. Team-facing identity and project defaults still require typed
Pydantic/OpenAPI commands or a deliberately narrowed facade with optimistic
version/ETag, stable conflicts/errors, Activity events, idempotency where a
command can be retried, and explicit Agent Tool grants. Lifecycle capability,
archive, and deletion authorities remain separate; no frontend rollout claims
to replace their backend ownership.

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

This checkpoint establishes the typed repository/service authority and its
test contract only. The existing broad Core Settings route remains mounted
until typed HTTP routes, generated clients, Admin callers, and approval-backed
Agent grants move together. The broad route cannot be restricted and this
capability cannot be marked complete before that cutover.
