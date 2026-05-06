# Backend EntityManager Contracts

This code-spec defines when backend services must use `EntityManager`, which write flows it owns, and how lifecycle/transaction boundaries are enforced.

## Scenario: Unified Content Write Path with Lifecycle Dispatch

### 1. Scope / Trigger

- Trigger: adding or changing content item create/update/delete/publish flows, content write orchestration, or write-path policy checks.
- Applies to:
  - `apps/api/src/core/entity_manager/manager.py`
  - services that orchestrate content item writes (for example project content canonical services)
  - lifecycle-aware content automation and search subscribers.

### 2. Signatures

- Constructor:
  - `EntityManager(items_repo: ProjectContentItemsRepository, lifecycle: LifecycleDispatcher | None = None)`
- Write methods:
  - `create(...) -> EntityCreateResult`
  - `update(...) -> EntityUpdateResult`
  - `delete(...) -> bool`
  - `dispatch_before_publish(...) -> LifecycleEvent`
  - `dispatch_after_publish(...) -> None`
- Read/projection helpers:
  - `find_one(...) -> Any | None`
  - `find_many(...) -> list[Any]`
- Result models:
  - `EntityCreateResult(item, version)`
  - `EntityUpdateResult(version, previous_version_number)`

### 3. Contracts

- `EntityManager` is the canonical orchestration boundary for content item writes that require lifecycle hooks and versioned snapshot behavior.
- `create` must:
  - resolve model definition by `model_key`
  - raise `NotFound(..., error="CONTENT_MODEL_NOT_FOUND")` if missing
  - dispatch `BEFORE_CREATE`
  - merge input `data` with `before_event.data`
  - create `ContentItemRecord` and first `ContentVersionRecord` in one transaction
  - dispatch `AFTER_CREATE` after transaction commit.
- `update` must:
  - dispatch `BEFORE_UPDATE`
  - load item with lock (`for_update=True`)
  - raise `NotFound(..., error="CONTENT_ITEM_NOT_FOUND")` if missing
  - write new draft version and update `draft_version` in one transaction
  - dispatch `AFTER_UPDATE`.
- `delete` must:
  - lock target item first
  - dispatch `BEFORE_DELETE` before actual deletion
  - support optional `before_commit` hook inside transaction
  - dispatch `AFTER_DELETE` only when delete count > 0.
- Publish flow must use explicit lifecycle bridge:
  - `dispatch_before_publish` before publish state transition
  - `dispatch_after_publish` after publish side effects.
- Services own field-contract validation and domain policy checks before invoking `EntityManager` writes.
- When a caller already has a transaction connection, write methods that support it must reuse the same connection boundary via internal `_transaction` helper and repository `conn` propagation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Model key does not resolve in create flow | Raise `CONTENT_MODEL_NOT_FOUND` |
| Item not found in update flow | Raise `CONTENT_ITEM_NOT_FOUND` |
| Item not found in delete flow | Return `False` (no after-delete dispatch) |
| Blocking lifecycle subscriber fails in before phase | Abort write and bubble exception |
| `before_commit` callback provided | Execute inside transaction before commit |
| Lifecycle dispatcher is `None` | Write succeeds without dispatch; returns synthetic before event for merge behavior |
| Query plan has unsupported filter operator | Raise explicit `ValueError` from `_matches_filter_condition` |

### 5. Good/Base/Bad Cases

- Good: content canonical service routes create/update/delete through `EntityManager` and supplies actor/context for hooks.
- Good: automation runtime composes content service factory with `EntityManager(items_repo=..., lifecycle=...)`.
- Base: read-only helper path (`find_many`) applies query-plan filters/sorts/pagination in memory for current snapshot behavior.
- Bad: service directly calls `ProjectContentItemsRepository.create_item` for a lifecycle-required write path.
- Bad: lifecycle dispatch is moved from `EntityManager` into ad-hoc route helper logic.

### 6. Tests Required

- Integration tests for create/update/delete/publish must assert:
  - correct lifecycle actions fire
  - version counters and draft pointers are updated
  - missing model/item branches return required errors/booleans.
- Transaction tests must verify `before_commit` executes within the same DB transaction and rollback semantics hold.
- Lifecycle failure tests must verify blocking before-hooks abort the write path.
- Code-review-engine rule coverage should keep `entity-manager.write-must-use-em` aligned with live write paths.

### 7. Wrong vs Correct

#### Wrong

```python
item = await repo.create_item(...)
await repo.create_version(item_id=item.id, ...)
```

#### Correct

```python
em_result = await entity_manager.create(
    workspace_id=workspace_id,
    site_id=site_id,
    model_key=model_key,
    data=payload,
    slug=slug,
    actor_id=actor_user_id,
)
```

The canonical write path preserves lifecycle hooks, version semantics, and transaction boundaries together.
