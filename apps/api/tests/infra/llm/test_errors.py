"""Tests for LLM error codes and grant state machine (R3 blocker #3)."""

from __future__ import annotations

from src.llm.errors import ERROR_CODE_STATUS, LLMErrorCode
from src.models.ai.user_key_grant import (
    GrantApprovalState,
    can_transition_grant,
    is_grant_active,
)


class TestGrantStateMachine:
    def test_pending_to_approved(self):
        assert can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.APPROVED)

    def test_pending_to_denied(self):
        assert can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.DENIED)

    def test_approved_to_revoked(self):
        assert can_transition_grant(GrantApprovalState.APPROVED, GrantApprovalState.REVOKED)

    def test_denied_to_pending(self):
        assert can_transition_grant(GrantApprovalState.DENIED, GrantApprovalState.PENDING)

    def test_revoked_is_terminal(self):
        for target in GrantApprovalState:
            assert not can_transition_grant(GrantApprovalState.REVOKED, target)

    def test_approved_cannot_go_to_denied(self):
        assert not can_transition_grant(GrantApprovalState.APPROVED, GrantApprovalState.DENIED)

    def test_denied_cannot_go_to_approved(self):
        assert not can_transition_grant(GrantApprovalState.DENIED, GrantApprovalState.APPROVED)

    def test_pending_cannot_go_to_revoked(self):
        assert not can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.REVOKED)

    def test_is_grant_active_only_approved(self):
        assert is_grant_active(GrantApprovalState.APPROVED)
        assert not is_grant_active(GrantApprovalState.PENDING)
        assert not is_grant_active(GrantApprovalState.DENIED)
        assert not is_grant_active(GrantApprovalState.REVOKED)


class TestLLMErrorCodes:
    def test_all_error_codes_have_status(self):
        for code in LLMErrorCode:
            assert code in ERROR_CODE_STATUS, f"Missing status for {code}"

    def test_auth_errors_are_4xx(self):
        for code in LLMErrorCode:
            if code.startswith("AUTH_"):
                assert 400 <= ERROR_CODE_STATUS[code] < 500

    def test_rate_limit_is_429(self):
        assert ERROR_CODE_STATUS[LLMErrorCode.RATE_LIMIT_EXCEEDED] == 429
        assert ERROR_CODE_STATUS[LLMErrorCode.PROVIDER_RATE_LIMITED] == 429

    def test_provider_unavailable_is_503(self):
        assert ERROR_CODE_STATUS[LLMErrorCode.PROVIDER_UNAVAILABLE] == 503
        assert ERROR_CODE_STATUS[LLMErrorCode.SYSTEM_LITELLM_UNREACHABLE] == 503

    def test_budget_exceeded_is_402(self):
        assert ERROR_CODE_STATUS[LLMErrorCode.BUDGET_EXCEEDED] == 402

    def test_error_codes_are_unique(self):
        codes = list(LLMErrorCode)
        assert len(codes) == len(set(codes))
