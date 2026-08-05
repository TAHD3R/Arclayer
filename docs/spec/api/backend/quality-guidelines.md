# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend quality is enforced through explicit architecture boundaries, Pydantic v2 contracts, canonical service/repository foundations, visible failures, and targeted tests.

During a small backend change, run the nearest relevant static check and
focused test through `pnpm -C apps/api uv -- pytest ...`; do not run
`pnpm api:check` after every edit. Run `pnpm api:check` at a coherent backend
milestone or before handoff. Run `pnpm check` only for cross-app integration or
final delivery when its repository-wide scope is justified.

For a focused backend test, start with a 60-second diagnostic budget rather
than a hard timeout contract. Extend integration, database, or inherently slow
tests so their real pass/fail result is exposed.

---

## Forbidden Patterns

### Scenario: Production Dataclass Ban

#### 1. Scope / Trigger

- Trigger: adding or changing structured data objects under `apps/api/src/**`.
- Example: query plans, lifecycle events, tenant contexts, plugin runtime specs, GraphQL planner values, and content runtime boundary objects.

#### 2. Signatures

- Immutable production value object:
  - `class QueryPage(BaseModel):`
  - `model_config = ConfigDict(frozen=True)`
- Field factory:
  - `items: list[str] = Field(default_factory=list)`
- Serialization:
  - `payload = value.model_dump(mode="json")`
- Validation:
  - `value = QueryPage.model_validate(raw_payload)`

#### 3. Contracts

- Production backend code under `apps/api/src/**` must not import or use `dataclasses`.
- Structured production data uses Pydantic v2 `BaseModel` or an existing project schema base.
- Immutable internal value objects use `ConfigDict(frozen=True)`.
- Mutable runtime collaborator containers use explicit plain classes with typed attributes and methods, not dataclasses.
- Behavior-only shapes use `Protocol`; closed values use `Enum` or `Literal`; one-step local argument bundles use explicit typed parameters.
- Code-review-engine rule `backend.no-production-dataclass` enforces this boundary.
- Tests under `apps/api/tests/**` may use local fixtures according to test policy, but production fixtures must not hide dataclass usage under `apps/api/src/**`.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| `from dataclasses import ...` under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| `import dataclasses` under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| `@dataclass` or aliased dataclass decorator under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| `dataclasses.dataclass(...)` or aliased factory call under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| Production file cannot be parsed during the rule check | The rule reports a BLOCKER instead of silently skipping verification |

#### 5. Good/Base/Bad Cases

- Good: a frozen Pydantic value object models an immutable query or lifecycle payload.
- Good: a runtime boundary with mutable collaborators is an explicit class with a real constructor and typed attributes.
- Base: a router or service method accepts separate typed parameters when the old object had no independent domain meaning.
- Bad: a production module keeps `@dataclass(frozen=True)` for a pure computation value object.
- Bad: a production module catches parser/read failures in the rule and returns no finding.

#### 6. Tests Required

- Rule fixture for production dataclass import/decorator violations.
- Rule fixture proving `apps/api/tests/**` fixtures are outside the production ban.
- Rule fixture for aliased imports or factory calls when those paths change.
- Focused backend tests for migrated value objects where constructor, equality, serialization, or immutability semantics changed.

#### 7. Wrong vs Correct

Wrong:

```python
from dataclasses import dataclass, field


@dataclass(frozen=True)
class QueryPage:
    limit: int
    includes: list[str] = field(default_factory=list)
```

Correct:

```python
from pydantic import BaseModel, ConfigDict, Field


class QueryPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    limit: int
    includes: list[str] = Field(default_factory=list)
```

---

## Required Patterns

### Scenario: Canonical Service Contract

#### 1. Scope / Trigger

- Trigger: creating or changing a backend service class that orchestrates business behavior, reads settings, talks to repositories, opens transactions, or publishes domain events.
- Example: `WorkspaceTeamService` emits Activity events and must use the same actor/source/publisher path as auth and upload services.

#### 2. Signatures

- Base class: `class ExampleService(BaseService):`
- Base import: `from src.core.services import BaseService, DomainEventPublisher`
- Constructor: `def __init__(self, settings: Settings, *, repo: ExampleRepository | None = None, event_publisher: DomainEventPublisher | None = events) -> None`
- Transaction: `async with self.tx() as conn:`
- Required event: `await self.publish_domain_event(name=..., payload=..., actor_user_id=..., source=...)`
- Optional event: `await self.publish_optional_domain_event(name=..., payload=..., actor_user_id=..., source=...)`
- Actor/context: `self.resolve_actor_context(...)`

#### 3. Contracts

- Production services with orchestration behavior extend `BaseService` from `src.core.services`.
- Constructor dependencies are injected at the constructor or factory boundary.
- Multi-step writes use `self.tx()` only when the called repository/entity-manager methods receive the yielded connection or an equivalent bound dependency.
- Service-level events go through the BaseService publisher helpers.
- Required event publication failures surface as typed service-contract errors.
- Optional observability fanout is explicit through `publish_optional_domain_event()`.
- JSON-shaped payload/config/meta/patch contracts use `JsonObject` / `JsonValue` (or a narrower alias) rather than broad `dict[str, object]`.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Required event publisher is missing | Raise `RequiredEventPublisherMissing` |
| Required event publish fails | Raise `RequiredDomainEventPublishFailed` |
| Optional event publisher is missing | Return the built event and log skipped publication |
| Optional event publish fails | Return the built event and log publish failure |
| Transaction receives existing `conn` | Yield the same connection without opening another transaction |

#### 5. Good/Base/Bad Cases

- Good: a service constructor receives `repo` and `event_publisher`, calls `super().__init__(settings, event_publisher=event_publisher)`, and publishes through `publish_domain_event()`.
- Base: a pure mixin attached to a `BaseService` subclass calls `cast(BaseService, self).publish_optional_domain_event(...)`.
- Bad: a service method imports `events`, builds `Event(...)`, and calls `events.publish(...)` directly.
- Bad: `patch: dict[str, object]` for JSON contracts where `JsonObject` is the real boundary type.

#### 6. Tests Required

- Unit tests for BaseService transaction reuse, required/optional publisher behavior, event envelope, and explicit actor/context overrides.
- Rule fixtures for direct event publish and BaseService inheritance in `scripts/code-review-engine/tests/test_rules.py`.
- Representative service tests when a domain service changes transaction or Activity behavior.

#### 7. Wrong vs Correct

Wrong:

```python
await events.publish(Event(name="workspace.member.invited", payload=payload))
```

Correct:

```python
await self.publish_domain_event(
    name="workspace.member.invited",
    payload=payload,
    actor_user_id=actor_user_id,
    source="api",
)
```

### Scenario: Explicit ORM Lifecycle Ownership

#### 1. Scope / Trigger

- Trigger: a process root, ASGI lifespan, worker, scheduler, test harness, or
  nested runtime initializes or closes the shared Tortoise ORM.
- Example: Taskiq runs worker startup and shutdown hooks in different asyncio
  Tasks while another nested runtime may hold the same database configuration.

#### 2. Signatures

- Initialize one owner: `await init_orm(settings)`
- Release one owner: `await close_orm()`
- Readiness after initialization: `await verify_db_ready(settings)`

#### 3. Contracts

- Every successful enabled `init_orm()` call owns exactly one matching
  `close_orm()` call; nested ownership is explicit reference counting, not an
  `if Tortoise._inited: return` shortcut.
- Nested initialization may reuse only the exact same Tortoise configuration.
  A different configuration fails without replacing the active runtime.
- Tortoise's initializer-local ContextVar is exited in the asyncio Context that
  created it. Cross-Task access uses only the library-supported global fallback,
  so a shutdown Task never resets another Task's token.
- Only the final owner closes the ORM. It resets model app metadata while the
  global fallback is still available, then closes connections and clears
  lifecycle state.
- A close with no owned initialization is a no-op only when Tortoise is also
  uninitialized. Foreign initialization, missing active context, mismatched
  configuration, and shutdown failures surface explicitly.
- Lifecycle callers use `try/finally` where startup can succeed before later
  process initialization fails. No caller swallows close errors as warnings.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Startup and shutdown run in different asyncio Tasks | Final close succeeds without a ContextVar token-reset error |
| Same configuration initializes twice | Keep one ORM runtime and two owners until two closes complete |
| Nested initialization uses a different configuration | Raise `RuntimeError`; preserve the active runtime and owner count |
| One of multiple owners closes | Decrement ownership; keep apps and connections initialized |
| Final owner closes | Reset apps before closing connections, then clear lifecycle state |
| Tortoise is initialized with no wrapper owner | Raise `RuntimeError`; do not claim or close foreign lifecycle state |
| Final reset/connection close fails | Propagate the failure; never log-and-continue as successful shutdown |

#### 5. Good/Base/Bad Cases

- Good: a worker startup hook calls `init_orm()` and its shutdown hook releases
  the same ownership with `close_orm()`, even when Taskiq schedules the hooks in
  different Tasks.
- Base: a nested same-process runtime acquires the identical configuration and
  releases its own reference without closing the outer runtime.
- Bad: a second caller sees `Tortoise._inited`, returns without ownership, and
  later closes connections still owned by the first caller.
- Bad: shutdown catches a cross-Task token error and reports successful worker
  termination while model metadata or connections remain active.

#### 6. Tests Required

- Unit test that initializes in one asyncio Task and closes in another.
- Nested same-configuration test proving the ORM remains active until the last
  close.
- Different-configuration test proving the active runtime is preserved.
- Real Tortoise integration coverage after lifecycle ordering changes.

#### 7. Wrong vs Correct

Wrong:

```python
if Tortoise._inited:
    return
await Tortoise.init(config=config)
```

Correct:

```python
await init_orm(settings)
try:
    await verify_db_ready(settings)
    await run_process_root()
finally:
    await close_orm()
```

### Scenario: Canonical Tenant Resolution for Background Jobs

#### 1. Scope / Trigger

- Trigger: creating or executing a durable Job that reads or writes
  tenant-owned data.
- Example: project asset upload completion transactionally creates
  `asset.thumbnail.generate` plus its dispatch outbox, then the worker resolves
  the current workspace tenant before reading the Asset.

#### 2. Signatures

- Durable target: `PublicJobTargetDescriptor`
- Canonical registry lookup:
  `WorkspaceTenantRegistryService.get_by_workspace_id(workspace_id)`
- Worker-local context: `ResolvedTenantJobTarget.tenant_context.with_scope(TenantScope.JOB)`

#### 3. Contracts

- Durable Job/outbox/Taskiq envelopes carry only validated public target IDs,
  source revisions, and typed input references.
- Envelopes never carry `schemaName`, connection aliases, isolation mode,
  storage credentials, or a caller-selected physical queue.
- Workers load the Job, verify its envelope, resolve the current Project and
  Workspace relationship, then load the current tenant registry record and
  readiness before constructing a Job-scoped `TenantContext`.
- A missing, stale, failed, or mismatched tenant target is an explicit Job
  failure. It never authorizes default/public-database access to tenant-owned
  rows.
- Request-scoped `ContextVar` state is not a cross-process authority source.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Project Job target contains matching workspace/project public IDs | Worker resolves the current tenant registry and binds `TenantScope.JOB` |
| Target project no longer belongs to the workspace | Permanent target mismatch; execute no tenant side effect |
| Tenant registry is absent, failed, or not ready | Explicit tenant-resolution failure; never use the default/public DB |
| Envelope contains schema/isolation/queue routing fields | Schema validation rejects the envelope |

#### 5. Good/Base/Bad Cases

- Good: `UploadsService.complete()` writes the Asset, required Activity evidence,
  Background Job, and dispatch outbox in one transaction using public target
  IDs only.
- Base: a worker resolves the current workspace tenant registry, constructs a
  Job-scoped context, and then opens the tenant connection.
- Bad: a worker restores `schemaName` from a serialized payload or falls back
  to an ambient/default connection when target resolution fails.

#### 6. Tests Required

- Contract tests that reject schema, isolation, credential, filesystem, and
  queue fields in a dispatch envelope.
- Worker integration tests for current tenant resolution, workspace/project
  mismatch, tenant-not-ready failure, and absence of default/public fallback.

#### 7. Wrong vs Correct

Wrong:

```python
tenant_context = current_tenant_context_or_none()
tenant_context = TenantJobContextPayload.model_validate(payload["tenant"]).to_context()
tenant_db = TenantDatabaseRouter(tenant_context)
```

Correct:

```python
job = await jobs.require_for_dispatch(envelope.job_id)
target = await target_resolver.resolve_and_validate(job.target_descriptor)
tenant_db = TenantDatabaseRouter(target.tenant_context.with_scope(TenantScope.JOB))
```

### Scenario: Durable External-Effect Reconciliation

#### 1. Scope / Trigger

- Trigger: a retryable durable Job may create provider objects or another
  external effect before its owning-domain success marker commits.
- Example: `asset.thumbnail.generate` writes Job-owned thumbnail objects and
  then commits `AssetRecord.meta.thumbnail_generation` in a tenant schema.

#### 2. Signatures

- Canonical route binding:
  `ProviderEffectService.materialize_storage_profile_route(profile_key=...)`
- Canonical registration:
  `ProviderEffectService.register_effect(lease=..., registration=...)`
- Canonical recovery/settlement:
  `ProviderEffectService.list_effects(...)` and
  `ProviderEffectService.settle_effects(...)`
- Exact historical cleanup route:
  `ProviderEffectService.resolve_effect_route(effect_id=...)`
- Thumbnail domain adapter:
  `AssetThumbnailProviderEffectCoordinator` and
  `ExactAssetThumbnailProviderStorageResolver`
- Owning-domain linearization:
  `JobExecutionContext.run_fenced_domain_commit(operation)`

#### 3. Contracts

- Every adopting domain persists a strict, versioned `ProviderEffectRecord`
  before its first provider write. The row is Attempt-owned, the manifest is
  exact-replay-idempotent, and both are immutable after registration.
- Thumbnail production composition registers
  `asset.thumbnail.objects` / schema `1` with logical key
  `generated-objects`. Its strict manifest binds canonical Job, Project, Asset,
  request/source/profile context, target bucket, and the complete ordered set
  of exact Job-owned outputs.
- Record exact effect identifiers and enough non-secret route identity to
  delete them after process loss. Bind the Effect to an immutable non-secret
  Route Revision and retain current credentials separately. Never persist
  credentials, provider payloads, logs, signed URLs, or URL
  userinfo/query/fragment data.
- A recovery Attempt lists and validates ACTIVE, COMMITTED, and CLEANED rows
  under its current fence. Corrupt, unknown-contract, cross-Job, cross-source,
  or non-canonical evidence fails closed; recovery never guesses object names
  or reconstructs effects by rerunning business work.
- Reconcile the owning-domain marker before cleanup. A matching marker must
  agree with live Effect evidence and forbids cleanup; settle matching ACTIVE
  evidence COMMITTED. Without a matching marker, preflight every ACTIVE exact
  historical route before the first delete, reject COMMITTED evidence, and
  settle exact idempotent cleanup CLEANED.
- Thumbnail `outputIdentity` binds the logical output set to the exact Profile,
  Route Revision, and target bucket while excluding Effect-row identity,
  Attempt identity, mutable Profile keys, credentials/secrets, and timestamps.
  Deterministic COMMITTED/CLEANED references contain only kind, Effect ID,
  manifest hash, and output identity.
- The canonical domain commit holds public `Job -> Attempt` locks while its
  callback runs. Commit-first makes the marker durable before replacement can
  proceed; generation-first prevents the stale callback from running.
- The tenant marker and public Effect settlement are two transactions.
  Marker-committed/settlement-failed replay settles COMMITTED without another
  render, write, or delete; cleanup-completed/settlement-failed replay treats
  object-not-found as success before settling CLEANED.
- `JobAttemptRecord.provider_references` is an inert retained ORM/database
  column. Production runtime has no reader or writer and no dual-read or
  dual-write path. Deployments must quiesce and drain old thumbnail workers;
  mixed old/new worker fleets are unsupported.
- A manifest proves what may need cleanup; it does not schedule final orphan
  cleanup. The implemented scheduled control task owns bounded `SKIP LOCKED`
  fan-out only; the resulting durable maintenance Job owns the real fenced
  Attempt, marker-first provider mutation, and exact settlement. Concurrent
  scanner and seeded terminal-orphan Taskiq evidence are required. Local-storage
  process-loss evidence additionally starts two production worker generations,
  kills each process group after ACTIVE registration and real object writes,
  verifies pending recovery and lease expiry, exhausts retry to dead-letter,
  and requires the bounded maintenance Job to settle exact cleanup CLEANED.
  This does not substitute for S3 or Valkey-outage evidence.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Exact Effect registration replay on the same Attempt | Return the canonical row idempotently |
| Different manifest/profile/revision replaces an existing Effect identity | Raise an invariant error |
| Unknown effect type/version or invalid domain contract | Fail before provider mutation |
| Profile route changes or tombstone wins before registration | Reject stale registration before provider mutation |
| Thumbnail registration returns COMMITTED or CLEANED replay | Fail before the first provider `put`; never reactivate it |
| Matching canonical marker exists | Validate all Effect evidence, settle ACTIVE rows COMMITTED, and never resolve cleanup or delete |
| Marker is absent and ACTIVE rows validate | Preflight every exact historical route, delete only exact recorded effects, treat missing objects as idempotent success, and settle CLEANED |
| Marker is absent but a COMMITTED row exists | Fail closed; never delete committed outputs |
| Exact COMMITTED/CLEANED settlement replay | Accept without changing original settling Attempt |
| Manifest, terminal reference, output identity, or route is invalid | Fail closed before any delete |
| Reaper/replacement wins public lock | Reject stale lease and never invoke its domain callback |
| Domain callback wins public lock | Persist marker before contenders can replace the Attempt |

#### 5. Good/Base/Bad Cases

- Good: an adopting pipeline registers all planned Job-owned object keys and
  exact Route Revision before the first `put`, then a later Attempt deletes
  those exact keys after finding no matching marker and settles CLEANED.
- Base: provider credential rotation loads current credentials for the Effect's
  recorded Profile identity while cleanup uses its exact historical Route
  Revision.
- Bad: cancellation guesses width/extension candidates, queries a mutable or
  hard-deleted Asset for cleanup routing, or deletes objects after a matching
  marker is already durable.

#### 6. Tests Required

- Unit tests for exact registration/settlement replay, thumbnail v1 identity,
  manifest schema and secret exclusion, stable Attempt/Effect-row-independent
  output identity, deterministic terminal references, record-before-write,
  all-disposition marker-first reconciliation, partial upload/response loss,
  idempotent partial delete, hard-deleted target, and repeated cancellation.
- Real PostgreSQL two-backend tests for both domain-commit/replacement lock
  orders and registration/tombstone/update orders, including the actual tenant
  marker and a real local provider object.
- Process-kill plus retry-exhaustion evidence for every enabled provider class;
  local storage is proven by the two-generation OS `SIGKILL` acceptance, while
  S3 remains open. Coroutine cancellation alone is insufficient.

#### 7. Wrong vs Correct

Wrong:

```python
await provider.put_object_bytes(object_key=guessed_key, data=data)
uploaded_keys.append(guessed_key)  # process-local evidence, persisted too late
```

Correct:

```python
route = await effects.materialize_storage_profile_route(profile_key=profile_key)
effect, _control = await effects.register_effect(
    lease=context.lease,
    registration=ProviderEffectRegistration(
        route=route,
        effect_type=EFFECT_TYPE,
        effect_key=logical_effect_key,
        schema_version=1,
        manifest=exact_manifest,
    ),
)
await provider.put_object_bytes(object_key=exact_key, data=data)
marker = await context.run_fenced_domain_commit(commit_tenant_marker)
await effects.settle_effects(
    lease=context.lease,
    settlement=ProviderEffectSettlement(
        effect_ids=(effect.id,),
        disposition=ProviderEffectDisposition.COMMITTED,
        settlement_reference=canonical_committed_reference,
    ),
)
```

### Scenario: JSON Contract Typing

#### 1. Scope / Trigger

- Trigger: service/router/helper code that reads, merges, emits, or validates JSON-shaped payload/config/meta/patch values.
- Example: settings merge patches, audit event payloads, publish metadata manifests, mail provider config maps.

#### 2. Signatures

- JSON payload: `payload: JsonObject`
- JSON value: `value: JsonValue`
- Narrow alias: `type AuditPatch = dict[str, JsonValue | None]`

#### 3. Contracts

- Prefer `JsonObject` / `JsonValue` for JSON boundaries that cross service, storage, or event contracts.
- Use narrower `Literal`/typed aliases when the field set is constrained (for example model diff kind/stage).
- Avoid broad `dict[str, object]` on JSON pathways because it weakens type safety and causes `invalid-argument-type` drift.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| JSON map passed to event payload | Type as `JsonObject` (or narrower alias) |
| Enum-like string sent to typed schema field | Convert to explicit `Literal`/alias type, not `JsonValue` cast |
| Merge patch function input | Accept `JsonObject` for both current and patch |

#### 5. Wrong vs Correct

Wrong:

```python
def patch_namespace(*, patch: dict[str, object]) -> None: ...
```

Correct:

```python
def patch_namespace(*, patch: JsonObject) -> None: ...
```

### Scenario: Full-flow Activity Audit Coverage

#### 1. Scope / Trigger

- Trigger: adding, editing, or reviewing a backend mutation that must appear in user-visible Activity audit logs.
- Covered domains include auth, organization, workspace, project, content, release, asset, system, permission, and deployment mutations.
- Use this scenario whenever code emits an event with one of those event-family prefixes or calls a helper such as `_publish_activity_event`.

#### 2. Signatures

- Required event publisher for service orchestration:
  - `await self.publish_domain_event(name=..., payload=..., actor_context=..., source=...)`
- Required direct audit write for simple same-database cases:
  - `await write_required_activity_event(settings=self.settings, payload=ActivityAuditPayload(...), conn=conn)`
- Forbidden compliance-only publisher:
  - `await self.publish_optional_domain_event(name="workspace.member.invited", ...)`
  - `await self._publish_activity_event(name="workspace.invite.email.created", ...)` when the helper is best-effort
- Enforcement rule:
  - `service.no-optional-activity-publish`

#### 3. Contracts

- Compliance-critical Activity evidence must be required, durable, typed, and user-readable.
- The payload must be a typed Pydantic v2 model or a narrower JSON contract with explicit actor/context/entity fields.
- Actor/context data comes from `BaseService.resolve_actor_context()` or an explicit typed context passed into the service.
- Persistence must happen in the same business transaction or through an outbox row written in that same transaction.
- Same-transaction direct `AuditEvent` writes are allowed for simple cases only when the service is already inside `async with self.tx() as conn` and the audit helper receives that same `conn`.
- Direct audit writes must not be scheduled through `BackgroundTasks` or any post-response callback when the event is compliance-critical; failures must remain visible to the request or worker that owns the business mutation.
- `ActivityIngestor` queue delivery is acceptable for non-critical telemetry only; its bounded in-memory queue and drop-on-overload behavior are not sufficient for compliance-critical audit evidence.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Required audit publisher is missing | Raise a service-contract error or fail the outbox write visibly |
| Required audit publish/write fails | Business mutation fails or the outbox records a visible failure state |
| Business transaction rolls back | No committed `AuditEvent` or audit outbox evidence remains |
| Direct required audit write omits `conn` while the business mutation uses a transaction | Test fails until the audit write shares the business transaction |
| Payload contains password/token/secret/credential/raw API key material | Sanitization test fails until the persisted properties omit it |
| Service uses `publish_optional_domain_event()` for an Activity family event | `service.no-optional-activity-publish` reports a blocker |
| Service/mixin uses best-effort `_publish_activity_event()` for an Activity family event | `service.no-optional-activity-publish` reports a blocker |

#### 5. Good/Base/Bad Cases

- Good: a service writes business data and an audit outbox row inside `async with self.tx() as conn`, then a test reads the Activity record back.
- Good: a simple upload completion writes the asset and `ActivityAuditPayload(event_name="asset.uploaded", ...)` inside the same `self.tx()` connection and passes `conn` into `write_required_activity_event(...)`.
- Base: a non-critical notification or telemetry event uses `publish_optional_domain_event()` with a non-Activity event family such as `notification.delivered`.
- Bad: an auth, workspace, asset, system, or content mutation publishes Activity through `publish_optional_domain_event()` and swallows non-fatal failures.
- Bad: a service enqueues a required Activity write in `BackgroundTasks`, because the request may succeed before the audit evidence is durably committed.

#### 6. Tests Required

- Unit tests for payload validation and sanitization boundaries.
- Integration readback tests that execute the real mutation and query Activity records.
- Rollback tests for multi-write operations proving failed business changes do not commit Activity evidence.
- Code-review-engine fixtures for direct optional Activity events, helper-based Activity events, mixin helper calls, and Activity constants.

#### 7. Wrong vs Correct

Wrong:

```python
await self.publish_optional_domain_event(
    name="workspace.member.invited",
    payload={"workspace_id": str(workspace_id)},
    actor_user_id=actor_user_id,
)
```

Correct:

```python
async with self.tx() as conn:
    await self.repo.create_invite(..., conn=conn)
    await self.audit_repo.create_outbox_event(
        payload=WorkspaceMemberInvitedAuditPayload(...).model_dump(mode="json"),
        conn=conn,
    )
```

Also correct for simple direct `AuditEvent` writes:

```python
async with self.tx() as conn:
    asset_id = await self._complete_local(session=session, scope=scope, conn=conn)
    await write_required_activity_event(
        settings=self.settings,
        payload=ActivityAuditPayload(
            event_name="asset.uploaded",
            actor_user_id=session.actor_user_id,
            entity_type="asset",
            entity_id=asset_id,
            source="core",
            properties=payload,
        ),
        conn=conn,
    )
```

---

## Testing Requirements

- Router changes require success and failure-path tests for status code, response envelope, and stable error code.
- Service changes require unit or integration coverage for orchestration, permission checks, event publication, transaction behavior, and rollback behavior when relevant.
- Repository changes require focused coverage for query semantics, tenant binding, and explicit connection propagation.
- Schema changes require validation tests for good, base, and bad payloads.
- Cross-layer contract changes require generated OpenAPI/type usage checks and frontend consumer review.
- Compliance-critical Activity changes require readback tests that prove Activity evidence is durably written.
- Code-review-engine rule changes require fixtures for good and bad examples.
- ORM lifecycle changes require cross-Task close, exact nested ownership, and
  final-close ordering tests.

---

## Code Review Checklist

- [ ] Router code stays thin and does not call repositories directly.
- [ ] Services extend `BaseService` when they orchestrate business behavior, transactions, settings, persistence, or domain events.
- [ ] Repositories use `TortoiseORMRepository` or a documented tenant-aware repository base.
- [ ] JSON boundaries use `JsonObject` / `JsonValue` or a narrower typed alias.
- [ ] Production code under `apps/api/src/**` does not use dataclasses.
- [ ] Required Activity events are durable and typed, not optional fanout.
- [ ] Errors surface through typed `APIError` subclasses or documented framework boundaries.
- [ ] Tests assert stable error codes and contract fields, not only status codes.
- [ ] New rules avoid silent fallback paths and expose root failures clearly.
- [ ] Every enabled ORM initialization has one matching owner release; nested
  configuration and final-close ordering are explicit.
