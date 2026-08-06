"""Tests for ModelPolicy Runtime Enforcement (policy.py)."""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest

from src.llm.errors import LLMErrorCode
from src.llm.policy import (
    RuntimeAiPolicy,
    enforce_model_policy,
    require_concurrency_slot,
    require_external_data_egress,
    require_retry_allowed,
    require_tool_allowed,
    resolve_model_policy,
    resolve_provider_retention_params,
    resolve_runtime_policy,
)
from src.llm.runtime import LLMRuntimeError
from src.models.ai.global_policy import GlobalAiPolicyRevision
from src.models.ai.model_policy import ModelPolicy, ModelPolicyScope


def make_policy(
    *,
    scope=ModelPolicyScope.WORKSPACE,
    scope_id=None,
    allowed_models=None,
    max_tokens_per_request=0,
    max_cost_micros_per_request=0,
    data_retention_enabled=False,
    priority=100,
) -> ModelPolicy:
    return ModelPolicy(
        id=uuid4(),
        name="test-policy",
        scope=scope,
        scope_id=scope_id,
        allowed_models=allowed_models or [],
        max_tokens_per_request=max_tokens_per_request,
        max_cost_micros_per_request=max_cost_micros_per_request,
        data_retention_enabled=data_retention_enabled,
        priority=priority,
        is_active=True,
    )


def _make_mock_queryset(return_value):
    """Build a mock Tortoise queryset.

    Uses Mock for synchronous chain methods (filter, order_by) and
    AsyncMock only for .all() which is the actual async boundary.
    """
    qs = Mock()
    qs.order_by.return_value = qs
    qs.all = AsyncMock(return_value=return_value)
    return qs


# ---------------------------------------------------------------------------
# resolve_model_policy
# ---------------------------------------------------------------------------


class TestResolveModelPolicy:
    @pytest.mark.asyncio
    async def test_default_when_no_policies(self):
        """No DB policies -> global default (all models, no limits)."""
        workspace_id = uuid4()

        qs = Mock()
        qs.order_by.return_value = qs
        qs.first = AsyncMock(return_value=None)

        with patch.object(GlobalAiPolicyRevision, "filter", return_value=qs):
            policy = await resolve_model_policy(workspace_id, None)
            assert policy.allowed_models == []
            assert policy.max_tokens_per_request == 0
            assert policy.max_cost_micros_per_request == 0
            assert policy.data_retention_enabled is False

    @pytest.mark.asyncio
    async def test_workspace_policy_is_ignored(self):
        """Workspace rows cannot override the deployment policy."""
        workspace_id = uuid4()

        published = Mock(
            id=uuid4(),
            sequence=1,
            allowed_models=["gpt-4o"],
            max_tokens_per_request=2048,
            max_cost_micros_per_request=0,
            external_data_egress_allowed=False,
            max_concurrent_runs=0,
            tool_allowlist=[],
            approval_required_effect_classes=[],
            retry_limit=0,
        )
        qs = Mock()
        qs.order_by.return_value = qs
        qs.first = AsyncMock(return_value=published)

        with patch.object(GlobalAiPolicyRevision, "filter", return_value=qs):
            policy = await resolve_model_policy(workspace_id, None)
            assert policy.allowed_models == ["gpt-4o"]
            assert policy.max_tokens_per_request == 2048

    @pytest.mark.asyncio
    async def test_user_policy_is_ignored(self):
        """User rows cannot override the deployment policy."""
        workspace_id = uuid4()
        user_id = uuid4()

        qs = Mock()
        qs.order_by.return_value = qs
        qs.first = AsyncMock(return_value=None)

        with patch.object(GlobalAiPolicyRevision, "filter", return_value=qs):
            policy = await resolve_model_policy(workspace_id, user_id)
            assert policy.allowed_models == []
            assert policy.max_tokens_per_request == 0

    @pytest.mark.asyncio
    async def test_latest_published_revision_wins(self):
        """The latest published global revision is the sole runtime authority."""
        workspace_id = uuid4()

        published = Mock(
            id=uuid4(),
            sequence=4,
            allowed_models=["gpt-4o-mini", "gpt-4o"],
            max_tokens_per_request=0,
            max_cost_micros_per_request=0,
            external_data_egress_allowed=True,
            max_concurrent_runs=0,
            tool_allowlist=[],
            approval_required_effect_classes=[],
            retry_limit=0,
        )
        qs = Mock()
        qs.order_by.return_value = qs
        qs.first = AsyncMock(return_value=published)

        with patch.object(GlobalAiPolicyRevision, "filter", return_value=qs):
            policy = await resolve_model_policy(workspace_id, None)
            assert policy.allowed_models == ["gpt-4o-mini", "gpt-4o"]


class TestRuntimePolicyBoundaries:
    @staticmethod
    def policy(**updates) -> RuntimeAiPolicy:  # type: ignore[no-untyped-def]
        values = {
            "revision_id": uuid4(),
            "sequence": 1,
            "allowed_models": (),
            "max_tokens_per_request": 0,
            "max_cost_micros_per_request": 0,
            "max_concurrent_runs": None,
            "external_data_egress_allowed": True,
            "tool_allowlist": None,
            "approval_required_effect_classes": frozenset(),
            "retry_limit": None,
        }
        values.update(updates)
        return RuntimeAiPolicy(**values)

    @pytest.mark.asyncio
    async def test_published_runtime_policy_preserves_all_effect_controls(self) -> None:
        published = Mock(
            id=uuid4(),
            sequence=7,
            allowed_models=["gpt-4o-mini"],
            max_tokens_per_request=512,
            max_cost_micros_per_request=900,
            max_concurrent_runs=3,
            external_data_egress_allowed=True,
            tool_allowlist=["human.request_input"],
            approval_required_effect_classes=["write"],
            retry_limit=2,
        )
        qs = Mock()
        qs.order_by.return_value = qs
        qs.first = AsyncMock(return_value=published)

        with patch.object(GlobalAiPolicyRevision, "filter", return_value=qs):
            policy = await resolve_runtime_policy()

        assert policy.max_concurrent_runs == 3
        assert policy.tool_allowlist == frozenset({"human.request_input"})
        assert policy.approval_required_effect_classes == frozenset({"write"})
        assert policy.retry_limit == 2

    def test_external_egress_denial_is_explicit(self) -> None:
        with pytest.raises(LLMRuntimeError) as exc:
            require_external_data_egress(self.policy(external_data_egress_allowed=False))
        assert exc.value.code == LLMErrorCode.POLICY_EXTERNAL_EGRESS_NOT_ALLOWED

    def test_tool_allowlist_and_retry_limit_are_exact(self) -> None:
        policy = self.policy(tool_allowlist=frozenset({"human.request_input"}), retry_limit=1)
        require_tool_allowed(policy, "human.request_input")
        require_retry_allowed(policy, 2)
        with pytest.raises(LLMRuntimeError) as tool_error:
            require_tool_allowed(policy, "workspace.skill.create")
        with pytest.raises(LLMRuntimeError) as retry_error:
            require_retry_allowed(policy, 3)
        assert tool_error.value.code == LLMErrorCode.POLICY_TOOL_NOT_ALLOWED
        assert retry_error.value.code == LLMErrorCode.POLICY_RETRY_LIMIT_EXCEEDED

    def test_concurrency_rank_is_exact(self) -> None:
        policy = self.policy(max_concurrent_runs=2)
        require_concurrency_slot(policy, 2)
        with pytest.raises(LLMRuntimeError) as error:
            require_concurrency_slot(policy, 3)
        assert error.value.code == LLMErrorCode.POLICY_CONCURRENCY_LIMIT_EXCEEDED


# ---------------------------------------------------------------------------
# enforce_model_policy
# ---------------------------------------------------------------------------


class TestEnforceModelPolicy:
    def test_allowed_model_passes(self):
        policy = make_policy(allowed_models=["gpt-4o-mini", "claude-sonnet-4-6"])
        enforce_model_policy(
            model="gpt-4o-mini",
            max_tokens=100,
            estimated_cost_micros=5000,
            policy=policy,
            provider="openai",
        )

    def test_disallowed_model_raises(self):
        policy = make_policy(allowed_models=["gpt-4o-mini"])
        with pytest.raises(LLMRuntimeError) as exc:
            enforce_model_policy(
                model="gpt-4o",
                max_tokens=100,
                estimated_cost_micros=5000,
                policy=policy,
                provider="openai",
            )
        assert exc.value.code == LLMErrorCode.POLICY_MODEL_NOT_ALLOWED
        assert exc.value.status_code == 403

    def test_empty_allowed_models_allows_all(self):
        policy = make_policy(allowed_models=[])
        enforce_model_policy(
            model="any-model",
            max_tokens=100,
            estimated_cost_micros=5000,
            policy=policy,
            provider="unknown",
        )

    def test_max_tokens_exceeded_raises(self):
        policy = make_policy(max_tokens_per_request=1024)
        with pytest.raises(LLMRuntimeError) as exc:
            enforce_model_policy(
                model="gpt-4o-mini",
                max_tokens=4096,
                estimated_cost_micros=5000,
                policy=policy,
                provider="openai",
            )
        assert exc.value.code == LLMErrorCode.POLICY_MAX_TOKENS_EXCEEDED
        assert exc.value.status_code == 400

    def test_max_tokens_zero_means_no_limit(self):
        policy = make_policy(max_tokens_per_request=0)
        enforce_model_policy(
            model="gpt-4o-mini",
            max_tokens=100000,
            estimated_cost_micros=5000,
            policy=policy,
            provider="openai",
        )

    def test_cost_limit_exceeded_raises(self):
        policy = make_policy(max_cost_micros_per_request=50000)
        with pytest.raises(LLMRuntimeError) as exc:
            enforce_model_policy(
                model="gpt-4o-mini",
                max_tokens=100,
                estimated_cost_micros=100000,
                policy=policy,
                provider="openai",
            )
        assert exc.value.code == LLMErrorCode.POLICY_COST_LIMIT_EXCEEDED
        assert exc.value.status_code == 400

    def test_cost_limit_zero_means_no_limit(self):
        policy = make_policy(max_cost_micros_per_request=0)
        enforce_model_policy(
            model="gpt-4o-mini",
            max_tokens=100,
            estimated_cost_micros=999_999_999,
            policy=policy,
            provider="openai",
        )

    def test_max_tokens_none_passes(self):
        policy = make_policy(max_tokens_per_request=1024)
        enforce_model_policy(
            model="gpt-4o-mini",
            max_tokens=None,
            estimated_cost_micros=5000,
            policy=policy,
            provider="openai",
        )


# ---------------------------------------------------------------------------
# resolve_provider_retention_params
# ---------------------------------------------------------------------------


class TestProviderRetentionParams:
    def test_openai_store_false_when_retention_disabled(self):
        policy = make_policy(data_retention_enabled=False)
        params = resolve_provider_retention_params(policy, "openai")
        assert params == {"store": False}

    def test_anthropic_empty_when_retention_disabled(self):
        policy = make_policy(data_retention_enabled=False)
        params = resolve_provider_retention_params(policy, "anthropic")
        assert params == {}

    def test_unknown_provider_empty_when_retention_disabled(self):
        policy = make_policy(data_retention_enabled=False)
        params = resolve_provider_retention_params(policy, "cohere")
        assert params == {}

    def test_retention_enabled_returns_empty(self):
        policy = make_policy(data_retention_enabled=True)
        params = resolve_provider_retention_params(policy, "openai")
        assert params == {}


# ---------------------------------------------------------------------------
# Policy error code consistency
# ---------------------------------------------------------------------------


class TestPolicyErrorCodes:
    def test_all_policy_errors_have_http_status(self):
        from src.llm.errors import ERROR_CODE_STATUS

        policy_codes = [
            LLMErrorCode.POLICY_MODEL_NOT_ALLOWED,
            LLMErrorCode.POLICY_MAX_TOKENS_EXCEEDED,
            LLMErrorCode.POLICY_COST_LIMIT_EXCEEDED,
            LLMErrorCode.POLICY_DATA_RETENTION_VIOLATION,
            LLMErrorCode.POLICY_EXTERNAL_EGRESS_NOT_ALLOWED,
            LLMErrorCode.POLICY_TOOL_NOT_ALLOWED,
            LLMErrorCode.POLICY_RETRY_LIMIT_EXCEEDED,
            LLMErrorCode.POLICY_CONCURRENCY_LIMIT_EXCEEDED,
        ]
        for code in policy_codes:
            assert code in ERROR_CODE_STATUS, f"{code} missing from ERROR_CODE_STATUS"
