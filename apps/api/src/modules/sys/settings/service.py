from __future__ import annotations

from apps.api.src.common.services.base import BaseService
from apps.api.src.config import Settings
from apps.api.src.modules.sys.settings.activation.service import SysConfigActivationMixin
from apps.api.src.modules.sys.settings.checks.core.service import SysConfigChecksCoreMixin
from apps.api.src.modules.sys.settings.checks.policy.service import SysConfigChecksPolicyMixin
from apps.api.src.modules.sys.settings.repository import SysConfigRepository
from apps.api.src.modules.sys.settings.revisions.service import SysConfigRevisionsMixin


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
