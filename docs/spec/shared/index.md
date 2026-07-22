# Shared Code-Specs

These specs define contracts that both backend and frontend implementation must follow. They are code-specs, not thinking guides.

## Overview

Use this layer for contracts that cross the backend/frontend boundary:

- API envelopes and payload ownership
- Error response shape and stable error codes
- Identity, authorization, and tenant/workspace/project context
- Schema, field, and generated type semantics

Backend and frontend specs should link to these files instead of duplicating the same rules.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [API Contracts](./api-contracts.md) | Request/response envelopes, OpenAPI ownership, generated client boundaries | Active |
| [Error Contracts](./error-contracts.md) | Stable error codes, validation errors, client-visible meta, debug-only details | Active |
| [Conditional Permissions](./conditional-permissions.md) | Permission-grant condition metadata, supported fields, operators, and validation rules | Active |
| [Identity & Access Contracts](./identity-access-contracts.md) | Auth tokens, Content API credentials, tenant/workspace/project context, permission codes | Active |
| [Schema & Field Contracts](./schema-field-contracts.md) | Pydantic/OpenAPI/schema field semantics shared by backend and frontend | Active |
| [Workspace Commercialization](./workspace-commercialization.md) | Plan catalog, subscriptions, AI Credits accounting, and upgrade workflows | Active |
| [AI Website Builder Platform](./ai-website-builder-platform.md) | Unified creation editor, multi-Agent runtime, workspace context, durable jobs, connectors, and product experience | Approved target |
| [AI Agent Runtime Protocol](./ai-agent-runtime-protocol.md) | Backend-owned Thread/Run/event truth, versioned SSE replay, Tool responses, approvals, delegation, Credits ordering, and proof gates | Proposed Wave 0 decision |
| [Feedback & Observability](./feedback-observability.md) | Feedback lifecycle, audit views, request telemetry, and scoped observability | Active |
| [Admin Control Plane Productization](./admin-control-plane-rollout.md) | Canonical rollout for feedback, observability, dashboards, plugins, communications, tenant governance, invitations, and permissions | Approved target |

## Shared Layer Rules

- Put implementation contracts here when both backend and frontend must obey the same shape.
- Keep thinking prompts in `docs/spec/guides/`; keep executable signatures and payload fields here.
- When a shared contract changes, update the relevant backend and frontend specs or indexes to reference it.
- Generated OpenAPI types remain the frontend source for backend request/response shapes; shared specs define the rule, not a second type package.

**Language**: All documentation should be written in **English**.
