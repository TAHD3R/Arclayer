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

## Shared Layer Rules

- Put implementation contracts here when both backend and frontend must obey the same shape.
- Keep thinking prompts in `docs/guidelines/`; keep executable signatures and payload fields here.
- When a shared contract changes, update the relevant backend and frontend specs or indexes to reference it.
- Generated OpenAPI types remain the frontend source for backend request/response shapes; shared specs define the rule, not a second type package.

**Language**: All documentation should be written in **English**.
