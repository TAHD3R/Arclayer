from __future__ import annotations

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.skills._enums import SkillVersionStatus
from src.modules.system.agents.definition_service import SUPPORTED_TOOL_GRANTS
from src.modules.workspaces.skills.manifest import SkillManifestV1, SkillToolRequirementV1


def require_installable_version(*, version_status: str) -> None:
    if version_status not in {SkillVersionStatus.VALID.value, SkillVersionStatus.WARNING.value}:
        raise Conflict(t("errors", "SKILL_VERSION_NOT_INSTALLABLE"), error="SKILL_VERSION_NOT_INSTALLABLE")


def require_declaration_acceptance_values(
    *,
    manifest: SkillManifestV1,
    accepted_required_tools: tuple[str, ...],
    accepted_permissions: tuple[str, ...],
    accepted_data_egress: tuple[str, ...],
) -> None:
    expected_tools = {item.tool_id for item in manifest.required_tools}
    expected_permissions = {item.action for item in manifest.permissions}
    expected_egress = {item.destination for item in manifest.data_egress}
    if (
        set(accepted_required_tools) != expected_tools
        or set(accepted_permissions) != expected_permissions
        or set(accepted_data_egress) != expected_egress
    ):
        raise Conflict(
            t("errors", "SKILL_DECLARATION_ACCEPTANCE_REQUIRED"),
            error="SKILL_DECLARATION_ACCEPTANCE_REQUIRED",
        )


def require_tools_available(required_tools: tuple[SkillToolRequirementV1, ...]) -> None:
    tool_ids = {item.tool_id for item in required_tools}
    if not tool_ids.issubset(SUPPORTED_TOOL_GRANTS):
        raise Conflict(t("errors", "SKILL_REQUIRED_TOOL_UNAVAILABLE"), error="SKILL_REQUIRED_TOOL_UNAVAILABLE")
