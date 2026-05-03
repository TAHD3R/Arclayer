"""Base rule interface and shared helpers for the audit engine."""

from __future__ import annotations

from abc import ABC, abstractmethod

from src.core.audit.models import Severity, Violation


class AuditRule(ABC):
    """Base class for all audit rules.

    Each rule receives the set of indexed symbols and returns violations.
    """

    rule_id: str
    description: str

    @abstractmethod
    def check(self, symbols: list[dict]) -> list[Violation]:
        """Run this rule against indexed symbols and return violations."""
        ...


def v(
    file: str,
    line: int,
    rule: str,
    message: str,
    severity: Severity,
    evidence: str = "",
) -> Violation:
    """Shorthand for creating a Violation."""
    return Violation(
        file=file,
        line=line,
        rule=rule,
        message=message,
        severity=severity,
        evidence=evidence,
    )
