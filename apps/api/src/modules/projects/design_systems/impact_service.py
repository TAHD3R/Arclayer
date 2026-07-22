from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.design_systems._enums import DesignSystemOwnerKind
from src.models.design_systems.design_system import DesignSystemRecord
from src.models.design_systems.design_system_version import (
    DesignSystemVersionRecord,
    DesignSystemVersionStateRecord,
)
from src.modules.projects.builder.projection import get_project_builder_revision
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.impact import (
    ProjectDesignSystemImpactRevision,
    analyze_project_design_system_impact,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.schema import (
    ProjectDesignSystemImpactPreviewOut,
    ProjectDesignSystemImpactPreviewRequest,
)
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1
from src.modules.workspaces.design_systems.projection import project_version_summary


class ProjectDesignSystemImpactService(BaseService):
    def __init__(
        self,
        *,
        repository: ProjectDesignSystemsRepository,
        builder_repository: SiteBuilderRepository,
    ) -> None:
        super().__init__()
        self._repository = repository
        self._builder_repository = builder_repository

    async def preview(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        system_id: UUID,
        payload: ProjectDesignSystemImpactPreviewRequest,
    ) -> ProjectDesignSystemImpactPreviewOut:
        async with self.tx() as conn:
            await self._require_project_system(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                conn=conn,
            )
            from_version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=payload.from_version_id,
                conn=conn,
            )
            to_version = await self._require_version(
                workspace_id=workspace_id,
                system_id=system_id,
                version_id=payload.to_version_id,
                conn=conn,
            )
            validations = await self._repository.latest_validations(
                workspace_id=workspace_id,
                version_ids=(from_version.id, to_version.id),
                conn=conn,
            )
            states = await self._repository.version_states(
                workspace_id=workspace_id,
                version_ids=(from_version.id, to_version.id),
                conn=conn,
            )
            assignment = await self._repository.get_assignment(project_id=project_id, conn=conn)
            referenced_count = await self._repository.count_site_revisions_for_version(
                workspace_id=workspace_id,
                project_id=project_id,
                system_id=system_id,
                version_id=from_version.id,
                conn=conn,
            )
            current_revisions = await self._current_canvas_revisions(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                system_id=system_id,
                from_version_id=from_version.id,
                conn=conn,
            )

        analysis = analyze_project_design_system_impact(
            before=DesignSystemManifestV1.model_validate(from_version.manifest),
            after=DesignSystemManifestV1.model_validate(to_version.manifest),
            from_version_id=from_version.id,
            to_version_id=to_version.id,
            assignment_version_id=(UUID(str(assignment.design_system_version_id)) if assignment is not None else None),
            referenced_site_revision_count=referenced_count,
            current_revisions=current_revisions,
        )
        return ProjectDesignSystemImpactPreviewOut(
            from_version=project_version_summary(
                from_version,
                validation=validations.get(from_version.id),
                lifecycle_state=_require_state(states.get(from_version.id), from_version.id),
            ),
            to_version=project_version_summary(
                to_version,
                validation=validations.get(to_version.id),
                lifecycle_state=_require_state(states.get(to_version.id), to_version.id),
            ),
            impact_hash=analysis.impact_hash,
            diff=analysis.diff,
            coverage=analysis.coverage,
            summary=analysis.summary,
            impacts=analysis.impacts,
        )

    async def _current_canvas_revisions(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        system_id: UUID,
        from_version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[ProjectDesignSystemImpactRevision, ...]:
        if runtime_id is None:
            return ()
        site = await self._builder_repository.get_site(
            project_id=project_id,
            runtime_id=runtime_id,
            conn=conn,
        )
        environment = await self._builder_repository.get_default_preview_environment(
            project_id=project_id,
            conn=conn,
        )
        if site is None or environment is None:
            return ()
        record = await self._builder_repository.get_latest_site_revision(
            project_id=project_id,
            site_id=site.id,
            environment_id=environment.id,
            conn=conn,
        )
        if (
            record is None
            or UUID(str(record.design_system_id)) != system_id
            or UUID(str(record.design_system_version_id)) != from_version_id
        ):
            return ()
        revision = await get_project_builder_revision(
            repository=self._builder_repository,
            workspace_id=workspace_id,
            project_id=project_id,
            revision_id=record.id,
            conn=conn,
        )
        return (
            ProjectDesignSystemImpactRevision(
                site_revision_id=revision.site_revision.id,
                revision_number=revision.site_revision.revision_number,
                wireframes=tuple(page.wireframe for page in revision.pages if page.wireframe is not None),
            ),
        )

    async def _require_project_system(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        system_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemRecord:
        system = await self._repository.get_system(
            workspace_id=workspace_id,
            system_id=system_id,
            conn=conn,
        )
        if (
            system is None
            or str(system.owner_kind) != DesignSystemOwnerKind.PROJECT.value
            or system.owning_project_id != project_id
        ):
            _raise_not_found()
        return system

    async def _require_version(
        self,
        *,
        workspace_id: UUID,
        system_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> DesignSystemVersionRecord:
        version = await self._repository.get_version(
            workspace_id=workspace_id,
            system_id=system_id,
            version_id=version_id,
            conn=conn,
        )
        if version is None:
            _raise_not_found()
        return version


def _require_state(
    state: DesignSystemVersionStateRecord | None,
    version_id: UUID,
) -> DesignSystemVersionStateRecord:
    if state is None:
        raise RuntimeError(f"Design System version {version_id} is missing lifecycle state")
    return state


def _raise_not_found() -> NoReturn:
    raise NotFound(error="DESIGN_SYSTEM_NOT_FOUND", message=t("errors", "DESIGN_SYSTEM_NOT_FOUND"))


__all__ = ["ProjectDesignSystemImpactService"]
