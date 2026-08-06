"""Tests for ModelPolicy Runtime Enforcement (policy.py)."""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest

from src.llm.errors import LLMErrorCode
from src.llm.policy import (
    enforce_model_policy,
    resolve_model_policy,
    resolve_provider_retention_params,
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
        )
        qs = Mock()
        qs.order_by.return_value = qs
        qs.first = AsyncMock(return_value=published)

        with patch.object(GlobalAiPolicyRevision, "filter", return_value=qs):
            policy = await resolve_model_policy(workspace_id, None)
            assert policy.allowed_models == ["gpt-4o-mini", "gpt-4o"]


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
        ]
        for code in policy_codes:
            assert code in ERROR_CODE_STATUS, f"{code} missing from ERROR_CODE_STATUS"
