"""Workspace-First LLM Key Resolution.

Resolution priority (strict — no fallback to master key):
    1. Workspace-owned Virtual Key
    2. User-granted Virtual Key (approved, not revoked)
    3. Platform shared Virtual Key (only when workspace explicitly allows it)

The LiteLLM Master Key is NEVER used for inference requests.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from cryptography.fernet import Fernet

from src.llm.errors import ERROR_CODE_STATUS, LLMErrorCode
from src.llm.runtime import LLMRuntimeError


@dataclass
class ResolvedLLMKey:
    """Resolved LiteLLM Virtual Key for an inference request."""

    virtual_key: str
    key_id: UUID | None = None
    grant_id: UUID | None = None
    metadata: dict | None = None


def _load_or_create_fernet(master_key_path: Path) -> Fernet:
    """Load a Fernet key from file, or create it if the file does not exist."""
    if master_key_path.exists():
        key = master_key_path.read_bytes()
        return Fernet(key)
    key = Fernet.generate_key()
    master_key_path.parent.mkdir(parents=True, exist_ok=True)
    master_key_path.write_bytes(key)
    os.chmod(master_key_path, 0o600)
    return Fernet(key)


def _load_fernet(master_key_path: Path) -> Fernet:
    """Load a Fernet key from file. Fails if the file does not exist."""
    if not master_key_path.exists():
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
            message=f"Encryption key file not found at {master_key_path}",
            status_code=500,
        )
    key = master_key_path.read_bytes()
    return Fernet(key)


def encrypt_virtual_key(plain: str, master_key_path: Path | None) -> str:
    """Encrypt a plain-text virtual key. Returns base64-encoded ciphertext."""
    if master_key_path is None:
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
            message="master_key_path is not configured; cannot encrypt virtual key",
            status_code=500,
        )
    fernet = _load_or_create_fernet(master_key_path)
    return fernet.encrypt(plain.encode()).decode()


def decrypt_virtual_key(enc: str, master_key_path: Path | None) -> str:
    """Decrypt an encrypted virtual key. Returns plain text.

    Uses load-only mode: the key file must already exist. If the key file is
    missing, the stored data cannot be decrypted and a clear error is raised.
    """
    if master_key_path is None:
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
            message="master_key_path is not configured; cannot decrypt virtual key",
            status_code=500,
        )
    fernet = _load_fernet(master_key_path)
    return fernet.decrypt(enc.encode()).decode()


async def resolve_litellm_key(
    workspace_id: UUID,
    user_id: UUID | None,
    provider: str,
    *,
    master_key_path: Path | None = None,
    allow_platform_key: bool = False,
) -> ResolvedLLMKey:
    """Resolve a LiteLLM Virtual Key using Workspace-First priority.

    Raises LLMRuntimeError(code=AUTH_NO_KEY, status_code=401) if no key available.
    Raises LLMRuntimeError(code=AUTH_GRANT_*) for grant state errors.
    """
    from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
    from src.models.ai.user_key_grant import UserKeyWorkspaceGrant, is_grant_active
    from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus

    now = datetime.now(UTC)

    # When a user context is present, verify workspace membership first.
    # This guards all tiers: a non-member must never consume a workspace key.
    if user_id is not None:
        membership = await WorkspaceMembership.filter(
            workspace_id=workspace_id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).first()

        if membership is None:
            raise LLMRuntimeError(
                code=LLMErrorCode.AUTH_NOT_WORKSPACE_MEMBER,
                message="User is not an active member of this workspace",
                status_code=ERROR_CODE_STATUS[LLMErrorCode.AUTH_NOT_WORKSPACE_MEMBER],
            )

    # Tier 1: Workspace-owned Virtual Key (filter expired at query level).
    from tortoise.expressions import Q

    ws_key = (
        await AIAPIKey
        .filter(
            owner_type=KeyOwnerType.WORKSPACE,
            owner_id=workspace_id,
            key_type=KeyType.VIRTUAL_KEY,
            provider=provider,
            is_active=True,
        )
        .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
        .first()
    )

    if ws_key is not None:
        plain = _decrypt_key(ws_key, master_key_path)
        if plain is not None:
            return ResolvedLLMKey(
                virtual_key=plain,
                key_id=ws_key.id,
                metadata={
                    "workspace_id": str(workspace_id),
                    "owner_type": "workspace",
                },
            )

    # Tier 2: User-granted Virtual Key.
    if user_id is not None:
        grants = await UserKeyWorkspaceGrant.filter(
            workspace_id=workspace_id,
            user_id=user_id,
        ).all()

        for grant in grants:
            if not is_grant_active(grant.approval_state):
                continue
            if grant.revoked_at is not None:
                continue

            try:
                key = await AIAPIKey.get(id=grant.api_key_id)
            except Exception as exc:
                # Only skip non-existent keys; let infrastructure errors propagate.
                clsname = type(exc).__name__
                if clsname == "DoesNotExist":
                    continue
                raise

            if not key.is_active:
                continue  # Try next grant — a different grant may reference an active key.
            if key.expires_at is not None and key.expires_at <= now:
                continue
            if key.owner_type != KeyOwnerType.USER:
                continue
            if key.owner_id != user_id:
                continue
            if key.key_type != KeyType.VIRTUAL_KEY:
                continue
            if key.provider != provider:
                continue

            plain = _decrypt_key(key, master_key_path)
            if plain is not None:
                return ResolvedLLMKey(
                    virtual_key=plain,
                    key_id=key.id,
                    grant_id=grant.id,
                    metadata={
                        "workspace_id": str(workspace_id),
                        "owner_user_id": str(user_id),
                        "grant_id": str(grant.id),
                    },
                )

    # Tier 3: Platform shared Virtual Key (only when explicitly allowed).
    if allow_platform_key:
        platform_key = (
            await AIAPIKey
            .filter(
                owner_type=KeyOwnerType.PLATFORM,
                key_type=KeyType.VIRTUAL_KEY,
                provider=provider,
                is_active=True,
            )
            .filter(Q(expires_at__gt=now) | Q(expires_at__isnull=True))
            .first()
        )

        if platform_key is not None:
            plain = _decrypt_key(platform_key, master_key_path)
            if plain is not None:
                return ResolvedLLMKey(
                    virtual_key=plain,
                    key_id=platform_key.id,
                    metadata={
                        "workspace_id": str(workspace_id),
                        "owner_type": "platform",
                    },
                )

    raise LLMRuntimeError(
        code=LLMErrorCode.AUTH_NO_KEY,
        message="No valid LiteLLM virtual key available for this workspace",
        status_code=ERROR_CODE_STATUS[LLMErrorCode.AUTH_NO_KEY],
    )


def _decrypt_key(key, master_key_path: Path | None) -> str | None:
    """Decrypt a key's virtual_key_enc field.

    Returns None if the key has no encrypted secret (legacy row with only
    key_hash/litellm_key_id). Callers should skip to the next tier.
    """
    if key.virtual_key_enc:
        try:
            from cryptography.fernet import InvalidToken

            return decrypt_virtual_key(key.virtual_key_enc, master_key_path)
        except InvalidToken:
            raise LLMRuntimeError(
                code=LLMErrorCode.AUTH_NO_KEY,
                message="Stored virtual key could not be decrypted (key may be corrupted)",
                status_code=ERROR_CODE_STATUS[LLMErrorCode.AUTH_NO_KEY],
            )
    return None


async def revoke_user_grants_for_workspace(
    user_id: UUID,
    workspace_id: UUID,
    *,
    using_db=None,
) -> int:
    """Revoke all approved grants for a (user, workspace) pair.

    Called when a user leaves a workspace or membership is disabled.
    Returns the count of revoked grants.

    Accepts an optional ``using_db`` connection so grant revocations share
    the caller's transaction and roll back atomically with membership changes.

    NOTE: This function must be called explicitly from any code path that
    disables or removes a WorkspaceMembership, including bulk .update() calls
    which do not trigger Tortoise signals (pre_save/post_delete).
    """
    from src.models.ai.user_key_grant import GrantApprovalState, UserKeyWorkspaceGrant

    grants = await UserKeyWorkspaceGrant.filter(
        user_id=user_id,
        workspace_id=workspace_id,
        approval_state=GrantApprovalState.APPROVED,
    ).all()

    count = 0
    now = datetime.now(UTC)
    for grant in grants:
        grant.approval_state = GrantApprovalState.REVOKED
        grant.revoked_at = now
        await grant.save(using_db=using_db)
        count += 1

    return count


async def revoke_grants_for_key(key_id: UUID) -> int:
    """Revoke all active grants referencing a given key.

    Called when a key is rotated or disabled. Returns the count of revoked grants.
    """
    from src.models.ai.user_key_grant import GrantApprovalState, UserKeyWorkspaceGrant

    grants = await UserKeyWorkspaceGrant.filter(
        api_key_id=key_id,
        approval_state=GrantApprovalState.APPROVED,
    ).all()

    count = 0
    now = datetime.now(UTC)
    for grant in grants:
        grant.approval_state = GrantApprovalState.REVOKED
        grant.revoked_at = now
        await grant.save()
        count += 1

    return count
