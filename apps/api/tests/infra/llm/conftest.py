"""Test fixtures for LLM infrastructure tests."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.llm.mock import MockLLMProvider
from src.models.ai.ai_budget import AIBudget, BudgetSourceType


@pytest.fixture
def mock_llm() -> MockLLMProvider:
    """Return a fresh MockLLMProvider with no latency or failure injection."""
    return MockLLMProvider()


@pytest.fixture
def mock_llm_latent() -> MockLLMProvider:
    """Return a MockLLMProvider with simulated 50ms latency."""
    return MockLLMProvider(latency_ms=50)


@pytest.fixture
def mock_llm_faulty() -> MockLLMProvider:
    """Return a MockLLMProvider that fails every 3rd call."""
    return MockLLMProvider(fail_every=3)


# -- Budget test helpers (used by both unit mocks and integration tests) --


@pytest.fixture
def sample_budget_id() -> UUID:
    return uuid4()


@pytest.fixture
def sample_workspace_id() -> UUID:
    return uuid4()


def make_test_budget(
    *,
    source_type: BudgetSourceType = BudgetSourceType.WORKSPACE,
    source_id: UUID | None = None,
    limit_micros: int = 1_000_000_000,  # $1,000
    period_start: str | None = None,
) -> AIBudget:
    """Create an unsaved AIBudget instance for test setup."""
    if source_id is None:
        source_id = uuid4()
    if period_start is None:
        period_start = datetime.now(UTC).strftime("%Y-%m-01")
    return AIBudget(
        id=uuid4(),
        source_type=source_type,
        source_id=source_id,
        limit_micros=limit_micros,
        spent_micros=0,
        reserved_micros=0,
        period_start=period_start,
    )
