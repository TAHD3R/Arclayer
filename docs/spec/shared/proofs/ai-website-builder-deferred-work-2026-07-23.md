# AI Website Builder Deferred Work and Expectation Gap Register

**Status:** Implementation paused pending product expectation recalibration
**Recorded:** 2026-07-23
**Scope:** AI website builder, multi-Agent workflows, content management, Workspace capabilities, Taskiq, commercialization, project settings, motion, and route skeletons
**Document type:** Point-in-time gap and resumption evidence; not a new normative implementation contract

## 1. Purpose

The repository already contains many pages, APIs, persistence models, background jobs, and automated tests. Their existence does not mean that the product matches the intended experience, and it does not constitute UI, interaction, capability, or end-to-end acceptance.

Work is paused because the current implementation differs materially from the expected product in both UI and capability. The product owner will recalibrate those expectations before implementation resumes. During the pause, route presence, test success, or a functioning backend vertical must not be used to describe the capabilities below as complete.

The existing target baseline remains available in:

- `docs/spec/shared/ai-website-builder-platform.md`
- `docs/spec/shared/ai-agent-runtime-protocol.md`
- `docs/spec/shared/workspace-commercialization.md`
- `docs/spec/admin/frontend/product-ui-toolchain.md`
- `DESIGN.md`

If the recalibrated product direction changes an existing boundary, the owning normative specification must be updated and reviewed before implementation resumes. This file records only unfinished scope, known expectation gaps, and resumption constraints.

## 2. Completion semantics

Future status reports must distinguish these levels:

1. **Foundation exists:** a model, API, component, task, or prototype page exists.
2. **Vertical runs:** a frontend/backend path executes and has focused verification evidence.
3. **Product acceptance is complete:** UI, interaction, copy, authorization, error states, performance, and the end-to-end outcome satisfy the recalibrated product expectation.

Every area in this register remains below the third level. Whether an existing foundation should be reused must also be reassessed after product expectations are recalibrated.

## 3. Unfinished capability register

### 3.1 Full-screen AI website editor

- `/projects/{projectId}/editor` has not passed final product-shape or hard-cut acceptance.
- Entry, exit, context preservation, and authorization between management mode and full-screen creation mode require confirmation.
- Sitemap, Wireframe, Style Guide, and Design do not yet form the accepted end-to-end creation experience.
- Infinite-canvas zoom, pan, selection, drag, layout, keyboard, navigation, and responsive behavior have not passed final acceptance.
- Inspector workflows, AI proposals, diff preview, ChangeSet application, version history, undo/redo, and conflict handling do not yet form a complete loop.
- The current editor UI differs materially from the expected Relume-class experience; local visual polishing alone cannot make it complete.
- The real Brief-to-structure-to-design-to-preview-to-publish journey lacks final end-to-end evidence.

### 3.2 Multi-Agent and AI collaboration

- The product model for a lead Agent, blog Agent, analytics Agent, and other specialized identities needs recalibration.
- Starting a conversation directly from an Agent avatar in the side panel has not reached the expected interaction quality.
- `@Agent` selection, switching, delegation, and visible execution ownership in the composer are not fully accepted.
- The product presentation of Plan and Build as execution policies rather than Agent identities still needs convergence.
- Delegation, permission intersection, context isolation, approval, pause, resume, cancellation, and result return do not form a complete product loop.
- assistant-ui remains an interaction/runtime adapter; backend Thread, Run, Tool, Approval, and audit authorities still need convergence.
- Ambiguous legacy concepts such as “smart project assistant” must not remain the default product model.
- Existing composer, drawer, thread history, Tool rendering, and AI state UI differ materially from the final interaction expectation.

### 3.3 Agent system settings and runtime control plane

- `/system/settings/agents` has not passed final information architecture, density, navigation, or configuration-workflow acceptance.
- Agent definition, version, model routing, reasoning, Tool grants, Skills, Knowledge, approvals, budget, and health are not yet one usable configuration model.
- The relationships between Agent templates, published versions, Workspace assignments, and runtime instances need clearer product representation.
- Provider, Model, Agent, Skill, Tool, and Connector dependencies, conflicts, and diagnostics are not fully surfaced.
- Configuration preview, test run, publication, impact analysis, rollback, and audit remain incomplete.
- Strict Phase 3B gaps remain, including generic content-write Tools, complete approval policies, a unified Agent Run proposal flow, full taint tracking, and security/E2E evidence.

### 3.4 AI-native Content Library and Content Models

- The final product shape of `/projects/{projectId}/content/library` and `/content/models` is not settled.
- The current table-, dialog-, and CRUD-heavy experience differs materially from the intended AI-native content workbench.
- Writing, structured generation, rewriting, translation, SEO, bulk completion, review, and publishing do not yet form one coherent workflow.
- Content Model fields, relationships, validation, versions, migrations, and impact previews require further productization.
- AI proposals, diff preview, approval, and apply results are not fully unified with Agent Runs, content versions, and site bindings.
- Internal identifiers and advanced details still need to move out of default user paths into explicit advanced or diagnostic surfaces.
- Backend CRUD, authorization, versioning, audit, and frontend workbench responsibilities need renewed review.

### 3.5 Workspace Knowledge, Workspace Skills, and Design Systems

- The Knowledge, Skills, and Design Systems areas in Workspace settings have not passed final UI or capability acceptance.
- Knowledge source management, fetch, chunking, indexing, refresh, retrieval testing, and diagnostics need completion.
- Skill authoring, GitHub import, version pinning, update review, installation, removal, and compatibility guidance do not form a complete lifecycle.
- The official Arclayer Skills catalog does not yet fully productize trust, installation, update, and Agent authorization state.
- Skill, Tool, and Connector boundaries must be represented accurately instead of being collapsed into an executable “capability package.”
- Design System tokens, colors, typography, component recipes, motion tokens, versions, and project application require completion.
- Knowledge, Skill, and Design System relationships with Agent configuration, site revisions, and published results still need convergence.

### 3.6 Project and site thumbnails

- Home and `/projects` do not yet consistently replace project icons with real revision-aware site thumbnails.
- Card/list background treatment, overlays, readability, loading, and error states have not passed design acceptance.
- Preview build, browser render, capture, storage, invalidation, refresh, and retry do not form a complete durable task path.
- The authoritative thumbnail source across draft, candidate, and published revisions needs confirmation.

### 3.7 Taskiq and background-job productization

- The final retain, migrate, and remove audit for legacy Taskiq tasks is incomplete.
- Durable Jobs, dispatch outbox, worker classes, and scheduler leadership foundations still lack complete production deployment evidence.
- Builder, Agent, Knowledge, Skill, thumbnail, publishing, Connector reconciliation, and cleanup work are not all represented in the final task catalog.
- Queue ownership, retry idempotency, cancellation, recovery, health, readiness, and failure diagnostics need completion.
- Commerce entitlements still require enforcement both when a Job is accepted and when a Worker begins a new side effect.
- At the time of this snapshot, the following files were owned by other concurrent work and must not be restored, staged, or overwritten by this workflow:
  - `apps/api/src/platform/jobs/composition/execution.py`
  - `apps/api/src/modules/jobs/target_resolver.py`
  - `apps/api/tests/modules/jobs/test_job_target_resolver_unit.py`

### 3.8 Commercialization and the Stripe Connector

Point-in-time engineering foundations committed by this workflow:

- `e571fac7 refactor(commerce): isolate persistence boundary`
- `466899a6 feat(commerce): require stable Stripe prices`
- `a556d742 refactor(commerce): inject webhook acceptance dependencies`

These commits complete only their focused engineering boundaries. They do not complete the commercialization product. Remaining work includes:

- Out-of-order provider event tolerance and an authoritative provider-object fetch policy.
- Stripe reconciliation adapter, scheduled reconciliation, and operator diagnostics.
- Connector health, request IDs, test/live isolation, Webhook state, and runtime diagnostics.
- System Billing UI for stable Price ID mapping, Connector state, reconciliation, and error recovery.
- Entitlement enforcement wiring in Jobs, Builder, Agents, and Connectors.
- Provider migration parity, legacy receipt compatibility, and replay verification.
- Production-grade end-to-end evidence for Stripe test-mode Webhooks.
- Safe removal of the obsolete subscription change request model and persistence structure that conflict with self-service commercialization.
- Migration numbers `0062` through `0065` were occupied by concurrent work at the time of this snapshot; the live migration state must be rechecked before resumption.
- Billing, Plan & Usage, Credits, Ledger, and recovery UI require acceptance against the recalibrated product expectation.

### 3.9 New-site and unpublished-site states

- The in-product placeholder for a new project without content or a Release has not reached the expected product quality.
- Brief onboarding, starting-point selection, AI creation, progress, and first-publish paths need redesign.
- Empty, preparing, generating, failed, draft-ready, awaiting-publish, and published states are not yet unified.
- A public prelaunch foundation exists, but Release activation and convergence between Admin and public lifecycle states remain incomplete.
- Empty and failure states must never fabricate generated, published, or completed outcomes.

### 3.10 Website Config

- `/projects/{projectId}/website/config` has not passed final information architecture, visual, or configuration-boundary acceptance.
- Domains, site identity, SEO, localization, publishing targets, analytics, security, and advanced settings need reorganization.
- Authority boundaries across Domains, Website Config, Project General, and environments must remain explicit.
- Validation, independent ETags, conflict presentation, impact preview, and pre-publish checks do not yet form a complete frontend loop.
- Public routes, generated clients, and Admin consumers still require migration.

### 3.11 Project General settings

- `/projects/{projectId}/settings/general` has not passed final UI and configuration acceptance.
- Project identity, context, access, defaults, lifecycle, and danger actions need confirmation against the recalibrated product model.
- Workspace, Project, Site, Domain, and Environment ownership must be clearer in the UI.
- Public routes, generated clients, Admin data paths, default authority, and approval-backed Agent grants remain unfinished.

### 3.12 Motion and interaction consistency

- Page transitions, editor canvas, panels, drag interactions, AI streaming, task progress, and asynchronous feedback do not yet share one motion language.
- Motion tokens, duration, easing, hierarchy changes, and reduced-motion behavior need convergence.
- “Smoothness” must also be validated against focus stability, accessibility, long-list cost, GPU/memory use, and lower-performance devices.
- Existing local animation implementations need renewed evaluation under the recalibrated direction.

### 3.13 Route skeletons

- The previous route-skeleton capture produced unacceptable density, hierarchy, and visual noise.
- The boundary between stable Shell chrome, real elements, and simplified placeholder anatomy needed redesign.
- Skeleton color needed neutral loading tokens instead of global primary tint and excessive small placeholder elements.
- Editors, data tables, content workbenches, settings pages, and project cards need purpose-specific skeleton compositions.
- Shared route composition, purpose-specific macro layouts, reduced-motion acceptance, and visual verification remained incomplete.

### 3.14 Cross-module end-to-end acceptance

- “Create project → AI planning → multi-Agent collaboration → content/structure/design generation → human review → edit → publish → thumbnail → usage billing” lacks complete end-to-end evidence.
- New product copy has not received a complete bilingual product-language review.
- Loading, Empty, Error, Offline, Read-only, Permission denied, Conflict, and Approval states are not globally unified.
- OpenAPI, cross-layer types, authorization, audit, integration tests, browser visuals, responsiveness, accessibility, and performance lack full-suite acceptance.
- Arclayer must not currently be described as a completed, mature, commercially delivered AI website builder.

## 4. Product decisions requiring recalibration

Implementation must not resume until the relevant decisions are reconfirmed:

1. Final full-screen editor layout, navigation, canvas operations, stage switching, and Inspector structure.
2. User-visible capability and automation level for Sitemap, Wireframe, Style Guide, and Design.
3. Multi-Agent identity model, entry points, `@Agent` behavior, delegation visibility, and approval experience.
4. Whether Content Library and Content Models are management surfaces, AI workbenches, or a deliberate combination, including the default path.
5. Information architecture across System Agent settings and Workspace Knowledge, Skills, and Design Systems.
6. Final commercialization journey across Billing, Plan & Usage, Connectors, and Credits.
7. Configuration authority across Website Config, Project General, Domains, and publishing environments.
8. Visual baseline for Home, project lists, empty sites, skeletons, and global motion.
9. Which existing pages/components should evolve and which must be replaced and removed in the same rollout.

## 5. Resumption constraints

1. Read the product owner's recalibrated requirements first; do not assume that the paused UI direction remains valid.
2. Recheck the live repository, branch, concurrent working tree, and migration sequence. Temporary ownership notes in this snapshot are not current authority.
3. Compare the new direction with the normative specifications and update/review the owning Spec before implementation when a boundary changes.
4. For every area, classify existing work as reusable, requiring refactor, requiring deletion, or requiring new implementation. Existing code volume is not evidence that a direction should be retained.
5. Preserve the separation between management and creation modes, Skill and Tool/Connector, Agent identity and Plan/Build policy, and configuration authority and read projection.
6. Do not add silent fallbacks, mock success, hidden inline execution, or dual tracks that preserve incorrect legacy behavior.
7. Require real UI verification, capability verification, and end-to-end outcome evidence for every stage. Unit tests or route presence cannot substitute for product acceptance.
8. Under concurrent work, modify only files explicitly owned by the active workflow and stage them precisely in focused commits.

## 6. Pause conclusion

- The long-term goal is deferred, not cancelled.
- Existing foundations remain in the repository, but their UI and capability reuse must be reassessed.
- Every area in this file remains unfinished until expectations are reconfirmed and product acceptance is complete.
- Resumption must follow the new product decisions, updated normative specifications, and live repository evidence rather than mechanically continuing the paused implementation plan.
