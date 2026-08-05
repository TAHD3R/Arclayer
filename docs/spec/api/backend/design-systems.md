# Workspace Design System Contracts

**Status:** Approved target contract; enforcement activates only through the capability waves in section 2.1.
**Canonical target:** `docs/spec/shared/ai-website-builder-platform.md`, section 7.3.
**Visual source boundary:** `DESIGN.md` remains authoritative for the Product Application and Platform Console; Workspace Design Systems govern generated visitor sites.
**Related contracts:** `docs/spec/api/backend/site-builder.md`, `docs/spec/app/frontend/creation-editor.md`, and `docs/spec/api/backend/background-jobs.md`.

This code-spec defines Design System identity, immutable versions, token graphs,
themes, typography, component recipes, motion, validation, import/derivation,
preview, compilation, project assignment/fork, Agent context, and API contracts.
A Design System is a versioned authoring input to a Site Revision. It is not a
mutable style settings blob and not a second copy of page presentation data.

## Scenario: Versioned Design Systems for Builder-Managed Sites

### 1. Scope / Trigger

- Trigger: adding or changing Workspace Design Systems, Style Guide stage
  persistence, token import/export, themes, typography, component recipes,
  motion definitions, validation, project assignment, or Design System context
  supplied to Agents/Tools.
- Applies to:
  - target models under `apps/api/src/models/design_systems/**`;
  - target module `apps/api/src/modules/workspaces/design_systems/**`;
  - Builder `SiteRevisionManifest`, ChangeSets, presentations, and render/build
    artifacts;
  - import, derive, validate, preview, and compile Jobs;
  - generated Admin clients and Style Guide UI.

This contract does not allow a workspace Design System to theme the Admin
shell. `DESIGN.md`, `packages/ui/src/tokens.css`, and the Admin product
toolchain remain the source for Arclayer's own interface.

### 2. Hard-Cut Decision

The Product Application token implementation is not workspace/site storage. The hard cut:

- creates normalized tenant-owned Design System identity/version/assignment
  records;
- stores one strict canonical manifest and hash for each immutable version;
- validates aliases, themes, accessibility, component references, and motion
  before publication/assignment;
- extends page presentation to reference tokens from the pinned version rather
  than copying resolved values as another design truth;
- makes project edits fork a workspace version instead of mutating it;
- compiles deterministic renderer artifacts from exact Design System and
  component-catalog versions.

#### 2.1 Capability activation matrix

The target contract is intentionally larger than one deployable slice. A route,
button, Agent context field, or readiness claim activates only when its owning
capability wave has passed the stated evidence. Unavailable capabilities remain
absent or explicitly unavailable; the product never substitutes a local-only
preview, placeholder component catalog, inferred assignment, or fake completed
Job.

| Capability wave | Activated authority | Required evidence before activation |
| --- | --- | --- |
| Wave 1A — workspace foundation | Workspace-owned identity, immutable manual candidate versions, strict manifest/token graph, deterministic synchronous `foundation` validation, and one exact Workspace default assignment | real PostgreSQL tenant migration; strict-schema/token-graph tests; idempotency, tenant isolation, revision conflict, exact default pin, Activity, OpenAPI, and Admin CRUD tests |
| Wave 1B1 — project authority | Project exact assignment, project-owned fork, and assignment impact over the live canonical Project authority | project tenant/permission authority, assignment/fork integration tests, exact command replay, and stale-base tests |
| Wave 1B2 — Agent context | Exact immutable Design System context snapshots for project-scoped Agent Runs | retained Run context records, worker/snapshot projection evidence, assignment-change isolation, and Run replay tests |
| Wave 2 — renderer readiness | Component-catalog compatibility, Asset/font rights validation, real shared-component preview, deterministic compile artifacts, and publication | deployed render-browser/publish workers, real catalog fixtures, Asset authorization, deterministic artifact and visual/reduced-motion evidence |
| Wave 3 — ingest and derivation | DTCG/Arclayer import and existing-site derivation | durable Jobs, untrusted-ingest boundary, lossless/lossy fixtures, provenance, retry/cancel, and no-silent-drop evidence |
| Wave 4 — Builder hard cut | Style Guide ChangeSets, Site Revision exact pins, tracking refresh, release readiness, migration, and legacy-style removal | Builder aggregate and ChangeSet authority, end-to-end revision/render/publish evidence, migration parity, and hard-cut regression tests |

Wave 1A `foundation` validation proves only authoring integrity. Its response
must expose `publishReady=false` and the not-yet-evaluated renderer/Asset
compatibility dimensions. A foundation-valid version may become the exact
Workspace default for authoring, but it is not publishable and cannot satisfy a
Builder release-readiness check until Wave 2 validation succeeds.

### 3. Ownership and Module Boundaries

Storage ownership:

- `DesignSystem`, `DesignSystemVersion`, validation results, derived token
  indexes, project assignments, and project forks live in the workspace tenant
  schema.
- font, logo, icon, image, and other media bytes remain in the Asset domain;
  manifests store authorized immutable Asset references plus provenance.
- Background Jobs/attempts/dispatch remain in the public control plane with
  validated tenant target descriptors.
- Site Revisions, presentations, bindings, releases, and artifacts remain in
  their canonical domains and reference exact Design System versions/hashes.

Target module shape:

```text
apps/api/src/models/design_systems/
  design_system.py
  design_system_version.py
  design_system_validation.py
  design_system_assignment.py
  design_token_index.py

apps/api/src/modules/workspaces/design_systems/
  router.py
  schema.py
  repository.py
  service.py
  validator.py
  importer.py
  derivation.py
  compiler.py
  diff.py
  policy.py
```

Contracts:

- routers call services; services extend `BaseService`; repositories extend
  `TenantScopedRepository` and use the bound tenant connection.
- import adapters, site analyzers, contrast validators, component catalogs,
  font/Asset readers, and compilers are injected interfaces.
- Design System services own identity/version/assignment policy. Builder owns
  orchestration and invokes typed Design System commands; it never writes these
  models directly.
- immutable manifest/state changes and required domain/audit events use explicit
  transactions and connection propagation.

### 4. Domain Model

#### 4.1 Stable enums

```text
DesignSystemOwnerKind = workspace | project
DesignSystemStatus = active | archived | deleting
DesignVersionStatus = candidate | validating | valid | published | invalid |
                      superseded | archived
DesignAssignmentMode = pinned | tracking
DesignImportFormat = arclayer_v1 | dtcg
DesignValidationSeverity = info | warning | blocker
DesignArtifactStatus = pending | building | ready | failed
```

Version payloads are immutable. Operational validation/publication state lives
in a separate projection and may advance only through typed transitions.

#### 4.2 `DesignSystem`

Required fields:

- public ID, workspace descriptor, owner kind, and optional owning project ID;
- name, description, status, and default-system flag;
- linked Asset collection ID and brand/provenance summary;
- latest valid/published version references;
- fork provenance (`forkedFromSystemId`, `forkedFromVersionId`) when project
  owned;
- mutable metadata revision, actors, and timestamps;
- deletion request/actor/timestamp when applicable.

Only one active workspace-owned system may be the workspace default. A project-
owned fork is still tenant-owned but is available only to its project unless an
explicit promote/copy command creates a new workspace system.

#### 4.3 `DesignSystemManifestV1`

Each version contains one strict canonical manifest:

```json
{
  "manifestVersion": 1,
  "name": "Editorial Contrast",
  "primitiveTokens": {},
  "semanticTokens": {},
  "componentTokens": {},
  "themes": [],
  "typographyRoles": [],
  "componentRecipes": [],
  "motionTokens": [],
  "breakpoints": [],
  "assetReferences": [],
  "componentCatalogVersion": "catalog_public_id",
  "extensions": {},
  "checksum": "sha256:..."
}
```

Manifest rules:

- `extra="forbid"`; supported vendor/import metadata appears only under
  explicitly namespaced `extensions`.
- token layers are `primitive → semantic → component`. References may point to
  the same or an earlier layer and never create a cycle.
- every token has a normalized path, declared value type, value or alias, safe
  description, and deprecation/provenance metadata where applicable.
- supported value contracts include the Design Tokens Community Group types
  needed by the renderer, including color, dimension, number, duration,
  cubic-bezier, font family/weight, typography, border, shadow, gradient, and
  transition composites. Unsupported types fail or remain explicit import
  findings; they are never dropped and reported as a lossless import.
- token paths are stable semantic identifiers. Display labels are product/user
  content and may change without changing a reference only by creating a new
  version.
- the checksum covers canonical JSON plus ordered Asset reference IDs/hashes and
  the exact component-catalog version.

Primitive tokens express raw scales. Semantic tokens express intent such as
surface, text, action, border, focus, status, typography role, spacing, radius,
elevation, and motion role. Component tokens/recipes map semantic values to
registered component/variant/state slots. A component recipe cannot reference
an unknown component or arbitrary executable renderer.

#### 4.4 Themes and schemes

Each theme has a stable key, display name, mode metadata, and token override/
alias map. Requirements:

- a declared `light`, `dark`, or high-contrast theme is a complete validated
  theme, not a runtime inversion/filter of another theme.
- semantic roles required by the selected renderer profile exist in every
  publishable theme.
- aliases resolve to type-compatible tokens and remain acyclic after theme
  overrides.
- section scheme assignments reference stable theme/scheme keys and validate
  foreground/background/action/focus combinations.
- fallback to another theme is explicit in the manifest and validation report;
  missing values are never silently invented by the renderer.

#### 4.5 Typography, Assets, and rights

Typography roles declare family, weight, size, line height, tracking, style,
responsive scale, and fallback stack through token references. Font references
include Asset/provider identity, immutable file/version hash, supported ranges,
license/source provenance, preload policy, and fallback behavior.

Logos, imagery direction, icons, and generated assets use canonical Asset IDs
with rights/source, focal point/crop, alt-text policy, and provenance. Deleting
or revoking an Asset requires Design System and Site Revision impact analysis.
Raw font/image bytes are never embedded in the manifest JSON.

#### 4.6 Component recipes

A recipe pins the component-catalog version and contains:

- stable component key plus variant/size/state selectors;
- token references for declared style slots;
- responsive overrides where supported;
- required state coverage from the component contract, including default,
  hover, focus, active, disabled, loading, empty/error, and content-overflow
  behavior where meaningful;
- accessibility semantics owned by the component contract, not rewritten by
  visual tokens.

Unknown components, variants, states, or style slots are blockers. Preview uses
the actual shared visitor-site component implementation for the pinned catalog,
not styled placeholder rectangles.

#### 4.7 Motion tokens

Motion tokens declare duration, delay where justified, easing, property group,
intent, interruption behavior, and reduced-motion alternative. Contracts:

- motion communicates state or spatial change and never gates task completion,
  navigation, focus, or data availability.
- routine interactions cannot depend on infinite decorative motion.
- every spatial/continuous motion used by a publishable recipe declares a
  reduced-motion replacement, normally immediate state/opacity change.
- duration/easing values are typed, bounded by the selected renderer profile,
  and validated against `DESIGN.md` only for Arclayer-provided starter systems;
  workspace visitor-site systems may define their own intentional scale while
  still meeting accessibility and performance constraints.

#### 4.8 `DesignSystemVersion`

Required immutable fields:

- Design System ID and monotonic system-local version number;
- canonical manifest, checksum, component-catalog version, schema/importer
  version, and token-index hash;
- parent version ID and change provenance;
- source (`manual | agent | import | derived | fork`) plus actor/Agent Run/Tool/
  Job/correlation IDs;
- import/derivation provenance and safe compatibility report;
- created timestamp.

The validation/publication projection stores status, validator version,
findings hash, validation timestamp, publisher, and publication timestamp.
Publishing never changes manifest bytes.

#### 4.9 `ProjectDesignSystemAssignment`

Exactly one active assignment may exist per Builder-managed project. Required
fields:

- public ID, workspace/project descriptors, and assignment mode;
- Design System ID and exact resolved Design System version/checksum;
- for `tracking`, selected published channel/policy and available update;
- metadata revision, assignment/fork provenance, actor, and timestamps.

Every `SiteRevisionManifest` pins the exact resolved version/checksum. `tracking`
may discover a newer compatible published version but cannot mutate an existing
Site Revision or silently change its render. Advancing `resolvedVersionId`
requires an explicit assignment-refresh/ChangeSet command and creates a new Site
Revision candidate.

Editing a workspace-owned system from project context always creates a project-
owned fork at the assigned version. It never mutates the workspace lineage.

### 5. Derived Token Index and Renderer Artifact

The canonical manifest remains the immutable source. A derived
`DesignTokenIndex` provides normalized token path/type/layer, alias edges,
theme/component usage, and reverse references for validation, impact, and
search. It is keyed by manifest checksum and can be rebuilt deterministically;
it never becomes an editable truth.

A `DesignSystemArtifact` is compiled from:

- exact Design System version/checksum;
- exact component-catalog and compiler versions;
- renderer target/profile;
- theme and locale/font subset inputs;
- authorized Asset hashes.

The artifact may contain CSS custom properties, typed JSON, font declarations,
and component-recipe lookup data. Build/publish consumes the artifact reference,
not a mutable live settings query. Hash-identical inputs produce the same
artifact identity. Compiler failure is explicit and does not fall back to a
different Design System or Admin token sheet.

During Wave 1A no `DesignSystemArtifact` is created. The optional component
catalog reference and component recipes remain empty unless a real registered
visitor catalog exists; `foundation` validation never claims catalog, Asset,
font-license, render, compile, or publication compatibility.

### 6. Presentation and Builder Integration

The existing page-level `DesignValueV1` contract is extended with a strict token
reference variant:

```json
{
  "kind": "token",
  "path": "semantic.color.action.primary"
}
```

The containing Wireframe/Visual Blueprint/Site Revision already pins the exact
Design System version, so a token reference does not carry a floating “latest”
version. A literal remains allowed only for explicit local overrides supported
by the component/property schema. Generated design uses semantic/component
tokens by default; resolved CSS values are render derivatives and are not
written back into presentation as a second truth.

Builder Design System mutations are typed ChangeSet operations such as:

- assign/fork Design System;
- create version from validated token/recipe operations;
- publish or supersede version;
- refresh a tracking assignment;
- replace/deprecate token with impact preview.

Opaque JSON Patch and direct manifest replacement at the public Builder boundary
are forbidden. Changes validate expected base version/checksum, affected
presentations/recipes/assets, preview token, approval where required, and
idempotency before a new immutable version/Site Revision is committed.

### 7. HTTP API Surface

All routes are Product API resources under the canonical prefix:

```text
/api/v1/workspaces/{workspaceId}/design-systems
```

The domain router excludes `/api/v1` and uses tag
`domain.workspaces.design-systems`.

| Method and local path | Contract |
| --- | --- |
| `GET /` | Cursor-paginated systems with owner/status/default/project/update filters. |
| `POST /` | Idempotently create a workspace system and optional first candidate version. |
| `GET /{systemId}` | Return identity, lineage, latest versions, assignments, validation, and revision. |
| `PATCH /{systemId}` | Patch metadata/default state with `expectedRevision`; never patch version payload. |
| `DELETE /{systemId}` | Archive/delete after assignment/Site Revision/Asset impact checks. |
| `GET /{systemId}/versions` | Cursor-paginated immutable version history. |
| `POST /{systemId}/versions` | Create a candidate from strict typed manifest or token operations. |
| `GET /{systemId}/versions/{versionId}` | Return immutable manifest/provenance/validation/artifact summary. |
| `POST /{systemId}/versions/{versionId}/validations` | Create full validation for an exact checksum. |
| `GET /{systemId}/versions/{versionId}/validation-results` | List immutable finding sets. |
| `POST /{systemId}/versions/{versionId}/publications` | Idempotently publish one valid version. |
| `POST /{systemId}/versions/{versionId}/previews` | Create an authorized real-component preview artifact. |
| `POST /comparisons` | Compare two authorized exact versions/manifests. |
| `POST /imports` | Create an Arclayer v1 or DTCG import Job/candidate. |
| `POST /derivations` | Derive a candidate from an authorized existing site/revision with compatibility findings. |
| `GET /project-assignments` | List authorized assignments, filterable by project/system/mode/update. |
| `PUT /project-assignments/{projectId}` | Idempotently set/refresh an exact assignment with expected revision. |
| `DELETE /project-assignments/{projectId}` | Remove assignment only when project authoring/readiness policy allows it. |
| `POST /project-assignments/{projectId}/forks` | Create and assign a project-owned fork from the exact resolved version. |

Wave 1A activates only:

```text
GET  /capabilities
GET  /
POST /
GET  /{systemId}
GET  /{systemId}/versions
POST /{systemId}/versions
GET  /{systemId}/versions/{versionId}
POST /{systemId}/versions/{versionId}/validations
GET  /{systemId}/versions/{versionId}/validation-results
GET  /default-assignment
PUT  /default-assignment
```

`PUT /default-assignment` pins an exact authorized `systemId`, `versionId`,
manifest checksum, and validation finding hash. It requires
`expectedRevision` (`0` means no assignment exists), `Idempotency-Key`, a fresh
successful foundation validation, and one transaction. It never resolves
`latest` or changes when a new version is created. Import, derive, publish,
preview, compare, archive/delete, project assignment/fork, and tracking routes
remain unmounted until their capability waves pass.

Create/version/import/derive/validate/publish/preview/assignment/fork commands
require `Idempotency-Key`. Mutable commands require `expectedRevision` or exact
base checksum. Collections use opaque cursor pagination and deterministic
ordering. Responses use `ResponseModel[T]`, `PublicUUID`, stable errors, and
generated OpenAPI types.

Read/preview/compare actions map to `system:site:read`; create/edit/import/
derive/validate/publish/assign/fork/delete actions map to `system:site:manage`.
Referenced Asset access additionally requires the corresponding Asset read or
manage permission. Cross-workspace/project IDs return not found without
existence leakage.

### 8. Import, Derivation, Validation, and Publication

#### 8.1 Import

Initial lossless targets are Arclayer manifest v1 and the supported Design
Tokens Community Group format through a versioned adapter. Import:

1. validates format/schema and resource protection before persistence.
2. maps supported token types, groups, aliases, themes, and namespaced extensions
   into a candidate manifest.
3. reports every unsupported/lossy construct with source location and severity.
4. refuses “lossless” status if any value/reference/extension was dropped or
   coerced.
5. persists original authorized import Asset/hash plus importer version for
   reproducibility.

CSS-variable scraping is not a lossless token import. If later supported, it is
an explicit derivation with unresolved-semantic findings, not a completed Design
System claim.

#### 8.2 Existing-site derivation

Derivation reads an exact authorized Site Revision/release/artifact and extracts
candidate colors, typography, spacing, radius, elevation, components, themes,
and motion. It returns evidence counts, confidence, duplicates, literals,
unsupported code/dynamic behavior, missing states, and unresolved semantic
roles. It never overwrites the site or claims round-trip fidelity.

#### 8.3 Validation

Publication blockers include:

- invalid manifest/checksum, duplicate paths, alias cycle, missing reference,
  or type mismatch;
- missing required semantic roles or incomplete declared theme;
- WCAG 2.2 AA contrast failures for configured text/non-text/focus scenarios;
- missing focus indication, color-only meaning, or invalid status palette;
- unavailable/unlicensed font/Asset reference or missing fallback;
- unknown component/catalog/variant/state/style slot or incomplete required
  state recipe;
- unresolved/deprecated token use without replacement;
- missing reduced-motion alternative or motion that gates interaction;
- invalid breakpoint/responsive override;
- incompatible renderer/compiler/component-catalog version.

Warnings remain visible and versioned; blockers prevent publication. Validation
is against an exact checksum and validator/profile version and is never reused
after content/catalog/profile changes.

#### 8.4 Publication

Publishing a valid candidate:

1. revalidates checksum, status, permissions, compatibility, Assets, and latest
   validation profile.
2. compiles required deterministic artifacts or references a hash-identical
   ready artifact.
3. atomically records published state and latest published pointer.
4. emits required audit/domain events.
5. does not mutate existing project assignments or Site Revisions.

### 9. Background Jobs

Required Job types:

- `design_system.import.v1` on workload `connector`;
- `design_system.derive.v1` on workload `render-browser` or the proved analysis
  workload selected by the queue-topology contract;
- `design_system.validate.v1` on workload `render-browser` when real component
  rendering is required;
- `design_system.preview.v1` on workload `render-browser`;
- `design_system.compile.v1` on workload `publish`;
- `design_system.purge.v1` on workload `maintenance`.

Job targets contain workspace/system/version/project IDs, exact checksums,
component-catalog/compiler/validator versions, and authorized Asset/import
references. They do not contain binary assets, secrets, or full manifest bytes.

Idempotency fingerprints include exact source/checksum and every adapter/
validator/compiler/profile version that can affect output. Worker redelivery
cannot duplicate versions, findings, artifacts, assignments, forks, or
publication events. Validation/compatibility failures are permanent; only
declared transient infrastructure/provider failures retry. Enqueue failure uses
the durable outbox and never runs render/compile work inline.

### 10. Agent and Tool Context

Site Architect and Visual Designer Agent Runs receive a structured context with:

- assignment and exact Design System version/checksum;
- resolved semantic token graph and theme/typography/recipe/motion summaries;
- component-catalog/renderer compatibility;
- validation findings and deprecated/missing roles;
- Asset/rights references and project fork provenance;
- current Site Revision/base ETag and allowed typed commands.

#### 10.1 Agent-generated Project Style Guide concepts

Agent concept generation is a distinct durable command, not existing-site
derivation and not a Sitemap ChangeSet:

- `design_system.concept.generate.v1` targets one Project-owned Design System,
  exact assignment version/checksum, exact latest Builder revision ID/ETag,
  actor, Product Application locale, objective, and bounded candidate count;
- the Style Guide stage submits `agentId` and creates exactly one durable
  generation command. It does not create a chat Thread or Agent Run. The
  persisted conversation Tool submits `agentRunId`, requires its existing
  `draft_write` approval interrupt, and returns only the durable generation
  reference after approval;
- `agentId` and `agentRunId` are an exact exclusive choice. Both entrances use
  the same generation service, Job contract, worker handler, provider, version
  command, validator, and projection. There is no second chat-generation
  backend;
- direct stage creation resolves and persists the exact Agent definition,
  immutable Agent version, Workspace assignment, Design System context, and
  Builder context. Conversation creation uses the corresponding immutable Run
  snapshots. The worker revalidates the retained authority before provider
  execution instead of resolving a newer mutable assignment;
- the Project assignment and current canvas revision are independent inputs.
  The assignment may be newer than the canvas, but the submitted assignment
  version/checksum and Builder revision ID/ETag/latest identity must each match
  exactly. This permits another concept round while the UI still exposes an
  explicit canvas-refresh checkpoint;
- the provider must return exactly one typed
  `submit_design_system_concept_candidate` Tool call per candidate. Raw text,
  multiple calls, unknown tools, invalid manifests, and provider failures are
  explicit structured candidate failures;
- the provider returns only a bounded visual foundation. The service
  deterministically compiles the complete strict manifest, reducing the named
  Tool schema from 6,922 bytes to 3,276 bytes without weakening validation;
- each successfully parsed candidate creates an immutable Project Design
  System version with `source=agent`, exact base parent, Agent Run/generation/
  candidate provenance, and an independently allocated version number. Several
  concepts may share the same base parent without silently rebasing one concept
  on another. Direct-stage provenance permits `agentRunId=null`, while Agent
  definition/version/assignment identities remain required;
- every generated version immediately receives foundation validator-v2
  evidence and lifecycle state. Invalid concepts remain immutable invalid
  evidence and cannot be accepted; successful concepts are returned with exact
  validation and impact-review references;
- generation create/get/cancel and Job redelivery are idempotent and fenced.
  Partial success preserves completed candidate versions. No retry duplicates
  versions, validations, Activity, or candidate indexes;
- generation never changes Project assignment, current Site Revision, canvas,
  active release, or publication state. Acceptance remains the existing exact
  assignment command followed by an explicit `design-system.refresh`
  Preview/Apply;
- candidate name/summary language follows the active Admin/UI locale. Site
  content locale is only a last-resort locale fallback and cannot silently
  force an English review result in a Chinese Admin session;
- `GET .../concept-generations/recovery` returns the current actor's newest
  active generation and newest terminal generation independently, each ordered
  by `created_at DESC, id DESC`. Admin prioritizes active, polls while active,
  and restores the latest terminal result after reload. It never reconstructs
  generation identity from immutable version history;
- public migration `0051_auto_20260721_1723` and tenant-control migration v23
  must stay synchronized for nullable `agentRunId`, Agent identities, and the
  exact Design System/Builder context JSON snapshots.

The Run context pins exact versions. Agents propose typed version/assignment/
fork ChangeSets; they never mutate manifest JSON, CSS, or project assignment as
a prompt side effect. Tool execution revalidates actor permission, Agent grant,
execution mode, approval policy, current base revision, assignment, Assets,
entitlement, and component catalog.

Generated outputs reference token paths and component recipes. If a requested
role/component does not exist, the Agent returns a visible finding or proposes a
typed Design System change; it does not invent a hidden literal and claim
conformance.

An interrupted Agent Run may be cancelled only after active budget reservations
are settled. Cancellation closes every pending approval and its Tool part before
terminalizing the Run. A terminal Background Job does not block this recovery;
committed, released, and expired reservations are already settled and cannot be
misclassified as active work.

### 11. Concurrency, Impact, and Delete

- mutable identity/assignment records use optimistic revisions; stale writes
  fail and never silently merge/rebase.
- immutable version operations use base version/checksum and request
  idempotency fingerprints.
- token rename/removal/deprecation previews reverse references across themes,
  recipes, presentations, Site Revisions, assignments, artifacts, and active
  releases.
- deleting/archiving a system or version first computes assignment, Site
  Revision, release, artifact, Agent, and Asset impact.
- active/published/referenced versions are retained for reproducibility and
  cannot be destructively deleted while governing retention applies.
- disabling/removing an assignment blocks new Builder revisions when the
  project requires Design System readiness; it never changes an active release.
- failed candidate/import/validation/preview/compile work remains explicit and
  never replaces the last ready/published version or artifact.

### 12. Stable Errors

| Condition | Required error |
| --- | --- |
| System/version/assignment missing or cross-workspace | `DESIGN_SYSTEM_NOT_FOUND` |
| Actor lacks site/Asset permission | `PERMISSION_DENIED` without existence leakage |
| Manifest/version/checksum is invalid | `DESIGN_SYSTEM_MANIFEST_INVALID` |
| Token path/reference/type/cycle is invalid | `DESIGN_SYSTEM_TOKEN_GRAPH_INVALID` |
| Import format/version is unsupported | `DESIGN_SYSTEM_IMPORT_UNSUPPORTED` |
| Import/derivation is lossy or blocked | `DESIGN_SYSTEM_IMPORT_FINDINGS_BLOCKING` |
| Validation contains blockers | `DESIGN_SYSTEM_VALIDATION_BLOCKED` |
| Component/catalog/compiler is incompatible | `DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE` |
| Asset/font/license reference is unavailable | `DESIGN_SYSTEM_ASSET_INVALID` |
| Mutable revision/base checksum is stale | `DESIGN_SYSTEM_REVISION_CONFLICT` |
| Project assignment conflicts with authoring mode/scope | `DESIGN_SYSTEM_ASSIGNMENT_INVALID` |
| Workspace version edit attempted from project | `DESIGN_SYSTEM_FORK_REQUIRED` |
| Idempotency key is reused with different input | `DESIGN_SYSTEM_IDEMPOTENCY_CONFLICT` |
| Delete has assignment/revision/release references | `DESIGN_SYSTEM_DELETE_BLOCKED` |
| Project-scoped Agent Run has no exact assignment | `AGENT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED` |
| Project-scoped Run creation lacks the context resolver | `AGENT_DESIGN_SYSTEM_RESOLVER_UNAVAILABLE` |
| Assignment/version/validation context cannot be captured exactly | `AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID` |
| Project-scoped worker execution lacks its immutable snapshot | `AGENT_DESIGN_SYSTEM_SNAPSHOT_MISSING` |

Messages use stable i18n keys and sanitized metadata. Frontend branches on error
codes, never localized copy.

### 13. Migration and Hard Cut

1. add source models and generated public migrations, then add tenant-owned
   tables/indexes/constraints to the tenant-control path for every workspace.
2. define/validate an Arclayer starter manifest from current visual/component
   contracts without treating Admin `tokens.css` as mutable workspace storage.
3. import valid legacy project/site appearance/style values into explicit
   candidate Design System versions with provenance and compatibility findings.
   Missing or ambiguous semantics enter `migration_required`; migration does not
   invent a complete theme/recipe system.
4. create/assign exact versions only after validation and owner decision where
   ambiguity exists; do not keep a parallel style settings write path.
5. add token-reference presentation schema, version/assignment/validation/
   import/derive/preview/compile routes, Jobs, permissions, events, and generated
   clients.
6. switch Builder/renderer/Agent consumers together, verify version/hash/render
   parity, freeze legacy writes, and remove obsolete appearance/style blobs and
   compatibility facades in the owning wave.

Generated migrations and OpenAPI artifacts are created by repository commands
and never hand-edited.

### 14. Tests and Acceptance Gates

Required tests:

- manifest/Pydantic tests for strict v1 schema, canonical checksum, supported
  token types, namespaced extensions, aliases, theme overrides, and immutability.
- token-graph tests for layer direction, missing/type-invalid refs, cycles,
  deprecation/replacement, deterministic index, and reverse impact.
- repository/service tests for tenant binding, transactions, revisions,
  idempotency, default uniqueness, publication, assignment, fork, and required
  events.
- route tests for typed envelopes, `PublicUUID`, auth/CSRF, permission mapping,
  pagination/filtering, cross-workspace/project not-found, and stable errors.
- import fixtures for lossless Arclayer v1, supported DTCG inputs, unsupported
  types/extensions, aliases/groups/themes, resource limits, and no silent drops.
- derivation fixtures for CSS/source-backed sites, duplicate literals,
  unsupported dynamic behavior, confidence/evidence, and no false round-trip
  claim.
- validation tests for WCAG 2.2 AA text/non-text/focus contrast, complete themes,
  fonts/licenses/fallbacks, real component recipe/state coverage, responsive
  overrides, motion/reduced-motion, and component-catalog compatibility.
- real-component visual preview tests across supported themes, breakpoints,
  content overflow, states, and reduced motion; placeholder-only preview is not
  acceptance evidence.
- compiler tests for deterministic artifact hash, exact input pinning, CSS/JSON
  output, Asset references, failure behavior, and no Admin-token fallback.
- Builder tests for token reference resolution, typed ChangeSet preview/apply,
  project fork, tracking refresh, Site Revision exact pinning, and unchanged
  active release on candidate failure.
- Agent tests for structured context, version pinning, missing-role findings,
  typed proposals, permission/approval/base-revision revalidation, and no hidden
  literal mutation.
- migration tests across new/existing tenants, valid/ambiguous legacy styles,
  `migration_required`, parity evidence, and absence of legacy writes after hard
  cut.
- OpenAPI generation plus Admin typecheck for every public contract.

Acceptance requires real PostgreSQL tenant migrations, a real component-catalog
preview, deterministic compile artifact, authenticated assignment/fork flow,
and an end-to-end Builder Site Revision that renders from an exact pinned Design
System version in normal and reduced-motion modes. A JSON schema test or static
color swatch screen alone is insufficient.

Wave 1A acceptance is narrower and must not be reported as target completion:

- a real PostgreSQL clean-chain and existing-tenant migration creates all
  foundation tables, constraints, and indexes;
- strict manifests reject extra fields, invalid token paths/types, invalid
  layer direction, missing references, cycles, invalid theme overrides,
  incomplete required light-theme semantic roles, invalid typography/motion
  references, and failing foundation contrast scenarios;
- identity/version/validation/default commands prove tenant isolation,
  idempotent replay, conflicting-key rejection, revision conflicts, exact hash
  pinning, and required Activity events;
- the Admin screen proves accessible list, empty/loading/error, create,
  version-authoring, validation findings, and exact-default flows in `zh-CN`
  and `en-US` without raw JSON as the primary authoring experience;
- every Wave 1B+ capability is absent or explicitly unavailable, and every
  foundation validation response says `publishReady=false`.
