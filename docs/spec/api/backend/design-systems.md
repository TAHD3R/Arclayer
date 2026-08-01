# Workspace Design System Contracts

**Status:** Approved target contract; enforcement activates only through the capability waves in section 2.1.
**Canonical target:** `docs/spec/shared/ai-website-builder-platform.md`, section 7.3.
**Visual source boundary:** `DESIGN.md` remains authoritative for Arclayer Admin; Workspace Design Systems govern generated visitor sites.
**Related contracts:** `docs/spec/api/backend/site-builder.md`, `docs/spec/admin/frontend/creation-editor.md`, and `docs/spec/api/backend/background-jobs.md`.

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

### 2. Verified Baseline and Hard-Cut Decision

The live backend has `DesignStyleV1` and `DesignTypographyV1` for page/node
presentation values, but no `DesignSystem`, immutable Design System version,
theme graph, component recipe, project assignment, validation, or import API.
The creation-editor and site-builder target specs already require the Style
Guide stage and every `SiteRevisionManifest` to pin a `DesignSystemVersion`.

The Admin token implementation demonstrates semantic CSS roles and reduced-
motion handling, but it is not workspace/site storage. The target hard cut:

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

All routes are Admin API resources under the canonical prefix:

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
  workload selected by the queue-topology ADR;
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
  actor, Admin locale, objective, and bounded candidate count;
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

### 15. Wave 1A implementation evidence (2026-07-20)

Wave 1A is implemented and verified as the workspace foundation slice. This
does not change the target-contract status of Wave 1B through Wave 4.

Implemented authority:

- workspace-owned `DesignSystemRecord` identity and immutable manual
  `DesignSystemVersionRecord` candidates;
- strict `DesignSystemManifestV1`, canonical manifest checksum, deterministic
  token-index hash, typed token graph, themes, typography roles, motion roles,
  and namespaced extensions;
- synchronous deterministic `foundation` validation with immutable findings,
  finding hashes, required semantic roles, alias/type/layer/cycle checks, theme
  override checks, typography/motion references, and foundation contrast;
- exact Workspace default assignment pinned to system ID, version ID, manifest
  checksum, validation finding hash, and optimistic metadata revision;
- command fingerprints and result snapshots for exact idempotent replay, plus
  required Activity events in the same tenant transaction;
- authenticated Workspace routes, generated OpenAPI clients, public migration
  `0041_auto_20260720_2110`, tenant-control migration v15, and the productized
  Workspace Settings Design Systems screen with `zh-CN` and `en-US` copy.

Explicitly gated after Wave 1A:

- project assignment, project-owned fork, assignment impact, and Agent/Builder
  context snapshots;
- component-catalog and Asset/font-rights compatibility, real component
  preview, compile artifacts, publication, import, derivation, and Builder hard
  cut;
- every foundation result remains `publishReady=false` and exposes those
  compatibility dimensions as `not_evaluated`.

Verification evidence:

- strict manifest and validator unit tests: `3 passed`;
- real PostgreSQL Workspace lifecycle integration: `1 passed`, including
  tenant isolation, exact replay, conflicting-key rejection, immutable parent
  pins, validation/default revision conflicts, historical command snapshots,
  and Activity order;
- clean PostgreSQL migration chain `0001 -> 0041` and tenant foundation table /
  uniqueness assertions: passed;
- targeted Admin API/manifest/view tests: `7 passed`;
- `pnpm admin:check`: four tasks passed, `317` test files and `1413` tests
  passed with zero lint errors or warnings;
- `pnpm -C packages/openapi typecheck`: passed;
- `pnpm api:check` and `pnpm check`: API `2084 passed`, `434 skipped`; Admin
  `1413 passed`; all eight cross-app tasks passed;
- `git diff --check`: passed; changed-scope code-review-engine status `ok`
  with zero blocking findings and zero Design Systems path findings.

The implementation keeps the Wave 1A repository, validator, and setting-screen
subcomponents cohesive because they change as one aggregate/pipeline/screen.
Project assignment and fork policy must enter through a separate Wave 1B1
project-authority service instead of expanding the workspace-foundation service
with project responsibilities. Wave 1B2 then consumes the exact assignment
through the existing durable Agent Run creation transaction. Builder and Site
Revision integration remain gated because their canonical live aggregate does
not yet exist; neither an arbitrary client `siteRevisionId` nor a synthetic
revision record is acceptable activation evidence.

### 16. Wave 1B1 implementation evidence (2026-07-20)

Wave 1B1 is implemented and verified over the live canonical Project authority:

- `GET/PUT /projects/{projectId}/design-system/assignment` reads and writes one
  exact project assignment with system/version IDs, manifest checksum,
  validation finding hash, and optimistic metadata revision;
- `POST /projects/{projectId}/design-system/forks` creates a project-owned
  identity plus immutable version from an exact foundation-valid source and
  retains source system/version/checksum provenance;
- assignment and fork commands persist fingerprints and exact result snapshots,
  so historical idempotent replay does not drift when the current assignment
  changes;
- project-owned systems are available only to their owning Project. Workspace
  foundation APIs explicitly filter to workspace-owned identities, and another
  Project receives `DESIGN_SYSTEM_NOT_FOUND` for the fork;
- assignment results expose exact before/after impact and explicitly report
  that neither the active release nor a Site Revision changed. No synthetic
  Builder revision is created;
- project `site:read` / `content:site-builder:write` permissions, tenant-bound
  repositories, the Project lock, exact validation evidence, and required
  `project.design_system.assigned` / `project.design_system.forked` Activity
  events are enforced in the command transaction;
- generated public migration `0042_auto_20260720_2152`, tenant-control migration
  v16, and generated OpenAPI clients expose the new authority.

Evidence:

- real PostgreSQL HTTP lifecycle: passed, including explicit Project owner
  membership, empty/read, exact assignment, exact replay, fork provenance,
  Workspace-list isolation, cross-Project denial, reassignment, historical
  replay, revision advancement, and Activity order;
- clean PostgreSQL migration chain `0001 -> 0042`: passed, including Project
  assignment/command tables and command uniqueness;
- API, OpenAPI, and Admin typechecks: passed;
- `pnpm api:check`: four tasks passed; API `2084 passed`, `434 skipped`, with
  only the two pre-existing workspace-action test type warnings;
- changed-scope code-review-engine: status `ok`, zero blocking findings;
- capability truth now reports `projectAssignment=true`, `projectFork=true`,
  `agentRunContext=false`, and `builderContext=false`.

Wave 1B2 remains active work. A project-scoped Agent Run must capture the exact
assignment as immutable Run context in the same Run/Job/outbox transaction, and
later assignment changes must not alter that snapshot. Builder context remains
gated until the canonical Site Revision aggregate exists.

### 17. Wave 1B2 implementation evidence (2026-07-20)

Wave 1B2 is implemented and verified for project-scoped Agent Runs without
activating Builder or Site Revision context:

- Run creation locks the current Project assignment and resolves its exact
  system, immutable version, manifest checksum, validation finding hash, token
  index hash, owner kind, compatibility state, and complete manifest;
- `AgentRunDesignSystemContextV1` is a frozen structured contract with canonical
  `PublicUUID` identities, deterministic context hash, explicit byte size,
  `publishReady=false`, and no permission, Tool authority, or publication claim;
- one `ai_run_design_system_snapshots` record is created in the same transaction
  as the Background Job/outbox, Agent Run, Skill snapshots, initial user
  message, and `run.created` / `run.queued` events. Project-scoped creation
  fails explicitly when no assignment exists or the exact context is invalid;
- idempotent replay verifies the original context hash and byte size rather than
  resolving a newer assignment. Workspace-scoped Runs remain valid without a
  Project Design System snapshot;
- the worker loads only the retained Run snapshot, cross-checks every denormalized
  identity/hash field, and passes the typed context into the execution request
  retained by the LangGraph checkpoint. Missing or inconsistent records fail
  explicitly and never fall back to the current Project assignment;
- the worker system prompt identifies the payload as immutable structured design
  data, requires semantic token/theme/typography/motion use, forbids invented
  hidden literals, and does not claim renderer readiness while compatibility is
  `not_evaluated`;
- the Run snapshot API projects the retained context instead of rereading the
  mutable assignment. A first Run therefore keeps assignment revision 2 after
  the Project advances to revision 3, while a later Run captures revision 3 and
  a distinct context hash;
- generated public migration `0043_auto_20260720_2214` creates the one-to-one
  Run snapshot record and its context/version query indexes. No tenant migration
  is added because Agent Run/Job snapshots are public durable control-plane
  records; the referenced assignment and manifest remain tenant-bound;
- capability truth now reports `agentRunContext=true` and
  `builderContext=false`. Builder/Site Revision context remains gated because no
  canonical live Builder revision aggregate exists; no synthetic revision or
  arbitrary client `siteRevisionId` is accepted as activation evidence.

Verification evidence:

- Run creation transaction and idempotent replay integration: `2 passed`;
- worker execution, exact Skill/Design System context, prompt constraints,
  interrupts, approvals, cancellation, and explicit failure behavior:
  `8 passed`;
- immutable Run snapshot projection: `3 passed`;
- real PostgreSQL Workspace/Project/Agent HTTP lifecycle: `1 passed`, including
  missing-assignment `409`, `PublicUUID` output, assignment-change isolation,
  distinct later-Run context, and explicit non-readiness;
- clean PostgreSQL migration chain `0001 -> 0043`: passed, including the Run
  one-to-one uniqueness constraint and context/version indexes;
- regenerated OpenAPI plus API, OpenAPI, and Admin typechecks: passed;
- `pnpm api:check`: four tasks passed; API `2084 passed`, `434 skipped`;
- `pnpm admin:check`: four tasks passed; Admin `1413 passed`;
- `pnpm check`: all eight cross-app tasks passed;
- changed-scope code-review-engine: status `ok` with zero enforcement-blocking
  findings. Prototype report-only repository-base findings remain visible for
  the broader uncommitted Agent Runtime architecture and are not represented as
  zero findings;
- `git diff --check`: passed.

### 18. Component-catalog compatibility sub-slice evidence (2026-07-21)

This is a compatibility sub-slice of the section 2.1 Wave 2 contract. It does not activate renderer, Asset/font-rights, compilation, or publication capabilities.

- the exact packaged `arclayer-wireframe-v1` catalog and checksum are resolved through the same injectable registry used by Builder; `GET /workspaces/{workspaceId}/design-systems/component-catalogs` exposes registered authoring choices without accepting arbitrary catalog identities;
- `componentRecipes` now use strict `DesignComponentRecipeV1`, state, and responsive recipe schemas instead of untyped dictionaries. Recipe validation covers catalog/component/variant/state/style-slot/breakpoint existence, required state/style-slot coverage, token existence, and token value-type compatibility;
- foundation validator version `2` includes the exact component-catalog checksum in its finding hash and returns explicit `componentCatalog=compatible | incompatible | not_evaluated` plus `componentCatalogChecksum`. Unknown or incompatible catalogs are blockers;
- a Builder initialization now requires validator v2 evidence, exact manifest/version/checksum alignment, `componentCatalog=compatible`, and the registered catalog checksum. Existing v1 validation evidence cannot silently satisfy this boundary;
- Workspace Design System version authoring selects one registered catalog and writes its exact `componentCatalogVersion`; loading, error, and empty catalog states block submission instead of inserting a placeholder version.

The real Workspace lifecycle integration passes the catalog-list and Project revision-bound catalog assertions. Strict manifest/catalog tests, generated OpenAPI, API lint/typecheck, OpenAPI typecheck, Admin typecheck/lint, and focused Admin Design System tests pass.

Final cross-app `pnpm check` passes all 8 tasks from cache misses: API has 2191 passed, 435 integration-disabled skips, and 26 existing warnings; Admin has 317 files and 1413 tests passed.

`renderer`, `asset`, `compile`, and `publication` remain `not_evaluated`; `publishReady` remains false. A real shared visitor component implementation, deterministic compile artifact, visual/reduced-motion evidence, Asset/font authorization, project tracking-refresh ChangeSet, and plugin catalog contribution are still required before the section 2.1 Wave 2 capability can be described as complete.

### 19. Project-owned immutable version authoring evidence (2026-07-21)

The first Style Guide write boundary is now active for project-owned forks. It extends Wave 1B1 authority without mutating Workspace lineages or existing Site Revisions:

- `GET /projects/{projectId}/design-system/{systemId}/versions/{versionId}` reads one exact immutable version only when the system is owned by the current Project;
- `POST /projects/{projectId}/design-system/{systemId}/versions` creates the next immutable manual version from the exact latest parent ID and checksum. A stale parent returns `DESIGN_SYSTEM_REVISION_CONFLICT`;
- `POST /projects/{projectId}/design-system/{systemId}/versions/{versionId}/validations` runs foundation validator v2 with the same registered component-catalog resolver used by Workspace Design Systems and Builder;
- Workspace-owned systems and another Project's fork return `DESIGN_SYSTEM_NOT_FOUND` through this project-authoring surface. Project editing never changes a Workspace-owned version in place;
- create and validation commands share the Project lock, request fingerprint, idempotency key, exact result snapshot, tenant transaction, and required `project.design_system.version.created` / `project.design_system.version.validated` Activity events;
- a valid version advances only the project-owned system's latest-valid projection. It does not change the current project assignment, active release, or retained Site Revision. Assignment remains a separate exact command, and a retained Site Revision advances only through the explicit Design System refresh ChangeSet recorded in section 20.

Capability truth now reports `projectVersionAuthoring=true`. The real PostgreSQL HTTP lifecycle verifies fork read, workspace-owned edit denial, immutable v2 creation, exact replay, conflicting-key rejection, stale-parent rejection, catalog-compatible validation, cross-Project denial, exact reassignment, Agent Run context capture, Builder initialization pinning, and Activity order. The focused integration completed within the observed 60-second diagnostic budget. API lint, API/OpenAPI typechecks, generated OpenAPI, and `git diff --check` pass; API typecheck retains only the three previously documented unrelated test diagnostics.

This is the backend Style Guide version authority used by the Admin flow in section 21. Project version history, semantic compare/supersede UI, Agent-generated concepts, Asset/font-rights review, section-scheme contrast editing, real component preview, compiler artifacts, and publication readiness remain gated.

### 20. Explicit Site Revision refresh evidence (2026-07-21)

The Builder now supplies the missing authority bridge between an accepted Project assignment and an existing revision-bound canvas:

- one strict `design-system.refresh` operation identifies the exact assignment revision, Design System/version, manifest checksum, and validator finding hash;
- Preview and Apply both resolve the Project assignment and revalidate the immutable version, validator-v2 result, and registered component-catalog compatibility. A stale assignment returns `DESIGN_SYSTEM_REVISION_CONFLICT` rather than silently targeting current state;
- the operation is isolated from Sitemap and Wireframe families, always requires `review` approval, and exposes public IDs in the affected target and summary contract;
- Apply creates a new draft Site Revision that changes only the exact Design System pin. It reuses the prior Content Structure Revision, Content Structure hash, page-version pins, and presentation-set hash, creates no Content Version, and leaves the Project assignment unchanged;
- version creation, validation, assignment, refresh Preview, and refresh Apply remain separate auditable commands. None changes an active release.

The formal OpenAPI generator exposes the operation discriminator and generated TypeScript type. Five focused unit tests and the real PostgreSQL lifecycle cover family/cardinality validation, already-pinned rejection, revision drift, approval, immutable revision creation, unchanged content evidence, and unchanged assignment projection.

The Admin Style Guide workflow now composes fork, immutable authoring, validation, assignment, and refresh Preview/Apply into one productized review flow. Semantic version comparison remains gated alongside Agent concepts, Asset/font-rights review, section schemes, renderer/compile evidence, Design writes, and publication readiness.

### 21. Admin Style Guide command orchestration evidence (2026-07-21)

The full-screen Admin editor now consumes the project authority without adding a second persistence model:

- assignment and owner-aware immutable version reads are query-backed server evidence. Workspace-owned sources must run explicit fork and assignment commands before project authoring is available;
- candidate creation returns one immutable project version. Foundation validation returns the exact validator-v2 finding set, and only a `valid` result enables acceptance/assignment;
- assignment and canvas refresh are separate visible checkpoints. A successful assignment updates the project assignment query but never edits the current `SiteRevisionManifest`; only approved refresh Apply invalidates and reconciles the Builder aggregate;
- deterministic idempotency keys derive from source version, parent version, candidate version, assignment revision, or ChangeSet ID, so a retry after refresh cannot silently create a parallel lineage or target a newer mutable base;
- focused Admin tests verify the exact API paths and headers, Workspace fork/assignment payloads, invalid candidate blocking, exact refresh operation, approval evidence, and Apply payload.

This evidence activates project-owned server-candidate authoring, validation, acceptance/assignment, and revision refresh in the Admin Style Guide stage. It does not activate project version history, compare/supersede, Agent concept generation, Asset/font rights, section schemes, renderer/compile compatibility, Design writes, or publication.

### 22. Project immutable history and deterministic semantic comparison evidence (2026-07-21)

Project-owned Design Systems now expose two read authorities over the existing immutable version table:

- `GET /projects/{projectId}/design-system/{systemId}/versions` returns newest-first cursor pages. The cursor identifies an exact version in the same project-owned system; missing or foreign system/version identities remain a uniform `DESIGN_SYSTEM_NOT_FOUND` instead of silently returning an empty page;
- history summaries batch-project the latest foundation validation for every returned version, avoiding one validation query per row while preserving exact immutable version/checksum/source/parent evidence;
- `POST /projects/{projectId}/design-system/{systemId}/comparisons` accepts two exact immutable version IDs and returns an ephemeral, deterministic comparison resource. It performs no write, consumes no idempotency key, and cannot change assignment, Site Revision, release, validation, or lifecycle state;
- the semantic diff compares stable manifest concerns rather than opaque JSON Patch offsets: metadata, primitive/semantic/component tokens, themes, typography roles, component recipes, motion roles, breakpoints, Asset references, component-catalog pin, and namespaced extensions. Entries are ordered by concern and stable path and include exact canonical before/after values plus added/changed/removed counts;
- manifest checksum and derived token-index hashes do not become semantic entries. The comparison hash binds the two exact version identities, manifest checksums, and canonical diff payload while the public response continues to expose encoded public IDs;
- cross-Project access returns the same not-found boundary as exact version reads. The real PostgreSQL HTTP lifecycle covers two cursor pages, latest validation projection, a three-entry name/action/focus comparison, and cross-Project comparison denial.

The pure manifest seam passes 2 deterministic/no-change tests; the real HTTP lifecycle completed within the observed 60-second diagnostic budget. API format/lint pass, API typecheck retains only the three documented unrelated test diagnostics, and the formal OpenAPI generator plus generated TypeScript typecheck pass.

Full `api:check` passes all 4 tasks with 2198 tests passed, 435 integration-disabled skips, and 26 existing warnings. Full `admin:check` passes all 4 tasks with 318 files / 1420 tests, and cross-app `pnpm check` passes all 8 tasks. Changed-scope review is `status=ok`, has zero enforcement-blocking findings, and retains 45 unrelated report-only findings; no Design System or Style Guide file is reported.

This is semantic manifest comparison, not breaking-impact analysis. Version supersede/lifecycle state, downstream page/recipe/Asset impact, renderer compatibility, Asset/font authorization, compile artifacts, Design writes, and publication readiness remain separate gated capabilities.

### 23. Project version lifecycle and supersession evidence (2026-07-21)

Immutable Design System manifests now have a separate mutable lifecycle projection instead of a status field on `DesignSystemVersionRecord`:

- `DesignSystemVersionStateRecord` stores the exact version one-to-one identity, Workspace boundary, `candidate | validating | valid | published | invalid | superseded | archived` status, status revision, optional replacement version, change actor, and change timestamp. Manifest payloads, checksums, provenance, and parents remain immutable;
- Workspace and Project manual creation produce `candidate` revision 1. Foundation validation advances the projection to `valid` or `invalid` and increments its revision. A Project fork copies the already-valid validation evidence and starts as `valid` revision 1;
- validation, Workspace default assignment, Project assignment, and Project fork now require real lifecycle state. Superseded versions reject new validation and assignment with `DESIGN_SYSTEM_VERSION_SUPERSEDED`; missing lifecycle rows surface as an invariant failure rather than being reconstructed silently from validation data;
- public migration `0049_auto_20260721_0822` creates the projection table through the supported generator. Tenant migration v21 clones it and deterministically backfills existing versions from their latest foundation validation, preserving fork-at-creation revision semantics.

`POST /projects/{projectId}/design-system/{systemId}/versions/{versionId}/supersessions` is the typed Project command boundary:

- the request pins a higher replacement version, its exact checksum, the expected target lifecycle status/revision, and the Design System metadata revision. The command is serialized by the Project lock and replays only an exact request fingerprint through `ProjectDesignSystemCommandRecord`;
- target and replacement must belong to the same project-owned system. The replacement must be higher, lifecycle-valid, checksum-exact, and backed by latest valid foundation evidence. A currently assigned target is rejected;
- success changes only the target lifecycle projection, records the replacement lineage, recomputes the highest eligible `latestValidVersionId`, increments system metadata revision, persists the exact response snapshot, and writes required `project.design_system.version.superseded` Activity;
- Project assignment, retained Site Revisions, current canvas, and active release are never rewritten. Response flags state each unchanged projection explicitly. Historical Site Revisions can continue to resolve the superseded immutable manifest;
- newest-first Project version pages expose `systemMetadataRevision` alongside batch lifecycle and latest-validation projections so clients can submit an exact expected-state command without deriving a mutable revision locally;
- capability truth reports project version history, comparison, and supersession independently as active.

The real PostgreSQL HTTP lifecycle covers candidate/valid/fork revision semantics, exact replay and conflicting-key rejection, superseded revalidation and reassignment blocking, repeated-supersession rejection, cross-Project 404, latest-valid projection, unchanged Builder authorities, and Activity order. Tenant runner/unit and registry integration cover v21 creation and idempotent application. Generated OpenAPI exposes the lifecycle summaries, revisioned history page, request, response, and route.

Final verification passes `api:check` with 4/4 tasks, 2198 tests passed, 435 integration-disabled skips, and 26 existing warnings; `admin:check` with 4/4 tasks, 318 files, and 1420 tests; generated OpenAPI package typecheck; and cross-app `pnpm check` with 8/8 tasks. The first full Admin run encountered seven test timeouts and four Vitest pool worker-start failures, but all affected files passed independently and the complete rerun passed without timeout changes or implementation fallbacks. Changed-scope review remains `status=ok` with zero enforcement-blocking findings and 45 report-only findings outside Design System, Style Guide, and supersession files. `git diff --check` passes.

This command is lifecycle governance, not semantic breaking-impact analysis. It does not claim renderer compatibility, Asset/font authorization, downstream page impact, compilation, Design writes, or publication readiness.

### 24. Project downstream semantic impact preview evidence (2026-07-21)

Project Style Guide review now has a read-only downstream evidence resource over
two exact immutable versions:

- `POST /projects/{projectId}/design-system/{systemId}/impact-previews` accepts
  exact `fromVersionId` and `toVersionId` values, requires Project site-read
  authority, and returns an ephemeral deterministic preview. It performs no
  command write, consumes no idempotency key, emits no Activity event, and does
  not change lifecycle, assignment, Site Revision, canvas, or active release;
- the service requires both versions and their lifecycle projections to belong
  to the same Project-owned system. A missing lifecycle row remains an explicit
  invariant error rather than being reconstructed from validation history, and
  another Project receives the uniform `DESIGN_SYSTEM_NOT_FOUND` boundary;
- the response preserves the existing canonical manifest diff and adds an
  `impactHash` bound to both version identities/checksums, declared coverage,
  summary, and stably ordered impact entries;
- assignment evidence reports whether the Project is currently pinned to the
  source version. All retained Site Revisions pinned to that source version are
  counted exactly in PostgreSQL; historical references are retained as a
  bounded count rather than expanded into an unbounded response;
- detailed Wireframe inspection is intentionally limited to the latest Site
  Revision in the Project's default preview environment, and only when that
  current canvas is pinned to the exact source system/version. A current canvas
  pinned elsewhere produces zero current detailed impacts instead of being
  reinterpreted against a different source;
- primitive, semantic, and component token changes propagate through alias and
  replacement references into component recipes, then into exact current
  Wireframe page/section/component/variant matches. A removed recipe used by a
  current section is a blocker; added/changed recipes and reachable token
  changes are warnings. Multiple matching recipe evidence entries retain their
  individual warnings while affected page/section counts are de-duplicated by
  the actual Wireframe targets;
- mapped and unmapped semantic diff counts stay distinct, so metadata or other
  changes without a proven Wireframe path are visible rather than silently
  classified as safe.

Coverage is explicit, not implied: assignment, Site Revision counts, and the
default-preview Wireframe mapping are `evaluated`; Asset authorization is only
`manifest_only`; active release, renderer, and compiler artifacts are
`not_evaluated`. The preview therefore is not publication readiness, renderer
compatibility, compile validation, Asset/font authorization, or a complete
breaking-change guarantee.

Focused evidence passes three pure analyzer tests, including deterministic
token-to-recipe-to-section propagation, removed-recipe blocking, and
de-duplicated section counts with multiple matching recipes. The real
PostgreSQL Workspace/Project lifecycle test completed within the observed
60-second diagnostic budget and covers capability truth, exact source/target summaries,
assignment/current/historical counts, explicit coverage, unmapped changes, and
cross-Project isolation.

Formal OpenAPI regeneration and generated TypeScript typecheck pass. Full
`api:check` passes all 4 tasks with 2201 tests passed, 436
integration-disabled skips, and 26 existing warnings; API typecheck retains
only the three documented unrelated test diagnostics. Full `admin:check`
passes 318 files / 1420 tests, and cross-app `pnpm check` passes all 8 tasks.
Changed-scope review is `status=ok` with zero enforcement-blocking findings and
45 report-only findings outside this slice; no Design System impact path is
reported. `git diff --check` passes.

### 25. Agent-generated Project Style Guide concept evidence (2026-07-21)

The Style Guide stage now activates the section 10.1 dual-entry generation
contract without making chat persistence a prerequisite for direct creation:

- Stage requests carry `agentId`; assistant-ui Tool requests carry
  `agentRunId` after persisted approval. Both converge on one
  `design_system.concept.generate.v1` Job and one provider/version/validator
  pipeline;
- each generation persists Agent definition/version/assignment identities plus
  exact Design System and Builder context snapshots. Worker execution checks
  those snapshots again before calling the provider;
- the compact provider Tool returns a small visual foundation and the service
  deterministically compiles the complete strict Manifest. Provider text or an
  invalid/unknown Tool call remains an explicit candidate failure;
- generation creates immutable candidate versions and validator-v2 evidence
  only. Selecting a result opens review evidence; accepting changes only the
  Project assignment; `design-system.refresh` remains a separate reviewed
  ChangeSet; renderer/compile/publication readiness remains unavailable;
- assignment-newer-than-canvas is valid. A real Project retained assignment v2
  while its canvas remained pinned to v1, then completed a new generation
  without rebasing, refreshing, assigning, or publishing anything;
- Admin generation locale now follows the active UI locale. A real Chinese
  request produced one Chinese candidate summary instead of inheriting the
  Project content locale;
- the actor-scoped recovery endpoint returns newest active and terminal
  projections independently. A real hard reload restored the terminal Chinese
  v5 result using one recovery `GET` and created no new generation, Thread, or
  Agent Run;
- public migration 0051 and tenant-control v23 carry the same Agent/context
  columns, avoiding a public-model/tenant-schema drift at runtime;
- cancellation recovery for an interrupted Agent Run now treats only
  `reserved` budget reservations as active, closes pending approval/Tool parts,
  and can terminalize against an already-terminal Job.

Real provider evidence for the final direct locale check used DeepSeek
`deepseek-v4-pro`: 3,541 prompt tokens, 4,001 completion tokens, 5,021 cost
micros, and 56,576.6 ms provider duration. The resulting generation succeeded
with `agentRunId=null`, retained all three Agent identity fields, and produced
one validator-backed immutable candidate.

Final Wave 3E verification passes the real tenant Design System lifecycle and
tenant-v23 upgrade nodes, all three Agent cancellation integration regressions,
the 89-test LLM/Builder/Style Guide unit group, the Admin API/editor recovery
suite (`21 passed`), and a real browser hard-refresh check. Full `api:check`
passes all 4 tasks with 2,239 tests passed, 438 integration-disabled skips, 26
existing warnings, and only the three documented test type diagnostics. Full
`admin:check` passes all 4 tasks with 318 files / 1,432 tests and zero lint
warnings/errors. OpenAPI regeneration and package typecheck pass.

Changed-scope review is `status=ok` with zero enforcement-blocking findings and
45 prototype-only report findings across the long-running dirty worktree,
including existing repository-base heuristics in Agent Runtime. They remain
visible and are not represented as zero findings. `git diff --check` passes.
