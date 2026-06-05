# Phase 1 Follow-Up: Workspace-First LLM Key Resolution

**Status:** Planned  
**Depends on:** Phase 1 AI Infrastructure (df45ff47)  
**Estimated effort:** 3-5 days

## Problem

`LLMRuntime` has a placeholder comment "Key resolution deferred".  LiteLLM requires
a Virtual Key (`Authorization: Bearer <key>`) for every inference request, but the
runtime creates `LiteLLMClient` without one.  The `AIAPIKey` and
`UserKeyWorkspaceGrant` models exist but have no runtime resolver.

## Spec Reference (reports/AI-AGENT-SPEC.html §2.3)

Resolution priority (strict — no fallback to master key):

1. **Workspace-owned Virtual Key** — `AIAPIKey(owner_type=WORKSPACE, owner_id=workspace_id, key_type=VIRTUAL_KEY, is_active=True)`
2. **User-granted Virtual Key** — `UserKeyWorkspaceGrant(approval_state=APPROVED, revoked_at=null)` → `AIAPIKey(owner_type=USER, owner_id=user_id, is_active=True)`
3. **Platform shared Virtual Key** — only when the workspace explicitly allows it → `AIAPIKey(owner_type=PLATFORM, key_type=VIRTUAL_KEY, is_active=True)`

**The LiteLLM Master Key is NEVER used for inference requests.**  It is only used
for administrative operations (key creation, rotation).  Using it as a fallback would
bypass key isolation and audit trails.

## Deliverables

### 1. New module: `apps/api/src/llm/keys.py`

```python
@dataclass
class ResolvedLLMKey:
    virtual_key: str         # The Bearer token for LiteLLM
    key_id: UUID | None      # AIAPIKey.id
    grant_id: UUID | None    # UserKeyWorkspaceGrant.id (only for user grants)

async def resolve_litellm_key(
    workspace_id: UUID,
    user_id: UUID | None,
    provider: str,
    *,
    master_key_path: Path | None = None,
) -> ResolvedLLMKey:
    """Resolve a LiteLLM Virtual Key using Workspace-First priority.

    Raises LLMRuntimeError(code=AUTH_NO_KEY, status_code=401) if no key.
    Raises LLMRuntimeError(code=AUTH_GRANT_*) for grant state errors.
    """
```

**Per-call checks** (grant validity is re-checked on every resolution):
- `AIAPIKey.is_active == True`
- `AIAPIKey.expires_at` not past
- `UserKeyWorkspaceGrant.approval_state == APPROVED`
- `UserKeyWorkspaceGrant.revoked_at` is null
- User is still a workspace member

### 2. Platform shared key toggle

The third fallback tier is gated.  Add `allow_platform_key: bool = False` to
`AISettings` (default `False` — opt-in).  Only when this is `True` does the
resolver attempt the platform shared key tier.

### 3. Key encryption

- Add `master_key_path: str | None` to `AISettings` (path to a symmetric key file)
- Add `virtual_key_enc: str | None` to `AIAPIKey` model (Fernet-encrypted)
- `keys.py` exports `encrypt_virtual_key(plain: str, key_path: Path) -> str`
  and `decrypt_virtual_key(enc: str, key_path: Path) -> str`
- Plain-text keys never appear in logs, audit records, or API responses

### 4. LiteLLM metadata

When constructing the LiteLLM request, include metadata in the virtual key
headers so the proxy can tag usage:
```json
{"workspace_id": "...", "owner_user_id": "...", "grant_id": "..."}
```

### 5. Grant lifecycle hooks

| Event | Action |
|-------|--------|
| User leaves workspace | `WorkspaceMembership.delete` → cascade revoke all grants for (user, workspace) |
| Key rotated | `AIAPIKey.is_active = False` → all grants referencing this key become unusable |
| Key deleted | Same as rotated — grants are stale, resolver skips them |
| Grant approval state changes | Resolver re-checks `approval_state` on every call |

Implement as signal handlers on the respective Tortoise models.

### 6. LLMRuntime integration

`chat()` and `chat_stream()` call `resolve_litellm_key()` before the provider call.
The resolved `virtual_key` is passed as a `virtual_key` keyword argument to
`LiteLLMClient.chat()` / `chat_stream()` — it becomes an `Authorization: Bearer`
header, never a body field.  `grant_id` is written to `context.grant_id`.

### 7. Migration

**New migration** `0008_ai_api_key_virtual_key_enc.py` (does NOT modify existing 0007):
- Add `virtual_key_enc TEXT NULL` to `ai_api_keys`
- Add `metadata_json JSONB NULL` to `ai_api_keys`

## Verification

```bash
pnpm -C apps/api test tests/infra/llm/test_keys.py
pnpm -C apps/api test tests/infra/llm/test_integration.py -k "key_resolution"
pnpm -C apps/api test tests/infra/llm/test_key_grants.py
```

## Files Changed

| File | Action |
|------|--------|
| `apps/api/src/llm/keys.py` | **New** |
| `apps/api/src/llm/runtime.py` | Modify — call resolver in `chat()` and `chat_stream()` |
| `apps/api/src/llm/litellm_client.py` | Modify — accept `virtual_key=` as explicit kwarg, never in body |
| `apps/api/src/llm/errors.py` | No change (codes already exist) |
| `apps/api/src/config.py` | Modify — add `master_key_path` and `allow_platform_key` to `AISettings` |
| `apps/api/src/models/ai/ai_api_key.py` | Modify — add `virtual_key_enc`, `metadata_json` |
| `apps/api/src/models/workspaces/workspace_membership.py` | Modify — add grant revocation on member leave |
| `apps/api/src/migrations/0008_ai_api_key_virtual_key_enc.py` | **New** |
| `tests/infra/llm/test_keys.py` | **New** |
| `tests/infra/llm/test_key_grants.py` | **New** |

## Acceptance Criteria

- [ ] Workspace with Virtual Key → LiteLLM receives `Authorization: Bearer <key>`
- [ ] Workspace without key, user with approved grant → user's key used
- [ ] Platform shared allowed + platform key exists → platform key used
- [ ] Platform shared DISallowed → `AUTH_NO_KEY` (401), no fallback to master
- [ ] No key available → `AUTH_NO_KEY` (401)
- [ ] Inactive workspace/platform key → skipped, tries next tier
- [ ] Expired workspace/platform key → skipped, tries next tier
- [ ] Approved user grant whose referenced key is inactive → `AUTH_KEY_DISABLED` (403, does NOT fall through)
- [ ] Revoked grant → `AUTH_GRANT_REVOKED` (403)
- [ ] User not workspace member → `AUTH_NOT_WORKSPACE_MEMBER` (403)
- [ ] Key rotated (set inactive) → previously valid grant now returns `AUTH_KEY_DISABLED` (403)
- [ ] Resolver re-checks grant/key state on every request (no caching stale state)
- [ ] LiteLLM request metadata includes `workspace_id`, `owner_user_id`, `grant_id`
- [ ] Encrypted keys not logged, not in audit records, not in API responses
- [ ] `virtual_key` is passed as method kwarg → `Authorization` header, never in request body
