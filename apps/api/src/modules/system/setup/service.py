from __future__ import annotations

import asyncio

from apps.api.src.common.services.base import BaseService
from apps.api.src.config import Settings
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.system.setup.access.service import SystemSetupAccessMixin
from apps.api.src.modules.system.setup.initialize.organization.service import SystemSetupOrganizationBootstrapMixin
from apps.api.src.modules.system.setup.initialize.service import SystemSetupInitializeMixin
from apps.api.src.modules.system.setup.initialize.workspace.service import SystemSetupWorkspaceBootstrapMixin
from apps.api.src.modules.system.setup.job.service import SystemSetupJobMixin
from apps.api.src.modules.system.setup.masterkey.service import SystemSetupMasterKeyMixin
from apps.api.src.modules.system.setup.reinitialize.service import SystemSetupReinitializeMixin
from apps.api.src.plugin.manager import PluginManager


class SystemSetupService(
    SystemSetupAccessMixin,
    SystemSetupJobMixin,
    SystemSetupMasterKeyMixin,
    SystemSetupReinitializeMixin,
    SystemSetupInitializeMixin,
    SystemSetupWorkspaceBootstrapMixin,
    SystemSetupOrganizationBootstrapMixin,
    BaseService,
):
    _background_tasks: set[asyncio.Task[None]] = set()

    def __init__(self, settings: Settings, *, manager: PluginManager) -> None:
        super().__init__(settings)
        self.manager = manager
        self.user_repo = UserRepository()
