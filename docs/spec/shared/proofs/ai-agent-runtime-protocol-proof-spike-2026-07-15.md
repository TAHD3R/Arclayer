# AI Agent Runtime Protocol Proof Spike — 2026-07-15

Status: **Executed contract oracle; production vertical gate failed. ADR section 11 is not accepted.**

Parent contract: `docs/spec/shared/ai-agent-runtime-protocol.md` §11.

## 1. Scope and evidence boundary

This spike adds an executable, test-only v1 protocol oracle and fixtures. It does not add or change production Agent runtime code. Passing oracle tests proves that the selected fixture semantics are internally executable; it does **not** prove that the current FastAPI, LangGraph, PostgreSQL, worker, SSE, or assistant-ui production paths implement them.

The production gate reads the real Admin sources and intentionally fails while the required adapter/reducer is absent. No test-only reducer, static fixture, or mocked transport is counted as production success.

Installed versions verified from `pnpm-lock.yaml`:

- `@assistant-ui/react` `0.14.23`;
- `vitest` `4.1.9`.

## 2. Added executable evidence

| Contract area | Executable evidence | Result |
| --- | --- | --- |
| Versioned envelope projection | exact duplicate is a no-op; conflicting duplicate and sequence gap throw `AGENT_EVENT_SEQUENCE_INVALID` | PASS in oracle |
| Expired cursor recovery | `EVENT_CURSOR_EXPIRED` replaces backend-owned messages at snapshot high-water mark, retains the unsent draft, then accepts sequence 8 after snapshot sequence 7 | PASS in oracle |
| Owner validation | owner, cross-user, cross-workspace, cross-project, cross-thread, foreign-run, and permission fixtures; owner validation precedes cursor-expiry disclosure | PASS in oracle |
| Tool response and resume | approval, rejection, modified input, and human result are discriminated fixtures; resume requires a recorded response, matching checkpoint/response IDs, current sequence, and a separate idempotency key | PASS in oracle |
| assistant-ui nested Agent projection | fixture is compiled against installed `ToolCallMessagePart`; child message appears in `messages` and not the top-level message IDs | PASS in oracle |
| Credits terminal ordering | success commits Credits before message/run completion and publishes `run.completed` last; commit failure reconciles, keeps the message incomplete, and publishes only `run.failed` | PASS in oracle |
| Real production adapter/reducer | live Admin source must expose canonical workspace Run APIs, v1 envelopes, sequence/cursor reduction, expired-cursor snapshot replacement, and remove create-and-stream | **FAIL** |

Files:

- `apps/admin/test/contracts/ai-agent-runtime-protocol/v1-proof-fixtures.ts`
- `apps/admin/test/contracts/ai-agent-runtime-protocol/v1-contract-oracle.ts`
- `apps/admin/test/contracts/ai-agent-runtime-protocol/v1-command-oracle.ts`
- `apps/admin/test/contracts/ai-agent-runtime-protocol/v1-contract.test.ts`
- `apps/admin/test/contracts/ai-agent-runtime-protocol/v1-production-gate.test.ts`

## 3. Production gate failure evidence

The current production implementation remains pre-hard-cut:

- `apps/admin/src/api/ai.ts` defines `AgentRunEvent` as `{ event, data }`; it has no v1 `eventVersion`, event ID, sequence, or cursor contract.
- `agentRunStream()` still POSTs `/projects/{projectId}/agents/runs/stream` and owns one create-and-stream request.
- `apps/admin/src/components/ai/ai-chat-runtime.tsx` adapts the browser-owned Zustand conversation through `useExternalStoreRuntime`; it has no `AgentRunSnapshotV1` replacement or `EVENT_CURSOR_EXPIRED` reducer path.
- the repository has no canonical workspace-scoped Agent Run endpoints or normalized runtime adapter that this browser proof can exercise.

Therefore the failing production-gate test is the correct result. Removing or weakening the gate without implementing the production contract is forbidden.

## 4. Executed commands and results

Executable oracle:

```bash
rtk pnpm -C apps/admin test test/contracts/ai-agent-runtime-protocol/v1-contract.test.ts
```

Result: exit `0`; one test file passed, `16` tests passed.

Real production gate:

```bash
rtk pnpm -C apps/admin test test/contracts/ai-agent-runtime-protocol/v1-production-gate.test.ts
```

Result: exit `1`; one test failed. The assertion reported all five required production capabilities as `false`:

- `workspaceScopedRunApi`;
- `versionedEnvelope`;
- `sequenceAndCursorReducer`;
- `cursorExpiredSnapshotReplacement`;
- `legacyCreateAndStreamRemoved`.

Static validation:

```bash
rtk pnpm -C apps/admin typecheck
rtk pnpm -C apps/admin lint
rtk pnpm -C apps/admin format --check '!package.json'
```

Results: all three commands exited `0`. The format check excludes the unrelated baseline `apps/admin/package.json` EOF-format difference and checks the remaining `1,078` Admin files, including all five proof test/fixture files.

Changed-scope repository review:

```bash
rtk pnpm code-review-engine --scope changed --base HEAD --format json --output /tmp/arclayer-agent-runtime-proof-review.json
```

Result: exit `0`; zero blocking, report-only, or total findings in the final changed-worktree review.

## 5. Gates not executed by this spike

The following ADR §11 evidence remains absent and must not be inferred from the passing oracle:

- real FastAPI application and authenticated workspace/project dependencies;
- normalized PostgreSQL run/event store, concurrent sequence allocation, prefix retention, and transaction-before-publication;
- production database-backed LangGraph checkpointer and independent worker process;
- deterministic provider through the real runtime, Tool effects, approval checkpoint/resume, worker restart, cancellation, and failure injection;
- real Credits reservation/commit/reconcile ledger integration;
- authenticated SSE replay/live handoff, `Last-Event-ID`, disconnect behavior, and 410 response;
- real browser rendering through the Arclayer reducer, Toolkit registrations, `respondToApproval`, `addResult`, nested message primitive, refresh, and network-loss scenarios;
- generated API client discriminated unions and legacy migration/backfill parity.

Until those artifacts exist and every mandatory gate passes, ADR §11.1 remains `NOT YET EXECUTED` for the production vertical proof and the old route cannot be hard-cut.
