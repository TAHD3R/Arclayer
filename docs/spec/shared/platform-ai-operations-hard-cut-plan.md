# Platform AI Operations Hard-Cut Execution Plan

**Status:** Confirmed execution plan
**Date:** 2026-08-07
**Scope:** `apps/api`, `apps/app`, `apps/platform`, generated OpenAPI clients, AI runtime workers, PostgreSQL migrations, platform i18n, and focused monitoring projections.
**Canonical contracts:** [Platform AI Operations Contract](./admin-ai-operations.md), [AI Agent Runtime Protocol Contract](./ai-agent-runtime-protocol.md), and [Product Application AI Agent Experience Contracts](../app/frontend/ai-agent-experience.md).

## 1. Outcomes

This hard cut must deliver all of the following as one coherent system:

1. Repair the current local Docker PostgreSQL conflict without deleting unrelated AI history and remove the `tool_call_id` race that can reproduce it.
2. Preserve the assistant question and user answer as durable ordered messages through interrupt, resume, refresh, and reconnect.
3. Turn `/ai/tasks` into an actionable cross-Workspace investigation and recovery queue.
4. Turn `/ai/assistants` into complete lifecycle management for official Agent definitions and immutable versions.
5. Replace free-form high-risk Skill declarations with described server catalogs and complete Skill version/import lifecycle.
6. Turn `/ai/policies` into the complete deployment-wide, revisioned, enforced Platform AI Policy.
7. Turn `/monitoring/ai-usage` into read-only runtime-health, historical analysis, and task-level investigation with Support Access Grant protection for customer content.

## 2. Locked decisions

- Platform Operators diagnose and safely recover tasks but never answer, approve, edit, or apply Workspace-owned work.
- Database repair is exact and evidence-preserving. Only the current local Docker database is mutated by this execution; other environments receive a reviewed runbook.
- Retry creates a new attributable attempt. Cancel and reconcile are server-authorized, idempotent actions with explicit eligibility and receipts.
- Official Agent and Skill behavior is immutable and versioned. Referenced history is archived or retired, not hard-deleted.
- High-risk Tool, permission, data-class, destination, and capability values come from server catalogs with descriptions and risk context.
- The Platform AI Policy is one deployment-wide maximum policy. Agent and Skill declarations cannot widen it.
- Monitoring exposes complete operational metadata but raw customer content requires exact permission plus a current Support Access Grant.
- API, database, generated clients, and frontends switch through a coordinated hard cut. No permanent legacy facade or silent fallback remains.

## 3. Current failure evidence

- `AgentMessagePartV1Record.tool_call_id` is globally unique, while interruption normalization performs a separate existence check before insert. Concurrent workers can both pass the check and one later fails on `ai_message_parts_tool_call_id_key`.
- The Product Application creates human answers with a browser-only `human-result:*` identity and retains them in local component state. That state cannot be the durable transcript authority and can diverge when the resumed snapshot changes Tool status.
- AI policy editing exposes only part of the persisted schema and writes several controls as empty arrays or zero values.
- Skill Tools use a bare-ID Select, while permissions, data destinations, data classes, and capability labels remain free-form.
- AI usage currently provides model/provider grouping only and lacks runtime summary, trends, task drill-down, version/policy attribution, and structured failure investigation.

## 4. Wave 0 - Preflight and evidence capture

### Repository and schema discovery

- Refresh GitNexus if stale and run impact analysis before changing each runtime, repository, service, reducer, or page symbol.
- Capture the exact OpenAPI operations, Platform Permissions, models, migrations, and generated client consumers for tasks, assistants, Skills, policies, and AI usage.
- Record the current PostgreSQL constraint definitions and all foreign-key or logical references to the affected message part, Tool response, Run, interruption, approval, and event rows.

### Local database diagnosis

- Connect with the repository Docker Compose PostgreSQL service; do not invoke the API virtualenv directly.
- Export the row for `call_00_mm1q4jHDxsAU75R52hum2328` plus its message, Run, Thread, events, Tool responses, approval/interruption, and Job/attempt records.
- Determine whether the existing row is canonical, orphaned, or belongs to an incomplete prior attempt. A uniqueness violation normally means the second insert failed; do not assume two committed duplicate rows exist.
- Save the diagnostic SQL and result shape in the task evidence. Do not include customer content or secrets in committed documentation.

### Exit criteria

- The owning Run and every reference to the conflicting Tool identity are known.
- The repair transaction and rollback query are reviewed before mutation.
- The intended canonical identity model is proved against interrupt/resume, approval, delegation, replay, and retry paths.

## 5. Wave 1 - Tool identity and local data repair

### Canonical identity model

- Generate an Arclayer-owned public `tool_call_id` before any Tool event or projection is persisted.
- Store a Provider/LangGraph-supplied call identifier separately as non-authoritative provenance when required for resume or diagnostics.
- Remove check-then-generate collision avoidance. Canonical public IDs are created once and flow through Tool parts, interruption, approval, responses, events, snapshots, and resume commands.
- Keep the database uniqueness constraint on the canonical public identity. Treat a repeated canonical ID with mismatched ownership as an explicit integrity error.
- Make event append and message-part projection idempotent by stable event/source identity so worker redelivery returns the existing projection or rejects a conflicting payload.

### Migration and repair

- Add/backfill any provider-call provenance column and update indexes/constraints through a reviewed migration.
- Run a transaction against the local Docker database that preserves the canonical row, repairs references or Run state, and removes only a proven orphaned projection.
- If ownership cannot be proved, retain the row and mark the affected task as an explicit recoverable integrity failure instead of deleting evidence.
- Re-run the exact failing task through the normal command path; do not insert a synthetic success row.

### Tests

- Concurrent interruption projection with the same Provider call identifier.
- Worker redelivery of the same event/source identity.
- Two Runs receiving an identical Provider identifier but distinct canonical Tool identities.
- Resume, approval, cancellation, reconciliation, and snapshot replay after the migration.
- A focused regression fixture for the reported constraint error.

## 6. Wave 2 - Durable human question and answer

### Backend protocol

- Persist the assistant's user-visible human-input question as an assistant text message part before `run.interrupted` commits.
- Accept the human Tool response idempotently and persist exactly one user text message before `run.resumed` commits.
- Return or project the persisted response message identity; replay and snapshots include both question and answer in order.
- Tool status changes to answered/completed/failed without deleting or replacing either message.

### Product Application adapter

- Remove browser-owned sent-answer authority such as `localHumanResultMessages` and `human-result:*` message IDs.
- Reconcile the response from server identity, replace backend-owned Run state from snapshots, and preserve unrelated Thread history through the backend Thread message API.
- Deduplicate by event/message identity and sequence, never by matching text.
- Render the question as an ordinary assistant message, the answer as an ordinary user message, and the Tool card as execution status.

### Tests

- Ask -> interrupt -> answer -> resume -> new assistant output preserves every message.
- Refresh and thread switch during each stage produce the same transcript.
- Duplicate response submission creates one message and one resume transition.
- Resume failure leaves an explicit retry state and does not lose the accepted answer.
- Existing approval Tool behavior remains separate from human input.

## 7. Wave 3 - Platform API contracts

### AI tasks

- Add server-filtered queue and dossier resources for status, attempt, Workspace, Project, Agent/version, Skill/version, Provider/model, policy revision, waiting reason, failure class, age, usage, settlement, and correlation.
- Project a complete ordered timeline from durable Run, Job, attempt, event, interruption, approval, settlement, and recovery facts.
- Return structured action availability for retry, cancel, reconcile, and deep links, including unavailable reason and confirmation metadata.
- Keep diagnostics sanitized by default and gate raw customer content behind exact support permission plus Support Access Grant validation.

### Assistants

- Complete definition create/read/update/archive/restore and eligible unreferenced-draft delete operations.
- Add version draft, validation report, publish, retire, rollback, comparison, assignment impact, and usage/failure evidence.
- Return server catalogs for approval profiles, execution modes, Tool grants, Skills, model policies, compatibility, and availability descriptions.

### Skills

- Expand the capability endpoint to described catalogs for Tools, permissions, destinations, data classes, capability labels, and reference MIME types.
- Add isolated import draft, validation report, immutable version publish, retire, rollback, archive/restore, and adoption impact.
- Reject unregistered high-risk declarations; do not accept a client free-text fallback.

### Platform AI Policy

- Expose every enforced policy field: routing, allowed/default models, task Token/cost ceiling, concurrency, timeout, retry/recovery, Tool allowlist, approval effect classes, external egress, retention, Audit level, and runtime availability.
- Implement Draft, Preview, Publish, Apply, and revision history with catalog validation, impact, drift protection, reason, Step-up classification, idempotency, and Audit.
- Remove unsupported controls from the contract or implement their owning enforcement boundary before exposure.

### AI usage

- Add current runtime-health summary, historical series, grouped breakdowns, task-level records, and drill-down detail.
- Support filters for time range, Workspace, Project, Agent/version, Skill/version, Provider/model, policy revision, status, failure class, and correlation.
- Return real measured usage/cost only; missing or expired telemetry remains explicit.

## 8. Wave 4 - Generated clients and Platform Console redesign

Regenerate OpenAPI clients only after the API contract and migrations are stable. Remove superseded client types and compile all consumers in the same rollout.

### `/ai/tasks`

- Use a dense operational queue with filters, status and waiting-reason badges, age/last-progress, Workspace/Project, Agent/model, usage, and failure summary.
- Open a dossier with overview, attempts/timeline, messages/artifacts summary, usage/settlement, diagnostics, and Audit/links.
- Show only server-returned actions. Disabled actions include the exact reason; destructive or ambiguous recovery requires confirmation.

### `/ai/assistants`

- Provide searchable catalog, lifecycle filters, create/edit metadata, version editor, validation report, comparison, publish, rollback, retire, archive/restore, and usage/adoption views.
- Every Input/Textarea has a localized placeholder. Catalog values use described Select items.
- Editing a published configuration always creates a draft version.

### `/ai/skills`

- Preserve manual, GitHub, and ZIP entry points but create isolated drafts.
- Replace capability tags, Tools, permissions, destinations, data classes, and MIME types with catalog Select or multi-select controls.
- Each Select item shows label, explanation, risk/availability, and compatibility where relevant.
- Keep authored purpose/instructions/reference content as placeholder-backed text inputs.

### `/ai/policies`

- Organize controls by routing, budgets, execution, Tools/approvals, egress/security, retention/audit, and runtime availability.
- Initialize the editor from the current draft or applied revision; never render zero/empty defaults as if they were loaded policy.
- Provide preview diff, blockers, affected scope, publish/apply state, revision history, and rollback where the server contract permits it.

### `/monitoring/ai-usage`

- Show current runs, waits, failures, queue latency, and Provider readiness separately from the historical time filter.
- Add historical request/success/error, Token, cost, latency, retry, and cancellation trends.
- Support group-by and task-level drill-down with saved views, custom date range, refresh status, pagination, and export.
- Keep the page read-only; recovery deep-links to `/ai/tasks`.

### UI quality gates

- Use `@arclayer/ui`, lucide icons, stable i18n keys, explicit loading/error/empty states, and the Platform visual language.
- Avoid dashboard-only summary cards with no action or investigation value.
- Verify keyboard operation, focus, responsive layout, non-overlap, long localized text, and described Select items in desktop and mobile Playwright screenshots.

## 9. Wave 5 - Hard cut and cleanup

- Apply database migrations and backfills first.
- Deploy API/workers with the new canonical contract and verify readiness/catalog endpoints.
- Regenerate and deploy Product Application and Platform Console clients together.
- Remove local sent-message fallback state, old policy placeholder writes, free-form high-risk Skill fields, obsolete task summaries, and superseded API/client contracts.
- Run `gitnexus_detect_changes()` before any implementation commit and confirm affected flows match this plan.

No legacy compatibility route, duplicate form, silent model fallback, arbitrary permission input, or fake-success recovery remains after the cut.

## 10. Validation matrix

### Focused checks during implementation

- API Tool identity, projection, interrupt/resume, task actions, catalog, policy, and usage tests through repository scripts; focused backend nodes start with a 60-second diagnostic timeout.
- Product Application Vitest coverage for reducer, snapshot, provider, adapter, Tool renderer, and transcript persistence.
- Platform Vitest coverage for each page model, API adapter, filter/search state, validation, action eligibility, placeholders, and i18n.
- Migration upgrade/backfill tests from representative existing data and explicit failure fixtures.

### Milestone gates

- `pnpm api:check` after Waves 1 and 3.
- `pnpm app:check` after Wave 2 and the final Product Application cut.
- `pnpm platform:check` after Wave 4.
- `pnpm check` for final cross-app integration when all generated clients and migrations are aligned.
- Browser acceptance for the reported conversation flow and all redesigned Platform routes.

### Final acceptance

- The local conflicting task runs or fails with a new explicit domain error; it never raises the unique-constraint collision again.
- The prior assistant question remains visible after answer, resume, refresh, and thread switching.
- Every Platform page exposes real data, actionable errors, exact permissions, and no placeholder mutation path.
- Assistants and Skills have complete immutable-version lifecycle and safe archive/delete rules.
- Every high-risk choice is discoverable through a described server catalog.
- The applied Platform AI Policy is fully visible, validated, enforceable, revisioned, and attributable.
- AI usage supports real-time summary, historical trends, task drill-down, and Support Access Grant-protected content.
