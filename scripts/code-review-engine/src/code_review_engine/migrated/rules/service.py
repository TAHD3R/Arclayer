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


class ServiceNoOptionalActivityPublish(AuditRule):
    """Compliance Activity events must not be optional best-effort fanout."""

    rule_id = "service.no-optional-activity-publish"
    description = "Compliance-critical Activity events must use required durable audit delivery, not optional publishing."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            if not _is_service_activity_symbol(sym):
                continue
            for call in sym["calls"]:
                name = call_name(call)
                if not _is_optional_activity_publish_call(name):
                    continue
                evidence = call_evidence(call)
                if not _is_activity_event_publish_evidence(name=name, evidence=evidence):
                    continue
                violations.append(
                    v(
                        file=sym["file"],
                        line=call_line(call, sym["line"]),
                        rule=self.rule_id,
                        message=(
                            f"Service '{sym['name']}' publishes Activity event through optional best-effort fanout"
                            f" in '{call_method(call) or '<class>'}'. Use required durable audit delivery."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=evidence,
                    )
                )
        return violations


class ServiceRequiredActivityCoverage(AuditRule):
    """Target Activity matrix mutations must include required Activity evidence."""

    rule_id = "service.required-activity-coverage"
    description = "Target mutation service methods must write required durable Activity evidence."

    def check(self, symbols: list[dict]) -> list[Violation]:
        violations: list[Violation] = []
        for sym in symbols:
            target_methods = _required_activity_target_methods(sym)
            if not target_methods:
                continue

            calls_by_method = _calls_by_method(sym)
            for method in sorted(target_methods):
                method_calls = calls_by_method.get(method, ())
                if not method_calls or not _has_mutation_call(method_calls):
                    continue
                if _has_required_activity_call(method_calls):
                    continue

                first_write = _first_mutation_call(method_calls)
                violations.append(
                    v(
                        file=sym["file"],
                        line=call_line(first_write, sym["line"]),
                        rule=self.rule_id,
                        message=(
                            f"Service '{sym['name']}' method '{method}' mutates a target Activity audit path"
                            " without required Activity evidence in the same method."
                        ),
                        severity=Severity.BLOCKER,
                        evidence=call_evidence(first_write),
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


def _is_service_activity_symbol(sym: dict) -> bool:
    if sym["kind"] == "service":
        return True
    file_path = str(sym["file"])
    name = str(sym["name"])
    return file_path.startswith(("apps/api/src/modules/", "apps/api/src/common/")) and file_path.endswith(
        "/service.py"
    ) and name.endswith("Mixin")


def _is_optional_activity_publish_call(name: str) -> bool:
    return name in {
        "self.publish_optional_domain_event",
        "publish_optional_domain_event",
        "self._publish_activity_event",
    }


def _is_activity_event_publish_evidence(*, name: str, evidence: str) -> bool:
    if name == "self._publish_activity_event":
        return True
    return _is_activity_event_evidence(evidence)


def _is_activity_event_evidence(evidence: str) -> bool:
    lowered = evidence.lower()
    return any(
        family in lowered
        for family in (
            "auth.",
            "organization.",
            "workspace.",
            "project.",
            "content.",
            "release.",
            "asset.",
            "system.",
            "permission.",
            "deployment.",
        )
    ) or any(
        constant in evidence
        for constant in (
            "ASSET_UPLOADED_EVENT",
            "SETTINGS_UPDATED",
        )
    )


def _required_activity_target_methods(sym: dict) -> frozenset[str]:
    file_path = str(sym["file"])
    name = str(sym["name"])
    if not file_path.startswith("apps/api/src/modules/"):
        return frozenset()
    if name.endswith("Mixin") or name.endswith("Service"):
        return _REQUIRED_ACTIVITY_TARGET_METHODS_BY_FILE.get(file_path, frozenset())
    return frozenset()


def _calls_by_method(sym: dict) -> dict[str, tuple[dict, ...]]:
    grouped: dict[str, list[dict]] = {}
    for call in sym["calls"]:
        if not isinstance(call, dict):
            continue
        method = call_method(call)
        if not method:
            continue
        grouped.setdefault(method, []).append(call)
    return {method: tuple(calls) for method, calls in grouped.items()}


def _has_mutation_call(calls: tuple[dict, ...]) -> bool:
    return any(_is_mutation_call(call_name(call)) for call in calls)


def _first_mutation_call(calls: tuple[dict, ...]) -> dict:
    for call in calls:
        if _is_mutation_call(call_name(call)):
            return call
    return calls[0]


def _is_mutation_call(name: str) -> bool:
    method = name.split(".")[-1]
    return method.startswith(_MUTATION_METHOD_PREFIXES) or method in _MUTATION_METHOD_NAMES


def _has_required_activity_call(calls: tuple[dict, ...]) -> bool:
    return any(_is_required_activity_call(call_name(call)) for call in calls)


def _is_required_activity_call(name: str) -> bool:
    method = name.split(".")[-1]
    return (
        method == "write_required_activity_event"
        or method == "_emit_settings_updated"
        or method == "_record_login_activity"
        or method == "create_workspace"
        or (method.startswith("_write_") and "activity_event" in method)
    )


_MUTATION_METHOD_PREFIXES = (
    "accept_",
    "activate_",
    "cancel_",
    "commit_",
    "complete",
    "confirm_",
    "create_",
    "delete_",
    "disable_",
    "enable_",
    "increment_",
    "init_",
    "invite_",
    "issue",
    "mark_",
    "move_",
    "patch_",
    "promote_",
    "publish_",
    "regenerate_",
    "remove_",
    "renew_",
    "replace_",
    "reset_",
    "restore_",
    "revoke",
    "rollback_",
    "rotate_",
    "save",
    "set_",
    "unlink_",
    "update_",
    "upsert",
)

_MUTATION_METHOD_NAMES = {
    "abort",
    "change_password",
    "complete",
    "delete_my_account",
    "forgot_password",
    "logout",
    "logout_all",
    "reset_password",
}

_REQUIRED_ACTIVITY_TARGET_METHODS_BY_FILE: dict[str, frozenset[str]] = {
    "apps/api/src/modules/assets/admin/assets/service.py": frozenset(
        {
            "create_folder",
            "delete_asset",
            "delete_folder",
            "move_asset",
            "update_asset",
            "update_folder",
        }
    ),
    "apps/api/src/modules/assets/admin/uploads/service.py": frozenset({"complete"}),
    "apps/api/src/modules/auth/invitations/acceptance/service.py": frozenset({"accept_invitation"}),
    "apps/api/src/modules/auth/oauth/social/service.py": frozenset({"_handle_account_linking", "unlink_identity"}),
    "apps/api/src/modules/auth/service.py": frozenset(
        {
            "_record_login_activity",
            "change_password",
            "confirm_remove_password",
            "delete_my_account",
            "forgot_password",
            "login",
            "logout",
            "logout_all",
            "reset_password",
            "set_password_for_current_user",
        }
    ),
    "apps/api/src/modules/auth/two_factor/service.py": frozenset(
        {"confirm_setup", "disable", "regenerate_backup_codes"}
    ),
    "apps/api/src/modules/organization/members/service.py": frozenset(
        {
            "invite_member",
            "remove_member",
            "update_member_role",
        }
    ),
    "apps/api/src/modules/organization/settings/service.py": frozenset({"delete_organization", "patch_core"}),
    "apps/api/src/modules/organization/workspaces/service.py": frozenset(
        {"create_workspace", "delete_workspace", "update_workspace"}
    ),
    "apps/api/src/modules/projects/api_keys/service.py": frozenset(
        {"create_project_site_key_out", "revoke_project_site_key_out", "rotate_project_site_key_out"}
    ),
    "apps/api/src/modules/projects/content/items/canonical_service.py": frozenset(
        {
            "create_content_item",
            "delete_content_item",
            "publish_content_item",
            "restore_content_item_version",
            "unpublish_content_item",
            "update_content_item",
        }
    ),
    "apps/api/src/modules/projects/content/models/canonical_service.py": frozenset(
        {"create_model", "delete_model", "update_model"}
    ),
    "apps/api/src/modules/projects/deployments/service.py": frozenset({"_promote_existing_deployment"}),
    "apps/api/src/modules/projects/publish/jobs/service.py": frozenset({"execute_scheduled_release"}),
    "apps/api/src/modules/projects/releases/service.py": frozenset({"publish_release_out", "rollback_release_out"}),
    "apps/api/src/modules/system/settings/service.py": frozenset({"patch_namespace"}),
    "apps/api/src/modules/workspaces/rbac/service.py": frozenset(
        {
            "create_custom_role",
            "delete_custom_role",
            "set_custom_role_permissions",
            "set_permission_custom_roles",
            "update_custom_role",
        }
    ),
    "apps/api/src/modules/workspaces/service.py": frozenset({"create_onboarding_workspace", "update_workspace"}),
    "apps/api/src/modules/workspaces/settings/service.py": frozenset({"patch_role_policy"}),
    "apps/api/src/modules/workspaces/team/invites/service.py": frozenset(
        {
            "create_invite_link",
            "create_or_update_email_invite",
            "disable_invite_link",
            "renew_email_invite",
            "renew_invite_link",
            "revoke_email_invite",
        }
    ),
    "apps/api/src/modules/workspaces/team/service.py": frozenset(
        {"reset_member_password", "set_member_roles", "set_member_status", "update_member_user"}
    ),
}
