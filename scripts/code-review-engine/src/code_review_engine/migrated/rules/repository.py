"""Repository layer audit rules — new architecture target.

Target architecture:
  - core/repository/implementations/tortoise.py: TortoiseORMRepository[T] — THE canonical base.
  - common/repositories/base.py: BaseRepository — OLD pattern, must migrate.

Hard-cut rule: no dual BaseRepository + TortoiseORMRepository patterns in the same module.
One canonical path: TortoiseORMRepository.
"""

from __future__ import annotations

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.rules.base import AuditRule, v

# The canonical repository base — target architecture.
CANONICAL_REPO_BASE = "TortoiseORMRepository"
# Recognized but deprecated — must migrate to TortoiseORMRepository.
DEPRECATED_REPO_BASES = frozenset({"BaseRepository"})
# All recognized base classes (for detection).
RECOGNIZED_REPO_BASES = frozenset({
    "AbstractRepository",
    "TortoiseORMRepository",
    "BaseRepository",
    "TenantScopedRepository",
})
CANONICAL_REPO_CLASSES = frozenset({"AbstractRepository", "TortoiseORMRepository"})


class RepositoryMustExtendTortoiseORM(AuditRule):
    """Repository MUST extend TortoiseORMRepository — the new architecture canonical base.

    BaseRepository is the old pattern. All repositories must migrate to TortoiseORMRepository.
    """

    rule_id = "repository.must-extend-tortoise-orm"
    description = "Repository MUST inherit from TortoiseORMRepository (new architecture). BaseRepository is deprecated."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "repository":
                continue
            if sym["name"] in CANONICAL_REPO_CLASSES and sym["file"].startswith("apps/api/src/core/repository/"):
                continue
            parents = tuple(sym.get("base_classes") or ())
            parent = sym.get("parent_class", "")
            if not parents:
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=f"Repository '{sym['name']}' has no base class. Must extend TortoiseORMRepository.",
                        severity=Severity.BLOCKER,
                        evidence=f"class {sym['name']}: ...",
                    )
                )
                continue
            base_names = {base.split(".")[-1] for base in parents}
            deprecated_bases = sorted(base_names & DEPRECATED_REPO_BASES)
            if deprecated_bases:
                deprecated_base = deprecated_bases[0]
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=(
                            f"Repository '{sym['name']}' extends deprecated "
                            f"'{deprecated_base}'. Migrate to TortoiseORMRepository."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=f"class {sym['name']}({', '.join(parents)}): ...",
                    )
                )
            elif not base_names & RECOGNIZED_REPO_BASES:
                violations.append(
                    v(
                        file=sym["file"],
                        line=sym["line"],
                        rule=self.rule_id,
                        message=(
                            f"Repository '{sym['name']}' extends unrecognized bases "
                            f"'{', '.join(parents)}'. Must extend TortoiseORMRepository."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=f"class {sym['name']}({', '.join(parents)}): ...",
                    )
                )
        return violations


class RepositoryNoBusinessLogic(AuditRule):
    """Repositories must not contain business logic imports."""

    rule_id = "repository.no-business-logic"
    description = "Repository must not import service-layer or business-logic modules."
    BUSINESS_IMPORTS = frozenset({
        "src.common.services",
        "src.core.entity_manager",
        "src.core.lifecycles",
        "src.modules.*.service",
    })

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "repository":
                continue
            for imp in sym["imports"]:
                if any(imp.startswith(b) for b in self.BUSINESS_IMPORTS):
                    violations.append(
                        v(
                            file=sym["file"],
                            line=sym["line"],
                            rule=self.rule_id,
                            message=f"Repository '{sym['name']}' imports business logic: {imp}.",
                            severity=Severity.MAJOR,
                            evidence=imp,
                        )
                    )
        return violations
