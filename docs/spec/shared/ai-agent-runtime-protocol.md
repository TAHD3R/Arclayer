# AI Agent Runtime Protocol Decision

**Status:** Approved selected protocol. The normalized backend and Admin hard cut are implemented; the complete section 11 browser/worker fault-injection vertical proof remains gated.
**Decision date:** 2026-07-15
**Target protocol:** Arclayer Agent Event Stream v1
**Applies to:** `apps/api`, `apps/admin`, Agent workers, LangGraph checkpoints, generated API clients, and assistant-ui integration.
**Parent contract:** `docs/spec/shared/ai-website-builder-platform.md`.

This ADR selects the first production protocol boundary between Arclayer's durable FastAPI/LangGraph Agent runtime and assistant-ui. It defines public Agent event semantics, durable recovery, the SSE representation, and the browser adapter contract. It does not replace the Agent domain, LangGraph orchestration, or the commercial ledger contracts.

Normative terms such as **must**, **must not**, **required**, and **forbidden** are binding. Implementation status is stated explicitly; an unpassed section 11 gate must not be inferred from protocol approval.

## 1. Decision-date context and verified constraints

The decision is grounded in the repository state on the decision date:

- `apps/api/src/agents/types.py` exposes named run events but its current `AgentRunEvent` contains only `event` and `data`; it has no schema version, event ID, sequence, cursor, timestamp, or thread/run envelope.
- `apps/api/src/modules/projects/agents/repository.py` overwrites a JSON array of events in the run record. It does not provide an append-only event history or a uniqueness constraint for `(run_id, sequence)`.
- `POST /projects/{project_id}/agents/runs/stream` in `apps/api/src/modules/projects/agents/router.py` creates a run and owns its SSE subscription in one request. Its frames contain `event:` and `data:` but no SSE `id:`. Disconnect cancellation currently cancels the run.
- `LangGraphAgentRunExecutor` in `apps/api/src/agents/langgraph_runtime.py` already supports interrupt/resume with `Command(resume=...)`, and production checkpointing can use `AsyncPostgresSaver` through `apps/api/src/agents/checkpointing.py`.
- `apps/admin` currently installs `@assistant-ui/react@0.14.23`. The installed types expose tool-call approval metadata, approval options, nested `ToolCallMessagePart.messages`, `respondToToolApproval`, `defineToolkit`, and `Tools`.
- `AIChatRuntimeProvider` in `apps/admin/src/components/ai/ai-chat-runtime.tsx` currently adapts browser-owned Zustand conversation state with `useExternalStoreRuntime`. The target makes the backend authoritative and limits Zustand to transient UI state.
- The current LLM runtime commits actual usage before yielding its terminal provider chunk. The Agent engine then publishes usage and run completion. This ordering must remain compatible with the Workspace Credits contract.

These bullets preserve the 2026-07-15 baseline that motivated the decision. The
normalized production path and its backend/Admin regression suites have since
been implemented. The deterministic contract oracle is recorded in
`docs/spec/shared/proofs/ai-agent-runtime-protocol-proof-spike-2026-07-15.md`;
the remaining full browser, worker-restart, provider, and fault-injection
vertical is still acceptance-gated in section 11.

## 2. Decision and strict layer boundaries

Arclayer will initially use:

1. FastAPI and LangGraph as the canonical orchestrator and interrupt/resume runtime.
2. normalized backend-owned threads, messages, parts, runs, tool calls, approvals, delegations, and an append-only `AIRunEvent` history as durable authority.
3. **Arclayer Agent Event Stream v1**, a versioned Arclayer domain protocol represented over authenticated HTTP and SSE.
4. an Arclayer browser reducer and assistant-ui runtime adapter that maps backend projections into the installed assistant-ui message and Tool APIs.

The following four concerns are independent contracts:

| Layer | Owns | Does not own |
| --- | --- | --- |
| Domain semantics | Run, message-part, Tool, approval, delegation, ChangeSet, usage, and terminal transition meanings | SSE framing, React state, reconnect transport |
| Durable recovery | append-only history, sequence allocation, snapshots, cursor retention, replay, producer lifetime | assistant-ui rendering and Tool components |
| Wire protocol | HTTP resources, SSE frames, versioned JSON envelopes, cursor exchange | orchestration policy and durable authority |
| Runtime adapter | reduction into assistant-ui threads, messages, tool-call approval metadata, nested messages, and Toolkit renderers | event persistence, owner validation, durable reconnect |

The runtime adapter is not the durable reconnect implementation. A runtime hook may be replaced without changing event storage or replay. Conversely, a reconnecting SSE client is not allowed to become the message source of truth.

```text
authenticated command
        │
        ▼
FastAPI command service ──► durable Run + dispatch ──► LangGraph/worker
        │                                              │
        │                                              ▼
        └──────────────────────────────► normalized state + AIRunEvent
                                                         │
                                      persist before publish
                                                         │
                              ┌──────────────────────────┴──────────────┐
                              ▼                                         ▼
                     consistent snapshot                      replay + live SSE
                              └──────────────────────────┬──────────────┘
                                                         ▼
                                              Arclayer domain reducer
                                                         ▼
                                              assistant-ui adapter/UI
```

HTTP subscriber lifetime must not own producer lifetime. Closing, refreshing, or aborting the event connection detaches that consumer only. Only an explicit authenticated cancel command requests run cancellation.

## 3. Candidate comparison

| Candidate | Fit with FastAPI/LangGraph | assistant-ui mapping | Durable reconnect | Added infrastructure | Decision |
| --- | --- | --- | --- | --- | --- |
| AG-UI runtime/protocol | Semantically promising for events and Agent UI, but no repository fixture currently proves LangGraph interrupts, nested delegations, Credits ordering, owner validation, or replay against this stack | Vendor adapter is attractive | Must still be designed and proved separately; an AG-UI runtime does not by itself establish Arclayer event retention and cursor semantics | likely an additional package and adapter surface | Not selected for the first hard cut; eligible to supersede this ADR only after the same proof gates pass |
| assistant-ui Assistant Transport | Native to assistant-ui's transport/runtime model, but the installed implementation is TypeScript-oriented and no production Python encoder/decoder path is proved here | Direct mapping is attractive | Transport events do not replace Arclayer's append-only history, snapshots, retention, or tenant authorization | a Node relay/sidecar would be required unless a first-class Python path is proved | Rejected for the first hard cut; no Node relay or sidecar will be introduced for this purpose |
| Arclayer versioned custom SSE | Native to current FastAPI boundaries and can map LangGraph interrupts and commercial ordering without changing orchestrators | Requires one maintained reducer/adapter | Explicitly defined by this ADR | no new runtime service | **Selected, subject to section 11** |
| A2A | Intended for interoperating with external Agent systems | Does not solve the internal thread/Tool UI contract | Does not replace internal run recovery | unnecessary protocol surface | Rejected for internal specialist delegation; reserved for future external interoperability |
| Existing create-and-stream POST | Already present | Existing custom frontend can consume it | Disconnect owns cancellation; no cursor, replay, or versioned envelope | none | Rejected and removed at hard cut |

This decision deliberately avoids binding backend domain objects to React or assistant-ui package types. It also avoids a permanent compatibility facade. If AG-UI later passes the same fixture, a superseding ADR may change the wire/runtime mapping while retaining the domain and recovery contracts.

## 4. Public domain event contract

### 4.1 Versioned envelope

Every persisted and published public event uses this discriminated envelope:

```json
{
  "eventVersion": 1,
  "eventId": "evt_public_opaque_id",
  "cursor": "cursor_public_opaque_locator",
  "type": "message.part.delta",
  "runId": "run_public_id",
  "threadId": "thread_public_id",
  "sequence": 42,
  "occurredAt": "2026-07-15T08:30:12.345Z",
  "correlationId": "correlation_public_id",
  "spanId": "span_public_id_or_null",
  "parentSpanId": "parent_span_public_id_or_null",
  "data": {}
}
```

Envelope rules:

1. `eventVersion` versions the envelope and the payload selected by `type`. Version 1 is an integer literal, not a package version.
2. `eventId` is globally unique and immutable. `(runId, sequence)` is also unique.
3. `sequence` starts at `1` and is contiguous and strictly increasing within the public event log of one run. Allocation is serialized in the same transaction as event append so rolled-back writes do not create committed gaps.
4. `cursor` is a stable opaque replay locator for that event. It may encode run and sequence information, but clients must not parse it. It is not a credential or authorization proof.
5. `occurredAt` is an RFC 3339 UTC timestamp assigned by the server when the domain transition is committed. Provider timestamps may appear only as separately named payload fields.
6. `correlationId` follows the initiating request/run across Tools and delegated work. `spanId` and `parentSpanId` are required for Tool and delegation events and otherwise may be `null`.
7. `data` is selected by the exact `type` discriminator. Unknown fields may be retained for forward-compatible logging, but an unknown `eventVersion`, unknown `type`, missing required field, or invalid field type must fail explicitly in the reducer. It must not be ignored as a successful update.
8. Secrets, provider keys, raw Connector responses, internal database IDs, internal checkpoint storage keys, and hidden chain-of-thought are forbidden in the envelope and payload.

An event is persisted before it is eligible for publication. Live delivery is at-least-once; exactly-once effects come from sequence/event deduplication and idempotent domain commands, not from assuming an exactly-once network.

### 4.2 Common payload value objects

The following shapes are normative for event payloads and snapshots.

`PublicErrorV1`:

```json
{
  "code": "stable_machine_code",
  "message": "safe support message",
  "retryable": false,
  "details": {}
}
```

`details` is optional, structured, and sanitized. Raw exception strings and stack traces are forbidden.

`UsageV1` contains only real provider or settled ledger values:

```json
{
  "provider": "provider_id",
  "model": "model_id",
  "inputTokens": 120,
  "outputTokens": 48,
  "totalTokens": 168,
  "providerCost": "0.0042",
  "currency": "USD",
  "credits": "4.2",
  "settlement": "provisional"
}
```

Missing provider values remain absent; they are never estimated for a public usage event. `settlement` is `provisional` on `usage.updated` and `committed` only inside a successfully completed terminal projection. Decimal money and Credits values are JSON strings.

`SettlementV1` records the durable commercial outcome before cancellation or failure becomes terminal:

```json
{
  "outcome": "released",
  "usage": null,
  "creditsCommitted": "0",
  "creditsReleased": "100"
}
```

`outcome` is `committed | released | reconciled`. The optional `usage` is a real `UsageV1`; committed and released Credits values are decimal strings. A cancelled or failed terminal event cannot carry a pending or unknown settlement.

`ApprovalV1`:

```json
{
  "approvalId": "approval_public_id",
  "approvalVersion": 3,
  "toolCallId": "tool_call_public_id",
  "checkpointId": "checkpoint_public_id",
  "status": "pending",
  "requestedAt": "2026-07-15T08:30:12.345Z",
  "expiresAt": "2026-07-15T09:30:12.345Z",
  "policyVersion": "policy_version_public_id",
  "risk": {
    "sideEffectClass": "external_write",
    "summaryKey": "agents.approval.externalWrite.summary",
    "summaryParams": {},
    "previewRef": "preview_public_id_or_null"
  },
  "options": [
    {
      "id": "allow_once",
      "kind": "allow-once",
      "labelKey": "agents.approval.allowOnce",
      "descriptionKey": "agents.approval.allowOnceDescription",
      "grants": [],
      "confirm": false
    }
  ]
}
```

`status` is `pending | approved | rejected | cancelled | expired`. The only standard option kinds in v1 are `allow-once | allow-always | reject-once | reject-always`. Product labels are stable i18n keys plus parameters; the browser adapter localizes them before constructing assistant-ui `ToolApprovalOption` values. An “always” option is only a proposal to create a scoped backend policy. The backend remains authoritative for scope and persistence.

`MessagePartSnapshotV1` is a discriminated union with common fields `partId`, `partIndex`, `type`, and `status`:

- `text`: `text`; public text only, never hidden reasoning.
- `source`: a safe source ID, title, citation locator, and authorized URL when one exists.
- `file`: an authorized Asset/file reference, name, MIME type, and size.
- `image`: an authorized Asset/image reference, MIME type, dimensions when known, and alt text key/value.
- `tool-call`: `toolCallId`, exact `toolName`, validated `args`, canonical `argsText`, optional result/error/artifact references, optional `ApprovalV1`, and optional nested messages.
- `error`: `PublicErrorV1`.

`status` is `running | requires_action | complete | incomplete | failed`. A terminal run never rewrites an incomplete part to complete unless the completion ordering in section 8 succeeded.

A nested message has stable `messageId`, `role`, `agentId`, `createdAt`, `status`, and ordered `MessagePartSnapshotV1` values. It also carries `delegationId`, `parentToolCallId`, and `sourceRunId`. Nested messages are read-only projections; they are not top-level thread entries and are never returned in thread-list pagination.

Message identity is role-dependent. An assistant message has exactly one non-empty `agentId` and no `actorUserId`; a user message has exactly one non-empty `actorUserId` and no `agentId`. The initiating user message is returned by snapshots with `actorUserId`. The backend and assistant-ui adapter must not attribute user-authored content to the lead Agent merely to satisfy a shared message shape. Delegated nested messages are assistant-authored and therefore carry `agentId`.

### 4.3 Event types and payload schemas

The v1 public discriminated union contains the following event types. Fields listed in the payload column are required unless marked optional.

| `type` | Required `data` payload | Semantics |
| --- | --- | --- |
| `run.created` | `run: { status, executionMode, leadAgentId, createdAt }` | First event. The run and initiating user message are durable. |
| `run.queued` | `queuedAt`, optional public `queueClass` | Durable execution has been accepted for dispatch. Queue implementation identifiers are not exposed. |
| `run.started` | `startedAt`, `attemptNumber`, `agentVersionId` | A worker owns the current execution attempt. Retries keep the same run and event sequence. |
| `run.cancel.requested` | `requestedAt`, `requestedByActorId` | An idempotent cancel request is durable; this is not a terminal claim. |
| `message.part.started` | `message: { messageId, role, agentId? | actorUserId?, createdAt, placement }`, `part` shell | Creates one visible part. Identity follows the role-dependent rule above. `placement` is `{ kind: "thread" }` or `{ kind: "delegation", delegationId, parentToolCallId, sourceRunId }`. |
| `message.part.delta` | `messageId`, `partId`, `delta: { kind: "text.append", text }` | Appends text exactly once in event order. v1 deltas are incremental, never cumulative snapshots. Tool argument deltas are not a v1 feature. |
| `message.part.completed` | `messageId`, full canonical `part: MessagePartSnapshotV1` | Finalizes a part and provides an integrity snapshot of its complete public value. |
| `tool.started` | `messageId`, `partId`, `toolCallId`, `toolId`, `toolVersion`, exact `toolName`, validated `args`, canonical `argsText`, `startedAt` | Tool execution began after policy, schema, permission, and approval checks. |
| `tool.progress` | `toolCallId`, `progress: { messageKey, messageParams, current?, total?, unit? }` | Public structured progress only. Percentages or totals are omitted unless measured. Raw worker logs are forbidden. |
| `tool.completed` | `toolCallId`, `completedAt`, sanitized `result` or `resultRef`, optional `artifactRefs` | Tool effects and result persistence succeeded idempotently. |
| `tool.failed` | `toolCallId`, `failedAt`, `error: PublicErrorV1` | Tool execution failed explicitly. It does not imply that the whole run is terminal. |
| `approval.required` | `approval: ApprovalV1`, `messageId`, `partId` | Attaches pending approval metadata to the existing tool-call part. It is not a standalone message part. |
| `approval.resolved` | resolved `approval: ApprovalV1`, `resolvedAt`, `resolvedByActorId` | Records approved, rejected, cancelled, or expired resolution before graph resume or terminal failure. |
| `run.interrupted` | `interruptId`, `checkpointId`, `reason`, optional `approvalId`, optional `toolCallId` | The durable graph checkpoint is waiting for approval or human Tool input. |
| `run.resumed` | `interruptId`, `checkpointId`, `resumedAt`, `resumeKind` | A validated approval decision or human result was accepted and supplied to LangGraph. Raw resume payloads are not public. |
| `delegation.delegated` | `delegationId`, `parentToolCallId`, `childRunId`, `sourceAgentVersionId`, `targetAgentVersionId`, `delegatedAt`, public `objectiveSummary` | A validated specialist child run was created under a delegation Tool call. |
| `delegation.completed` | `delegationId`, `childRunId`, `completedAt`, optional `artifactRefs`, public `summary` | The child run settled successfully and its public nested messages/artifacts are complete. |
| `delegation.failed` | `delegationId`, `childRunId`, `failedAt`, `error: PublicErrorV1` | Delegated work failed; parent policy decides whether the parent can continue. |
| `changeset.proposed` | `changeSetId`, `baseRevisionId`, `previewRef`, `summaryKey`, `summaryParams`, `warnings`, `requiredApprovalIds` | A typed, durable candidate change exists. It does not claim application. |
| `usage.updated` | `usage: UsageV1`, `providerOccurredAt` | Real provider usage changed. It remains provisional and is not proof of Credits settlement. |
| `run.completed` | `completedAt`, `assistantMessageId`, committed `usage: UsageV1`, `finishReason` | Successful terminal event after message completion and Credits commit. |
| `run.cancelled` | `cancelledAt`, `reasonCode`, `incompletePartIds`, `settlement: SettlementV1` | Cancelled terminal event after provider/Tool cleanup and budget reconciliation/release. |
| `run.failed` | `failedAt`, `error: PublicErrorV1`, `incompletePartIds`, `settlement: SettlementV1` | Failed terminal event after cleanup and budget reconciliation/release. |

`approval.required` must be immediately followed by the matching `run.interrupted` event when server approval pauses the graph. Both reference the same run, thread, checkpoint, approval, and Tool call. Human-input Tools use a tool-call `interrupt` projection plus `run.interrupted`; they do not fabricate approval metadata.

For a visible Tool call, `message.part.started` establishes its tool-call part before `tool.started`, `approval.required`, or a human interrupt refers to it. `tool.completed` or `tool.failed` precedes the matching `message.part.completed` when the part reaches a terminal status.

### 4.4 Delegated child events

The normal browser subscribes to the lead run only. A child Agent keeps its own durable `AIRun` and event history, while public child updates are projected idempotently into the parent's event log with the parent's sequence and the delegation span IDs. The projected payload includes `childRunId` or `sourceRunId` for provenance.

This avoids multiplexing unrelated per-run sequences on one SSE connection. A projection records its source event ID so worker retry cannot duplicate the parent event. Parent cancellation propagates to active child runs; the parent cannot emit a terminal event until required child runs and their budget allocations have settled.

## 5. Persistence, snapshot, and replay authority

### 5.1 Append-only event history

The target `AIRunEvent` store is a normalized append-only table, not a JSON array on `AgentRunRecord`. It stores at minimum:

- public `event_id`, `run_id`, `thread_id`, `sequence`, `event_version`, `type`, `cursor`, and `occurred_at`.
- `correlation_id`, public `span_id`, and public `parent_span_id`.
- schema-validated JSON payload and a payload hash used by migration/replay fixtures.
- source event identity for idempotent parent projections where applicable.

Required constraints are unique `event_id`, unique `(run_id, sequence)`, unique `cursor`, and unique source projection identity when present. Sequence allocation, normalized state mutation, and event append occur in one transaction. Publication begins only after commit.

The publisher may redeliver an event after a crash. It must never synthesize an unpersisted “success” event. Retention may delete only a contiguous historical prefix after a consistent snapshot exists and the retention policy permits it; retained events are never edited in place.

### 5.2 Consistent run snapshot

`GET .../runs/{runId}` returns `AgentRunSnapshotV1`:

```json
{
  "snapshotVersion": 1,
  "runId": "run_public_id",
  "threadId": "thread_public_id",
  "thread": {},
  "run": {},
  "messages": [],
  "pendingApprovals": [],
  "delegations": [],
  "changeSets": [],
  "artifactRefs": [],
  "usage": null,
  "error": null,
  "terminal": false,
  "lastSequence": 42,
  "lastCursor": "cursor_public_opaque_locator",
  "minimumReplaySequence": 1,
  "minimumReplayCursor": null
}
```

The snapshot includes all normalized messages and parts owned by the run, pending Tool approvals, read-only nested delegated messages, proposed ChangeSets, public artifact references, usage, sanitized error state, cancellation-request state, and terminal state. Thread history outside the run remains available through the backend-owned thread message API and pagination.

Exact execution context that is not a public message part remains normalized
alongside the Run rather than embedded as mutable JSON. In particular, each
Agent Skill grant is pinned as an ordered `AgentRunSkillSnapshot` row containing
the assignment/version identity, exact installation/package/version/checksum,
validation policy/finding evidence, and context byte count. Workers verify the
complete row set and immutable resource digests before projecting only the lead
Agent's Skill resources into the untrusted system-prompt context. Mentioned
Agent Skill snapshots remain available for later delegation and are not exposed
to the lead prompt.

The snapshot is read at one transactional high-water mark. `lastSequence` and `lastCursor` cover every included remote state mutation and no later event. `minimumReplaySequence` is the first retained event that can be returned. `minimumReplayCursor` is the earliest accepted boundary cursor immediately before that event; it is `null` only while retained history still begins at sequence 1. The client connects with `lastCursor` and requests events after that high-water mark. A checkpoint is exposed only as a public interrupt/checkpoint reference required by a command; database keys and checkpointer internals are never returned.

Snapshot recovery is **replace, then resume**, not an object merge. The reducer replaces all backend-owned run/message/approval/delegation state with the snapshot, retains only unrelated transient UI state such as the unsent composer draft, and then requests events after `lastCursor`.

### 5.3 Cursor expiration

If a valid cursor precedes the retained event prefix, the event endpoint returns HTTP 410 with stable code `EVENT_CURSOR_EXPIRED` before opening SSE. The response carries the latest authorized `AgentRunSnapshotV1` inline so recovery does not depend on a second request succeeding between error handling and reconnect:

```json
{
  "success": false,
  "error": "EVENT_CURSOR_EXPIRED",
  "message": "The retained run event history no longer covers this cursor.",
  "meta": {
    "snapshotUrl": "/api/v1/workspaces/.../ai/runs/...",
    "snapshot": {},
    "minimumReplaySequence": 101,
    "minimumReplayCursor": "opaque_cursor",
    "lastSequence": 180,
    "lastCursor": "opaque_cursor"
  }
}
```

Owner and scope validation occurs before cursor parsing or expiration reporting. An unauthorized caller therefore receives the same not-found result as any other cross-owner lookup and learns no cursor range.

## 6. HTTP and SSE wire protocol

The initial proof and hard cut use the canonical workspace/thread Agent surface from the approved platform contract. Project context is structured Run input and may be `null`; it is not a second route family:

| Method and path | Contract |
| --- | --- |
| `POST /api/v1/workspaces/{workspaceId}/ai/threads/{threadId}/runs` | Idempotently create a durable Plan/Build Run and initiating message; return HTTP 202 with Run identity and recovery links. It never holds open a stream. |
| `GET /api/v1/workspaces/{workspaceId}/ai/runs/{runId}` | Return `AgentRunSnapshotV1`. |
| `GET /api/v1/workspaces/{workspaceId}/ai/runs/{runId}/events` | Replay retained events after a cursor, then tail committed events over SSE. |
| `POST /api/v1/workspaces/{workspaceId}/ai/runs/{runId}/resume` | Resume one validated checkpoint using a recorded Tool response, expected durable sequence, and idempotency key. |
| `POST /api/v1/workspaces/{workspaceId}/ai/runs/{runId}/cancel` | Idempotently request cancellation. |
| `POST /api/v1/workspaces/{workspaceId}/ai/tool-calls/{toolCallId}/responses` | Record a discriminated approval, rejection, modified-input, or human Tool response with optimistic version and idempotency. |

The old generic `/chat`, `/chat/workspace-actions`, and project Agent route families are migration inputs only and are removed together at hard cut. The Run request carries validated `workspaceId`, nullable `projectId`, nullable `siteRevisionId`, `leadAgentId`, `mentionedAgentIds`, and `executionMode`; the browser never selects a different HTTP family based on whether `projectId` is present.

The create response contains:

```json
{
  "protocolVersion": 1,
  "runId": "run_public_id",
  "threadId": "thread_public_id",
  "status": "queued",
  "snapshotUrl": "/api/v1/workspaces/.../ai/runs/...",
  "eventsUrl": "/api/v1/workspaces/.../ai/runs/.../events",
  "lastSequence": 2,
  "lastCursor": "opaque_cursor"
}
```

The create request requires an idempotency key. Repeating the same key in the same validated scope returns the same run and does not duplicate a user message, worker dispatch, reservation, or event.

### 6.1 Cursor input

The event endpoint accepts the replay locator through either:

- query parameter `cursor`, used for the initial browser connection; or
- standard `Last-Event-ID`, used for SSE reconnection.

If both are present and differ, the server returns HTTP 400 `AGENT_RUN_CURSOR_CONFLICT`. If both are equal, they identify the same position. If neither is present, replay begins before sequence 1 only when the retained prefix still starts at sequence 1; otherwise the server returns `EVENT_CURSOR_EXPIRED` with the latest authorized snapshot and requires snapshot replacement before reconnect.

An invalid, foreign-run, or malformed cursor returns HTTP 400 `AGENT_RUN_CURSOR_INVALID` only after the requested run has passed owner validation. A valid cursor causes replay of every retained event with `sequence` greater than the cursor position, followed by live events.

The replay-to-live handoff must be gap-free under concurrent append. Implementations may use a database high-water mark plus notification/polling, but duplicates at the handoff are allowed and must be deduplicated. Missing committed events are forbidden.

### 6.2 SSE representation

Each domain event is represented by one SSE frame:

```text
id: cursor_public_opaque_locator
event: agent.run.event
data: {"eventVersion":1,"eventId":"...","cursor":"...","type":"message.part.delta","runId":"...","threadId":"...","sequence":42,"occurredAt":"...","correlationId":"...","spanId":null,"parentSpanId":null,"data":{...}}

```

Wire rules:

- response `Content-Type` is `text/event-stream`; proxy buffering and response caching are disabled through deployment configuration.
- `id:` is exactly the envelope `cursor`. The SSE event name is always `agent.run.event`; business dispatch uses the JSON `type` discriminator.
- one `data:` value contains the complete one-line JSON envelope. Payload splitting across multiple logical events is forbidden.
- keepalive comments such as `: keepalive` may be sent. They have no `id`, event ID, sequence, or domain meaning.
- the connection closes after replaying or publishing the one terminal run event. Reconnecting after terminal replays any missing terminal event and closes again.
- disconnect and local `AbortController.abort()` detach only that subscriber. They do not call cancel and do not mutate run state.

SSE is the selected representation, not the domain itself. A future wire adapter may represent the same event semantics differently only through a superseding ADR and equivalent proof.

## 7. assistant-ui runtime adapter

### 7.1 Backend authority and reducer

The browser implementation has a framework-independent Arclayer domain reducer in front of assistant-ui. It:

1. validates envelope version, run/thread identity, payload discriminator, sequence, and allowed state transition.
2. ignores an exact duplicate already applied for `(runId, sequence, eventId)`.
3. treats a conflicting duplicate, event ID reuse, or sequence gap as a visible protocol error; it closes the connection and attempts the defined cursor replay, not an invented local state repair.
4. replaces backend-owned state from the consistent snapshot returned with `EVENT_CURSOR_EXPIRED`.
5. publishes the reduced immutable projection to the assistant-ui adapter.

Zustand may hold panel visibility, filters, unsent drafts, and user display preferences. It must not remain the persistence or conflict authority for threads, messages, approvals, Tool results, or run status.

The thread list uses `useRemoteThreadListRuntime` with backend `RemoteThreadListAdapter` semantics for initialization, pagination, switching, rename, archive, unarchive, and delete. The installed `useExternalStoreRuntime`/`ExternalThread` surface may be used as the initial message projection adapter, but its store receives backend snapshots/events and is not durable authority. The exact message projection hook is not a backend contract.

### 7.2 Tool calls, Toolkit, and approval mapping

New backend Tool UI is registered through the current Toolkit surface (`defineToolkit`, render-only external Tool definitions, and `Tools` or its current equivalent). Tool execution remains on the backend. `toolName` is case-sensitive and must exactly match the registered renderer contract.

An unregistered `toolName` renders an explicit unsupported-Tool protocol error card and emits diagnostics. It does not execute anything, hide the call, or claim generic success.

The adapter maps pending `ApprovalV1` to the existing tool-call part:

```json
{
  "type": "tool-call",
  "toolCallId": "tool_call_public_id",
  "toolName": "content.apply_change_set",
  "args": {},
  "argsText": "{}",
  "approval": {
    "id": "approval_public_id",
    "options": []
  }
}
```

Approval is metadata on the Tool call, not a custom message part. A renderer calls `respondToApproval`; the adapter posts a discriminated Tool response with `approvalId`, `approvalVersion`, `approved`, optional `optionId`, optional reason, and an idempotency key to the canonical Tool-response endpoint. The backend validates that the approval is still pending and belongs to the Run, Tool call, checkpoint, user, workspace, nullable project context, Agent policy, current Tool policy, and current permission/entitlement intersection. The adapter then calls the canonical Run-resume endpoint with the returned response ID, checkpoint ID, expected durable sequence, and a separate idempotency key; only that validated resume command supplies `Command(resume=...)` to LangGraph.

Duplicate identical approval commands return the original resolution. A different decision for an already resolved approval fails with `AGENT_APPROVAL_ALREADY_RESOLVED`. A stale `approvalVersion` fails with `AGENT_APPROVAL_VERSION_CONFLICT`. Expired approval fails with `AGENT_APPROVAL_EXPIRED` and produces the appropriate durable resolution/run transition.

Human-choice/input Tools use assistant-ui's Tool result path (`addResult` through the adapter); server authorization approvals use `respondToApproval`. Both are discriminated payloads on the canonical Tool-response resource, but their schemas, validation, stored response kinds, and renderer actions remain distinct and cannot be conflated.

### 7.3 Delegated Agent messages

The `agent.delegate` Tool renderer maps public child messages into the parent tool-call part's `messages` field and renders them through the current nested-message primitive (`MessagePartPrimitive.Messages` or its current equivalent). The nested messages:

- are read-only and remain visually owned by the delegation Tool call.
- retain child Agent identity, public action summaries, sources, Tool calls, artifacts, and errors.
- never create a top-level thread, thread-list item, or independent browser-side run.
- never expose private model reasoning or raw chain-of-thought. Public progress is an explicit text, Tool progress, evidence, or artifact projection.

### 7.4 Cancellation and connection state

The assistant-ui cancel action calls the explicit cancel endpoint. Aborting the local SSE reader is optional connection cleanup after the command and is not the cancellation mechanism. A reconnecting UI shows separate states for `reconnecting`, `cancellation requested`, `interrupted`, and terminal `cancelled`; it must not derive `cancelled` from a closed connection.

## 8. Terminal ordering, Credits, and cancellation

### 8.1 Successful completion

Successful completion follows this exact order:

```text
provider terminal usage received
→ actual usage and cost finalized
→ budget and Workspace Credits commit succeeds atomically
→ terminal assistant part is persisted as complete
→ AIRun is persisted as completed
→ durable run.completed event is appended
→ mapped terminal SSE frame is published
```

The state mutation and terminal event append are atomic. `run.completed` contains a `UsageV1` projection with `settlement: "committed"`. It is the last public event for the run. No message delta, Tool, delegation, usage, approval, or second terminal event may follow it.

Each LLM budget reservation owned by an Agent Run carries a durable nullable Run foreign key assigned before provider execution. A terminal projection locks the Run, reads every owned reservation, and derives `creditsCommitted`, `creditsReleased`, provider cost, and the overall `committed | released | reconciled` outcome from terminal reservation rows plus exact append-only Workspace Credit ledger entries. Client or worker event payloads are consistency claims, not settlement proof. A reserved row, missing reconciliation timestamp, mismatched ledger owner/reference/delta/details, or usage/ledger mismatch aborts the same transaction before the terminal event is inserted.

`usage.updated`, including an update based on a provider's terminal chunk, remains provisional. It never causes the UI to mark the message or run complete.

If Credits commit fails:

- no terminal assistant part is marked complete.
- no `run.completed` event is stored or emitted.
- the reservation is reconciled or released according to the commercial contract.
- the run ends with `run.failed` and stable error `billing_reconciliation_failed` only after that cleanup is durable.
- the streamed assistant content remains visibly incomplete.

### 8.2 Cancellation and failure

Cancellation is cooperative but explicit:

1. the cancel command idempotently records `cancellationRequestedAt` and appends `run.cancel.requested`.
2. the worker observes cancellation before each Tool step, before provider streaming, between provider chunks, at Tool cancellation points, and before any terminal commit.
3. active provider streams and cancellable Tools are stopped; non-cancellable side effects complete or reconcile through their declared idempotency policy.
4. actual usage already incurred is finalized, and every active budget/Credits reservation is committed, reconciled, or released as required.
5. running parts are persisted as incomplete, child runs are settled, and only then is `run.cancelled` appended and published.

Failure uses the same cleanup-before-terminal rule and then appends `run.failed`. Duplicate terminal transitions and ledger effects are idempotent. A terminal run receiving cancel returns its existing terminal snapshot without appending another event or changing ledger state.

## 9. Authorization, privacy, and errors

Every thread, create, snapshot, event, resume, cancel, and Tool-response request must re-resolve the authenticated user, workspace, thread, and Run through canonical dependencies, plus project/site scope when the Run context contains it. Stream cursors, event IDs, thread IDs, Run IDs, approval IDs, checkpoint IDs, response IDs, and Tool call IDs are locators, never bearer capabilities.

Required behavior:

| Condition | Contract |
| --- | --- |
| Run/thread belongs to another user, workspace, or project | 404 `AGENT_RUN_NOT_FOUND`; do not reveal existence or cursor metadata |
| User lacks the route's base project permission | 403 `PERMISSION_DENIED` |
| Cursor sources conflict | 400 `AGENT_RUN_CURSOR_CONFLICT` |
| Cursor is malformed or belongs to another run after owner validation | 400 `AGENT_RUN_CURSOR_INVALID` |
| Cursor is older than retained history | 410 `EVENT_CURSOR_EXPIRED` with the latest authorized snapshot and sanitized recovery metadata |
| Unsupported event version or type reaches the browser | visible protocol failure `AGENT_EVENT_VERSION_UNSUPPORTED` or `AGENT_EVENT_TYPE_UNSUPPORTED`; do not continue as success |
| Sequence is missing, conflicting, or out of order | visible protocol failure `AGENT_EVENT_SEQUENCE_INVALID`; reconnect from the last accepted cursor |
| Approval does not match run/Tool/checkpoint | 400 `AGENT_APPROVAL_CONTRACT_MISMATCH` |
| Approval is no longer pending | 409 stable resolved/expired/version conflict code |
| Human Tool result does not match a pending interrupt | 409 `AGENT_TOOL_RESULT_NOT_PENDING` |
| Cancel targets a terminal run | return current terminal snapshot idempotently |

Tool-response and resume commands recheck current permissions, execution mode, Agent/Tool grants, workspace policy, plan entitlements, Connector state, data-egress policy, approval policy, checkpoint identity, and expected durable sequence at command time. A checkpoint saved under an older policy is not permission to execute after policy revocation.

Public events may expose declared actions, typed arguments after redaction, citations, safe results, progress, and errors. They must not expose secrets, provider credentials, internal SQL/checkpoint identifiers, unredacted third-party payloads, or hidden reasoning.

## 10. Migration and hard cut

Migration is an observed temporary bridge followed by one canonical path:

1. add normalized thread/message/part/run/step/Tool/approval/delegation tables and the append-only `AIRunEvent` table with event schema validation and sequence constraints.
2. add the canonical workspace Thread/Run/Tool-response APIs, including separated create, snapshot, event, resume, and cancel resources, plus generated clients.
3. temporarily dual-write the current event JSON array and `AIRunEvent` only while parity fixtures run. New readers use the normalized path; there is no read fallback from normalized state to the array.
4. backfill each valid legacy event array in stored order with sequences `1..N`, generated event IDs/cursors, `eventVersion: 1`, mapped payloads, and recorded hashes. Missing historical facts are not invented. Invalid or unmappable records are explicitly quarantined/archived with migration evidence.
5. run count, order, hash, owner, replay, terminal, cancellation, and Credits parity fixtures while old writes are frozen.
6. switch the Admin reducer/runtime adapter and backend routes together. Zustand becomes transient UI state, and stream disconnect changes from cancel to detach.
7. hard cut Toolkit renderer registration and nested delegation/approval mappings.
8. remove generic `/chat`, `/chat/workspace-actions`, the old `POST /projects/{project_id}/agents/runs/stream` endpoint, whole-array event authority, disconnect-cancels-run behavior and the `test_stream_project_agent_run_cancels_created_run_on_disconnect` expectation, text-directive routing authority, deprecated Tool UI registration, temporary dual write, and compatibility facades in the same rollout.
9. remove obsolete columns/tables only after rollback evidence is captured. After destructive cleanup, recovery is forward repair rather than re-enabling the legacy route.

The hard cut is forbidden until all section 11 gates pass against the normalized store and new browser adapter.

## 11. Required proof spike and acceptance gates

### 11.1 Evidence status

**PARTIALLY EXECUTED.** Normalized repository, HTTP/SSE, snapshot, approval,
delegation projection, interrupt/resume, durable Job, worker-loss recovery,
Skill snapshot, Admin reducer/provider, and protocol-contract tests exist in the
repository and run in the API/Admin quality gates. The single full browser
fixture combining real authenticated UI, worker restart, provider streaming,
Tool effects, approval, child delegation, Credits settlement, and every fault
injection below has not yet passed as one production vertical. Those unchecked
items remain gates and cannot be represented as completed evidence.

### 11.2 Fixture

The proof spike must use:

- the real FastAPI application and authentication/project dependencies.
- a real PostgreSQL normalized run/event store.
- the database-backed LangGraph checkpointer used by production, not `MemorySaver`.
- a worker process whose lifetime is independent of the HTTP SSE subscriber.
- a deterministic test provider that emits actual streaming chunks and terminal usage into the real runtime path; it is test-only and is never a production fallback.
- a LangGraph flow that emits text, calls a backend Tool, delegates to a child Agent with nested public messages, interrupts for server approval, resumes for both approve and deny cases, emits trailing text, and reaches provider usage/Credits settlement.
- a real browser integration using the installed assistant-ui `0.14.23`, the Arclayer reducer, Toolkit renderers, and the authenticated SSE endpoint.
- fault injection for disconnect, duplicate delivery, worker restart, expired cursor, cancellation, Tool failure, provider failure, and Credits commit failure.

A real provider sandbox run may supplement this deterministic fixture, but it cannot replace the reproducible protocol test.

### 11.3 Acceptance gates

All gates are mandatory:

#### Persistence and replay

- create returns a durable run, snapshot URL, event URL, sequence, and cursor without holding open the request.
- each committed event has a valid v1 envelope; sequence is contiguous, unique, and ordered under concurrent append.
- state/event commit occurs before publication; forced publisher failure is recovered by replay.
- subscriber disconnect does not cancel or stop the producer.
- reconnect replays every event after the accepted cursor with no loss or reordering.
- duplicate delivery at the replay/live boundary is applied once.
- snapshot high-water mark plus event replay has no race gap.
- an expired cursor returns 410, the client replaces remote state from the snapshot, and reconnect continues after the snapshot cursor.
- worker restart resumes from durable run/checkpoint state without duplicate Tool effects, child runs, messages, terminal events, or ledger entries.

#### assistant-ui behavior

- text deltas render incrementally and the canonical completed part matches accumulated content.
- every backend `toolName` resolves to the intended Toolkit renderer; an unknown name renders an explicit protocol error.
- server approval renders on the tool-call part, and approve, deny, allow-always, reject-always, duplicate, stale-version, and expired paths behave according to contract.
- human Tool input uses the result path rather than approval metadata.
- delegated child messages render read-only inside the delegation tool-call `messages` and never appear in the top-level thread list.
- refresh during running, interrupted, cancellation-requested, and terminal states reconstructs the same visible result.
- no hidden chain-of-thought is present in browser state, event transcripts, snapshots, logs, or artifacts.

#### Authorization and cancellation

- cross-user, cross-workspace, cross-project, cross-thread, and foreign-run event/snapshot/cancel/approval/result access returns the required not-found or permission result without metadata leakage.
- resume revalidates Tool policy, approval version, permissions, entitlements, Connector state, and checkpoint ownership.
- cancel is observed during provider streaming and at declared Tool cancellation points.
- disconnect alone never reaches the cancel service.
- parent cancellation propagates to child runs and waits for their settlement before the parent terminal event.

#### Credits and terminal state

- successful terminal usage is finalized and Credits are committed before message completion, run completion, event append, and publication.
- cancellation/failure reconciles or releases every active reservation before its terminal event.
- injected Credits commit failure produces no completed message and no `run.completed`; it produces an incomplete message plus explicit `run.failed` only after reconciliation.
- duplicate completion/cancel/failure attempts create one terminal event and one idempotent ledger outcome.
- the terminal event is the final public domain event; replay emits nothing after it.

#### Versioning and migration

- invalid envelopes, unknown versions/types, malformed payloads, sequence conflicts, and cursor conflicts fail explicitly.
- legacy backfill fixtures preserve valid order/count/hash and quarantine invalid records without invented success.
- generated API clients represent the discriminated event union, snapshot, cursor errors, discriminated Tool-response commands, and Run-resume commands.
- the old create-and-stream route and disconnect-cancel expectation are absent after hard cut.

AG-UI may replace the selected wire/runtime adapter only if it passes this same fixture and every gate without weakening the domain, owner-validation, reconnect, Credits, cancellation, nested-message, or no-chain-of-thought contracts. Passing a basic text-stream demo is insufficient.

## 12. Test obligations after acceptance

The proof becomes a maintained regression suite:

- backend schema tests cover every v1 event payload and reject unknown or unsafe data.
- repository concurrency tests cover sequence allocation, append-only constraints, projection idempotency, snapshot high-water marks, prefix retention, and cursor expiration.
- API integration tests cover create/snapshot/SSE replay, `Last-Event-ID`, query/header conflict, terminal close, owner validation, cancel, discriminated Tool-response variants, and Run resume.
- LangGraph integration tests cover interrupt/checkpoint/resume, deny, expiry, worker restart, child delegation, and parent cancellation.
- commercial integration tests cover reserve, partial usage, extend/commit, release/reconcile, billing failure, and terminal ordering.
- frontend reducer tests cover every event, duplicate, gap, conflict, replacement snapshot, invalid version/type, and immutable state.
- assistant-ui component tests cover Toolkit matching, approval metadata, `respondToApproval`, human `addResult`, nested messages, incomplete parts, and explicit Tool/protocol errors.
- authenticated browser tests cover refresh and network loss in running/interrupted/terminal states.
- migration tests cover valid legacy arrays, corrupt arrays, count/hash evidence, rollback before cleanup, and absence of legacy reads after hard cut.

Narrow backend test nodes must use the repository's 60-second timeout contract. Broad quality gates run to completion through repository scripts.

## 13. Consequences

Benefits:

- the Python backend owns a protocol shaped around Arclayer's real tenancy, LangGraph, ChangeSet, delegation, and Credits invariants.
- assistant-ui remains replaceable UI/runtime infrastructure rather than the orchestrator or persistence layer.
- refresh, disconnect, worker restart, and event retention have explicit recovery semantics.
- approval and nested Agent UI use current assistant-ui primitives instead of frontend-only part types.

Costs accepted by this decision:

- Arclayer maintains a versioned reducer, SSE client, payload schemas, fixtures, and assistant-ui mapping.
- at-least-once delivery requires idempotent projection and duplicate handling.
- the initial hard cut waits for a deeper fixture than a basic text streaming proof.

No production fallback to the legacy stream, browser-owned conversation array, simulated Tool success, or silent protocol downgrade is permitted.
