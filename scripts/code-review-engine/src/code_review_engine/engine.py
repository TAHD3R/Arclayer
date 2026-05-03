from __future__ import annotations

from pathlib import Path

from code_review_engine.models import AuditReport, ScopeSelector, build_summary
from code_review_engine.rules import RuleRegistry

REPORT_VERSION = "0.1"


def run_audit(repo_root: Path, selector: ScopeSelector, registry: RuleRegistry) -> AuditReport:
    """Run the skeleton audit pipeline.

    Phase 1 intentionally applies metadata and scope filtering only. Rule
    execution is added as individual rules are migrated with fixtures.
    """
    rules = registry.select(selector)
    findings = ()
    return AuditReport(
        version=REPORT_VERSION,
        repo_root=str(repo_root),
        selector=selector,
        rules_applied=tuple(rule.id for rule in rules),
        findings=findings,
        summary=build_summary(findings),
        metadata={"status": "skeleton"},
    )
