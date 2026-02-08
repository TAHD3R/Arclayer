#!/usr/bin/env python3
"""Repository-level quality audit for CelestialCMS.

This script is intentionally dependency-free so it can run in any local or CI environment.
It produces a Markdown report and optionally fails if configured thresholds/findings exist.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class Finding:
    category: str
    severity: str
    path: str
    line: int
    message: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit repository quality budgets and structural rules.")
    parser.add_argument("--repo-root", default=".", help="Repository root path.")
    parser.add_argument(
        "--budget-file",
        default="scripts/quality/quality_budget.json",
        help="JSON budget configuration file path (relative to repo root).",
    )
    parser.add_argument(
        "--out-md",
        default="docs/audit/latest-quality-report.md",
        help="Output markdown report path (relative to repo root).",
    )
    parser.add_argument(
        "--out-csv",
        default="docs/audit/latest-quality-report.csv",
        help="Output CSV report path (relative to repo root).",
    )
    parser.add_argument(
        "--fail-on-findings",
        action="store_true",
        help="Exit with code 1 when findings exist.",
    )
    return parser.parse_args()


def load_budget(repo_root: Path, budget_path: str) -> dict:
    raw = (repo_root / budget_path).read_text(encoding="utf-8")
    return json.loads(raw)


def is_ignored(path: Path, ignore_paths: list[str]) -> bool:
    path_str = path.as_posix()
    path_parts = set(path.parts)
    for ignore in ignore_paths:
        ignore_norm = ignore.strip("/")
        if not ignore_norm:
            continue
        if "/" in ignore_norm:
            if path_str == ignore_norm:
                return True
            if path_str.startswith(f"{ignore_norm}/"):
                return True
            continue

        # Segment-style ignore: ignore any path that contains this segment
        # (e.g. node_modules, .venv, __pycache__).
        if ignore_norm in path_parts:
            return True
    return False


def iter_files(repo_root: Path, ignore_paths: list[str]):
    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(repo_root)
        if is_ignored(rel, ignore_paths):
            continue
        yield rel


def line_count(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        return sum(1 for _ in fh)


def find_line_matches(content: str, pattern: re.Pattern[str]) -> list[int]:
    lines: list[int] = []
    for match in pattern.finditer(content):
        lines.append(content.count("\n", 0, match.start()) + 1)
    return lines


def audit_large_files(repo_root: Path, budget: dict, files: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    line_budgets: dict[str, int] = budget.get("line_budgets", {})
    for rel in files:
        threshold = line_budgets.get(rel.suffix)
        if threshold is None:
            continue
        count = line_count(repo_root / rel)
        if count > threshold:
            findings.append(
                Finding(
                    category="large_file",
                    severity="high",
                    path=rel.as_posix(),
                    line=1,
                    message=f"{count} lines exceeds budget {threshold}",
                )
            )
    return findings


def audit_frontend_any(repo_root: Path, budget: dict, files: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    roots = tuple(Path(root).as_posix().strip("/") for root in budget.get("frontend_any_scan_roots", []))
    if not roots:
        return findings

    patterns = [
        (re.compile(r"\bas any\b"), "use of 'as any'"),
        (re.compile(r":\s*any\b"), "explicit ': any' type annotation"),
        (re.compile(r"<any>"), "generic '<any>' usage"),
    ]

    for rel in files:
        rel_posix = rel.as_posix()
        if not rel_posix.endswith((".ts", ".tsx", ".js", ".jsx")):
            continue
        if not rel_posix.startswith(roots):
            continue

        content = (repo_root / rel).read_text(encoding="utf-8", errors="ignore")
        for pattern, message in patterns:
            for line in find_line_matches(content, pattern):
                findings.append(
                    Finding(
                        category="frontend_any",
                        severity="medium",
                        path=rel_posix,
                        line=line,
                        message=message,
                    )
                )

    return findings


def audit_broad_exceptions(repo_root: Path, budget: dict, files: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    scan_roots = tuple(Path(root).as_posix().strip("/") for root in budget.get("python_scan_roots", []))
    exclude = [Path(p).as_posix().strip("/") for p in budget.get("broad_exception_exclude", [])]
    pattern = re.compile(r"^\s*except\s+Exception(?:\s+as\s+\w+)?\s*:", re.MULTILINE)

    for rel in files:
        rel_posix = rel.as_posix()
        if not rel_posix.endswith(".py"):
            continue
        if scan_roots and not rel_posix.startswith(scan_roots):
            continue
        if any(rel_posix == ex or rel_posix.startswith(f"{ex}/") for ex in exclude):
            continue

        content = (repo_root / rel).read_text(encoding="utf-8", errors="ignore")
        for line in find_line_matches(content, pattern):
            findings.append(
                Finding(
                    category="broad_exception",
                    severity="medium",
                    path=rel_posix,
                    line=line,
                    message="broad exception handler (except Exception)",
                )
            )

    return findings


def audit_core_module_boundary(repo_root: Path, files: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    core_prefix = "apps/api/core/"
    pattern = re.compile(r"(?:from|import)\s+apps\.api\.modules")

    for rel in files:
        rel_posix = rel.as_posix()
        if not rel_posix.startswith(core_prefix) or not rel_posix.endswith(".py"):
            continue
        content = (repo_root / rel).read_text(encoding="utf-8", errors="ignore")
        for line in find_line_matches(content, pattern):
            findings.append(
                Finding(
                    category="core_modules_dependency",
                    severity="high",
                    path=rel_posix,
                    line=line,
                    message="core layer directly depends on modules layer",
                )
            )

    return findings


def summarize(findings: list[Finding]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding.category] = counts.get(finding.category, 0) + 1
    return counts


def top_unique_paths(findings: list[Finding], limit: int = 10) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding.path] = counts.get(finding.path, 0) + 1
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)[:limit]


def write_csv_report(path: Path, findings: list[Finding]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["id", "severity", "category", "path", "line", "message"])
        for idx, finding in enumerate(
            sorted(findings, key=lambda item: (item.severity, item.category, item.path, item.line)),
            start=1,
        ):
            writer.writerow(
                [
                    f"AUD-{idx:04d}",
                    finding.severity,
                    finding.category,
                    finding.path,
                    finding.line,
                    finding.message,
                ]
            )


def render_report(repo_root: Path, findings: list[Finding], budget_path: str) -> str:
    generated_at = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    summary = summarize(findings)

    lines: list[str] = []
    lines.append("# Repository Quality Audit Report")
    lines.append("")
    lines.append(f"- Generated at: {generated_at}")
    lines.append(f"- Repository: `{repo_root.as_posix()}`")
    lines.append(f"- Budget config: `{budget_path}`")
    lines.append(f"- Total findings: **{len(findings)}**")
    lines.append("")

    lines.append("## Findings by Category")
    lines.append("")
    if summary:
        for category, count in sorted(summary.items(), key=lambda item: item[1], reverse=True):
            lines.append(f"- `{category}`: {count}")
    else:
        lines.append("- No findings.")
    lines.append("")

    lines.append("## Top Paths")
    lines.append("")
    top_paths = top_unique_paths(findings)
    if top_paths:
        for path, count in top_paths:
            lines.append(f"- `{path}`: {count}")
    else:
        lines.append("- No findings.")
    lines.append("")

    lines.append("## Detailed Findings")
    lines.append("")
    if findings:
        lines.append("| Severity | Category | Location | Message |")
        lines.append("| --- | --- | --- | --- |")
        for finding in sorted(findings, key=lambda item: (item.severity, item.category, item.path, item.line)):
            location = f"`{finding.path}:{finding.line}`"
            lines.append(f"| {finding.severity} | `{finding.category}` | {location} | {finding.message} |")
    else:
        lines.append("No findings.")

    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- This audit highlights structural and maintainability risks, not runtime correctness.")
    lines.append("- Use this report as a triage queue; prioritize high-severity findings first.")
    lines.append("- For each accepted finding, create a tracked task with owner, target date, and test plan.")

    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()

    budget = load_budget(repo_root, args.budget_file)
    ignore_paths = budget.get("ignore_paths", [])
    files = list(iter_files(repo_root, ignore_paths))

    findings: list[Finding] = []
    findings.extend(audit_large_files(repo_root, budget, files))
    findings.extend(audit_frontend_any(repo_root, budget, files))
    findings.extend(audit_broad_exceptions(repo_root, budget, files))
    findings.extend(audit_core_module_boundary(repo_root, files))

    report = render_report(repo_root, findings, args.budget_file)
    out_md_path = repo_root / args.out_md
    out_md_path.parent.mkdir(parents=True, exist_ok=True)
    out_md_path.write_text(report, encoding="utf-8")

    out_csv_path = repo_root / args.out_csv
    write_csv_report(out_csv_path, findings)

    print(f"Wrote report: {out_md_path}")
    print(f"Wrote CSV: {out_csv_path}")
    print(f"Total findings: {len(findings)}")

    if args.fail_on_findings and findings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
