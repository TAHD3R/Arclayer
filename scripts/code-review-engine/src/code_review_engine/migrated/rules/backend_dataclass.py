"""Backend production dataclass ban rules."""

from __future__ import annotations

import ast
from pathlib import Path

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v
from code_review_engine.migrated.runtime import get_repo_root_from_env

_PRODUCTION_ROOT = Path("apps/api/src")
_SUGGESTED_FIX = (
    "Use Pydantic v2 BaseModel, existing project schema bases, typed Protocols, "
    "Enum/Literal values, or explicit typed parameters."
)


def _repo_root() -> Path:
    root = get_repo_root_from_env()
    return Path(".") if root is None else root


class _DataclassBanVisitor(ast.NodeVisitor):
    def __init__(self, *, filepath: str, source_lines: list[str]) -> None:
        self.filepath = filepath
        self.source_lines = source_lines
        self.violations: list[Violation] = []
        self._dataclass_aliases: set[str] = set()
        self._dataclasses_aliases: set[str] = set()

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module == "dataclasses":
            self._record_import_violation(node.lineno, self._line_text(node.lineno))
            for alias in node.names:
                if alias.name == "dataclass":
                    self._dataclass_aliases.add(alias.asname or alias.name)
            return
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name == "dataclasses":
                self._record_import_violation(node.lineno, self._line_text(node.lineno))
                self._dataclasses_aliases.add(alias.asname or alias.name)
                return
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        for decorator in node.decorator_list:
            if self._is_dataclass_expression(decorator):
                self._record_violation(
                    line=self._line_no(decorator),
                    evidence=self._line_text(self._line_no(decorator)),
                    message=f"Production class '{node.name}' uses dataclasses. Migrate to Pydantic v2 or an approved typed structure.",
                )
        for statement in node.body:
            self.visit(statement)

    def visit_Call(self, node: ast.Call) -> None:
        if self._is_dataclass_expression(node.func):
            self._record_violation(
                line=self._line_no(node),
                evidence=self._line_text(self._line_no(node)),
                message="Production code calls dataclasses. Replace dataclass() factory usage with a Pydantic v2 model or approved typed structure.",
            )
        self.generic_visit(node)

    def _is_dataclass_expression(self, node: ast.AST) -> bool:
        if isinstance(node, ast.Call):
            return self._is_dataclass_expression(node.func)
        if isinstance(node, ast.Name):
            return node.id in self._dataclass_aliases
        if isinstance(node, ast.Attribute) and node.attr == "dataclass" and isinstance(node.value, ast.Name):
            return node.value.id in self._dataclasses_aliases
        return False

    def _record_import_violation(self, line: int, evidence: str) -> None:
        self._record_violation(
            line=line,
            evidence=evidence,
            message="Production code imports dataclasses. Replace it with Pydantic v2 BaseModel or another approved typed structure.",
        )

    def _record_violation(self, *, line: int, evidence: str, message: str) -> None:
        self.violations.append(
            v(
                file=self.filepath,
                line=line,
                rule=BackendNoProductionDataclass.rule_id,
                message=f"{message} {_SUGGESTED_FIX}",
                severity=Severity.BLOCKER,
                evidence=evidence,
            )
        )

    def _line_no(self, node: ast.AST) -> int:
        return int(getattr(node, "lineno", 0) or 0)

    def _line_text(self, line: int) -> str:
        if 1 <= line <= len(self.source_lines):
            return self.source_lines[line - 1].strip()
        return ""


class BackendNoProductionDataclass(AuditRule):
    """Production backend code under `apps/api/src` must not use dataclasses."""

    rule_id = "backend.no-production-dataclass"
    description = "Production backend code under apps/api/src must not import or use dataclasses."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        repo_root = _repo_root()
        production_root = (repo_root / _PRODUCTION_ROOT).resolve()
        if not production_root.is_dir():
            return violations
        for path in sorted(production_root.rglob("*.py")):
            try:
                rel = str(path.resolve().relative_to(repo_root.resolve()))
            except ValueError:
                continue
            if not path.is_file():
                continue
            try:
                source = path.read_text(encoding="utf-8")
                tree = ast.parse(source)
            except (OSError, SyntaxError, UnicodeDecodeError) as exc:
                violations.append(
                    v(
                        file=rel,
                        line=1,
                        rule=self.rule_id,
                        message=(
                            "Production backend file could not be parsed while checking the dataclass ban. "
                            "Fix the file or the rule cannot verify the boundary."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=f"{type(exc).__name__}: {exc}",
                    )
                )
                continue
            visitor = _DataclassBanVisitor(filepath=rel, source_lines=source.splitlines())
            visitor.visit(tree)
            violations.extend(visitor.violations)
        return violations
