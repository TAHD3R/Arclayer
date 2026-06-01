"""LLM infrastructure layer — pure Python, zero FastAPI dependencies.

Package layout:
    provider.py       — BaseLLMProvider + LLMProviderFactory
    litellm_client.py — LiteLLM HTTP client wrapper
    mock.py           — Mock LLM provider for dev/test
    token_counter.py  — tiktoken-based token counting
    rate_limiter.py   — TokenBucket + Valkey distributed
    budget.py         — Atomic budget reservation operations
    runtime.py        — LLMRuntime: single entry point for all LLM calls
    utils.py          — Shared utilities
"""

from src.llm.provider import LLMProviderFactory


def _register_providers() -> None:
    """Lazy-register built-in providers with the factory."""
    from src.llm.litellm_client import LiteLLMClient
    from src.llm.mock import MockLLMProvider

    LLMProviderFactory.register("litellm", LiteLLMClient)
    LLMProviderFactory.register("mock", MockLLMProvider)
