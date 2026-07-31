# Platform AI Operations Contract

Status: Approved domain boundary; detailed workflows remain subject to product grilling
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)

## 1. Scope

This contract defines one Platform AI Operations Domain for cross-Workspace AI task investigation and recovery, model and provider readiness, official Agent availability, Platform action policy, and runtime operations.

“Platform AI Operations” is the canonical architecture term. The product label is localized as “AI 服务” / “AI services”; primary navigation and copy use recognizable tasks rather than framework, policy, or state-machine terminology.

## 2. Current-state evidence

- `/system/settings/agents` is one long page that combines Agent enablement, default mode/model, Provider credentials, model catalog, a Workspace-bound monthly usage summary, write approval policy, dry-run policy, LangGraph enablement, checkpointer selection, checkpoint retention, and interruption recovery.
- the page uses settings-oriented labels and metric rows even when the operator's real need is to diagnose unavailable models, failed Runs, unsafe policy, or runtime recovery.
- durable AI Runs, approvals, model/provider state, Agent versions, queues, checkpoints, and usage evidence already exist across the platform contracts, but they are not composed into one cross-Workspace operations queue.

## 3. Information architecture

AI services opens the **AI tasks** queue by default and contains these peer operational surfaces:

1. **AI tasks**: failed, stuck, retrying, Provider-blocked, and approval-waiting tasks with Workspace and Project context, age, last durable progress, a customer-safe failure summary, and authorized retry, cancel, or deep-link actions.
2. **Models & providers**: Provider readiness and health, configured models, routing rules, defaults, safe secret rotation, connection testing, and unresolved configuration blockers.
3. **Built-in assistants**: official Agent templates and versions, availability, assignments, default assistant selection, compatibility, and publication or disable operations.
4. **Actions & approvals**: official Tool catalog, write/external effects, maximum Platform policy, approval requirements, data-egress disclosure, and policy conflicts.
5. **Runtime settings**: queues, workers, recovery storage, interruption/resume, cancellation, retention, and advanced diagnostics.

The domain has no metric-card Overview. A condition appears in AI tasks or the Operations Inbox only when it identifies affected work, operational consequence, and a real resolution path.

## 4. Authority boundaries

- A Platform Operator may investigate an approval-waiting task but cannot approve, reject, edit, or apply Workspace work on behalf of its authorized actor.
- Workspace-authored Knowledge, Skills, Design Systems, Agents, Threads, and project content remain in the Product Application. Platform AI Operations may show sanitized identity and progress needed for investigation without becoming their editing authority.
- Commerce owns commercial budgets, Credits, Entitlements, and provider-independent settlement. AI services may show an authorized operational limit or blocker and deep-link to the exact Commerce context without editing commercial state.
- Monitoring & Audit owns historical cost, volume, latency, token, and failure analysis. AI services owns the current task, readiness, and recovery action rather than a second analytics dashboard.
- Extensibility owns Connector installation and trust lifecycle; AI services owns AI-specific enablement, routing readiness, model exposure, and operational use of an installed Connector.
- Tenant Governance owns cross-tenant Workspace/User/Project governance and receives exact AI-task deep links only when an investigation starts from an entity directory.

## 5. Product copy and i18n

Every visible string uses stable i18n keys with equivalent `zh-CN` and `en-US` resources. Primary copy describes the affected task and next action:

- use “AI 任务 / AI tasks,” not “Run control plane”;
- use “任务正在等待工作空间审批 / Waiting for workspace approval,” not a raw interrupt enum;
- use “任务恢复数据 / task recovery data,” not “LangGraph checkpointer” outside advanced diagnostics;
- use “当前模型不可用 / Selected model unavailable,” followed by the affected scope and recovery action, not a raw routing exception.

Provider request ids, framework names, checkpoint ids, model-routing evidence, token detail, and raw exceptions appear only in authorized diagnostics. Errors state whether the task changed, whether retry is safe, and which authority owns the next action.

## 6. Operational behavior

- Task status derives from durable Run, Job, queue, checkpoint, Provider, approval, and settlement facts; the frontend never infers success from a closed stream or missing update.
- Retry and cancellation eligibility are server-authoritative, idempotent, audited, and explicit about effects that already occurred.
- Provider/model readiness distinguishes installed, configured, reachable, permitted, routable, and healthy instead of collapsing them into `enabled`.
- A Workspace approval wait is not automatically a platform incident. It becomes an Operational Signal only when an owning policy defines a breached deadline or infrastructure fault requiring operator action.
- Sensitive prompts, generated content, Knowledge, Tool arguments/results, and secrets remain redacted unless a narrower diagnostic permission and audit contract explicitly authorize access.

## 7. Non-goals

- Recreating Workspace Customization, conversation, approval, or content-editing surfaces.
- Recreating Commerce budgets or Monitoring & Audit trends as cards.
- Exposing framework switches and Provider enums as the primary navigation model.
- Treating every pending approval, failed user prompt, or ordinary cancellation as an operator incident.
- Allowing a Platform Operator to impersonate a Workspace approver.

## 8. Migration contract

The hard cut removes `/system/settings/agents` after each retained capability moves to an exact AI services surface with a Platform Capability, action-scoped Platform Permission, readiness state, failure behavior, and audit contract. Workspace-bound usage cards move to their owning Product/Commerce surface, historical summaries deep-link to Monitoring & Audit, and raw LangGraph/checkpointer controls move to advanced diagnostics or disappear when no supported operator decision requires them. The old settings page, registry/search items, duplicate forms, and compatibility route are removed together.
