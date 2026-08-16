"""Backend infrastructure hard-cut audit rules.

These rules enforce the canonical infrastructure ownership model documented in
`docs/spec/api/backend/directory-structure.md`.
They are intentionally file-based because several checks target module-level
patterns rather than one indexed class symbol.
"""

from __future__ import annotations

import ast
import pathlib
from collections.abc import Iterable
from typing import NamedTuple

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v
from code_review_engine.migrated.runtime import get_repo_root_from_env


def _repo_root() -> pathlib.Path:
    env_root = get_repo_root_from_env()
    if env_root is not None:
        return env_root
    return pathlib.Path(".")


def _python_files(*roots: pathlib.Path) -> Iterable[pathlib.Path]:
    for root in roots:
        if not root.exists():
            continue
        files = [root] if root.is_file() else sorted(root.rglob("*.py"))
        for path in files:
            if path.name.startswith("test_") or any(part in {"tests", "test"} for part in path.parts):
                continue
            yield path


def _relative(path: pathlib.Path) -> str:
    root = _repo_root()
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


class _ParsedFile(NamedTuple):
    rel: str
    text: str
    tree: ast.Module | None
    violation: Violation | None


def _parse_file(path: pathlib.Path, *, rule_id: str) -> _ParsedFile:
    rel = _relative(path)
    try:
        text = path.read_text(encoding="utf-8")
        return _ParsedFile(rel=rel, text=text, tree=ast.parse(text), violation=None)
    except (OSError, SyntaxError, UnicodeDecodeError) as exc:
        return _ParsedFile(
            rel=rel,
            text="",
            tree=None,
            violation=v(
                file=rel,
                line=1,
                rule=rule_id,
                message=(
                    "Backend infrastructure rule could not parse this production file. "
                    "Fix the file or the audit cannot verify hard-cut compliance."
                ),
                severity=Severity.BLOCKER,
                evidence=f"{type(exc).__name__}: {exc}",
            ),
        )


def _call_name(node: ast.Call) -> str:
    parts: list[str] = []
    current: ast.expr = node.func
    while True:
        if isinstance(current, ast.Name):
            parts.append(current.id)
            break
        if isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
            continue
        break
    parts.reverse()
    return ".".join(parts)


def _import_name(node: ast.Import | ast.ImportFrom) -> str:
    if isinstance(node, ast.Import):
        return ", ".join(alias.name for alias in node.names)
    return node.module or ""


class BackendNoLocalQueryParsers(AuditRule):
    """REST, search, and GraphQL query parsing must use `core/query`."""

    rule_id = "backend.no-local-query-parsers"
    description = "Backend list/search/GraphQL query parsing must use src.core.query instead of module-local parsers."

    QUERY_FUNCTION_NAMES = frozenset({
        "parse_filter",
        "parse_filters",
        "parse_sort",
        "parse_pagination",
        "parse_populate",
        "build_filter",
        "build_filters",
        "build_sort",
    })

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        modules_root = root / "apps" / "api" / "src" / "modules"
        for path in _python_files(modules_root):
            parsed = _parse_file(path, rule_id=self.rule_id)
            if parsed.rel.endswith("/graphql/planner.py") or "/query/" in parsed.rel:
                continue
            if parsed.violation is not None:
                violations.append(parsed.violation)
                continue
            if parsed.tree is None:
                continue
            imports_core_query = any(
                isinstance(node, ast.ImportFrom) and (node.module or "").startswith("src.core.query")
                for node in ast.walk(parsed.tree)
            )
            if imports_core_query:
                continue
            for node in ast.walk(parsed.tree):
                if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                    continue
                if node.name not in self.QUERY_FUNCTION_NAMES:
                    continue
                violations.append(
                    v(
                        file=parsed.rel,
                        line=node.lineno,
                        rule=self.rule_id,
                        message=(
                            f"Module-local query parser '{node.name}' bypasses src.core.query. "
                            "Use canonical query models and parser helpers."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=f"def {node.name}(...)",
                    )
                )
        return violations


class BackendGraphQLNoRepositoryAccess(AuditRule):
    """GraphQL resolvers must use planner/service paths, not repositories or ORM."""

    rule_id = "backend.graphql-no-repository-access"
    description = "GraphQL resolvers must not access repositories or ORM directly; use canonical planners/services."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        graphql_root = _repo_root() / "apps" / "api" / "src" / "modules" / "sites" / "graphql"
        for path in _python_files(graphql_root):
            parsed = _parse_file(path, rule_id=self.rule_id)
            if parsed.rel.endswith(("service.py", "planner.py", "schema.py")):
                continue
            if parsed.violation is not None:
                violations.append(parsed.violation)
                continue
            if parsed.tree is None:
                continue
            for node in ast.walk(parsed.tree):
                if isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    if module.endswith("repository") or ".repository" in module:
                        violations.append(
                            v(
                                file=parsed.rel,
                                line=node.lineno,
                                rule=self.rule_id,
                                message="GraphQL resolver module imports repository code directly. Route through planner/service.",
                                severity=Severity.BLOCKER,
                                evidence=f"from {module} import ...",
                            )
                        )
                if isinstance(node, ast.Call):
                    name = _call_name(node)
                    if name.split(".")[-1].endswith("Repository"):
                        violations.append(
                            v(
                                file=parsed.rel,
                                line=node.lineno,
                                rule=self.rule_id,
                                message="GraphQL resolver constructs a repository directly. Route through planner/service.",
                                severity=Severity.BLOCKER,
                                evidence=f"{name}(...)",
                            )
                        )
        return violations


class BackendSanitizeExternalSinks(AuditRule):
    """Activity/log/plugin/search sinks must route payloads through canonical sanitizers."""

    rule_id = "backend.sanitize-external-sinks"
    description = "External sink payloads must be sanitized through src.core.sanitize or src.common.utils.redact."

    SINK_CALL_PARTS = frozenset({
        "write_required_activity_event",
        "AuditEvent",
        "AuditEvent.create",
        "publish_document",
        "index_document",
        "emit_hook_result",
    })

    SANITIZER_NAMES = frozenset({
        "sanitize_properties",
        "sanitize_api_response",
        "sanitize_html_input",
        "redact",
        "OutputSanitizer",
        "InputSanitizer",
    })

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _repo_root()
        targets = (
            root / "apps" / "api" / "src" / "modules" / "analytics",
            root / "apps" / "api" / "src" / "modules" / "sites" / "search",
            root / "apps" / "api" / "src" / "core" / "plugin",
        )
        for path in _python_files(*targets):
            parsed = _parse_file(path, rule_id=self.rule_id)
            if parsed.violation is not None:
                violations.append(parsed.violation)
                continue
            if parsed.tree is None:
                continue
            sanitized_names = _sanitized_names(parsed.tree)
            for node in ast.walk(parsed.tree):
                if not isinstance(node, ast.Call):
                    continue
                name = _call_name(node)
                if name not in self.SINK_CALL_PARTS and name.split(".")[-1] not in self.SINK_CALL_PARTS:
                    continue
                if _sink_call_has_sanitizer_evidence(node, sanitized_names=sanitized_names):
                    continue
                violations.append(
                    v(
                        file=parsed.rel,
                        line=node.lineno,
                        rule=self.rule_id,
                        message=(
                            f"External sink call '{name}' has no canonical sanitizer evidence in the file. "
                            "Sanitize Activity, log, plugin, and search payloads before emission."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=f"{name}(...)",
                    )
                )
        return violations


class BackendPluginTypedPayloads(AuditRule):
    """Plugin hook contracts must be Pydantic typed, not ad-hoc dictionaries."""

    rule_id = "backend.plugin-typed-payloads"
    description = "Plugin hook payload/result contracts must use typed Pydantic models instead of raw dict payloads."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        plugin_root = _repo_root() / "apps" / "api" / "src" / "core" / "plugin"
        for path in _python_files(plugin_root):
            parsed = _parse_file(path, rule_id=self.rule_id)
            if parsed.violation is not None:
                violations.append(parsed.violation)
                continue
            if parsed.tree is None:
                continue
            for node in ast.walk(parsed.tree):
                if isinstance(node, ast.AnnAssign):
                    annotation = ast.unparse(node.annotation)
                    if "payload" in ast.unparse(node.target).lower() and _is_untyped_dict(annotation):
                        violations.append(
                            v(
                                file=parsed.rel,
                                line=node.lineno,
                                rule=self.rule_id,
                                message="Plugin payload field uses an untyped dict. Use a typed Pydantic hook payload model.",
                                severity=Severity.BLOCKER,
                                evidence=f"{ast.unparse(node.target)}: {annotation}",
                            )
                        )
                if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                    is_hook_function = _is_plugin_hook_function(node)
                    for arg in (*node.args.args, *node.args.kwonlyargs):
                        if arg.annotation is None or arg.arg == "self":
                            continue
                        annotation = ast.unparse(arg.annotation)
                        if not _is_untyped_hook_arg(
                            arg_name=arg.arg,
                            annotation=annotation,
                            is_hook_function=is_hook_function,
                        ):
                            continue
                        violations.append(
                            v(
                                file=parsed.rel,
                                line=node.lineno,
                                rule=self.rule_id,
                                message=(
                                    f"Plugin hook argument '{arg.arg}' uses an untyped contract. "
                                    "Use a typed Pydantic hook payload model."
                                ),
                                severity=Severity.BLOCKER,
                                evidence=f"{arg.arg}: {annotation}",
                            )
                        )
        return violations


def _is_untyped_dict(annotation: str) -> bool:
    normalized = annotation.replace("typing.", "")
    return normalized in {"dict", "dict[str, object]", "dict[str, Any]", "Dict[str, object]", "Dict[str, Any]"}


def _is_plugin_hook_function(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    if node.name.startswith("arclayer_") or "hook" in node.name.lower():
        return True
    decorator_names = {ast.unparse(decorator) for decorator in node.decorator_list}
    return any("arclayer_hookspec" in name or "arclayer_hookimpl" in name for name in decorator_names)


def _is_untyped_hook_arg(*, arg_name: str, annotation: str, is_hook_function: bool) -> bool:
    if not is_hook_function and "payload" not in arg_name.lower():
        return False
    if _is_untyped_dict(annotation):
        return True
    normalized = annotation.replace("typing.", "")
    if normalized in {"Any", "object"}:
        return arg_name not in {"app"}
    return False


def _sanitized_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            for arg in (*node.args.args, *node.args.kwonlyargs):
                if arg.annotation is not None and "Sanitized" in ast.unparse(arg.annotation):
                    names.add(arg.arg)
            continue
        if isinstance(node, ast.Assign | ast.AnnAssign):
            value = node.value
            if value is None:
                continue
            if not _expression_has_sanitizer_call(value) and not _expression_uses_name(value, names):
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
            continue
        if isinstance(node, ast.comprehension) and _expression_uses_name(node.iter, names):
            for target in ast.walk(node.target):
                if isinstance(target, ast.Name):
                    names.add(target.id)
    return names


def _sink_call_has_sanitizer_evidence(node: ast.Call, *, sanitized_names: set[str]) -> bool:
    return any(
        _expression_has_sanitizer_call(arg) or _expression_uses_name(arg, sanitized_names)
        for arg in (*node.args, *(keyword.value for keyword in node.keywords))
    )


def _expression_has_sanitizer_call(node: ast.AST) -> bool:
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        name = _call_name(child)
        last = name.split(".")[-1]
        if name in BackendSanitizeExternalSinks.SANITIZER_NAMES or last in BackendSanitizeExternalSinks.SANITIZER_NAMES:
            return True
        if last.startswith("sanitize_"):
            return True
    return False


def _expression_uses_name(node: ast.AST, names: set[str]) -> bool:
    return any(isinstance(child, ast.Name) and child.id in names for child in ast.walk(node))
