"""LiteLLM HTTP client — wraps the LiteLLM proxy REST API.

Phase 1: thin HTTP wrapper around the LiteLLM sidecar.
Does NOT expose virtual_key_id to callers — key resolution is handled
by LLMRuntime via the Workspace-First model.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from src.llm.provider import BaseLLMProvider


class LiteLLMClient(BaseLLMProvider):
    """HTTP client for the LiteLLM proxy sidecar.

    Assumes the LiteLLM proxy is running at base_url (default http://localhost:4000).
    Authentication uses Virtual Keys created by Arclayer at runtime.
    """

    def __init__(
        self,
        *,
        base_url: str = "http://localhost:4000",
        virtual_key: str | None = None,
        timeout_seconds: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._virtual_key = virtual_key
        self._timeout = httpx.Timeout(timeout_seconds)

    async def health(self) -> dict[str, Any]:
        """Check LiteLLM proxy health."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._base_url}/health")
            response.raise_for_status()
            return response.json()

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send a chat completion to LiteLLM."""
        headers = self._build_headers()
        payload: dict[str, Any] = {"model": model, "messages": messages}
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        payload.update(kwargs)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        """Send a streaming chat completion to LiteLLM. Yields SSE chunks."""
        import json

        headers = self._build_headers()
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        payload.update(kwargs)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/v1/chat/completions",
                json=payload,
                headers=headers,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        yield json.loads(line[6:])

    def _build_headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._virtual_key:
            headers["Authorization"] = f"Bearer {self._virtual_key}"
        return headers
