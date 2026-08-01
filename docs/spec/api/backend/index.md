# Backend Development Guidelines

> Executable code-specs for backend development in `apps/api`.

---

## Overview

Backend specs define concrete contracts for FastAPI routes, services, repositories, schemas, persistence, errors, logging, quality gates, and cross-layer behavior. They should be read before backend implementation.

Shared frontend/backend contracts live under `docs/spec/shared/` and should be linked instead of duplicated.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module placement, router/service/repository/schema ownership, route prefix rules | Active |
| [Database Guidelines](./database-guidelines.md) | Tortoise repository foundation, transaction propagation, generated migrations, naming mistakes | Active |
| [Error Handling](./error-handling.md) | APIError subclasses, response envelopes, validation errors, internal failure behavior | Active |
| [i18n](./i18n.md) | Locale resolution, translation runtime, error localization, and locale resource contracts | Active |
| [Lifecycles](./lifecycles.md) | Lifecycle action/event signatures, subscriber semantics, and blocking vs non-blocking failure boundaries | Active |
| [Entity Manager](./entity-manager.md) | Unified content write orchestration, lifecycle dispatch, and versioned snapshot contracts | Active |
| [Plugins](./plugins.md) | Plugin discovery, lifecycle phases, hook specs, registry ownership, and startup failure contracts | Active |
| [Notifications](./notifications.md) | Notification source catalog, system group policy, user preference gate, and producer entrypoint contracts | Active |
| [Domain Design](./domain-design.md) | API surface taxonomy, module boundaries, PublicUUID policy, tag vocabulary, and hard-cut evolution rules | Active |
| [Services and Repositories](./services-repositories.md) | BaseService and Tortoise repository interaction boundaries, tx propagation, and event publication contracts | Active |
| [Content Delivery API](./content-delivery-api.md) | `/content-api/v1` delivery route contracts | Active |
| [Content Model Storage Sync](./content-model-storage-sync.md) | Content model schema-to-storage planning contracts | Active |
| [Agents](./agents.md) | Read-only Agent runtime, tools, sessions, cancellation, and event boundaries | Active |
| [AI Site Builder](./site-builder.md) | Authoring mode, structure revisions, immutable Site Revision manifests, ChangeSets, preview, and staged publish | Approved target |
| [Durable Background Jobs](./background-jobs.md) | Job, Attempt, transactional dispatch outbox, leases, retries, cancellation, Admin APIs, and migration contracts | Approved target |
| [Storage Profiles and Provider Effects](./storage-profiles.md) | Stable profile identity, immutable route revisions, tombstones, normalized provider-effect registration/settlement, and compatibility boundaries | Approved Wave 0 core |
| [Taskiq Workload Topology](./taskiq-workload-topology.md) | Locked Taskiq/Redis Stream broker isolation, routing manifest, acknowledgement, redelivery, scheduler, and deployment proof gates | Accepted Wave 0 ADR |
| [Workspace Knowledge](./workspace-knowledge.md) | Versioned Knowledge sources, ingestion, retrieval authorization, citations, quarantine, and Agent context contracts | Approved target |
| [Workspace Skills](./workspace-skills.md) | Built-in, inline, and immutable GitHub Skill packages, validation, installation, permissions, and supply-chain boundaries | Approved target |
| [Design Systems](./design-systems.md) | Immutable Design System versions, project assignment, token validation, preview, import, and Agent consumption | Approved target |
| [Quality Guidelines](./quality-guidelines.md) | Service contracts, dataclass ban, JSON typing, Activity coverage, tests, review checklist | Active |
| [Logging Guidelines](./logging-guidelines.md) | Structlog setup, request summaries, trace ids, redaction, exception logging | Active |

---

## Shared Contracts

| Shared Spec | Use for |
|-------------|---------|
| [Shared API Contracts](../../shared/api-contracts.md) | API envelopes, generated OpenAPI type ownership, frontend consumption boundaries |
| [Shared Error Contracts](../../shared/error-contracts.md) | Stable error codes and frontend error handling |
| [Shared Identity & Access Contracts](../../shared/identity-access-contracts.md) | Auth credentials, tenant context, permission codes, route guard semantics |
| [Shared Schema & Field Contracts](../../shared/schema-field-contracts.md) | Pydantic/OpenAPI/content field semantics reused by frontend |
| [Product and Platform Administration Experience Redesign](../../shared/product-admin-experience-redesign.md) | Complete Product/Platform administration verticals across API, services, persistence, jobs, audit, verification, and removal gates |
| [AI Website Builder Platform](../../shared/ai-website-builder-platform.md) | Builder revisions, Agent/Thread/Run domains, workspace context, durable jobs, connectors, and cross-layer rollout contracts |
| [Product and Platform Separation](../../shared/product-platform-separation.md) | Product and Platform FastAPI compositions, authority boundaries, Workspace ownership hard cut, and integrated rollout gates |

## Monorepo Contracts

| Spec | Use for |
|------|---------|
| [Monorepo Guidelines](../../monorepo/index.md) | pnpm/Turborepo commands, quality gates, generated artifacts, commits, and repo hygiene |

---

## Required Reading Before Backend Work

- Read the topic-specific backend spec for the files being changed.
- Read the relevant shared spec when the change affects API payloads, errors, identity, permissions, schema fields, or generated frontend types.
- Read monorepo specs when the change affects package scripts, Turborepo tasks, generated artifacts, quality gates, migrations, commits, or repo hygiene.
- Use existing active specs as executable contracts. Do not replace them with high-level principles.
- For backend kernel changes (i18n, lifecycles, entity manager, plugins, domain boundaries, services/repositories), read the dedicated kernel topic specs above in addition to base/database/error/quality contracts.

**Language**: All documentation should be written in **English**.
