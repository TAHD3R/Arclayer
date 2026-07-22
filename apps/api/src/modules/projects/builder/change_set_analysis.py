from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderApprovalClass
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetAffectedTargetV1,
    BuilderChangeSetIssueV1,
    BuilderOperationV1,
    BuilderWireframeCandidateV1,
)
from src.modules.projects.builder.design_change_set_schema import BuilderDesignCandidateV1
from src.modules.projects.builder.global_section_schema import BuilderGlobalSectionDependencyGraphOut


class BuilderChangeSetAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    operations: tuple[BuilderOperationV1, ...]
    affected_targets: tuple[BuilderChangeSetAffectedTargetV1, ...]
    issues: tuple[BuilderChangeSetIssueV1, ...]
    required_permissions: tuple[str, ...]
    approval_class: BuilderApprovalClass
    summary_params: JsonObject
    wireframe_candidates: tuple[BuilderWireframeCandidateV1, ...] = ()
    design_candidates: tuple[BuilderDesignCandidateV1, ...] = ()
    global_section_graph: BuilderGlobalSectionDependencyGraphOut = Field(
        default_factory=BuilderGlobalSectionDependencyGraphOut
    )


def require_builder_change_set_not_blocked(analysis: BuilderChangeSetAnalysis) -> None:
    if any(issue.severity == "blocker" for issue in analysis.issues):
        raise Conflict(
            error="BUILDER_CHANGE_SET_BLOCKED",
            message=t("errors", "BUILDER_CHANGE_SET_BLOCKED"),
        )


__all__ = ["BuilderChangeSetAnalysis", "require_builder_change_set_not_blocked"]
