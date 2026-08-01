# API Frontend Development Guidelines

> Executable code-specs for frontend API contract consumption.

---

## Overview

API frontend specs define how frontend code consumes backend-generated contracts through OpenAPI packages and app API layers. These specs focus on generated type ownership, API data hooks, contract-aware components, state derived from backend data, and quality gates for contract drift.

Shared frontend/backend contracts live under `docs/spec/shared/`.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Generated package and frontend API boundary placement | Active |
| [Component Guidelines](./component-guidelines.md) | Contract-aware component data and submit boundaries | Active |
| [Hook Guidelines](./hook-guidelines.md) | Generated-type data hooks, query keys, mutation invalidation | Active |
| [State Management](./state-management.md) | Server state, UI projection state, form state, route/search state | Active |
| [Quality Guidelines](./quality-guidelines.md) | Contract drift checks, mapper tests, error-code preservation | Active |
| [Type Safety](./type-safety.md) | Generated API type usage, `unknown` narrowing, `any` ban | Active |

---

## Shared Contracts

| Shared Spec | Use for |
|-------------|---------|
| [Shared API Contracts](../../shared/api-contracts.md) | Backend-owned API shapes and generated frontend type usage |
| [Shared Error Contracts](../../shared/error-contracts.md) | Stable error-code handling across API layers |
| [Shared Identity & Access Contracts](../../shared/identity-access-contracts.md) | Auth, tenant, workspace, project, and permission semantics |
| [Shared Schema & Field Contracts](../../shared/schema-field-contracts.md) | Pydantic/OpenAPI/schema field semantics |
| [Product and Platform Administration Experience Redesign](../../shared/product-admin-experience-redesign.md) | Administration route inventory, lifecycle projections and commands, state distinctions, and generated-client delivery gate |
| [Product and Platform Separation](../../shared/product-platform-separation.md) | Separate Product and Platform OpenAPI clients, application consumers, Session boundaries, and hard-cut migration |

## Monorepo Contracts

| Spec | Use for |
|------|---------|
| [Monorepo Guidelines](../../monorepo/index.md) | pnpm/Turborepo commands, OpenAPI generation, shared packages, quality gates, and repo hygiene |

---

## Required Reading Before API Frontend Work

- Read the relevant shared contract file when payload, error, identity, permission, or schema behavior changes.
- Read Product Application frontend specs when the consumer is `apps/admin`; read the Platform Console contracts and shared product UI toolchain when the consumer is `apps/platform`.
- Read monorepo specs when the change involves `packages/openapi`, shared packages, generated artifacts, package scripts, or cross-app checks.
- Do not create a second contract package or local duplicate request/response types.

**Language**: All documentation should be written in **English**.
