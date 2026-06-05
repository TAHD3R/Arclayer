"""Model policy — controls which models are available and under what constraints.

R3 audit requirement: data_retention maps to provider-specific request parameters.
    - OpenAI: sets "store" to false in the request body (disables training on API data).
    - Anthropic: passes retention object in request body.

Each policy defines:
    - Which models a workspace/user can use
    - Token and cost caps per request
    - Provider-level data retention settings
"""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class ModelPolicyScope(StrEnum):
    GLOBAL = "global"
    WORKSPACE = "workspace"
    USER = "user"


class ModelPolicy(BaseModel):
    """Access policy for LLM model usage."""

    scope = fields.CharEnumField(ModelPolicyScope, default=ModelPolicyScope.WORKSPACE, db_index=True)
    scope_id = fields.UUIDField(null=True, db_index=True)

    # Display
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)

    # Which models are allowed
    allowed_models = fields.JSONField(default=list)  # ["gpt-4o-mini", "claude-sonnet-4-6"]

    # Per-request limits (in unified cost_micros)
    max_tokens_per_request = fields.IntField(null=True)
    max_cost_micros_per_request = fields.BigIntField(null=True)

    # Provider data retention mapping (R3 blocker #4)
    # When false: OpenAI → store=false. Anthropic has no per-request param (contract-level only).
    # When true, allows provider default behavior (may use data for training).
    data_retention_enabled = fields.BooleanField(default=False)

    # Policy ordering (lower = higher priority)
    priority = fields.IntField(default=100, db_index=True)

    # Activation
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "model_policies"
        abstract = False

    def to_provider_params(self, provider: str) -> dict:
        """Convert data_retention policy to provider-specific request parameters.

        R3 audit requirement: explicit mapping from policy to API parameters.
        If a provider cannot be controlled at the request level (e.g. Anthropic),
        callers should log an audit warning and proceed without the parameter.

        Provider mappings (verified against current API docs):

        - **OpenAI**: ``{"store": False}``
          Confirmed parameter in the Chat Completions API (as of 2025).
          When ``store=False``, OpenAI does not use the conversation for
          training or model improvement.

        - **Anthropic**: ``{}`` — no per-request parameter.
          Anthropic's standard API terms already prohibit training on customer
          API data for paying customers (since March 2024).
          There is no per-request ``store`` parameter in the Anthropic API.
          Account-level zero-retention agreements are available through
          enterprise contracts.  ``"anthropic-dangerous-direct-browser-access"``
          is unrelated — it controls browser rendering, not data retention.

        - **Unknown providers**: return empty dict; caller should audit-warn.

        Args:
            provider: "openai" | "anthropic"

        Returns:
            dict of provider-specific parameters to merge into the request.
        """
        if self.data_retention_enabled:
            return {}

        params: dict = {}
        if provider == "openai":
            params["store"] = False
        # Anthropic: no per-request retention parameter exists in the API.
        # The API TOS already prohibits training on customer data for
        # paying API customers (https://docs.anthropic.com/en/legal/commercial-terms).
        # Unknown providers: return empty dict (caller should audit-warn).
        return params
