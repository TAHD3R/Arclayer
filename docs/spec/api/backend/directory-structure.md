# Backend Directory Structure

This code-spec defines where backend code belongs in `apps/api` and which dependency directions are allowed.

## Scenario: Canonical Backend Module Placement

### 1. Scope / Trigger

- Trigger: adding, moving, or reviewing backend files under `apps/api/src`.
- Applies to FastAPI route registration, domain modules, persistence models, core runtime, platform adapters, shared primitives, settings, and migrations.

### 2. Signatures

- Route composition: `apps/api/src/core/routes.py`
- Product API prefix: `/api/v1`
- Content API prefix: `/content-api/v1`
- Management API prefix: `/management-api/v1`
- Domain module root: `apps/api/src/modules/<domain>/`
- Domain router: `apps/api/src/modules/<domain>/router.py`
- Domain service: `apps/api/src/modules/<domain>/service.py`
- Domain repository: `apps/api/src/modules/<domain>/repository.py`
- Domain schema: `apps/api/src/modules/<domain>/schema.py`
- Persistence models: `apps/api/src/models/**`
- Runtime infrastructure: `apps/api/src/core/**`
- Platform adapters: `apps/api/src/platform/**`
- Shared primitives: `apps/api/src/common/**`
- Settings: `apps/api/src/settings/**`
- Migrations: `apps/api/src/migrations/**`

### 3. Contracts

- `core/routes.py` owns global route registration and shared prefix decisions for `/api/v1`, `/content-api/v1`, and `/management-api/v1`.
- Domain routers own transport wiring only: dependencies, `response_model`, tags, endpoint docstrings, and service calls.
- Services own orchestration, policy, transactions, domain events, and calls to repositories or `EntityManager`.
- Repositories own persistence access and query composition only.
- Schemas own Pydantic request/response contracts and internal value objects when they are part of the module boundary.
- Models own Tortoise table metadata and relationships; they do not parse requests or orchestrate business workflows.
- `platform/**` owns low-level adapters such as cache, jobs, storage, limiter, and external integrations.
- `common/**` owns reusable primitives that do not encode one feature's workflow.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Router calls a repository directly | `architecture.router-no-direct-repository` reports a blocker |
| Domain module registers global prefixes directly | Move prefix ownership to `core/routes.py` |
| Repository performs business orchestration | Move orchestration into the service |
| Service opens a transaction but called methods ignore the yielded `conn` | Treat as false transaction semantics and fix connection propagation |
| New route belongs outside `/api/v1` | Register explicitly from `core/routes.py` under `/content-api/v1`, `/management-api/v1`, or another documented prefix contract |
| Shared helper starts serving multiple apps/domains | Promote to `common/**` or a shared package instead of copying |

### 5. Good/Base/Bad Cases

- Good: `modules/analytics` keeps router, service, repository, and schema responsibilities separate.
- Good: `/content-api/v1` delivery routes are mounted from `core/routes.py` because they intentionally bypass the Admin `/api/v1` surface.
- Good: `/management-api/v1` operational routes are mounted from `core/routes.py` with their own documented management boundary.
- Base: a small module starts with `router.py`, `service.py`, `repository.py`, and `schema.py`, then splits by subdomain when responsibilities diverge.
- Bad: a router imports `ProjectRepository` and performs query logic inline.
- Bad: a new `api_aggregation` package hides route composition away from `core/routes.py`.

### 6. Tests Required

- New backend route modules need API tests covering success and error paths.
- New persistence behavior needs repository or integration coverage that proves the expected transaction and tenant binding.
- Architecture-rule fixtures must be updated when a placement rule becomes enforceable.
- During a small backend foundation change, run the nearest static check and
  focused test; run `pnpm api:check` at a coherent milestone or before handoff.

### 7. Wrong vs Correct

#### Wrong

```python
# apps/api/src/modules/projects/router.py
@router.get("/{project_id}/items")
async def list_items(project_id: UUID):
    return await ProjectItemsRepository().list_for_project(project_id)
```

#### Correct

```python
# apps/api/src/modules/projects/router.py
@router.get("/{project_id}/items", response_model=ProjectItemsListOut)
async def list_items(project_id: UUID, service: ProjectItemsServiceDep):
    return await service.list_for_project(project_id=project_id)
```

The router remains a transport boundary, while the service owns orchestration and the repository owns persistence.
