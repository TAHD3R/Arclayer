# Admin Frontend Development Guidelines

> Executable code-specs for Admin frontend development in `apps/admin`.

---

## Overview

Admin specs define concrete contracts for route files, page composition, components, hooks, state management, generated API type usage, design-system behavior, and quality gates.

`DESIGN.md` remains the primary visual language source. Shared frontend/backend contracts live under `docs/spec/shared/`.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Route/page/API/shared UI placement and ownership | Active |
| [Component Guidelines](./component-guidelines.md) | Admin page shells, overlays, semantic tags, accessibility, visual contracts | Active |
| [Hook Guidelines](./hook-guidelines.md) | Feature hooks, React Query hooks, API transport ownership | Active |
| [State Management](./state-management.md) | Local, URL, server, form, and global UI state ownership | Active |
| [Quality Guidelines](./quality-guidelines.md) | Admin quality gate, design verification, i18n, convention checks | Active |
| [Type Safety](./type-safety.md) | Generated OpenAPI type usage, UI projections, assertion boundaries | Active |

---

## Shared Contracts

| Shared Spec | Use for |
|-------------|---------|
| [Shared API Contracts](../../shared/api-contracts.md) | API envelope ownership and generated type consumption |
| [Shared Error Contracts](../../shared/error-contracts.md) | Stable error-code handling in UI |
| [Shared Identity & Access Contracts](../../shared/identity-access-contracts.md) | Auth, route guard, tenant, workspace, project, and permission semantics |
| [Shared Schema & Field Contracts](../../shared/schema-field-contracts.md) | Schema-driven UI and field semantics |

## Monorepo Contracts

| Spec | Use for |
|------|---------|
| [Monorepo Guidelines](../../monorepo/index.md) | pnpm/Turborepo commands, quality gates, shared packages, commits, and repo hygiene |

---

## Required Reading Before Admin Work

- Read `DESIGN.md` and `docs/guidelines/frontend-design.md` before design-sensitive UI changes.
- Read the relevant Admin spec file for the layer being changed.
- Read shared specs when the change touches API payloads, errors, auth/permission behavior, or schema-driven UI.
- Read monorepo specs when the change touches shared packages, generated OpenAPI artifacts, package scripts, quality gates, or commits.

**Language**: All documentation should be written in **English**.
