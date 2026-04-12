from __future__ import annotations

from src.config import Settings
from src.modules.system.flags.schema import DeploymentMode, SystemFlagsOut


def build_system_flags(*, settings: Settings) -> SystemFlagsOut:
    """Derive system flags from environment configuration. Pure function, no I/O."""

    mode: DeploymentMode = settings.application.deployment_mode
    is_saas = mode == "saas"

    return SystemFlagsOut(
        deployment_mode=mode,
        multi_tenant=is_saas,
        custom_domain=is_saas,
        visual_editor=is_saas,
        deployment_settings=not is_saas,
        public_register=settings.auth.allow_public_register,
    )
