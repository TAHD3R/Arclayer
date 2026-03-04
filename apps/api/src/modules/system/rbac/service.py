from __future__ import annotations

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.modules.system.rbac.localization.service import RBACLocalizationMixin
from apps.api.src.modules.system.rbac.matrix.service import RBACMatrixMixin
from apps.api.src.modules.system.rbac.repository import RBACRepository
from apps.api.src.modules.system.rbac.roles.service import RBACRolesMixin
from apps.api.src.modules.system.rbac.workspaces.service import RBACWorkspacesMixin


class RBACService(
    RBACRolesMixin,
    RBACMatrixMixin,
    RBACWorkspacesMixin,
    RBACLocalizationMixin,
    BaseService,
):
    """
    Workspace-scoped RBAC service + global permission catalog sync.

    This service is a thin orchestrator composed from fractal subdomain mixins.
    """

    def __init__(
        self,
        settings: Settings,
        repo: RBACRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repo or RBACRepository()
