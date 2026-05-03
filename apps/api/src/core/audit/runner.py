"""CLI entry point for the audit engine — incremental with add/remove tracking.

Usage:
    uv run python -m src.core.audit.runner                        # Full audit, human-readable
    uv run python -m src.core.audit.runner --json                 # JSON to stdout
    uv run python -m src.core.audit.runner -o report.json         # JSON to file
    uv run python -m src.core.audit.runner --module analytics     # Single module
    uv run python -m src.core.audit.runner --baseline             # Save baseline
    uv run python -m src.core.audit.runner --diff                 # Diff against baseline
    uv run python -m src.core.audit.runner --baseline --diff      # Save baseline AND show diff
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.core.audit.engine import run_audit
from src.core.audit.models import AuditReport, Violation

BASELINE_DIR_NAME = ".baseline"
BASELINE_FILE = "audit-baseline.json"


def _git_root() -> Path | None:
    import subprocess

    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], text=True, stderr=subprocess.DEVNULL
        ).strip()
        return Path(out)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _find_modules_dir() -> Path | None:
    root = _git_root()
    if root is None:
        return None
    modules = root / "apps" / "api" / "src" / "modules"
    return modules if modules.is_dir() else None


def _baseline_dir() -> Path:
    root = _git_root()
    if root is None:
        return Path(BASELINE_DIR_NAME)
    return root / BASELINE_DIR_NAME


def _baseline_path() -> Path:
    return _baseline_dir() / BASELINE_FILE


def _load_baseline() -> AuditReport | None:
    bp = _baseline_path()
    if not bp.exists():
        return None
    try:
        return AuditReport.model_validate_json(bp.read_text(encoding="utf-8"))
    except (ValueError, json.JSONDecodeError, OSError):
        return None


def _save_baseline(report: AuditReport) -> None:
    bd = _baseline_dir()
    bd.mkdir(parents=True, exist_ok=True)
    bp = bd / BASELINE_FILE
    bp.write_text(report.model_dump_json(by_alias=True, indent=2) + "\n", encoding="utf-8")
    print(f"Baseline saved to {bp}")


def _violation_key(v: Violation) -> str:
    return f"{v.file}:{v.line}:{v.rule}"


def _diff_reports(current: AuditReport, baseline: AuditReport) -> dict[str, Any]:
    """Compare current report against baseline. Returns added, removed, unchanged counts."""
    current_keys: dict[str, Violation] = {}
    for section in _all_violations(current):
        current_keys[_violation_key(section)] = section

    baseline_keys: dict[str, Violation] = {}
    for section in _all_violations(baseline):
        baseline_keys[_violation_key(section)] = section

    added = [v for k, v in current_keys.items() if k not in baseline_keys]
    removed = [v for k, v in baseline_keys.items() if k not in current_keys]
    unchanged = len(current_keys) - len(added)

    return {
        "added": len(added),
        "removed": len(removed),
        "unchanged": unchanged,
        "added_details": [v.model_dump() for v in added],
        "removed_details": [v.model_dump() for v in removed],
    }


def _all_violations(report: AuditReport) -> list[Violation]:
    """Flatten all violations from every report section into a single list."""
    result: list[Violation] = []
    result.extend(report.backend.service)
    result.extend(report.backend.repository)
    result.extend(report.backend.schema_)
    result.extend(report.backend.entity_manager)
    result.extend(report.i18n.violations)
    result.extend(report.architecture.orm_leak)
    result.extend(report.architecture.write_path_violation)
    result.extend(report.filesystem.structure_diff)
    result.extend(report.frontend.duplicates)
    result.extend(report.frontend.structure_diff)
    return result


def _print_report(report: AuditReport) -> None:
    """Print a human-readable summary to stdout."""
    print(f"\n{'=' * 60}")
    print("  Monorepo Consistency Audit Report")
    print(f"{'=' * 60}\n")
    print(f"Summary: {report.summary}\n")

    sections = [
        ("Backend — Service", report.backend.service),
        ("Backend — Repository", report.backend.repository),
        ("Backend — Schema", report.backend.schema_),
        ("Backend — EntityManager", report.backend.entity_manager),
        ("i18n", report.i18n.violations),
        ("Architecture — ORM Leaks", report.architecture.orm_leak),
        ("Architecture — Write Path", report.architecture.write_path_violation),
        ("Filesystem", report.filesystem.structure_diff),
        ("Frontend — Code", report.frontend.duplicates),
        ("Frontend — Structure", report.frontend.structure_diff),
    ]

    for title, violations in sections:
        if violations:
            print(f"--- {title} ({len(violations)}) ---")
            for v in violations:
                print(f"  [{v.severity.value}] {v.file}:{v.line}")
                print(f"    Rule: {v.rule}")
                print(f"    {v.message}")
                if v.evidence:
                    print(f"    Evidence: {v.evidence}")
                print()
        else:
            print(f"--- {title} — OK")


def _print_diff(diff: dict[str, Any]) -> None:
    """Print a human-readable diff summary."""
    print(f"\n{'=' * 60}")
    print("  Incremental Diff vs. Baseline")
    print(f"{'=' * 60}\n")
    print(f"  Added:   +{diff['added']}")
    print(f"  Removed: -{diff['removed']}")
    print(f"  Unchanged: {diff['unchanged']}")

    for detail in diff.get("added_details", []):
        print(f"  + [{detail.get('severity', '?')}] {detail.get('file', '?')}:{detail.get('line', '?')}")
        print(f"      {detail.get('message', '')[:100]}")
    for detail in diff.get("removed_details", []):
        print(f"  - [{detail.get('severity', '?')}] {detail.get('file', '?')}:{detail.get('line', '?')}")
        print(f"      {detail.get('message', '')[:100]}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Monorepo Consistency Audit Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run python -m src.core.audit.runner                        # Full audit, human-readable
  uv run python -m src.core.audit.runner --json                 # JSON to stdout
  uv run python -m src.core.audit.runner -o report.json         # JSON to file
  uv run python -m src.core.audit.runner --module analytics     # Single module only
  uv run python -m src.core.audit.runner --baseline             # Save as baseline
  uv run python -m src.core.audit.runner --diff                 # Diff against saved baseline
""",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON to stdout.")
    parser.add_argument("-o", "--output", type=str, help="Write JSON report to file.")
    parser.add_argument("--modules-dir", type=str, help="Path to src/modules/ directory.")
    parser.add_argument("--module", type=str, help="Audit a single module by name (e.g. 'analytics').")
    parser.add_argument("--baseline", action="store_true", help="Save current report as baseline for future diffs.")
    parser.add_argument("--diff", action="store_true", help="Compare current report against saved baseline.")
    args = parser.parse_args()

    modules_dir = args.modules_dir or (_find_modules_dir())
    if modules_dir is None:
        print("Error: Cannot locate modules directory. Use --modules-dir.", file=sys.stderr)
        sys.exit(1)
    modules_path = Path(modules_dir)

    # Single-module mode
    if args.module:
        module_path = modules_path / args.module
        if not module_path.is_dir():
            print(f"Error: Module '{args.module}' not found at {module_path}.", file=sys.stderr)
            sys.exit(1)
        report = run_audit(modules_dir=module_path)
    else:
        report = run_audit(modules_dir=modules_path)

    # Baseline management
    if args.baseline:
        _save_baseline(report)

    # Diff mode
    if args.diff:
        baseline = _load_baseline()
        if baseline is None:
            print("No baseline found. Run with --baseline first.", file=sys.stderr)
            sys.exit(1)
        diff = _diff_reports(report, baseline)
        if args.json:
            timestamp = datetime.now(UTC).isoformat()
            print(json.dumps({"timestamp": timestamp, "diff": diff}, indent=2))
        else:
            _print_diff(diff)
        return

    # Normal output
    if args.json or args.output:
        json_str = report.model_dump_json(by_alias=True, indent=2)
        if args.output:
            out_path = Path(args.output)
            out_path.write_text(json_str + "\n", encoding="utf-8")
            print(f"Report written to {args.output}")
        else:
            print(json_str)
    else:
        _print_report(report)


if __name__ == "__main__":
    main()
