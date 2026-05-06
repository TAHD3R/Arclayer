# Shared Identity & Access Contracts

This code-spec defines identity, credential, tenant, workspace, project, and permission contracts shared across backend and frontend.

## Scenario: Context-Aware Access Boundaries

### 1. Scope / Trigger

- Trigger: adding or changing authentication flows, Admin routes, Content API routes, tenant-scoped runtime reads, workspace/project authorization, or background jobs that process tenant-owned data.
- Applies to session tokens, Content API keys, preview tokens, permission codes, tenant context payloads, and frontend route guards.

### 2. Signatures

- Admin API prefix: `/api/v1`
- Content API prefix: `/content-api/v1`
- Management API prefix: `/management-api/v1`
- Content API credential headers: `x-api-key` or `Authorization: Bearer <delivery-key>`
- Runtime lookup: `get_runtime_context(runtime_id) -> ProjectRuntimeContext`
- Tenant DB binding: `TenantDatabaseRouter(runtime_context.tenant_context).connection()`
- Tenant job payload: `TenantContext.to_job_payload().model_dump(mode="json", by_alias=True)`
- Permission dependencies: `require_workspace_permission(...)`, `require_project_permission(...)`, `require_org_permission(...)`

### 3. Contracts

- Admin session tokens grant Admin API access only; they do not grant Content API delivery access.
- Content API credentials are validated through Content API auth and must carry required delivery scopes.
- Preview reads require a preview delivery key or valid preview token.
- Tenant-owned runtime reads must execute inside the runtime tenant database connection.
- Background jobs that read/write tenant data must carry tenant context explicitly in the job payload.
- Permission codes are stable shared contract values; frontend can use them for capability gating only when backend authorization still enforces the same rule.
- Frontend guards are UX optimization, not security enforcement.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Admin token sent to Content API | Reject with `API_KEY_INVALID` |
| Delivery key lacks required scope | Reject with `DELIVERY_SCOPE_REQUIRED` |
| Preview read lacks preview credential | Reject with `PREVIEW_TOKEN_REQUIRED` |
| Tenant runtime read skips tenant DB binding | Treat as data isolation bug |
| Tenant job payload omits tenant context | Worker raises `TENANT_CONTEXT_REQUIRED` |
| Frontend hides action based on permission | Backend still validates the same permission on mutation |
| Permission code changes | Update backend catalog, frontend consumers, and tests together |

### 5. Good/Base/Bad Cases

- Good: GraphQL delivery builds service context with a tenant-bound connection.
- Good: project thumbnail job receives `payload["tenant"]` and restores it before reading project assets.
- Base: frontend disables a publish button for users missing a generated permission flag, while the backend still enforces `project:release:publish`.
- Bad: frontend assumes hidden UI is sufficient authorization.
- Bad: a job falls back to ambient context and silently skips tenant payload when missing.

### 6. Tests Required

- Backend integration tests for Content API credential rejection and scope failure.
- Tenant routing tests for runtime delivery reads and tenant jobs.
- Permission tests for backend route dependencies.
- Frontend tests for action visibility or route guards when capability state is consumed.

### 7. Wrong vs Correct

#### Wrong

```python
if current_tenant_context_or_none() is not None:
    payload["tenant"] = tenant_payload_from_context(current_tenant_context_or_none())
```

#### Correct

```python
payload["tenant"] = self._tenant_context.to_job_payload().model_dump(mode="json", by_alias=True)
```

Tenant context is a required cross-process contract for tenant-owned jobs.
