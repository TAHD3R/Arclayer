"""Shared utilities for the LLM layer."""

from __future__ import annotations

import hashlib
from uuid import UUID


def make_correlation_id(*parts: str | UUID) -> str:
    """Generate a deterministic correlation ID from parts.

    Used to create a unique, stable correlation ID from workspace + user + request
    components for audit trail and log correlation.
    """
    raw = "|".join(str(p) for p in parts)
    return hashlib.shake_128(raw.encode()).hexdigest(8)


def micros_from_cents(cents: int) -> int:
    """Convert cents to microdollars."""
    return cents * 10_000


def cents_from_micros(micros: int) -> int:
    """Convert microdollars to cents (rounded down)."""
    return micros // 10_000
