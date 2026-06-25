# Agent Runtime Contracts

This spec defines the Phase 3A read-only Agent runtime boundary.

## Scenario: Read-Only Agent Runs, Tools, Sessions, and Cancellation

### 1. Scope / Trigger

- Trigger: adding or changing Agent run APIs, Agent sessions, Agent tools, Agent event streams, or read-only Agent automation.
- Applies to:
  - `apps/api/src/agents/**`
  - `apps/api/src/modules/projects/agents/**`
  - Agent-facing use of `apps/api/src/llm/**`
  - Agent-facing use of content read services.

### 2. Phase 3A Boundary

- Phase 3A Agents are read-only.
- Phase 3A may create, stream, restore, and cancel Agent runs.
- Phase 3A persists ordered run events in run state snapshots and exposes the same events through the
  project Agent SSE endpoint.
- Phase 3A supports run state recovery through `GET /runs/{run_id}`. Byte-level SSE replay from a
  disconnected stream is not a Phase 3A contract; clients recover by fetching the latest persisted run state.
- Phase 3A may read content metadata and content item data through existing tenant-scoped read services.
- Phase 3A must not mutate content, publish content, enqueue write automation, or approve operations.
- Phase 3A must not expose Phase 3B approval or write-tool semantics except as stable placeholder enum values in internal code.

### 3. Signatures

- `AgentRunContext`
  - `workspace_id: UUID`
  - `project_id: UUID`
  - `user_id: UUID`
  - `correlation_id: str`
  - `runtime_id: UUID | None`
- `AgentRunEngine.run(input) -> AgentRunState`
  - Creates a run.
  - Stores ordered run events on the run state.
  - Executes only registered read-only tools.
  - Delegates LLM calls through the existing AI chat service so provider errors and budget rollback remain centralized.
- `AgentRunEngine.stream(input) -> AsyncIterator[AgentRunEvent]`
  - Creates a run.
  - Yields the same ordered event names persisted on the run state.
  - Checks cancellation before each tool step, before model streaming starts, and between streamed model chunks.
- `AgentSessionManager.create_run(...) -> AgentRunState`
- `AgentSessionManager.cancel_run(run_id, actor_user_id) -> AgentRunState`
- `AgentToolRegistry.get(name) -> ReadOnlyAgentTool`
- `ReadOnlyAgentTool.run(context, input) -> JsonObject`

### 3.1 HTTP Surface

- `GET /api/v1/projects/{project_id}/agents`
- `POST /api/v1/projects/{project_id}/agents/runs`
- `POST /api/v1/projects/{project_id}/agents/runs/stream`
- `GET /api/v1/projects/{project_id}/agents/runs/{run_id}`
- `POST /api/v1/projects/{project_id}/agents/runs/{run_id}/cancel`

### 4. Contracts

- Agent APIs must resolve `ProjectRequestContext` through existing project dependencies before constructing `AgentRunContext`.
- Agent APIs must require an explicit project read permission before starting or restoring a run.
- Agent sessions are private to the creating user, project, and workspace.
- Project Agent HTTP routes must use a persistent Agent run store; in-memory sessions are allowed only in
  dependency-light unit tests or explicitly isolated runtime tests.
- A run may be cancelled only by the creating user or a user with a future explicit Agent admin permission.
- Cancellation must be visible to the running task before the next model or tool step.
- Cancellation must release any active budget reservation before the run reaches a terminal state.
- Agent tools must declare:
  - stable `name`
  - `read_only=True`
  - input schema
  - required project permission
- Tool execution must validate workspace, project, runtime, input schema, and permission context before reading.
- Tool output must be JSON-serializable and must not include secrets, credentials, or raw provider keys.
- Agent run events must use stable event names:
  - `run.created`
  - `message.delta`
  - `tool.started`
  - `tool.completed`
  - `run.completed`
  - `run.cancelled`
  - `run.failed`
- Phase 3A event streams must not emit write approval events.

### 5. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Unknown agent id | Raise `NotFound` with `AGENT_NOT_FOUND` |
| Unknown run id | Raise `NotFound` with `AGENT_RUN_NOT_FOUND` |
| Run belongs to another workspace, project, or user | Raise `NotFound` with `AGENT_RUN_NOT_FOUND` |
| Tool is not registered | Raise `BadRequest` with `AGENT_TOOL_NOT_FOUND` |
| Tool is not allowed for the selected Agent | Raise `BadRequest` with `AGENT_TOOL_NOT_ALLOWED` |
| Tool is not read-only | Raise `Forbidden` with `AGENT_TOOL_WRITE_FORBIDDEN` |
| Tool input is invalid | Raise `BadRequest` with `AGENT_TOOL_INPUT_INVALID` |
| Agent context lacks resolved site/runtime read scope | Raise `BadRequest` with `AGENT_CONTEXT_INVALID` |
| User lacks required read permission | Raise `Forbidden` with `PERMISSION_DENIED` |
| Cancellation requested for terminal run | Return current terminal run state without side effects |
| Cancellation requested for active run | Mark cancellation requested and emit `run.cancelled` before terminal cleanup |
| Budget reservation active during cancellation | Release reservation before terminal state is stored |

### 6. Good/Base/Bad Cases

- Good: `ContentAnalyzerAgent` reads a content item through tenant-scoped content read services and returns analysis text without modifying records.
- Good: cancelling an active run returns a terminal cancelled state and releases its budget reservation.
- Good: restoring a run returns only runs owned by the current user in the current project and workspace.
- Good: after an SSE disconnect, the client uses `GET /runs/{run_id}` to recover the latest persisted terminal
  or non-terminal run snapshot.
- Base: project has no content items; read-only tools return empty lists.
- Bad: Agent tool reads content by directly querying global models without tenant context.
- Bad: Agent prompt asks the model to decide whether a tool is read-only.
- Bad: cancellation only stops the HTTP stream while the model/tool task continues.
- Bad: run events contain provider keys, credentials, or hidden policy prompts.
