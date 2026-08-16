# AI 建站平台推进波次（进行中）

- 来源：自 `docs/spec/shared/ai-website-builder-platform.md` §19 拆出（2026-08-17）
- 状态：**活跃计划**。与 `docs/plan/ai-builder-product-direction.md` 的对话 1-9 实施拆分对应推进；方向文档记录的最新进度为阶段 4（Sitemap/Wireframe 编辑器）闭环
- 权威关系：平台契约本体（编辑器四阶段、Agent 域、内容模型、Connector 等）仍以 ai-website-builder-platform 契约为准；本文件承载依赖顺序与迁移门

以下为迁移原文。

## Wave 0 — Contract, inventory, and protocol spikes

- ratify implementation ADRs derived from this approved target, update focused specs, capture live baselines, and establish acceptance fixtures.
- spike assistant-ui protocol/runtime against FastAPI/LangGraph and choose the adapter behind the domain boundary.
- define Builder/Agent/Skill/Knowledge/Design System/Connector/job schemas and migration plan.
- repair Taskiq deployment topology and explicit enqueue/job-state behavior needed by later waves.

Wave 0 is complete only when these migration gates have evidence:

1. every existing project has an explicit `ProjectAuthoringMode`; ambiguous CMS-plus-source projects enter `migration_required` and require a recorded owner decision rather than an inferred mode.
2. eligible existing CMS projects receive one baseline `ContentStructureRevision` and Site Revision manifest without inventing historical revisions.
3. valid legacy conversation/message/event JSON is migrated to normalized rows with count/hash fixtures; invalid records are explicitly quarantined/archived. Historical third-mode runs retain original metadata, while new runs require Plan or Build.
4. public migrations and tenant-control migrations complete for every workspace; APIs remain disabled for any tenant that fails readiness verification.
5. official Agent/Skill version references and workspace/user ownership counts are backfilled and verified.
6. Stripe provider receipts migrate to the Connector inbox or prove replay compatibility while the stable webhook path remains served.
7. dispatch outbox, workload workers, health checks, and the single scheduler leader are deployed before any API that creates a durable Job is enabled.
8. old writes are frozen; counts, hashes, authorization, idempotency, replay, and last-known-good publish fixtures pass before routes/generated clients switch and old facades/source-write paths are removed.
9. rollback is supported only before destructive cleanup; after cleanup, recovery uses forward repair plus retained migration evidence.

## Wave 1 — Agent and workspace context foundation

- persist Agent definitions/versions/assignments and split execution mode from identity.
- implement backend-owned threads, messages, runs, delegation, standard parts, durable recovery, and Toolkit renderers.
- add Workspace-scoped Knowledge, Skills, Design Systems, and the official built-in catalog under the Product Application Customization group.
- hard cut the third composer mode, text-only Skill library, static-only Agent catalog, and local browser thread authority.

## Wave 2 — Unified Builder aggregate and Sitemap

- add `ContentStructureRevision`, `SiteRevisionManifest`/status projections, typed ChangeSet, generation Job, revision conflict, and projection services over existing content/routes/presentation data.
- replace `/editor` with the independent full-screen shell and Sitemap stage.
- add brief/import/onboarding, page/section graph, impact preview, undo/redo, and Agent context.
- remove the current read-only editor surface and placeholder Content Site Builder surface in the same rollout.

## Wave 3 — Wireframe, Style Guide, and Design

- implement component-instance/variant/global-section editing and content bindings.
- implement versioned Design Systems/concepts and project assignment/fork.
- implement responsive/interaction/a11y/SEO state editing, preview builds, visual diffs, and release readiness.

## Wave 4 — AI-native content and settings

- recompose Content Library and Content Models around workbench/proposal/impact flows.
- rebuild System Agent settings IA and add Workspace context screens.
- redesign Website Config and Project General with the ownership split in section 12 of the platform contract.
- implement first-publish/prelaunch product states.

## Wave 5 — Rendering, thumbnails, loading, and polish

- make preview build/render/capture durable and generate site thumbnails.
- update home/project grid/list media treatment.
- align shared route-skeleton boundaries, macro anatomy, neutral tokens, and responsive/reduced-motion visual verification.
- run editor/content/settings motion, responsive, accessibility, visual, and performance convergence passes.

## Wave 6 — Commercial Connector

- add Connector framework and official Stripe billing plugin.
- migrate core billing injection, durable event inbox/worker/reconciliation, stable Price/Entitlement mapping, and Billing product surfaces.
- remove the direct Stripe construction path after parity and webhook replay verification.
