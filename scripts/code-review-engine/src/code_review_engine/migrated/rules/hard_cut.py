"""Hard-cut enforcement rules — no facades, no shims, no dual patterns.

New architecture principle:
  - One canonical contract surface per domain boundary.
  - Remove old path when new path is introduced — no coexistence.
  - No thin facades, no forwarding layers, no compatibility shims.
  - No dual BaseRepository + TortoiseORMRepository patterns in same module.
"""

from __future__ import annotations

import re
from pathlib import Path

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v
from code_review_engine.migrated.runtime import get_repo_root_from_env


def _repo_root() -> Path:
    root = get_repo_root_from_env()
    if root is None:
        return Path(".")
    return root


def _read_lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return []


def _relative_file(path: Path) -> str:
    try:
        return str(path.relative_to(_repo_root()))
    except ValueError:
        return str(path)


class NoDualRepositoryPattern(AuditRule):
    """Module must not mix old (BaseRepository) and new (TortoiseORMRepository) patterns.

    Hard-cut: pick the canonical path and remove the old one.
    """

    rule_id = "hard-cut.no-dual-repo-pattern"
    description = "Module must not have both BaseRepository (old) and TortoiseORMRepository (new) patterns. Pick one and cut the other."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        # Group repository symbols by module directory
        by_module: dict[str, list[dict]] = {}
        for sym in symbols:
            if sym["kind"] != "repository":
                continue
            # Extract module: apps/api/src/modules/<name>/
            parts = sym["file"].split("/")
            if "modules" in parts:
                idx = parts.index("modules")
                module_key = "/".join(parts[: idx + 2])  # up to module name
            else:
                module_key = "/".join(parts[:3])
            by_module.setdefault(module_key, []).append(sym)

        for module_key, repos in by_module.items():
            has_base_repo = False
            has_tortoise_repo = False
            for r in repos:
                parent_raw = r.get("parent_class") or ""
                parent = parent_raw.split(".")[-1] if parent_raw else ""
                if parent == "BaseRepository":
                    has_base_repo = True
                elif parent == "TortoiseORMRepository":
                    has_tortoise_repo = True
            if has_base_repo and has_tortoise_repo:
                violations.append(
                    v(
                        file=module_key + "/",
                        line=0,
                        rule=self.rule_id,
                        message="Module has dual repository pattern: both BaseRepository (old) and TortoiseORMRepository (new). Hard-cut the old path.",
                        severity=Severity.BLOCKER,
                        evidence=f"Dual pattern in {module_key}",
                    )
                )
        return violations


class NoShimFacadePattern(AuditRule):
    """Flag shim, facade, and forwarding patterns between old and new architecture.

    Detects:
      - 'compat' or 'shim' or 'adapter' in module/class names (often used for dual-track)
      - Thin forwarding classes that just delegate to another implementation
    """

    rule_id = "hard-cut.no-shim-facade"
    description = "No shim, facade, adapter, or compat layers between old and new architecture patterns."
    SHIM_KEYWORDS = frozenset({"shim", "adapter", "compat", "bridge", "facade"})

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            name_lower = sym["name"].lower()
            file_lower = sym["file"].lower()
            for kw in self.SHIM_KEYWORDS:
                if kw in name_lower or kw in file_lower:
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"'{sym['name']}' contains shim/facade keyword '{kw}'. Hard-cut: remove the old path, do not bridge.",
                            severity=Severity.BLOCKER,
                            evidence=f"class {sym['name']} (keyword: {kw})",
                        )
                    )
        return violations


class OpenApiSingleSourceRule(AuditRule):
    """Forbid resurrecting the removed contracts package or Admin generated-type facades."""

    rule_id = "hard-cut.openapi-single-source"
    description = "`packages/openapi` is the only backend API boundary type source."
    MANIFEST_RE = re.compile(r'"@arclayer/contracts"\s*:')
    SOURCE_IMPORT_RE = re.compile(r"from\s+['\"]@arclayer/contracts['\"]|import\s+['\"]@arclayer/contracts['\"]")
    ADMIN_OPENAPI_BARREL_RE = re.compile(
        r"export\s+(?:\*\s+from|type\s+[\s\S]*?\s+from)\s+['\"]@arclayer/openapi(?:/admin-types)?['\"]"
    )
    ADMIN_OPENAPI_IMPORT_BLOCK_RE = re.compile(
        r"import\s+type\s+\{(?P<body>[\s\S]*?)\}\s+from\s+['\"]@arclayer/openapi/admin-types['\"]"
    )
    ADMIN_LOCAL_GENERATED_ALIAS_RE = re.compile(
        r"^\s*export\s+type\s+\w+\s*=\s*(?P<target>\w+)\s*;?\s*$"
    )
    ADMIN_SERVER_SHAPE_RE = re.compile(
        r"\b(?:export\s+)?interface\s+\w+(?:Request|Response)\b|\b(?:export\s+)?type\s+\w+(?:Request|Response)\s*=\s*\{"
    )
    SKIP_DIR_PARTS = frozenset(("node_modules", "dist", "build", ".turbo", "src/generated"))
    TEST_DIR_PARTS = frozenset(("tests", "__tests__", "__mocks__", "fixtures"))
    TEST_FILE_SUFFIXES = (
        ".test.ts",
        ".test.tsx",
        ".test.js",
        ".test.jsx",
        ".spec.ts",
        ".spec.tsx",
        ".spec.js",
        ".spec.jsx",
    )

    @classmethod
    def _is_test_source(cls, file_path: Path) -> bool:
        if any(part in cls.TEST_DIR_PARTS for part in file_path.parts):
            return True
        return file_path.name.endswith(cls.TEST_FILE_SUFFIXES)

    @classmethod
    def _is_ignored_source(cls, file_path: Path) -> bool:
        return any(part in cls.SKIP_DIR_PARTS for part in file_path.parts) or cls._is_test_source(file_path)

    @classmethod
    def _openapi_admin_type_import_names(cls, text: str) -> set[str]:
        imported_names: set[str] = set()
        for match in cls.ADMIN_OPENAPI_IMPORT_BLOCK_RE.finditer(text):
            for item in match.group("body").split(","):
                trimmed = item.strip()
                if not trimmed:
                    continue
                alias_parts = re.split(r"\s+as\s+", trimmed)
                imported_names.add(alias_parts[-1].strip())
        return imported_names

    def check(self, symbols: list[dict]) -> list[Violation]:
        root = _repo_root()
        violations: list[Violation] = []

        contracts_dir = root / "packages" / "contracts"
        if contracts_dir.exists():
            violations.append(
                v(
                    file="packages/contracts",
                    line=0,
                    rule=self.rule_id,
                    message="packages/contracts is forbidden. Backend API boundary types must come from packages/openapi.",
                    severity=Severity.BLOCKER,
                    evidence="packages/contracts exists",
                )
            )

        for package_file in sorted(root.rglob("package.json")):
            if any(part in package_file.parts for part in ("node_modules", "dist", "build", ".turbo")):
                continue
            for line_number, line in enumerate(_read_lines(package_file), 1):
                if self.MANIFEST_RE.search(line):
                    violations.append(
                        v(
                            file=_relative_file(package_file),
                            line=line_number,
                            rule=self.rule_id,
                            message="@arclayer/contracts dependency is forbidden. Depend on @arclayer/openapi directly.",
                            severity=Severity.BLOCKER,
                            evidence=line.strip(),
                        )
                    )

        for source_root in (root / "apps", root / "packages"):
            if not source_root.exists():
                continue
            for source_file in sorted(source_root.rglob("*")):
                if not source_file.suffix in {".ts", ".tsx", ".js", ".jsx"}:
                    continue
                if self._is_ignored_source(source_file):
                    continue
                for line_number, line in enumerate(_read_lines(source_file), 1):
                    if self.SOURCE_IMPORT_RE.search(line):
                        violations.append(
                            v(
                                file=_relative_file(source_file),
                                line=line_number,
                                rule=self.rule_id,
                                message="@arclayer/contracts imports are forbidden. Import generated types from @arclayer/openapi.",
                                severity=Severity.BLOCKER,
                                evidence=line.strip(),
                            )
                        )

        admin_api_barrel = root / "apps" / "admin" / "src" / "types" / "api" / "index.ts"
        text = "\n".join(_read_lines(admin_api_barrel))
        if text and self.ADMIN_OPENAPI_BARREL_RE.search(text):
            violations.append(
                v(
                    file=_relative_file(admin_api_barrel),
                    line=0,
                    rule=self.rule_id,
                    message="Admin API type barrel must not re-export generated backend API boundary types.",
                    severity=Severity.BLOCKER,
                    evidence="@arclayer/openapi re-export",
                )
            )

        admin_api_dir = root / "apps" / "admin" / "src" / "types" / "api"
        if admin_api_dir.exists():
            for source_file in sorted(admin_api_dir.rglob("*.ts")):
                lines = _read_lines(source_file)
                imported_openapi_names = self._openapi_admin_type_import_names("\n".join(lines))
                for line_number, line in enumerate(lines, 1):
                    alias_match = self.ADMIN_LOCAL_GENERATED_ALIAS_RE.search(line)
                    if alias_match and alias_match.group("target") in imported_openapi_names:
                        violations.append(
                            v(
                                file=_relative_file(source_file),
                                line=line_number,
                                rule=self.rule_id,
                                message="Admin src/types/api must not alias generated backend API boundary types. Import from @arclayer/openapi/admin-types directly at the consumer.",
                                severity=Severity.BLOCKER,
                                evidence=line.strip(),
                            )
                        )
                    if self.ADMIN_SERVER_SHAPE_RE.search(line):
                        violations.append(
                            v(
                                file=_relative_file(source_file),
                                line=line_number,
                                rule=self.rule_id,
                                message="Admin src/types/api must not define backend Request/Response shapes. Use generated OpenAPI types or UI-only ViewModel/Row/FormState types.",
                                severity=Severity.MAJOR,
                                evidence=line.strip(),
                            )
                        )

        return violations
