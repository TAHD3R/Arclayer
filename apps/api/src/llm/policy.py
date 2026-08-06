"""Deployment-wide AI policy runtime enforcement."""

from __future__ import annotations

from uuid import UUID

import structlog

from src.llm.errors import ERROR_CODE_STATUS, LLMErrorCode
from src.llm.runtime import LLMRuntimeError
from src.models.ai.model_policy import ModelPolicy, ModelPolicyScope

logger = structlog.get_logger("arclayer.llm.policy")


async def resolve_model_policy(
    workspace_id: UUID,
    user_id: UUID | None,
    *,
    global_data_retention_enabled: bool = False,
) -> ModelPolicy:
    """Read the current published deployment policy before every effect.

    Workspace and user policy rows are intentionally not consulted. The legacy
    ``ModelPolicy`` object remains the enforcement DTO while the persisted
    authority is ``GlobalAiPolicyRevision``.
    """
    from src.models.ai.global_policy import GlobalAiPolicyRevision, GlobalAiPolicyRevisionStatus

    published = (
        await GlobalAiPolicyRevision.filter(status=GlobalAiPolicyRevisionStatus.PUBLISHED).order_by("-sequence").first()
    )
    default = ModelPolicy(
        id=UUID(int=0),
        name="_default",
        scope=ModelPolicyScope.GLOBAL,
        allowed_models=[],
        max_tokens_per_request=0,
        max_cost_micros_per_request=0,
        data_retention_enabled=global_data_retention_enabled,
    )
    if published is None:
        return default
    return ModelPolicy(
        id=published.id,
        name=f"global:{published.sequence}",
        scope=ModelPolicyScope.GLOBAL,
        allowed_models=list(published.allowed_models),
        max_tokens_per_request=published.max_tokens_per_request,
        max_cost_micros_per_request=published.max_cost_micros_per_request,
        data_retention_enabled=not published.external_data_egress_allowed,
    )


def _merge_policies(
    higher_tier: list,
    base: ModelPolicy,
) -> ModelPolicy:
    """Merge a higher-priority tier list onto a base policy.

    The first policy in the list (highest priority) that sets a field wins.
    If no policy in the list sets a field, the base value is kept.
    """
    from src.models.ai.model_policy import ModelPolicy

    merged_allowed = base.allowed_models
    merged_max_tokens = base.max_tokens_per_request
    merged_max_cost = base.max_cost_micros_per_request
    merged_data_retention = base.data_retention_enabled

    # Within-tier first-wins: each field independently takes the value from the
    # first (highest priority) policy that explicitly sets it.
    # Higher tiers always override lower-tier base values.
    # For data_retention: if the higher tier has any policies, the first policy's
    # value (True or False) wins — there is no "unset" sentinel for booleans.
    allowed_set = False
    tokens_set = False
    cost_set = False
    retention_set = False

    for p in higher_tier:
        if not allowed_set and isinstance(p.allowed_models, list) and len(p.allowed_models) > 0:
            merged_allowed = p.allowed_models
            allowed_set = True
        if not tokens_set and p.max_tokens_per_request is not None and p.max_tokens_per_request > 0:
            merged_max_tokens = p.max_tokens_per_request
            tokens_set = True
        if not cost_set and p.max_cost_micros_per_request is not None and p.max_cost_micros_per_request > 0:
            merged_max_cost = p.max_cost_micros_per_request
            cost_set = True
        if not retention_set:
            merged_data_retention = p.data_retention_enabled
            retention_set = True

    return ModelPolicy(
        id=base.id,
        name=base.name,
        scope=base.scope,
        allowed_models=merged_allowed,
        max_tokens_per_request=merged_max_tokens,
        max_cost_micros_per_request=merged_max_cost,
        data_retention_enabled=merged_data_retention,
    )


def enforce_model_policy(
    model: str,
    max_tokens: int | None,
    estimated_cost_micros: int,
    policy: ModelPolicy,
    provider: str,
) -> None:
    """Enforce the resolved policy. Raises LLMRuntimeError on violation.

    Checks:
    - POLICY_MODEL_NOT_ALLOWED (403) — model not in allowed_models list
      (only when allowed_models is non-empty)
    - POLICY_MAX_TOKENS_EXCEEDED (400) — max_tokens > policy.max_tokens_per_request
    - POLICY_COST_LIMIT_EXCEEDED (400) — estimated cost > policy.max_cost_micros
    """
    if isinstance(policy.allowed_models, list) and len(policy.allowed_models) > 0:
        if model not in policy.allowed_models:
            raise LLMRuntimeError(
                code=LLMErrorCode.POLICY_MODEL_NOT_ALLOWED,
                message=f"Model '{model}' is not allowed by the active policy",
                status_code=ERROR_CODE_STATUS[LLMErrorCode.POLICY_MODEL_NOT_ALLOWED],
            )

    if policy.max_tokens_per_request is not None and policy.max_tokens_per_request > 0:
        effective_max = max_tokens or 0
        if effective_max > policy.max_tokens_per_request:
            raise LLMRuntimeError(
                code=LLMErrorCode.POLICY_MAX_TOKENS_EXCEEDED,
                message=f"max_tokens ({effective_max}) exceeds policy limit ({policy.max_tokens_per_request})",
                status_code=ERROR_CODE_STATUS[LLMErrorCode.POLICY_MAX_TOKENS_EXCEEDED],
            )

    if policy.max_cost_micros_per_request is not None and policy.max_cost_micros_per_request > 0:
        if estimated_cost_micros > policy.max_cost_micros_per_request:
            raise LLMRuntimeError(
                code=LLMErrorCode.POLICY_COST_LIMIT_EXCEEDED,
                message=f"Estimated cost ({estimated_cost_micros}µ$) exceeds policy limit ({policy.max_cost_micros_per_request}µ$)",
                status_code=ERROR_CODE_STATUS[LLMErrorCode.POLICY_COST_LIMIT_EXCEEDED],
            )


def resolve_provider_retention_params(
    policy: ModelPolicy,
    provider: str,
) -> dict:
    """Resolve provider-specific data retention parameters.

    When policy.data_retention_enabled is False:
    - OpenAI: returns {"store": False}
    - Anthropic/DeepSeek: no per-request param — logs audit warning, returns {}
    - Unknown: logs audit warning, returns {}

    When policy.data_retention_enabled is True: returns {} (use provider default).
    """
    if policy.data_retention_enabled:
        return {}

    params: dict = {}
    if provider == "openai":
        params["store"] = False
    elif provider == "anthropic":
        logger.warning(
            "Data retention opt-out cannot be honored for Anthropic at request level",
            provider=provider,
            error_code="PROVIDER_DATA_RETENTION_NOT_HONORED",
        )
    elif provider == "deepseek":
        logger.warning(
            "Data retention opt-out cannot be honored for DeepSeek at request level",
            provider=provider,
            error_code="PROVIDER_DATA_RETENTION_NOT_HONORED",
        )
    else:
        logger.warning(
            "Data retention opt-out cannot be honored for unknown provider",
            provider=provider,
            error_code="PROVIDER_DATA_RETENTION_NOT_HONORED",
        )
    return params
