"""LLM provider abstraction — BaseLLMProvider + LLMProviderFactory.

Enables swapping between LiteLLM proxy, direct provider SDKs, and
mock implementations without changing callers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any


class BaseLLMProvider(ABC):
    """Abstract base for LLM providers.

    All provider implementations (LiteLLM, direct SDKs, mock) inherit from this.
    """

    @abstractmethod
    async def health(self) -> dict[str, Any]:
        """Check provider health. Returns {"status": "healthy"} or similar."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send a chat completion request. Returns the raw provider response."""

    @abstractmethod
    def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        """Send a streaming chat completion request. Yields SSE chunks."""


class LLMProviderFactory:
    """Factory for creating LLM provider instances.

    Phase 1 supports:
        - "litellm" — LiteLLM proxy HTTP client
        - "mock" — MockLLMProvider for dev/test
    """

    _registry: dict[str, type[BaseLLMProvider]] = {}

    @classmethod
    def register(cls, name: str, provider_cls: type[BaseLLMProvider]) -> None:
        cls._registry[name] = provider_cls

    @classmethod
    def create(cls, name: str, **kwargs: Any) -> BaseLLMProvider:
        provider_cls = cls._registry.get(name)
        if provider_cls is None:
            raise ValueError(f"Unknown LLM provider: {name}. Available: {list(cls._registry)}")
        return provider_cls(**kwargs)
