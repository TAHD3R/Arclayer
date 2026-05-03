"""Frontend audit rules — derived from docs/guidelines/frontend-folder-architecture.md
and docs/guidelines/frontend-design.md.

For P1, these rules use regex-based pattern matching on TS/TSX files.
Full tree-sitter-typescript AST analysis is planned for P2.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


def _admin_root() -> Path:
    try:
        root = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], text=True, stderr=subprocess.DEVNULL
        ).strip()
        return Path(root) / "apps" / "admin" / "src"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Path("apps/admin/src")


def _ts_files(root: Path) -> list[Path]:
    """Yield TS/TSX files, excluding node_modules, dist, generated files."""
    exclude = {"node_modules", "dist", ".turbo", "build", "routeTree.gen.ts"}
    result = []
    for f in sorted(root.rglob("*.ts")):
        if f.name in exclude or any(e in f.parts for e in exclude):
            continue
        result.append(f)
    for f in sorted(root.rglob("*.tsx")):
        if f.name in exclude or any(e in f.parts for e in exclude):
            continue
        result.append(f)
    return sorted(set(result))


def _read_lines(p: Path) -> list[str]:
    try:
        return p.read_text(encoding="utf-8").splitlines()
    except (UnicodeDecodeError, OSError):
        return []


class FrontendNoAny(AuditRule):
    """No authored `any` in TypeScript source (per frontend-folder-architecture.md sec 10)."""

    rule_id = "frontend.no-any"
    description = "No `any` type in authored TypeScript files."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _admin_root()
        for f in _ts_files(root):
            if "test" in str(f) or f.name.endswith(".test.ts") or f.name.endswith(".test.tsx"):
                continue
            for i, line in enumerate(_read_lines(f), 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("*"):
                    continue
                if re.search(r"(?<!['\"])\bany\b(?!['\"])", line) and not stripped.startswith("import"):
                    # Skip lines where "any" appears only as a string value like value="any"
                    violations.append(
                        v(
                            file=str(f.relative_to(f.parents[2])),
                            line=i,
                            rule=self.rule_id,
                            message="Use of `any` in TypeScript source.",
                            severity=Severity.MAJOR,
                            evidence=stripped[:80],
                        )
                    )
        return violations


class FrontendRouteNoAPICalls(AuditRule):
    """Route files must not contain API calls (per frontend-folder-architecture.md sec 4.1)."""

    rule_id = "frontend.route-no-api-calls"
    description = "Route files (routes/**) must not contain API calls or React Query orchestration."
    API_PATTERNS = [
        re.compile(r"useQuery\b"),
        re.compile(r"useMutation\b"),
        re.compile(r"\bfetch\("),
        re.compile(r"api\.[a-zA-Z]"),
        re.compile(r"@tanstack/react-query"),
    ]

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _admin_root()
        routes_dir = root / "routes"
        if not routes_dir.is_dir():
            return violations
        for f in _ts_files(routes_dir):
            for i, line in enumerate(_read_lines(f), 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("import"):
                    continue
                for pat in self.API_PATTERNS:
                    if pat.search(stripped):
                        violations.append(
                            v(
                                file=str(f.relative_to(f.parents[2])),
                                line=i,
                                rule=self.rule_id,
                                message=f"Route file contains API/data-fetching logic: {stripped[:60]}",
                                severity=Severity.MAJOR,
                                evidence=stripped[:80],
                            )
                        )
                        break  # One violation per line
        return violations


class FrontendDataMustUseReactQuery(AuditRule):
    """Data fetching must use React Query (Tanstack Query), not raw fetch/axios.

    Per frontend-folder-architecture.md sec 6.3: "Components and pages should not
    scatter raw fetch logic."
    """

    rule_id = "frontend.data-must-use-react-query"
    description = "Data fetching must go through React Query + typed API layer, not raw fetch()."
    RAW_FETCH_RE = re.compile(r"\bfetch\(")

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _admin_root()
        # Check pages/ and components/ for raw fetch
        for subdir in ("pages", "components"):
            d = root / subdir
            if not d.is_dir():
                continue
            for f in _ts_files(d):
                if "test" in str(f):
                    continue
                for i, line in enumerate(_read_lines(f), 1):
                    stripped = line.strip()
                    if stripped.startswith("//") or stripped.startswith("import"):
                        continue
                    if self.RAW_FETCH_RE.search(stripped):
                        violations.append(
                            v(
                                file=str(f.relative_to(f.parents[2])),
                                line=i,
                                rule=self.rule_id,
                                message="Raw fetch() in UI layer. Use React Query + typed API wrapper.",
                                severity=Severity.MAJOR,
                                evidence=stripped[:80],
                            )
                        )
        return violations


class FrontendPageStructureRule(AuditRule):
    """Page directories should follow the canonical structure from the guideline.

    Per frontend-folder-architecture.md sec 5.4: each page dir should have
    page.tsx, and optionally components/, hooks/, types.ts, utils.ts, constants.ts.
    """

    rule_id = "frontend.page-structure"
    description = "Page directories must have a page.tsx entry (per frontend-folder-architecture.md sec 5.3)."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        root = _admin_root()
        pages_dir = root / "pages"
        if not pages_dir.is_dir():
            return violations
        # Walk leaf page dirs (those with no sub-page-dirs)
        for d in sorted(pages_dir.rglob("*")):
            if not d.is_dir():
                continue
            # Check if this looks like a page directory
            tsx_files = list(d.glob("*.tsx"))
            has_page = any(f.name == "page.tsx" for f in tsx_files)
            has_index = any(f.name == "index.tsx" for f in tsx_files)
            if not has_page and not has_index and tsx_files:
                violations.append(
                    v(
                        file=str(d.relative_to(d.parents[2])),
                        line=0,
                        rule=self.rule_id,
                        message=f"Page directory '{d.name}' has .tsx files but no page.tsx or index.tsx entry.",
                        severity=Severity.MINOR,
                        evidence=f"Files: {[f.name for f in tsx_files]}",
                    )
                )
        return violations
