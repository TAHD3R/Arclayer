from __future__ import annotations

import hmac
from collections.abc import Awaitable, Callable
from typing import Literal, NoReturn, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.skills._enums import (
    SkillGitHubImportOperation,
    SkillGitHubImportStatus,
    SkillPackageStatus,
    SkillSourceKind,
)
from src.models.skills.skill_github_import import SkillGitHubImportRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.workspaces.skills.github_import_contract import (
    SKILL_GITHUB_IMPORT_JOB_TYPE,
    SKILL_GITHUB_JOB_TYPE_VERSION,
    SKILL_GITHUB_REFRESH_JOB_TYPE,
    SkillGitHubImportJobInput,
    SkillGitHubImportJobTarget,
)
from src.modules.workspaces.skills.github_import_repository import WorkspaceSkillGitHubImportRepository
from src.modules.workspaces.skills.github_source import (
    GitHubPackageSourceDescriptor,
    build_github_request_revision,
    normalize_github_repository_url,
)
from src.modules.workspaces.skills.projection import project_github_import
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import (
    SkillGitHubImportAcceptedOut,
    SkillGitHubImportCreateRequest,
    SkillGitHubImportOut,
)

ActivityWriter = Callable[..., Awaitable[object]]


class WorkspaceSkillGitHubImportService(BaseService):
    def __init__(
        self,
        *,
        imports: WorkspaceSkillGitHubImportRepository,
        packages: WorkspaceSkillsRepository,
        jobs: BackgroundJobService,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._imports = imports
        self._packages = packages
        self._jobs = jobs
        self._activity_writer = activity_writer

    async def create_import(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillGitHubImportCreateRequest,
    ) -> SkillGitHubImportAcceptedOut:
        if not self.settings.skill_github_fetch.enabled:
            raise Conflict(
                t("errors", "SKILL_GITHUB_CONFIGURATION_INVALID"),
                error="SKILL_GITHUB_CONFIGURATION_INVALID",
            )
        try:
            repository_url = normalize_github_repository_url(payload.repository_url).repository_url
        except ValueError as exc:
            raise BadRequest(
                t("errors", "SKILL_GITHUB_SOURCE_INVALID"),
                error="SKILL_GITHUB_SOURCE_INVALID",
            ) from exc
        return await self._start_operation(
            workspace_id=workspace_id,
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            idempotency_key=_require_idempotency_key(idempotency_key),
            operation="initial",
            package_id=None,
            repository_url=repository_url,
        )

    async def create_refresh(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        package_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
    ) -> SkillGitHubImportAcceptedOut:
        package = await self._packages.get_package(workspace_id=workspace_id, package_id=package_id)
        if package is None:
            _raise_not_found()
        if str(package.source_kind) != SkillSourceKind.GITHUB.value:
            raise Conflict(t("errors", "SKILL_GITHUB_SOURCE_INVALID"), error="SKILL_GITHUB_SOURCE_INVALID")
        try:
            descriptor = GitHubPackageSourceDescriptor.model_validate(package.source_descriptor)
        except ValueError as exc:
            raise RuntimeError("GitHub Skill package has an invalid source descriptor") from exc
        return await self._start_operation(
            workspace_id=workspace_id,
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            idempotency_key=_require_idempotency_key(idempotency_key),
            operation="refresh",
            package_id=package.id,
            repository_url=descriptor.repository_url,
        )

    async def get_import(self, *, workspace_id: UUID, import_id: UUID) -> SkillGitHubImportOut:
        record = await self._imports.get_import(workspace_id=workspace_id, import_id=import_id)
        if record is None:
            _raise_not_found()
        return project_github_import(record)

    async def _start_operation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        operation: Literal["initial", "refresh"],
        package_id: UUID | None,
        repository_url: str,
    ) -> SkillGitHubImportAcceptedOut:
        revision = build_github_request_revision(
            operation=operation,
            repository_url=repository_url,
            package_id=str(package_id) if package_id is not None else None,
        )
        fingerprint = revision.removeprefix("sha256:")
        job_result: BackgroundJobCreateResult | None = None
        try:
            async with self.tx() as conn:
                record = await self._imports.get_by_idempotency_key(
                    workspace_id=workspace_id,
                    idempotency_key=idempotency_key,
                    conn=conn,
                )
                if record is not None:
                    _require_fingerprint(record.request_fingerprint, fingerprint)
                    return _accepted(record)
                if operation == "refresh" and package_id is not None:
                    package = await self._packages.get_package_for_update(
                        workspace_id=workspace_id,
                        package_id=package_id,
                        conn=conn,
                    )
                    if package is None:
                        _raise_not_found()
                    if str(package.status) != SkillPackageStatus.ACTIVE.value:
                        _raise_archived()
                record = await self._imports.create_import(
                    values={
                        "workspace_id": workspace_id,
                        "package_id": package_id,
                        "operation": SkillGitHubImportOperation(operation),
                        "status": SkillGitHubImportStatus.QUEUED,
                        "repository_url": repository_url,
                        "requested_ref": "",
                        "subpath": "",
                        "request_revision": revision,
                        "actor_user_id": actor_user_id,
                        "request_idempotency_key": idempotency_key,
                        "request_fingerprint": fingerprint,
                    },
                    conn=conn,
                )
                job_result = await self._create_job(
                    record=record,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    operation=operation,
                    conn=conn,
                )
                record.job_id = job_result.job.id
                await self._imports.save_import(record=record, update_fields=("job_id",), conn=conn)
                await self._write_activity(
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    record=record,
                    conn=conn,
                )
        except IntegrityError as exc:
            record = await self._resolve_race(
                workspace_id=workspace_id,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                error=exc,
            )
            return _accepted(record)
        if job_result is None:
            raise RuntimeError("GitHub Skill import transaction did not produce a Job")
        await self._jobs.publish_created_after_commit(job_result)
        return _accepted(record)

    async def _create_job(
        self,
        *,
        record: SkillGitHubImportRecord,
        workspace_id: UUID,
        actor_user_id: UUID,
        operation: Literal["initial", "refresh"],
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult:
        job_type = SKILL_GITHUB_IMPORT_JOB_TYPE if operation == "initial" else SKILL_GITHUB_REFRESH_JOB_TYPE
        definition = self._jobs.registry.require(
            job_type=job_type,
            job_type_version=SKILL_GITHUB_JOB_TYPE_VERSION,
        )
        target = SkillGitHubImportJobTarget(
            workspace_id=workspace_id,
            import_id=record.id,
            package_id=record.package_id,
            entity_id=record.id,
        )
        input_reference = SkillGitHubImportJobInput(
            operation=operation,
            repository_url=record.repository_url,
            request_revision=record.request_revision,
        )
        actor_context = self.resolve_actor_context(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            source="workspace-skills",
        )
        return await self._jobs.create_job_in_transaction(
            command=BackgroundJobCreate(
                job_type=definition.job_type,
                job_type_version=definition.job_type_version,
                task_name=definition.task_name,
                workload_class=definition.workload_class,
                authority_mode=definition.authority_mode,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                target_descriptor=target.model_dump(mode="json", by_alias=True),
                input_reference=input_reference.model_dump(mode="json", by_alias=True),
                idempotency_key=f"skill-github:{record.id}:{operation}:v2",
                source_revision=record.request_revision,
                correlation_id=actor_context.trace_id or f"skill-github-import:{record.id}",
                trace_id=actor_context.trace_id,
                retry_class=definition.retry_class,
                max_attempts=definition.max_attempts,
                timeout_seconds=definition.timeout_seconds,
                lease_seconds=definition.lease_seconds,
                heartbeat_seconds=definition.heartbeat_seconds,
                status_key=definition.initial_status_key,
            ),
            conn=conn,
        )

    async def _resolve_race(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        error: IntegrityError,
    ) -> SkillGitHubImportRecord:
        async with self._imports.connection() as conn:
            record = await self._imports.get_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=idempotency_key,
                conn=conn,
            )
        if record is None:
            raise error
        _require_fingerprint(record.request_fingerprint, fingerprint)
        return record

    async def _write_activity(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        record: SkillGitHubImportRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="workspace.skill.github.import.requested",
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="skill_github_import",
                entity_id=record.id,
                properties={
                    "operation": str(record.operation),
                    "packageId": str(record.package_id) if record.package_id is not None else None,
                    "jobId": str(record.job_id),
                },
            ),
            conn=conn,
        )


def _accepted(record: SkillGitHubImportRecord) -> SkillGitHubImportAcceptedOut:
    if record.job_id is None:
        raise RuntimeError("GitHub Skill import is missing its durable Job")
    return SkillGitHubImportAcceptedOut(
        import_id=record.id,
        job_id=record.job_id,
        operation=cast(Literal["initial", "refresh"], str(record.operation)),
    )


def _require_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")
    return normalized


def _require_fingerprint(actual: str, expected: str) -> None:
    if not hmac.compare_digest(actual, expected):
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")


def _raise_archived() -> NoReturn:
    raise Conflict(t("errors", "SKILL_PACKAGE_ARCHIVED"), error="SKILL_PACKAGE_ARCHIVED")
