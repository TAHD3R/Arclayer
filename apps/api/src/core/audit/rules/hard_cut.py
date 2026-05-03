"""Hard-cut enforcement rules — no facades, no shims, no dual patterns.

New architecture principle:
  - One canonical contract surface per domain boundary.
  - Remove old path when new path is introduced — no coexistence.
  - No thin facades, no forwarding layers, no compatibility shims.
  - No dual BaseRepository + TortoiseORMRepository patterns in same module.
"""

from __future__ import annotations

from src.core.audit.models import Severity, Violation
from src.core.audit.rules.base import AuditRule, v


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
