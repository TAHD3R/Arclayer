from __future__ import annotations

import json

from code_review_engine.models import AuditReport, OutputFormat


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
    ]
    if not report.findings:
        lines.append("No findings.")
    return "\n".join(lines)


def _render_markdown(report: AuditReport) -> str:
    summary = report.summary
    lines = [
        "# Code Review Engine Report",
        "",
        f"- Scope: `{report.selector.scope.value}`",
        f"- Rules applied: `{len(report.rules_applied)}`",
        f"- Findings: `{summary.total_findings}`",
        f"- Blockers: `{summary.blockers}`",
    ]
    if not report.findings:
        lines.extend(["", "No findings."])
    return "\n".join(lines)
