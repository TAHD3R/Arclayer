from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.agents.catalog import AgentVersionState
from src.models.skills._enums import SkillInstallationStatus, SkillPackageScope, SkillPackageStatus
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_update import SkillPackageArchiveRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.workspaces.skills.impact_repository import WorkspaceSkillImpactRepository
from src.modules.workspaces.skills.impact_schema import (
    SkillPackageArchiveOut,
    SkillPackageImpactBlocker,
    SkillPackageImpactOut,
)
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository

SKILL_PACKAGE_ARCHIVED = "workspace.skill.package.archived"
ActivityWriter = Callable[..., Awaitable[object]]


class WorkspaceSkillPackageImpactService(BaseService):
    def __init__(
        self,
        *,
        packages: WorkspaceSkillsRepository,
        lifecycle: WorkspaceSkillLifecycleRepository,
        impact: WorkspaceSkillImpactRepository,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._packages = packages
        self._lifecycle = lifecycle
        self._impact = impact
        self._activity_writer = activity_writer

    async def get_package_impact(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
    ) -> SkillPackageImpactOut:
        async with self.tx() as conn:
            package = await self._packages.get_package(
                workspace_id=workspace_id,
                package_id=package_id,
                conn=conn,
            )
            if package is None:
                _raise_not_found()
            return await self._compute_impact(
                workspace_id=workspace_id,
                package=package,
                conn=conn,
            )

    async def archive_package(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        package_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        idempotency_key: str,
    ) -> SkillPackageArchiveOut:
        key = _normalized_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "packageId": str(package_id),
            "expectedRevision": expected_revision,
        })
        try:
            return await self._archive_transaction(
                workspace_id=workspace_id,
                organization_id=organization_id,
                package_id=package_id,
                actor_user_id=actor_user_id,
                expected_revision=expected_revision,
                key=key,
                fingerprint=fingerprint,
            )
        except IntegrityError as exc:
            existing = await self._impact.get_package_archive_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
            )
            if existing is None:
                raise exc
            return _project_archive(existing, fingerprint=fingerprint)

    async def _archive_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        package_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        key: str,
        fingerprint: str,
    ) -> SkillPackageArchiveOut:
        async with self.tx() as conn:
            replay = await self._impact.get_package_archive_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                return _project_archive(replay, fingerprint=fingerprint)
            package = await self._packages.get_package_for_update(
                workspace_id=workspace_id,
                package_id=package_id,
                conn=conn,
            )
            if package is None:
                _raise_not_found()
            if package.metadata_revision != expected_revision:
                raise Conflict(t("errors", "SKILL_REVISION_CONFLICT"), error="SKILL_REVISION_CONFLICT")
            if str(package.status) != SkillPackageStatus.ACTIVE.value:
                _raise_archived()
            impact = await self._compute_impact(
                workspace_id=workspace_id,
                package=package,
                conn=conn,
            )
            if not impact.can_archive:
                raise Conflict(
                    t("errors", "SKILL_DELETE_BLOCKED"),
                    error="SKILL_DELETE_BLOCKED",
                    meta=impact.model_dump(mode="json", by_alias=True),
                )
            archived_at = datetime.now(UTC)
            package.status = SkillPackageStatus.ARCHIVED
            package.metadata_revision += 1
            package.archived_at = archived_at
            package.archived_by_user_id = actor_user_id
            result = SkillPackageArchiveOut(
                package_id=package.id,
                metadata_revision=package.metadata_revision,
                impact=impact,
                archived_at=archived_at,
            )
            await self._packages.save_package(
                package=package,
                update_fields=(
                    "status",
                    "metadata_revision",
                    "archived_at",
                    "archived_by_user_id",
                ),
                conn=conn,
            )
            await self._impact.create_package_archive(
                values={
                    "workspace_id": workspace_id,
                    "package_id": package.id,
                    "expected_package_revision": expected_revision,
                    "impact": impact.model_dump(mode="json"),
                    "archived_by_user_id": actor_user_id,
                    "archived_at": archived_at,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "result_snapshot": result.model_dump(mode="json"),
                },
                conn=conn,
            )
            await self._activity_writer(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name=SKILL_PACKAGE_ARCHIVED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="skill_package",
                    entity_id=package.id,
                    properties={
                        "revision": package.metadata_revision,
                        "versionCount": impact.version_count,
                        "resourceCount": impact.resource_count,
                        "validationCount": impact.validation_count,
                    },
                ),
                conn=conn,
            )
            return result

    async def _compute_impact(
        self,
        *,
        workspace_id: UUID,
        package: SkillPackageRecord,
        conn: BaseDBAsyncClient,
    ) -> SkillPackageImpactOut:
        version_count, resource_count, validation_count = await self._impact.package_artifact_counts(
            workspace_id=workspace_id,
            package_id=package.id,
            conn=conn,
        )
        installations = await self._lifecycle.get_installations_by_packages(
            workspace_id=workspace_id,
            package_scope=SkillPackageScope.WORKSPACE.value,
            package_ids=(package.id,),
            conn=conn,
        )
        agent_version_count = 0
        published_agent_version_count = 0
        assignment_count = 0
        enabled_assignment_count = 0
        retained_run_count = 0
        for installation in installations:
            versions = await self._impact.list_referencing_agent_versions(
                workspace_id=workspace_id,
                installation_id=installation.id,
                conn=conn,
            )
            assignments, enabled_assignments = await self._impact.assignment_counts(
                version_ids=tuple(version.id for version in versions),
                conn=conn,
            )
            agent_version_count += len(versions)
            published_agent_version_count += sum(
                1 for version in versions if str(version.state) == AgentVersionState.PUBLISHED.value
            )
            assignment_count += assignments
            enabled_assignment_count += enabled_assignments
            retained_run_count += await self._impact.retained_run_count(
                installation_id=installation.id,
                conn=conn,
            )
        active_github_operation_count = await self._impact.active_github_operation_count(
            workspace_id=workspace_id,
            package_id=package.id,
            conn=conn,
        )
        blockers: list[SkillPackageImpactBlocker] = []
        if installations:
            blockers.append("installations")
        if agent_version_count:
            blockers.append("agent_versions")
        if assignment_count:
            blockers.append("assignments")
        if retained_run_count:
            blockers.append("retained_runs")
        if active_github_operation_count:
            blockers.append("active_github_operations")
        return SkillPackageImpactOut(
            package_id=package.id,
            metadata_revision=package.metadata_revision,
            status=str(package.status),
            version_count=version_count,
            resource_count=resource_count,
            validation_count=validation_count,
            installation_count=len(installations),
            enabled_installation_count=sum(
                1 for installation in installations if str(installation.status) == SkillInstallationStatus.ENABLED.value
            ),
            agent_version_count=agent_version_count,
            published_agent_version_count=published_agent_version_count,
            assignment_count=assignment_count,
            enabled_assignment_count=enabled_assignment_count,
            retained_run_count=retained_run_count,
            active_github_operation_count=active_github_operation_count,
            blockers=tuple(blockers),
            can_archive=not blockers and str(package.status) == SkillPackageStatus.ACTIVE.value,
        )


def _project_archive(record: SkillPackageArchiveRecord, *, fingerprint: str) -> SkillPackageArchiveOut:
    if record.request_fingerprint != fingerprint:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")
    return SkillPackageArchiveOut.model_validate(record.result_snapshot)


def _normalized_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")
    return normalized


def _fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _raise_archived() -> NoReturn:
    raise Conflict(t("errors", "SKILL_PACKAGE_ARCHIVED"), error="SKILL_PACKAGE_ARCHIVED")


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")
