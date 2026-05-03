"""AST-based code indexer for Phase 1 of the audit engine.

Walks the backend module tree, parses each .py file, and classifies
symbols by architectural layer. Tracks ORM calls, t() calls, imports,
and raise statements for downstream rule checking.
"""

from __future__ import annotations

import ast
import pathlib
import subprocess
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterator


def _repo_root() -> pathlib.Path:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return pathlib.Path(out.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        p = pathlib.Path(__file__).resolve()
        for _ in range(10):
            if (p / ".git").exists():
                return p
            p = p.parent
        raise RuntimeError("Cannot find repo root")


REPO_ROOT = _repo_root()
MODULES_DIR = REPO_ROOT / "apps" / "api" / "src" / "modules"
CORE_DIR = REPO_ROOT / "apps" / "api" / "src" / "core"

ORM_MODEL_CLASSES = frozenset({
    "AuditEvent",
    "User",
    "Workspace",
    "Organization",
    "Project",
    "Site",
    "Domain",
    "Asset",
    "MembershipRecord",
    "ContentReleaseRecord",
    "ContentItemRecord",
    "ContentModelDefinitionRecord",
    "ContentVersionRecord",
    "ContentTranslationRecord",
    "TranslationGroupRecord",
    "CapabilityPack",
    "RoleRecord",
    "PermissionRecord",
    "InviteRecord",
    "OAuthIdentity",
    "SystemConfig",
    "TenantRecord",
})

ORM_METHODS = frozenset({
    "filter",
    "get_or_none",
    "all",
    "create",
    "bulk_create",
    "delete",
    "update",
    "first",
    "values",
    "count",
    "order_by",
})

SERVICE_BASE_NAMES = frozenset({"BaseService", "Service"})
REPO_BASE_NAMES = frozenset({"AbstractRepository", "TortoiseORMRepository", "BaseRepository", "Repository"})
SCHEMA_BASE_NAMES = frozenset({"BaseModel", "BaseSchema", "BaseOut", "BaseIn"})


class _SymbolVisitor(ast.NodeVisitor):
    """Walks an AST module and collects symbol metadata."""

    def __init__(self, filepath: str) -> None:
        self.filepath = filepath
        self.symbols: list[dict] = []
        self._current_class: str | None = None
        self._import_map: dict[str, str] = {}  # name → module
        self._import_names: set[str] = set()

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        for alias in node.names:
            self._import_names.add(alias.name)
            self._import_map[alias.name] = module

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self._import_names.add(alias.name)
            self._import_map[alias.name] = alias.name

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        bases = [_class_name(b) for b in node.bases]
        decorator_names = [_decorator_name(d) for d in node.decorator_list]

        kind = _classify_class(node.name, bases, decorator_names)

        calls: list[str] = []
        t_calls: list[dict] = []
        raises: list[dict] = []
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                call_name = _call_chain_name(child)
                if call_name:
                    calls.append(call_name)
                # Detect t(...) calls
                if _is_t_call(child):
                    t_calls.append(_t_call_info(child))
            if isinstance(child, ast.Raise):
                exc_info = _extract_raise(child)
                if exc_info:
                    raises.append(exc_info)

        annotations: dict[str, str] = {}
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                annotations[stmt.target.id] = ast.unparse(stmt.annotation) if stmt.annotation else "Any"

        prev_class = self._current_class
        self._current_class = node.name

        symbol = {
            "name": node.name,
            "kind": kind,
            "file": self.filepath,
            "line": node.lineno,
            "parent_class": _class_name(node.bases[0]) if node.bases else None,
            "decorators": decorator_names,
            "imports": sorted(self._import_names),
            "type_annotations": annotations,
            "calls": calls,
            "t_calls": t_calls,
            "raises": raises,
            "body_lines": (node.lineno, node.end_lineno or node.lineno),
        }
        self.symbols.append(symbol)
        self.generic_visit(node)
        self._current_class = prev_class


def _class_name(expr: ast.expr) -> str:
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return f"{_class_name(expr.value)}.{expr.attr}"
    return ""


def _decorator_name(expr: ast.expr) -> str:
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return f"{_decorator_name(expr.value)}.{expr.attr}"
    if isinstance(expr, ast.Call):
        return f"{_decorator_name(expr.func)}(...)"
    return ""


def _classify_class(name: str, bases: list[str], decorators: list[str]) -> str:
    """Classify a class by its name, base classes, and decorators."""
    name_lower = name.lower()
    base_names = {b.split(".")[-1] for b in bases}

    # EntityManager is unique
    if "EntityManager" in name:
        return "entity_manager"

    # Repository detection
    if name_lower.endswith("repository") or base_names & REPO_BASE_NAMES:
        return "repository"

    # Schema detection (Pydantic)
    if base_names & SCHEMA_BASE_NAMES:
        return "schema"

    # Service detection
    if name_lower.endswith("service") or base_names & SERVICE_BASE_NAMES:
        return "service"

    # Dataclass detection (for EntityManager return types)
    if "dataclass" in decorators:
        return "dataclass"

    # Tortoise model detection
    if _is_tortoise_model(bases):
        return "model"

    return "other"


def _is_tortoise_model(bases: list[str]) -> bool:
    return "Model" in {b.split(".")[-1] for b in bases}


def _call_chain_name(node: ast.Call) -> str | None:
    """Extract the full dotted call chain name, e.g. 'AuditEvent.filter'."""
    parts: list[str] = []
    current: ast.expr = node.func
    while True:
        if isinstance(current, ast.Name):
            parts.append(current.id)
            break
        if isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
        else:
            break
    if parts:
        parts.reverse()
        return ".".join(parts)
    return None


def _is_t_call(node: ast.Call) -> bool:
    """Check if node is a t(...) call (i18n translation function).

    Backend pattern: t(namespace, key, **kwargs) — two positional args.
    Frontend pattern: t('namespace:KEY') — one arg, colon-separated.
    """
    if isinstance(node.func, ast.Name) and node.func.id == "t":
        return True
    return False


def _t_call_info(node: ast.Call) -> dict[str, str]:
    """Extract i18n call info from a t() call.

    Returns dict with:
      - 'raw': full call representation
      - 'namespace': detected namespace (first arg or prefix before colon/dot)
      - 'key': detected key (second arg or suffix after colon/dot)
      - 'pattern': 'two_arg' | 'colon_sep' | 'dot_sep' | 'dynamic'
    """
    result: dict[str, str] = {"raw": "<dynamic>", "namespace": "", "key": "", "pattern": "dynamic"}
    if not node.args:
        return result

    # Two-arg pattern: t(namespace, key, **kwargs)
    if len(node.args) >= 2:
        ns = node.args[0]
        k = node.args[1]
        if isinstance(ns, ast.Constant) and isinstance(k, ast.Constant):
            result["namespace"] = str(ns.value)
            result["key"] = str(k.value)
            result["raw"] = f"t({str(ns.value)}, {str(k.value)})"
            result["pattern"] = "two_arg"
            return result

    # One-arg pattern: t("namespace:KEY") or t("namespace.key")
    if isinstance(node.args[0], ast.Constant):
        val = str(node.args[0].value)
        result["raw"] = f"t('{val}')"
        if ":" in val:
            ns, key = val.split(":", 1)
            result["namespace"] = ns
            result["key"] = key
            result["pattern"] = "colon_sep"
        elif "." in val:
            ns, key = val.split(".", 1)
            result["namespace"] = ns
            result["key"] = key
            result["pattern"] = "dot_sep"
        else:
            result["key"] = val
    return result


def _extract_raise(node: ast.Raise) -> dict | None:
    """Extract exception class and message from a raise statement."""
    if node.exc is None:
        return None
    if isinstance(node.exc, ast.Call):
        exc_name = _class_name(node.exc.func)
        kwargs: dict[str, str] = {}
        for kw in node.exc.keywords:
            if kw.arg is not None and isinstance(kw.value, ast.Constant):
                kwargs[kw.arg] = str(kw.value.value)
        return {"exception": exc_name, "kwargs": kwargs, "line": node.lineno}
    return None


def is_orm_call(call_name: str) -> bool:
    """Check if a dotted call name targets an ORM model method directly."""
    parts = call_name.split(".")
    if len(parts) >= 2:
        model_candidate = parts[0]
        method = parts[-1]
        return model_candidate in ORM_MODEL_CLASSES and method in ORM_METHODS
    return False


def index_modules(modules_dir: pathlib.Path | None = None) -> list[dict]:
    """Walk the modules tree and return raw symbol dicts for each .py file.

    Args:
        modules_dir: Path to src/modules/. Defaults to MODULES_DIR.

    Returns:
        List of symbol dicts (one per class/function of interest).
    """
    target = (modules_dir or MODULES_DIR).resolve()
    result: list[dict] = []
    for py_file in sorted(target.rglob("*.py")):
        if _is_test_file(py_file):
            continue
        rel = str(py_file.resolve().relative_to(REPO_ROOT))
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        visitor = _SymbolVisitor(rel)
        visitor.visit(tree)
        result.extend(visitor.symbols)
    return result


def index_files(file_paths: list[str]) -> list[dict]:
    """Index specific files (e.g., from a single module)."""
    result: list[dict] = []
    for fp in file_paths:
        p = pathlib.Path(fp)
        if not p.is_absolute():
            p = REPO_ROOT / fp
        if not p.exists():
            continue
        rel = str(p.relative_to(REPO_ROOT))
        try:
            tree = ast.parse(p.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        visitor = _SymbolVisitor(rel)
        visitor.visit(tree)
        result.extend(visitor.symbols)
    return result


def _is_test_file(p: pathlib.Path) -> bool:
    parts = p.parts
    return any("test" in part.lower() for part in parts) or p.name.startswith("test_") or p.name.endswith("_test.py")


def iter_module_files(module_name: str) -> Iterator[pathlib.Path]:
    """Yield .py files (excluding tests) for a single module."""
    module_dir = MODULES_DIR / module_name
    if not module_dir.is_dir():
        return
    for py_file in sorted(module_dir.rglob("*.py")):
        if not _is_test_file(py_file):
            yield py_file
