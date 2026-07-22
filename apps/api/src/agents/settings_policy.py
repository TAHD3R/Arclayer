from __future__ import annotations

WRITE_SKILL_IDS = frozenset({"content.writer", "content.modeler"})
APPROVAL_POLICY_ALWAYS_APPROVE = "always_approve"
APPROVAL_POLICY_APPROVE_SCHEMA_ONLY = "approve_schema_only"

SUPPORTED_APPROVAL_POLICIES_BY_WRITE_SKILL = {
    "content.writer": frozenset({APPROVAL_POLICY_ALWAYS_APPROVE}),
    "content.modeler": frozenset({APPROVAL_POLICY_ALWAYS_APPROVE, APPROVAL_POLICY_APPROVE_SCHEMA_ONLY}),
}


def bool_setting(section: dict[str, object], key: str, default: bool) -> bool:
    value = section.get(key)
    return value if isinstance(value, bool) else default


def str_setting(section: dict[str, object], key: str, default: str) -> str:
    value = section.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else default


def read_skill_disabled_reason(section: dict[str, object]) -> str | None:
    if not bool_setting(section, "enabled", True):
        return "agents_disabled"
    return None


def write_skill_runtime_policy_disabled_reason(
    *,
    approval_policy: str,
    dry_run_required: bool,
    skill_id: str,
) -> str | None:
    if not dry_run_required:
        return "dry_run_required_disabled"
    supported_policies = SUPPORTED_APPROVAL_POLICIES_BY_WRITE_SKILL.get(skill_id)
    if supported_policies is None:
        return "approval_policy_unsupported"
    if approval_policy not in supported_policies:
        return "approval_policy_unsupported"
    return None


def write_skill_disabled_reason(section: dict[str, object], *, skill_id: str) -> str | None:
    reason = read_skill_disabled_reason(section)
    if reason is not None:
        return reason
    if not bool_setting(section, "write_tools_enabled", False):
        return "write_tools_disabled"
    return write_skill_runtime_policy_disabled_reason(
        approval_policy=str_setting(section, "approval_policy", APPROVAL_POLICY_ALWAYS_APPROVE),
        dry_run_required=bool_setting(section, "dry_run_required", True),
        skill_id=skill_id,
    )


def skill_disabled_reason(section: dict[str, object], *, skill_id: str) -> str | None:
    if skill_id in WRITE_SKILL_IDS:
        return write_skill_disabled_reason(section, skill_id=skill_id)
    return read_skill_disabled_reason(section)
