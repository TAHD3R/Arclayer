"""AST-based Python indexer migrated from apps/api core audit."""

from __future__ import annotations

import ast
import pathlib
import subprocess
from typing import TYPE_CHECKING

from code_review_engine.migrated.runtime import get_repo_root_from_env

if TYPE_CHECKING:
    from collections.abc import Iterator


def _repo_root() -> pathlib.Path:
    env_root = get_repo_root_from_env()
    if env_root is not None:
        return env_root
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


ORM_MODEL_CLASSES = frozenset(
    {
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
    }
)

ORM_METHODS = frozenset(
    {
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
    }
)

SERVICE_BASE_NAMES = frozenset({"BaseService", "Service"})
REPO_BASE_NAMES = frozenset({
    "AbstractRepository",
    "TortoiseORMRepository",
    "BaseRepository",
    "Repository",
    "RuntimeRepositoryMixin",
    "SettingsRepositoryMixin",
    "TwoFactorRepositoryLike",
})
SCHEMA_BASE_NAMES = frozenset({"BaseModel", "BaseSchema", "BaseOut", "BaseIn"})


class _SymbolVisitor(ast.NodeVisitor):
    """Walks an AST module and collects symbol metadata."""

    def __init__(self, filepath: str) -> None:
        self.filepath = filepath
        self.symbols: list[dict] = []
        self._current_class: str | None = None
        self._import_names: set[str] = set()

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        for alias in node.names:
            self._import_names.add(alias.name)
            if module in {"src.common.repositories", "src.common.repositories.base"} and alias.name == "BaseRepository":
                self.symbols.append(
                    {
                        "name": "BaseRepository",
                        "kind": "repository_legacy_import",
                        "file": self.filepath,
                        "line": node.lineno,
                        "parent_class": None,
                        "base_classes": [],
                        "decorators": [],
                        "imports": sorted(self._import_names),
                        "type_annotations": {},
                        "calls": [],
                        "t_calls": [],
                        "raises": [],
                        "body_lines": (node.lineno, node.lineno),
                        "evidence": f"from {module} import {alias.name}",
                    }
                )

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self._import_names.add(alias.name)
            if alias.name == "src.common.repositories.base":
                self.symbols.append(
                    {
                        "name": "src.common.repositories.base",
                        "kind": "repository_legacy_import",
                        "file": self.filepath,
                        "line": node.lineno,
                        "parent_class": None,
                        "base_classes": [],
                        "decorators": [],
                        "imports": sorted(self._import_names),
                        "type_annotations": {},
                        "calls": [],
                        "t_calls": [],
                        "raises": [],
                        "body_lines": (node.lineno, node.lineno),
                        "evidence": f"import {alias.name}",
                    }
                )

    def visit_Assign(self, node: ast.Assign) -> None:
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "BaseRepository":
                value_name = _class_name(node.value).split(".")[-1]
                if value_name == "TortoiseORMRepository":
                    self.symbols.append(
                        {
                            "name": "BaseRepository",
                            "kind": "repository_compat_alias",
                            "file": self.filepath,
                            "line": node.lineno,
                            "parent_class": None,
                            "base_classes": [],
                            "decorators": [],
                            "imports": sorted(self._import_names),
                            "type_annotations": {},
                            "calls": [],
                            "t_calls": [],
                            "raises": [],
                            "body_lines": (node.lineno, node.lineno),
                            "evidence": "BaseRepository = TortoiseORMRepository",
                        }
                    )
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        bases = [_class_name(b) for b in node.bases]
        decorator_names = [_decorator_name(d) for d in node.decorator_list]
        kind = _classify_class(node.name, bases, decorator_names)

        calls: list[dict] = []
        t_calls: list[dict] = []
        raises: list[dict] = []
        for child in node.body:
            method_name = child.name if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef) else ""
            for descendant in ast.walk(child):
                if isinstance(descendant, ast.Call):
                    call_name = _call_chain_name(descendant)
                    if call_name:
                        calls.append(
                            {
                                "name": call_name,
                                "line": descendant.lineno,
                                "method": method_name,
                                "evidence": ast.unparse(descendant)[:160],
                            }
                        )
                    if _is_t_call(descendant):
                        t_calls.append(_t_call_info(descendant))
                if isinstance(descendant, ast.Raise):
                    exc_info = _extract_raise(descendant)
                    if exc_info:
                        raises.append(exc_info)

        annotations: dict[str, dict] = {}
        for stmt in node.body:
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                field_type = ast.unparse(stmt.annotation) if stmt.annotation else "Any"
                annotations[stmt.target.id] = {
                    "type": field_type,
                    "line": stmt.lineno,
                    "evidence": f"{stmt.target.id}: {field_type}",
                }

        prev_class = self._current_class
        self._current_class = node.name

        symbol = {
            "name": node.name,
            "kind": kind,
            "file": self.filepath,
            "line": node.lineno,
            "parent_class": _class_name(node.bases[0]) if node.bases else None,
            "base_classes": bases,
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
    if isinstance(expr, ast.Subscript):
        return _class_name(expr.value)
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
    name_lower = name.lower()
    base_names = {b.split(".")[-1] for b in bases}

    if "EntityManager" in name:
        return "entity_manager"
    if name_lower.endswith("repository") or name_lower.endswith("repositorymixin") or base_names & REPO_BASE_NAMES:
        return "repository"
    if base_names & SCHEMA_BASE_NAMES:
        return "schema"
    if name_lower.endswith("service") or base_names & SERVICE_BASE_NAMES:
        return "service"
    if "dataclass" in decorators:
        return "dataclass"
    if _is_tortoise_model(bases):
        return "model"
    return "other"


def _is_tortoise_model(bases: list[str]) -> bool:
    return "Model" in {b.split(".")[-1] for b in bases}


def _call_chain_name(node: ast.Call) -> str | None:
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
    if not parts:
        return None
    parts.reverse()
    return ".".join(parts)


def _is_t_call(node: ast.Call) -> bool:
    return isinstance(node.func, ast.Name) and node.func.id == "t"


def _t_call_info(node: ast.Call) -> dict[str, str | int]:
    result: dict[str, str | int] = {
        "raw": "<dynamic>",
        "namespace": "",
        "key": "",
        "pattern": "dynamic",
        "line": node.lineno,
    }
    if not node.args:
        return result

    if len(node.args) >= 2:
        ns = node.args[0]
        key_node = node.args[1]
        if isinstance(ns, ast.Constant):
            result["namespace"] = str(ns.value)
            result["raw"] = f"t({str(ns.value)}, <dynamic>)"
            result["pattern"] = "two_arg_dynamic"
            if isinstance(key_node, ast.Constant):
                result["key"] = str(key_node.value)
                result["raw"] = f"t({str(ns.value)}, {str(key_node.value)})"
                result["pattern"] = "two_arg"
            return result

    first_arg = node.args[0]
    if isinstance(first_arg, ast.Constant):
        val = str(first_arg.value)
        result["raw"] = f"t('{val}')"
        if ":" in val:
            namespace, key = val.split(":", 1)
            result["namespace"] = namespace
            result["key"] = key
            result["pattern"] = "colon_sep"
        elif "." in val:
            namespace, key = val.split(".", 1)
            result["namespace"] = namespace
            result["key"] = key
            result["pattern"] = "dot_sep"
        else:
            result["key"] = val
    return result


def _extract_raise(node: ast.Raise) -> dict | None:
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
    parts = call_name.split(".")
    if len(parts) < 2:
        return False
    model_candidate = parts[0]
    method = parts[-1]
    return model_candidate in ORM_MODEL_CLASSES and method in ORM_METHODS


def call_name(call: str | dict) -> str:
    if isinstance(call, dict):
        return str(call.get("name", ""))
    return call


def call_line(call: str | dict, fallback: int) -> int:
    if isinstance(call, dict):
        return int(call.get("line") or fallback)
    return fallback


def call_evidence(call: str | dict) -> str:
    if isinstance(call, dict):
        return str(call.get("evidence") or call.get("name") or "")
    return call


def call_method(call: str | dict) -> str:
    if isinstance(call, dict):
        return str(call.get("method") or "")
    return ""


def annotation_type(annotation: str | dict) -> str:
    if isinstance(annotation, dict):
        return str(annotation.get("type", ""))
    return annotation


def annotation_line(annotation: str | dict, fallback: int) -> int:
    if isinstance(annotation, dict):
        return int(annotation.get("line") or fallback)
    return fallback


def annotation_evidence(name: str, annotation: str | dict) -> str:
    if isinstance(annotation, dict):
        return str(annotation.get("evidence") or f"{name}: {annotation.get('type', '')}")
    return f"{name}: {annotation}"


def index_modules(modules_dir: pathlib.Path | None = None) -> list[dict]:
    repo_root = _repo_root()
    target = (modules_dir or (repo_root / "apps" / "api" / "src" / "modules")).resolve()
    if not target.is_dir():
        return []

    result: list[dict] = []
    for py_file in sorted(target.rglob("*.py")):
        if _is_test_file(py_file):
            continue
        rel = str(py_file.resolve().relative_to(repo_root))
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            continue
        visitor = _SymbolVisitor(rel)
        visitor.visit(tree)
        result.extend(visitor.symbols)
    return result


def index_roots(roots: list[pathlib.Path]) -> list[dict]:
    repo_root = _repo_root()
    result: list[dict] = []
    for root in roots:
        target = root if root.is_absolute() else repo_root / root
        if not target.exists():
            continue
        files = [target] if target.is_file() else sorted(target.rglob("*.py"))
        for py_file in files:
            if py_file.suffix != ".py" or _is_test_file(py_file):
                continue
            rel = str(py_file.resolve().relative_to(repo_root))
            try:
                tree = ast.parse(py_file.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):
                continue
            visitor = _SymbolVisitor(rel)
            visitor.visit(tree)
            result.extend(visitor.symbols)
    return result


def index_files(file_paths: list[str]) -> list[dict]:
    repo_root = _repo_root()
    result: list[dict] = []
    for fp in file_paths:
        p = pathlib.Path(fp)
        if not p.is_absolute():
            p = repo_root / fp
        if not p.exists():
            continue
        rel = str(p.relative_to(repo_root))
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
    return any(part.lower() in {"test", "tests"} for part in parts) or p.name.startswith("test_") or p.name.endswith("_test.py")


def iter_module_files(module_name: str) -> Iterator[pathlib.Path]:
    repo_root = _repo_root()
    module_dir = repo_root / "apps" / "api" / "src" / "modules" / module_name
    if not module_dir.is_dir():
        return
    for py_file in sorted(module_dir.rglob("*.py")):
        if not _is_test_file(py_file):
            yield py_file
