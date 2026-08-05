# Workspace Knowledge Contracts

**Status:** Approved contract.
**Canonical target:** `docs/spec/shared/ai-website-builder-platform.md`, section 7.1.
**Related contracts:** `docs/spec/api/backend/background-jobs.md`, `docs/spec/shared/ai-agent-runtime-protocol.md`, and `docs/spec/shared/api-contracts.md`.

This code-spec defines Workspace Knowledge persistence, ingestion, retrieval,
authorization, Agent context, API, and lifecycle contracts. Knowledge is a
first-class tenant domain. It is not an opaque workspace setting, a browser-only
attachment list, or prompt text copied into every conversation.

## Scenario: Versioned, Tenant-Safe Knowledge for Human and Agent Workflows

### 1. Scope / Trigger

- Trigger: adding or changing Knowledge bases, sources, ingestion, parsing,
  indexing, retrieval, citations, ACLs, Agent Knowledge grants, or Workspace
  Knowledge Product APIs.
- Applies to:
  - target models under `apps/api/src/models/knowledge/**`;
  - target module `apps/api/src/modules/workspaces/knowledge/**`;
  - tenant-control migrations;
  - Background Job types for fetch, parse, index, refresh, and purge;
  - Agent context resolution and retrieval Tools;
  - generated Admin OpenAPI clients.
- Supported source kinds:
  - `manual`;
  - `file`;
  - `url`;
  - `connector` for repository/document providers;
  - `structured_content` for canonical Arclayer content references.

This contract does not define a general-purpose vector database API, does not
allow arbitrary runtime network retrieval from prompts, and does not make an
embedding provider's storage authoritative for source content.

### 2. Hard-Cut and Availability Contract

The hard cut:

- adds normalized tenant-owned Knowledge records instead of new core-setting
  keys;
- binds every request and Job to the canonical `WorkspaceContext` and tenant
  schema;
- creates immutable source versions and reproducible index metadata;
- makes ingestion durable through `BackgroundJob` rather than request-local
  work or hidden inline fallback;
- keeps retrieval, citation, and Agent Run pinning behind explicit capability
  gates until their ACL and source-version contracts are implemented.

URL ingestion is deployment-gated by both `KNOWLEDGE_SOURCE_FETCH__ENABLED` and
`KNOWLEDGE_INDEX__ENABLED`; the capability response is false unless both are
enabled. File, Connector, structured-content, retrieval, citation delivery, ACL
revalidation, and Agent Run source-version pinning must not be advertised until
their complete contracts and acceptance gates are active.

There is no legacy Knowledge data to preserve. Any pre-existing prompt text or
Agent system setting remains prompt configuration until a user explicitly
imports it as a Knowledge source; migration must not silently reinterpret it.

### 3. Ownership and Module Boundaries

Storage ownership:

- `KnowledgeBase`, `KnowledgeAccessPolicy`, `KnowledgeSource`,
  `KnowledgeSourceVersion`, `KnowledgeChunk`, and source-version operational
  projections live in the workspace tenant schema.
- source bytes continue to use the existing Asset/storage domain. Knowledge
  stores authorized Asset references and immutable hashes, not duplicate binary
  blobs.
- `BackgroundJob`, attempts, and dispatch outbox records remain in the public
  control plane and carry validated tenant target descriptors.
- provider credentials and Connector secret references stay in their canonical
  secret/Connector domains and never enter tenant Knowledge JSON.

Target module shape:

```text
apps/api/src/models/knowledge/
  knowledge_base.py
  knowledge_source.py
  knowledge_source_version.py
  knowledge_chunk.py

apps/api/src/modules/workspaces/knowledge/
  router.py
  schema.py
  repository.py
  service.py
  ingestion.py
  retrieval.py
  policy.py
```

Contracts:

- routers call injected services; services extend `BaseService`; repositories
  extend `TenantScopedRepository` and receive the bound tenant connection.
- fetchers, parsers, embedders, scanners, and Connector readers are injected
  interfaces. Business services do not construct concrete providers.
- normalized metadata/state changes and required domain events share the
  service transaction boundary.
- a Job handler resolves the tenant target again before reading tenant rows; a
  broker payload never contains source text, credentials, or chunks.

### 4. Domain Model

#### 4.1 Stable enums

```text
KnowledgeBaseStatus = active | disabled | deleting
KnowledgeSourceKind = manual | file | url | connector | structured_content
KnowledgeSourceStatus = pending | fetching | parsing | indexing | ready |
                        stale | failed | quarantined | disabled | deleting
KnowledgeVersionStatus = pending | fetching | parsing | indexing | ready |
                         failed | quarantined
KnowledgeIngestionMode = initial | refresh | reparse | reindex
KnowledgeVisibility = workspace | restricted
```

`quarantined` is a security state, not a retryable provider failure. `stale`
means a previously ready serving version is still identifiable but its upstream
freshness or index compatibility is no longer current. The state is visible to
users and retrieval callers; it is never presented as fresh.

#### 4.2 `KnowledgeBase`

Required fields:

- public ID and workspace ID descriptor;
- name, description, default locale, and status;
- current access-policy revision;
- mutable metadata revision for optimistic concurrency;
- created/updated actor and timestamps;
- nullable deletion request/actor/timestamp.

Names are unique per active workspace after Unicode normalization and
case-folding. Renaming changes metadata only and never rewrites source versions,
chunks, citations, or Agent Run snapshots.

#### 4.3 `KnowledgeAccessPolicy`

The policy is a versioned structured value with:

- `visibility: workspace | restricted`;
- allowed project public IDs;
- allowed workspace role codes and member public IDs;
- allowed Agent definition public IDs;
- monotonically increasing `policy_revision` and audit provenance.

`workspace` visibility still requires the caller's base Knowledge permission.
`restricted` denies access unless both the actor and current Agent/project
context match the policy. Empty restricted allowlists deny all retrieval. IDs
are validated descriptors, not cross-schema foreign keys.

ACL evaluation occurs at query time and again when a Tool retrieves a selected
chunk. Index-time filtering alone is forbidden because membership, Agent grants,
and project access can change after indexing.

#### 4.4 `KnowledgeSource`

Required fields:

- public ID, Knowledge Base ID, source kind, display name, locale, and status;
- kind-specific validated locator:
  - manual source identity;
  - Asset/file reference;
  - normalized URL;
  - Connector installation plus provider object reference;
  - canonical content model/item/query reference;
- optional refresh schedule policy and upstream fingerprint;
- active ready version ID and latest candidate version ID;
- last attempted/succeeded/failed ingestion timestamps and safe error code;
- serving freshness (`current | stale`) separate from refresh attempt status;
- metadata revision, actors, and timestamps.

Locators are discriminated Pydantic schemas with `extra="forbid"`. A source
cannot change kind in place. Changing a locator creates a new source or an
explicit replacement flow so historical citations retain their meaning.

#### 4.5 `KnowledgeSourceVersion`

Each ingestion creates a new immutable version candidate. Required immutable
fields:

- public ID, source ID, monotonic source-local version number;
- source content hash, normalized-content hash, parser name/version, and
  ingestion mode;
- immutable fetch provenance: resolved URL/redirect chain or Connector object
  revision, immutable repository commit/object when applicable, response MIME,
  fetch timestamp, and authorized Asset/content references;
- locale, title, and document metadata extracted by the parser;
- embedding provider/model/version, vector dimensions, chunker name/version,
  and index schema version;
- token/character/chunk counts when measured;
- provenance actor, Job, correlation ID, and timestamps.

Operational status and safe error detail are updated on a separate
source-version state projection. Content, parser, chunker, embedding, and
provenance fields never mutate after the candidate is created.

#### 4.6 `KnowledgeChunk`

Required fields:

- public ID, source version ID, deterministic chunk ordinal, and content hash;
- normalized public text or an encrypted/authorized text reference according
  to the workspace data policy;
- exact citation location: page, section path, heading, line/character range,
  record/field locator, and source URI where applicable;
- token count, locale, metadata, and upstream ACL tags;
- embedding reference plus provider/model/version/dimensions;
- prompt-injection scan result and retrieval eligibility.

Unique `(source_version_id, ordinal)` and deterministic content hashes make
index writes idempotent. A chunk never silently points at a different source
version after refresh.

### 5. HTTP API Surface

All routes are Product API resources under the canonical workspace-context prefix:

```text
/api/v1/workspaces/{workspaceId}/knowledge-bases
```

Domain router prefix excludes `/api/v1` and uses tag
`domain.workspaces.knowledge`.

| Method and local path | Contract |
| --- | --- |
| `GET /` | Cursor-paginated list with search, status, locale, and updated ordering. |
| `POST /` | Idempotently create a Knowledge Base and initial access policy. |
| `GET /{baseId}` | Return detail, policy, source/state counts, and metadata revision. |
| `PATCH /{baseId}` | Patch metadata/policy with `expectedRevision`; never patch source content. |
| `DELETE /{baseId}` | Request explicit deletion after impact evaluation. |
| `GET /{baseId}/sources` | Cursor-paginated source list with kind/status/freshness filters. |
| `POST /{baseId}/sources` | Idempotently create a validated manual or URL source identity. It does not fetch external bytes. |
| `GET /{baseId}/sources/{sourceId}` | Return locator summary, status, active/candidate versions, Job, and safe error state. |
| `PATCH /{baseId}/sources/{sourceId}` | Patch display metadata, schedule, or enabled state with `expectedRevision`. |
| `DELETE /{baseId}/sources/{sourceId}` | Request source deletion after reference/retention checks. |
| `GET /{baseId}/sources/{sourceId}/versions` | Cursor-paginated immutable version history. |
| `POST /{baseId}/sources/{sourceId}/versions` | Create a manual-source version from validated content and an idempotency key. |
| `GET /{baseId}/sources/{sourceId}/versions/{versionId}` | Return immutable provenance, index compatibility, state, and citation summary. |
| `POST /{baseId}/sources/{sourceId}/ingestions` | For URL sources, create an `initial | refresh` durable ingestion Job and return `202`. |
| `POST /{baseId}/retrieval-previews` | Execute an authorized bounded retrieval preview with citations and diagnostics. |

Every response uses typed `ResponseModel[T]`, `PublicUUID`, camel-cased generated
OpenAPI fields, and stable error codes. Large collections use opaque cursor
pagination and deterministic `(updated_at, id)` or `(created_at, id)` ordering.
Frontend code consumes generated types rather than duplicating Knowledge API
shapes.

Read actions map through workspace permission actions to
`system:content:read`; create/update/ingest/delete actions map to
`system:content:manage`. Base workspace resolution and tenant binding occur
before entity lookup. Cross-workspace IDs return the same not-found result as
missing IDs.

### 6. Ingestion and Activation State Machine

```text
source pending
  → version pending
  → fetching
  → parsing
  → indexing
  → version ready
  → atomic active-version switch
  → source ready

fetching/parsing/indexing → failed
                         ↘ quarantined
ready → stale → refresh candidate → ready
any non-deleting source → disabled
```

Rules:

- source creation and ingestion are separate durable facts. A source is not
  marked ready because its Job was merely queued.
- each stage persists measured progress and safe failure detail on the Job and
  source-version state projection.
- the candidate becomes `active_version_id` only after parsing, security scan,
  chunk persistence, embedding/index persistence, and compatibility validation
  succeed.
- a failed refresh never activates its candidate and never rewrites the prior
  active version. If the prior version remains served, the source explicitly
  reports failed refresh plus `serving_freshness=stale`; retrieval citations
  carry `isStale=true`.
- disabled, deleting, quarantined, or never-ready sources are excluded from
  retrieval.
- reparse and reindex create new immutable versions because parser/chunker/
  embedding metadata is part of reproducibility.
- status transitions use compare-and-set state/version checks; duplicate Job
  delivery cannot regress or double-activate a version.

### 7. Background Job Contract

Complete target Job types:

- `knowledge.source.ingest.v1` on workload `connector` for fetch and parse;
- `knowledge.source.index.v1` on workload `agent-io` for chunk/embed/index;
- `knowledge.source.purge.v1` on workload `maintenance`.

The implemented v1 uses `knowledge.source.ingest` for both URL `initial` and
`refresh`; there is no separate refresh Job identity. Purge remains a future
gate and is not registered as an implemented workload.

An implementation may compose fetch/parse/index under one parent Job with
child Jobs, but public state remains one understandable ingestion operation.
Every Job uses a target descriptor containing workspace, base, source, candidate
version, and immutable input references. It contains no document bytes or
credentials.

Idempotency scope includes workspace, source, ingestion mode, source fingerprint,
parser/chunker/index versions, and requested version. Reusing the key with a
different Base/Source/manual-version input is `KNOWLEDGE_IDEMPOTENCY_CONFLICT`;
reusing a URL ingestion Job key with different validated input is
`BACKGROUND_JOB_IDEMPOTENCY_CONFLICT`.

Retry only declared transient network/provider/rate-limit failures. Invalid
input, denied private-network URL, unsupported MIME, parser incompatibility,
prompt-injection quarantine, revoked Connector, and schema validation failures
do not retry blindly. Enqueue failure remains in the dispatch outbox or surfaces
as explicit Job state; it never runs expensive ingestion inline.

#### 7.1 Implemented manual/URL ingest-to-index handoff

The implemented v1 chain is two durable Jobs:

```text
knowledge.source.ingest / version 1
  task: jobs:connector:knowledge-source-ingest:v1
  workload: connector
  phases: queued -> parsing -> chunking -> persisting

knowledge.source.index / version 1
  task: jobs:agent-io:knowledge-source-index:v1
  workload: agent-io
  phases: queued -> scanning -> embedding -> indexing -> activating
```

Both Jobs use workspace visibility, `actor_revalidated` authority, and current
`system:content:manage` permission. Ingest is cancellable only in `queued`,
`parsing`, and `chunking`; index is cancellable only in `queued`, `scanning`, and
`embedding`. Cancellation after provider indexing begins is not presented as a
safe interruption point.

The ingest handler does not report success after merely saving chunks. On the
same PostgreSQL transaction and tenant-routed connection, the coordinator
persists all parsed chunks, writes the candidate state's non-null `indexJobId`,
creates the index `BackgroundJob`, and creates its dispatch outbox. Only after
that transaction commits may dispatch publication be attempted. The ingest
result is therefore:

```json
{
  "status": "awaiting_index",
  "indexJobId": "<required public Job ID>"
}
```

A missing `indexJobId` is `KNOWLEDGE_INGESTION_OUTCOME_INVALID`; there is no
request-local index fallback. Tenant-control migration version `8` adds the
nullable operational `index_job_id` column to existing tenant schemas. It is
nullable for pre-handoff and migration states, but a successful ingest outcome
requires it.

For a manual source, the Job target binds the already-created immutable
`candidateVersionId`, and the input binds its normalized content hash. For a URL
source, `candidateVersionId` is null at enqueue time and the broker input carries
only normalized locator/revision and parser/chunker/index profile references.
The Connector worker then:

1. revalidates actor authority, workspace/source scope, normalized URL, locale,
   and locator revision;
2. fetches through the DNS-pinned public-network-only HTTP boundary;
3. validates and normalizes HTML, XHTML, Markdown, or plain text;
4. creates the immutable source version, operational state, and chunks only
   after real content hashes are known; and
5. atomically accepts the child index Job in the same fenced tenant transaction.

No source body or response-header map enters the broker payload. A failed fetch
before candidate creation projects only the source failure. A failed refresh
retains the prior active ready version and marks serving freshness stale. Equal
normalized content may produce a new immutable version because refresh/reparse
provenance and processing profiles are version identity; tenant-control
migration version `9` removes the obsolete normalized-content uniqueness
constraint while preserving version-number, Job, and idempotency uniqueness.

#### 7.2 Immutable embedding and vector-index profile

Every source version freezes its index profile when the candidate is created:

- embedding provider, model, and application profile version;
- vector dimensions;
- chunker name/version;
- index schema version.

The v1 deployment profile is intentionally concrete rather than a generic
vector-database abstraction:

```text
embedding provider: LiteLLM OpenAI-compatible POST /embeddings
vector index:        Meilisearch userProvided embeddings
index UID:           {KNOWLEDGE_INDEX__INDEX_PREFIX}_{workspaceId.hex}
```

LiteLLM receives the complete ordered chunk batch with `model`,
`encoding_format="float"`, and the immutable `dimensions`. Response indexes,
batch cardinality, vector dimensions, and finite numeric values are validated
before any index write.

Meilisearch uses one configured `userProvided` embedder and receives `_vectors`
with `regenerate=false`. The adapter waits for each asynchronous provider Task
to reach `succeeded` after index creation, settings update, and document write.
Task acceptance or a returned `taskUid` alone is never treated as index success.
The returned receipt must cover the exact ordered chunk ID set before activation.

Provider behavior follows the official LiteLLM embedding contract and
Meilisearch user-provided embedding contract:

- <https://docs.litellm.ai/docs/embedding/supported_embedding>
- <https://github.com/meilisearch/documentation/blob/main/capabilities/hybrid_search/how_to/search_with_user_provided_embeddings.mdx>
- <https://github.com/meilisearch/documentation/blob/main/capabilities/hybrid_search/overview.mdx>

Deployment settings:

```dotenv
KNOWLEDGE_INDEX__ENABLED=false
KNOWLEDGE_INDEX__EMBEDDING_PROVIDER=litellm
KNOWLEDGE_INDEX__EMBEDDING_MODEL=text-embedding-3-small
KNOWLEDGE_INDEX__EMBEDDING_VERSION=1
KNOWLEDGE_INDEX__VECTOR_DIMENSIONS=1536
KNOWLEDGE_INDEX__INDEX_BACKEND=meilisearch
KNOWLEDGE_INDEX__INDEX_PREFIX=arclayer_knowledge
KNOWLEDGE_INDEX__EMBEDDER_NAME=knowledge-default
KNOWLEDGE_INDEX__REQUEST_TIMEOUT_SECONDS=30
KNOWLEDGE_INDEX__TASK_POLL_INTERVAL_SECONDS=0.25
```

Indexing is disabled by default. Executing an index Job while it is disabled
fails explicitly with `KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID`; it does
not install an in-memory provider or fabricate ready state.

#### 7.3 Scan, retry, quarantine, and activation

The index handler scans every ordered chunk before embedding. Quarantine stores
only bounded typed evidence:

```json
{
  "chunkId": "<public chunk ID>",
  "rule": "<deterministic rule name>",
  "scannerName": "knowledge-rules",
  "scannerVersion": "1"
}
```

Matched text and excerpts are not copied into Job error metadata. A quarantined
candidate remains retrieval-ineligible, projects the source/version to
`quarantined`, and preserves any earlier active ready version pointer. The
source is not eligible for normal retrieval while its current source state is
quarantined.

The explicit v1 retryable set is:

```text
BACKGROUND_JOB_TENANT_NOT_READY
BACKGROUND_JOB_WORKER_LOST
KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE
KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE
KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE
```

The generic executor projects handler failure before it decides retry versus
dead letter. A transient first Attempt therefore leaves the version projection
in `failed`. A later Attempt may re-enter indexing only when the same
`indexJobId` is still bound and `safeErrorCode` belongs to the declared retryable
set. Permanent failure, quarantine, cancellation, a different Job, or a
superseded candidate cannot use this re-entry path.

Activation runs through the fenced domain-commit boundary and one tenant
transaction. It revalidates workspace/base/source/version scope, ingest and
index Job IDs, source candidate pointer, content hash, chunk count, immutable
embedding profile, index schema version, clean scan evidence, and the complete
Meilisearch receipt. It then disables retrieval on the previous active version's
chunks, writes the new chunk references/profile/scan state, marks the new chunks
eligible, marks the version ready, and atomically switches
`activeReadyVersionId`. A failed refresh never replaces the prior active
version.

### 8. Retrieval and Agent Context

`KnowledgeRetrievalService.retrieve()` receives an immutable request containing:

- authenticated actor/workspace/project context;
- exact allowed Knowledge Base IDs from the resolved Agent version/assignment;
- query text, locale, requested result count, and optional structured filters;
- Agent Run ID/correlation ID when called by a Tool;
- retrieval-policy version and token budget.

The service:

1. validates tenant, base, source, active version, project, role/member, Agent
   grant, and current workspace permission predicates.
2. searches only eligible ready/stale-active chunks from exact source versions.
3. applies metadata/ACL predicates before and after provider/vector retrieval.
4. returns ranked text/evidence with score diagnostics and exact citations.
5. records the selected source version IDs in the Agent Run context/provenance.

A citation contains base/source/version/chunk public IDs, display title, locale,
exact location, authorized URI when available, content hash, and stale/security
state. The UI may hide diagnostic IDs in normal presentation, but provenance
remains available in an explicit detail surface.

Agent Run creation pins the current eligible source version IDs and retrieval
policy version for reproducibility. Current ACL, membership, Connector state,
and workspace permission are still revalidated at retrieval time. Pinning is
not permission persistence.

Retrieved text is untrusted context and is separated from system/developer
instructions. Suspicious content is not silently scrubbed and executed. A
write-capable Tool fails closed when the selected evidence is quarantined or
violates prompt-injection policy.

### 9. Security, Privacy, and Resource Protection

- URL fetches use a DNS-pinned untrusted-ingest boundary: every request and
  redirect resolves and validates all returned addresses, rejects any mixed or
  private/loopback/link-local/reserved/cloud-metadata answer, and connects only
  to a validated IP while retaining the original hostname for TLS SNI. The
  transport ignores environment proxies and never performs a second hostname
  lookup for the connection. Connector fetches must reuse this boundary when
  their installation domain exists.
- URL fetch limits independently bound compressed transfer bytes and decoded
  bytes; redirects are bounded and revalidated per hop. MIME is cross-checked
  against content, only UTF-8/US-ASCII textual documents are accepted, and
  unsupported encoding or binary/mismatched content fails explicitly. Limits
  never truncate content and present it as complete.
- resource limits are named configuration/entitlement values justified by
  parser, storage, provider, and denial-of-service capacity tests. Hitting a
  limit returns an explicit stable error and retained Job failure; data is not
  truncated and presented as complete.
- Connector/source credentials are resolved server-side at Job execution and
  never persisted in locator JSON, events, chunks, citations, or broker
  messages.
- file sources reference Assets the actor can read. Asset deletion is blocked
  or impact-reported while an active source version depends on the bytes.
- structured-content sources read through canonical content services and pin
  content version IDs; they do not bypass draft/release/locale permissions.
- raw chunks and embeddings are not exposed through normal list APIs. A bounded
  diagnostics endpoint requires the same ACL plus a dedicated diagnostics
  action when introduced.
- retention and deletion preserve audit/provenance requirements while removing
  retrieval eligibility immediately.

### 10. Concurrency, Disable, and Delete

- mutable Base/Source metadata uses `expectedRevision`; stale writes fail with
  `KNOWLEDGE_REVISION_CONFLICT` and never merge silently.
- ingestion uses request idempotency plus a source state lock so one active
  attempt cannot create competing candidates. Equal content hashes are allowed
  across distinct immutable versions when Job provenance or processing profile
  differs.
- disabling a Base or Source immediately removes it from new retrieval while
  preserving historical Agent Run citations.
- delete first records `deleting`, blocks new ingestion/retrieval, computes
  Agent/automation/project references, and returns blockers or a purge Job.
- historical versions referenced by retained Runs, audit, ChangeSets, or
  releases remain tombstoned until their governing retention expires.
- purge deletes chunks/index entries before metadata and records a required
  audit event. Failure remains visible and retryable through the Job contract.

### 11. Stable Errors

| Condition | Required error |
| --- | --- |
| Base/source/version missing or belongs to another workspace | `KNOWLEDGE_NOT_FOUND` |
| Actor lacks read/manage permission or ACL | `PERMISSION_DENIED` without existence leakage |
| Mutable metadata revision is stale | `KNOWLEDGE_REVISION_CONFLICT` |
| Source kind/locator cannot be changed in place | `KNOWLEDGE_SOURCE_KIND_IMMUTABLE` |
| URL source feature is disabled for this deployment | `KNOWLEDGE_SOURCE_KIND_UNAVAILABLE` |
| URL violates untrusted-ingest policy | `KNOWLEDGE_SOURCE_URL_FORBIDDEN` |
| URL fetch policy/provider configuration is invalid | `KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID` |
| URL returns a permanent HTTP/protocol failure | `KNOWLEDGE_SOURCE_FETCH_FAILED` |
| URL timeout, rate limit, network failure, or retryable HTTP status | `KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE` |
| Compressed or decoded response exceeds the configured limit | `KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE` |
| Asset/Connector/content reference is invalid or inaccessible | `KNOWLEDGE_SOURCE_REFERENCE_INVALID` |
| MIME/parser/index schema is unsupported | `KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED` |
| Candidate is quarantined | `KNOWLEDGE_SOURCE_QUARANTINED` |
| Ingestion already active with conflicting fingerprint | `KNOWLEDGE_INGESTION_CONFLICT` |
| Base/source/manual-version idempotency key is reused with different input | `KNOWLEDGE_IDEMPOTENCY_CONFLICT` |
| URL ingestion Job key is reused with different input | `BACKGROUND_JOB_IDEMPOTENCY_CONFLICT` |
| Retrieval has no eligible source version | `KNOWLEDGE_RETRIEVAL_NO_ELIGIBLE_SOURCE` |
| Delete has retained references | `KNOWLEDGE_DELETE_BLOCKED` with sanitized impact metadata |

The implemented index v1 terminal surface additionally uses:

| Condition | Required error |
| --- | --- |
| Index cancellation before activation | `KNOWLEDGE_INDEX_CANCELLED` in the source-version projection |
| Prompt-injection rule matched | `KNOWLEDGE_INDEX_CONTENT_QUARANTINED` with bounded typed metadata |
| Embedding response shape/count/dimensions are invalid | `KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID` |
| LiteLLM is temporarily unavailable | `KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE` |
| Stored marker/receipt conflicts with the immutable Job | `KNOWLEDGE_INDEX_OUTCOME_INVALID` |
| PostgreSQL persistence is explicitly transient | `KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE` |
| Provider configuration or permanent task request is invalid | `KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID` |
| Meilisearch is temporarily unavailable or returns an internal task failure | `KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE` |
| Candidate is superseded or immutable metadata changed | `KNOWLEDGE_INDEX_SOURCE_STALE` |
| Tenant target no longer exists | `KNOWLEDGE_INDEX_TARGET_NOT_FOUND` |

Messages use backend i18n keys; frontend control flow branches on error code,
never localized text.

### 12. Migration and Hard Cut

1. add source models and generated public migrations, then add the new tables to
   the tenant-control migration path for every existing workspace.
2. verify tenant readiness and table/index/constraint parity before enabling
   Knowledge APIs for a workspace.
3. register permission actions, Job types, domain events, schemas, routes, and
   generated clients.
4. enable manual sources first; enable URL ingestion only when the DNS-pinned
   fetch boundary and durable index profile are configured. Connector ingestion
   remains gated until a canonical Connector installation/secret authority
   exists.
5. enable retrieval Tools only after ACL, citation, prompt-injection, and Agent
   Run pinning tests pass.
6. do not create compatibility keys in `SettingRecord` and do not interpret old
   prompt/Skill text as migrated Knowledge.

Generated migrations and OpenAPI artifacts are produced through repository
commands and are never hand-edited.

### 13. Tests and Acceptance Gates

Required tests:

- model/repository tests for tenant binding, uniqueness, immutable versions,
  connection propagation, cursor pagination, and deterministic ordering.
- service tests for revisions, idempotency fingerprints, activation compare-and-
  set, disable/delete, required events, and retained-reference impact.
- route tests for typed envelopes, `PublicUUID`, auth/CSRF, permissions,
  cross-workspace not-found behavior, filters, pagination, and stable errors.
- Job integration tests with real tenant context for fetch/parse/index stages,
  transient retry, permanent failure, worker redelivery, cancellation, and
  outbox dispatch failure.
- security tests for DNS rebinding/redirect SSRF, private addresses, MIME
  mismatch, archive traversal/symlink escape, decompression/resource limits,
  secret redaction, and prompt-injection quarantine.
- retrieval tests for ACL changes after indexing, project/Agent grant
  intersection, stale citations, locale/filter behavior, deterministic
  version pinning, and no cross-tenant chunks.
- Agent integration tests proving citations carry exact versions and a revoked
  permission cannot be restored by an old Run snapshot.
- migration tests applying tenant-control changes to both new and existing
  workspace schemas and refusing API enablement for failed tenants.
- OpenAPI generation plus Admin typecheck for all public request/response
  shapes.

Acceptance requires real PostgreSQL tenant integration and the real durable Job
path. In-memory repositories, browser-local documents, or a deterministic test
embedder alone do not prove production ingestion/retrieval readiness.
