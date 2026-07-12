"""AI observability — structured logging, metrics counters, error taxonomy.

Phase 1 baseline: correlation_id贯穿全链路, latency buckets, token/cost counters.
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threading import Lock
from typing import Any
from uuid import UUID

import structlog

logger = structlog.get_logger("arclayer.ai")


# -- Metrics data --


@dataclass
class AIRequestMetrics:
    """Captured metrics for a single AI request."""

    correlation_id: str
    workspace_id: str | None = None
    project_id: str | None = None
    user_id: str | None = None
    model: str = ""
    source: str = "api"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_micros: int = 0
    duration_ms: float = 0.0
    status: str = ""
    error_code: str | None = None


# -- Structured logging helpers --


def log_request_start(
    correlation_id: str,
    workspace_id: str | None = None,
    model: str = "",
    source: str = "api",
) -> None:
    """Log the start of an AI request."""
    logger.info(
        "ai.request.start",
        correlation_id=correlation_id,
        workspace_id=workspace_id,
        model=model,
        source=source,
    )


def log_request_complete(metrics: AIRequestMetrics) -> None:
    """Log a completed AI request with full metrics."""
    logger.info(
        "ai.request.complete",
        correlation_id=metrics.correlation_id,
        workspace_id=metrics.workspace_id,
        project_id=metrics.project_id,
        user_id=metrics.user_id,
        model=metrics.model,
        source=metrics.source,
        prompt_tokens=metrics.prompt_tokens,
        completion_tokens=metrics.completion_tokens,
        cost_micros=metrics.cost_micros,
        duration_ms=metrics.duration_ms,
        status=metrics.status,
    )


def log_request_error(
    correlation_id: str,
    error_code: str,
    error_message: str,
    duration_ms: float = 0.0,
) -> None:
    """Log a failed AI request."""
    logger.error(
        "ai.request.error",
        correlation_id=correlation_id,
        error_code=error_code,
        error_message=error_message,
        duration_ms=duration_ms,
    )


def track_tokens(
    correlation_id: str,
    prompt_tokens: int,
    completion_tokens: int,
    model: str = "",
) -> None:
    """Log token usage for a request."""
    logger.info(
        "ai.tokens",
        correlation_id=correlation_id,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        model=model,
    )


def track_cost(
    correlation_id: str,
    cost_micros: int,
    model: str = "",
) -> None:
    """Log cost for a request."""
    logger.info(
        "ai.cost",
        correlation_id=correlation_id,
        cost_micros=cost_micros,
        model=model,
    )


# -- Audit log --


async def write_audit_log_entry(metrics: AIRequestMetrics) -> None:
    """Write an AI audit log entry.

    Non-blocking: failures are logged at WARNING level but never propagate,
    so a failed audit log write can never break the response path.
    """
    try:
        from src.config import get_settings

        settings = get_settings()
        if not settings.ai.audit_log_enabled:
            return

        from src.common.utils.ids import uuid7
        from src.llm.runtime import detect_provider
        from src.models.ai.ai_audit_log import AIAuditLog, AuditLogSource, AuditLogStatus

        provider = detect_provider(metrics.model)

        source_map = {
            "api": AuditLogSource.API,
            "agent": AuditLogSource.AGENT,
            "event": AuditLogSource.EVENT,
        }
        source_enum = source_map.get(metrics.source, AuditLogSource.API)

        status_map = {
            "success": AuditLogStatus.SUCCESS,
            "error": AuditLogStatus.ERROR,
        }
        status = status_map.get(metrics.status, AuditLogStatus.ERROR)

        if metrics.workspace_id is None:
            logger.warning(
                "write_audit_log_entry: metrics.workspace_id is None — audit entry will have null workspace_id",
                correlation_id=metrics.correlation_id,
            )

        try:
            cid = UUID(metrics.correlation_id) if metrics.correlation_id else uuid7()
        except (ValueError, TypeError, AttributeError):
            cid = uuid7()

        await AIAuditLog.create(
            correlation_id=cid,
            workspace_id=UUID(metrics.workspace_id) if metrics.workspace_id else None,
            project_id=UUID(metrics.project_id) if metrics.project_id else None,
            user_id=UUID(metrics.user_id) if metrics.user_id else None,
            source=source_enum,
            provider=provider,
            model=metrics.model,
            request_type="chat",
            prompt_tokens=metrics.prompt_tokens,
            completion_tokens=metrics.completion_tokens,
            cost_micros=metrics.cost_micros,
            duration_ms=round(metrics.duration_ms),
            status=status,
            error_code=metrics.error_code,
            error_message=None,
        )
    except Exception:
        logger.warning("Failed to write audit log entry", exc_info=True)


# -- Request span --


@asynccontextmanager
async def ai_request_span(
    correlation_id: str,
    workspace_id: str | None = None,
    project_id: str | None = None,
    model: str = "",
    source: str = "api",
) -> AsyncIterator[AIRequestMetrics]:
    """Context manager that times and logs an AI request lifecycle.

    Yields an AIRequestMetrics instance for the caller to fill in
    prompt_tokens, completion_tokens, cost_micros, etc.
    On success or error, the span logs the outcome and updates counters.
    """
    metrics = AIRequestMetrics(
        correlation_id=correlation_id,
        workspace_id=workspace_id,
        project_id=project_id,
        model=model,
        source=source,
    )
    start = time.monotonic()

    log_request_start(
        correlation_id=correlation_id,
        workspace_id=workspace_id,
        model=model,
        source=source,
    )
    ai_metrics.increment("ai.request.total")

    try:
        yield metrics
    except Exception:
        duration = time.monotonic() - start
        metrics.duration_ms = round(duration * 1000, 1)
        error_code = _extract_error_code()
        error_message = _extract_error_message()
        metrics.error_code = error_code
        metrics.status = "error"
        log_request_error(
            correlation_id=correlation_id,
            error_code=error_code,
            error_message=error_message,
            duration_ms=metrics.duration_ms,
        )
        ai_metrics.increment(f"ai.request.error.{error_code}")
        ai_metrics.observe("ai.latency.ms", metrics.duration_ms)
        await write_audit_log_entry(metrics)
        raise

    duration = time.monotonic() - start
    metrics.duration_ms = round(duration * 1000, 1)
    metrics.status = "success"
    log_request_complete(metrics)

    ai_metrics.increment("ai.request.success")
    ai_metrics.increment("ai.tokens.prompt", metrics.prompt_tokens)
    ai_metrics.increment("ai.tokens.completion", metrics.completion_tokens)
    ai_metrics.increment("ai.cost.micros", metrics.cost_micros)
    ai_metrics.observe("ai.latency.ms", metrics.duration_ms)
    await write_audit_log_entry(metrics)


def _extract_error_message() -> str:
    """Extract the error message from the current exception context."""
    import sys

    _, exc_value, _ = sys.exc_info()
    if exc_value is None:
        return "Unknown error"
    msg = str(exc_value)
    return msg or type(exc_value).__name__


def _extract_error_code() -> str:
    """Extract error code from the current exception context."""
    import sys

    exc_type, exc_value, _ = sys.exc_info()
    if exc_value is None:
        return "UNKNOWN"
    # Try to read a .code attribute (LLMRuntimeError pattern)
    code = getattr(exc_value, "code", None)
    if code is not None:
        return str(code)
    # Fall back to the exception type name
    if exc_type is not None:
        return exc_type.__name__
    return "UNKNOWN"


# -- Metrics registry --


class AIMetricsRegistry:
    """In-process counter registry for AI call metrics.

    Phase 1: in-process counters. Phase 4: OpenTelemetry / Prometheus.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._counters: dict[str, int] = defaultdict(int)
        self._histograms: dict[str, list[float]] = defaultdict(list)

    def increment(self, name: str, value: int = 1) -> None:
        """Increment a named counter."""
        with self._lock:
            self._counters[name] += value

    def observe(self, name: str, value: float) -> None:
        """Record an observation for a histogram."""
        with self._lock:
            self._histograms[name].append(value)

    def get_counters(self) -> dict[str, int]:
        """Return a snapshot of all counters."""
        with self._lock:
            return dict(self._counters)

    def get_histogram_stats(self, name: str) -> dict[str, Any]:
        """Return summary statistics for a histogram."""
        with self._lock:
            values = list(self._histograms.get(name, []))
        if not values:
            return {"count": 0, "min": 0, "max": 0, "avg": 0.0, "p50": 0.0, "p95": 0.0, "p99": 0.0}
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        return {
            "count": n,
            "min": sorted_vals[0],
            "max": sorted_vals[-1],
            "avg": sum(sorted_vals) / n,
            "p50": sorted_vals[int(n * 0.50)],
            "p95": sorted_vals[int(n * 0.95)],
            "p99": sorted_vals[int(n * 0.99)],
        }


# Global singleton
ai_metrics = AIMetricsRegistry()
