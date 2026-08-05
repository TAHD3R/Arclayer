# Platform AI Operations Contract

Status: Approved domain contract
Parent: [Platform Control Plane Productization Rollout](./admin-control-plane-rollout.md)
Experience authority: [Product and Platform administration experience redesign](./product-admin-experience-redesign.md)

## 1. Scope

This contract defines one Platform AI Operations Domain for cross-Workspace AI task investigation and recovery, model and provider readiness, official Agent and Skill availability, Platform action policy, and runtime operations.

“Platform AI Operations” is the canonical architecture term. The product label is `AI 服务 / AI Services`; primary navigation and copy use recognizable tasks rather than framework, policy, or state-machine terminology.

## 3. Information architecture

AI Services opens **AI tasks** by default and contains these peer operational surfaces:

1. **AI tasks**: failed, stuck, retrying, Provider-blocked, and approval-waiting tasks with Workspace and Project context, age, last durable progress, a customer-safe failure summary, and authorized retry, cancel, or deep-link actions.
2. **Models & providers**: Provider readiness and health, configured models, routing rules, defaults, safe secret rotation, connection testing, and unresolved configuration blockers.
3. **Built-in assistants**: official Agent templates and versions, availability, assignments, default assistant selection, compatibility, and publication or disable operations.
4. **Built-in skills**: the Arclayer-maintained Skill package catalog, immutable versions, validation evidence, publication state, Workspace adoption impact, disabling, and retirement. Package metadata may be edited; changing instructions or resources always creates a new immutable version.
5. **Actions & policies**: official Tool catalog, write/external effects, maximum Platform policy, approval requirements, data-egress disclosure, routing/recovery policy, and policy conflicts. Queue, worker, recovery-storage, interruption, cancellation, and retention configuration appears in the relevant provider, task, or policy dossier rather than a technical Runtime settings page.

The domain has no metric-card Overview. A condition appears in AI tasks or Needs attention only when it identifies affected work, operational consequence, and a real resolution path.

## 4. Authority boundaries

- A Platform Operator may investigate an approval-waiting task but cannot approve, reject, edit, or apply Workspace work on behalf of its authorized actor.
- Workspace-authored Knowledge, Skills, Design Systems, Agents, Threads, and project content remain in the Product Application. Platform AI Operations owns only the official built-in Skill catalog and may show sanitized Workspace adoption impact without editing Workspace installations or content.
- Commerce owns commercial budgets, Credits, Entitlements, and provider-independent settlement. AI Services may show an authorized operational limit or blocker and deep-link to the exact Plans & Billing context without editing commercial state.
- Monitoring & Audit owns historical cost, volume, latency, token, and failure analysis. AI services owns the current task, readiness, and recovery action rather than a second analytics dashboard.
- Extensibility owns Connector installation and trust lifecycle; AI services owns AI-specific enablement, routing readiness, model exposure, and operational use of an installed Connector.
- Workspaces owns cross-tenant Workspace/User/Project investigation and receives exact AI-task deep links only when an investigation starts from an entity directory.

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

The hard cut removes `/system/settings/agents` after each retained capability moves to `/ai/tasks`, `/ai/providers`, `/ai/assistants`, `/ai/skills`, or `/ai/policies` with a Platform Capability, action-scoped Platform Permission, complete lifecycle, readiness, failure, verification, and audit contract. Workspace-bound usage moves to its owning Product or Plans & Billing surface, historical analysis deep-links to Monitoring & Audit, and raw framework controls move to authorized diagnostics or disappear when no supported operator decision requires them. The old settings page, registry/search items, duplicate forms, and compatibility route are removed together.
