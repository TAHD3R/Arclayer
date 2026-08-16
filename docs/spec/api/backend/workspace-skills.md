# Workspace Skill Package Contracts

**Status:** Approved contract.
**Canonical target:** `docs/spec/shared/ai-website-builder-platform.md`, section 7.2.
**Related contracts:** `docs/spec/shared/ai-agent-runtime-protocol.md`, `docs/spec/api/backend/background-jobs.md`, and `docs/spec/api/backend/plugins.md`.

This code-spec defines Skill packages, immutable versions, resources,
validation, GitHub import, workspace installation, update review, Agent
resolution, and API contracts. A Skill is a declarative instruction/resource
package. It is never an executable plugin, Tool, Connector, package-manager
command, or permission grant.

## Scenario: Trusted, Versioned Skill Packages for Workspace Agents

### 1. Scope / Trigger

- Trigger: adding or changing official Skills, workspace-authored Skills,
  GitHub Skill imports, package validation, installations, update flows,
  Agent Skill grants, or Skill context loading.
- Applies to:
  - official Skill catalog records in the public control plane;
  - workspace Skill records in tenant schemas;
  - target module `apps/api/src/modules/workspaces/skills/**`;
  - GitHub import/refresh and validation Background Jobs;
  - Agent definition/version/assignment resolution;
  - generated Product Application clients and official catalog UI.
- Supported source kinds:
  - `builtin`: Arclayer-official, read-only package source;
  - `inline`: workspace-authored declarative instructions/resources;
  - `archive`: workspace-uploaded ZIP package resolved to immutable inline
    resources with the original archive checksum retained as provenance;
  - `github`: a public repository whose current default branch contains exactly
    one discoverable Skill root, imported at an immutable commit.

Archive import accepts one bounded multipart ZIP with root `skill.json`, root
`SKILL.md`, and optional UTF-8 Markdown, plain-text, or JSON references. Archive
paths, compression ratios, collisions, expanded bytes, schema, and MIME are
validated before the immutable package transaction begins.

`npx`, npm package execution, shell commands, Python entrypoints, dynamically
loaded JavaScript, and repository hooks are outside the Skill contract. Such
capabilities require the trusted Tool/Connector/plugin boundaries.

### 2. Hard-Cut Decision

The target hard cut:

- converts built-in definitions into versioned official catalog packages;
- stores workspace packages, resources, validation, and installations as
  normalized tenant data;
- separates Skill instructions from Agent identity, Tool grants, execution
  mode, approval policy, and Connector capabilities;
- resolves a repository's default branch to an immutable commit before
  importing bytes;
- validates and pins exact Skill versions before an Agent Run can use them;
- removes locator text, `npx`, static catalog authority, and product-facing
  enable/allowlist settings after migration review.

### 3. Ownership and Module Boundaries

Storage ownership:

- official package identities, mutable package metadata/lifecycle, official
  immutable versions, publisher verification, validation evidence, and
  official resource manifests live in the public control plane. Platform AI
  Operations is the write authority. Reviewed Arclayer-owned package assets are
  bootstrap seeds and may append a reviewed checksum, but are not a competing
  runtime or metadata authority.
- workspace-authored/imported package identities, versions, resources,
  validation results, import review records, and all workspace installations
  live in the workspace tenant schema.
- an installation references either an official public package/version or a
  workspace package/version through a discriminated validated descriptor; it
  does not create a cross-schema foreign key.
- large resource bytes use the authorized Asset/storage domain. Skill records
  retain immutable content hashes and safe references.
- GitHub credentials remain Connector secret references and never enter Skill
  manifests, Job payloads, diffs, events, or Agent context.

Target module shape:

```text
apps/api/src/models/skills/
  skill_package.py
  skill_version.py
  skill_resource.py
  skill_validation.py
  skill_installation.py

apps/api/src/modules/workspaces/skills/
  router.py
  schema.py
  repository.py
  service.py
  catalog.py
  importer.py
  validator.py
  resolver.py
  diff.py
```

Contracts:

- routers call services; services extend `BaseService`; tenant repositories
  extend `TenantScopedRepository`; public official-catalog repositories extend
  `TortoiseORMRepository`.
- package importers, GitHub readers, manifest validators, scanners, and Asset
  readers are injected interfaces. A service never constructs a concrete GitHub
  client or executes repository code.
- official catalog synchronization is fail-fast: duplicate IDs, missing
  resources, invalid signatures/checksums, or undeclared Tools prevent catalog
  activation.
- startup bootstrap never rewrites Platform-edited metadata, reactivates an
  archived package, or archives a package merely because it is absent from the
  packaged seed list.
- Skill loading returns immutable values and never mutates a caller-supplied
  manifest/resource list.

### 4. Domain Model

#### 4.1 Stable enums

```text
SkillSourceKind = builtin | inline | archive | github
SkillPackageScope = system | workspace
SkillTrustLevel = official_verified | workspace_authored | imported_unverified
SkillPackageStatus = active | archived
SkillVersionStatus = candidate | validating | valid | warning | invalid |
                     quarantined | superseded
SkillInstallationStatus = enabled | disabled | failed | incompatible
SkillUpdateRisk = none | content | capability | permission | data_egress |
                  incompatible
```

`warning` is installable only when every warning is explicitly reviewable and
no security/capability blocker exists. `invalid`, `quarantined`, and
`incompatible` versions cannot be enabled.

#### 4.2 `SkillPackage`

Required fields:

- stable public ID, scope, source kind, slug, display name, description, and
  publisher identity;
- trust level and publisher verification evidence for official packages;
- workspace descriptor for custom packages;
- lifecycle status, latest valid version reference, metadata revision, actors,
  and timestamps;
- source identity:
  - official catalog key for `builtin`;
  - workspace authoring identity for `inline`;
  - normalized repository URL for Workspace `github` imports. The resolved
    default branch and discovered Skill root are retained as source evidence,
    not user-authored package identity.

Slug uniqueness is enforced within `(scope, publisher, workspace)` after
normalization. Source kind and package scope are immutable. Renaming metadata
never changes manifest identity or installed version checksums.

#### 4.3 `SkillManifestV1`

The immutable manifest is a strict versioned Pydantic discriminated schema:

```json
{
  "manifestVersion": 1,
  "skillId": "stable.package.slug",
  "name": "Editorial Voice",
  "description": "Applies the workspace editorial voice and review rules.",
  "publisher": {
    "id": "publisher_public_id",
    "name": "Arclayer",
    "verified": true
  },
  "compatibility": {
    "agentProtocol": 1,
    "arclayerRange": ">=1"
  },
  "instructionsEntrypoint": "SKILL.md",
  "resources": [],
  "requiredTools": [],
  "permissions": [],
  "dataEgress": [],
  "capabilityTags": [],
  "checksum": "sha256:..."
}
```

Manifest rules:

- `extra="forbid"`; unknown required semantics are a version error rather than
  ignored configuration.
- `instructionsEntrypoint` resolves to exactly one declared text/Markdown
  resource inside the package root.
- every resource declares normalized relative path, role, MIME, byte size,
  SHA-256 digest, and storage/content reference.
- `requiredTools` declares stable Tool ID plus compatible Tool version range and
  intended use. It does not grant the Tool.
- `permissions` and `dataEgress` are structured declarations shown during
  validation/install/update review. They are never inferred from instruction
  prose.
- the package checksum covers canonical manifest JSON plus ordered resource
  path/digest pairs.
- executable entrypoints, post-install scripts, lifecycle hooks, package-manager
  commands, and arbitrary environment requirements are forbidden fields.

Custom names/descriptions are user content. Official package copy uses stable
i18n keys in the catalog projection while the signed manifest retains canonical
source text.

#### 4.4 `SkillVersion` and `SkillResource`

Every authoring/import operation creates an immutable version candidate with:

- package ID, monotonic package-local version number, semantic display version
  where provided, manifest version, canonical manifest, and package checksum;
- resolved source provenance:
  - official catalog release/build identity;
  - inline parent version and author;
  - ZIP archive checksum, uploaded filename, and actor;
  - Git repository URL, resolved default branch, resolved full commit,
    discovered Skill root, tree hash, and fetch timestamp;
- compatibility snapshot and declared Tool/permission/data-egress sets;
- validation-policy version, provenance actor/Job/correlation ID, and timestamps.

Resources are immutable rows keyed by `(skill_version_id, normalized_path)`.
Their bytes/digests cannot be replaced in place. Editing an inline Skill,
refreshing GitHub, changing metadata covered by the checksum, or upgrading a
manifest creates another version.

Operational validation status is a separate projection. A candidate is never
treated as valid because its import Job succeeded; full validation must pass.

#### 4.5 `SkillValidationResult`

Each validation attempt records:

- version and validator-policy versions;
- status, stable finding codes, severity, safe localized message keys, and
  resource locations;
- manifest/schema, path/MIME/digest, compatibility, Tool existence/version,
  permission/data-egress declaration, secret scan, and instruction safety
  results;
- validator Job/correlation/actor and timestamps;
- immutable finding hash for review/audit.

Validation never executes resources. Code snippets may be stored as inert
documentation when their MIME/role is allowed, but they are never imported or
evaluated as application code.

#### 4.6 `SkillInstallation`

An installation contains:

- public ID and workspace descriptor;
- discriminated package/version descriptor;
- exact pinned Skill version and checksum;
- `enabled | disabled | failed | incompatible` status and safe reason;
- accepted Tool requirements, permission declarations, data-egress
  declarations, and validation finding hash;
- install/update actor, idempotency key, metadata revision, and timestamps;
- optional available-update version plus computed update risk summary.

An installation never tracks a mutable Git branch or “latest” at runtime.
Refresh may discover a candidate version, but switching the pinned version is an
explicit audited update. Enabling revalidates version status, compatibility,
required Tool availability, workspace policy, entitlement, and current actor
permission.

### 5. HTTP API Surface

All routes are Product API resources under the canonical prefix:

```text
/api/v1/workspaces/{workspaceId}/skills
```

The domain router excludes `/api/v1` and uses tag
`domain.workspaces.skills`.

| Method and local path | Contract |
| --- | --- |
| `GET /capabilities` | Return explicit inline/official/GitHub/validation/installation/Agent-grant availability. |
| `GET /catalog` | Cursor-paginated official/custom catalog with publisher, capability, compatibility, installed, update, and status filters. |
| `GET /packages` | Cursor-paginated workspace-owned package list. |
| `POST /packages` | Idempotently create an inline package and first immutable candidate version. |
| `GET /packages/{packageId}` | Return package metadata, source/trust, latest versions, validation, and installation summary. |
| `PATCH /packages/{packageId}` | Patch uncovered metadata with `expectedRevision`; source/scope are immutable. |
| `GET /packages/{packageId}/impact` | Return exact package/archive impact across versions, installations, Agent references, retained Runs, and active GitHub operations. |
| `DELETE /packages/{packageId}?expectedRevision={revision}` | Idempotently archive after a revision-checked impact review; this does not purge immutable versions. |
| `GET /packages/{packageId}/versions` | Cursor-paginated immutable version history. |
| `POST /packages/{packageId}/versions` | Create an inline version candidate from strict manifest/resources. |
| `GET /packages/{packageId}/versions/{versionId}` | Return immutable manifest, provenance, validation, and safe resources. |
| `POST /imports/zip` | Idempotently import one bounded ZIP containing `skill.json`, `SKILL.md`, and optional supported text references into a package and first immutable candidate version. |
| `POST /imports` | Accept only a public GitHub repository URL, discover its default-branch Skill package, and create a durable import that returns a candidate package/version. |
| `GET /imports/{importId}` | Return durable queued/fetching/persisting/succeeded/failed/cancelled import evidence. |
| `POST /packages/{packageId}/refreshes` | Queue a refresh from the package's GitHub repository authority, rediscovering the current default branch and unique Skill root without changing existing versions or installations. |
| `POST /packages/{packageId}/versions/{versionId}/validations` | Create a durable full validation attempt. |
| `GET /packages/{packageId}/versions/{versionId}/validation-results` | List immutable validation attempts/findings. |
| `GET /installations` | Cursor-paginated workspace installations with Agent usage and update state. |
| `POST /installations` | Idempotently install an exact valid version after review. |
| `GET /installations/{installationId}` | Return pin, declarations, compatibility, usage, update, and revision. |
| `PATCH /installations/{installationId}` | Enable/disable or patch approved assignment metadata with `expectedRevision`. |
| `DELETE /installations/{installationId}` | Uninstall after Agent/Run impact evaluation. |
| `POST /installations/{installationId}/update-previews` | Compare installed and candidate versions without switching. |
| `POST /installations/{installationId}/updates` | Explicitly accept one reviewed candidate and atomically repin. |

All create/import/validation/install/update/archive commands require `Idempotency-Key`.
Mutable metadata commands require `expectedRevision`. Collections use opaque
cursor pagination with deterministic ordering. Responses use typed
`ResponseModel[T]`, `PublicUUID`, stable errors, and generated OpenAPI types.

Platform official-catalog routes use the Platform API composition and exact
permissions `platform:ai-skills:read` and `platform:ai-skills:manage`:

| Method and local path | Contract |
| --- | --- |
| `GET /skills` | Cursor-paginated official packages including active/archived lifecycle and adoption counts. |
| `POST /skills` | Idempotently create an official package plus its first immutable validated version. |
| `GET /skills/{packageId}` | Read metadata, immutable versions, resources, validation, and sanitized Workspace adoption impact. |
| `PATCH /skills/{packageId}` | Update display metadata with `expectedRevision`; identity, scope, publisher trust, and source kind remain immutable. |
| `POST /skills/{packageId}/versions` | Publish a new immutable manifest/resource version after deterministic validation. |
| `DELETE /skills/{packageId}?expectedRevision={revision}` | Archive the package after impact review; installed and historical exact versions remain readable. |

Platform deletion is archival, not hard purge. Archiving removes the package
from new Workspace discovery and blocks new installations and Runs that have
not yet snapshotted it; it never mutates existing installation pins or retained
Run snapshots. Re-enabling an existing installation still fails while its
official package is archived.

Read/catalog actions map to `system:settings:read`; package/import/validate/
install/update/delete actions map to `system:settings:manage`. Tool usage remains
subject to each actor's Tool permission; installing a Skill never grants its
required Tools.

### 6. Authoring, Import, and Validation Flows

#### 6.1 Inline authoring

```text
create package + candidate version
→ strict manifest/resource persistence
→ validation
→ valid/warning/invalid/quarantined
→ explicit installation
```

Saving changed content creates a new candidate rather than mutating an existing
version. Validation results attach to exact checksums. A version whose resource
hash changes cannot reuse a prior validation result.

#### 6.2 GitHub import

```text
requested public repository URL
→ normalize and authorize repository identity
→ read and validate the repository default branch
→ resolve the default branch to a full immutable commit/tree
→ require exactly one directory containing root `skill.json` and `SKILL.md`
→ fetch bounded tree/object data
→ parse package name, description, declarations, and stable slug from `skill.json`
→ reject escaping path/symlink/submodule behavior
→ persist resource digests and candidate version
→ validate without executing repository content
→ present source/diff/findings for review
```

Private repositories require an authorized GitHub Connector installation and
remain gated until that authority exists. Public repository fetching uses a
fixed `api.github.com` boundary with public-IP DNS pinning and forbids redirects.
It resolves the current default branch to a full commit/tree first and then fetches each
exact blob SHA through the Git object API. A moving branch cannot change bytes
after resolution because every blob is verified against Git's canonical object
SHA-1 identity before persistence.

The importer:

- rejects absolute paths, traversal, escaping symlinks, unsupported submodules,
  duplicate normalized paths, case-collision, and manifest entrypoints outside
  the pinned subpath;
- parses `.json` resources, classifies Markdown/text as inert UTF-8 content,
  and records every resource digest;
- never runs install scripts, generators, hooks, package managers, or code;
- uses named configurable limits for files, bytes, depth, decompression, and
  fetch time, justified by capacity/security tests; exceeding a limit fails
  explicitly without truncating and claiming a valid package;
- redacts credentials and raw provider errors from public state.

#### 6.3 Update review

An update preview compares exact old/new manifests and resources and classifies:

- added, removed, and modified resource paths/digests;
- instruction entrypoint/content changes;
- compatibility changes;
- required Tool additions/removals/version changes;
- permission and data-egress changes;
- publisher/source/commit provenance changes;
- validation finding changes.

Content-only changes still require explicit acceptance. Any capability,
permission, data-egress, trust, or incompatible change requires an elevated
review presentation and cannot be auto-accepted. Update acceptance is
idempotent, revalidates the candidate, atomically repins the installation, and
records a required audit event.

`POST /installations/{installationId}/update-previews` accepts the candidate
version ID plus the installation's expected revision, current version ID,
current checksum, and current validation finding hash. The response contains:

- the exact current and candidate version/checksum/validation identities;
- the deterministic resource, declaration, compatibility, provenance, and
  validation-finding diff;
- one highest-severity `risk` plus the full set of triggered risk categories;
- a deterministic `previewHash` covering the installation ID, expected
  revision, both exact pins, both manifests/resources/provenance records, and
  both validation records.

Every preview is persisted with its request fingerprint. Replaying the same
`Idempotency-Key` and payload returns the same preview; reusing the key for a
different payload fails. Preview creation never changes the installation pin
or metadata revision.

`POST /installations/{installationId}/updates` accepts the preview ID/hash,
both exact pin identities, `expectedRevision`, and the candidate's complete
required-Tool, permission, and data-egress acceptance sets. In one transaction
the service locks the installation and preview, verifies that the preview has
not already been consumed by another update, reloads and revalidates the exact
candidate, recomputes the preview hash, and then changes the installation pin,
accepted declarations, validation evidence, update projection, revision, and
actor. Any revision, checksum, validation, manifest/resource, or preview drift
fails with `SKILL_UPDATE_PREVIEW_REQUIRED`; no partial mutation is committed.

Update command idempotency is stored independently of the installation row so
an older command can be replayed after later metadata changes without treating
the current mutable row as its original result. The command record retains the
resulting revision and exact resulting pin. It never stores Skill content or
secrets.

### 7. Background Jobs

Required Job types:

- `skill.github.import` version `2`, task
  `jobs:connector:skill-github-import:v2`, on workload `connector`;
- `skill.github.refresh` version `2`, task
  `jobs:connector:skill-github-refresh:v2`, on workload `connector`;
- `skill.version.validate.v1` on workload `connector`;
- `skill.package.purge.v1` on workload `maintenance`.

GitHub Job targets contain only workspace/import IDs and the optional refresh
package ID. Their strict input reference contains the operation, normalized
public repository URL, and request revision. The resolved default branch,
discovered root, parsed package identity, and exact commit/tree/blob evidence
exist only after fetch and are persisted in the domain result/version
provenance. Jobs never contain repository tokens, package bytes, instruction
text, or secrets. Non-terminal version-1 Jobs and matching import records are
explicitly failed during migration and must be requested again.

Request idempotency fingerprints the operation, repository identity, and
optional refresh package identity. Version persistence binds the resolved
default branch, discovered root, commit/tree, and package checksum; the same
exact outcome is reconciled on redelivery without creating duplicate versions
or resources. A changed branch name or Skill root creates new immutable
provenance even when the resolved bytes are unchanged.
Validation idempotency includes version checksum and validator-policy version.

Only transient provider/network/rate-limit failures retry. Invalid manifests,
forbidden paths, checksum mismatch, incompatible Tools, security findings, and
permission failures are permanent until input/policy changes. Job enqueue
failure uses the durable outbox and never falls back to request-local import.

### 8. Agent Resolution and Runtime Contract

Agent versions reference allowed `SkillInstallation` IDs, not package slugs,
Git URLs, or static registry entries. At assignment/Run creation the resolver:

1. resolves workspace/project Agent assignment and exact Agent version.
2. loads each enabled installation and exact pinned Skill version/checksum.
3. revalidates installation/version status, compatibility, workspace policy,
   entitlement, and required Tool availability.
4. computes Tool access independently as the intersection of actor permission,
   Agent grants, execution mode, workspace policy, entitlement, Connector state,
   and approval policy.
5. builds deterministic ordered instruction/resource context with provenance
   and bounded token accounting.
6. stores exact Skill installation/version/checksum/validation-policy references
   in the durable Agent Run context snapshot.

Because installations are tenant-owned while System Agent definitions can be
reused globally, a version with non-empty Skill grants also stores one
`skillGrantWorkspaceId`. The field is required exactly when
`skillInstallationIds` is non-empty. It is part of the immutable version
checksum and means:

- version publication validates every installation against that exact
  workspace and its current tenant schema;
- an assignment to another workspace is rejected rather than silently dropping
  or remapping grants;
- a Skill-free version remains reusable across workspaces;
- granting the equivalent package in another workspace requires a new Agent
  version referencing that workspace's installation IDs.

Run creation persists one normalized `AgentRunSkillSnapshot` row per
`(Run, Agent assignment, Skill installation)`. Rows retain deterministic Agent
and Skill order plus the exact package scope, package/version IDs, package
checksum, validation policy/finding hash, and context byte count. Workspace and
official resources remain in their immutable version authorities; the worker
loads only the recorded version and verifies every resource digest before
placing text resources into the untrusted Skill-context section. It never
queries an installation's latest version or a GitHub source during execution.

The worker validates that the persisted rows exactly match the immutable Agent
version grants. A missing, extra, duplicated, reordered, or checksum-mismatched
row is a permanent Run snapshot failure. Disabling an installation after Run
creation blocks new Runs but does not rewrite the already-created snapshot;
Tool, Connector, actor-permission, and approval checks remain live authority at
the moment of use.

A Skill cannot expand an Agent's Tool grant, execution mode, approval policy,
Knowledge ACL, data-egress permission, or budget. Instruction text that asks to
ignore these boundaries is untrusted content and has no authority.

Runtime never fetches GitHub or “latest” Skill content. If an installation is
disabled, deleted, becomes incompatible, loses a required Tool, or is revoked
before Run creation, the Run fails with an explicit compatibility/grant error.
An already-running Run retains its immutable Skill content for reproducibility,
but every Tool/Connector/permission decision is still revalidated when used.

### 9. Security and Trust

- official verification is assigned only to Arclayer-controlled publisher keys
  and reviewed catalog synchronization. Workspace admins cannot set
  `official_verified` through an API field.
- imported/workspace instructions and resources are untrusted model context.
  Validation findings remain visible; suspicious content is never silently
  rewritten and declared safe.
- manifests/resources never store secrets. Secret-looking values fail scanning
  and remain quarantined until a new version removes them.
- data-egress declarations are shown at install/update and rechecked when the
  referenced Tool/Connector is called.
- catalog/list/search never leaks another workspace's package, installation,
  repository, validation finding, or Agent usage.
- source URLs, commits, and resource paths are escaped as content in the Product Application; they
  never become commands or executable links without URL policy validation.
- removal immediately blocks new Agent Run resolution. Historical Run/audit
  references retain immutable provenance until governing retention expires.

### 10. Concurrency, Delete, and Failure Semantics

- package/installation mutable metadata uses optimistic revisions; stale writes
  fail and never silently merge.
- version creation, import, validation, install, and update use request
  fingerprint plus idempotency key. Key reuse with different input conflicts.
- only one installation for the same exact package identity may be enabled in a
  workspace unless a future approved multi-version policy explicitly changes
  this invariant.
- deleting a package or installation first computes Agent definition/version/
  assignment and retained Run references. Active references block destructive
  removal and return sanitized impact metadata.
- package archive impact additionally counts immutable versions, validations,
  resources, workspace installations, and non-terminal GitHub import/refresh
  operations. Any installation or queued/fetching/persisting refresh blocks the
  archive. Agent/Assignment/retained Run counts are aggregated through those
  exact installations and remain visible in the impact response.
- package archive is a soft, idempotent state transition from `active` to
  `archived` under the package row lock. It increments `metadataRevision`,
  persists the exact result snapshot, and writes required Activity evidence in
  the same transaction. The same idempotency key replays that result; a
  different command cannot re-archive it.
- archived packages are omitted from the default package list and are read-only:
  they cannot create versions or validations, queue GitHub refreshes, or create
  installations.
  Workers recheck `active` while holding the package lock before persisting a
  refresh, so an archive cannot race a stale Job into a new version.
- archive/disable prevents new use immediately; purge is a separate durable
  maintenance Job and retains audit/provenance rows as required.
- a failed refresh or candidate validation never changes the installed pin.
  The previous installed version remains canonical and the failed update is
  visible; it is not relabelled as updated.

### 11. Stable Errors

| Condition | Required error |
| --- | --- |
| Package/version/installation is missing or cross-workspace | `SKILL_NOT_FOUND` |
| Inline slug is malformed or already belongs to another package | `SKILL_SLUG_INVALID` / `SKILL_SLUG_EXISTS` |
| Actor lacks catalog/read/manage permission | `PERMISSION_DENIED` without existence leakage |
| Unsupported manifest version/field | `SKILL_MANIFEST_UNSUPPORTED` |
| Manifest/resource/checksum mismatch | `SKILL_CHECKSUM_MISMATCH` |
| Entrypoint/path/MIME is invalid | `SKILL_RESOURCE_INVALID` |
| Git source/ref/subpath is invalid or forbidden | `SKILL_GITHUB_SOURCE_INVALID` |
| Repository has no usable default branch | `SKILL_GITHUB_DEFAULT_BRANCH_UNAVAILABLE` |
| Repository contains no discoverable Skill root | `SKILL_GITHUB_SKILL_ROOT_NOT_FOUND` |
| Repository contains more than one discoverable Skill root | `SKILL_GITHUB_SKILL_ROOT_AMBIGUOUS` |
| Discovered `skill.json` does not satisfy the package metadata contract | `SKILL_GITHUB_METADATA_INVALID` |
| Git object changed after resolved commit fingerprint | `SKILL_GITHUB_SOURCE_CONFLICT` |
| Version is invalid or quarantined | `SKILL_VERSION_NOT_INSTALLABLE` |
| Tool/Arclayer/Agent protocol compatibility fails | `SKILL_VERSION_INCOMPATIBLE` |
| Required Tool is not available/granted | `SKILL_REQUIRED_TOOL_UNAVAILABLE` |
| Declaration review evidence does not exactly match the selected version | `SKILL_DECLARATION_ACCEPTANCE_REQUIRED` |
| The package already has a workspace installation | `SKILL_ALREADY_INSTALLED` |
| Mutable metadata revision is stale | `SKILL_REVISION_CONFLICT` |
| Idempotency key is reused with different input | `SKILL_IDEMPOTENCY_CONFLICT` |
| Update was not previewed or preview is stale | `SKILL_UPDATE_PREVIEW_REQUIRED` |
| Delete/uninstall has installation, Agent/Run, or active refresh references | `SKILL_DELETE_BLOCKED` |
| A write targets an archived package | `SKILL_PACKAGE_ARCHIVED` |

Messages use backend i18n keys and sanitized metadata. Frontend control flow
branches on stable codes.

Generated migrations and OpenAPI artifacts are command output and are never
hand-edited.

### 12. Tests and Acceptance Gates

Required tests:

- manifest/Pydantic tests for strict v1 schemas, canonical checksum, immutable
  resources, unknown fields, forbidden executable fields, and compatibility.
- official catalog tests for duplicate IDs, publisher verification, missing
  resource, checksum failure, Tool references, and fail-fast startup sync.
- repository/service tests for tenant binding, revisions, idempotency,
  version/install uniqueness, required audit events, impact/delete, and
  connection propagation.
- route tests for typed envelopes, `PublicUUID`, auth/CSRF, permission mapping,
  cursor pagination, filters, cross-workspace not-found behavior, and stable
  errors.
- GitHub security tests for default-branch resolution, unique Skill-root
  discovery, metadata parsing, ref-to-commit pinning, moving refs,
  redirect/SSRF, traversal, escaping symlinks, submodules, case collision, MIME
  mismatch, archive/decompression/resource limits, token redaction, and no
  execution.
- Job integration tests for import/refresh/validate redelivery, transient retry,
  permanent failure, cancellation, outbox failure, and real tenant context.
- update tests for every diff/risk category, stale preview, changed validation,
  permission/data-egress escalation, atomic repin, and failed candidate
  preservation.
- Agent resolver tests for exact version/checksum pinning, deterministic order,
  token accounting, disabled/incompatible installation, missing Tool,
  permission intersection, no Tool-grant escalation, and no runtime Git fetch.
- migration tests proving legacy locators become review records rather than
  installed Skills and `npx` has no executable path.
- OpenAPI generation and Product Application typecheck for catalog, package, version,
  validation, installation, update, and error contracts.

Acceptance requires a real PostgreSQL tenant migration, real durable import/
validation Job execution, immutable Git commit fixture, and one real
assistant-ui Agent Run using a pinned installed Skill. A static catalog unit
test or successful Git download alone is insufficient.
