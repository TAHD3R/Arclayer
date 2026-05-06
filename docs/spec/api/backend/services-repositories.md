# Backend Service and Repository Contracts

This code-spec defines service/repository interaction boundaries, canonical base classes, and transaction/event propagation requirements.

## Scenario: Service-Orchestrated Persistence with Canonical Repository Foundation

### 1. Scope / Trigger

- Trigger: adding/changing backend services, repositories, transactional flows, or domain event publication paths.
- Applies to:
  - `apps/api/src/core/services/base.py`
  - `apps/api/src/core/repository/base.py`
  - `apps/api/src/core/repository/implementations/tortoise.py`
  - domain services and repositories under `apps/api/src/modules/**`.

### 2. Signatures

- Service base:
  - `class BaseService`
  - `tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]`
  - `resolve_actor_context(...) -> ServiceActorContext`
  - `publish_domain_event(...) -> Event`
  - `publish_optional_domain_event(...) -> Event`
- Service contract error types:
  - `ServiceContractError`
  - `RequiredEventPublisherMissing`
  - `RequiredDomainEventPublishFailed`
- Repository contracts:
  - `AbstractRepository[T]` CRUD signatures
  - `TortoiseORMRepository[T]` canonical ORM foundation
  - transaction helpers `_using_db_kwargs`, `using_db`, `create_record`, `update_fields`, `delete_by_id`.

### 3. Contracts

- Routers call services; services call repositories; repositories call ORM/query primitives.
- Services that orchestrate persistence/events/settings must extend `BaseService`.
- Repository classes with ORM behavior must inherit from `TortoiseORMRepository` or approved tenant-aware bases rooted in it.
- Service constructors should use dependency injection for repositories/publishers/runtime dependencies.
- Service transaction boundary is `BaseService.tx()`; nested service/repository operations must share one explicit connection.
- Repository methods participating in service transactions must accept/pass `conn` and use `using_db(...)` propagation.
- Required business events must use `publish_domain_event(required=True)` and surface missing/failed publisher via typed service contract errors.
- Optional observability fan-out can use `publish_optional_domain_event`, but this is not a substitute for required audit/business evidence.
- Actor context for event payloads should be resolved through `resolve_actor_context(...)` and not rebuilt ad hoc in each service.
- Repository classes must not own cross-domain orchestration, policy branching, or API shaping.

Cross-reference boundaries:
- Persistence/migration-specific contracts remain in [Database Guidelines](./database-guidelines.md).
- quality/audit-specific enforcement remains in [Quality Guidelines](./quality-guidelines.md).

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Router imports repository and bypasses service | Blocker: move orchestration to service layer |
| Service uses direct `in_transaction()` despite `BaseService.tx()` | Refactor to `self.tx()` unless justified infrastructure exception |
| Service starts tx but repository calls ignore `conn` | Fix repository signatures and pass connection explicitly |
| Required event publish without available publisher | Raise `RequiredEventPublisherMissing` |
| Required event publish fails | Raise `RequiredDomainEventPublishFailed` |
| Optional publish fails | Log warning; do not abort business flow |
| Repository method contains business policy orchestration | Move policy logic into service |

### 5. Good/Base/Bad Cases

- Good: service opens one `self.tx()` block and passes `conn` to each repository write helper.
- Good: repository query helper encapsulates ORM filtering details and returns domain-focused data.
- Base: optional event fan-out failure logs warning while required event path remains strict.
- Bad: service method instantiates dependencies (`SomeRepo()`) inline inside each business method instead of constructor injection.
- Bad: service catches `RequiredDomainEventPublishFailed` and silently continues while claiming success.

### 6. Tests Required

- Service tests must assert:
  - transaction-scoped behavior with propagated `conn`
  - required event failure surfaces as typed service errors
  - optional event behavior remains non-blocking.
- Repository tests must assert connection propagation helpers (`using_db`, `_using_db_kwargs`) for transaction-aware queries.
- Architecture rule coverage should keep router-service-repository direction enforceable.
- Run backend quality checks as defined in quality/testing specs for cross-layer changes.

### 7. Wrong vs Correct

#### Wrong

```python
class WorkspaceService:
    async def invite_member(self, ...):
        repo = WorkspaceRepo()
        await repo.create_invite(...)
        await events.publish(Event(name="workspace.member.invited", payload={...}))
```

#### Correct

```python
class WorkspaceService(BaseService):
    def __init__(self, settings: Settings, *, repo: WorkspaceRepo) -> None:
        super().__init__(settings)
        self.repo = repo

    async def invite_member(self, ...) -> None:
        async with self.tx() as conn:
            await self.repo.create_invite(..., conn=conn)
        await self.publish_domain_event(
            name="workspace.member.invited",
            payload={"workspace_id": str(workspace_id)},
            actor_user_id=actor_user_id,
        )
```

Service boundary owns orchestration; repository boundary owns persistence; event publishing uses the canonical base-service contract.
