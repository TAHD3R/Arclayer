"""Audit engine orchestrator — runs index → check → report pipeline."""

from __future__ import annotations

from pathlib import Path

from src.core.audit.indexer import index_modules
from src.core.audit.models import (
    ArchitectureReport,
    AuditReport,
    BackendReport,
    FilesystemReport,
    FrontendReport,
    I18nReport,
    Severity,
    Violation,
)
from src.core.audit.rules import ALL_RULES
from src.core.audit.rules.base import AuditRule


def _classify_severity(violations: list[Violation]) -> dict[Severity, int]:
    counts: dict[Severity, int] = {Severity.BLOCKER: 0, Severity.MAJOR: 0, Severity.MINOR: 0}
    for v in violations:
        counts[v.severity] += 1
    return counts


def _build_summary(all_violations: list[Violation]) -> str:
    if not all_violations:
        return "No violations found."
    counts = _classify_severity(all_violations)
    parts = [f"{counts[s]} {s.value}" for s in (Severity.BLOCKER, Severity.MAJOR, Severity.MINOR) if counts[s] > 0]
    return f"Found {len(all_violations)} violations: {', '.join(parts)}."


def _partition_by_layer(violations: list[Violation]) -> BackendReport:
    """Partition backend violations into service/repository/schema/entity_manager buckets."""
    service: list[Violation] = []
    repository: list[Violation] = []
    schemas: list[Violation] = []
    em: list[Violation] = []

    for v in violations:
        rule = v.rule
        if rule.startswith("service."):
            service.append(v)
        elif rule.startswith("repository."):
            repository.append(v)
        elif rule.startswith("schema."):
            schemas.append(v)
        elif rule.startswith("entity-manager."):
            em.append(v)

    return BackendReport(service=service, repository=repository, schema_=schemas, entity_manager=em)


def _partition_i18n(violations: list[Violation]) -> I18nReport:
    return I18nReport(violations=[v for v in violations if v.rule.startswith("i18n.")])


def _partition_architecture(violations: list[Violation]) -> ArchitectureReport:
    orm_leak = [v for v in violations if v.rule == "architecture.orm-leak"]
    write_path = [v for v in violations if v.rule == "architecture.write-path-violation"]
    return ArchitectureReport(orm_leak=orm_leak, write_path_violation=write_path)


def _partition_filesystem(violations: list[Violation]) -> FilesystemReport:
    return FilesystemReport(structure_diff=[v for v in violations if v.rule.startswith("filesystem.")])


def _partition_frontend(violations: list[Violation]) -> FrontendReport:
    return FrontendReport(
        duplicates=[v for v in violations if v.rule.startswith("frontend.")],
        structure_diff=[
            v for v in violations if v.rule.startswith("frontend.structure") or v.rule == "frontend.page-structure"
        ],
    )


def run_audit(
    modules_dir: Path | None = None,
    extra_rules: list[AuditRule] | None = None,
) -> AuditReport:
    """Run the full audit pipeline.

    Args:
        modules_dir: Path to src/modules/ directory. Defaults to auto-detect.
        extra_rules: Additional rules to run beyond the defaults.

    Returns:
        Full AuditReport with all violations partitioned by category.
    """
    # Phase 1–2: Index
    symbols = index_modules(modules_dir)

    # Phase 3: Run all rules
    rules = list(ALL_RULES)
    if extra_rules:
        rules.extend(extra_rules)

    all_violations: list[Violation] = []
    for rule in rules:
        rule_violations = rule.check(symbols)
        all_violations.extend(rule_violations)

    # Phase 4: Partition by category
    return AuditReport(
        backend=_partition_by_layer(all_violations),
        i18n=_partition_i18n(all_violations),
        architecture=_partition_architecture(all_violations),
        filesystem=_partition_filesystem(all_violations),
        frontend=_partition_frontend(all_violations),
        summary=_build_summary(all_violations),
    )
