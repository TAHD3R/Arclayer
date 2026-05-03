"""Test coverage audit rules — 90%+ coverage requirement.

Per user requirement:
  - Unit tests and integration tests must reach 90%+ coverage.
  - Test structure mirrors source structure under tests/.
  - No skipped tests without owner/rationale/deadline.
  - Every module must have a corresponding test directory.
"""

from __future__ import annotations

import pathlib
import subprocess

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


def _repo_root() -> pathlib.Path:
    try:
        out = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True, stderr=subprocess.DEVNULL)
        return pathlib.Path(out.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        return pathlib.Path(".")


class ModuleMustHaveTests(AuditRule):
    """Every backend module must have a corresponding test directory.

    Checks: apps/api/tests/modules/<name>/ exists for each apps/api/src/modules/<name>/.
    """

    rule_id = "test.missing-module-tests"
    description = "Every module under src/modules/ must have tests under tests/modules/. 90%+ coverage required."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        src_modules = root / "apps" / "api" / "src" / "modules"
        test_modules = root / "apps" / "api" / "tests" / "modules"

        if not src_modules.is_dir():
            return violations

        for module_dir in sorted(src_modules.iterdir()):
            if not module_dir.is_dir() or module_dir.name.startswith("_"):
                continue
            test_dir = test_modules / module_dir.name
            if not test_dir.is_dir():
                violations.append(
                    v(
                        file=str(module_dir.relative_to(root)),
                        line=0,
                        rule=self.rule_id,
                        message=f"Module '{module_dir.name}' has no test directory at tests/modules/{module_dir.name}/. 90%+ coverage required.",
                        severity=Severity.BLOCKER,
                        evidence=f"Missing: tests/modules/{module_dir.name}/",
                    )
                )
                continue

            # Check that test files exist (at least one test file)
            test_files = list(test_dir.rglob("test_*.py"))
            if not test_files:
                violations.append(
                    v(
                        file=str(test_dir.relative_to(root)),
                        line=0,
                        rule=self.rule_id,
                        message=f"Module '{module_dir.name}' has test directory but no test files. 90%+ coverage required.",
                        severity=Severity.BLOCKER,
                        evidence=f"No test_*.py files in tests/modules/{module_dir.name}/",
                    )
                )
        return violations


class CoreMustHaveTests(AuditRule):
    """Core infrastructure (EntityManager, lifecycles, plugin, repository) must have tests."""

    rule_id = "test.missing-core-tests"
    description = "Core infrastructure components must have comprehensive unit tests. 90%+ coverage required."
    CORE_COMPONENTS = [
        ("apps/api/src/core/entity_manager/", "apps/api/tests/core/"),
        ("apps/api/src/core/lifecycles/", "apps/api/tests/core/"),
        ("apps/api/src/core/plugin/", "apps/api/tests/core/"),
        ("apps/api/src/core/repository/", "apps/api/tests/core/"),
    ]

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        for src_rel, test_rel in self.CORE_COMPONENTS:
            src_dir = root / src_rel
            test_dir = root / test_rel
            if not src_dir.is_dir():
                continue
            if not test_dir.is_dir():
                violations.append(
                    v(
                        file=src_rel,
                        line=0,
                        rule=self.rule_id,
                        message=f"Core component '{src_rel}' has no test directory. 90%+ coverage required.",
                        severity=Severity.BLOCKER,
                        evidence=f"Missing: {test_rel}",
                    )
                )
                continue
            # Check for relevant test files
            component_name = src_rel.rstrip("/").split("/")[-1]
            relevant_tests = list(test_dir.rglob(f"*{component_name}*")) + list(test_dir.rglob("test_*.py"))
            if not relevant_tests:
                violations.append(
                    v(
                        file=src_rel,
                        line=0,
                        rule=self.rule_id,
                        message=f"Core component '{src_rel}' has no relevant test files. 90%+ coverage required.",
                        severity=Severity.BLOCKER,
                        evidence=f"No tests for {component_name} in {test_rel}",
                    )
                )
        return violations


class NoSkippedTestsWithoutRationale(AuditRule):
    """Skipped tests must have owner, rationale, and deadline."""

    rule_id = "test.no-skipped-without-rationale"
    description = (
        "Skipped tests (skip/xfail) must have owner, rationale, deadline per testing-and-quality-gates.md sec 8."
    )

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        test_root = root / "apps" / "api" / "tests"
        if not test_root.is_dir():
            return violations

        for test_file in sorted(test_root.rglob("test_*.py")):
            try:
                content = test_file.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            lines = content.splitlines()
            for i, line in enumerate(lines, 1):
                stripped = line.strip()
                if "skip" in stripped.lower() or "xfail" in stripped.lower():
                    if stripped.startswith("#") or stripped.startswith('"""'):
                        continue
                    # Check if rationale is nearby (within 3 lines)
                    has_rationale = False
                    for j in range(max(0, i - 4), min(len(lines), i + 4)):
                        if j == i - 1:
                            continue
                        if "TODO" in lines[j] or "FIXME" in lines[j] or "reason" in lines[j].lower():
                            has_rationale = True
                            break
                    if not has_rationale:
                        violations.append(
                            v(
                                file=str(test_file.relative_to(root)),
                                line=i,
                                rule=self.rule_id,
                                message="Skipped/xfail test without rationale. Add owner, reason, and deadline per testing-and-quality-gates.md sec 8.",
                                severity=Severity.MAJOR,
                                evidence=stripped[:80],
                            )
                        )
        return violations
