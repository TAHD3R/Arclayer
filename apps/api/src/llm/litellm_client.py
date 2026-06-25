"""LiteLLM HTTP client — wraps the LiteLLM proxy REST API.

Phase 1: thin HTTP wrapper around the LiteLLM sidecar.
Virtual keys are resolved by LLMRuntime via Workspace-First and passed
as explicit `virtual_key=` kwargs — never stored on the client instance.
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
    The virtual_key is accepted as an explicit per-call kwarg and sent only
    as an Authorization header — never in the request body.
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

    async def list_models(self, *, master_key: str) -> dict[str, Any]:
        """List models exposed by the LiteLLM proxy using the management key."""
        headers = {"Authorization": f"Bearer {master_key}"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(f"{self._base_url}/v1/models", headers=headers)
            response.raise_for_status()
            return response.json()

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        virtual_key: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send a chat completion to LiteLLM.

        virtual_key is placed in the Authorization header only — never in the body.
        """
        headers = self._build_headers(virtual_key=virtual_key)
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
        virtual_key: str | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        """Send a streaming chat completion to LiteLLM. Yields SSE chunks.

        virtual_key is placed in the Authorization header only — never in the body.
        """
        import json

        headers = self._build_headers(virtual_key=virtual_key)
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

    def _build_headers(self, *, virtual_key: str | None = None) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        key = virtual_key or self._virtual_key
        if not key:
            raise ValueError("LiteLLMClient requires an explicit virtual_key for inference requests")
        headers["Authorization"] = f"Bearer {key}"
        return headers
