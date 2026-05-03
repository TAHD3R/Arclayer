from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class AuditScope(StrEnum):
    FULL = "full"
    BACKEND = "backend"
    FRONTEND = "frontend"
    MODULE = "module"
    PACKAGE = "package"
    CHANGED = "changed"
    RULES = "rules"


class OutputFormat(StrEnum):
    JSON = "json"
    HUMAN = "human"
    MARKDOWN = "markdown"


class Severity(StrEnum):
    BLOCKER = "BLOCKER"
    MAJOR = "MAJOR"
    MINOR = "MINOR"
    INFO = "INFO"


class RuleStability(StrEnum):
    PROTOTYPE = "prototype"
    ACTIVE = "active"
    BLOCKING = "blocking"
    RETIRED = "retired"


@dataclass(frozen=True)
class ScopeSelector:
    scope: AuditScope
    module: str | None = None
    package: str | None = None
    base_ref: str | None = None
    selected_rules: tuple[str, ...] = ()


@dataclass(frozen=True)
class RuleMetadata:
    id: str
    title: str
    category: str
    severity: Severity
    supported_scopes: tuple[AuditScope, ...]
    source: tuple[str, ...]
    stability: RuleStability
    owner: str
    autofix: str
    dedupe_key: str


@dataclass(frozen=True)
class Finding:
    rule_id: str
    severity: Severity
    file: str
    line: int
    column: int
    symbol: str
    message: str
    evidence: str
    source: tuple[str, ...]
    primary: bool = True
    related_rules: tuple[str, ...] = ()
    suggested_fix: str = ""
    waiver: str | None = None


@dataclass(frozen=True)
class ReportSummary:
    total_findings: int
    blockers: int
    majors: int
    minors: int
    infos: int


@dataclass(frozen=True)
class AuditReport:
    version: str
    repo_root: str
    selector: ScopeSelector
    rules_applied: tuple[str, ...]
    findings: tuple[Finding, ...]
    summary: ReportSummary
    metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["selector"]["scope"] = self.selector.scope.value
        payload["summary"] = asdict(self.summary)
        payload["rules_applied"] = list(self.rules_applied)
        payload["findings"] = [
            {
                **asdict(finding),
                "severity": finding.severity.value,
                "source": list(finding.source),
                "related_rules": list(finding.related_rules),
            }
            for finding in self.findings
        ]
        return payload


def build_summary(findings: tuple[Finding, ...]) -> ReportSummary:
    blocker_count = sum(1 for finding in findings if finding.severity == Severity.BLOCKER)
    major_count = sum(1 for finding in findings if finding.severity == Severity.MAJOR)
    minor_count = sum(1 for finding in findings if finding.severity == Severity.MINOR)
    info_count = sum(1 for finding in findings if finding.severity == Severity.INFO)
    return ReportSummary(
        total_findings=len(findings),
        blockers=blocker_count,
        majors=major_count,
        minors=minor_count,
        infos=info_count,
    )
