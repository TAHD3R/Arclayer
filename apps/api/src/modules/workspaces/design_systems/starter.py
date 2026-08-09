from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from src.core.exceptions import Conflict
from src.modules.workspaces.design_systems.schema import (
    DesignSystemCreateRequest,
    DesignSystemValidationCreateRequest,
    DesignSystemVersionCreateRequest,
    WorkspaceDesignSystemDefaultOut,
    WorkspaceDesignSystemDefaultSetRequest,
)
from src.modules.workspaces.design_systems.service import WorkspaceDesignSystemsService
from src.modules.workspaces.design_systems.starter_manifest import build_arclayer_starter_manifest

StarterDesignSystemServiceFactory = Callable[[], WorkspaceDesignSystemsService]


class WorkspaceStarterDesignSystemOrchestrator:
    """Ensure the Workspace has one foundation-valid default for Builder authoring."""

    def __init__(
        self,
        *,
        service_factory: StarterDesignSystemServiceFactory,
    ) -> None:
        self._service_factory = service_factory

    async def ensure_default(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
    ) -> WorkspaceDesignSystemDefaultOut:
        service = self._service_factory()
        existing = await service.get_default(workspace_id=workspace_id)
        if existing is not None:
            return existing

        key_prefix = f"ai-builder-starter:{workspace_id}"
        system = await service.create_system(
            workspace_id=workspace_id,
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            idempotency_key=f"{key_prefix}:system",
            payload=DesignSystemCreateRequest(
                name="Arclayer Starter",
                description="Foundation Design System created for the first Builder draft.",
            ),
        )
        version = await service.create_version(
            workspace_id=workspace_id,
            organization_id=organization_id,
            system_id=system.id,
            actor_user_id=actor_user_id,
            idempotency_key=f"{key_prefix}:version",
            payload=DesignSystemVersionCreateRequest(manifest=build_arclayer_starter_manifest()),
        )
        validation = await service.create_validation(
            workspace_id=workspace_id,
            organization_id=organization_id,
            system_id=system.id,
            version_id=version.id,
            actor_user_id=actor_user_id,
            idempotency_key=f"{key_prefix}:validation",
            payload=DesignSystemValidationCreateRequest(),
        )
        existing = await service.get_default(workspace_id=workspace_id)
        if existing is not None:
            return existing
        try:
            return await service.set_default(
                workspace_id=workspace_id,
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                idempotency_key=f"{key_prefix}:default",
                payload=WorkspaceDesignSystemDefaultSetRequest(
                    design_system_id=system.id,
                    version_id=version.id,
                    expected_manifest_checksum=version.manifest_checksum,
                    validation_finding_hash=validation.finding_hash,
                    expected_revision=0,
                ),
            )
        except Conflict as exc:
            if exc.error != "DESIGN_SYSTEM_REVISION_CONFLICT":
                raise
            concurrent_default = await service.get_default(workspace_id=workspace_id)
            if concurrent_default is None:
                raise
            return concurrent_default
