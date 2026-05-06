# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend quality is enforced through explicit architecture boundaries, Pydantic v2 contracts, canonical service/repository foundations, visible failures, and targeted tests.

The default backend quality gate is `pnpm api:check`. Narrow backend tests should run through `pnpm -C apps/api uv -- pytest ...` with a 60 second timeout for single-node or narrowly targeted test runs.

---

## Forbidden Patterns

### Scenario: Production Dataclass Ban

#### 1. Scope / Trigger

- Trigger: adding or changing structured data objects under `apps/api/src/**`.
- Example: query plans, lifecycle events, tenant contexts, plugin runtime specs, GraphQL planner values, and content runtime boundary objects.

#### 2. Signatures

- Immutable production value object:
  - `class QueryPage(BaseModel):`
  - `model_config = ConfigDict(frozen=True)`
- Field factory:
  - `items: list[str] = Field(default_factory=list)`
- Serialization:
  - `payload = value.model_dump(mode="json")`
- Validation:
  - `value = QueryPage.model_validate(raw_payload)`

#### 3. Contracts

- Production backend code under `apps/api/src/**` must not import or use `dataclasses`.
- Structured production data uses Pydantic v2 `BaseModel` or an existing project schema base.
- Immutable internal value objects use `ConfigDict(frozen=True)`.
- Mutable runtime collaborator containers use explicit plain classes with typed attributes and methods, not dataclasses.
- Behavior-only shapes use `Protocol`; closed values use `Enum` or `Literal`; one-step local argument bundles use explicit typed parameters.
- Code-review-engine rule `backend.no-production-dataclass` enforces this boundary.
- Tests under `apps/api/tests/**` may use local fixtures according to test policy, but production fixtures must not hide dataclass usage under `apps/api/src/**`.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| `from dataclasses import ...` under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| `import dataclasses` under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| `@dataclass` or aliased dataclass decorator under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| `dataclasses.dataclass(...)` or aliased factory call under `apps/api/src/**` | `backend.no-production-dataclass` reports a BLOCKER |
| Production file cannot be parsed during the rule check | The rule reports a BLOCKER instead of silently skipping verification |

#### 5. Good/Base/Bad Cases

- Good: a frozen Pydantic value object models an immutable query or lifecycle payload.
- Good: a runtime boundary with mutable collaborators is an explicit class with a real constructor and typed attributes.
- Base: a router or service method accepts separate typed parameters when the old object had no independent domain meaning.
- Bad: a production module keeps `@dataclass(frozen=True)` for a pure computation value object.
- Bad: a production module catches parser/read failures in the rule and returns no finding.

#### 6. Tests Required

- Rule fixture for production dataclass import/decorator violations.
- Rule fixture proving `apps/api/tests/**` fixtures are outside the production ban.
- Rule fixture for aliased imports or factory calls when those paths change.
- Focused backend tests for migrated value objects where constructor, equality, serialization, or immutability semantics changed.

#### 7. Wrong vs Correct

Wrong:

```python
from dataclasses import dataclass, field


@dataclass(frozen=True)
class QueryPage:
    limit: int
    includes: list[str] = field(default_factory=list)
```

Correct:

```python
from pydantic import BaseModel, ConfigDict, Field


class QueryPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    limit: int
    includes: list[str] = Field(default_factory=list)
```

---

## Required Patterns

### Scenario: Canonical Service Contract

#### 1. Scope / Trigger

- Trigger: creating or changing a backend service class that orchestrates business behavior, reads settings, talks to repositories, opens transactions, or publishes domain events.
- Example: `WorkspaceTeamService` emits Activity events and must use the same actor/source/publisher path as auth and upload services.

#### 2. Signatures

- Base class: `class ExampleService(BaseService):`
- Base import: `from src.core.services import BaseService, DomainEventPublisher`
- Constructor: `def __init__(self, settings: Settings, *, repo: ExampleRepository | None = None, event_publisher: DomainEventPublisher | None = events) -> None`
- Transaction: `async with self.tx() as conn:`
- Required event: `await self.publish_domain_event(name=..., payload=..., actor_user_id=..., source=...)`
- Optional event: `await self.publish_optional_domain_event(name=..., payload=..., actor_user_id=..., source=...)`
- Actor/context: `self.resolve_actor_context(...)`

#### 3. Contracts

- Production services with orchestration behavior extend `BaseService` from `src.core.services`.
- Constructor dependencies are injected at the constructor or factory boundary.
- Multi-step writes use `self.tx()` only when the called repository/entity-manager methods receive the yielded connection or an equivalent bound dependency.
- Service-level events go through the BaseService publisher helpers.
- Required event publication failures surface as typed service-contract errors.
- Optional observability fanout is explicit through `publish_optional_domain_event()`.
- JSON-shaped payload/config/meta/patch contracts use `JsonObject` / `JsonValue` (or a narrower alias) rather than broad `dict[str, object]`.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Required event publisher is missing | Raise `RequiredEventPublisherMissing` |
| Required event publish fails | Raise `RequiredDomainEventPublishFailed` |
| Optional event publisher is missing | Return the built event and log skipped publication |
| Optional event publish fails | Return the built event and log publish failure |
| Transaction receives existing `conn` | Yield the same connection without opening another transaction |

#### 5. Good/Base/Bad Cases

- Good: a service constructor receives `repo` and `event_publisher`, calls `super().__init__(settings, event_publisher=event_publisher)`, and publishes through `publish_domain_event()`.
- Base: a pure mixin attached to a `BaseService` subclass calls `cast(BaseService, self).publish_optional_domain_event(...)`.
- Bad: a service method imports `events`, builds `Event(...)`, and calls `events.publish(...)` directly.
- Bad: `patch: dict[str, object]` for JSON contracts where `JsonObject` is the real boundary type.

#### 6. Tests Required

- Unit tests for BaseService transaction reuse, required/optional publisher behavior, event envelope, and explicit actor/context overrides.
- Rule fixtures for direct event publish and BaseService inheritance in `scripts/code-review-engine/tests/test_rules.py`.
- Representative service tests when a domain service changes transaction or Activity behavior.

#### 7. Wrong vs Correct

Wrong:

```python
await events.publish(Event(name="workspace.member.invited", payload=payload))
```

Correct:

```python
await self.publish_domain_event(
    name="workspace.member.invited",
    payload=payload,
    actor_user_id=actor_user_id,
    source="api",
)
```

### Scenario: Tenant Payloads for Background Jobs

#### 1. Scope / Trigger

- Trigger: enqueueing a background job that reads or writes tenant-owned data.
- Example: project asset upload completion publishes `asset.uploaded`, then `core:assets:generate_thumbnails` reads the project asset from the tenant schema.

#### 2. Signatures

- Tenant serialization: `TenantContext.to_job_payload().model_dump(mode="json", by_alias=True)`
- Event payload field: `payload["tenant"]`
- Worker restore path: `TenantJobContextPayload.model_validate(tenant_payload).to_context()`

#### 3. Contracts

- Job payloads that cross process boundaries must carry tenant context explicitly.
- Services that are constructed with a `TenantContext` must prefer that explicit value when producing job or event payloads.
- ContextVars such as `current_tenant_context_or_none()` are acceptable only as a same-request fallback for code paths that have no injected tenant context.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Project job payload includes `tenant` | Worker binds `TenantDatabaseRouter` with the restored context |
| Project job payload omits `tenant` | Worker raises `TENANT_CONTEXT_REQUIRED` |
| Organization or user scoped asset upload emits event | Project thumbnail tenant payload is omitted |

#### 5. Good/Base/Bad Cases

- Good: `UploadsService(settings, tenant_context)` stores the context and serializes it into `asset.uploaded.payload["tenant"]`.
- Base: a same-request publisher with no injected context calls `tenant_payload_from_context()` and exposes `TenantContext is required` if the ambient context is missing.
- Bad: event payload generation silently skips `tenant` when `current_tenant_context_or_none()` returns `None`.

#### 6. Tests Required

- Unit test that makes the ambient tenant context unavailable and proves the explicit service context still appears in event payload.
- Worker contract test that missing tenant payload raises `TENANT_CONTEXT_REQUIRED`.

#### 7. Wrong vs Correct

Wrong:

```python
tenant_context = current_tenant_context_or_none()
if tenant_context is not None:
    payload["tenant"] = tenant_payload_from_context(tenant_context)
```

Correct:

```python
tenant_context = self._tenant_context or current_tenant_context_or_none()
payload["tenant"] = tenant_payload_from_context(tenant_context)
```

### Scenario: JSON Contract Typing

#### 1. Scope / Trigger

- Trigger: service/router/helper code that reads, merges, emits, or validates JSON-shaped payload/config/meta/patch values.
- Example: settings merge patches, audit event payloads, publish metadata manifests, mail provider config maps.

#### 2. Signatures

- JSON payload: `payload: JsonObject`
- JSON value: `value: JsonValue`
- Narrow alias: `type AuditPatch = dict[str, JsonValue | None]`

#### 3. Contracts

- Prefer `JsonObject` / `JsonValue` for JSON boundaries that cross service, storage, or event contracts.
- Use narrower `Literal`/typed aliases when the field set is constrained (for example model diff kind/stage).
- Avoid broad `dict[str, object]` on JSON pathways because it weakens type safety and causes `invalid-argument-type` drift.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| JSON map passed to event payload | Type as `JsonObject` (or narrower alias) |
| Enum-like string sent to typed schema field | Convert to explicit `Literal`/alias type, not `JsonValue` cast |
| Merge patch function input | Accept `JsonObject` for both current and patch |

#### 5. Wrong vs Correct

Wrong:

```python
def patch_namespace(*, patch: dict[str, object]) -> None: ...
```

Correct:

```python
def patch_namespace(*, patch: JsonObject) -> None: ...
```

### Scenario: Full-flow Activity Audit Coverage

#### 1. Scope / Trigger

- Trigger: adding, editing, or reviewing a backend mutation that must appear in user-visible Activity audit logs.
- Covered domains include auth, organization, workspace, project, content, release, asset, system, permission, and deployment mutations.
- Use this scenario whenever code emits an event with one of those event-family prefixes or calls a helper such as `_publish_activity_event`.

#### 2. Signatures

- Required event publisher for service orchestration:
  - `await self.publish_domain_event(name=..., payload=..., actor_context=..., source=...)`
- Required direct audit write for simple same-database cases:
  - `await write_required_activity_event(settings=self.settings, payload=ActivityAuditPayload(...), conn=conn)`
- Forbidden compliance-only publisher:
  - `await self.publish_optional_domain_event(name="workspace.member.invited", ...)`
  - `await self._publish_activity_event(name="workspace.invite.email.created", ...)` when the helper is best-effort
- Coverage matrix:
  - `docs/plans/architecture-hard-cut-2026-05-04/activity-coverage-matrix.md`
- Enforcement rule:
  - `service.no-optional-activity-publish`

#### 3. Contracts

- Compliance-critical Activity evidence must be required, durable, typed, and user-readable.
- The payload must be a typed Pydantic v2 model or a narrower JSON contract with explicit actor/context/entity fields.
- Actor/context data comes from `BaseService.resolve_actor_context()` or an explicit typed context passed into the service.
- Persistence must happen in the same business transaction or through an outbox row written in that same transaction.
- Same-transaction direct `AuditEvent` writes are allowed for simple cases only when the service is already inside `async with self.tx() as conn` and the audit helper receives that same `conn`.
- Direct audit writes must not be scheduled through `BackgroundTasks` or any post-response callback when the event is compliance-critical; failures must remain visible to the request or worker that owns the business mutation.
- `ActivityIngestor` queue delivery is acceptable for non-critical telemetry only; its bounded in-memory queue and drop-on-overload behavior are not sufficient for compliance-critical audit evidence.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Required audit publisher is missing | Raise a service-contract error or fail the outbox write visibly |
| Required audit publish/write fails | Business mutation fails or the outbox records a visible failure state |
| Business transaction rolls back | No committed `AuditEvent` or audit outbox evidence remains |
| Direct required audit write omits `conn` while the business mutation uses a transaction | Test fails until the audit write shares the business transaction |
| Payload contains password/token/secret/credential/raw API key material | Sanitization test fails until the persisted properties omit it |
| Service uses `publish_optional_domain_event()` for an Activity family event | `service.no-optional-activity-publish` reports a blocker |
| Service/mixin uses best-effort `_publish_activity_event()` for an Activity family event | `service.no-optional-activity-publish` reports a blocker |

#### 5. Good/Base/Bad Cases

- Good: a service writes business data and an audit outbox row inside `async with self.tx() as conn`, then a test reads the Activity record back.
- Good: a simple upload completion writes the asset and `ActivityAuditPayload(event_name="asset.uploaded", ...)` inside the same `self.tx()` connection and passes `conn` into `write_required_activity_event(...)`.
- Base: a non-critical notification or telemetry event uses `publish_optional_domain_event()` with a non-Activity event family such as `notification.delivered`.
- Bad: an auth, workspace, asset, system, or content mutation publishes Activity through `publish_optional_domain_event()` and swallows non-fatal failures.
- Bad: a service enqueues a required Activity write in `BackgroundTasks`, because the request may succeed before the audit evidence is durably committed.

#### 6. Tests Required

- Unit tests for payload validation and sanitization boundaries.
- Integration readback tests that execute the real mutation and query Activity records.
- Rollback tests for multi-write operations proving failed business changes do not commit Activity evidence.
- Code-review-engine fixtures for direct optional Activity events, helper-based Activity events, mixin helper calls, and Activity constants.

#### 7. Wrong vs Correct

Wrong:

```python
await self.publish_optional_domain_event(
    name="workspace.member.invited",
    payload={"workspace_id": str(workspace_id)},
    actor_user_id=actor_user_id,
)
```

Correct:

```python
async with self.tx() as conn:
    await self.repo.create_invite(..., conn=conn)
    await self.audit_repo.create_outbox_event(
        payload=WorkspaceMemberInvitedAuditPayload(...).model_dump(mode="json"),
        conn=conn,
    )
```

Also correct for simple direct `AuditEvent` writes:

```python
async with self.tx() as conn:
    asset_id = await self._complete_local(session=session, scope=scope, conn=conn)
    await write_required_activity_event(
        settings=self.settings,
        payload=ActivityAuditPayload(
            event_name="asset.uploaded",
            actor_user_id=session.actor_user_id,
            entity_type="asset",
            entity_id=asset_id,
            source="core",
            properties=payload,
        ),
        conn=conn,
    )
```

---

## Testing Requirements

- Router changes require success and failure-path tests for status code, response envelope, and stable error code.
- Service changes require unit or integration coverage for orchestration, permission checks, event publication, transaction behavior, and rollback behavior when relevant.
- Repository changes require focused coverage for query semantics, tenant binding, and explicit connection propagation.
- Schema changes require validation tests for good, base, and bad payloads.
- Cross-layer contract changes require generated OpenAPI/type usage checks and frontend consumer review.
- Compliance-critical Activity changes require readback tests that prove Activity evidence is durably written.
- Code-review-engine rule changes require fixtures for good and bad examples.

---

## Code Review Checklist

- [ ] Router code stays thin and does not call repositories directly.
- [ ] Services extend `BaseService` when they orchestrate business behavior, transactions, settings, persistence, or domain events.
- [ ] Repositories use `TortoiseORMRepository` or a documented tenant-aware repository base.
- [ ] JSON boundaries use `JsonObject` / `JsonValue` or a narrower typed alias.
- [ ] Production code under `apps/api/src/**` does not use dataclasses.
- [ ] Required Activity events are durable and typed, not optional fanout.
- [ ] Errors surface through typed `APIError` subclasses or documented framework boundaries.
- [ ] Tests assert stable error codes and contract fields, not only status codes.
- [ ] New rules avoid silent fallback paths and expose root failures clearly.
