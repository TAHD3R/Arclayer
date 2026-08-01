from __future__ import annotations

import argparse
from datetime import UTC, datetime
import sys
from pathlib import Path

from code_review_engine.config import build_paths
from code_review_engine.engine import run_audit
from code_review_engine.models import AuditScope, OutputFormat, ScopeSelector
from code_review_engine.reporters import render_report
from code_review_engine.rules import DEFAULT_REGISTRY


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Arclayer code review engine")
    parser.add_argument("--repo-root", help="Repository root. Defaults to git rev-parse --show-toplevel.")
    parser.add_argument(
        "--scope",
        choices=[scope.value for scope in AuditScope],
        default=AuditScope.FULL.value,
        help="Audit scope.",
    )
    parser.add_argument("--module", help="Backend module name for --scope module.")
    parser.add_argument("--package", help="Workspace package path/name for --scope package.")
    parser.add_argument("--base", dest="base_ref", help="Git base ref for --scope changed.")
    parser.add_argument("--rules", help="Comma-separated rule ids to run.")
    parser.add_argument(
        "--format",
        choices=[fmt.value for fmt in OutputFormat],
        default=OutputFormat.HUMAN.value,
        help="Output format.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Write report artifact to this file path. Defaults to output/code-review-engine/<timestamp>-<scope>.<ext>.",
    )
    parser.add_argument("--list-rules", action="store_true", help="Print registered rules and exit.")
    return parser


def _selector_from_args(args: argparse.Namespace) -> ScopeSelector:
    scope = AuditScope(args.scope)
    selected_rules = tuple(rule.strip() for rule in (args.rules or "").split(",") if rule.strip())
    if selected_rules and scope != AuditScope.RULES:
        scope = AuditScope.RULES
    if scope == AuditScope.MODULE and not args.module:
        raise ValueError("--scope module requires --module")
    if scope == AuditScope.PACKAGE and not args.package:
        raise ValueError("--scope package requires --package")
    if scope == AuditScope.CHANGED and not args.base_ref:
        raise ValueError("--scope changed requires --base")
    return ScopeSelector(
        scope=scope,
        module=args.module,
        package=args.package,
        base_ref=args.base_ref,
        selected_rules=selected_rules,
    )


def _render_rules() -> str:
    lines = ["Registered rules:"]
    for rule in DEFAULT_REGISTRY.all():
        lines.append(f"- {rule.id} [{rule.severity.value}/{rule.stability.value}] {rule.title}")
    return "\n".join(lines)


def _default_output_path(repo_root: Path, selector: ScopeSelector, output_format: OutputFormat) -> Path:
    extension_by_format = {
        OutputFormat.JSON: "json",
        OutputFormat.HUMAN: "txt",
        OutputFormat.MARKDOWN: "md",
    }
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    extension = extension_by_format[output_format]
    return repo_root / "output" / "code-review-engine" / f"{timestamp}-{selector.scope.value}.{extension}"


def _resolve_output_path(
    output_arg: str | None,
    repo_root: Path,
    selector: ScopeSelector,
    output_format: OutputFormat,
) -> Path:
    if output_arg:
        explicit = Path(output_arg).expanduser()
        if explicit.is_absolute():
            return explicit.resolve()
        return (repo_root / explicit).resolve()
    return _default_output_path(repo_root=repo_root, selector=selector, output_format=output_format).resolve()


def _write_report(output_path: Path, rendered_report: str) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered_report + "\n", encoding="utf-8")
    return output_path


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.list_rules:
            print(_render_rules())
            return 0
        paths = build_paths(args.repo_root)
        selector = _selector_from_args(args)
        report = run_audit(repo_root=paths.repo_root, selector=selector, registry=DEFAULT_REGISTRY)
        output_format = OutputFormat(args.format)
        rendered_report = render_report(report, output_format)
        output_path = _resolve_output_path(
            output_arg=args.output,
            repo_root=paths.repo_root,
            selector=selector,
            output_format=output_format,
        )
        _write_report(output_path, rendered_report)
        print(rendered_report)
        print(f"Report artifact: {output_path}", file=sys.stderr)
        return 1 if report.summary.blocking_findings > 0 else 0
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
