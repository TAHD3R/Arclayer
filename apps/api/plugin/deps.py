from __future__ import annotations

from tortoise.exceptions import OperationalError

from apps.api.core.exceptions import Forbidden
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.modules.organization.runtime import get_single_organization_id
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.workspaces.context import get_current_workspace_id
from apps.api.plugin.types import PluginStatus

logger = get_logger(__name__)
_PLUGIN_STATE_LOAD_ERRORS = (ImportError, OperationalError, RuntimeError, ValueError, TypeError)


def require_plugin_enabled(plugin_id: str, *, management_scope: str = "workspace"):
    async def _dependency() -> None:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None or record.status != PluginStatus.STARTED:
            raise Forbidden(
                message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                error="PLUGIN_DISABLED",
            )

        normalized_scope = (management_scope or "workspace").strip().lower()
        if normalized_scope == "organization":
            organization_id = await get_single_organization_id()
            if organization_id is None:
                raise Forbidden(
                    message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                    error="PLUGIN_DISABLED",
                )
            try:
                from apps.api.modules.organization.models.org_plugin_state import OrganizationPluginState

                state = await OrganizationPluginState.get_or_none(organization_id=organization_id, plugin_id=plugin_id)
                if state is None or not bool(state.enabled):
                    raise Forbidden(
                        message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                        error="PLUGIN_DISABLED",
                    )
            except Forbidden:
                raise
            except _PLUGIN_STATE_LOAD_ERRORS as exc:
                logger.warning(
                    "Organization plugin state check failed",
                    action="check_org_plugin_state",
                    plugin_id=plugin_id,
                    organization_id=str(organization_id),
                    error=str(exc),
                )
                raise Forbidden(
                    message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                    error="PLUGIN_DISABLED",
                )
            return

        # If request has a workspace context, also enforce workspace-level toggle.
        workspace_id = get_current_workspace_id()
        if workspace_id is None:
            return
        try:
            from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState

            state = await WorkspacePluginState.get_or_none(workspace_id=workspace_id, plugin_id=plugin_id)
            if state is None or not bool(state.enabled):
                raise Forbidden(
                    message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                    error="PLUGIN_DISABLED",
                )
        except Forbidden:
            raise
        except _PLUGIN_STATE_LOAD_ERRORS as exc:
            # Fail closed: if state cannot be loaded, block plugin routes for safety.
            logger.warning(
                "Workspace plugin state check failed",
                action="check_workspace_plugin_state",
                plugin_id=plugin_id,
                workspace_id=str(workspace_id),
                error=str(exc),
            )
            raise Forbidden(
                message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                error="PLUGIN_DISABLED",
            )

    return _dependency
