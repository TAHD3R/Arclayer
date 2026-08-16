# Shared Code-Specs

These specs define contracts that both backend and frontend implementation must follow. They are code-specs, not thinking guides.

## Overview

Use this layer for contracts that cross the backend/frontend boundary:

- API envelopes and payload ownership
- Error response shape and stable error codes
- Identity, authorization, and tenant/workspace/project context
- Schema, field, and generated type semantics

Backend and frontend specs should link to these files instead of duplicating the same rules.

## Specs Index

| Guide | Description | Status |
|-------|-------------|--------|
| [API Contracts](./api-contracts.md) | Request/response envelopes, OpenAPI ownership, generated client boundaries | Active |
| [Error Contracts](./error-contracts.md) | Stable error codes, validation errors, client-visible meta, debug-only details | Active |
| [Conditional Permissions](./conditional-permissions.md) | Permission-grant condition metadata, supported fields, operators, and validation rules | Active |
| [Identity & Access Contracts](./identity-access-contracts.md) | Auth tokens, Content API credentials, tenant/workspace/project context, permission codes | Active |
| [Schema & Field Contracts](./schema-field-contracts.md) | Pydantic/OpenAPI/schema field semantics shared by backend and frontend | Active |
| [Product and Platform Administration Experience Redesign](./product-admin-experience-redesign.md) | Canonical Product/Platform administration IA, routes, lifecycles, Experience Kit, state model, visual gate, i18n, accessibility, rollout, and acceptance | Approved target |
| [Product and Platform Separation](./product-platform-separation.md) | Canonical application, deployment, Session, and authority boundaries across Product, Platform, and API | Approved target |
| [Workspace Commercialization](./workspace-commercialization.md) | Plan catalog, subscriptions, AI Credits accounting, and upgrade workflows | Active |
| [AI Website Builder Platform](./ai-website-builder-platform.md) | Unified creation editor, multi-Agent runtime, workspace context, durable jobs, connectors, and product experience | Approved target |
| [AI Agent Runtime Protocol](./ai-agent-runtime-protocol.md) | Backend-owned Thread/Run/event truth, versioned SSE replay, Tool responses, approvals, delegation, Credits ordering, and acceptance gates | Approved selected protocol |
| [Platform Feedback and Support](./admin-feedback-support.md) | Feedback submission, triage, privacy, replies, audit, and support lifecycle | Approved canonical |
| [Platform Monitoring & Audit](./admin-observability-dashboard.md) | Request investigation, telemetry, trends, audit evidence, and cross-domain attention | Approved domain |
| [Platform Control Plane Productization](./admin-control-plane-rollout.md) | Domain invariants and rollout details behind Overview, Workspaces, AI Services, Hosting & Domains, Messages & Feedback, Extensions, Plans & Billing, Access & Security, and Monitoring & Audit | Approved target |
| [Platform AI Operations](./admin-ai-operations.md) | AI Services domain: AI tasks, models & providers, built-in assistants and skills, actions & policies, and monitoring boundaries | Approved domain |
| [Platform Communications](./admin-communications.md) | Messages & Feedback domain: one delivery authority, campaigns, message templates, and email service | Approved domain |
| [Platform Extensibility](./admin-extensibility.md) | Extensions domain: connector trust, installation lifecycle, and compatibility boundaries | Approved domain |
| [Platform Hosting & Domains](./admin-hosting-delivery.md) | Hosting & Domains domain: delivery issues, domains and certificates, storage, and suspension/restoration | Approved domain |
| [Platform Identity & Access](./admin-identity-access.md) | Access & Security domain: platform team, roles and permissions, MFA, device sessions, and recovery | Approved domain |
| [Platform Workspaces Governance](./admin-tenant-governance.md) | Workspaces domain: directories, commercial projections, restrictions, and lifecycle/legal-case handling | Approved domain |
| [Plugin, Notification, and Mail (migration era)](./admin-plugin-notification-mail.md) | Combined capability contract being superseded by Extensibility and Communications domain contracts | Migration-era contract |
| [Workspace Invitation and Permission Experience](./workspace-invitation-permission-experience.md) | Invitation flows, permission catalog, and fixed-member access experience | Active |

## Shared Layer Rules

- Put implementation contracts here when both backend and frontend must obey the same shape.
- Keep thinking prompts in `docs/guidelines/`; keep executable signatures and payload fields here.
- When a shared contract changes, update the relevant backend and frontend specs or indexes to reference it.
- Generated OpenAPI types remain the frontend source for backend request/response shapes; shared specs define the rule, not a second type package.

**Language**: Contracts under `docs/spec/**` are written in **English** to stay aligned with code identifiers. Chinese is the working language for root guides and for `docs/plan/**` / `docs/guidelines/**` documents (see `AGENTS.md`).
