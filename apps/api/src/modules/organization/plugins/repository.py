from __future__ import annotations

from uuid import UUID

from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.models.organization.org_plugin_state import OrganizationPluginState


class OrganizationPluginRepository(BaseRepository):
    async def list_states(self, *, organization_id: UUID) -> list[OrganizationPluginState]:
        return await OrganizationPluginState.filter(organization_id=organization_id).all()

    async def get_state(self, *, organization_id: UUID, plugin_id: str) -> OrganizationPluginState | None:
        return await OrganizationPluginState.get_or_none(organization_id=organization_id, plugin_id=plugin_id)

    async def set_enabled(self, *, organization_id: UUID, plugin_id: str, enabled: bool) -> OrganizationPluginState:
        row = await OrganizationPluginState.get_or_none(organization_id=organization_id, plugin_id=plugin_id)
        if row is None:
            row = await OrganizationPluginState.create(
                organization_id=organization_id,
                plugin_id=plugin_id,
                enabled=enabled,
            )
            return row
        row.enabled = enabled
        await row.save(update_fields=["enabled"])
        return row

    async def clear_state(self, *, organization_id: UUID, plugin_id: str) -> None:
        await OrganizationPluginState.filter(organization_id=organization_id, plugin_id=plugin_id).delete()
