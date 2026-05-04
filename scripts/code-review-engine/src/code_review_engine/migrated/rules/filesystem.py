"""Filesystem structure audit rules."""

from __future__ import annotations

from pathlib import Path

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v
from code_review_engine.migrated.runtime import get_repo_root_from_env

REQUIRED_MODULE_FILES = frozenset({"router.py", "service.py", "repository.py", "schema.py"})
REQUIRED_PAGE_FILES = frozenset({"index.tsx"})


def _repo_root() -> Path:
    root = get_repo_root_from_env()
    if root is None:
        return Path(".")
    return root


class ModuleStructureRule(AuditRule):
    """Backend modules should contain canonical files directly or in subdomains."""

    rule_id = "filesystem.module-structure"
    description = "Each domain module under src/modules should follow the canonical file structure."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        modules_root = _repo_root() / "apps" / "api" / "src" / "modules"
        if not modules_root.is_dir():
            return violations

        module_names = _module_names(symbols, modules_root)
        for mod_name in sorted(module_names):
            module_dir = modules_root / mod_name
            if not module_dir.is_dir():
                continue

            files = {path.name for path in module_dir.rglob("*.py")}
            missing = REQUIRED_MODULE_FILES - files
            for fname in sorted(missing):
                violations.append(
                    v(
                        file=f"apps/api/src/modules/{mod_name}/",
                        line=0,
                        rule=self.rule_id,
                        message=f"Module '{mod_name}' is missing canonical file: {fname}",
                        severity=Severity.MINOR,
                        evidence=f"Expected: {mod_name}/{fname}",
                    )
                )
        return violations


def _module_names(symbols: list[dict], modules_root: Path) -> set[str]:
    names: set[str] = set()
    for sym in symbols:
        parts = str(sym.get("file", "")).split("/")
        if "modules" in parts:
            idx = parts.index("modules")
            if idx + 1 < len(parts):
                names.add(parts[idx + 1])

    if names:
        return names

    return {
        module_dir.name
        for module_dir in modules_root.iterdir()
        if module_dir.is_dir() and not module_dir.name.startswith(("_", "."))
    }
