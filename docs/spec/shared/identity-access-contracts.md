# Shared Identity & Access Contracts

This code-spec defines identity, credential, tenant, workspace, project, and permission contracts shared across backend and frontend.

## Scenario: Context-Aware Access Boundaries

### 1. Scope / Trigger

- Trigger: adding or changing authentication flows, Admin routes, Content API routes, tenant-scoped runtime reads, workspace/project authorization, or background jobs that process tenant-owned data.
- Applies to session tokens, Content API keys, preview tokens, permission
  codes, durable Job target descriptors, and frontend route guards.

### 2. Signatures

- Product API prefix: `/api/v1`
- Content API prefix: `/content-api/v1`
- Management API prefix: `/management-api/v1`
- Content API credential headers: `x-api-key` or `Authorization: Bearer <delivery-key>`
- Runtime lookup: `get_runtime_context(runtime_id) -> ProjectRuntimeContext`
- Tenant DB binding: `TenantDatabaseRouter(runtime_context.tenant_context).connection()`
- Durable tenant Job target: public workspace/project/runtime/site IDs plus a
  typed entity/source-revision reference
- Permission dependencies: `require_workspace_permission(...)`, `require_project_permission(...)`, `require_org_permission(...)`

### 3. Contracts

- Admin session tokens grant Product API access only; they do not grant Content API delivery access.
- Content API credentials are validated through Content API auth and must carry required delivery scopes.
- Preview reads require a preview delivery key or valid preview token.
- Tenant-owned runtime reads must execute inside the runtime tenant database connection.
- Background jobs that read/write tenant data carry public target identity,
  then re-resolve the current Project, Workspace, and tenant registry at
  execution. Serialized schema names and isolation modes are not authority.
- Permission codes are stable shared contract values; frontend can use them for capability gating only when backend authorization still enforces the same rule.
- Frontend guards are UX optimization, not security enforcement.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Admin token sent to Content API | Reject with `API_KEY_INVALID` |
| Delivery key lacks required scope | Reject with `DELIVERY_SCOPE_REQUIRED` |
| Preview read lacks preview credential | Reject with `PREVIEW_TOKEN_REQUIRED` |
| Tenant runtime read skips tenant DB binding | Treat as data isolation bug |
| Tenant Job target cannot resolve current tenant readiness | Fail explicitly; never use the default/public DB for tenant data |
| Tenant Job envelope contains schema or isolation routing | Reject the envelope contract |
| Frontend hides action based on permission | Backend still validates the same permission on mutation |
| Permission code changes | Update backend catalog, frontend consumers, and tests together |

### 5. Good/Base/Bad Cases

- Good: GraphQL delivery builds service context with a tenant-bound connection.
- Good: project thumbnail Job verifies public workspace/project/asset IDs,
  resolves the current tenant registry, and only then reads project Assets.
- Base: frontend disables a publish button for users missing a generated permission flag, while the backend still enforces `project:release:publish`.
- Bad: frontend assumes hidden UI is sufficient authorization.
- Bad: a Job trusts a serialized schema name or falls back to ambient/default
  context when canonical resolution fails.

### 6. Tests Required

- Backend integration tests for Content API credential rejection and scope failure.
- Tenant routing tests for runtime delivery reads and tenant jobs.
- Permission tests for backend route dependencies.
- Frontend tests for action visibility or route guards when capability state is consumed.

### 7. Wrong vs Correct

#### Wrong

```python
tenant_context = TenantJobContextPayload.model_validate(payload["tenant"]).to_context()
tenant_db = TenantDatabaseRouter(tenant_context)
```

#### Correct

```python
job = await jobs.require_for_dispatch(envelope.job_id)
target = await target_resolver.resolve_and_validate(job.target_descriptor)
tenant_db = TenantDatabaseRouter(target.tenant_context.with_scope(TenantScope.JOB))
```

Public target identity is the cross-process contract. Tenant database routing
is resolved from current canonical state inside the worker.
