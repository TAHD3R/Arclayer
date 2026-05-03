"""Monorepo Consistency Audit Engine.

Run via: python -m src.core.audit.runner [--module MODULE_NAME] [--json]
"""

from __future__ import annotations

from src.core.audit.engine import run_audit
from src.core.audit.models import AuditReport, Severity, Violation

__all__ = ["run_audit", "AuditReport", "Violation", "Severity"]
