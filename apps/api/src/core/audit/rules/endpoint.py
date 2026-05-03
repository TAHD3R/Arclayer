"""Endpoint contract audit rules — from docs/guidelines/backend-endpoint-contract.md.

Project truth (2026-05-03):
  - Analytics routers use ResponseModel[T], ApiResponse.success(), PublicUUID correctly.
  - Rules check that ALL router modules follow the same contract.
  - Router tags must use domain.* / global.* / internal.* / external.* vocabulary.
"""

from __future__ import annotations

import ast
import pathlib

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


def _resolve_file_path(rel: str) -> pathlib.Path:
    import subprocess

    try:
        root = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], text=True, stderr=subprocess.DEVNULL
        ).strip()
        return pathlib.Path(root) / rel
    except (subprocess.CalledProcessError, FileNotFoundError):
        return pathlib.Path(rel)


class EndpointMissingResponseModel(AuditRule):
    """Router endpoint decorators must declare response_model.

    Per backend-endpoint-contract.md sec 3.1: "Every public endpoint must use
    explicit Pydantic request/response schemas" and "must declare response_model explicitly."
    """

    rule_id = "endpoint.missing-response-model"
    description = "Router endpoint decorators must declare response_model explicitly."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        router_files = {s["file"] for s in symbols if "router.py" in s["file"]}
        for rel in sorted(router_files):
            p = _resolve_file_path(rel)
            if not p.exists():
                continue
            try:
                tree = ast.parse(p.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):
                continue
            # Walk for @router.get / @router.post / etc. decorators
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    for dec in node.decorator_list:
                        dec_str = ast.unparse(dec)
                        if dec_str.startswith("@router.") or dec_str.startswith("router."):
                            # Check if response_model is in decorator kwargs
                            if "response_model" not in dec_str:
                                violations.append(
                                    v(
                                        file=rel,
                                        line=node.lineno,
                                        rule=self.rule_id,
                                        message=f"Endpoint '{node.name}' has no response_model in decorator.",
                                        severity=Severity.MAJOR,
                                        evidence=dec_str,
                                    )
                                )
        return violations


class EndpointMissingDocstring(AuditRule):
    """Router endpoint functions must have concise product docstrings.

    Per backend-endpoint-contract.md sec 3.4: "Every endpoint function must
    contain a concise function docstring inside the function body."
    """

    rule_id = "endpoint.missing-docstring"
    description = "Endpoint functions must contain a concise product-facing docstring."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        router_files = {s["file"] for s in symbols if "router.py" in s["file"]}
        for rel in sorted(router_files):
            p = _resolve_file_path(rel)
            if not p.exists():
                continue
            try:
                tree = ast.parse(p.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    for dec in node.decorator_list:
                        dec_str = ast.unparse(dec)
                        if dec_str.startswith("@router."):
                            # Check docstring
                            doc = ast.get_docstring(node)
                            if not doc:
                                violations.append(
                                    v(
                                        file=rel,
                                        line=node.lineno,
                                        rule=self.rule_id,
                                        message=f"Endpoint '{node.name}' missing product docstring.",
                                        severity=Severity.MINOR,
                                        evidence=f"def {node.name}(...):",
                                    )
                                )
                            break  # Only check first router decorator
        return violations
