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
5. **Actions & policies**: one deployment-wide, revisioned AI policy plus the official Tool catalog. The policy owns permitted models, default routing, per-task Credit ceiling, per-Workspace concurrency, effect-class approval requirements, external-data-egress permission, and runtime recovery boundaries. Queue, worker, recovery-storage, interruption, cancellation, and retention configuration appears in the relevant provider, task, or policy dossier rather than a technical Runtime settings page.

The domain has no metric-card Overview. A condition appears in AI tasks or Needs attention only when it identifies affected work, operational consequence, and a real resolution path.

### 3.1 AI tasks

The task queue defaults to unresolved and recently active work. It supports server-filtered status, Workspace, Project, assistant/version, Provider/model, failure class, waiting reason, and time filters. Each row opens a task dossier containing:

- the durable Run, Job, execution-attempt, interruption, settlement, and recovery timeline;
- sanitized input/output summaries, actual changes or artifacts, usage, cost, policy revision, Agent/Skill versions, correlation identifiers, and the exact last durable progress;
- structured failure code, safe explanation, retryability, affected side effects, and the authority that owns the next action;
- server-authorized `retry`, `cancel`, and `reconcile` actions with eligibility, unavailable reason, idempotency, confirmation, receipt, and Audit evidence.

Retry creates a new attributable attempt without rewriting the failed attempt. Cancellation is available only at a declared safe boundary. Reconciliation repairs durable event/projection/settlement consistency without rerunning the model or modifying customer content. An approval- or human-input-waiting task links to the owning Product Application context but exposes no Platform answer or approval action.

### 3.2 Built-in assistants

The assistant catalog manages deployment-owned official Agent definitions only. It provides create, read, metadata update, archive/restore where eligible, version history, validation, publication, retirement, rollback, assignment impact, and usage/failure evidence.

- Definition identity metadata may be updated with optimistic revision checks.
- Runnable configuration is an immutable version in `draft | validated | published | retired` lifecycle.
- Publishing validates model/provider readiness, Tool and Skill dependencies, Platform AI Policy compatibility, supported execution modes, and approval profile.
- New tasks use the published version selected by current policy; running and historical tasks retain their recorded version.
- Referenced definitions or versions are never hard-deleted. A never-published, unreferenced draft may be deleted through an exact eligible action.
- Every text input has an instructional placeholder. Catalog-backed values use Select controls whose items include a plain-language description and availability or risk context.

### 3.3 Built-in skills

The Skill catalog supports manual creation, GitHub/ZIP import, detail, metadata update, immutable versions, validation evidence, publication, retirement, rollback, and adoption impact. Imported packages enter an isolated draft and are not selectable until validation and publication succeed.

The server capability catalog supplies stable, localized entries for capability labels, Tool requirements, permission actions, external destinations, data classes, and supported reference MIME types. Each entry includes display name, description, risk, availability, and relevant compatibility constraints. High-risk declarations never fall back to arbitrary text when the catalog is unavailable. Free text remains only for human explanations, intended use, transfer purpose, reference path/content, and similar authored content, with placeholders on every input.

### 3.4 Actions & policies

There is one deployment-wide Platform AI Policy. It covers model/provider routing, allowed/default models, per-task token and cost ceilings, concurrency and timeout boundaries, retry/recovery policy, Tool allowlist, approval effect classes, external data transfer, retention, Audit level, and runtime availability. A field is exposed only when an owning runtime boundary enforces it.

Policy editing uses Draft -> Preview -> Publish -> Apply:

- saving a Draft is routine Platform Session work;
- Preview returns catalog validation, unsupported controls, affected assistants/skills/Workspaces/tasks, and a revision-bound hash;
- high-risk Publish/Apply requires exact permission, explicit reason, current preview, action-bound verification when classified, and Audit evidence;
- new accepted work records the effective policy revision; running work retains attribution while every later model, Tool, egress, retry, resume, or worker effect re-evaluates current authority as required by this contract;
- missing or unsupported controls block publication explicitly and never save as ineffective configuration.

All choices come from server catalogs and use described Select items. Numeric and textual inputs include domain examples or expected-unit placeholders.

### 3.5 Monitoring deep link

Historical AI analysis remains in Monitoring & Audit at `/monitoring/ai-usage`. That surface combines current runtime-health summaries, historical trends, and task-level drill-down for Workspace, Project, assistant/version, Skill/version, Provider/model, policy revision, status, usage, cost, latency, retry, cancellation, and sanitized failure evidence. It is read-only and deep-links to AI tasks for recovery.

Raw prompts, responses, Tool arguments/results, Knowledge, and external content remain unavailable unless the actor has the exact support-read permission and a current case-bound, named-operator, scoped, read-only, expiring Support Access Grant. Monitoring never treats a personal preference as blanket content authorization.

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
- AI Services is globally available when the deployment AI capability is installed, enabled, configured, and healthy. It has no selected-Workspace rollout, percentage, cohort, or hidden exception. Workspace Plan Entitlement, member allocation where applicable, Workspace Permission, member Credit limit, Workspace Credits, and runtime readiness remain independent Product API and worker gates.
- AI policy changes are Draft-to-published immutable revisions. Publishing requires validation against the current model/provider and Tool catalogs, a revision-bound impact preview, explicit apply, and Audit evidence. A published policy is the one maximum deployment policy; Workspaces cannot create, weaken, or override it.
- The runtime re-evaluates the current published policy before accepting a Run and before every model, Tool, external-egress, retry, resume, or worker effect. A queued request does not preserve a model, Tool, approval, concurrency, egress, or Credit ceiling that the new policy removed.
- Policy fields appear only when their owning runtime boundary enforces them. Unsupported retention, routing, Tool, or approval controls fail policy validation and do not appear as saved-but-ineffective settings.

## 7. Non-goals

- Recreating Workspace Customization, conversation, approval, or content-editing surfaces.
- Recreating Commerce budgets or Monitoring & Audit trends as cards.
- Exposing framework switches and Provider enums as the primary navigation model.
- Treating every pending approval, failed user prompt, or ordinary cancellation as an operator incident.
- Allowing a Platform Operator to impersonate a Workspace approver.

## 8. Migration contract

The hard cut removes `/system/settings/agents` after each retained capability moves to `/ai/tasks`, `/ai/providers`, `/ai/assistants`, `/ai/skills`, or `/ai/policies` with a Platform Capability, action-scoped Platform Permission, complete lifecycle, readiness, failure, verification, and audit contract. Workspace-bound usage moves to its owning Product or Plans & Billing surface, historical analysis deep-links to Monitoring & Audit, and raw framework controls move to authorized diagnostics or disappear when no supported operator decision requires them. The old settings page, registry/search items, duplicate forms, and compatibility route are removed together.
