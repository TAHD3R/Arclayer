"""Filesystem structure audit rules."""

from __future__ import annotations

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v

REQUIRED_MODULE_FILES = frozenset({"router.py", "service.py", "repository.py", "schema.py"})
REQUIRED_PAGE_FILES = frozenset({"index.tsx"})


class ModuleStructureRule(AuditRule):
    """Backend modules should contain the standard router/service/repository/schema files."""

    rule_id = "filesystem.module-structure"
    description = "Each domain module under src/modules should follow the canonical file structure."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        # Group symbols by module directory
        modules: dict[str, set[str]] = {}
        for sym in symbols:
            parts = sym["file"].split("/")
            # Expected path: apps/api/src/modules/<module_name>/...
            if "modules" in parts:
                idx = parts.index("modules")
                if idx + 1 < len(parts):
                    module_name = parts[idx + 1]
                    if module_name not in modules:
                        modules[module_name] = set()
                    file_name = parts[-1]
                    if file_name.endswith(".py"):
                        modules[module_name].add(file_name)

        EXPECTED = REQUIRED_MODULE_FILES
        for mod_name, files in sorted(modules.items()):
            missing = EXPECTED - files
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
