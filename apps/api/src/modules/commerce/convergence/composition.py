"""Explicit composition for Plan Access Convergence."""

from __future__ import annotations

from src.config import Settings
from src.modules.commerce.convergence.repository import TortoisePlanAccessConvergenceRepository
from src.modules.commerce.convergence.service import (
    FeatureAccessConvergenceParticipant,
    PlanAccessConvergenceService,
)
from src.modules.commerce.feature_access.composition import build_feature_access_convergence_participant
from src.modules.commerce.feature_access.convergence_outbox import TortoiseFeatureAccessConvergenceOutbox
from src.modules.commerce.free_workspace_allowance import build_free_workspace_allowance_authority
from src.modules.workspaces.authz.role_management import WorkspaceRoleAccessConvergenceParticipant


def compose_plan_access_convergence_service(
    settings: Settings,
    *,
    feature_access: FeatureAccessConvergenceParticipant,
) -> PlanAccessConvergenceService:
    """Compose explicit persistence and convergence participants."""

    return PlanAccessConvergenceService(
        repository=TortoisePlanAccessConvergenceRepository(settings),
        free_allowance=build_free_workspace_allowance_authority(),
        role_access=WorkspaceRoleAccessConvergenceParticipant(),
        feature_access=feature_access,
    )


def build_plan_access_convergence_service(settings: Settings) -> PlanAccessConvergenceService:
    return compose_plan_access_convergence_service(
        settings,
        feature_access=build_feature_access_convergence_participant(
            settings,
            outbox=TortoiseFeatureAccessConvergenceOutbox(),
        ),
    )
