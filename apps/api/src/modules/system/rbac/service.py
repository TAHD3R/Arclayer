from __future__ import annotations

from src.config import Settings
from src.core.services import BaseService
from src.modules.system.rbac.localization.service import RBACLocalizationMixin
from src.modules.system.rbac.matrix.service import RBACMatrixMixin
from src.modules.system.rbac.repository import RBACRepository
from src.modules.system.rbac.roles.service import RBACRolesMixin
from src.modules.system.rbac.workspaces.service import RBACWorkspacesMixin


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
