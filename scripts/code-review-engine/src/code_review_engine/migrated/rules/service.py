"""Service layer audit rules — new architecture target.

New architecture:
  - EntityManager is the universal write gateway for ALL modules.
  - Repository (TortoiseORMRepository) for all read operations.
  - Service orchestrates: calls Repository for reads, EntityManager for writes.
  - No direct ORM access from service — EVER.

Hard-cut: no service should call ORM models directly for reads OR writes.
"""

from __future__ import annotations

from code_review_engine.migrated.contracts import Severity, Violation
from code_review_engine.migrated.indexer import call_evidence, call_line, call_method, call_name, is_orm_call
from code_review_engine.migrated.rules.base import AuditRule, v


class ServiceNoDirectORM(AuditRule):
    """Services must not call ORM model methods directly.

    Read operations: use Repository (TortoiseORMRepository).
    Write operations: use EntityManager (universal write gateway).
    """

    rule_id = "service.no-direct-orm"
    description = "Service must never call ORM models directly. Use Repository for reads, EntityManager for writes."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "service":
                continue
            for call in sym["calls"]:
                name = call_name(call)
                if is_orm_call(name):
                    parts = name.split(".")
                    method = parts[-1] if len(parts) >= 2 else ""
                    if method in ("create", "update", "delete", "bulk_create", "save"):
                        suggestion = "EntityManager"
                    else:
                        suggestion = "Repository"
                    violations.append(
                        v(
                            file=sym["file"],
                            line=call_line(call, sym["line"]),
                            rule=self.rule_id,
                            message=f"Service '{sym['name']}' calls ORM directly: {name}. Use {suggestion} instead.",
                            severity=Severity.BLOCKER,
                            evidence=call_evidence(call),
                        )
                    )
        return violations


class ServiceMustExtendBaseService(AuditRule):
    """Production service classes must use the canonical BaseService contract."""

    rule_id = "service.must-extend-base-service"
    description = "Service classes must extend BaseService so settings, logger, tx, and domain events use one contract."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "service" or not _is_production_service(sym):
                continue
            if _extends_base_service(sym):
                continue
            violations.append(
                v(
                    file=sym["file"],
                    line=int(sym["line"]),
                    rule=self.rule_id,
                    message=f"Service '{sym['name']}' must extend BaseService.",
                    severity=Severity.BLOCKER,
                    evidence=f"class {sym['name']}({', '.join(sym.get('base_classes') or [])})",
                )
            )
        return violations


class ServiceNoDirectEventPublish(AuditRule):
    """Services must publish domain events through BaseService."""

    rule_id = "service.no-direct-event-publish"
    description = "Service methods must call BaseService publish_domain_event helpers instead of direct event bus publish."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "service":
                continue
            for call in sym["calls"]:
                name = call_name(call)
                if name not in {
                    "events.publish",
                    "events.publish_and_wait",
                    "event_bus.publish",
                    "event_bus.publish_and_wait",
                    "self.event_bus.publish",
                    "self.event_bus.publish_and_wait",
                }:
                    continue
                violations.append(
                    v(
                        file=sym["file"],
                        line=call_line(call, sym["line"]),
                        rule=self.rule_id,
                        message=(
                            f"Service '{sym['name']}' publishes events directly"
                            f" in '{call_method(call) or '<class>'}'. Use BaseService publish_domain_event helpers."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=call_evidence(call),
                    )
                )
        return violations


class ServiceNoMethodDependencyConstruction(AuditRule):
    """Service business methods must use injected dependencies and factories."""

    rule_id = "service.no-method-dependency-construction"
    description = "Service methods must not construct repositories, sibling services, or event buses directly."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "service":
                continue
            for call in sym["calls"]:
                method = call_method(call)
                if method in {"", "__init__"} or _is_approved_dependency_factory_method(method):
                    continue
                name = call_name(call)
                if not _is_service_dependency_constructor(name):
                    continue
                violations.append(
                    v(
                        file=sym["file"],
                        line=call_line(call, sym["line"]),
                        rule=self.rule_id,
                        message=(
                            f"Service '{sym['name']}' constructs dependency '{name}'"
                            f" inside method '{method}'. Use constructor or factory injection."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=call_evidence(call),
                    )
                )
        return violations


class ServiceNoDirectInTransaction(AuditRule):
    """Service methods must use BaseService transaction entry points."""

    rule_id = "service.no-direct-in-transaction"
    description = "Service methods must use BaseService.tx() or a documented tenant transaction helper, not in_transaction()."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if sym["kind"] != "service":
                continue
            if str(sym["name"]) == "BaseService":
                continue
            for call in sym["calls"]:
                if not _is_direct_in_transaction_call(call_name(call)):
                    continue
                violations.append(
                    v(
                        file=sym["file"],
                        line=call_line(call, sym["line"]),
                        rule=self.rule_id,
                        message=(
                            f"Service '{sym['name']}' starts transactions with in_transaction()"
                            f" in '{call_method(call) or '<class>'}'. Use BaseService.tx()"
                            " or a documented tenant transaction helper."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=call_evidence(call),
                    )
                )
        return violations


def _is_production_service(sym: dict) -> bool:
    file_path = str(sym["file"])
    if file_path.endswith("/http/service.py"):
        return False
    name = str(sym["name"])
    return name.endswith("Service") and file_path.startswith(("apps/api/src/modules/", "apps/api/src/common/"))


def _extends_base_service(sym: dict) -> bool:
    return "BaseService" in {str(base).split(".")[-1] for base in sym.get("base_classes") or []}


def _is_service_dependency_constructor(call: str) -> bool:
    name = call.split(".")[-1]
    return name.endswith(("Repository", "Service")) or name == "EventBus"


def _is_approved_dependency_factory_method(method: str) -> bool:
    return method.startswith("with_") or method.endswith("_factory") or method in {"_copy_repository"}


def _is_direct_in_transaction_call(call: str) -> bool:
    return call == "in_transaction" or call.endswith(".in_transaction")
