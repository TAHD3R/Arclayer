# Durable Background Job Contracts

**Status:** Approved Wave 0 implementation contract.
**Canonical target:** `docs/spec/shared/ai-website-builder-platform.md`, section 10.

This code-spec defines the backend persistence, dispatch, execution, tenancy,
API, failure, and deployment contracts for durable background work. Taskiq is
the transport and worker framework; application Job records are the durable
authority.

## Scenario: Durable, Tenant-Safe, At-Least-Once Background Work

### 1. Scope / Trigger

- Trigger: adding or changing a user-visible, business-critical, scheduled,
  retryable, or resource-intensive background operation.
- Applies to:
  - `apps/api/src/models/jobs/**`
  - `apps/api/src/modules/jobs/**`
  - `apps/api/src/platform/jobs/**`
  - Taskiq broker, worker, scheduler, and deployment configuration
  - domain services that create, cancel, resume, retry, or consume Jobs
  - Admin APIs and generated clients that expose Job state.
- Required workload classes:
  - `agent-io`
  - `render-browser`
  - `asset-cpu`
  - `publish`
  - `connector`
  - `maintenance`.

This contract governs Agent continuations, Builder generation, content bulk
work, preview/build/publish, screenshots and site thumbnails, asset processing,
Knowledge and Skill ingestion, Connector events, scheduled release execution,
usage/reconciliation, and retention work.

This contract does not make Taskiq result storage authoritative, does not put
tenant content in broker messages, and does not authorize a physical queue
topology outside the accepted ADR and its remaining deployment gates.

### 2. Verified Baseline and Hard-Cut Target

The pre-Wave 0 baseline had one `RedisStreamBroker`, one `queue_name`, one
worker script, and one scheduler bound to `LabelScheduleSource`. Tasks were
registered in one module. `try_enqueue_task()` caught enqueue errors and
returned `False`, while `try_dedupe_enqueue()` treated unavailable dedupe as
permission to continue. The scheduled-publish scanner loaded all due rows and
executed them serially in the scanner process.

That behavior is transitional and is not a compatibility contract. The target
hard cut:

- replaces best-effort enqueue with `BackgroundJob` plus transactional
  `JobDispatchOutbox`;
- replaces cache-lock enqueue dedupe with database idempotency;
- replaces inline scheduled execution with bounded claim and fan-out;
- makes workload ownership, worker processes, scheduler leadership, and health
  checks deployed product infrastructure;
- retains Taskiq transport redelivery as at-least-once and makes every domain
  effect idempotent;
- removes the old generic fallback helpers after all callers migrate.

No request path may silently execute expensive work inline when the background
system is disabled or unavailable.

### 3. Module and Dependency Boundaries

Target module shape:

```text
apps/api/src/models/jobs/
  background_job.py
  job_attempt.py
  dispatch_outbox.py

apps/api/src/modules/jobs/
  router.py
  schema.py
  repository.py
  service.py
  registry.py
  retry.py

apps/api/src/platform/jobs/
  brokers/
  dispatcher.py
  executor.py
  scheduler.py
  tasks/
```

Contracts:

- Routers call `BackgroundJobService`; services call injected repositories;
  repositories own ORM/query mechanics.
- Job orchestration services extend `BaseService` and use `BaseService.tx()`.
- ORM repositories extend `TortoiseORMRepository`.
- Domain handlers are injected through `JobTypeRegistry`; the executor does not
  import every domain service through an `if job_type == ...` chain.
- Job persistence, dispatch, and attempt records live in the public control
  plane. Tenant domain results remain in their canonical tenant schema.
- Public Job records reference tenant entities by validated descriptors, never
  by cross-schema foreign keys.
- Required audit/business events use the canonical required domain-event path;
  optional metrics are not a substitute for durable state.
- Structured production values use Pydantic v2 models. Production dataclasses
  are forbidden.

### 4. Signatures and Entities

#### 4.1 Stable value contracts

```python
class JobWorkloadClass(StrEnum):
    AGENT_IO = "agent-io"
    RENDER_BROWSER = "render-browser"
    ASSET_CPU = "asset-cpu"
    PUBLISH = "publish"
    CONNECTOR = "connector"
    MAINTENANCE = "maintenance"


class JobInternalStatus(StrEnum):
    PENDING_DISPATCH = "pending_dispatch"
    QUEUED = "queued"
    RUNNING = "running"
    RETRY_SCHEDULED = "retry_scheduled"
    WAITING_FOR_USER = "waiting_for_user"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTERED = "dead_lettered"
    CANCELLED = "cancelled"


class JobPublicStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_USER = "waiting_for_user"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobAttemptStatus(StrEnum):
    CLAIMED = "claimed"
    RUNNING = "running"
    INTERRUPTED = "interrupted"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    LEASE_EXPIRED = "lease_expired"
    CANCELLED = "cancelled"


class JobDispatchStatus(StrEnum):
    PENDING = "pending"
    DISPATCHING = "dispatching"
    DISPATCHED = "dispatched"
    RETRY_SCHEDULED = "retry_scheduled"
    DEAD_LETTERED = "dead_lettered"
```

Required immutable Pydantic contracts:

- `PublicJobTargetDescriptor`
- `ResolvedTenantJobTarget`
- `JobDispatchEnvelope`
- `JobRetryPolicy`
- `JobTypeDefinition`
- `JobResultReference`
- `JobErrorDetail`.

`JsonObject` or a narrower schema is used for JSON-shaped metadata. Broad
`dict[str, object]` is not a public or persistence contract.

#### 4.2 `BackgroundJobRecord`

Table: `background_jobs` in the public schema.

Required fields:

- public ID and stable `job_type` plus immutable `job_type_version`;
- `workload_class` and `internal_status`;
- validated `target_descriptor`;
- nullable actor user ID and explicit authority mode
  (`actor_revalidated | system_service`);
- non-null `idempotency_scope_key`, `idempotency_key`, and request fingerprint;
- optional source revision/hash and input reference;
- retry-policy snapshot, attempt count, and next-attempt time;
- progress phase, localized status key, completed units, and total units;
- cancellation requester/time/reason and cancellation acknowledgement time;
- result reference or structured terminal error code/details;
- correlation ID, trace context, created/updated/started/completed timestamps;
- nullable `retry_of_job_id` for a manually created retry Job.

Required constraints and indexes:

- unique `(idempotency_scope_key, job_type, idempotency_key)`;
- index `(internal_status, next_attempt_at)`;
- index `(workload_class, internal_status, created_at)`;
- index target workspace/project/site IDs used by authorized listing;
- terminal result and terminal error are mutually exclusive;
- terminal timestamps are present only for terminal states.

The request fingerprint is a canonical hash of job type/version, target,
source revision/hash, and validated input reference. Reusing an idempotency key
with a different fingerprint is a conflict.

#### 4.3 `JobAttemptRecord`

Table: `background_job_attempts` in the public schema.

Required fields:

- Job ID and monotonic attempt number;
- dispatch ID, worker identity, claim token/fencing token;
- status, claimed/start/heartbeat/lease/finish timestamps;
- timeout deadline and handler version;
- failure classification (`permanent`, `transient`, `unexpected`, or
  `worker_lost`) and sanitized structured error;
- retry decision (`scheduled`, `exhausted`, `code_not_allowed`, or
  `not_retryable`), absolute retry time, schedule source, and computed delay;
- a bounded rejection reason when an invalid provider `Retry-After` hint is
  ignored in favor of registry-owned full jitter;
- a nullable `provider_references` column retained only as inert migration
  evidence; it is not a runtime contract and has no service, repository, or
  execution-context read/write surface;
- execution timing and result reference where useful.

Required constraints and indexes:

- unique `(job_id, attempt_number)`;
- unique claim/fencing token;
- index `(status, lease_until)` for reaping expired attempts;
- one active attempt per Job, enforced transactionally;
- a terminal Attempt is never reopened.

An Attempt records one execution lease. Automatic retry creates another
Attempt on the same non-terminal Job; manual retry creates a new Job.
`JobAttemptRecord.provider_references` remains mapped in the ORM and database
only so the historical column is retained. Production runtime code neither
reads nor writes it. There is no thumbnail dual-read or dual-write path, and no
new domain may adopt the column; section 4.5 is the only provider-effect
ownership seam.

#### 4.4 `JobDispatchOutboxRecord`

Table: `background_job_dispatch_outbox` in the public schema.

Required fields:

- Job ID and monotonic dispatch sequence;
- stable Taskiq task name and message schema version;
- workload class and validated `JobDispatchEnvelope`;
- state, available time, dispatch-attempt count, and next-dispatch time;
- dispatcher claim token, lease, heartbeat, and last sanitized error;
- broker message ID and dispatched timestamp after broker acceptance.

Required constraints and indexes:

- unique `(job_id, dispatch_sequence)`;
- index `(status, available_at, next_dispatch_at)`;
- index `(status, lease_until)`;
- a dispatched row is immutable except for audit/retention metadata.

The envelope contains IDs and references only. It never contains prompts,
document bodies, generated source, provider payloads, credentials, binary
content, or secret values.

#### 4.5 `ProviderEffectRecord` and route revisions

The public schema now contains normalized Provider Effect ownership and
settlement evidence plus append-only non-secret Storage Profile route
revisions. The complete persistence, route-canonicalization, registry,
tombstone, migration, and compatibility contract lives in
[Storage Profiles, Route Revisions, and Provider Effects](./storage-profiles.md).

Required Job-side properties:

- one row binds exact Job, owning Attempt, Profile, Route Revision, effect
  type/version/key, canonical manifest/hash, and settlement evidence;
- Profile, Route Revision, Job, owning Attempt, and settling Attempt foreign
  keys use `ON DELETE RESTRICT`;
- the exact versioned domain contract is injected through a fail-closed
  registry; the jobs-core default registry is empty;
- registration commits before the first provider mutation under
  `Job -> Attempt -> StorageProfile -> ProviderEffect` locks and two
  PostgreSQL clock/fence checks;
- caller-actionable new-registration conflicts use the independent
  `ProviderEffectRegistrationError(RuntimeError)` hierarchy with read-only,
  non-sensitive Profile/hash fields; persisted contract, relation, revision,
  hash, and canonical-data corruption remains a Job/storage invariant failure;
- fenced `list_effects()` returns ACTIVE, COMMITTED, and CLEANED rows in stable
  `(registered_at, id)` order, while `list_active_effects()` preserves the
  ACTIVE-only maintenance seam; both validate the fence before and after Effect
  locks, validate all persisted evidence, and renew the Attempt;
- settlement uses `Job -> Attempt -> ProviderEffect` locks and an
  `ACTIVE -> COMMITTED|CLEANED` compare-and-set;
- cancellation blocks new registration but does not block fenced listing or
  settlement needed for reconciliation; listing surfaces the request in its
  control snapshot and still validates and renews;
- public exact-binding resolution locks and resolves only the supplied Profile
  and Revision, compares the complete binding in the same transaction, permits
  retained inactive/tombstoned history with current credentials, and never
  falls back to a latest/current/default route;
- terminal Job status does not invent Effect settlement; FAILED or
  DEAD_LETTERED Jobs may retain ACTIVE Effects until reconciliation;
- tombstoned Profiles remain readable through the exact retained revision and
  current credential source.

The asset-thumbnail v1 handler is hard-cut to this ledger. Production
composition injects its exact versioned contract, registration precedes the
first provider write, and marker-first reconciliation settles normalized rows
COMMITTED or CLEANED. This runtime adoption does not implement or schedule the
bounded maintenance reconciler required for ACTIVE rows left after retry
exhaustion or dead-lettering.

#### 4.6 `JobTypeDefinition`

Every executable type is registered once with:

- stable job type and major handler version;
- exactly one workload class and Taskiq task name;
- validated input-reference and result-reference schemas;
- an explicit result semantic validator that binds the typed result to the
  locked canonical Job, target, input reference, and source revision after the
  Attempt fence passes and before either terminal record is written;
- the complete terminal error-code set, with one strict typed metadata schema
  per code or an explicit declaration that the code permits no metadata;
- target scope and visibility policy;
- authority mode and required permission/entitlement;
- cancellable steps and continuation support;
- lease, heartbeat, timeout, retry, and dead-letter policy;
- the complete progress phase set, initial phase, and cancellable phase subset;
- idempotency namespace and domain handler factory;
- audit/redaction/retention policy.

Duplicate type/version registrations, missing handlers, mismatched workload
classes, unknown task names, and invalid timing policies fail process startup.

### 5. Public and Tenant Target Descriptors

`PublicJobTargetDescriptor` is stored on the Job and serialized into the
dispatch envelope. It contains:

- target scope: `system | workspace | project | runtime`;
- organization/workspace public IDs when tenant-scoped;
- optional project/runtime/site public IDs consistent with the scope;
- optional typed tenant entity reference (`entityType`, `entityId`);
- optional source revision/hash needed for stale-input detection.

It does not contain `schema_name`, a database connection alias, an isolation
mode, or any value that a worker may trust as database-routing authority.

At execution, the worker:

1. loads the Job and validates the envelope against it;
2. resolves workspace/project/runtime/site through canonical public services;
3. re-resolves the current tenant registry entry and tenant readiness;
4. constructs `ResolvedTenantJobTarget` and binds `TenantContext` with
   `TenantScope.JOB`;
5. verifies that optional entity and source revision still belong to that
   resolved target;
6. only then loads tenant-owned rows.

The current `TenantJobContextPayload` may be consumed during the migration
window, but its `schema_name` and isolation mode must be compared with the
canonical tenant registry. The hard-cut envelope stops treating those
serialized values as authority.

System Jobs omit workspace context and may run only under a registered
`system_service` authority. A missing tenant target for a tenant Job is a hard
failure, never permission to use the public/default connection.

### 6. State Machine and Public Projection

Allowed internal transitions:

```text
pending_dispatch -> queued | cancelled | dead_lettered
queued            -> running | cancelled
running           -> succeeded | failed | retry_scheduled
                  -> waiting_for_user | cancelled | dead_lettered
retry_scheduled   -> pending_dispatch | cancelled | dead_lettered
waiting_for_user  -> pending_dispatch | cancelled | failed
```

`succeeded`, `failed`, `dead_lettered`, and `cancelled` are terminal. They are
not reopened. A manual retry creates a new Job with `retryOfJobId`.

Public state is derived, not separately mutated:

| Internal state | Public state |
|---|---|
| `pending_dispatch`, `queued`, `retry_scheduled` | `queued` |
| `running` | `running` |
| `waiting_for_user` | `waiting_for_user` |
| `succeeded` | `succeeded` |
| `failed`, `dead_lettered` | `failed` |
| `cancelled` | `cancelled` |

Rules:

- A Job becomes `queued` internally only after broker acceptance is durably
  recorded on its current outbox row.
- A Job becomes `running` only after a worker atomically claims an Attempt.
- A Job becomes `succeeded` only after its canonical domain outcome and result
  reference are durable.
- A running Job becomes `cancelled` only through an explicit Attempt-scoped,
  fencing-token-validated cancellation acknowledgement after the handler has
  stopped side effects and released its domain reservations. A cancellation
  request alone is never a terminal transition.
- `waiting_for_user` stores an owning-domain continuation/checkpoint reference,
  ends the current Attempt, releases the worker lease, and holds no worker.
- Resuming authorized input transitions the same Job to `pending_dispatch` and
  inserts the next outbox row transactionally.
- Failure to persist terminal state is not success. Reconciliation uses the
  domain idempotency outcome to finish the public Job without repeating the
  effect.
- A canonical durable success always wins over a late cancellation request.
  `succeeded` plus both cancellation timestamps means the worker observed the
  request after the outcome boundary; it does not mean success was cancelled.

### 7. Job Creation, Idempotency, and Transactional Outbox

`BackgroundJobService.create_job(...)` performs one public-database
transaction:

1. validate job type/version, target, authority, permission, entitlement,
   source revision, and input-reference schema;
2. compute idempotency scope and request fingerprint;
3. return the existing Job when key and fingerprint match;
4. raise `BACKGROUND_JOB_IDEMPOTENCY_CONFLICT` when the key exists with a
   different fingerprint;
5. insert `BackgroundJobRecord(status=pending_dispatch)`;
6. insert the first `JobDispatchOutboxRecord` with the same transaction;
7. commit before returning the accepted Job.

The API does not publish to Redis inside this transaction. A committed Job is
durably accepted even when Redis is temporarily unavailable; its outbox row
remains visible and retryable. If Job/outbox persistence fails, the request
returns a non-success response and no accepted Job is claimed.

The dispatcher:

- claims a bounded page of due outbox rows using row locks with
  `SKIP LOCKED`-equivalent semantics;
- uses a dispatch lease so a crashed dispatcher can be reclaimed;
- validates the envelope and current Job state before publishing;
- marks the row dispatched and the Job queued only after broker acceptance;
- tolerates a crash after broker acceptance and before database acknowledgement
  by allowing duplicate delivery;
- includes dispatch sequence and envelope hash so a receiving worker can
  atomically reconcile a still-`dispatching` outbox row to `dispatched`; receipt
  of that exact message is evidence that broker acceptance occurred;
- never runs the handler inline;
- never deletes a failed row to hide the failure.

Dispatch retry has its own policy and counters. Exhaustion marks the outbox and
Job `dead_lettered` with `BACKGROUND_JOB_DISPATCH_EXHAUSTED`.

### 8. Claims, Leases, Heartbeats, Fencing, and Cancellation

A worker delivery carries only `JobDispatchEnvelope`. The executor atomically:

1. loads and verifies Job/outbox/type/version;
2. reconciles the matching dispatch sequence/envelope hash when the dispatcher
   crashed after broker publish but before recording acceptance;
3. returns an acknowledged duplicate-delivery outcome when the Job is terminal;
4. refuses a second active lease;
5. creates the next Attempt with a unique fencing token;
6. transitions the Job from queued to running;
7. invokes the registered handler with resolved target and cancellation/deadline
   controls.

Transactions that touch multiple durable Job records acquire row locks in the
global order `DispatchOutbox -> Job -> Attempt`. A transaction that does not
need an earlier record follows the corresponding suffix (`Job -> Attempt`, or a
single record). Candidate scans may discover identifiers before that sequence,
but they do not retain a conflicting row lock while acquiring an earlier lock.
This order is shared by dispatcher acknowledgement, worker delivery acceptance,
terminal execution, and lease reaping.

Normalized provider-effect registration extends the suffix to
`Job -> Attempt -> StorageProfile -> ProviderEffect`. Settlement uses
`Job -> Attempt -> ProviderEffect`, with Effect rows locked in stable ID order.
Fenced Effect listing uses `Job -> Attempt -> ProviderEffect`, with rows locked
in stable `(registered_at, id)` order. It validates the lease both before and
after the Effect locks; cancellation remains visible control state rather than
being treated as lease loss so cleanup can continue under the valid fence.
Profile administration locks only the Profile before inspecting effect state,
so it never holds an Effect lock while trying to acquire Job/Attempt. A
registration reads the PostgreSQL clock and validates the fence both before
waiting for the Profile and again after the Profile/Effect locks; an expired
Attempt cannot gain provider-write authority merely because it began waiting
while its lease was valid.

Transport receipt timestamps and handler-observed timestamps are diagnostic
metadata only. Lease expiry checks, lease renewal, Attempt start/finish times,
dispatch reconciliation timestamps, cancellation acknowledgement, retry due
times, and public terminal timestamps use the PostgreSQL transaction clock
read after the required row locks are held. A worker-supplied timestamp never
creates, extends, revives, or terminalizes execution authority.

Every Attempt mutation and terminal Job mutation includes the Attempt ID and
fencing token. A worker whose lease expired cannot heartbeat, publish progress,
or commit a terminal state. Domain/provider effects still require their own
Job-derived idempotency key because a stale worker may have crossed an external
boundary before losing its lease.

A tenant-domain success commit that linearizes a provider effect uses the
generic fenced-domain-commit boundary. The public transaction locks `Job ->
Attempt`, reads the PostgreSQL clock, validates the lease/generation/token,
renews the Attempt, rejects an already requested cancellation, and holds both
locks while the owning-domain callback commits. If a reaper or replacement
generation obtains the public lock first, the stale callback is never invoked.
If the callback obtains it first, contenders cannot replace the Attempt until
the canonical domain marker is durable. The callback does not imply one atomic
transaction across public and tenant schemas; an ambiguous public projection
still reconciles from the owning-domain marker.

Lease and heartbeat durations are named per Job type. Configuration must allow
at least two missed heartbeat opportunities before lease expiry; concretely,
`leaseDuration >= 3 * heartbeatInterval`. The ratio prevents normal scheduling
jitter from causing concurrent execution. Timeouts, lease duration, and
heartbeat interval are validated at startup and snapshotted onto the Job.

The executor owns periodic keepalive for every potentially blocking handler
stage; handlers do not implement their own heartbeat loops. Boundary
resolution, initial and recovery reconciliation, new-effect authorization,
handler execution, and cancellation cleanup each run with the same structured
keepalive primitive. `prepareExecution` and terminal projection are deliberate
exceptions: each is one short `Job -> Attempt` transaction that reads the
PostgreSQL clock after locking and validates the fence before renewing or
writing. A transaction that waits beyond lease validity fails closed, while a
transaction that already holds those locks excludes the reaper; a concurrent
heartbeat would only contend for the same rows.

Each periodic heartbeat call has a deadline equal to the registered heartbeat
interval. An active heartbeat infrastructure failure or lease loss stops
cancellable work and leaves the delivery unacknowledged without fabricating a
terminal failure. This remains true when the handler and heartbeat fail in the
same event-loop tick; only a keepalive error produced while joining after the
executor has set its stop signal is secondary to the completed handler
outcome. External task cancellation remains `CancelledError` and is not
replaced by a secondary keepalive failure. Cancellation convergence uses
non-propagating task waits: repeated cancellation is recorded as sanitized
secondary evidence and cannot detach an Attempt-owned thread or provider
operation before it reaches a real terminal state.

All contexts derived for one Attempt share one monotonic control latch and one
single-flight lock. Once any heartbeat, checkpoint, or progress update observes
cancellation, later snapshots cannot clear it. Once any path observes lease
loss, every later control operation fails immediately. Cancellation-disabled
cleanup shares the same lease-loss latch and continues heartbeat supervision
until cleanup settles. After cleanup, the executor performs one final
marker-first reconciliation. A canonical outcome that became visible during
cleanup is projected as success with late cancellation acknowledgement; only a
second `None` result permits the fenced cancellation projection.

Progress monotonicity is scoped to one Attempt generation. Claiming a new
automatic-retry Attempt atomically restores the registered initial phase,
clears the localized status key, and resets completed units to zero while
preserving the canonical total. A delivery replay that does not claim a new
Attempt never resets progress. Within the claimed generation, phase validity,
non-decreasing completed units, and total consistency remain strict.

Cancellation is cooperative:

- the API durably records requester, time, and reason idempotently;
- queued Jobs retain the durable request until the dispatcher/executor
  acknowledges cancellation; an executor may terminalize a Job before its
  first Attempt only when `attemptCount == 0`. A retry/reconciliation delivery
  with prior Attempts must claim a fenced Attempt and reconcile the owning
  domain outcome before deciding whether cancellation can be honored;
- running handlers check cancellation before each provider/domain side effect
  and between documented meaningful steps;
- long external calls use real client deadlines and receive the cancellation
  signal where the client supports it;
- uninterruptible work remains `running` with `cancelRequestedAt`; the API does
  not claim cancellation before worker acknowledgement;
- cancellation releases reservations/leases owned by the domain before the Job
  reaches terminal `cancelled`;
- running cancellation is acknowledged through either the explicit fenced
  `acknowledgeCancellation` command or an explicit success
  `cancellationDisposition`. `require_none` rejects success when the locked Job
  contains a request. `acknowledge_if_present` asks the terminal service to
  inspect the locked Job and acknowledge a late request atomically with the
  canonical success projection; no caller-side pre-check decides this. Failure
  commands never acknowledge cancellation;
- `cancellationAcknowledgedAt` means the worker resolved the request. The
  terminal status records the outcome: `cancelled` means it was honored, while
  `succeeded` means the canonical outcome was already durable and the request
  arrived too late;
- cancellation of a terminal Job returns the existing terminal representation
  without side effects.

A lease reaper transitions an expired Attempt to `lease_expired` and the Job to
`retry_scheduled` or `dead_lettered` according to the snapshotted policy. It
does not directly execute the Job. Candidate discovery is an unlocked, bounded,
stable-order scan of expired Attempt IDs. Each candidate is then revalidated in
its own transaction under `Job -> Attempt` locks and a post-lock PostgreSQL
clock read. Concurrent reapers therefore converge through locked revalidation;
only the winner may create the next dispatch sequence.

### 9. RedisStreamBroker Workload Topology ADR Gate

The topology ADR is accepted for locked Taskiq `0.12.1` plus taskiq-redis
`1.2.2`. The Wave 0 implementation now constructs one typed broker/stream and
one exact worker command root for each of the six workload classes. The
producer selects brokers through the validated Job manifest, workers import
only their workload root, and the durable ACK gate leaves ambiguous execution
pending for redelivery.

All six real command roots have reached startup against PostgreSQL and Valkey.
This proves that the roots and exact task slicing are constructible; it does
not prove six business workloads. The built-in registry now gives `asset-cpu`
the thumbnail task, `agent-io` the Agent Run and Knowledge index tasks,
`connector` the Knowledge ingest task, and `maintenance` the Provider Effect
recovery tasks. `render-browser` and `publish` remain explicitly empty durable
business slices; an empty slice is startup evidence, not a hidden inline
implementation.

The local OS-kill asset vertical now proves pending-message recovery, lease
expiry, retry exhaustion, and bounded orphan cleanup. Deployment termination
signals and readiness drain, rolling-version compatibility, capacity,
starvation, supported idle/autoclaim timing, Valkey outage/recovery,
poison-message operations, health, and metrics gates remain binding in
`taskiq-workload-topology.md`, section 11. Passing the first asset vertical does
not satisfy those deployment gates.

Production Job creation must remain disabled with
`BACKGROUND_JOBS_UNAVAILABLE` until schema readiness, dispatcher, required
worker class, and scheduler leadership are deployed. Local integration
enablement is not production-readiness evidence. There is no single-worker
fallback.

### 10. Task Registration and Handler Execution

Task names follow a stable versioned convention such as
`jobs:{workload}:{job_type}:v{major}`. Each registered type belongs to exactly
one workload class and broker selected by the ADR-backed producer registry.

Task wrappers:

- accept one validated `JobDispatchEnvelope` argument;
- load canonical Job state instead of trusting task arguments;
- resolve the handler by exact job type/version;
- delegate domain behavior to the injected handler;
- do not contain domain ORM queries or business branching;
- do not use independent Taskiq retry middleware that races the application
  retry state machine;
- do not treat Taskiq return values/result storage as the domain result;
- expose duplicate delivery, cancellation, lease loss, and handler failure as
  explicit transport/attempt outcomes;
- authorize transport acknowledgement only from a validated durable executor
  outcome: a claimed delivery must carry a terminal projection for the same Job
  and Attempt, an expired delivery must carry a confirmed lease-reap projection
  for the same Job and Attempt, and safe non-executing dispositions carry no
  fabricated terminal or recovery evidence. Any untyped exception or ambiguous
  projection leaves the transport delivery unacknowledged for redelivery.

Handler contracts:

- every handler implements `reconcile` and `execute`; only a Job definition
  with non-empty `cancellablePhases` requires the additional `cancel` cleanup
  protocol. Startup derives that requirement from the definition itself and
  rejects a missing method; no second `supportsCancellation` flag may drift;
- input bodies are loaded from canonical referenced storage after tenant bind;
- target permission, assignment, entitlement, Connector state, and source
  revision are revalidated at execution time where applicable;
- `actor_revalidated` work fails permanently if the actor no longer has the
  required permission;
- `system_service` work is available only to types explicitly registered for
  service authority;
- progress is phase-based and durable; per-token/per-byte write amplification
  is forbidden;
- every domain write and external provider call uses a stable idempotency key
  derived from Job ID plus the declared operation step;
- successful return is a typed result reference, not an invented message.

### 11. Scheduler, Due-Row Claim, and Fan-Out

There is exactly one scheduler leader, or a documented leader-election
mechanism with equivalent behavior. Schedules use UTC unless the schedule
record explicitly stores a validated IANA timezone and its DST policy.

A scheduled tick is a recovery signal, not canonical business state. Losing a
tick does not lose work because due intent remains in the database and the next
tick scans it again.

Every scanner:

1. selects a configured bounded page ordered by due time and stable ID;
2. atomically claims rows with a claim lease and `SKIP LOCKED`-equivalent
   semantics;
3. creates one idempotent BackgroundJob plus dispatch outbox per claimed target;
4. marks the due row dispatched only in the same transaction as its durable
   Job/outbox reference, or uses a domain outbox where the row is tenant-owned;
5. commits and returns without executing the target work;
6. repeats only through another bounded invocation/cursor.

Scheduled release dispatch must not call release execution in the scanner
process. Each release receives one publish-workload Job keyed by the release
and schedule revision. Concurrent scheduler replicas or repeated ticks must
produce the same Job rather than duplicate activation.

Advisory locks use a central namespaced registry or a collision-tested stable
derivation. Hand-authored numeric keys are forbidden. Scanner correctness must
not depend only on an advisory lock when row-level claim can express ownership.

Current Wave 0 code registers exactly one scheduled control task: the bounded
Provider Effect orphan scan on the `maintenance` broker. Competing scheduler
replicas wrap the same `LabelScheduleSource` with a token-owned Valkey lease;
only the leader exposes schedules, lease renewal is rechecked immediately
before publish, and a stale former leader is explicitly fenced. The scan uses
bounded `SKIP LOCKED` discovery and creates durable recovery Jobs/outboxes; it
does not perform provider cleanup in the scheduler process.

The deleted legacy Taskiq cron registrations were not restored. AI usage
aggregation, audit/observability/conversation/checkpoint retention, scheduled
publish, and lease-reaper automation therefore still do not run automatically.
Each future tick must be an explicit bounded control task that fans out durable
work; missing automation is not permission to execute legacy business logic
inline.

### 12. Retry, Backoff, Dead Letter, and Manual Retry

Retry classification is explicit:

| Classification | Automatic retry |
|---|---|
| transient network/connectivity | yes |
| provider `429`/documented temporary unavailability | yes |
| worker loss/expired lease | yes |
| broker dispatch failure | outbox policy |
| validation/schema/input failure | no |
| authentication/permission/entitlement failure | no |
| stale source revision or deleted target | no |
| prompt-injection rejection | no |
| deterministic build/content failure | no |
| non-idempotent provider operation without a provider key | no; implementation blocker |

Retry policy is snapshotted on Job creation and defines maximum attempts,
initial delay, multiplier, maximum delay, jitter strategy, retryable codes, and
timeout. Provider `Retry-After` is honored when valid. Otherwise retries use
exponential backoff with full jitter. Invalid provider hints never abort the
terminal transaction: the Attempt records a bounded rejection reason and the
central calculator uses full jitter. Retry calculation is deterministic under
an injected random source in unit tests, but production never substitutes a
fake provider outcome. Failure classification describes the error itself;
retry decision describes what this Attempt did. Exhaustion therefore preserves
`transient` or `worker_lost` classification while recording an `exhausted`
decision instead of rewriting the failure as non-retryable.

When automatic attempts are exhausted, the Job becomes `dead_lettered` and
retains its attempts and error evidence. A deterministic non-retryable failure
becomes `failed` immediately.

Manual retry:

- is permission-checked and allowed only by the Job type policy;
- revalidates current target, authority, entitlement, and input revision;
- requires `Idempotency-Key`;
- creates a new Job with `retryOfJobId` and its own policy snapshot;
- never reopens or mutates the terminal source Job;
- cannot bypass a permanent safety, permission, or stale-input failure.

### 13. Domain Outcomes and Cross-Schema Transactions

Job status is not website, Agent, publishing, billing, Connector, or content
truth. The owning domain persists the canonical outcome first.

For tenant-owned effects:

1. execute a typed tenant command with the Job/step idempotency key;
2. persist a tenant-domain command outcome/result reference transactionally;
3. commit the tenant transaction;
4. persist the public Attempt/Job terminal projection;
5. if step 4 fails, reconcile from the durable tenant outcome without repeating
   the tenant/provider effect.

The executor always checks for an existing owning-domain idempotent outcome
before honoring cancellation or invoking another side effect. Once a success
outcome is durable, `succeedJob` must project it even if a cancellation request
was recorded between steps 3 and 4. When no outcome exists, cancellation may
reach `cancelled` only after cleanup and a fenced acknowledgement. A boolean
"effect committed" flag is not evidence and is not part of this contract.

Target resolution is therefore a hard two-stage boundary. The reconciliation
stage validates immutable Project/Workspace identity and ownership, resolves
the current tenant route, and deliberately does not reject an inactive or
archived target before checking its owning-domain outcome marker. Only when no
matching marker exists may the new-effect authorization stage re-read and
reject mutable Project/Workspace activity, actor permission, entitlement,
source revision, or Connector state. A target archived after its canonical
outcome committed cannot turn that committed success into a fabricated failure.

The current production execution-boundary capability matrix supports `SYSTEM`
plus `system_service`, `PROJECT` plus `system_service`, and `WORKSPACE` plus
`actor_revalidated` with a required workspace permission. Workspace execution
resolves the current tenant target and revalidates the creating actor through
`WorkspaceActorJobAuthorizer` before any new domain effect. Unsupported target/
authority combinations and entitlement-bearing definitions still fail worker
runtime construction with `JobExecutionRegistryError`; they are never
default-allowed. `managePermission` separately protects control-plane actions
such as cancellation.

For public-domain effects, the handler may share a `BaseService.tx()`
transaction only when all participating repositories receive the same
connection. Public and tenant-schema writes may be atomic only when they use
that exact connection in the same PostgreSQL database, as the Knowledge handoff
does. No implementation assumes atomicity across different databases or
independently committed connections.

Provider event inboxes, billing ledger entries, release activation, and AI
Credits keep their owning-domain idempotency and terminal ordering contracts.
A succeeded Job cannot compensate for a failed domain commit.

#### 13.1 First production vertical: asset thumbnail generation

`asset.thumbnail.generate` version `1` is the first owning-domain vertical for
this contract. It uses task name
`jobs:asset-cpu:asset-thumbnail-generate:v1`, workload `asset-cpu`, project
visibility, and explicit `system_service` authority. Upload authorization is
checked synchronously; the derived thumbnail operation does not become invalid
merely because the creating actor later leaves the project. The actor ID is
retained for audit. Cancellation management requires the current
`system:assets:manage` workspace permission.

For a previewable project Asset, `UploadsService.complete()` writes the Asset,
completed UploadSession, required `asset.uploaded` Activity evidence,
Background Job, and first dispatch outbox in one PostgreSQL transaction. It
does not publish an in-process `asset.uploaded` event as the Job acceptance
boundary. Workspace, organization, and user scoped uploads do not create this
project Job; non-previewable project Assets are an explicit no-op with no fake
succeeded Job.

Upload completion uses an explicit monotonic state machine:

```text
initiated/uploading
  -> completing                 # storage_not_committed
  -> storage_finalized          # canonical object exists; DB commit pending
  -> completed
```

`completed`, `aborted`, and `expired` are terminal. Expiration and abort use
named allowed-from transitions and can never rewrite a completed session.
Part writes and part commits are accepted only from `initiated` or `uploading`.
There is no generic status setter in the completion path.

The public migration preserves every existing UploadSession status. It adds
`completionGeneration` with a PostgreSQL server default of `0` so existing rows
are backfilled atomically rather than relying on an application-only default;
the remaining ownership and finalized-evidence fields begin nullable. The
`completionLeaseUntil` index is generated in the next migration after the
column exists, because index creation must not precede its `AddField` operation.
Migration acceptance applies the pre-completion schema to real PostgreSQL,
inserts legacy terminal and writable rows, upgrades through both migrations,
and verifies status preservation, generation backfill, nullable evidence, and
the lease index.

The first short transaction locks the UploadSession, reads PostgreSQL
`clock_timestamp()`, validates the complete immutable part set, and acquires a
completion lease. The lease contains a random UUID claim token, a monotonically
increasing generation, `heartbeatAt`, and `leaseUntil`; `updatedAt` is never a
fencing token. Lease duration and heartbeat interval are deployment-owned and
must provide at least two missed heartbeat opportunities. A stale claimant can
mutate completion state only when every write matches the current session ID,
claim token, generation, expected phase, and a live post-lock database clock.

Local storage merges only into a claim-scoped staging path. A cancelled
`asyncio.to_thread()` operation may finish writing that private staging file,
but it cannot promote or replace the canonical object. After size and optional
SHA-256 validation, a short UploadSession row-lock transaction revalidates the
live claim and performs the local atomic metadata promotion while that lock is
held, then records `storage_finalized` evidence before commit. Canonical
promotion is never left running in a detached cancellable thread. Stale workers
may remove only staging paths owned by their own token and generation.

S3-compatible multipart completion remains outside a database transaction and
heartbeats the completion lease around provider calls. The reserved object key,
immutable part snapshot, multipart upload ID, and definitive final-object HEAD
form its replay evidence. Multipart completion runs only after typed
object-not-found; an existing object must match the declared size. A post-call
fenced transaction records `storage_finalized`. If that transaction or its
response is ambiguous, retry reconciles the canonical object and does not
return the session to an uploadable state.

Only a failure proven to occur before any canonical storage effect may perform
the exact fenced transition `completing -> uploading`. Once storage is known or
possibly finalized, the session remains `completing` for reconciliation or
`storage_finalized` for takeover; persistence failure never reopens part writes.
A takeover of `storage_finalized` reconstructs the persisted storage outcome
and performs no merge or provider completion.

When the final database transaction is known to have failed, the current
`storage_finalized` owner may voluntarily relinquish only its lease by setting
`leaseUntil` to the post-lock database clock through the exact token and
generation fence. Status, token, generation, heartbeat, reserved object
identity, and all finalized evidence remain unchanged. The next request rotates
the token and generation through the normal takeover path and can retry the
database commit immediately. If the commit outcome is ambiguous, a subsequent
row read decides between exact `completed` replay and fenced relinquish; no path
reopens part writes.

The final short transaction locks and fences the session, then atomically writes
the Asset, required Activity with explicit `project_id`, thumbnail Job, first
outbox, and `completed` session. Local parts are deleted only after this
transaction commits. This ordering prevents a stale worker, timeout, or lost
response from publishing one object revision while the Asset references
another.

The typed target contains `workspaceId`, `projectId`, `entityType="asset"`, and
`entityId`. The typed input reference contains `assetId` and
`thumbnailProfileVersion`; `entityId` and `assetId` must match. Source revision
uses the immutable Asset checksum when present, otherwise
`asset-id:{assetId}`. Neither target nor input contains serialized tenant
routing, provider credentials, filesystem paths, binary data, or queue names.

The typed result reference must bind `assetId` to both the target `entityId`
and input `assetId`, `outcomeJobId` to the canonical Job ID, `sourceRevision`
to the Job source revision, and `thumbnailProfileVersion` to the validated
input reference. Schema-valid but semantically unbound results are permanent
contract failures and cannot mutate the Job or Attempt terminal projection.

The owning-domain success marker is stored under
`AssetRecord.meta.thumbnail_generation` and binds Job ID, request fingerprint,
source revision, thumbnail profile version, output identity, actual produced
widths, and completion time. It is committed with merged variants/meta under a
locked tenant Asset row before the public Job becomes succeeded. Redelivery
first checks this marker and reconciles the public result reference without
repeating render/download/upload effects when it matches.

The marker commit runs through the fenced-domain-commit boundary described in
section 8. Its linearization rule is marker-first: a winning commit makes the
marker durable before a replacement generation can proceed, so replacement
reconciliation returns canonical success and performs no cleanup. When a
reaper/replacement generation wins first, the stale marker callback never
runs; the replacement may then reconcile the prior Attempt's normalized ACTIVE
Effect and delete only its exact uncommitted objects.

Profile completion is not inferred from requested width values. Media narrower
than a requested profile width may legitimately produce only its natural
width; a matching outcome marker still proves that the profile completed.
Missing targets, stale sources, unsupported storage/media, tenant-resolution
failure, and provider/transient failures use explicit typed error
classification. No handler path logs and returns `None` to fabricate success,
and no enqueue failure runs thumbnail generation inline in the API process.

Generated object keys are stable and Job-owned, while scratch space is
Attempt-owned:

```text
projects/{projectId}/assets/{assetId}/thumbnails/
  v{thumbnailProfileVersion}/{jobId}/thumb-{producedWidth}.{extension}

{scratchRoot}/thumbnail-jobs/{jobId}/{attemptId}/...
```

A retry of the same Job therefore addresses the same idempotent output objects
without sharing scratch files with a prior Attempt. The downloaded source is
always `{attemptId}/source.bin`; untrusted `Asset.ext` metadata never
participates in a local path.

The thumbnail Provider Effect contract is the exact identity
`effect_type="asset.thumbnail.objects"`, `schema_version=1`, and
`effect_key="generated-objects"`. Its strict, frozen, extra-forbidden manifest
binds Job, Project, Asset, request fingerprint, source revision, thumbnail
profile version `1`, exact target bucket, and the complete output set. The set
contains one to four positive, unique, ascending widths and unique canonical
`.jpg` or `.png` keys under the Job-owned v1 path. Unknown fields, coercion,
cross-Job/cross-Asset paths, non-canonical hashes, and route-bucket drift fail
closed.

Every marker and terminal reference carries a required lowercase SHA-256
`outputIdentity`. It hashes the effect type/schema, exact Storage Profile ID,
exact Route Revision ID, target bucket, and logical manifest. It deliberately
excludes the Effect row ID, owning or settling Attempt identity, mutable Profile
key, credentials or secret material, and timestamps. The same logical output
set on the same exact route therefore remains stable across Attempt and Effect
row identities, while a route, bucket, Job context, or output-set change
produces a different identity.

The pipeline completes rendering, materializes every output, reads every upload
payload, and authorizes an active exact route before calling the thumbnail
Provider Effect coordinator. The coordinator persists and returns one ACTIVE
normalized Effect before the first provider `put`; a terminal registration
replay fails closed and never authorizes another write. Existing-source read,
new-output authorization, and historical cleanup are separate storage
capabilities, so reading an existing object never grants new-write authority.

Reconciliation is marker-first and then validates the complete all-disposition
Effect listing. A matching current-Job marker must agree with every ACTIVE or
COMMITTED Effect on context, produced widths, and `outputIdentity`; ACTIVE rows
are settled COMMITTED without resolving cleanup storage or deleting objects.
When the marker is absent, belongs to another Job, or the Asset was hard
deleted, any COMMITTED row is an invariant failure. The handler first resolves
all ACTIVE cleanup routes before the first delete, then deletes only each
manifest's exact keys and settles each row CLEANED. Object-not-found is
idempotent cleanup success, and already CLEANED evidence is validated but never
re-mutated.

New-output authorization materializes the selected Profile route and resolves
that complete binding before registration. Cleanup resolves only the Effect's
stored Profile and historical Route Revision, overlays current credentials for
that same provider identity, and never falls back to a mutable Profile key,
latest revision, effective default, or `env-default`. Credential rotation is
therefore allowed without redirecting an old Effect to another bucket,
endpoint, or local root.

COMMITTED and CLEANED references are independent deterministic schemas:
`{kind, effect_id, manifest_hash, output_identity}`. They contain no run,
Attempt, reason, or timestamp field and must match the settled Effect exactly.
The tenant Asset marker and public Effect settlement remain two transactions.
If marker commit wins but COMMITTED settlement fails, replay reads the marker
first and settles without rendering, writing, or deleting. If exact deletion
wins but CLEANED settlement fails, retry treats object-not-found as success and
replays CLEANED. This is deliberate two-transaction convergence, not a claim of
cross-schema atomicity.

`JobAttemptRecord.provider_references` remains only as an inert ORM/database
retention column. Thumbnail runtime has no reader, writer, dual-read, or
dual-write path for it. The normalized hard cut and bounded maintenance owner
are implemented. The scheduled control task
`jobs:maintenance:provider-effect-orphan-scan:v1` performs only a bounded,
`SKIP LOCKED` fan-out over terminal source Jobs with ACTIVE Effects. It creates
one idempotent durable `provider.effect.orphan.reconcile` Job per source
Job/effect-type/schema-version contract and never reads or deletes provider
objects itself.

Each recovery Job owns its own fenced Attempt. Its exact frozen target binds
`source_job_id`, `effect_type`, and `schema_version`; the Provider Effect core
revalidates that target, the recovery Job identity/workload/system-service
authority, and a FAILED, DEAD_LETTERED, or CANCELLED source Job on every list
and settlement transaction. Cross-Job settlement is authorized only for that
contract and records the real recovery Attempt in `settled_by_attempt_id`.
Thumbnail recovery carries the central source Job's workspace/project scope in
the fenced listing, verifies it against the Effect manifest, resolves a fresh
`TenantScope.JOB` route for marker access, and then applies the same marker-first
COMMITTED or exact historical-route CLEANED convergence. Physical Profile purge
and revision GC remain unsupported.

Attempt-owned scratch creation/removal, source download, preview/thumbnail
rendering, generated-file reads, object upload, and object deletion do not
detach when their coroutine receives cancellation. The pipeline shields each
such operation, waits for it to settle, records a completed upload and its
owned object key in the same shielded operation, and only then re-raises
`CancelledError`. No arbitrary timeout converts unfinished work into success.
Cancellation cleanup can therefore delete the exact settled objects it owns; a
matching canonical marker is reconciled before cleanup and is never treated as
a cancelled outcome.

The strict thumbnail error contract currently binds these named outcomes:

| Condition | Stable code | Classification |
|---|---|---|
| PostgreSQL source/outcome persistence is explicitly transient | `ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE` | transient, retryable |
| Source object is absent | `ASSET_THUMBNAIL_SOURCE_NOT_FOUND` | permanent |
| Source download is temporarily unavailable | `ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE` | transient, retryable |
| Renderer or scratch infrastructure is temporarily unavailable | `ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE` | transient, retryable |
| Local media decode/render is invalid | `ASSET_THUMBNAIL_RENDER_FAILED` | permanent |
| Thumbnail upload/delete storage is temporarily unavailable | `ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE` | transient, retryable |
| Storage provider rate-limits an operation | `ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED` | transient, retryable with validated provider hint |
| Storage denies access | `ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED` | permanent |

Image/PDF/video decode failures that deterministically describe invalid source
bytes map to `ASSET_THUMBNAIL_RENDER_FAILED`. Scratch read/write/stat/mkdir
failures, missing renderer dependencies, subprocess execution/timeout, and
negative ffmpeg termination map to renderer temporary unavailability. A
positive ffmpeg decode failure or exit-zero-without-frame is invalid source.
ffmpeg stdout/stderr never crosses the safe Job error boundary.

For `download_object_to_path`, `put_object_bytes`, and `delete_object`, the S3
adapter maps object-not-found, rate-limit, access-denied, explicit request
timeout, endpoint/connection/read timeout, and 5xx signals into typed storage
errors. Unknown `ClientError` values and programming errors still surface
unchanged. `Retry-After` accepts a non-negative delay-seconds value or an RFC
HTTP-date; invalid values remain absent so the central retry calculator applies
registry-owned full jitter. S3 connect and read deadlines are positive finite
typed settings copied into the botocore client; they are not hidden SDK
defaults.

Every non-streaming S3 operation owns and deterministically closes the client
it creates. If an operation and close both fail, the operation remains primary
and only the sanitized cleanup stage and exception type are attached; a close
failure after an otherwise successful operation is not hidden. A cancelled
blocking SDK call waits for its real thread and any unclaimed result cleanup to
settle before propagating `CancelledError`, including repeated cancellation.

`getObject` transfers client ownership to a client-owned StreamingBody wrapper
and closes the raw body before the client. The server-proxy response does not
acquire that body while merely being constructed. Its ASGI call boundary owns
the complete sequence `get -> send headers -> read/send -> close -> final
frame`: provider failure occurs before headers, while header/chunk/final-send
failure, disconnect, read failure, EOF, and cancellation all deterministically
close an acquired body. Cleanup evidence propagates only module-generated
stage/type notes; arbitrary provider notes or payloads do not cross this
boundary. For ASGI versions below 2.4, blocking read and close convergence is
shielded from the disconnect task group's AnyIO level cancellation while direct
`asyncio.Task.cancel()` calls remain observable. If body cleanup fails during a
disconnect cancellation, the task-group owner raises a sanitized
`S3ResponseCleanupError` after the cancellation scope exits; a disconnect
with successful cleanup still returns normally. Direct cancellation of the
ASGI host call remains the primary `CancelledError`; after its task group has
settled, the owner attaches only module-generated cleanup notes collected from
the child stream before re-raising that same host cancellation. A second or
later direct host cancellation received while the child cleanup is settling is
recorded once with the fixed sanitized note `S3 response host received another
cancellation while child cleanup was settling`; it does not detach cleanup or
create one note per cancellation checkpoint. No garbage-collection finalizer
or background pseudo-cleanup is part of the resource contract.

Tenant marker/source reads and outcome commits translate only an explicit
PostgreSQL transient allowlist, including connection loss, serialization/deadlock,
statement ambiguity, lock/query/transaction timeout, capacity, and server
shutdown conditions. The classifier inspects the complete cause/context graph,
rejects cycles, and gives `DBConnectionError` and `IntegrityError` permanent
precedence. It does not retry inside the repository; the Job retry policy owns
the next Attempt. Exact marker replay preserves the first `completedAt` value.
Real PostgreSQL tests also prove rollback after SQLSTATE `55P03` lock timeout
and two distinct backend connections converging on one marker and one variant
set for concurrent exact duplicate commits.

Focused two-backend race tests are additionally required for the complete
thumbnail path: real public Job/Attempt fencing, real tenant marker commit, a
real local object, normalized Provider Effect registration/settlement, and
exact historical-route cleanup. They must prove both legal orders:
commit-first retains the object, settles COMMITTED, and performs no cleanup
after replacement reconciliation; replacement-first prevents the stale
callback, deletes Attempt 1's exact object, preserves a same-prefix sentinel,
and settles CLEANED. The focused suite is
`test_asset_thumbnail_fenced_race_integration.py`; acceptance requires those
normalized-ledger assertions on distinct PostgreSQL backends rather than
legacy Attempt-column evidence.

The required real PostgreSQL plus Valkey integration is
`test_asset_thumbnail_durable_e2e_integration.py`. It exercises project upload
HTTP completion, transactional Job/outbox creation, dispatcher publish, the
production `asset-cpu` broker/Receiver path, fenced Attempt execution, tenant
marker and variants, ACTIVE-to-COMMITTED settlement, public success projection,
and transport ACK. It then republishes the exact envelope and requires
acknowledgement as a terminal duplicate without another Attempt or any marker,
variant, Effect, or completion-time change. Concurrent schema-rebuilding
fixtures are not acceptance evidence. The separate seeded-orphan integration
`test_asset_thumbnail_orphan_recovery_e2e_integration.py` proves real
PostgreSQL, Valkey, dispatcher, maintenance Receiver, tenant marker routing,
exact local-object cleanup, and cross-Job fenced settlement after a terminal
source Job. Its orphan state is explicitly seeded after the source execution;
it does not claim that an OS process was killed.

`test_asset_thumbnail_worker_kill_recovery_integration.py` supplies the
separate process-loss proof. It starts two production `asset-cpu` worker
generations. For each generation, a real tenant Asset row lock creates a
deterministic pre-marker-commit window while the worker itself registers the
ACTIVE Effect and writes every real local thumbnail object; the test then sends
OS `SIGKILL` to the worker process group and verifies that one stream entry
remains pending. The first lease expiry produces the normal retry dispatch;
the second worker consumes the stale pending delivery safely, executes the
retry generation with attempt-scoped progress reset, and is killed in the same
window. The second reap exhausts policy and dead-letters the source Job. A
bounded scanner then fans out one real maintenance Job, whose fenced Attempt
performs exact historical-route cleanup and settles the remaining ACTIVE Effect
CLEANED. This evidence does not use a handler failpoint or seed an Effect.

The proof is intentionally local: it does not prove deployment-orchestrator
SIGTERM/readiness drain, S3 behavior, Valkey outage/recovery, or the still-empty
`render-browser` and `publish` business workloads. `agent-io` and `connector`
now own real Agent Run and Knowledge task registrations, but this thumbnail
proof does not establish their capacity or deployment behavior.

#### 13.2 Workspace Knowledge ingest and index vertical

Workspace Knowledge implements two actor-revalidated owning-domain Jobs:

| Job identity | Workload and task | Domain outcome |
|---|---|---|
| `knowledge.source.ingest` v1 | `connector` / `jobs:connector:knowledge-source-ingest:v1` | Parsed tenant chunks plus a required bound index Job ID. |
| `knowledge.source.index` v1 | `agent-io` / `jobs:agent-io:knowledge-source-index:v1` | A security-scanned, vector-indexed, atomically active source version. |

`knowledge.source.ingest` owns both manual processing and URL `initial | refresh`.
Manual targets bind a pre-existing immutable candidate. URL targets deliberately
carry a null `candidateVersionId`; their input contains only source kind, mode,
normalized URL/locator revision, and parser/chunker/index profile identifiers.
The worker fetches external bytes, computes the real hashes, and only then
creates the immutable version. Document bodies, credentials, and complete HTTP
headers never enter the Job, outbox, or broker envelope.

URL HTTP execution is part of the `connector` worker rather than the request
handler. Its transport validates every DNS answer and redirect, pins the socket
connection to a validated public IP, retains hostname TLS verification, ignores
environment proxies, and enforces independent compressed/decoded byte limits.
A failure before version creation is still a durable terminal/retry outcome and
projects a source failure; it does not synthesize a candidate or inline retry.

The ingest domain commit and its child index acceptance share one PostgreSQL
transaction: parsed chunks, `KnowledgeSourceVersionStateRecord.index_job_id`,
the public `BackgroundJobRecord`, and dispatch outbox either commit together or
roll back together. Publication occurs after commit and remains recoverable from
the outbox. The result cannot use a nullable or best-effort index Job reference.

Index v1 uses LiteLLM's OpenAI-compatible embeddings endpoint and Meilisearch
`userProvided` vectors. Meilisearch operations are asynchronous provider Tasks;
the adapter polls every index-create, settings, and document task to terminal
`succeeded` before it returns a receipt. The receipt, immutable embedding
profile, complete ordered chunk set, and clean scan evidence are revalidated in
the fenced tenant activation transaction.

Transient embedding, vector-provider, worker-loss, tenant-readiness, and
explicit PostgreSQL persistence errors are retryable only when named in the Job
definition. Because failure projection precedes the generic retry decision, the
same index Job may re-enter a `failed` version projection only when its saved
error code is in that exact retryable set. Quarantine and permanent provider/
contract failures remain terminal. Quarantine error metadata contains only
chunk ID, rule name, scanner name, and scanner version.

Ingest v1 adds these complete URL terminal contracts:

| Error code | Retry contract |
|---|---|
| `KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID` | permanent |
| `KNOWLEDGE_SOURCE_FETCH_FAILED` | permanent |
| `KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE` | transient and retryable |
| `KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED` | permanent |
| `KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE` | permanent |
| `KNOWLEDGE_SOURCE_URL_FORBIDDEN` | permanent |

Only the explicitly registered transient fetch code is retryable. HTTP 408,
425, 429, supported 5xx statuses, timeouts, and network unavailability map to
that code; deterministic URL/MIME/size/policy failures do not retry blindly.

The deployment profile is explicit under `KNOWLEDGE_INDEX__*` settings and is
disabled by default. Disabled or invalid provider configuration is a visible
permanent failure, not permission to switch to memory vectors or return a mock
ready outcome. The complete domain contract lives in
`docs/spec/api/backend/workspace-knowledge.md`, sections 7.1 through 7.3.

#### 13.3 Builder Sitemap generation vertical

Builder Sitemap generation is the first Builder-owned model Job:

| Job identity | Workload and task | Domain outcome |
|---|---|---|
| `builder.sitemap.generate` v1 | `agent-io` / `jobs:agent-io:builder-sitemap-generate:v1` | One or more persisted typed Sitemap ChangeSet previews, a partial result with structured candidate failures, or an explicit terminal failure/cancellation. |

The Job is Project-scoped, creator-owner-only, and `actor_revalidated`. Before
each new effect, the execution boundary resolves the exact Project tenant
context, verifies its workspace identity, and rechecks
`project:content:site-builder:write` for the persisted actor. Workspace drift,
missing Project state, or revoked permission is a permanent
`BACKGROUND_JOB_ACTOR_PERMISSION_REVOKED` outcome rather than permission to
continue with creation-time authority.

The typed target contains `workspaceId`, `projectId`, `runtimeId`, and
`environmentId`. Generic `BackgroundJob.site_id` is null because the registered
scope is Project, not Site. This does not weaken business binding: the tenant
`BuilderGenerationRecord`, typed input `generationId` and
`baseSiteRevisionId`, source manifest hash, actor, Agent Run, request hash, and
exact result semantic validator must all agree. The generation ID is a stable,
public-ID-compatible UUID v4 derived from workspace/project/Idempotency-Key;
same fingerprint replays and a changed fingerprint conflicts.

Generation requires a creator-owned Agent Run whose immutable
`ai_run_builder_snapshots` row binds the same base Site Revision and whose
pinned Agent version grants `builder.sitemap.generate`. The model receives that
exact snapshot as untrusted project data and must emit exactly one
`submit_builder_sitemap_candidate` function Tool call validated against the
closed `BuilderSitemapCandidateV1` Pydantic JSON Schema. Provider failures stop
remaining candidates; invalid typed output records a candidate-scoped failure
and may continue. Valid output is passed through the canonical Agent-origin
ChangeSet preview service with `builder.sitemap.apply` provenance. The handler
does not mutate a Site Revision or claim apply/publish success.

The definition declares phases `queued`, `preparing`, `generating`,
`previewing`, and `finalizing`; every phase is cancellable. It uses
`retryClass=none` and `maxAttempts=1`, so infrastructure never repeats a
non-deterministic model call automatically. Cancellation is cooperative:
requesting it records `cancelRequestedAt`, completed candidate ChangeSets stay
durable, and `cancelled` plus `cancellationAcknowledgedAt` appear only after the
worker reaches a checkpoint, stops effects, and completes fenced cleanup.

Candidate, failure, running, and terminal writes use
`run_fenced_domain_commit`. Replayed delivery skips persisted candidate indexes;
reconciliation returns an already durable succeeded/partial/failed outcome;
lease or generation loss prevents the stale callback from writing. All
candidates succeeding returns `succeeded`, some succeeding returns `partial`,
and zero valid candidates returns `BUILDER_GENERATION_FAILED`. The public
projection rebuilds each authorized ChangeSet preview from retained command
evidence; raw preview tokens are absent from generation, Job, Activity, and
idempotency persistence.

Creation commits the generation, public Job, dispatch outbox, and
`project.builder.generation.created` Activity in one transaction, then
publishes after commit. Public migration `0047_auto_20260721_0158` and tenant
migration v20 add the immutable Agent Builder snapshot and generation tables.
The owning Builder create/get/cancel endpoints expose the accepted projection;
there remains no generic arbitrary-Job creation API.

### 14. Admin API and Resource Contracts

All paths below are domain-router-local; `/api/v1` remains owned by
`apps/api/src/core/routes.py`. Responses use `ResponseModel[T]`, camelCase,
`PublicUUID`, stable error codes, browser auth/CSRF, generated clients, and
canonical pagination.

Workspace-visible resources:

| Method/path | Contract |
|---|---|
| `GET /workspaces/{workspaceId}/jobs` | Paginated authorized list with status/type/workload/project/date filters. |
| `GET /workspaces/{workspaceId}/jobs/{jobId}` | Read one authorized Job projection and sanitized error/result/progress. |
| `POST /workspaces/{workspaceId}/jobs/{jobId}/cancel` | Idempotently request cancellation where the type permits it. |

System operations:

| Method/path | Contract |
|---|---|
| `GET /system/jobs` | Super-admin paginated list with internal status, workload, target, timing, and failure filters. |
| `GET /system/jobs/{jobId}` | Read Job, dispatch, attempt, lease, and dead-letter diagnostics. |
| `POST /system/jobs/{jobId}/retry` | Create a permission-checked manual retry Job; never reopen the source Job. |

Owning domains create Jobs through their typed endpoints, not through a
generic arbitrary-job creation endpoint. Examples include Builder generation,
Knowledge indexing, Connector replay, publish, and thumbnail capture.

Creation endpoints return `202 Accepted`, `Location` for the Job resource, and
the accepted Job projection. They require `Idempotency-Key`. A retry with the
same key/fingerprint returns the existing Job.

Visibility is declared by Job type as `owner_only | project | workspace |
system`. Listing and read operations re-resolve workspace/project ownership.
Cross-tenant or unauthorized identifiers return `BACKGROUND_JOB_NOT_FOUND`
rather than revealing existence. Cancellation requires creator ownership or
the type's declared manage permission.

Public responses expose public status, progress, localized status/error keys,
timestamps, and authorized result references. They do not expose fencing
tokens, raw broker IDs, secret-bearing provider payloads, stack traces, schema
names, or worker credentials.

### 15. Validation and Error Matrix

| Condition | Required behavior |
|---|---|
| Job subsystem schema/worker class is not ready | `503 BACKGROUND_JOBS_UNAVAILABLE`; create no Job and do not run inline. |
| Job/outbox transaction fails | Return non-success; no accepted Job is claimed. |
| Redis is unavailable after Job/outbox commit | Return accepted Job; outbox remains pending and visible. |
| Same idempotency key and same fingerprint | Return the existing Job. |
| Same idempotency key with different fingerprint | `409 BACKGROUND_JOB_IDEMPOTENCY_CONFLICT`. |
| Job type/version is missing or mismatched | Fail startup; at runtime dead-letter with explicit registry error. |
| Target is outside caller workspace/project | `404 BACKGROUND_JOB_NOT_FOUND` or owning-domain not-found before creation. |
| Actor permission/entitlement revoked before execution | Permanent `BACKGROUND_JOB_AUTHORITY_REVOKED`; perform no side effect. |
| Tenant context cannot be resolved/readied | Fail attempt explicitly; never use default/public DB for tenant data. |
| Source revision/hash is stale | Permanent `BACKGROUND_JOB_TARGET_STALE`; never silently rebase. |
| Duplicate broker delivery for terminal Job | Acknowledge duplicate, emit metric, perform no side effect. |
| Worker receives an exact message before dispatcher DB acknowledgement | Reconcile matching outbox/job state from dispatch sequence and envelope hash, then claim normally. |
| Worker receives a message that does not match the current dispatch sequence/hash | Reject execution and record an explicit stale/invalid-delivery outcome. |
| Delivery sees an unexpired active Attempt | Do not execute concurrently; acknowledge/defer per ADR-backed transport behavior. |
| Attempt fencing token is stale | Reject heartbeat/progress/terminal update with `BACKGROUND_JOB_LEASE_LOST`. |
| Worker crashes and lease expires | Reaper schedules retry or dead-letters according to policy. |
| Cancellation requested during uninterruptible call | Keep `running` plus cancellation metadata until worker reaches a safe point. |
| Cancellation arrives after a canonical success outcome committed | Project `succeeded`, retain and acknowledge the late request, and preserve the result reference. |
| Duplicate delivery sees a running Attempt plus cancellation request | Do not terminalize without the active Attempt fence; defer/acknowledge the duplicate according to the topology ADR. |
| Deterministic validation/build failure | Mark failed once; do not retry blindly. |
| Retryable attempts exhausted | Mark `dead_lettered`; retain evidence and surface explicit failure. |
| Domain outcome succeeds but public terminal update fails | Reconcile from idempotent domain outcome; do not repeat the effect. |
| Required audit/business evidence fails | Do not claim terminal success. |

### 16. Observability, Audit, and Security

Structured logs include Job ID, Attempt ID, job type/version, workload class,
correlation ID, trace ID, dispatch sequence, state transition, retry class, and
sanitized error code. They exclude prompts, documents, raw provider events,
credentials, secret references, and full generated output.

Durable error evidence uses a stable uppercase code and an immutable,
JSON-compatible metadata snapshot. Generic boundary limits cover encoded size,
nesting, entry count, string length, finite numbers, and sensitive-content key
rejection. Each registered Job type additionally declares the metadata schema
allowed for each terminal error code; unknown keys or codes fail before the
Attempt is terminalized. Unexpected handler failures accept only bounded
handler/correlation identifiers, never exception representations or provider
bodies.

Every strict definition and execution registration includes the common
`BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH`,
`BACKGROUND_JOB_RESULT_CONTRACT_MISMATCH`, `BACKGROUND_JOB_WORKER_LOST`, and
`BACKGROUND_JOB_HANDLER_UNEXPECTED` codes. The first three permit no metadata;
the unexpected-handler code permits only bounded `handler` and `correlationId`
fields. A Job type then adds its complete domain and target-resolution error
contracts explicitly.

Required bounded-cardinality metrics:

- outbox pending count and oldest pending age by workload;
- dispatch latency and dispatch retry/dead-letter count;
- queue-to-start latency;
- running count, execution duration, and terminal count by type/workload/status;
- retry count and backoff delay;
- lease expiry, stale-fence rejection, and heartbeat lag;
- cancellation request-to-acknowledgement latency;
- scheduler tick health, due-row claim count, and fan-out count;
- worker health, graceful-shutdown drain state, and per-class capacity.

Workspace IDs, Job IDs, provider event IDs, and error messages are not metric
labels. Trace context propagates API -> Job -> dispatch -> Attempt -> domain
command without turning trace IDs into authority.

Required audit events cover user/system Job creation, cancellation request and
acknowledgement, manual retry, dead-letter, privileged replay, and terminal
business outcome where the owning domain requires it.

Security contracts:

- broker and outbox payloads contain no secrets or content bodies;
- secret/provider credentials resolve at execution from approved server-side
  references and current Connector state;
- every public target and result reference is schema-validated;
- workers revalidate target ownership, authority, permissions, entitlements,
  and tenant readiness;
- untrusted Knowledge, Skill, Connector, model, and generated-source input keeps
  the owning domain's prompt-injection and ingest controls;
- worker identities use least-privilege infrastructure credentials;
- browser/render workers have an explicit egress and sandbox policy;
- result and error retention follows the registered Job type policy;
- terminal evidence is retained long enough to satisfy domain audit and replay
  contracts, then purged by an explicit maintenance Job.

### 17. Migration and Hard Cut

Migration order is mandatory:

1. Add public Tortoise models for Job, Attempt, and DispatchOutbox.
2. Generate migrations only with the repository migration script; inspect the
   generated output and apply it through the repository upgrade script. Never
   hand-write or hand-repair migration artifacts.
3. Implement state/repository/service/registry tests before migrating callers.
4. Ratify the RedisStreamBroker topology ADR using the locked Taskiq packages.
5. Deploy dispatcher, workload workers, scheduler leader, and health checks.
6. Freeze old publish-job and best-effort enqueue mutation paths.
7. Drain active old workers; no running legacy Job is guessed into a new lease.
   The thumbnail Provider Effect migration is an atomic worker-fleet hard cut:
   quiesce and drain every worker that can write or recover
   `provider_references` before starting normalized-ledger workers. A mixed
   old/new thumbnail fleet is unsupported, and no dual-read or dual-write bridge
   may be introduced to make it appear compatible.
8. Backfill legacy `PublishJobRecord` rows:
   - `pending` -> `pending_dispatch` with a deduplicated outbox/future due time;
   - `completed` -> `succeeded`;
   - `failed` -> `failed` with sanitized migrated evidence;
   - `cancelled` -> `cancelled`;
   - any stranded `running` row is explicitly quarantined and reconciled from
     its release/domain outcome before cutover.
9. Migrate thumbnail and other direct enqueue callers to
   `BackgroundJobService.create_job()`.
10. Replace scheduled-publish `.all()` plus inline execution with bounded claim
    and publish Job fan-out.
11. Verify counts, idempotency fingerprints, tenant targets, terminal outcomes,
    schedule replay, and authorization fixtures.
12. Switch `/system/jobs`, owning-domain responses, OpenAPI, and generated
    clients together.
13. Remove `try_enqueue_task`, cache-based enqueue dedupe, legacy scanner
    execution, old `PublishJobRecord`, and obsolete single-queue settings only
    after parity evidence passes.

There is no permanent dual write. Rollback is allowed before destructive
cleanup; after cleanup, recovery is forward repair from retained migration and
domain-outcome evidence.

### 18. Tests and Quality Gates

#### 18.1 Unit and contract tests

- every allowed and forbidden state transition;
- internal-to-public state projection;
- idempotency match/conflict and canonical request fingerprint;
- Job type registry uniqueness, startup failure, and workload ownership;
- target descriptor validation and tenant-resolution mismatch;
- retry classification, provider `Retry-After`, backoff, jitter, and exhaustion;
- cancellation idempotency and terminal behavior;
- progress/result/error schema and redaction;
- Provider Effect registry rejection for unknown versions, cross-contract
  manifests, non-canonical persisted evidence, and invalid settlements;
- thumbnail v1 strict manifest identity, exact Job-owned output keys,
  Attempt/Effect-row-independent `outputIdentity`, and independent deterministic
  COMMITTED/CLEANED terminal references;
- strict route canonicalization, provider variants, secret exclusion, and
  persisted revision/hash drift;
- message envelope proves prompts, documents, secrets, and binary data cannot be
  serialized.

#### 18.2 Repository and concurrency tests

- concurrent create with the same idempotency key produces one Job/outbox;
- Job and outbox rollback together on transaction failure;
- bounded `SKIP LOCKED` dispatch claims do not overlap;
- dispatcher crash after broker acceptance permits duplicate delivery without
  duplicate domain effects;
- one active Attempt per Job;
- heartbeat extends the correct lease;
- expired lease is reclaimed once;
- stale fencing token cannot write progress or terminal state;
- Provider Effect exact registration replay and terminal settlement replay;
- all-disposition and ACTIVE-only Provider Effect listing in stable order,
  including cancellation reconciliation and second-checkpoint lease expiry
  while waiting for a real Effect row lock;
- exact full-binding resolution for retained Profiles, with current credential
  rotation, no revision/default fallback, and persisted corruption rejection;
- typed missing/inactive/tombstoned/stale new-registration conflicts with
  structured non-sensitive fields, while replay and persisted corruption stay
  invariant failures;
- registration-first/tombstone-first/update-first Profile lock races on
  distinct PostgreSQL backends;
- concurrent COMMITTED/CLEANED settlement permits exactly one winner;
- manual retry creates a new linked Job and leaves the source terminal.

#### 18.3 Integration tests

- real Redis/Valkey plus locked Taskiq packages for publish, consume,
  acknowledgement, worker crash, redelivery, and graceful shutdown;
- one integration case per workload broker selected by the ADR;
- API auth, CSRF, `PublicUUID`, envelopes, pagination, permissions, and stable
  errors;
- cross-workspace/project Job IDs return not-found and never resolve tenant
  content;
- worker resolves current tenant registry context and rejects stale serialized
  routing data;
- Redis outage after DB acceptance leaves a recoverable outbox and no inline
  work;
- disabled/unready subsystem returns `BACKGROUND_JOBS_UNAVAILABLE` without
  creating state;
- cancellation reaches a real multi-step handler and releases its domain
  reservation before terminal state;
- scheduler replicas claim bounded due rows and fan out one Job per release;
- scheduled publish no longer executes release activation in the scanner;
- domain outcome/public terminal reconciliation does not duplicate the effect;
- thumbnail marker-first convergence proves matching-marker COMMITTED settlement
  without cleanup, marker-absent exact historical-route CLEANED settlement, and
  fail-closed handling of a COMMITTED Effect without its canonical marker;
- two real `asset-cpu` worker process generations are killed after ACTIVE
  registration and local object writes; pending delivery recovery, lease expiry,
  retry progress reset, exhaustion/dead-lettering, bounded maintenance fan-out,
  exact cleanup, and CLEANED settlement must converge without seeded Effects;
- real PostgreSQL environment-profile materialization converges on one Profile
  and Route Revision while credentials continue to come from current Settings;
- a real `0014 -> 0016` upgrade preserves legacy Storage Profile values,
  backfills `config_source`, and proves RESTRICT FKs, unique constraints, and
  required indexes;
- migration fixtures cover every legacy status and stranded-running evidence.

Tests may inject clocks, random sources, repositories, and failing transports
to exercise errors. Production code must not contain mock-success, simulated
provider results, silent exception swallowing, or inline fallback paths.

#### 18.4 Required commands

- Narrow backend test nodes run through
  `pnpm -C apps/api uv -- pytest ...` with the required hard 60-second timeout.
- Migration implementation uses:
  - `pnpm --filter @arclayer/api db:migrate`
  - `pnpm --filter @arclayer/api db:upgrade`
- OpenAPI changes use the repository OpenAPI synchronization scripts.
- Full backend gate: `pnpm api:check`.
- Review-sensitive implementation waves:
  `pnpm code-review-engine --scope changed --base HEAD --format json`.

### 19. Wrong vs Correct

#### Wrong: broker call is the only record and failure falls back inline

```python
if not await try_enqueue_task(task, payload):
    await run_expensive_work(payload)
return {"status": "ok"}
```

#### Correct: durable acceptance precedes asynchronous dispatch

```python
@router.post(
    "/projects/{project_id}/preview-artifacts",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ResponseModel[BackgroundJobOut],
)
async def create_preview_artifact(...):
    job = await background_jobs.create_job(
        definition=job_registry.require("site.thumbnail.capture", version=1),
        target=target,
        input_reference=input_reference,
        idempotency_key=idempotency_key,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=BackgroundJobOut.from_record(job))
```

`create_job()` transactionally persists the Job and outbox. The dispatcher and
worker expose real failures; neither the request path nor transport fabricates
success.

#### Wrong: worker trusts serialized schema routing

```python
tenant_db = TenantDatabase(payload["schemaName"])
```

#### Correct: worker resolves current canonical tenancy

```python
job = await jobs.require_for_dispatch(envelope.job_id)
target = await target_resolver.resolve_and_validate(job.target_descriptor)
with bind_tenant_context(target.tenant_context.with_scope(TenantScope.JOB)):
    await executor.execute(job=job, target=target)
```

Transport delivers an execution request. Durable Job state, canonical tenancy,
and the owning domain determine whether and how work executes.
