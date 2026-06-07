"""Tests for grant lifecycle hooks (Task 1: Key Resolution)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.llm.keys import revoke_grants_for_key, revoke_user_grants_for_workspace
from src.models.ai.user_key_grant import GrantApprovalState, can_transition_grant, is_grant_active


class TestGrantLifecycleTransitions:
    def test_pending_to_approved_valid(self):
        assert can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.APPROVED)

    def test_pending_to_denied_valid(self):
        assert can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.DENIED)

    def test_approved_to_revoked_valid(self):
        assert can_transition_grant(GrantApprovalState.APPROVED, GrantApprovalState.REVOKED)

    def test_denied_to_pending_valid(self):
        assert can_transition_grant(GrantApprovalState.DENIED, GrantApprovalState.PENDING)

    def test_revoked_is_terminal(self):
        assert can_transition_grant(GrantApprovalState.REVOKED, GrantApprovalState.APPROVED) is False
        assert can_transition_grant(GrantApprovalState.REVOKED, GrantApprovalState.PENDING) is False

    def test_approved_to_denied_invalid(self):
        assert can_transition_grant(GrantApprovalState.APPROVED, GrantApprovalState.DENIED) is False

    def test_is_grant_active_only_approved(self):
        assert is_grant_active(GrantApprovalState.APPROVED) is True
        assert is_grant_active(GrantApprovalState.PENDING) is False
        assert is_grant_active(GrantApprovalState.DENIED) is False
        assert is_grant_active(GrantApprovalState.REVOKED) is False


class TestMemberLeaveCascade:
    @pytest.mark.asyncio
    async def test_revoke_all_approved_grants_for_user_workspace(self):
        user_id = uuid4()
        workspace_id = uuid4()

        grant1 = AsyncMock()
        grant1.approval_state = GrantApprovalState.APPROVED
        grant1.revoked_at = None

        grant2 = AsyncMock()
        grant2.approval_state = GrantApprovalState.APPROVED
        grant2.revoked_at = None

        with patch("src.models.ai.user_key_grant.UserKeyWorkspaceGrant") as mock_model:
            mock_model.filter.return_value.all = AsyncMock(return_value=[grant1, grant2])

            count = await revoke_user_grants_for_workspace(user_id, workspace_id)
            assert count == 2
            assert grant1.save.call_count == 1
            assert grant2.save.call_count == 1
            assert grant1.approval_state == GrantApprovalState.REVOKED
            assert grant2.approval_state == GrantApprovalState.REVOKED

    @pytest.mark.asyncio
    async def test_revoke_filters_by_approved_state(self):
        """Verify the revocation function calls filter with APPROVED state."""
        user_id = uuid4()
        workspace_id = uuid4()

        with patch("src.models.ai.user_key_grant.UserKeyWorkspaceGrant") as mock_model:
            mock_model.filter.return_value.all = AsyncMock(return_value=[])

            count = await revoke_user_grants_for_workspace(user_id, workspace_id)
            assert count == 0
            mock_model.filter.assert_called_once_with(
                user_id=user_id,
                workspace_id=workspace_id,
                approval_state=GrantApprovalState.APPROVED,
            )


class TestKeyRotationCascade:
    @pytest.mark.asyncio
    async def test_revoke_all_grants_for_disabled_key(self):
        key_id = uuid4()

        grant = AsyncMock()
        grant.approval_state = GrantApprovalState.APPROVED
        grant.revoked_at = None

        with patch("src.models.ai.user_key_grant.UserKeyWorkspaceGrant") as mock_model:
            mock_model.filter.return_value.all = AsyncMock(return_value=[grant])

            count = await revoke_grants_for_key(key_id)
            assert count == 1
            assert grant.approval_state == GrantApprovalState.REVOKED
            assert grant.revoked_at is not None

    @pytest.mark.asyncio
    async def test_revoke_grants_for_key_no_active_grants(self):
        key_id = uuid4()

        with patch("src.models.ai.user_key_grant.UserKeyWorkspaceGrant") as mock_model:
            mock_model.filter.return_value.all = AsyncMock(return_value=[])

            count = await revoke_grants_for_key(key_id)
            assert count == 0
