"""Token counting using tiktoken.

Provides accurate token estimation for OpenAI and Anthropic models.
Used for budget pre-check estimation and usage tracking.

Fallback: approximate counting (chars/4) when tiktoken is unavailable
or the model is unknown.
"""

from __future__ import annotations

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


def count_tokens(text: str, *, model: str = "gpt-4o-mini") -> int:
    """Count tokens in text for a given model.

    Uses tiktoken if available for the model; falls back to char/4 estimation.
    """
    encoding_name = _MODEL_ENCODING.get(model)
    if encoding_name:
        try:
            import tiktoken

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
