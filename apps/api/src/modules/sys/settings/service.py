from __future__ import annotations

from src.common.services.base import BaseService
from src.config import Settings
from src.modules.sys.settings.activation.service import SysConfigActivationMixin
from src.modules.sys.settings.checks.core.service import SysConfigChecksCoreMixin
from src.modules.sys.settings.checks.policy.service import SysConfigChecksPolicyMixin
from src.modules.sys.settings.repository import SysConfigRepository
from src.modules.sys.settings.revisions.service import SysConfigRevisionsMixin


class SysConfigService(
    SysConfigActivationMixin,
    SysConfigChecksCoreMixin,
    SysConfigChecksPolicyMixin,
    SysConfigRevisionsMixin,
    BaseService,
):
    """
    Sys-domain configuration service (super admin only).

    Implementation is split across subdomains to enforce file size limits and
    recursive fractal decomposition.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = SysConfigRepository()
