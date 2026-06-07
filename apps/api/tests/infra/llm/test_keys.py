"""Tests for Workspace-First LLM Key Resolution (keys.py)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest

from src.llm.errors import LLMErrorCode
from src.llm.keys import (
    ResolvedLLMKey,
    decrypt_virtual_key,
    encrypt_virtual_key,
    resolve_litellm_key,
    revoke_grants_for_key,
    revoke_user_grants_for_workspace,
)
from src.llm.runtime import LLMRuntimeError

# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self, tmp_path: Path):
        key_path = tmp_path / "master.key"
        plain = "sk-test-virtual-key-12345"
        enc = encrypt_virtual_key(plain, key_path)
        assert enc != plain
        assert decrypt_virtual_key(enc, key_path) == plain

    def test_encrypt_creates_key_file(self, tmp_path: Path):
        key_path = tmp_path / "master.key"
        encrypt_virtual_key("secret", key_path)
        assert key_path.exists()
        stat = key_path.stat()
        assert stat.st_mode & 0o777 == 0o600

    def test_decrypt_without_key_file_raises(self):
        with pytest.raises(LLMRuntimeError, match="master_key_path"):
            decrypt_virtual_key("abc", None)

    def test_encrypt_without_key_file_raises(self):
        with pytest.raises(LLMRuntimeError, match="master_key_path"):
            encrypt_virtual_key("abc", None)


# ---------------------------------------------------------------------------
# Key resolution: no keys available
# ---------------------------------------------------------------------------


class TestResolveNoKeys:
    @pytest.mark.asyncio
    async def test_no_keys_available_raises_auth_no_key(self):
        workspace_id = uuid4()

        with patch("src.models.ai.ai_api_key.AIAPIKey") as mock_key:
            qs = Mock()
            qs.filter.return_value = qs
            qs.first = AsyncMock(return_value=None)
            mock_key.filter.return_value = qs

            with pytest.raises(LLMRuntimeError) as exc:
                await resolve_litellm_key(
                    workspace_id=workspace_id,
                    user_id=None,
                    provider="openai",
                    master_key_path=None,
                    allow_platform_key=False,
                )
            assert exc.value.code == LLMErrorCode.AUTH_NO_KEY
            assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_no_keys_with_platform_disallowed(self):
        workspace_id = uuid4()

        with patch("src.models.ai.ai_api_key.AIAPIKey") as mock_key:
            qs = Mock()
            qs.filter.return_value = qs
            qs.first = AsyncMock(return_value=None)
            mock_key.filter.return_value = qs

            with pytest.raises(LLMRuntimeError) as exc:
                await resolve_litellm_key(
                    workspace_id=workspace_id,
                    user_id=None,
                    provider="openai",
                    allow_platform_key=False,
                )
            assert exc.value.code == LLMErrorCode.AUTH_NO_KEY


# ---------------------------------------------------------------------------
# Grant revocation
# ---------------------------------------------------------------------------


class TestGrantRevocation:
    @pytest.mark.asyncio
    async def test_revoke_user_grants_for_workspace(self):
        user_id = uuid4()
        workspace_id = uuid4()
        grant = AsyncMock()
        grant.approval_state = "approved"
        grant.revoked_at = None

        with patch("src.models.ai.user_key_grant.UserKeyWorkspaceGrant") as mock_grant:
            mock_grant.filter.return_value.all = AsyncMock(return_value=[grant])

            count = await revoke_user_grants_for_workspace(user_id, workspace_id)
            assert count == 1
            assert grant.save.call_count == 1

    @pytest.mark.asyncio
    async def test_revoke_grants_for_key(self):
        key_id = uuid4()
        grant = AsyncMock()
        grant.approval_state = "approved"
        grant.revoked_at = None

        with patch("src.models.ai.user_key_grant.UserKeyWorkspaceGrant") as mock_grant:
            mock_grant.filter.return_value.all = AsyncMock(return_value=[grant])

            count = await revoke_grants_for_key(key_id)
            assert count == 1
            assert grant.save.call_count == 1


# ---------------------------------------------------------------------------
# ResolvedLLMKey dataclass
# ---------------------------------------------------------------------------


class TestResolvedLLMKey:
    def test_resolved_key_defaults(self):
        key = ResolvedLLMKey(virtual_key="sk-test")
        assert key.virtual_key == "sk-test"
        assert key.key_id is None
        assert key.grant_id is None
        assert key.metadata is None

    def test_resolved_key_full(self):
        key_id = uuid4()
        grant_id = uuid4()
        meta = {"workspace_id": str(uuid4())}
        key = ResolvedLLMKey(
            virtual_key="sk-test",
            key_id=key_id,
            grant_id=grant_id,
            metadata=meta,
        )
        assert key.key_id == key_id
        assert key.grant_id == grant_id
        assert key.metadata == meta
