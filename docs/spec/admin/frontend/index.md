# Product Application Frontend Development Guidelines

> Executable code-specs for Product Application frontend development in `apps/admin`.

---

## Overview

These specs define concrete Product Application contracts for route files, page composition, components, hooks, state management, generated API type usage, design-system behavior, and quality gates. The historical `admin` directory name does not make this the Platform Console specification owner.

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
| [Product UI Toolchain](./product-ui-toolchain.md) | Canonical components, forms, icons, charts, shared route skeletons, motion, and product i18n | Active |
| [Creation Editor](./creation-editor.md) | Independent full-screen creation Shell, four Site Revision projections, canvas interaction, Agent sidecar, motion, a11y, and loading states | Approved target |
| [AI Agent Experience](./ai-agent-experience.md) | Unified Thread/Run runtime, Agent launcher and mentions, Toolkit rendering, approvals, delegation, responsive behavior, and hard cut | Approved target |

---

## Shared Contracts

| Shared Spec | Use for |
|-------------|---------|
| [Shared API Contracts](../../shared/api-contracts.md) | API envelope ownership and generated type consumption |
| [Shared Error Contracts](../../shared/error-contracts.md) | Stable error-code handling in UI |
| [Shared Identity & Access Contracts](../../shared/identity-access-contracts.md) | Auth, route guard, tenant, workspace, project, and permission semantics |
| [Shared Schema & Field Contracts](../../shared/schema-field-contracts.md) | Schema-driven UI and field semantics |
| [Product and Platform Administration Experience Redesign](../../shared/product-admin-experience-redesign.md) | Canonical administration IA, route inventory, complete lifecycle, Platform Experience Kit, state model, visual gate, i18n, accessibility, and browser acceptance |
| [Workspace Commercialization](../../shared/workspace-commercialization.md) | Plan, subscription, Credits, and upgrade UX semantics |
| [AI Website Builder Platform](../../shared/ai-website-builder-platform.md) | Full-screen creation editor, Agent/chat UX, content workbench, settings, thumbnails, motion, and loading semantics |
| [Feedback & Observability](../../shared/feedback-observability.md) | Feedback lifecycle, audit log, and observability page semantics |
| [Product and Platform Separation](../../shared/product-platform-separation.md) | Product Application ownership, Platform extraction, Session/authority boundaries, and cross-app release gates |

## Monorepo Contracts

| Spec | Use for |
|------|---------|
| [Monorepo Guidelines](../../monorepo/index.md) | pnpm/Turborepo commands, quality gates, shared packages, commits, and repo hygiene |

---

## Required Reading Before Product Application Work

- Read `DESIGN.md` and `docs/guidelines/frontend-design.md` before design-sensitive UI changes.
- Read the relevant Product Application spec file for the layer being changed.
- Read shared specs when the change touches API payloads, errors, auth/permission behavior, or schema-driven UI.
- Read monorepo specs when the change touches shared packages, generated OpenAPI artifacts, package scripts, quality gates, or commits.

**Language**: All documentation should be written in **English**.
