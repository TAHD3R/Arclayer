"""Provision workspace-scoped LiteLLM virtual keys on first use."""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import UUID

import httpx
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.llm.errors import ERROR_CODE_STATUS, LLMErrorCode
from src.llm.keys import encrypt_virtual_key
from src.llm.litellm_client import LiteLLMClient
from src.llm.runtime import LLMRuntimeError, _resolve_key_path
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.system.ai_providers.configuration import list_active_system_models

WORKSPACE_KEY_METADATA_SOURCE = "workspace.ai_key_provisioning"


async def ensure_workspace_virtual_key(
    settings: Settings,
    *,
    workspace_id: UUID,
    user_id: UUID | None,
    provider: str,
) -> None:
    """Ensure an active workspace-owned virtual key exists for a provider."""
    normalized_provider = provider.strip()
    await _require_active_membership(workspace_id, user_id)

    existing = await _find_active_workspace_key(workspace_id, normalized_provider)
    if existing is not None or not settings.ai.workspace_key_auto_provision_enabled:
        return
    if not settings.ai.litellm_master_key or not settings.ai.master_key_path:
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
            message="Workspace key auto-provisioning is not configured",
            status_code=ERROR_CODE_STATUS[LLMErrorCode.SYSTEM_INTERNAL_ERROR],
        )

    models = sorted({
        item.public_model for item in await list_active_system_models() if item.provider.strip() == normalized_provider
    })
    if not models:
        return

    client = LiteLLMClient(
        base_url=settings.ai.litellm_base_url,
        timeout_seconds=settings.ai.litellm_timeout_seconds,
    )
    virtual_key: str | None = None
    try:
        payload = await client.generate_key(
            master_key=str(settings.ai.litellm_master_key),
            models=models,
            metadata={
                "owner_type": KeyOwnerType.WORKSPACE.value,
                "workspace_id": str(workspace_id),
                "provider": normalized_provider,
                "source": WORKSPACE_KEY_METADATA_SOURCE,
            },
        )
        virtual_key = _read_virtual_key(payload)
        encrypted = encrypt_virtual_key(virtual_key, _resolve_key_path(settings.ai.master_key_path))
        await AIAPIKey.create(
            owner_type=KeyOwnerType.WORKSPACE,
            owner_id=workspace_id,
            key_type=KeyType.VIRTUAL_KEY,
            provider=normalized_provider,
            litellm_key_id=_read_key_id(payload),
            key_hash=_hash_key(virtual_key),
            virtual_key_enc=encrypted,
            metadata_json={
                "owner_type": KeyOwnerType.WORKSPACE.value,
                "workspace_id": str(workspace_id),
                "provider": normalized_provider,
                "models": models,
                "source": WORKSPACE_KEY_METADATA_SOURCE,
            },
        )
    except IntegrityError:
        await _delete_generated_key(client, settings, virtual_key)
        if await _find_active_workspace_key(workspace_id, normalized_provider) is None:
            raise
    except httpx.HTTPError as exc:
        await _delete_generated_key(client, settings, virtual_key)
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_LITELLM_UNREACHABLE,
            message="LiteLLM workspace key provisioning failed",
            status_code=ERROR_CODE_STATUS[LLMErrorCode.SYSTEM_LITELLM_UNREACHABLE],
        ) from exc
    except BaseException:
        await _delete_generated_key(client, settings, virtual_key)
        raise


async def _find_active_workspace_key(workspace_id: UUID, provider: str) -> AIAPIKey | None:
    return await AIAPIKey.filter(
        owner_type=KeyOwnerType.WORKSPACE,
        owner_id=workspace_id,
        key_type=KeyType.VIRTUAL_KEY,
        provider=provider,
        is_active=True,
        virtual_key_enc__not_isnull=True,
    ).first()


async def _require_active_membership(workspace_id: UUID, user_id: UUID | None) -> None:
    if user_id is None:
        return
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


async def _delete_generated_key(
    client: LiteLLMClient,
    settings: Settings,
    virtual_key: str | None,
) -> None:
    if virtual_key is None or not settings.ai.litellm_master_key:
        return
    await client.delete_key(
        master_key=str(settings.ai.litellm_master_key),
        key=virtual_key,
    )


def _read_virtual_key(payload: dict[str, Any]) -> str:
    for field in ("key", "token", "virtual_key"):
        value = payload.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise LLMRuntimeError(
        code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
        message="LiteLLM did not return a workspace virtual key",
        status_code=ERROR_CODE_STATUS[LLMErrorCode.SYSTEM_INTERNAL_ERROR],
    )


def _read_key_id(payload: dict[str, Any]) -> str | None:
    for field in ("key_id", "token_id", "id"):
        value = payload.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
