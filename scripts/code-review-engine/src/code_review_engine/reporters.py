from __future__ import annotations

import json

from code_review_engine.models import AuditReport, Finding, OutputFormat, RuleStability, Severity


def render_report(report: AuditReport, output_format: OutputFormat) -> str:
    if output_format == OutputFormat.JSON:
        return json.dumps(report.to_dict(), indent=2, sort_keys=True)
    if output_format == OutputFormat.MARKDOWN:
        return _render_markdown(report)
    return _render_human(report)


def _render_human(report: AuditReport) -> str:
    summary = report.summary
    lines = [
        "Code Review Engine",
        f"Scope: {report.selector.scope.value}",
        f"Rules applied: {len(report.rules_applied)}",
        (
            "Findings: "
            f"{summary.total_findings} total, "
            f"{summary.blockers} BLOCKER, "
            f"{summary.majors} MAJOR, "
            f"{summary.minors} MINOR, "
            f"{summary.infos} INFO"
        ),
        f"Blocking findings: {summary.blocking_findings}",
        f"Report-only findings: {summary.report_only_findings}",
    ]
    if not report.findings:
        lines.append("No findings.")
    else:
        lines.append("Findings:")
        for finding in report.findings:
            enforcement = "blocking" if _is_blocking_finding(finding) else "report-only"
            location = f"{finding.file}:{finding.line}"
            lines.append(
                f"- {enforcement} {finding.severity.value}/{finding.rule_stability.value} "
                f"{finding.rule_id} {location} - {finding.message}"
            )
            if finding.evidence:
                lines.append(f"  evidence: {_single_line(finding.evidence)}")
            lines.append(f"  source: {', '.join(finding.source)}")
    return "\n".join(lines)


def _render_markdown(report: AuditReport) -> str:
    summary = report.summary
    lines = [
        "# Code Review Engine Report",
        "",
        f"- Scope: `{report.selector.scope.value}`",
        f"- Rules applied: `{len(report.rules_applied)}`",
        f"- Findings: `{summary.total_findings}`",
        f"- Severity blockers: `{summary.blockers}`",
        f"- Blocking findings: `{summary.blocking_findings}`",
        f"- Report-only findings: `{summary.report_only_findings}`",
    ]
    if not report.findings:
        lines.extend(["", "No findings."])
    else:
        lines.extend(
            [
                "",
                "| Enforcement | Severity | Stability | Rule | Location | Message | Evidence | Source |",
                "| --- | --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        for finding in report.findings:
            enforcement = "blocking" if _is_blocking_finding(finding) else "report-only"
            lines.append(
                "| "
                + " | ".join(
                    [
                        enforcement,
                        finding.severity.value,
                        finding.rule_stability.value,
                        _md_cell(finding.rule_id),
                        _md_cell(f"{finding.file}:{finding.line}"),
                        _md_cell(finding.message),
                        _md_cell(_single_line(finding.evidence)),
                        _md_cell(", ".join(finding.source)),
                    ]
                )
                + " |"
            )
    return "\n".join(lines)


def _is_blocking_finding(finding: Finding) -> bool:
    return finding.severity == Severity.BLOCKER and finding.rule_stability == RuleStability.BLOCKING


def _single_line(value: str) -> str:
    return " ".join(value.splitlines())


def _md_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")
