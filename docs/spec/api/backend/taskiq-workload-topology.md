# Taskiq Workload Topology ADR

**Status:** Accepted and implemented for the `asset-cpu`, normalized `agent-io`,
Knowledge `connector`, and bounded `maintenance` Provider Effect recovery
verticals;
production enablement remains blocked by the deployment gates in section 11.
**Decision date:** 2026-07-15
**Scope:** Taskiq workload routing, worker isolation, registration, delivery,
acknowledgement, redelivery, scheduling, and shutdown.
**Canonical parent:** `docs/spec/api/backend/background-jobs.md`.

## 1. Context

Arclayer requires six durable background-workload classes:

- `agent-io`
- `render-browser`
- `asset-cpu`
- `publish`
- `connector`
- `maintenance`.

The pre-ADR baseline constructed one `RedisStreamBroker` with one `queue_name`,
registered every task on that broker, and started one worker command plus one
`TaskiqScheduler`. The durable Job contract requires explicit resource
isolation and at-least-once dispatch, but it intentionally made the physical
Redis Stream layout conditional on a locked-version evidence spike.

This ADR closes the library-level topology decision for the currently locked
stack. It does not claim that process signals, container termination grace,
rolling deployment compatibility, or production capacity are proven by an
in-process integration test.

## 2. Evidence Environment

Evidence was collected from the live repository and a real local Valkey
instance using:

- Python `3.12.12`;
- Taskiq `0.12.1` from `apps/api/uv.lock`;
- taskiq-redis `1.2.2` from `apps/api/uv.lock`;
- Valkey server `8.0.6` (`server_name=valkey`);
- `RedisStreamBroker`, Taskiq `Receiver`, Redis Streams consumer groups,
  `XPENDING`, `XACK`, and `XAUTOCLAIM`;
- the real integration Valkey database selected by the repository test
  settings.

Reproducible evidence lives in:

`apps/api/tests/platform/jobs/test_taskiq_workload_topology_integration.py`

Verification command:

```bash
RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 \
  pnpm -C apps/api uv -- pytest -vv \
  tests/platform/jobs/test_taskiq_workload_topology_integration.py --no-cov
```

The accepted run used an external 60-second diagnostic budget, collected five
tests, and passed `5/5` in `0.60s`. That elapsed budget is an observation from
the evidence run, not a hard test contract; reruns may be extended to expose
their real result when integration infrastructure needs more time.

## 3. Proven Findings

| Question | Reproducible finding | Proof boundary |
|---|---|---|
| Can one process construct multiple brokers against one Valkey DB? | Yes. Independent `RedisStreamBroker` instances with different `queue_name` values started and published successfully. | Proven with two real streams and consumer groups. |
| Does a broker worker consume only its configured stream? | Yes, when `additional_streams` is empty. The agent Receiver consumed the agent stream while the render message remained untouched; the render Receiver then consumed only render. | Proven through the locked Taskiq `Receiver`, which is the worker core used by the CLI. |
| Can producers select a workload deterministically? | Yes. A typed `JobWorkloadClass -> decorated task/broker` map routed one message to each expected stream. | Proven through real `kiq()` calls and Redis `XLEN`. |
| Does Taskiq reject duplicate task names? | No. Registering the same name twice on one broker silently replaced the first local task. Separate brokers retained independent local tasks with the same name. | Proven through locked public registration APIs. |
| Can a caller override the physical stream with a label? | Yes. `task.kicker().with_labels(queue_name=...)` caused `RedisStreamBroker.kick()` to write to that stream. | Proven against real Valkey. |
| Is free-form stream override safe? | No. A task registered only on the agent broker was sent to the render stream; the render Receiver could not resolve it and left the message pending. | Proven with real Receiver plus `XPENDING`. |
| Is acknowledgement supported? | Yes. After Receiver execution, the normal message had no pending entry. Explicit `AckableMessage.ack()` also removed the pending entry. | Proven with Redis consumer-group state. |
| Does locked `when_saved` preserve a handler error for redelivery? | No. Taskiq converts the exception into an error result, saves it, and still invokes `AckableMessage.ack()`. A database failure before Attempt creation would therefore strand the queued Job without an application ACK gate. | Proven with the ordinary locked Receiver and real `XPENDING` state. |
| Can Arclayer gate that final ACK without replacing Redis Stream consumption? | Yes. `DurableRedisStreamBroker` wraps only `AckableMessage.ack()`, while `DurableAckReceiver` opens an isolated default-`DEFER` callback scope. A validated executor outcome explicitly changes only that callback to `ACK`; pre-claim errors remain pending. | Proven with real success, error, and concurrent mixed-decision deliveries. |
| Is an unacknowledged message redelivered? | Yes. After the first consumer closed without ack, a second consumer in the same group received the identical Task ID through `XAUTOCLAIM` once `idle_timeout` elapsed. | Proven on real Valkey; this establishes at-least-once, not exactly-once. |
| What does broker shutdown prove? | `RedisStreamBroker.shutdown()` completes and disconnects its Redis pool. Taskiq Receiver stops intake from a finish event and waits for the running task up to `wait_tasks_timeout`. | Proven at library level; OS-signal and orchestrator behavior remain deployment gates. |

Locked source inspection additionally confirms:

- `listen()` reads `self.queue_name` plus explicit `additional_streams` only;
- `kick()` writes to the message label `queue_name` when present, otherwise to
  `self.queue_name`;
- consumer groups acknowledge with `XACK`;
- pending recovery uses `XAUTOCLAIM(min_idle_time=idle_timeout)`;
- `unacknowledged_lock_timeout=None` can leave the autoclaim lock without an
  automatic release;
- the worker CLI default acknowledgement mode is `when_saved`;
- the worker CLI exposes `shutdown_timeout`, `wait_tasks_timeout`, concurrency,
  prefetch, and process-pool controls.

## 4. Accepted Physical Topology

The accepted baseline is one explicit broker/Redis Stream and one independently
deployable worker pool per canonical `JobWorkloadClass`.

```text
JobDispatchOutbox
       |
       v
JobTransportDispatcher
       |
       +-- agent-io ------> Redis stream ------> agent worker pool
       +-- render-browser -> Redis stream ------> browser worker pool
       +-- asset-cpu -----> Redis stream ------> CPU worker pool
       +-- publish --------> Redis stream ------> publish worker pool
       +-- connector ------> Redis stream ------> connector worker pool
       +-- maintenance ----> Redis stream ------> maintenance worker pool
```

All brokers may use the same Valkey deployment and logical database. Isolation
comes from different stream names, different broker instances, and worker
processes that listen to one stream only.

Required naming is derived from typed configuration:

```text
stream:         {TASKIQ_STREAM_PREFIX}:{workload.value}
consumer group: {TASKIQ_CONSUMER_GROUP_PREFIX}:{workload.value}
consumer name:  {deployment-or-host}:{process-or-pod-identity}
```

The exact prefixes are environment configuration, not user input. Workload
values are the canonical `JobWorkloadClass` values from the durable Job spec.
The implementation and evidence tests import that same canonical symbol; the
transitional `BackgroundJobWorkload` alias is not retained.

Baseline worker brokers set:

- one primary `queue_name`;
- no `additional_streams`;
- `mkstream=True`;
- `consumer_id="0-0"` so a newly created group can consume messages already
  present in its stream;
- a non-null `unacknowledged_lock_timeout`;
- a unique consumer name inside the workload consumer group.

`xread_block`, `xread_count`, `max_prefetch`, concurrency, `idle_timeout`, and
autoclaim batch sizes remain per-workload capacity settings subject to section
11. They are not copied from the small values used to make the integration
test fast.

## 5. Producer Selection

Only the outbox dispatcher publishes durable Job messages. Request handlers and
domain services persist `BackgroundJobRecord + JobDispatchOutboxRecord` and do
not call Taskiq directly.

The dispatcher owns a startup-validated producer registry:

```text
JobWorkloadClass
  -> exact RedisStreamBroker
  -> exact registered task name/version
```

For every outbox row, the dispatcher verifies:

- `BackgroundJobRecord.workload == JobDispatchOutboxRecord.workload`;
- the task name is registered for that exact workload broker;
- the task's major version matches the durable Job definition;
- the dispatch envelope matches the durable Job and outbox hash.

Domain callers cannot pass a physical stream, consumer group, arbitrary broker,
or `queue_name` label. Production dispatch must not call
`kicker().with_labels(queue_name=...)` or `kicker().with_broker(...)` from an
unvalidated Job request. The real misrouting test proves that a wrong stream
plus missing target registration becomes a permanently pending poison message.

## 6. Task Registration and Versioning

Taskiq local registries do not enforce uniqueness. Arclayer therefore owns a
fail-fast global manifest for all Job task definitions.

Each manifest entry binds:

- stable Job type and major version;
- stable Taskiq task name;
- exactly one `JobWorkloadClass`;
- exact broker key/stream key;
- dispatch-envelope schema version;
- handler import and registered Job definition.

Task names remain versioned and workload-qualified, consistent with the
durable Job contract:

```text
jobs:{workload}:{job-type}:v{major}
```

Startup fails on:

- duplicate Taskiq names anywhere in the Arclayer manifest;
- one Job type/version assigned to multiple workloads;
- a local Taskiq registry entry that differs from the manifest;
- a producer definition without a target worker registration;
- a worker task without a producer definition;
- unknown envelope or handler versions.

Rolling deployments publish a new task version only after the matching worker
version is ready. An old handler is not removed until no pending outbox, stream,
or consumer-group entry references it. Taskiq's silent overwrite behavior is
never used as an upgrade mechanism.

That rolling-version rule does not make a storage-ownership hard cut backward
compatible. The thumbnail move from Attempt `provider_references` to normalized
Provider Effects requires an atomic fleet cutover: quiesce and drain every old
thumbnail worker before starting the normalized-ledger fleet. Running old and
new thumbnail workers together is unsupported, and no dual-read or dual-write
bridge may be added to disguise the contract mismatch.

## 7. Worker Consumption, Acknowledgement, and Redelivery

Each worker command imports exactly one workload broker and its workload task
module. `additional_streams` is empty in the accepted baseline, so the worker
cannot drain a different workload accidentally.

The baseline explicitly configures `--ack-type when_saved`, but does not use the
locked Receiver's acknowledgement decision directly. Locked Taskiq converts a
handler exception into an error result and still invokes `AckableMessage.ack()`
after result saving. That behavior is unsafe when delivery acceptance fails
before an Attempt exists: the Job remains queued, no lease reaper can recover
it, and the transport message would otherwise be removed from `XPENDING`.

Every durable worker therefore uses `DurableRedisStreamBroker` plus
`DurableAckReceiver`. The broker preserves the locked stream read,
consumer-group, and `XAUTOCLAIM` implementation but wraps the final
`AckableMessage.ack()`. Each Receiver callback begins in an isolated
default-`DEFER` `ContextVar` scope. The async Taskiq wrapper may authorize ACK
only after `DurableJobExecutor` returns a validated, identity-bound
`DurableJobExecutionOutcome`. An exception, invalid envelope, untyped executor
return, ambiguous terminal projection, or pre-claim database failure leaves the
delivery pending. Taskiq result storage remains diagnostic and non-canonical.

Durable wrappers are async-only. Registration rejects a synchronous handler
before touching Taskiq's local registry because its thread context cannot carry
the callback-scoped ACK decision back to the Receiver. `Context.requeue()` is
not a recovery substitute: it publishes another message and acknowledges the
original, which would create a hot duplicate loop during a database outage.

Consequences:

- worker termination before ack leaves a pending stream entry;
- after `idle_timeout`, another consumer in the same group may receive the same
  Task ID through `XAUTOCLAIM`;
- every Job effect remains idempotent and protected by the application Attempt
  lease/fencing token;
- acknowledgement removes the pending consumer-group entry but does not delete
  the immutable stream entry immediately;
- delivery is at-least-once and must never be described as exactly-once.

The workload `idle_timeout` must exceed the workload's supported in-flight
execution window plus shutdown grace, or repeated autoclaim can occur while a
healthy worker is still executing. The Job lease/fencing contract still blocks
stale terminal writes, but it does not justify avoidable transport churn. The
numeric values require the capacity gate in section 11.

An unknown task is not acknowledged by the locked Receiver path and remains
pending. Unknown-task count and oldest pending age are deployment alerts. The
registration/version rollout gates must prevent this state; remediation cannot
silently discard the message or claim its Job succeeded.

## 8. Scheduler Topology

There is one effective Taskiq scheduler leader bound to the `maintenance`
broker. Each replica wraps its `LabelScheduleSource(maintenance_broker)` in a
Valkey-backed leader source. A token-owned lease is acquired or atomically
renewed before schedules are exposed and again immediately before a ready task
is published. A follower exposes no schedules; a stale former leader raises
Taskiq's explicit scheduled-task cancellation instead of publishing.

Recurring entries are control-plane scan ticks only. They:

1. claim a bounded page of due domain rows;
2. transactionally create one durable Job/outbox per due target;
3. return without executing the target operation.

The outbox dispatcher then routes each created Job to its owning workload
broker. For example, the scheduled-release scan runs as maintenance control
work and creates `publish` Jobs; it does not activate releases inside the
scheduler/scanner process.

This keeps one scheduler leader and avoids one scheduler per workload. The
lease duration is explicit deployment configuration, Valkey failure is exposed,
and compare-and-delete shutdown never releases another replica's token. Real
Valkey evidence starts two candidates, proves exactly one effective schedule,
lets the lease expire without a graceful release, promotes the follower, and
proves the stale candidate is fenced at `pre_send`.

The current Wave 0 scheduler registers the bounded Provider Effect orphan scan
as a maintenance control task. The deleted legacy Taskiq cron tasks were not
reintroduced. Usage aggregation, retention, scheduled publish, and lease-reaper
automation are therefore still not running. Future ticks must be explicit
bounded control tasks that create or replay durable Jobs/outboxes; they must
not call legacy business functions inline.

## 9. Shutdown Contract and Proven Boundary

The locked Receiver API proves that a finish event stops new intake and waits
for active tasks up to `wait_tasks_timeout`. The broker shutdown path then runs
lifecycle handlers and disconnects its Redis connection pool.

Every worker deployment must explicitly configure:

- Taskiq `shutdown_timeout`;
- Taskiq `wait_tasks_timeout`;
- orchestrator termination grace longer than both Taskiq budgets plus expected
  process cleanup;
- readiness removal before the termination signal;
- a unique consumer identity on replacement processes.

If the wait budget expires, the Job remains protected by its durable Attempt
lease and Redis pending-message recovery. Shutdown does not mark the Job
successful or cancelled by itself.

The integration test does not prove UNIX signal forwarding, child-process
coordination, browser teardown, process-pool termination, or Kubernetes/Docker
grace-period ordering. Those remain explicit gates.

Current process smoke evidence is narrower but concrete. All six real
worker command roots started against PostgreSQL and Valkey with isolated
streams. The built-in registry currently yields these exact task slices:

| Workload root | Registered workload tasks |
|---|---|
| `asset-cpu` | `jobs:asset-cpu:asset-thumbnail-generate:v1` |
| `agent-io` | `jobs:agent-io:agent-run-execute:v1`; `jobs:agent-io:knowledge-source-index:v1` |
| `render-browser` | none |
| `publish` | none |
| `connector` | `jobs:connector:knowledge-source-ingest:v1` |
| `maintenance` | `jobs:maintenance:provider-effect-orphan-reconcile:v1`; control task `jobs:maintenance:provider-effect-orphan-scan:v1` |

An empty slice is intentional startup evidence, not an implemented business
workload. The launcher also passes `--max-fails 1`. With locked Taskiq
`0.12.1`, the parent exits non-zero after the first abnormal child exit instead
of silently restarting a configuration failure; a database-disabled worker
smoke produced that fail-fast outcome. This does not replace the running-Job
termination and pending-recovery gate.

The `connector` Knowledge task owns manual processing and untrusted public-URL
`initial | refresh` ingestion. URL bytes are fetched only inside this worker;
HTTP request handlers persist source/Job/outbox facts and return `202`. The
worker transport resolves and validates every redirect target, connects to a
validated public IP without a second DNS lookup, and applies bounded redirect,
compressed-byte, and decoded-byte policies. No external content body or secret
is carried through Taskiq arguments. File, Connector-installation, and
structured-content readers are not registered by this task yet.

Worker startup and shutdown may execute in different asyncio Tasks. The ORM
lifecycle therefore exits Tortoise's initializer-local ContextVar in the
creating Task, retains only the supported global fallback, and tracks exact
nested ownership. Only the final matching close resets model apps while the
fallback is still present, then closes connections. Same-configuration nesting
is reference-counted, different-configuration nesting and foreign lifecycle
ownership fail explicitly, and shutdown errors are not downgraded to warnings.
Cross-Task and nested-ownership tests pass, and the real idle worker smokes no
longer emit the former context-token reset warning.

Main-process SIGTERM smokes for the idle `connector` and `maintenance` roots
now reach Taskiq intake stop, broker shutdown, the application shutdown hook,
ORM close, and exit code `0`. Their final `Durable Job worker stopped` record is
present in both the terminal and `app.log`. The earlier intermittent missing
record was an asynchronous `QueueListener` teardown race; the shutdown hook now
drains queued records and switches remaining teardown logging to synchronous
handlers before returning. This proves those idle process roots and the final
application hook. It still does not prove an in-flight Job, child-process
signal forwarding, readiness ordering, or orchestrator grace-period budgets.

## 10. Accepted and Rejected Decisions

### Accepted

| Decision | Reason |
|---|---|
| One broker/stream/worker pool per workload | Real selective-consumption evidence passed and provides resource isolation. |
| One Valkey deployment may host all streams | Separate stream and consumer-group state worked against the same real server/DB. |
| Dispatcher-owned typed producer registry | Prevents request/domain code from choosing infrastructure routes. |
| Arclayer-wide fail-fast task manifest | Locked Taskiq silently overwrites local duplicate names. |
| Workload-qualified versioned task names | Supports safe producer/worker compatibility checks and rolling versions. |
| `consumer_id="0-0"` for new groups | Avoids skipping messages that predate first group creation. |
| Non-null autoclaim lock timeout | Avoids an indefinitely held pending-recovery lock after failure. |
| Explicit `when_saved` acknowledgement | Matches locked/default tested Receiver behavior; application Job state remains canonical. |
| Default-DEFER application ACK gate | Locked `when_saved` also acknowledges error results; only a validated durable executor outcome may authorize the wrapped final `XACK`. |
| One maintenance scheduler leader | Preserves one scheduling authority while durable Jobs fan out to resource workers. |
| At-least-once plus Job idempotency/fencing | Real unacked redelivery was observed; exactly-once is not available. |

### Rejected

| Alternative | Rejection reason |
|---|---|
| One broker/stream and one general worker pool | No resource isolation; browser, CPU, model I/O, publish, and maintenance can starve each other. |
| Shared broker with `additional_streams` for every worker | Deliberately makes workers consume multiple workloads and defeats selective pools. |
| Free-form `queue_name` labels from callers | Real test produced a misrouted unknown task that remained pending. |
| Rely on Taskiq to reject duplicate names | Locked registration silently overwrites the previous local task. |
| Use `with_broker()` as ad hoc workload routing | Does not prove the target worker registered the task and bypasses the durable manifest. |
| Ack when received | A worker crash after receipt could remove transport recovery before durable execution. |
| Ordinary locked `when_saved` without the ACK gate | Handler errors are saved as Taskiq results and still acknowledged, so a pre-claim database failure can strand a queued Job. |
| `Context.requeue()` on durable execution failure | It copies the message and acknowledges the original, causing outage-time duplicate churn instead of preserving one pending delivery. |
| Describe Redis delivery as exactly-once | `XAUTOCLAIM` deliberately redelivered the same Task ID. |
| Execute due releases in the scheduler scanner | Violates bounded fan-out and resource ownership. |
| Treat successful broker shutdown as proof of deployment grace | Library shutdown does not prove OS signals or orchestrator timing. |

## 11. Remaining Production Deployment Gates

The topology is accepted, but production Job creation must remain disabled
until all gates below have recorded evidence.

1. **Process-level worker smoke test**
   - All six real worker command roots now start with their production task
     modules. `asset-cpu`, `agent-io`, `connector`, and `maintenance` have real
     executable manifest entries; `render-browser` and `publish` remain empty.
   - Publish one durable envelope per workload.
   - Prove only the owning process executes it and every task manifest entry is
     discoverable.
   - This gate remains open; empty workloads must gain real registered Jobs and
     may not use fake envelopes to manufacture evidence.
2. **Signal and shutdown test**
   - Send the actual deployment termination signal during a running Job.
   - Prove readiness removal, intake stop, wait budget, broker shutdown,
     pending recovery, and Attempt lease behavior.
   - `connector` and `maintenance` main-PID idle SIGTERM now reach the final
     application hook and exit `0`; that idle evidence and fail-fast startup do
     not satisfy this running-Job gate.
3. **Rolling-version compatibility test**
   - For backward-compatible task versions, deploy new workers before enabling
     the new task version.
   - Prove old messages drain before old handlers are removed.
   - Prove unknown-task pending alerts fire on an intentional mismatch.
   - For the non-compatible thumbnail ownership hard cut, prove the old fleet is
     quiesced and drained before any normalized-ledger worker starts; do not use
     a mixed fleet as rolling-deployment evidence.
4. **Capacity and starvation test**
   - Measure per-workload concurrency, prefetch, queue-to-start latency, memory,
     CPU, browser capacity, and connection-pool use.
   - Select `xread_count`, `xread_block`, worker count, and prefetch from this
     evidence.
5. **Idle/autoclaim timing test**
   - Select `idle_timeout` above the supported in-flight window plus shutdown
     grace for each workload.
   - Prove a healthy long task is not repeatedly autoclaimed and a killed task
     is recovered within the product SLO.
6. **Autoclaim lock failure test**
   - Kill a consumer while it owns the autoclaim lock.
   - Prove the configured non-null lock timeout permits another consumer to
     resume pending recovery.
7. **Valkey outage/recovery test**
   - Stop Valkey after Job/outbox commit and during publish/consume separately.
   - Prove outbox retry, no request-path inline fallback, and no fabricated Job
     success.
8. **Scheduler leader test**
   - Start competing scheduler candidates or the selected leader-election
     mechanism.
   - Completed for leader authority: real Valkey candidates prove one effective
     schedule source, expiry failover without graceful release, and stale
     `pre_send` fencing.
   - Bounded due-row claims and one idempotent Job per target are proven for the
     Provider Effect orphan scanner; scheduled release fan-out remains open.
9. **Poison-message operational path**
   - Provide visible diagnostics for unknown task/version and invalid envelope.
   - Define authorized quarantine/replay after the corresponding Job state is
     reconciled; never raw-delete and claim success.
10. **Metrics and alerts**
    - Prove per-workload stream depth, pending count, oldest pending age,
      dispatch age, consumer lag, autoclaim count, unknown-task count, and
      shutdown timing are observable with bounded-cardinality labels.
11. **Provider-effect orphan recovery**
    - Kill an `asset-cpu` worker after its normalized ACTIVE Effect is durable
      and at least one thumbnail object exists, then exercise pending recovery
      and Attempt lease expiry.
    - Prove a later Attempt performs all-disposition marker-first cleanup through
      the Effect's exact historical Profile/Route Revision and settles CLEANED.
   - Also exhaust retry/dead-letter recovery and prove a bounded maintenance
     reconciler eventually removes the orphan; no manifest is treated as a
     cleanup scheduler by itself.
   - Completed for the local thumbnail vertical: two production worker process
     groups are killed with OS `SIGKILL` after ACTIVE registration and real
     object writes; the test observes one pending stream entry after each kill,
     exercises stale delivery acknowledgement, lease expiry, retry generation,
     exhaustion/dead-lettering, bounded recovery fan-out, and exact CLEANED
     settlement. This does not close S3, Valkey-outage, or orchestrator-signal
     gates.
12. **Storage-profile locator lifecycle**
    - Exercise the thumbnail v1 contract already hard-cut to immutable Route
      Revisions, readable tombstones, and the normalized Provider Effect
      ledger/FKs with their shared Profile lock protocol.
    - Prove credential rotation reuses the current secret with the recorded
      route, while profile delete/migration cannot strand a manifest or redirect
      cleanup to a new bucket, endpoint, or local root.

## 12. Implementation and Hard-Cut Consequences

The first implementation rollout has:

- replaced the single `TaskiqSettings.queue_name` contract with typed stream and
  consumer-group prefixes plus per-workload tuning;
- created a broker factory that yields one immutable broker instance per
  canonical `JobWorkloadClass`;
- given the outbox dispatcher exclusive typed producer selection;
- split worker commands by workload and limited each import root to its exact
  task slice;
- bound the single scheduler construction to maintenance;
- added startup manifest validation and the durable ACK gate;
- registered normalized Agent Run execution and Workspace Knowledge index tasks
  on `agent-io`, plus Workspace Knowledge ingestion on `connector`;
- added the generic append-only Storage Profile route revisions, tombstones,
  and normalized Provider Effect registration/settlement core;
- registered the strict thumbnail
  `asset.thumbnail.objects` / schema `1` / `generated-objects` contract in
  production composition and made its pipeline persist ACTIVE normalized
  evidence before the first provider `put`;
- bound thumbnail output identity to exact Profile/Route Revision, target
  bucket, and logical manifest without secrets, timestamps, or Attempt identity;
- separated existing-source reads, active exact-route output authorization, and
  old-revision cleanup with current credentials, then implemented
  all-disposition marker-first COMMITTED/CLEANED convergence with deterministic
  terminal references;
- retained `JobAttemptRecord.provider_references` only as an inert ORM/database
  column with no runtime read/write or dual-read/dual-write path;
- converged persistence and transport on `JobWorkloadClass`,
  `JobInternalStatus`, `JobAttemptStatus`, and `JobDispatchStatus`;
- kept Taskiq result storage non-canonical and removed the legacy single broker,
  best-effort enqueue, and scheduled-task registration path.

It has not yet:

- added real Job definitions and handlers for `render-browser` or `publish`;
- completed S3 Profile lifecycle/process-loss evidence or Valkey
  outage/recovery evidence;
- proven deployment replicas, resource limits, readiness/health checks,
  shutdown grace, rolling compatibility, or operational queue ownership;
- passed every gate in section 11.

The normalized thumbnail runtime hard cut and bounded maintenance orphan
reconciler are implemented. The stable scheduled control task performs only
bounded `SKIP LOCKED` fan-out; each typed durable recovery Job owns a real
fenced Attempt, exact tenant marker routing, exact historical-route cleanup,
and cross-Job settlement. Concurrent scanner and seeded terminal-orphan Taskiq
tests prove this in-process contract. Real Valkey competing-candidate evidence
also proves scheduler lease exclusivity, expiry failover, and stale-leader
`pre_send` fencing. A separate OS-level integration now starts two production
`asset-cpu` worker generations, kills each process group after ACTIVE evidence
and real local objects are durable, proves pending delivery recovery, lease
expiry, retry exhaustion/dead-lettering, and bounded maintenance cleanup. The
tenant Asset row lock creates only the deterministic pre-marker-commit window;
it does not fabricate Effect, Attempt, Job, ACK, or terminal state. S3,
Valkey-outage, deployment signal/readiness, capacity, and poison-message gates
remain open.

Future Job persistence changes still use generated migrations. No rollout may
restore a best-effort enqueue, general-worker, dynamic-label, or inline
execution fallback merely because a remaining workload is empty.

## 13. ADR Acceptance Criteria

This ADR remains valid for Taskiq `0.12.1` plus taskiq-redis `1.2.2`. Upgrading
either package reopens the evidence spike for registration, routing,
acknowledgement, pending recovery, and shutdown behavior.

The library-level decision is accepted because all five real-Valkey evidence
tests pass. Production enablement is not accepted until section 11 gates pass.
Failure of a gate blocks the relevant worker/API rollout; it does not authorize
a silent single-queue fallback.
