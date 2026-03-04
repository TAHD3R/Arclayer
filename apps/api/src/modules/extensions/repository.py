from __future__ import annotations

from uuid import UUID

from apps.api.src.common.repositories import BaseRepository
from apps.api.src.models.extensions.app import ExtensionApp


class ExtensionsRepository(BaseRepository):
    async def list_apps(self) -> list[ExtensionApp]:
        return await ExtensionApp.all().order_by("created_at").all()

    async def get_app_by_id(self, *, app_id: str) -> ExtensionApp | None:
        return await ExtensionApp.get_or_none(app_id=app_id)

    async def create_app(
        self,
        *,
        app_id: str,
        provider: str,
        name: str,
        description: str | None,
        version: str | None,
        manifest: dict | None,
        base_url: str | None,
    ) -> ExtensionApp:
        return await ExtensionApp.create(
            app_id=app_id,
            provider=provider,
            name=name,
            description=description,
            version=version,
            manifest=manifest,
            base_url=base_url,
        )

    async def list_workspace_enabled_capability_ids(self, *, workspace_id: UUID) -> set[str]:
        from apps.api.src.models.extensions.workspace_capability_state import WorkspaceCapabilityState

        rows = await WorkspaceCapabilityState.filter(workspace_id=workspace_id, enabled=True).values_list(
            "capability_id", flat=True
        )
        return {str(x) for x in rows if x}

    async def set_workspace_capability_enabled(
        self,
        *,
        workspace_id: UUID,
        capability_id: str,
        enabled: bool,
    ) -> None:
        from apps.api.src.models.extensions.workspace_capability_state import WorkspaceCapabilityState

        cid = capability_id.strip()
        if not cid:
            raise ValueError("capability_id is required")
        row = await WorkspaceCapabilityState.get_or_none(workspace_id=workspace_id, capability_id=cid)
        if row is None:
            await WorkspaceCapabilityState.create(workspace_id=workspace_id, capability_id=cid, enabled=enabled)
            return
        row.enabled = enabled
        await row.save()

    async def list_org_enabled_capability_ids(self, *, organization_id: UUID) -> set[str]:
        from apps.api.src.models.extensions.organization_capability_state import OrganizationCapabilityState

        rows = await OrganizationCapabilityState.filter(organization_id=organization_id, enabled=True).values_list(
            "capability_id", flat=True
        )
        return {str(x) for x in rows if x}

    async def set_org_capability_enabled(
        self,
        *,
        organization_id: UUID,
        capability_id: str,
        enabled: bool,
    ) -> None:
        from apps.api.src.models.extensions.organization_capability_state import OrganizationCapabilityState

        cid = capability_id.strip()
        if not cid:
            raise ValueError("capability_id is required")
        row = await OrganizationCapabilityState.get_or_none(organization_id=organization_id, capability_id=cid)
        if row is None:
            await OrganizationCapabilityState.create(
                organization_id=organization_id, capability_id=cid, enabled=enabled
            )
            return
        row.enabled = enabled
        await row.save()
