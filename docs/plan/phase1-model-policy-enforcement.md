# Phase 1 Follow-Up: ModelPolicy Runtime Enforcement

**Status:** Planned  
**Depends on:** Phase 1 AI Infrastructure (df45ff47)  
**Estimated effort:** 2-3 days

## Problem

`ModelPolicy` defines `allowed_models`, `max_tokens_per_request`,
`max_cost_micros_per_request`, and `data_retention_enabled` fields, but the
request path never queries or enforces them beyond a temporary default at
`apps/api/src/modules/ai/service.py:355`.

The error code enum in `apps/api/src/llm/errors.py` already defines:
`POLICY_MODEL_NOT_ALLOWED`, `POLICY_MAX_TOKENS_EXCEEDED`,
`POLICY_COST_LIMIT_EXCEEDED`, `POLICY_DATA_RETENTION_VIOLATION` — but they are
never raised during request processing.

## Spec Reference

reports/AI-AGENT-SPEC.html §2.1 LLMRuntime:

> `LLMRuntime.chat()` step 2: Model Policy 校验 (允许模型/最大 token/成本上限/provider 限制)

## Deliverables

### 1. New module: `apps/api/src/llm/policy.py`

```python
async def resolve_model_policy(workspace_id: UUID, user_id: UUID | None) -> ModelPolicy:
    """Resolve the active policy by priority: user > workspace > global default.

    Merge rule (field-level inheritance):
    - Each field on a higher-priority policy that is explicitly set (non-null,
      non-zero sentinel) overrides the lower-tier value.
    - Fields left at their defaults inherit from the next tier down.
    - `allowed_models=[]` at any tier means "allow all models at this tier"
      (acts as unset — inherits).
    - `max_tokens_per_request=0` at any tier means "no limit at this tier"
      (acts as unset — inherits).
    - `max_cost_micros_per_request=0` at any tier means "no limit at this tier"
      (acts as unset — inherits).
    - When multiple policies exist at the same tier, take the highest
      `priority` value (higher number = higher priority).
    """

def enforce_model_policy(
    model: str,
    max_tokens: int | None,
    estimated_cost_micros: int,
    policy: ModelPolicy,
    provider: str,
) -> None:
    """Enforce the resolved policy.  Raises LLMRuntimeError with:

    - POLICY_MODEL_NOT_ALLOWED (403) — model not in allowed_models list
      (only when allowed_models is non-empty)
    - POLICY_MAX_TOKENS_EXCEEDED (400) — max_tokens > policy.max_tokens_per_request
    - POLICY_COST_LIMIT_EXCEEDED (400) — estimated cost > policy.max_cost_micros
    - POLICY_DATA_RETENTION_VIOLATION (400) — reserved for future org-level
      constraints on retention opt-out
    """
```

### 2. Provider-level model restriction

The spec requires "provider 限制".  Since `ModelPolicy` does not currently have
a `provider` field, enforcement is indirect: `allowed_models` implicitly
restricts providers via model name prefixes (e.g. `gpt-*` → OpenAI,
`claude-*` → Anthropic).  If a model is allowed, its provider is allowed.

If direct provider restrictions are needed later, add `allowed_providers: list[str]`
to `ModelPolicy` as a follow-up.

### 3. LLMRuntime integration

Both `chat()` and `chat_stream()` call:
1. `resolve_model_policy(workspace_id, user_id)` → `ModelPolicy`
2. `enforce_model_policy(model, max_tokens, estimated_cost, policy, provider)`

This runs AFTER key resolution (see key-resolution.md) and BEFORE the LiteLLM call.

### 4. Data retention handling

`ModelPolicy.data_retention_enabled` controls provider-specific behavior:

| Provider | `False` (opt-out) | `True` (allow) |
|----------|-------------------|----------------|
| OpenAI   | Add `store: false` to request body | Omit (use provider default) |
| Anthropic | No per-request parameter exists — log audit warning `PROVIDER_DATA_RETENTION_NOT_HONORED` and proceed | Omit |
| Other    | Log audit warning `PROVIDER_DATA_RETENTION_NOT_HONORED`, proceed without params |

The resolved policy's value overrides `AISettings.data_retention_enabled`.

### 5. Default policy

When no DB policies exist for the workspace or user, the global default is:
```python
ModelPolicy(
    allowed_models=[],           # empty = allow all
    max_tokens_per_request=0,    # 0 = no limit
    max_cost_micros_per_request=0,  # 0 = no limit
    data_retention_enabled=AISettings.data_retention_enabled,  # defaults to False
)
```

## Verification

```bash
pnpm -C apps/api test tests/infra/llm/test_policy.py
pnpm -C apps/api test tests/infra/llm/test_integration.py -k "model_policy"
```

## Files Changed

| File | Action |
|------|--------|
| `apps/api/src/llm/policy.py` | **New** |
| `apps/api/src/llm/runtime.py` | Modify — call enforcement in both `chat()` AND `chat_stream()` |
| `apps/api/src/modules/ai/service.py` | Modify — remove stub; ensure policy runs through runtime |
| `tests/infra/llm/test_policy.py` | **New** |

No changes to `errors.py` needed — error codes already exist with correct status mappings.

## Acceptance Criteria

- [ ] Workspace policy `allowed_models=["gpt-4o-mini"]` → request with `gpt-4o` returns `POLICY_MODEL_NOT_ALLOWED` (403)
- [ ] Policy `max_tokens_per_request=1024` → request with `max_tokens=4096` returns `POLICY_MAX_TOKENS_EXCEEDED` (400)
- [ ] Policy `max_cost_micros_per_request=50000` → request exceeding cost returns `POLICY_COST_LIMIT_EXCEEDED` (400)
- [ ] User-level policy overrides workspace on per-field basis (e.g. user allows more models but inherits token limit)
- [ ] No policy configured → global default applies (all models allowed, no limits)
- [ ] `data_retention_enabled=false` → OpenAI request body includes `store: false`
- [ ] `data_retention_enabled=false` for non-OpenAI/non-Anthropic → audit warning logged, request proceeds
- [ ] Both `chat()` and `chat_stream()` enforce policy before LiteLLM call
- [ ] Policy enforcement error response includes `code`, `message`, and `status` fields matching `LLMRuntimeError` contract
