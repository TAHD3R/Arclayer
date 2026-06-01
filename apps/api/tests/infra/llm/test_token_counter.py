"""Tests for token counting utilities."""

from __future__ import annotations

from src.llm.token_counter import count_tokens, estimate_tokens


class TestCountTokens:
    def test_count_tokens_fallback_approximation(self):
        """Without tiktoken installed, falls back to char/4 approximation."""
        tokens = count_tokens("Hello world")
        assert tokens > 0

    def test_count_tokens_short_string(self):
        tokens = count_tokens("Hi")
        assert tokens >= 1  # Minimum 1 token

    def test_count_tokens_empty_string(self):
        tokens = count_tokens("")
        assert tokens >= 1

    def test_count_tokens_long_text(self):
        text = "The quick brown fox jumps over the lazy dog. " * 50
        tokens = count_tokens(text)
        assert tokens > 10
        # Rough: should be about len/4
        assert tokens >= len(text) // 5

    def test_count_tokens_specific_model(self):
        tokens = count_tokens("Hello world", model="gpt-4o")
        assert tokens > 0

    def test_count_tokens_unknown_model(self):
        tokens = count_tokens("Hello world", model="unknown-model")
        assert tokens > 0

    def test_count_tokens_claude_model(self):
        """Claude models don't have tiktoken encodings, should fall back."""
        tokens = count_tokens("Hello world", model="claude-sonnet-4-6")
        assert tokens > 0


class TestEstimateTokens:
    def test_estimate_single_message(self):
        tokens = estimate_tokens([{"role": "user", "content": "Hello"}])
        assert tokens >= 3  # Hello tokens + message overhead + priming

    def test_estimate_multiple_messages(self):
        messages = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "What is AI?"},
        ]
        tokens = estimate_tokens(messages)
        assert tokens > 5  # Both messages + overheads

    def test_estimate_empty_messages(self):
        tokens = estimate_tokens([])
        assert tokens >= 1

    def test_estimate_messages_without_content(self):
        tokens = estimate_tokens([{"role": "user"}])
        assert tokens >= 1

    def test_estimate_scales_with_length(self):
        short = estimate_tokens([{"role": "user", "content": "Hi"}])
        long = estimate_tokens([{"role": "user", "content": "Hello " * 100}])
        assert long > short
