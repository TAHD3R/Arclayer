from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest

from src.llm.workspace_key_provisioning import ensure_workspace_virtual_key


def _settings(*, enabled: bool) -> SimpleNamespace:
    return SimpleNamespace(
        ai=SimpleNamespace(
            workspace_key_auto_provision_enabled=enabled,
            litellm_master_key="master-key",
            litellm_base_url="http://litellm",
            litellm_timeout_seconds=10,
            master_key_path="data/keys/ai-master.key",
        )
    )


def _key_query(existing: object | None) -> tuple[Mock, Mock]:
    query = Mock()
    query.filter.return_value = query
    query.first = AsyncMock(return_value=existing)
    model = Mock()
    model.filter.return_value = query
    return model, query


@pytest.mark.asyncio
async def test_existing_workspace_key_skips_provisioning():
    workspace_id = uuid4()
    model, _query = _key_query(object())

    with (
        patch("src.llm.workspace_key_provisioning.AIAPIKey", model),
        patch("src.llm.workspace_key_provisioning.LiteLLMClient") as client,
    ):
        await ensure_workspace_virtual_key(
            _settings(enabled=True),
            workspace_id=workspace_id,
            user_id=None,
            provider="deepseek",
        )

    client.assert_not_called()


@pytest.mark.asyncio
async def test_provisions_and_persists_workspace_key():
    workspace_id = uuid4()
    model, _query = _key_query(None)
    model.create = AsyncMock()
    client = Mock()
    client.generate_key = AsyncMock(return_value={"key": "workspace-key", "key_id": "key-id"})
    client.delete_key = AsyncMock()
    configured_model = SimpleNamespace(provider="deepseek", public_model="deepseek-v4-pro")

    with (
        patch("src.llm.workspace_key_provisioning.AIAPIKey", model),
        patch("src.llm.workspace_key_provisioning.LiteLLMClient", return_value=client),
        patch(
            "src.llm.workspace_key_provisioning.list_active_system_models", AsyncMock(return_value=[configured_model])
        ),
        patch("src.llm.workspace_key_provisioning.encrypt_virtual_key", return_value="encrypted"),
        patch("src.llm.workspace_key_provisioning._resolve_key_path", return_value="master-path"),
    ):
        await ensure_workspace_virtual_key(
            _settings(enabled=True),
            workspace_id=workspace_id,
            user_id=None,
            provider="deepseek",
        )

    client.generate_key.assert_awaited_once()
    model.create.assert_awaited_once()
    fields = model.create.await_args.kwargs
    assert fields["owner_id"] == workspace_id
    assert fields["provider"] == "deepseek"
    assert fields["virtual_key_enc"] == "encrypted"
    client.delete_key.assert_not_awaited()


@pytest.mark.asyncio
async def test_disabled_provisioning_preserves_no_key_behavior():
    model, _query = _key_query(None)

    with (
        patch("src.llm.workspace_key_provisioning.AIAPIKey", model),
        patch("src.llm.workspace_key_provisioning.LiteLLMClient") as client,
    ):
        await ensure_workspace_virtual_key(
            _settings(enabled=False),
            workspace_id=uuid4(),
            user_id=None,
            provider="deepseek",
        )

    client.assert_not_called()
