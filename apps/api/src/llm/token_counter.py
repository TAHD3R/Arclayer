"""Token counting using tiktoken.

Provides accurate token estimation for OpenAI and Anthropic models.
Used for budget pre-check estimation and usage tracking.

Fallback: approximate counting (chars/4) when tiktoken is unavailable
or the model is unknown.
"""

from __future__ import annotations

import importlib
import json
from typing import Any, cast

# Mapping of model names to tiktoken encodings.
_MODEL_ENCODING: dict[str, str] = {
    "gpt-4o": "o200k_base",
    "gpt-4o-mini": "o200k_base",
    "gpt-4": "cl100k_base",
    "gpt-4-turbo": "cl100k_base",
    "gpt-3.5-turbo": "cl100k_base",
    "gpt-3.5-turbo-16k": "cl100k_base",
    "text-embedding-3-small": "cl100k_base",
    "text-embedding-3-large": "cl100k_base",
    "text-embedding-ada-002": "cl100k_base",
}

# Providers wrap messages and Tool schemas in private chat templates. Real
# DeepSeek Tool usage has exceeded the submitted JSON byte count, so budget
# reservation must cover both fixed framing and schema-proportional framing.
_PROVIDER_PROMPT_FRAMING_MIN_TOKENS = 1024
_PROVIDER_PROMPT_FRAMING_RATIO_NUMERATOR = 5
_PROVIDER_PROMPT_FRAMING_RATIO_DENOMINATOR = 4


def count_tokens(text: str, *, model: str = "gpt-4o-mini") -> int:
    """Count tokens in text for a given model.

    Uses tiktoken if available for the model; falls back to char/4 estimation.
    """
    encoding_name = _MODEL_ENCODING.get(model)
    if encoding_name:
        try:
            tiktoken = cast(Any, importlib.import_module("tiktoken"))
            encoding = tiktoken.get_encoding(encoding_name)
            return len(encoding.encode(text))
        except (ImportError, ValueError):
            pass

    # Fallback: rough approximation (4 chars ≈ 1 token for English text).
    return max(len(text) // 4, 1)


def estimate_tokens(
    messages: list[dict[str, str]],
    *,
    model: str = "gpt-4o-mini",
) -> int:
    """Estimate total tokens for a list of chat messages.

    Includes a fixed overhead per message (4 tokens) following the OpenAI formula.
    """
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        total += count_tokens(content, model=model)
        total += 4  # Message overhead (role + formatting)
    total += 2  # Priming overhead
    return max(total, 1)


def estimate_prompt_tokens_upper_bound(
    messages: list[dict[str, str]],
    *,
    provider_params: dict[str, Any] | None = None,
) -> int:
    """Return a reservation-safe upper bound for prompt-side tokens.

    Provider prompt usage includes more than message content. Function Tool
    schemas, forced Tool choices, response schemas, and other request metadata
    are serialized into the upstream prompt as well. Providers additionally
    wrap the request in private chat/Tool templates that are not present in the
    submitted JSON, so the bound includes both a fixed framing allowance and a
    proportional framing allowance.
    """

    prompt_request: dict[str, Any] = {"messages": messages}
    if provider_params:
        prompt_request.update(provider_params)
    serialized = json.dumps(
        prompt_request,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    request_bytes = len(serialized.encode("utf-8"))
    fixed_framing_bound = request_bytes + _PROVIDER_PROMPT_FRAMING_MIN_TOKENS
    proportional_framing_bound = (
        request_bytes * _PROVIDER_PROMPT_FRAMING_RATIO_NUMERATOR + _PROVIDER_PROMPT_FRAMING_RATIO_DENOMINATOR - 1
    ) // _PROVIDER_PROMPT_FRAMING_RATIO_DENOMINATOR
    return max(fixed_framing_bound, proportional_framing_bound, 1)
