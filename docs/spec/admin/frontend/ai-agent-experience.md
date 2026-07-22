# Admin AI Agent Experience Contracts

**Status:** Approved target code-spec; normalized runtime, shared assistant-ui provider, Agent launcher/mentions, System Agent control plane, and exact Workspace Skill grants are implemented through Wave 1D. The complete editor/delegation/Knowledge/commercial experience remains in progress.

**Decision date:** 2026-07-15.

**Applies to:** `apps/admin`, Admin-facing assistant-ui compositions in `packages/ui`, generated Agent/thread clients, conversation-list and Agent-panel surfaces, Tool renderers, migration fixtures, and frontend Agent tests.

**Canonical sources:**

- `docs/spec/shared/ai-website-builder-platform.md` owns Agent, Thread, Run, Tool, approval, delegation, persistence, Credits, API, event, security, migration, and rollout invariants.
- `docs/spec/admin/frontend/creation-editor.md` owns creation-editor context, selection, revision, and docked Agent-panel behavior.
- `docs/spec/admin/frontend/product-ui-toolchain.md` owns the Admin component, form, icon, motion, i18n, and loading stack.
- `DESIGN.md` owns the visual language, responsive behavior, focus, motion, typography, and color use.

This document specializes those sources for the user-visible AI Agent experience. It does not make assistant-ui the orchestration or persistence authority. If a required backend contract has not passed its rollout gate, the affected control is unavailable with an explicit reason; production code never substitutes a template response, a legacy route, a local-only conversation result, or a fake successful Tool call.

Current implementation status (2026-07-20):

- implemented: backend-owned normalized Thread/Message/Part/Run/event authority,
  durable Job execution, snapshot/replay/SSE contracts, one shared Admin
  assistant-ui provider, backend Thread history, independent Plan/Build,
  assignment-backed Agent launcher and structured mentions;
- implemented: immutable System Agent Definition/Version/Assignment control
  plane with workspace/project scope validation;
- implemented: exact Workspace Skill grants on Agent versions, assignment scope
  compatibility, per-Run Skill snapshot pinning, and worker prompt projection of
  lead-only exact resources as untrusted context;
- gated: Knowledge grants, Skill repin/uninstall lifecycle, the complete nested
  delegation/approval browser vertical proof, and the creation-editor and
  commercial surfaces defined by the parent platform contract.

## Scenario: One durable multi-Agent conversation experience

### 1. Scope / Trigger

- Trigger: adding or changing the global conversation sidebar, Home AI entry composer, creation-editor Agent panel, Agent launcher, `@Agent` mentions, Plan/Build control, conversation search/filtering, assistant-ui runtime adapter, message renderer, Tool UI, approval UI, delegation UI, or browser AI state.
- Wave 0 defines and proves the runtime/wire protocol and durable reconnect ADR against FastAPI/LangGraph.
- Wave 1 hard-cuts the three current execution paths, browser-owned conversation authority, the third composer mode, static Agent fallbacks, and whole-array conversation persistence.
- Later product surfaces consume the same experience through typed context adapters; they do not create new chat runtimes or direct Agent execution helpers.

The target outcome is one backend-owned, workspace-scoped conversation system in which a user can:

- start a thread by choosing a lead Agent;
- select Plan or Build independently of Agent identity;
- mention assigned specialist Agents with structured IDs;
- observe durable streaming, Tools, approvals, delegation, usage, cancellation, and recovery;
- search, filter, switch, rename, archive, restore, and delete thread metadata;
- continue the same thread from Admin management surfaces and the creation editor without losing the exact run context.

### 2. Decision-date baseline and upstream evidence

#### 2.1 Historical repository baseline

The table below records the legacy state observed on 2026-07-15. It is migration
evidence, not a description of the current implementation; the listed legacy
runtime/store files have since been removed or hard-cut where the status above
marks their replacement implemented.

| Current surface | Evidence | Target implication |
|---|---|---|
| Runtime | `AIChatRuntimeProvider` in `apps/admin/src/components/ai/ai-chat-runtime.tsx` adapts Zustand through `useExternalStoreRuntime`. | Replace browser authority with one backend-owned thread/runtime adapter; keep assistant-ui as the view/runtime integration layer. |
| Three execution paths | `sendAIChatMessageWithSignal` uses generic `/chat`; `sendAIWorkspaceActionMessage` uses `/chat/workspace-actions`; `sendAIAgentMessage` uses project Agent SSE. | All conversation sends use `POST /workspaces/{workspaceId}/ai/threads/{threadId}/runs` with one structured envelope. |
| Mode routing | `AIComposerMode = "build" | "plan" | "agent"`; `agentIdForComposerMode` maps Build and Plan to fixed Agent IDs. | Replace with `ExecutionMode = plan | build` plus independent stable `leadAgentId`. |
| Home | `apps/admin/src/pages/home/page.tsx` owns a second `useExternalStoreRuntime`, queue, cancellation, conversation creation, and mode branching. | Home becomes a composer-only projection of the shared runtime; it does not execute or persist independently. |
| Browser authority | `use-ai-chat-store.ts` owns conversations, messages, active ID, streaming, selection, append/finalize, edit, and replacement behavior. | Zustand retains only transient panel/draft/preference state; backend Thread/Message/Run rows are authoritative. |
| Persistence | `buildConversationRequestBody` sends the full message array through POST/PATCH snapshots. | Use normalized append-only Thread/Message/Part/Run APIs and ordered events; never replace history as one JSON array. |
| Agent selection | `AIAgentSelector` has `STATIC_AGENT_OPTIONS` when the real catalog has not loaded. | A catalog failure is explicit. No fake selectable Agent or hard-coded compatibility catalog remains. |
| Mentions | `AIComposerTriggers` already isolates assistant-ui unstable mention primitives and loads real projects/Agents. | Preserve the adapter boundary, but send structured Agent IDs and treat directive text only as display/LLM hints. |
| Conversation list | `AIConversationList` loads active/archived arrays and performs grouping, ordering, pinning, selection, and batch operations in the browser. | Use backend-filtered, cursor-paginated Thread metadata through `RemoteThreadListAdapter`; browser filtering is not completeness authority. |
| Primitives | `components/assistant-ui/thread.tsx` already composes Thread, Composer, Message, ActionBar, BranchPicker, grouped parts, queue, attachments, Markdown, and error primitives. | Reuse and decompose these proven primitives; do not build a second chat component tree. |
| Tool/approval UI | `ToolFallback` supports `running`, `complete`, `incomplete`, `requires-action`, and `respondToApproval`; `AIApprovalQueue` separately polls and applies approvals. | Register Tool UI through Toolkit APIs; approval stays metadata on the corresponding Tool call. Any global approval inbox is a read projection, not execution authority. |
| Agent artifacts | Agent interrupt, execution summary, and workspace actions are encoded in message `metadata.custom` and rendered by a monolithic Thread component. | Map domain events to standard parts, Tool calls, nested messages, and typed metadata at the adapter boundary; remove legacy artifact side channels. |

#### 2.2 assistant-ui evidence checked for this contract

The live lockfile resolves `@assistant-ui/react` `0.14.23`, `@assistant-ui/react-markdown` `0.14.4`, and `assistant-stream` `0.3.23`. The installed `@assistant-ui/react` exports the target APIs, including `useRemoteThreadListRuntime`, `RemoteThreadListAdapter`, `defineToolkit`, `externalTool`, `Tools`, `MessagePartPrimitive.Messages`, `ReadonlyThreadProvider`, and `AssistantRuntimeProvider`.

The current official `assistant-ui.com/llms.txt` index and focused documentation establish these integration facts:

- `RemoteThreadListAdapter` owns thread metadata; a thread-scoped history/runtime adapter owns messages.
- `initialize()` must complete before first-message persistence to avoid the first-message race.
- remote list pagination uses a cursor; upstream may swallow page errors, so Arclayer must surface them through its adapter/controller instead of assuming rejection reaches the UI.
- mention trigger APIs are currently `unstable_*` and must remain isolated behind an Arclayer adapter.
- component/hook Tool registration APIs are deprecated in favor of `defineToolkit` plus `Tools({ toolkit })`.
- backend Tool renderers use `externalTool()` and never execute the backend Tool again in the browser.
- sub-Agent conversations belong in `ToolCallMessagePart.messages` and render with `MessagePartPrimitive.Messages` in a read-only inherited scope.
- byte-level resumable streams are transport-specific. Their session-storage IDs are opaque locators, not credentials, and do not replace backend Run ownership or authorization.
- Assistant Transport, AG-UI, and custom streams have different state/reconnect semantics; no React example is itself Arclayer's backend protocol contract.

### 3. Non-negotiable product and architecture decisions

1. There is one conversation domain and one frontend adapter path.
2. `ExecutionMode` is `plan | build`; Agent identity is never encoded as a third mode.
3. Every thread has one stable `leadAgentId`. Changing the lead Agent creates or explicitly forks a thread; it does not rewrite existing thread identity.
4. `@Agent` requests collaboration. It does not grant permissions and does not make the browser invoke Agents in parallel.
5. The backend owns Thread, Message, MessagePart, Run, ToolCall, Approval, Delegation, event ordering, usage, terminal outcome, and retention.
6. assistant-ui owns accessible interaction primitives and runtime projection only.
7. Zustand/local storage never owns conversation history, current Run truth, approval authority, or a successful Tool result.
8. All writes occur through a typed Tool/command/`ChangeSet` with server permission and approval enforcement.
9. A closed SSE/fetch connection is not a completed Run. Completion requires the persisted terminal event ordering in the shared contract.
10. Existing proven assistant-ui primitives are reused; backend authority and registration paths are replaced without creating a second visual/runtime stack.

### 4. Surface topology and provider ownership

#### 4.1 Authenticated provider boundary

Mount one `ArclayerAssistantProvider` at the authenticated application boundary shared by Admin scenes and the independent creation-editor scene. It owns:

- the workspace-scoped remote Thread list runtime;
- the selected main Thread runtime;
- protocol adapter and durable reconnect controller;
- Toolkit registration and render-only Tool UI registry;
- thread query/filter controller;
- auth/workspace lifecycle reset and reload;
- transient, namespaced composer draft integration.

It must not mount before authenticated workspace identity is resolved. When workspace or user identity changes, it detaches the old runtime, clears tenant-scoped transient state, reloads the new authorized Thread list, and prevents any previous-workspace transcript flash.

`AssistantRuntimeProvider` receives the single runtime. Descendant surfaces consume `useAui`, `useAuiState`, and `useAuiEvent`; new code does not add legacy `useAssistantRuntime`/per-context hooks.

#### 4.2 Surface projections

| Surface | Projection contract |
|---|---|
| Conversation sidebar tab | Agent launcher, server-filtered Thread list, and actions. It does not maintain a parallel conversation array. |
| Global conversation panel | The selected `ThreadPrimitive` composition, run state, Tools, approvals, and composer. |
| Home entry composer | A composer-only new-thread projection. First send initializes the backend Thread, switches the shared runtime to it, and opens the conversation panel. |
| Creation-editor Agent panel | The same runtime plus the typed editor context adapter from `creation-editor.md`; no editor-specific orchestration. |
| Contextual “Ask AI”/recommendation action | Prefills or sends through the selected/new shared Thread runtime, or calls a separately canonical domain proposal API when no conversation is intended. It never calls a legacy chat helper directly and then manufactures a transcript. |
| Cross-thread approval inbox, if retained | Read-only/index projection that navigates to the owning Tool call and may submit through the same typed Tool-response API. It is not an alternate approval state machine. |

Only one Thread transcript is interactive at a time within an authenticated provider. A nested delegated sub-Agent transcript is read-only and does not become the provider's main Thread.

### 5. Backend-owned Thread and runtime adapter

#### 5.1 Domain-to-assistant-ui boundary

Arclayer domain types remain independent of React and assistant-ui. The frontend adapter maps generated domain clients to assistant-ui state:

```ts
interface ArclayerAssistantAdapter {
  readonly runtime: AssistantRuntime;
  initializeThread(input: InitializeThreadInput): Promise<ThreadIdentity>;
  startRun(input: StartRunInput): Promise<RunIdentity>;
  cancelRun(input: CancelRunInput): Promise<RunSnapshot>;
  reconnectRun(input: ReconnectRunInput): Promise<void>;
  respondToToolCall(input: ToolCallResponseInput): Promise<void>;
  reloadThread(threadId: string): Promise<void>;
}
```

These are frontend responsibilities, not permission to hand-write wire schemas. Concrete request/response/event types come from generated clients and the accepted Wave 0 protocol ADR.

#### 5.2 Remote Thread list

Use `useRemoteThreadListRuntime` and a `RemoteThreadListAdapter` for:

- cursor-paginated list and reload;
- idempotent initialize;
- fetch by authorized Thread ID;
- rename;
- archive/unarchive;
- user-visible soft delete;
- title generation when enabled;
- backend custom metadata projection.

The adapter's `unstable_Provider`, if used for thread-scoped history/protocol adapters, must render children synchronously on first commit. It may load inside an always-mounted child; it must not withhold provider children behind Suspense, an effect, or a local “ready” boolean.

Thread list metadata maps at minimum:

```ts
type ArclayerThreadListMetadata = Readonly<{
  workspaceId: string;
  projectId: string | null;
  leadAgentId: string;
  leadAgentVersionId: string | null;
  runStatus: ThreadRunStatus | null;
  updatedAt: string;
  archivedAt: string | null;
  projectArchivedAt: string | null;
}>;
```

The server owns metadata versions. Rename, archive, restore, delete, and optional pin operations reconcile from the returned metadata/ETag; the browser does not patch a local list and call that durable success.

#### 5.3 Message history

- Load normalized `AIMessage` and ordered `AIMessagePart` rows from the backend and map them into `ThreadMessage`/part projections.
- Persist a user message and create its Run atomically/idempotently through the canonical Run creation command. Do not independently append a local message, PATCH a snapshot, and then start execution.
- Preserve server message IDs, parent/branch relationships, part IDs, status, timestamps, Agent/run provenance, source/file references, and Tool call IDs.
- Incremental events update the runtime projection by stable IDs and sequence. They never replace the whole backend history.
- Duplicate/replayed events are ignored by persisted event identity/sequence, not by comparing text.
- Missing sequence, invalid transition, unknown part type, or schema mismatch produces an explicit adapter error and recovery fetch. It is not silently coerced to text.
- Edit/reload creates a server-owned branch or new Run against a source message. The browser never truncates `messages.slice(...)` and overwrites history.

assistant-ui history formats may be used inside the adapter, but their encoded blob is not Arclayer's database truth. The backend remains normalized and queryable by Thread, Message, Part, Run, ToolCall, Approval, and Delegation IDs.

### 6. Unified Plan/Build Run envelope

#### 6.1 Required envelope

Every conversation send uses the shared master envelope:

```ts
type ExecutionMode = "plan" | "build";

type StartRunEnvelope = Readonly<{
  threadId: string;
  leadAgentId: string;
  mentionedAgentIds: readonly string[];
  executionMode: ExecutionMode;
  workspaceId: string;
  projectId: string | null;
  siteRevisionId: string | null;
  message: string;
  idempotencyKey: string;
}>;
```

Generated branded IDs replace the illustrative strings. Typed attachments, selected-object references, content/design references, and route context use generated extension fields approved by the backend contract; they are never added as arbitrary `Record<string, unknown>` payloads.

Envelope rules:

- `threadId` is initialized before send and belongs to the current workspace/user.
- `leadAgentId` equals immutable Thread metadata; a composer cannot substitute another value.
- `mentionedAgentIds` is deduplicated in selection order and contains stable IDs, not labels/slugs parsed as authority.
- `executionMode` is selected for each Run and remains visible on the resulting user message/run.
- `projectId` may be null for workspace/global work only when the selected Agent and Tool grants allow it.
- `siteRevisionId` is required for revision-bound editor work and validated against project authoring authority.
- `message` retains human-visible intent; mention directives are non-authoritative annotations.
- `idempotencyKey` is created once per send attempt and reused only for retrying that exact command.
- model/reasoning overrides appear only when the resolved Agent version explicitly exposes an allowed override. The server still chooses and validates the effective model policy.

#### 6.2 Plan and Build semantics

The composer renders one two-option execution control:

| Mode | Product promise | UI capability |
|---|---|---|
| Plan | Explore, retrieve, analyze, compare, and prepare candidate changes without applying them. | Read/retrieval Tools, human-choice Tools, and candidate `ChangeSet` review; no apply/publish/delete/install/external-write action. |
| Build | Create or apply permitted typed changes with previews and approvals. | Only server-granted Tools; draft writes may be reversible, while publish/destructive/external/billing actions require the server approval policy. |

The control is not a security boundary. Disabled actions and renderer affordances mirror server capabilities; every Tool call is enforced again by the backend.

Mode is independent from the lead Agent. The UI must not:

- map Plan to `content_advisor`;
- map Build to `content_builder`;
- use an `agent` mode to reveal Agent selection;
- silently change mode when an Agent assignment is missing;
- keep Plan available by routing to generic chat when the Agent cannot execute it.

If the selected Agent does not support the chosen mode, show the incompatibility and let the user choose another mode or create a Thread with another Agent. Do not silently select the first catalog entry.

### 7. Lead Agent launcher and identity

#### 7.1 Launcher placement and ordering

The conversation sidebar places a horizontally scrollable row of pinned/recent Agent avatars above Select/Filter/Search controls. It contains:

- assigned official/workspace Agents available in the current workspace/project context;
- pinned Agents first, then recently used Agents by backend metadata;
- an “All Agents” action that opens a searchable picker with role, scope, capability summary, and availability;
- explicit loading, empty, assignment-disabled, entitlement-disabled, and load-error states.

There is no static production fallback catalog. Official built-ins come from system-owned backend templates/assignments, not hard-coded React arrays.

#### 7.2 Starting from an avatar

Clicking or keyboard-activating an Agent avatar:

1. validates that the assignment is available in the current workspace/project scope;
2. switches to a reusable uninitialized new-thread item only when it has no remote identity or messages;
3. otherwise creates a new local Thread item;
4. initializes the backend Thread idempotently with the selected stable `leadAgentId`;
5. opens the Thread with Agent identity, capability summary, supported Plan/Build modes, relevant starters, and context disclosure;
6. moves focus to the Thread heading or composer according to the initiating action.

Selecting another lead Agent after the Thread has been initialized offers “Start a new conversation” or an explicit server-owned fork if that feature exists. It never mutates `leadAgentId` in place.

#### 7.3 Identity presentation

- The transcript header and each Run identify the lead Agent by avatar, display name, role, and version/provenance summary where relevant.
- Official Agent identity and custom workspace Agent identity are visually distinguishable without implying one is more trusted than its actual grants.
- Agent names are content, not execution modes.
- Disabled Agents remain visible only when the server returns a user-actionable reason; hidden policy details and unavailable cross-tenant identities are not exposed.
- Avatar controls have accessible names such as “Start a conversation with Content Writer”; tooltip text is supplementary.

### 8. `@Agent` mention contract

#### 8.1 Adapter boundary

Keep assistant-ui's `unstable_*` trigger APIs behind `ArclayerAgentMentionAdapter` and local components. Feature pages import the stable Arclayer component, not unstable upstream hooks directly.

Because the upstream trigger adapter is synchronous:

- Agent assignment/search data loads through the existing query client outside the adapter;
- stale async requests are cancelled or ignored;
- the adapter exposes the latest validated snapshot synchronously;
- loading, empty, and failed search remain visible in the popover;
- changing workspace/project invalidates mention results before they can be selected.

#### 8.2 Mention behavior

- Typing `@` opens a keyboard-navigable Agent picker filtered to real assignments available to the lead Agent/thread context.
- Each option shows avatar, name, role, scope, and concise collaboration capability.
- Selection inserts a semantic directive/chip and stores the stable Agent ID in composer state.
- User-message rendering displays a localized chip, not raw directive syntax.
- Removing/undoing a chip removes its structured ID.
- Pasting raw directive text does not grant or select an Agent until the adapter/server validates it.
- A stale, disabled, or unassigned mention is identified before send when possible and always rejected by the server when invalid.
- Multiple mentions produce one ordered `mentionedAgentIds` list and one Run request. The browser never fans out requests.
- Mentioned Agents are collaboration hints. The lead Agent/backend decides whether and how to delegate.

Mention text is untrusted input. Labels and descriptions are escaped as text, and no mention path constructs code, a Tool schema, or an executable prompt fragment from an Agent name.

### 9. Conversation list, filters, and search

#### 9.1 Primitive composition

Build the list with `ThreadListPrimitive` and `ThreadListItemPrimitive`:

- `ThreadListPrimitive.Root`, `New`, `Items`, and `LoadMore`;
- `ThreadListItemPrimitive.Root`, `Trigger`, `Title`, `Archive`, `Unarchive`, and `Delete`;
- `ThreadListItemMorePrimitive` for secondary actions.

`aria-current`/active semantics come from the primitives. Arclayer composes Agent/project/status metadata around them without reimplementing Thread switching authority.

#### 9.2 Server query

Thread listing is cursor-paginated and server-filtered by:

- workspace (required and derived from authenticated scope);
- Agent;
- project;
- Run status;
- active/archived/project-archived state;
- updated ordering;
- localized search query where supported.

Search covers at least title and backend-approved user-visible message text; it never searches hidden chain-of-thought, secret Tool arguments, quarantined content, or another workspace.

The outer `ThreadQueryController` owns filter/search state and includes it in the adapter's `list({ after })` request. On filter/search change it:

1. cancels/invalidates the previous query;
2. resets the cursor;
3. calls runtime reload;
4. ignores superseded responses;
5. exposes loading/error/retry independently from the previous successful page.

Upstream `loadMore()` may preserve a cursor and resolve after an adapter rejection. Arclayer therefore records page errors in the query controller and renders an explicit retry row; it must not present a failed page as end-of-list or successful refresh.

#### 9.3 List behavior

- Agent avatar launcher appears above Select/Filter/Search as required by the master contract.
- Active Thread remains open if a filter excludes it; the list explains that the current Thread is outside the active filter and offers clear-filter navigation.
- Archived project Threads are distinguishable from user-archived Threads.
- Empty states distinguish no Threads, no search matches, no Agent assignment, and archived-only results.
- Rename validates non-empty input and reconciles server metadata version.
- Delete is user-visible soft deletion and explains retention/audit behavior without promising physical erasure.
- Bulk operations, if retained, use a typed backend bulk command with explicit partial-result semantics. The browser must not call `Promise.all` over individual mutations and present it as one atomic result.
- Thread pinning, if retained, becomes backend custom metadata. Browser-only pinned IDs are not list authority.

### 10. Existing primitive reuse and message rendering

#### 10.1 Required reuse

Retain and refine the existing Admin compositions for:

- `ThreadPrimitive.Root`, `Viewport`, `Messages`, `ViewportFooter`, `ScrollToBottom`, and empty/suggestion state;
- `ComposerPrimitive.Root`, Input, Send, Cancel, attachments, dictation, and queue;
- `MessagePrimitive.Root`, `Parts`/grouped parts, and Error;
- `ActionBarPrimitive` copy/edit/reload/feedback actions where backend capabilities permit;
- `BranchPickerPrimitive` for server-owned branches;
- existing Markdown, attachment, reasoning-summary, Tool grouping, Tooltip, and queue visual primitives.

New part rendering uses children render functions (`MessagePrimitive.Parts` or the current grouped-parts equivalent). It does not add the deprecated `components` prop or `MessagePrimitive.Content` alias.

The current large `thread.tsx` is decomposed by domain renderer responsibility during migration, but tightly coupled base Thread/Composer markup may remain cohesive. Do not replace it with a second generated chat component set.

#### 10.2 Canonical part mapping

| Domain part/event | assistant-ui projection |
|---|---|
| User/assistant text | text part with persisted part ID/status. |
| Public reasoning/status summary | reasoning or declared-progress UI only when intentionally user-visible; never hidden chain-of-thought. |
| Citation/source | source part with authorized label/location/reference. |
| File/asset | file/image part with stable authorized asset reference and alt/filename metadata. |
| Tool call | tool-call part with stable Tool call ID, exact Tool key, validated args/result, status, timing, approval, and optional nested messages. |
| Error | message/part incomplete status plus stable localized error mapping and correlation ID. |
| Delegated Agent conversation | `ToolCallMessagePart.messages` rendered read-only with `MessagePartPrimitive.Messages`. |
| ChangeSet/proposal | typed Tool renderer that shows summary, affected scope, diff/preview, blockers, and action state. |

Legacy `agentArtifact`, `workspaceAction`, `agentInterrupt`, and execution data in `metadata.custom` are migration inputs, not target public part types. Target events map to the table above.

#### 10.3 Message actions

- Copy operates on user-visible content and excludes hidden metadata/secrets.
- Edit is enabled only when the backend supports a branch/edit command for that message and the user has permission.
- Reload/regenerate creates a new server Run/branch from the selected source message with a new idempotency key; it does not delete later rows locally.
- Branch picker IDs and counts come from backend history.
- Feedback uses the stable Message/Run IDs and existing feedback adapter boundary.
- Queue controls apply only to unsent local composer entries unless the backend exposes a durable queued command. A local queue does not claim refresh durability.

### 11. Toolkit and Tool UI contract

#### 11.1 Registration

All target Tool renderers are registered once inside the authenticated assistant provider using the current Toolkit path:

```tsx
const toolkit = defineToolkit({
  "agent.delegate": {
    execute: externalTool(),
    render: DelegationTool,
  },
  "builder.change-set": {
    execute: externalTool(),
    render: ChangeSetTool,
  },
});

const aui = useAui({ tools: Tools({ toolkit }) });

<AssistantRuntimeProvider aui={aui} runtime={runtime}>
  {children}
</AssistantRuntimeProvider>;
```

The exact Toolkit composition must be verified against the installed package version during implementation. The snippet documents the target registration shape, not permission to copy an API example without typechecking.

Rules:

- Tool keys exactly match stable backend Tool IDs; version and renderer contract are validated metadata.
- Backend Tools use `externalTool()`/render-only registration. They never execute again in the browser.
- Browser-only Tools are limited to explicitly non-authoritative local capabilities such as copy or safe navigation and declare that boundary.
- Component/hook registrations using `makeAssistantTool*` or `useAssistantTool*` are removed; no mixed registration path remains.
- Tool inputs/results are schema validated before rendering. Renderer code treats them as untrusted data.
- Dynamic UI is limited to a reviewed component allowlist; model output cannot import components, evaluate code, or construct arbitrary HTML.
- Tool UI never mutates a feature store to declare backend success. It submits a typed response/command and waits for the durable event/result.

#### 11.2 Tool states

Every renderer covers:

- arguments streaming/validation;
- `running` with declared action and cancellability truth;
- progress where the backend emits it;
- `requires-action` with approval/human input;
- `complete` only after the persisted Tool result is complete;
- `incomplete` with cancelled/error/content-filter/length/other reason;
- unsupported renderer with a redacted, localized fallback and explicit diagnostic identity.

An unknown Tool renderer may show safe Tool name/status/correlation metadata through `ToolFallback`; it must not dump raw secrets, large JSON, binary payloads, or unvalidated HTML. It also must not hide the Tool call by returning an empty fragment.

### 12. Approval and human-in-the-loop contract

#### 12.1 Approval belongs to the Tool call

Approval is metadata on the corresponding tool-call part. It is not a custom message type, a detached browser queue item, or an Agent message convention.

When status is `requires-action`, render:

- localized action and owning Tool/Agent;
- side-effect class (`read`, `draft_write`, `external_write`, `publish`, or `destructive`);
- affected workspace/project/revision/object scope;
- affected count and representative diff/preview;
- blockers, warnings, expiry, and data-egress disclosure;
- server-returned choices, including any eligible scoped “Always allow” option;
- deny/cancel path permitted by the backend contract;
- checkpoint and correlation context without exposing credentials.

The renderer submits through `POST /workspaces/{workspaceId}/ai/tool-calls/{toolCallId}/responses` with an idempotency key. Run resume uses the canonical Run resume endpoint and includes checkpoint ID plus expected durable sequence.

After a decision:

- show a pending decision state immediately;
- disable duplicate submission for that exact idempotency key;
- wait for server acknowledgement/event before showing approved/rejected/applied;
- on conflict, expiry, permission loss, or network error, restore an explicit retry/reload state rather than remaining locally “submitted” forever;
- never infer application from approval. Approval and apply may be separate server states.

#### 12.2 Approval UI reuse and hard cut

Retain the proven status/choice interaction concepts in `ToolFallbackApproval`, but localize all labels and route decisions through the typed adapter. Replace raw JSON modification textareas with typed domain forms/diffs where modification is supported.

The current `AIApprovalQueue` is removed from the active Thread execution path. If product requirements retain a global approval inbox, it lists backend projections and navigates to the owning Tool call; it does not poll a second state machine, independently apply content, or override Toolkit status.

“Always allow” authority is persisted only by the backend under the returned scoped policy. The browser never stores it in assistant-ui, Zustand, local storage, or a cookie.

### 13. Delegation and nested specialist messages

The lead/orchestrator Agent delegates through the backend `agent.delegate` Tool. The frontend renders, but does not initiate, child Agent fan-out.

The delegation Tool UI shows:

- specialist Agent identity/version and declared objective;
- parent Run/Tool context;
- queued/running/waiting/completed/failed/cancelled status;
- safe public progress, evidence, output/artifact references, usage summary, and terminal error;
- nested user/assistant/Tool messages supplied in `ToolCallMessagePart.messages`.

Use `MessagePartPrimitive.Messages` inside the Tool renderer. Nested messages:

- inherit the parent Toolkit renderers;
- are read-only—no composer, edit, reload, branch, feedback, or top-level Thread actions unless separately designed;
- may recurse for deeper delegated Tool calls while preserving clear hierarchy;
- keep stable child Run/Agent identity and accessible headings;
- never expose hidden chain-of-thought;
- never appear as independent items in the user's Thread list.

A child failure is scoped to the delegation Tool and its parent Run policy. The UI must not mark the parent complete, retry the child automatically, or flatten child messages into the lead transcript without an explicit backend event.

### 14. Streaming, cancellation, reconnect, and terminal truth

#### 14.1 Wave 0 protocol gate

Before Wave 1 implementation, an ADR selects and proves:

1. the assistant-ui runtime/wire adapter for text, standard parts, Tool calls, approvals, nested messages, cancellation, and state updates; and
2. the durable reconnect mechanism for authorized replay and terminal recovery.

The spike compares AG-UI with Assistant Transport/custom stream against the actual FastAPI/LangGraph backend. It records:

- installed frontend/backend protocol versions;
- versioned event discriminants and part mapping;
- delta versus cumulative update rules;
- per-Run monotonic sequence and duplicate/out-of-order handling;
- owner/workspace/thread/run authorization;
- cancellation command and acknowledgement semantics;
- cursor retention/expiry recovery;
- server restart and worker continuation behavior;
- terminal Run/message ordering after usage and Credits commit;
- no backend dependency on React packages.

Do not assume AI SDK `AssistantChatTransport` resumable support applies unchanged to AG-UI, LangGraph, or a custom Assistant Transport adapter. A2A remains reserved for external Agent interoperability.

#### 14.2 Event handling

Required public event categories follow the master contract: Run lifecycle, delegation lifecycle, message-part lifecycle, Tool lifecycle, ChangeSet/approval/interruption lifecycle, and provider usage updates.

For every event, the adapter validates:

- `eventVersion`;
- workspace/thread/run ownership already established by the authorized connection;
- monotonic per-Run sequence;
- event/part/Tool/delegation IDs;
- legal previous-to-next state;
- schema version and payload bounds;
- correlation and parent/span relationships where applicable.

Unknown versions, invalid transitions, missing sequence, or invalid payloads surface an adapter error and trigger an authorized snapshot recovery. They do not become generic text or disappear.

#### 14.3 Reconnect

On mount, refresh, network recovery, or cross-device open:

1. fetch authorized Thread history and active/nonterminal Run snapshot;
2. resume events from the persisted sequence cursor or documented `Last-Event-ID` contract;
3. deduplicate replayed events;
4. if the cursor expired, consume `EVENT_CURSOR_EXPIRED` recovery metadata and reconcile from the latest authorized snapshot;
5. if the Run is terminal, render the persisted terminal truth rather than reopening a stream;
6. if recovery fails, show explicit reconnect failure with retry and correlation ID.

Stream IDs/cursors are opaque locators, not credentials. Every resume route validates authenticated user, workspace, Thread, and Run ownership. Browser storage namespaces any locator by user/workspace/thread and clears it on logout/workspace change/terminal completion.

#### 14.4 Cancellation

- Stop submits the canonical cancel command and first renders “Cancel requested”.
- Closing the panel or losing the client connection does not imply cancellation.
- AbortController may stop the local connection after/alongside the server command, but it is not terminal authority.
- The UI renders terminal “Cancelled” only from the persisted Run/event state.
- Completed partial output stays marked according to backend part status.
- A cancel failure remains visible and reconnects to actual Run state; it does not locally finalize the message.

### 15. State ownership and Zustand hard boundary

#### 15.1 Target ownership matrix

| State | Owner | Browser rule |
|---|---|---|
| Thread metadata, lead Agent, archive/delete, title, timestamps | Backend | Project through remote Thread runtime; cache only. |
| Message/part history and branches | Backend | Map by stable IDs; no writable whole-array store. |
| Run, ToolCall, Approval, Delegation, event sequence, usage | Backend | Runtime projection only; no local terminal inference. |
| Agent definitions/versions/assignments/capabilities | Backend | Query cache with explicit loading/error; no static fallback. |
| Current main Thread selection | assistant-ui ThreadListRuntime | May mirror route/panel state but has one authority. |
| Conversation list query/filter/search | Thread query controller | Transient or URL preference; server evaluates results. |
| Panel open/width/dock, selected sidebar tab | Zustand/UI preference store | Non-sensitive local preference only. |
| Unsent composer draft and selected mention chips | assistant-ui composer plus namespaced draft adapter | May survive refresh/offline under the documented draft-retention policy; revalidate IDs before send and clear after send/logout/workspace change. |
| Plan/Build preference for a new Run | transient preference | Server validates support; completed Run stores actual mode. |
| Model/reasoning preference | transient preference only when allowed | Never overrides Agent policy without server validation. |
| Local unsent queue | assistant-ui queue | Not durable unless promoted to a backend command. |

#### 15.2 Forbidden Zustand state

The target UI store must not contain or mutate:

- `conversations` or message arrays;
- authoritative `activeId` separate from ThreadListRuntime;
- global `streaming` as Run truth;
- append/finalize/replace message operations;
- Agent Run IDs/status/checkpoints/interrupts as mutable message metadata;
- approval decisions or “always allow” grants;
- backend Agent catalog fallbacks;
- published/completed/applied Tool outcomes.

Browser persistence may contain only the explicitly namespaced unsent draft and permitted UI preferences. It must not contain sent conversation history, Run state, Tool args/results, approval tokens, stream credentials, uploaded file bytes, or cross-tenant context. Draft persistence is user/workspace scoped, cleared after send/logout/workspace change, and never treated as server history.

### 16. Responsive product contract

| Viewport intent | Required composition |
|---|---|
| Desktop | Conversation sidebar tab/list plus docked or overlay Thread panel; Agent avatar row, filters, transcript, and composer remain independently scrollable. |
| Tablet | List and Thread use a split view when space allows; otherwise one accessible sheet with explicit List/Conversation navigation. |
| Mobile | Full-height safe-area sheet or scene. Thread list and transcript are separate views with a labelled back action; Agent row, filters, Tools, approvals, and composer remain reachable. |
| Creation editor narrow mode | Agent panel opens as the single active editor sheet described by `creation-editor.md`; closing it restores canvas focus/context. |

Responsive rules:

- Core Agent selection, Plan/Build, mention, Tool approval, Stop, search/filter, and Thread switching cannot disappear behind a desktop-only class with no replacement.
- Agent avatars scroll horizontally without causing page-level overflow.
- Tool/approval cards reflow to one column and never require horizontal reading of raw JSON.
- Composer respects on-screen keyboard and safe-area insets; input text is at least `16px` on mobile.
- Touch targets are at least `44px` where touch-operated.
- Panel resize is desktop-only, keyboard accessible, and stores only a local preference.
- Opening/closing a list or Thread sheet preserves unsent drafts, active Thread, Run state, and focus return.

### 17. Accessibility and keyboard contract

#### 17.1 Landmarks and focus

- Conversation list is a labelled navigation region; transcript is a labelled main/complementary region according to surface context.
- Agent launcher is a labelled toolbar/list of buttons with full accessible names and selected/recent/pinned state text.
- Search has a visible label or persistent accessible name; filter buttons expose active counts and expanded state.
- Thread item roots/triggers use assistant-ui primitives so active items expose `aria-current`.
- Opening a Thread moves focus to its heading or latest relevant message without stealing focus during background updates.
- Closing the panel/sheet restores focus to the invoking control.
- New approval requirements move focus only when the user initiated the Run and no modal interaction is active; otherwise announce and provide a jump action.

#### 17.2 Keyboard behavior

- Agent avatar row and “All Agents” picker are fully operable with Tab/arrow/Enter/Space according to their widget pattern.
- Mention popover supports typeahead, arrow navigation, Enter selection, Escape close, and focus return to the composer.
- Plan/Build control uses radio/menu semantics and announces descriptions/disabled reasons.
- Thread list supports keyboard switching and item action menus without requiring hover.
- Stop, approve, deny, modify, retry, archive, restore, rename, and delete have visible focus treatment.
- Escape closes the deepest popover/sheet before the containing panel and never discards an unsent draft or submits a decision.
- Composer shortcuts do not override IME composition, assistive-technology keys, browser zoom, or text editing.

#### 17.3 Announcements

Use concise localized live regions for:

- Thread created/switched/renamed/archived;
- Agent selected or mention added/removed;
- Run queued/started/reconnecting/cancel requested/cancelled/completed/failed;
- Tool started/progress/completed/failed;
- approval required/submitted/accepted/rejected/expired/conflicted;
- delegation started/completed/failed;
- filter/search page load failure and retry;
- offline/reconnected state.

Do not announce every text token. Streamed text uses assistant-ui's accessible message behavior and announces meaningful completion/status transitions.

Nested sub-Agent messages have an accessible heading naming the specialist and status. Collapsed content exposes count/status; expanding does not create a second tab stop for every hidden control because nested Threads are read-only.

### 18. Loading, empty, offline, error, and edge states

| State | Required behavior |
|---|---|
| Provider/auth loading | Do not mount a cross-workspace runtime. Keep stable shell and render a restrained local loading state. |
| Agent catalog loading | Skeleton/avatar placeholders with no selectable fake Agent. |
| Agent catalog failed | Explicit retry and settings/assignment action where authorized; composer cannot claim unavailable identity. |
| No Agents assigned | Explain assignment requirement and provide management link where permitted. |
| New Thread | Lead Agent identity, capability summary, Plan/Build availability, and relevant starters; backend row may remain uninitialized until first intentional create/send action. |
| Thread initialization failed | Preserve draft/lead selection and expose retry; do not create a local-success Thread. |
| First-message race | Always await idempotent `initialize()` before Run creation; duplicate calls resolve to the same remote Thread. |
| List initial loading | Stable launcher/filter chrome with concise list bones. |
| List page failed | Keep previous rows, show an explicit retry row, and preserve cursor. |
| Search empty | State names the active query/filter and offers clear filters. |
| Run queued/running | Durable status, Stop when supported, public progress, and permission to leave/reconnect. |
| Waiting for Tool/approval | Owning Tool call opens or is discoverable; transcript and other reading remain usable. |
| Partial/incomplete | Preserve completed parts and label incomplete reason; do not display terminal success. |
| Stream disconnected | Show reconnecting; fetch Run snapshot/cursor. A closed connection alone changes no terminal status. |
| Cursor expired | Reconcile from authorized snapshot using server recovery metadata and explain any lost live continuity. |
| Offline | Disable server-owned sends/decisions, preserve unsent draft only, show reconnect state, and do not replay mutations automatically. |
| Permission lost | Disable new action, preserve safe draft, keep authorized readable history, and show access change. |
| Tool renderer missing | Redacted fallback with status, Tool identity, and diagnostic correlation; no raw JSON dump or hidden call. |
| Approval expired/conflict | Reload current Tool/Run state and require a fresh decision/preview. |
| Run failed | Explicit terminal failure, safe public evidence, retry-as-new-Run when allowed, and correlation ID. |
| Billing reconciliation failed | Message remains incomplete and Run failed; never show completed text after Credits failure. |
| Thread deleted elsewhere | Close/switch with announcement, preserve unsent draft separately, and reload list. |
| Workspace changed | Detach old runtime and clear tenant-scoped transient data before rendering the new workspace. |

Errors are selected by stable generated error codes. UI code does not parse exception prose to decide authorization, conflict, approval, retry, billing, or terminal state.

### 19. Product copy and i18n contract

All new visible strings use stable i18next keys and ship in `zh-CN` and `en-US`. This includes:

- Agent launcher, identity, availability, capabilities, and assignment errors;
- Plan/Build labels and descriptions;
- mention picker, invalid/stale mention, and collaboration copy;
- Thread list search/filter/archive/delete/rename/pagination states;
- Run, Tool, approval, delegation, usage, cancellation, reconnect, and terminal states;
- accessibility names, shortcuts, and live announcements;
- Tool fallback labels, including the current hard-coded “Used tool”, “Result”, “Allow”, “Deny”, “Confirm”, and “Back”.

Suggested semantic key families:

```text
ai:AGENT_LAUNCHER_TITLE
ai:AGENT_START_CONVERSATION
ai:EXECUTION_MODE_PLAN
ai:EXECUTION_MODE_BUILD
ai:MENTION_AGENT_LABEL
ai:THREAD_SEARCH_LABEL
ai:THREAD_FILTER_AGENT
ai:RUN_CANCEL_REQUESTED
ai:RUN_RECONNECTING
ai:TOOL_STATUS_RUNNING
ai:TOOL_APPROVAL_REQUIRED
ai:DELEGATION_MESSAGES_TITLE
ai:THREAD_MIGRATION_UNAVAILABLE
```

Repository locale naming conventions determine exact casing; stable semantic ownership is binding.

Copy rules:

- Use Agent for identity and Plan/Build for execution policy; never call an Agent a “mode”.
- “Smart project assistant” is removed; use the actual lead Agent name and role.
- Distinguish queued, running, waiting, cancel requested, cancelled, incomplete, failed, and completed.
- Do not say sent, saved, approved, applied, or completed until the corresponding server outcome is durable.
- Official Agent template descriptions and Tool summaries are localized through stable keys or trusted server localization metadata; custom Agent names remain user-authored content.
- Error copy explains what happened and the next action, with a separate correlation ID.
- Counts, durations, usage, Credits, dates, and relative times use locale-aware formatters.

### 20. Component and module boundaries

The target structure stays cohesive under `apps/admin/src/components/ai/**` and `components/assistant-ui/**`:

| Module | Responsibility |
|---|---|
| `ArclayerAssistantProvider` | Auth/workspace-scoped runtime, remote Thread list, Toolkits, protocol/reconnect, and lifecycle reset. |
| `arclayer-assistant-adapter` | Generated domain-to-assistant-ui mapping and command/event validation. |
| `thread-list-adapter` | Remote metadata CRUD, cursor mapping, initialization, and synchronous child provider. |
| `thread-query-controller` | Agent/project/status/archive/search/order query, cursor/error state, abort, and reload. |
| `agent-mention-adapter` | Stable wrapper around upstream unstable trigger APIs and structured ID extraction. |
| `AgentLauncher` | Pinned/recent avatars, all-Agent picker, availability, and new-thread start. |
| `ExecutionModeControl` | Per-Run Plan/Build selection and capability descriptions. |
| `AIConversationList` target composition | ThreadList primitives plus server metadata/filter controls; no parallel array authority. |
| `Thread` / `Composer` / base messages | Existing assistant-ui primitive compositions and accessibility behavior. |
| Toolkit modules | Reviewed render-only backend Tool registrations grouped by domain. |
| `DelegationTool` | Nested read-only sub-Agent messages and status. |
| `ChangeSetTool` / domain Tool UIs | Typed preview/diff/approval/result states. |
| transient AI UI store | Panel/dock/width/tab and non-sensitive preferences only. |
| draft adapter | Namespaced unsent text/attachments/mention IDs with revalidation. |

Boundary rules:

- Feature pages never import low-level legacy send helpers or protocol decoders.
- Runtime adapter code never imports feature stores to manufacture domain results.
- Tool renderers submit typed responses through the adapter; they do not call canonical domain APIs directly unless that Tool contract explicitly owns the call.
- Thread visual components do not know HTTP paths or backend event wire formats.
- Generated API types do not import assistant-ui or React.
- Only generic, proven primitives move to `packages/ui`; Arclayer Agent/Thread domain compositions stay in Admin.
- Avoid one-file-per-trivial-fragment decomposition, but split the current monolithic Thread artifact validators/renderers when they have distinct domain contracts and tests.

### 21. Hard-cut migration contract

Wave 1 switches frontend consumers and removes superseded paths in the same rollout.

#### 21.1 Remove three execution paths

Delete frontend conversation routing through:

1. generic `chatStream` / `/chat?stream=true`;
2. `executeAIWorkspaceAction` / `/chat/workspace-actions` as a conversation execution path;
3. project `agentRunStream` / `/projects/{projectId}/agents/runs/stream` as a separate composer mode path.

All Thread sends use the canonical workspace Thread/Run/Tool endpoints in master section 15.2. Domain-specific non-conversation generation endpoints may remain only under their canonical domain contract and must not synthesize Thread history.

Remove frontend helpers and branches whose only role is choosing among those paths, including:

- `sendAIChatMessage` and `sendAIChatMessageWithSignal`;
- `sendAIWorkspaceActionMessage` and `sendAIWorkspaceActionPlanMessage`;
- `sendAIAgentMessage` as a feature-level direct execution helper;
- mode branches in `AIChatRuntimeProvider`, Home, recommendations, and proposal cards;
- direct feature calls that append a local message or artifact after a legacy endpoint returns.

#### 21.2 Remove third mode and fixed Agent mapping

- Replace `AIComposerMode` with generated `ExecutionMode = "plan" | "build"`.
- Remove the `agent` value, `COMPOSER_MODES` third entry, and all `mode === "agent"` branches.
- Remove `agentIdForComposerMode`, fixed `content_builder`/`content_advisor` routing, `DEFAULT_AI_AGENT_ID`, and static Agent options.
- Lead Agent comes from initialized Thread metadata; mentioned Agents come from structured composer state.
- Historical third-mode Runs remain readable as legacy metadata, but they cannot be resent under `agent` mode.

#### 21.3 Remove browser conversation authority

- Replace `AIChatRuntimeProvider`'s `useExternalStoreRuntime` over `useAiChatStore` with the shared backend adapter/runtime selected in Wave 0.
- Remove Home's second runtime, queue runner, direct conversation creation, cancellation refs, and send branches.
- Remove Zustand `conversations`, `activeId`, `streaming`, append/finalize/replace methods, Agent Run metadata mutation, and whole-array persistence helpers.
- Remove `ensureAIConversationPersistedForRuntime`, `buildConversationRequestBody`, and snapshot POST/PATCH writes after backend clients switch.
- Replace custom Thread CRUD authority with `RemoteThreadListAdapter` and ThreadList primitives.
- Remove local `pinnedConversationIds` as authority; preserve pinning only through backend metadata if product keeps it.
- Remove legacy message `metadata.custom` artifacts once migrated to standard parts/Tools/events.

#### 21.4 Remove duplicated approval authority

- Move in-thread approval interaction to the Tool call renderer and canonical Tool-response/Run-resume APIs.
- Remove `AIApprovalQueue` from the active panel execution path.
- Any retained approval inbox becomes a projection/navigation surface and cannot maintain another local status lifecycle.

There is no production feature flag that permanently preserves the old runtime, whole-array store, or three send paths. Rollback is only the documented pre-cleanup Wave 0/1 deployment rollback; after cleanup, recovery is forward repair.

### 22. Data and browser migration fixtures

#### 22.1 Backend-normalized conversation migration

Frontend fixtures consume the backend migration outcomes required by the master contract:

- valid legacy conversation JSON becomes normalized Thread, Message, Part, Run, Tool/Approval/Delegation rows with count/hash evidence;
- invalid records render an explicit quarantined/archived migration state and support ID;
- historical Build and Plan metadata maps to the corresponding immutable Run mode;
- historical `agent` mode remains labelled as legacy identity-routing metadata and is read-only;
- existing Agent/run/tool IDs map to official versioned definitions where verified;
- no missing Tool call, approval, Agent result, or terminal event is invented to make a transcript render.

#### 22.2 Browser storage migration

Increment the AI UI storage version and migrate only allowed preferences:

- retain panel open/dock/width/tab preference where still supported;
- retain an unsent draft only under the documented draft-retention policy, namespaced to the authenticated user/workspace/Thread; never persist auth/approval tokens, Tool payloads, or uploaded file bytes with it;
- convert stored `build`/`plan` preference to `ExecutionMode` only after the selected lead Agent supports it;
- treat stored `agent` mode as unset and require the server/default Agent capability to resolve Plan/Build before send;
- validate any stored selected Agent against current assignments and use it only as an optional launcher suggestion, never as Thread identity;
- validate model/reasoning preference against Agent capability or clear it with explicit UI state;
- do not upload stale local message arrays or trust local Run status;
- do not preserve local Thread pins as authority unless an idempotent, authorized backend metadata migration is explicitly implemented;
- clear all tenant-scoped state on logout/user/workspace change.

#### 22.3 Runtime migration readiness

The new provider remains disabled for any workspace/tenant that fails normalized-row readiness. It displays explicit service unavailable/migration evidence and does not route to the legacy runtime.

### 23. Required regression fixtures

The frontend fixture set includes:

- authenticated workspace provider mount, auth-late reload, logout, user switch, and workspace switch without cross-tenant flash;
- real Agent assignments, official/custom Agents, no Agents, disabled Agent, entitlement-disabled Agent, catalog error, and proof of no static fallback;
- avatar launcher order, accessible names, All Agents search, idempotent initialization, and lead Agent immutability;
- `@Agent` keyboard selection, chip rendering, structured ID envelope, stale mention, pasted fake directive, multiple mentions, and no frontend fan-out;
- unified Plan and Build envelopes with identical lead Agent and different execution policies;
- Plan write prohibition and Build approval enforcement;
- first-message initialization race, duplicate idempotency retry, and no duplicate Thread/Run;
- Thread list Agent/project/status/archive/search/order filters, cursor pagination, superseded search, explicit page failure, and retry;
- rename/archive/restore/delete metadata reconciliation and active Thread outside filter;
- initial/new/empty/running/partial/reconnecting/cursor-expired/offline/permission-lost/deleted/migration-error Thread states;
- normalized text/source/file/image/tool/error part mapping with stable IDs and replay deduplication;
- edit/reload server branch behavior and absence of local history truncation;
- Toolkit registration with exact Tool names, render-only backend execution, unknown renderer, schema error, and redaction;
- Tool `running`, `complete`, every `incomplete` reason, `requires-action`, approval submit failure, conflict, expiry, and duplicate decision;
- “Always allow” only from server options and no browser-persisted grant;
- delegated specialist nested messages, inherited Tool renderers, recursion, read-only controls, child failure, and no extra top-level Thread;
- cancellation request versus terminal cancellation, disconnect without cancellation, terminal recovery, and billing reconciliation failure remaining incomplete;
- Home composer, global panel, creation-editor panel, and contextual recommendation using the same adapter path;
- responsive desktop/tablet/mobile/safe-area/keyboard behavior;
- focus restoration, live announcements, reduced motion, and no hover-only actions;
- `zh-CN` and `en-US` keys for every changed label, Tool fallback, error, and announcement;
- storage migration for Build, Plan, legacy Agent mode, invalid selected Agent/model, pins, draft, logout, and workspace switch;
- static source assertions proving legacy send helpers, third mode, fixed Agent mapping, whole-array persistence, duplicated Home runtime, static Agent fallback, and detached in-thread approval queue are gone.

Production runtime code cannot import test/capture event fixtures.

### 24. Automated verification matrix

| Change | Required evidence |
|---|---|
| Provider/runtime | Adapter contract tests, auth/workspace isolation, first-message initialization, and selected protocol integration test. |
| Unified envelope | Generated type alignment, exact Plan/Build/Agent IDs/context/idempotency assertions, and server validation integration. |
| Agent launcher/mentions | Component tests for loading/error/assignment, keyboard/focus, structured IDs, stale data, and no fan-out. |
| Thread list | Remote adapter contract tests, cursor/filter/search failure behavior, primitive semantics, and CRUD reconciliation. |
| Parts/Tools | Schema fixtures for every part/status, Toolkit registration test, unknown/redacted fallback, and no browser execution of backend Tools. |
| Approval | Tool-call metadata, typed response, idempotency, conflict/expiry/permission failure, and server-authoritative terminal state. |
| Delegation | Nested `MessagePartPrimitive.Messages`, read-only recursion, parent/child attribution, and no top-level child Thread. |
| Reconnect/cancel | Real selected transport integration, event replay/dedup/order, cursor expiry, disconnect, cancel acknowledgement, terminal recovery, and Credits failure ordering. |
| Zustand/storage hard cut | Source assertions and migration tests proving only permitted transient preference/draft state remains. |
| Responsive/a11y | Keyboard-only flow, focus restoration, announcements, mobile sheet/list navigation, `44px` touch targets, and reduced motion. |
| i18n | Both locales, Tool fallback strings, official Agent copy strategy, error-code mapping, and no raw new product strings. |
| Hard cut | Search and route tests proving all three legacy execution paths and compatibility facades have no frontend consumer. |

Implementation runs `pnpm admin:check`; backend/client protocol changes run the matching cross-app `pnpm check`. The Wave 0 protocol spike includes real FastAPI/LangGraph integration and reconnect/cancellation evidence, not only mocked component tests.

### 25. Acceptance scenarios

#### Good

The user opens the conversation tab and sees recent assigned Agent avatars above Search and Filter. They activate Content Writer, which initializes one backend Thread with Content Writer as stable lead Agent. They select Plan and type `@SEO Strategist`. The composer renders a chip and sends one envelope containing both stable Agent IDs. The backend delegates through `agent.delegate`; nested SEO messages render read-only inside that Tool call. The lead Agent returns a candidate ChangeSet. Switching to Build and accepting a draft edit creates a typed Tool/approval flow. Refresh during execution reloads normalized history, resumes from the authorized cursor, and shows terminal completion only after usage/Credits and Run persistence succeed.

#### Base

A mobile viewer opens an existing project Thread. They can search Threads, inspect Tool evidence and nested Agent output, and copy text. Build/apply controls explain missing permission. The Agent panel uses a full-height sheet, preserves the draft when closed, restores focus, and does not hide Plan/Build, Stop, or conversation navigation.

#### Bad

The UI maps Plan to a fixed advisor, maps Build to a fixed builder, and exposes a third Agent mode. Home calls a separate workspace-action endpoint, the drawer calls generic chat, and mentions call several project Agent streams. Zustand appends deltas, replaces the full message array, marks a closed stream complete, stores an approval locally, and PATCHes the snapshot. On catalog failure it shows static Agents; on reconnect failure it displays cached success. This violates identity, execution, persistence, delegation, approval, tenant, and terminal contracts.

### 26. Wrong vs correct

#### Wrong: three browser-selected execution paths

```ts
if (mode === "plan") return sendChat(history);
if (mode === "agent") return sendAgent(selectedAgentId, text);
return executeWorkspaceAction(text);
```

#### Correct: one durable Run command

```ts
await assistantAdapter.startRun({
  threadId,
  leadAgentId,
  mentionedAgentIds,
  executionMode,
  workspaceId,
  projectId,
  siteRevisionId,
  message,
  idempotencyKey,
});
```

The backend validates identity, mode, grants, delegation, permissions, approvals, and Tool routing.

#### Wrong: local history authority

```ts
store.appendDelta(threadId, delta);
store.finalizeLastAssistant(threadId);
await patchConversation({ messages: store.messages });
```

#### Correct: event projection and durable recovery

```ts
for await (const event of assistantAdapter.events(runId, cursor)) {
  runtimeProjection.applyValidatedEvent(event);
}

await assistantAdapter.reloadThread(threadId);
```

The runtime projects persisted IDs/sequences; it does not write an authoritative message snapshot.

#### Wrong: static Agent fallback

```ts
const agents = response?.agents ?? STATIC_AGENT_OPTIONS;
```

#### Correct: explicit catalog state

```ts
if (catalog.status === "error") return <AgentCatalogError error={catalog.error} />;
if (catalog.data.agents.length === 0) return <NoAssignedAgents />;
return <AgentLauncher agents={catalog.data.agents} />;
```

### 27. Definition of done

The AI Agent experience is complete only when:

- one authenticated provider exposes one backend-owned Thread list/runtime across Home, global conversation UI, and creation editor;
- every send uses the canonical workspace Thread/Run envelope with independent Plan/Build and stable lead/mentioned Agent IDs;
- launcher avatars and `@Agent` mentions use real assignments, structured IDs, accessible interaction, and no static fallback or browser fan-out;
- backend Thread/Message/Part/Run/Tool/Approval/Delegation/event state replaces Zustand and whole-array snapshot authority;
- existing assistant-ui primitives remain the visual interaction foundation;
- Toolkit APIs register render-only backend Tools, approvals stay on Tool-call metadata, and delegated messages render read-only inside the delegation Tool;
- conversation list search/filter/order/pagination is server-owned and exposes page/reconnect errors;
- reconnect, cancellation, terminal, usage, and Credits ordering are proven against the selected real protocol;
- responsive, keyboard, screen-reader, focus, reduced-motion, and bilingual copy contracts pass;
- the third mode, fixed Agent mappings, three legacy execution paths, duplicated Home runtime, static Agent catalog, whole-array persistence, legacy metadata artifacts, and detached in-thread approval authority are removed in one hard cut;
- migration fixtures prove historical Runs remain truthful and no missing message, Tool result, approval, Agent output, or completion is invented.
