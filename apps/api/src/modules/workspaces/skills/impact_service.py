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
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_update import SkillInstallationRemovalRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.workspaces.skills.impact_repository import WorkspaceSkillImpactRepository
from src.modules.workspaces.skills.impact_schema import (
    SkillImpactBlocker,
    SkillInstallationImpactOut,
    SkillInstallationRemovalOut,
)
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository

SKILL_UNINSTALLED = "workspace.skill.uninstalled"
ActivityWriter = Callable[..., Awaitable[object]]


class WorkspaceSkillImpactService(BaseService):
    def __init__(
        self,
        *,
        lifecycle: WorkspaceSkillLifecycleRepository,
        impact: WorkspaceSkillImpactRepository,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._lifecycle = lifecycle
        self._impact = impact
        self._activity_writer = activity_writer

    async def get_installation_impact(
        self,
        *,
        workspace_id: UUID,
        installation_id: UUID,
    ) -> SkillInstallationImpactOut:
        async with self.tx() as conn:
            installation = await self._lifecycle.get_installation(
                workspace_id=workspace_id,
                installation_id=installation_id,
                conn=conn,
            )
            if installation is None:
                _raise_not_found()
            return await self._compute_impact(installation=installation, conn=conn)

    async def remove_installation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        idempotency_key: str,
    ) -> SkillInstallationRemovalOut:
        key = _normalized_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "installationId": str(installation_id),
            "expectedRevision": expected_revision,
        })
        try:
            return await self._remove_transaction(
                workspace_id=workspace_id,
                organization_id=organization_id,
                installation_id=installation_id,
                actor_user_id=actor_user_id,
                expected_revision=expected_revision,
                key=key,
                fingerprint=fingerprint,
            )
        except IntegrityError as exc:
            existing = await self._impact.get_removal_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
            )
            if existing is None:
                raise exc
            return _project_removal(existing, fingerprint=fingerprint)

    async def _remove_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        key: str,
        fingerprint: str,
    ) -> SkillInstallationRemovalOut:
        async with self.tx() as conn:
            replay = await self._impact.get_removal_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                return _project_removal(replay, fingerprint=fingerprint)
            installation = await self._lifecycle.get_installation_for_update(
                workspace_id=workspace_id,
                installation_id=installation_id,
                conn=conn,
            )
            if installation is None:
                _raise_not_found()
            if installation.metadata_revision != expected_revision:
                raise Conflict(t("errors", "SKILL_REVISION_CONFLICT"), error="SKILL_REVISION_CONFLICT")
            impact = await self._compute_impact(installation=installation, conn=conn)
            if not impact.can_remove:
                raise Conflict(
                    t("errors", "SKILL_DELETE_BLOCKED"),
                    error="SKILL_DELETE_BLOCKED",
                    meta=impact.model_dump(mode="json", by_alias=True),
                )
            removed_at = datetime.now(UTC)
            result = SkillInstallationRemovalOut(
                installation_id=installation.id,
                impact=impact,
                removed_at=removed_at,
            )
            await self._impact.create_removal(
                values={
                    "workspace_id": workspace_id,
                    "installation_id": installation.id,
                    "package_scope": installation.package_scope,
                    "package_id": installation.package_id,
                    "version_id": installation.version_id,
                    "expected_installation_revision": expected_revision,
                    "impact": impact.model_dump(mode="json"),
                    "removed_by_user_id": actor_user_id,
                    "removed_at": removed_at,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "result_snapshot": result.model_dump(mode="json"),
                },
                conn=conn,
            )
            await self._activity_writer(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name=SKILL_UNINSTALLED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="skill_installation",
                    entity_id=installation.id,
                    properties={
                        "packageScope": str(installation.package_scope),
                        "packageId": str(installation.package_id),
                        "versionId": str(installation.version_id),
                        "revision": expected_revision,
                    },
                ),
                conn=conn,
            )
            await self._lifecycle.delete_installation(installation=installation, conn=conn)
            return result

    async def _compute_impact(
        self,
        *,
        installation: SkillInstallationRecord,
        conn: BaseDBAsyncClient,
    ) -> SkillInstallationImpactOut:
        versions = await self._impact.list_referencing_agent_versions(
            workspace_id=installation.workspace_id,
            installation_id=installation.id,
            conn=conn,
        )
        version_ids = tuple(version.id for version in versions)
        assignment_count, enabled_assignment_count = await self._impact.assignment_counts(
            version_ids=version_ids,
            conn=conn,
        )
        retained_run_count = await self._impact.retained_run_count(
            installation_id=installation.id,
            conn=conn,
        )
        blockers: list[SkillImpactBlocker] = []
        if versions:
            blockers.append("agent_versions")
        if assignment_count:
            blockers.append("assignments")
        if retained_run_count:
            blockers.append("retained_runs")
        return SkillInstallationImpactOut(
            installation_id=installation.id,
            metadata_revision=installation.metadata_revision,
            status=str(installation.status),
            agent_version_count=len(versions),
            published_agent_version_count=sum(
                1 for version in versions if str(version.state) == AgentVersionState.PUBLISHED.value
            ),
            assignment_count=assignment_count,
            enabled_assignment_count=enabled_assignment_count,
            retained_run_count=retained_run_count,
            blockers=tuple(blockers),
            can_remove=not blockers,
        )


def _project_removal(
    record: SkillInstallationRemovalRecord,
    *,
    fingerprint: str,
) -> SkillInstallationRemovalOut:
    if record.request_fingerprint != fingerprint:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")
    return SkillInstallationRemovalOut.model_validate(record.result_snapshot)


def _normalized_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")
    return normalized


def _fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")
