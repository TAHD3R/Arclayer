from __future__ import annotations

from dataclasses import dataclass

from code_review_engine.models import Severity


@dataclass(frozen=True)
class Violation:
    """Legacy-compatible violation shape produced by migrated rules."""

    file: str
    line: int
    rule: str
    message: str
    severity: Severity
    evidence: str
