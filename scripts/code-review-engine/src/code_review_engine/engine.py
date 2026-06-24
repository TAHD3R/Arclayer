from __future__ import annotations

from pathlib import Path
import subprocess

from code_review_engine.migrated.contracts import Violation
from code_review_engine.migrated.indexer import index_files, index_roots
from code_review_engine.migrated.runtime import set_repo_root_env
from code_review_engine.models import AuditReport, Finding, ScopeSelector, build_summary
from code_review_engine.rules import ExecutableRule, RuleRegistry

REPORT_VERSION = "0.2"


def _is_in_scope(selector: ScopeSelector, file_path: str, changed_files: frozenset[str]) -> bool:
    if selector.scope == selector.scope.FULL:
        return True
    if selector.scope == selector.scope.BACKEND:
        return file_path.startswith("apps/api/")
    if selector.scope == selector.scope.FRONTEND:
        return file_path.startswith("apps/admin/") or file_path.startswith("packages/ui/")
    if selector.scope == selector.scope.MODULE:
        if not selector.module:
            return False
        module_prefix = f"apps/api/src/modules/{selector.module}/"
        return file_path.startswith(module_prefix)
    if selector.scope == selector.scope.PACKAGE:
        if not selector.package:
            return False
        normalized = selector.package.strip("/")
        return file_path.startswith(f"{normalized}/") or file_path == normalized
    if selector.scope == selector.scope.CHANGED:
        return _matches_changed_path(file_path, changed_files)
    if selector.scope == selector.scope.RULES:
        return True
    return True


def _to_finding(violation: Violation, executable: ExecutableRule) -> Finding:
    return Finding(
        rule_id=violation.rule,
        severity=violation.severity,
        rule_stability=executable.metadata.stability,
        file=violation.file,
        line=violation.line,
        column=1,
        symbol="",
        message=violation.message,
        evidence=violation.evidence,
        source=executable.metadata.source,
        primary=True,
        related_rules=(),
        suggested_fix="",
        waiver=None,
    )


def run_audit(repo_root: Path, selector: ScopeSelector, registry: RuleRegistry) -> AuditReport:
    """Run migrated audit rules with selector-aware scope filtering."""

    set_repo_root_env(repo_root)
    selected_rules = registry.select(selector)
    changed_files = _changed_files(repo_root, selector)

    symbol_rules = tuple(rule for rule in selected_rules if rule.symbol_driven and rule.implementation is not None)
    if symbol_rules and selector.scope == selector.scope.CHANGED:
        symbols = index_files(sorted(_changed_python_index_files(changed_files)))
    else:
        symbols = index_roots(_index_roots(repo_root, selector)) if symbol_rules else []

    findings: list[Finding] = []
    executed_rule_ids: list[str] = []

    for executable in selected_rules:
        executed_rule_ids.append(executable.id)
        if executable.implementation is None:
            continue

        violations = executable.implementation.check(symbols)
        for violation in violations:
            if not _is_in_scope(selector, violation.file, changed_files):
                continue
            findings.append(_to_finding(violation, executable))

    findings_tuple = _dedupe(findings)
    rule_stability_counts = registry.stability_counts(selected_rules)
    return AuditReport(
        version=REPORT_VERSION,
        repo_root=str(repo_root),
        selector=selector,
        rules_applied=tuple(executed_rule_ids),
        findings=findings_tuple,
        summary=build_summary(findings_tuple),
        metadata={
            "status": "ok",
            "enforcement": "blocking-rule-stability",
            "rules_total": str(len(executed_rule_ids)),
            "rules_blocking": str(rule_stability_counts["blocking"]),
            "rules_active": str(rule_stability_counts["active"]),
            "rules_prototype": str(rule_stability_counts["prototype"]),
            "indexed_symbols": str(len(symbols)),
        },
    )


def _changed_files(repo_root: Path, selector: ScopeSelector) -> frozenset[str]:
    if selector.scope != selector.scope.CHANGED or not selector.base_ref:
        return frozenset()

    tracked = _git_lines(repo_root, ["diff", "--name-only", selector.base_ref, "--"])
    untracked = _git_lines(repo_root, ["ls-files", "--others", "--exclude-standard"])
    return frozenset(_normalize_path(path) for path in (*tracked, *untracked) if path)


def _changed_python_index_files(changed_files: frozenset[str]) -> frozenset[str]:
    backend_roots = ("apps/api/src/modules/", "apps/api/src/core/")
    return frozenset(
        path for path in changed_files if path.endswith(".py") and any(path.startswith(root) for root in backend_roots)
    )


def _git_lines(repo_root: Path, args: list[str]) -> tuple[str, ...]:
    try:
        output = subprocess.check_output(["git", *args], cwd=repo_root, text=True, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        command = "git " + " ".join(args)
        detail = f": {stderr}" if stderr else ""
        raise ValueError(f"Git command failed for changed-scope discovery ({command}){detail}") from exc
    except FileNotFoundError as exc:
        raise ValueError("Git executable is required for --scope changed") from exc
    return tuple(line.strip() for line in output.splitlines() if line.strip())


def _index_roots(repo_root: Path, selector: ScopeSelector) -> list[Path]:
    if selector.scope == selector.scope.FRONTEND:
        return []
    if selector.scope == selector.scope.MODULE and selector.module:
        return [repo_root / "apps" / "api" / "src" / "modules" / selector.module]
    if selector.scope == selector.scope.PACKAGE and selector.package:
        return [repo_root / selector.package]
    if selector.scope == selector.scope.RULES:
        return [repo_root / "apps" / "api" / "src" / "modules", repo_root / "apps" / "api" / "src" / "core"]
    return [repo_root / "apps" / "api" / "src" / "modules", repo_root / "apps" / "api" / "src" / "core"]


def _normalize_path(file_path: str) -> str:
    return file_path.strip().replace("\\", "/").strip("/")


def _matches_changed_path(file_path: str, changed_files: frozenset[str]) -> bool:
    if not changed_files:
        return False

    normalized = _normalize_path(file_path)
    if normalized in changed_files:
        return True

    prefix = normalized.rstrip("/") + "/"
    return any(changed == normalized or changed.startswith(prefix) for changed in changed_files)


def _dedupe(findings: list[Finding]) -> tuple[Finding, ...]:
    grouped: dict[tuple[str, int, str, str], Finding] = {}
    equivalent = {
        "architecture.orm-leak": "service.no-direct-orm",
        "architecture.write-path-violation": "entity-manager.write-must-use-em",
    }
    for item in findings:
        group_rule = equivalent.get(item.rule_id, item.rule_id)
        key = (item.file, item.line, item.evidence, group_rule)
        if key not in grouped:
            grouped[key] = item
            continue
        current = grouped[key]
        grouped[key] = Finding(
            rule_id=current.rule_id,
            severity=current.severity,
            rule_stability=current.rule_stability,
            file=current.file,
            line=current.line,
            column=current.column,
            symbol=current.symbol,
            message=current.message,
            evidence=current.evidence,
            source=current.source,
            primary=current.primary,
            related_rules=tuple(sorted({*current.related_rules, item.rule_id})),
            suggested_fix=current.suggested_fix,
            waiver=current.waiver,
        )
    return tuple(grouped.values())
