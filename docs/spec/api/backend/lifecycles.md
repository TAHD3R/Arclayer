# Backend Lifecycle Contracts

This code-spec defines lifecycle event contracts, subscriber semantics, and failure boundaries for backend write workflows.

## Scenario: Lifecycle Dispatcher and Subscriber Boundaries

### 1. Scope / Trigger

- Trigger: adding write-side hooks, subscriber registration, lifecycle-aware integrations, or changing lifecycle dispatch behavior.
- Applies to:
  - `apps/api/src/core/lifecycles/specs.py`
  - `apps/api/src/core/lifecycles/dispatcher.py`
  - `apps/api/src/core/runtime_init.py`
  - lifecycle subscribers in `apps/api/src/core/lifecycles/subscribers/**`.

### 2. Signatures

- Lifecycle action enum:
  - `LifecycleAction`: `BEFORE_CREATE`, `AFTER_CREATE`, `BEFORE_UPDATE`, `AFTER_UPDATE`, `BEFORE_DELETE`, `AFTER_DELETE`, `BEFORE_PUBLISH`, `AFTER_PUBLISH`
- Event payload:
  - `LifecycleEvent(action, model_key, workspace_id, site_id, item_id, data, result, actor_id, state)`
- Subscriber type:
  - `LifecycleSubscriber = Callable[[LifecycleEvent], Awaitable[None]]`
- Dispatcher API:
  - `register(subscriber_id, action, handler)`
  - `unregister(subscriber_id, action=None, handler=None)`
  - `dispatch(event)`
  - `dispatch_before(...) -> LifecycleEvent`
  - `dispatch_after(...) -> None`

### 3. Contracts

- Lifecycle events are immutable at model-level (`frozen=True`) but allow mutable `data` and `state` payloads for before/after choreography.
- `dispatch_before` must return the event instance so caller can consume normalized/enriched `event.data`.
- `dispatch_after` dispatches result/event context but returns no value.
- Blocking actions are:
  - `BEFORE_CREATE`
  - `BEFORE_UPDATE`
  - `BEFORE_DELETE`
  - `BEFORE_PUBLISH`
- Subscriber failures on blocking actions must abort caller flow by re-raising the exception after logging.
- Subscriber failures on non-blocking actions (`AFTER_*`) must be logged and execution continues.
- Fatal runtime exceptions (`GeneratorExit`, `KeyboardInterrupt`, `SystemExit`, plus `CancelledError` handling at call site) must never be swallowed.
- `runtime_init` owns canonical base subscriber registration:
  - `auto_timestamps` for `BEFORE_CREATE` and `BEFORE_UPDATE`
  - `require_target_context` for `BEFORE_DELETE` and `BEFORE_PUBLISH`
- Service/module code must not build private lifecycle registries when app runtime already exposes `app.state.lifecycle_dispatcher`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Register called with empty `subscriber_id` or missing `action` | Raise `ValueError` |
| Blocking `BEFORE_*` subscriber raises `ValueError` | Log with action/model/subscriber and re-raise |
| Non-blocking `AFTER_*` subscriber raises non-fatal exception | Log and continue without aborting request |
| Fatal exception raised inside subscriber | Re-raise immediately |
| `unregister` removes last handler for an action | Remove action key from registry |
| Event has no subscribers for action | Dispatch is no-op |

### 5. Good/Base/Bad Cases

- Good: validator subscriber rejects publish/delete without `item_id` using `require_target_context`, blocking invalid operations before persistence.
- Good: webhook fan-out runs on `AFTER_*`; errors are logged but do not rollback committed write.
- Base: timestamp subscriber enriches `event.data` on `BEFORE_CREATE/BEFORE_UPDATE`.
- Bad: module defines a custom `before_publish_hooks: list[Callable]` and bypasses `LifecycleDispatcher`.
- Bad: catching and ignoring blocking subscriber exceptions in caller service/entity manager code.

### 6. Tests Required

- Dispatcher tests must assert blocking vs non-blocking failure semantics.
- Runtime initialization tests must assert canonical subscribers are registered on startup.
- Integration tests for publish/delete flows must assert missing `item_id` fails before side effects.
- Subscriber registry tests must assert unregister behavior and no duplicate stale actions.

### 7. Wrong vs Correct

#### Wrong

```python
try:
    await lifecycle.dispatch_before(...)
except Exception:
    pass
```

#### Correct

```python
before_event = await lifecycle.dispatch_before(...)
resolved_data = {**data, **before_event.data}
```

Blocking lifecycle validation failures surface explicitly; successful before-hooks can enrich write payload.
