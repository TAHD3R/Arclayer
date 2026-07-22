from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from typing import NoReturn
from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.services import BaseService
from src.models.skills._enums import (
    SkillGitHubImportStatus,
    SkillPackageScope,
    SkillPackageStatus,
    SkillSourceKind,
    SkillTrustLevel,
    SkillVersionStatus,
)
from src.models.skills.skill_github_import import SkillGitHubImportRecord
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import SkillVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.skills.authoring import VALIDATION_POLICY_VERSION
from src.modules.workspaces.skills.github_import_contract import (
    SKILL_GITHUB_SLUG_CONFLICT,
    SKILL_GITHUB_SOURCE_CONFLICT,
    SKILL_GITHUB_TARGET_NOT_FOUND,
    SkillGitHubImportJobTarget,
)
from src.modules.workspaces.skills.github_import_repository import WorkspaceSkillGitHubImportRepository
from src.modules.workspaces.skills.github_importing import (
    SkillGitHubImportOutcomeMarker,
    SkillGitHubImportWrite,
)
from src.modules.workspaces.skills.github_source import GitHubPackageSourceDescriptor
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository

ActivityWriter = Callable[..., Awaitable[object]]


class TenantSkillGitHubImportCoordinator(BaseService):
    def __init__(
        self,
        *,
        tenant_context: TenantContext,
        imports: WorkspaceSkillGitHubImportRepository,
        packages: WorkspaceSkillsRepository,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._tenant_context = tenant_context
        self._imports = imports
        self._packages = packages
        self._activity_writer = activity_writer

    async def get_outcome_marker(
        self,
        *,
        target: SkillGitHubImportJobTarget,
        job_id: UUID,
    ) -> SkillGitHubImportOutcomeMarker | None:
        record = await self._imports.get_import(
            workspace_id=target.workspace_id,
            import_id=target.import_id,
        )
        if record is None:
            _raise_target_not_found()
        if str(record.status) != SkillGitHubImportStatus.SUCCEEDED.value:
            return None
        return await self._marker(record=record, job_id=job_id)

    async def mark_fetching(self, *, target: SkillGitHubImportJobTarget, job_id: UUID) -> None:
        async with self._imports.connection() as conn:
            record = await self._require_record(target=target, job_id=job_id, conn=conn)
            if str(record.status) == SkillGitHubImportStatus.SUCCEEDED.value:
                return
            if str(record.status) in {
                SkillGitHubImportStatus.FAILED.value,
                SkillGitHubImportStatus.CANCELLED.value,
            }:
                _raise_source_conflict("GitHub Skill import is already terminal")
            record.status = SkillGitHubImportStatus.FETCHING
            record.safe_error_code = None
            record.safe_error_message = None
            await self._imports.save_import(
                record=record,
                update_fields=("status", "safe_error_code", "safe_error_message"),
                conn=conn,
            )

    async def commit_import(self, *, write: SkillGitHubImportWrite) -> SkillGitHubImportOutcomeMarker:
        try:
            async with self._imports.connection() as conn:
                target = SkillGitHubImportJobTarget(
                    workspace_id=write.workspace_id,
                    import_id=write.import_id,
                    package_id=write.package_id,
                    entity_id=write.import_id,
                )
                record = await self._require_record(target=target, job_id=write.job_id, conn=conn)
                if str(record.status) == SkillGitHubImportStatus.SUCCEEDED.value:
                    return await self._marker(record=record, job_id=write.job_id, conn=conn)
                record.status = SkillGitHubImportStatus.PERSISTING
                await self._imports.save_import(record=record, update_fields=("status",), conn=conn)
                package = await self._resolve_package(write=write, conn=conn)
                version = await self._resolve_version(write=write, package=package, conn=conn)
                await self._complete_record(record=record, write=write, package=package, version=version, conn=conn)
                await self._write_activity(record=record, write=write, conn=conn)
                return _marker_from(record=record, version=version, job_id=write.job_id)
        except IntegrityError as exc:
            raise PermanentJobExecutionError(
                code=SKILL_GITHUB_SLUG_CONFLICT,
                safe_message="GitHub Skill package identity conflicts with an existing workspace Skill",
            ) from exc

    async def cancel(self, *, target: SkillGitHubImportJobTarget, job_id: UUID) -> None:
        async with self._imports.connection() as conn:
            record = await self._require_record(target=target, job_id=job_id, conn=conn)
            if str(record.status) == SkillGitHubImportStatus.SUCCEEDED.value:
                return
            record.status = SkillGitHubImportStatus.CANCELLED
            record.safe_error_code = None
            record.safe_error_message = None
            await self._imports.save_import(
                record=record,
                update_fields=("status", "safe_error_code", "safe_error_message"),
                conn=conn,
            )

    async def project_failure(
        self,
        *,
        target: SkillGitHubImportJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
    ) -> None:
        async with self._imports.connection() as conn:
            record = await self._require_record(target=target, job_id=job_id, conn=conn)
            if str(record.status) == SkillGitHubImportStatus.SUCCEEDED.value:
                return
            record.status = SkillGitHubImportStatus.FAILED
            record.safe_error_code = error_code
            record.safe_error_message = safe_message[:1000]
            await self._imports.save_import(
                record=record,
                update_fields=("status", "safe_error_code", "safe_error_message"),
                conn=conn,
            )

    async def _resolve_package(
        self,
        *,
        write: SkillGitHubImportWrite,
        conn: BaseDBAsyncClient,
    ) -> SkillPackageRecord:
        descriptor = _source_descriptor(write)
        if write.package_id is not None:
            package = await self._packages.get_package_for_update(
                workspace_id=write.workspace_id,
                package_id=write.package_id,
                conn=conn,
            )
            if package is None or str(package.source_kind) != SkillSourceKind.GITHUB.value:
                _raise_target_not_found()
            if str(package.status) != SkillPackageStatus.ACTIVE.value:
                raise PermanentJobExecutionError(
                    code="SKILL_PACKAGE_ARCHIVED",
                    safe_message="GitHub Skill package is archived",
                )
            existing = GitHubPackageSourceDescriptor.model_validate(package.source_descriptor)
            if (
                existing.repository_url != write.snapshot.repository_url
                or existing.requested_ref != write.snapshot.requested_ref
                or existing.subpath != write.snapshot.subpath
            ):
                _raise_source_conflict("GitHub Skill refresh source differs from its package authority")
            package.source_descriptor = descriptor.model_dump(mode="json", by_alias=True)
            package.metadata_revision += 1
            package.updated_by_user_id = write.actor_user_id
            await self._packages.save_package(
                package=package,
                update_fields=("source_descriptor", "metadata_revision", "updated_by_user_id"),
                conn=conn,
            )
            return package
        duplicate = await self._packages.get_package_by_slug(
            workspace_id=write.workspace_id,
            normalized_slug=write.slug,
            conn=conn,
        )
        if duplicate is not None:
            raise PermanentJobExecutionError(
                code=SKILL_GITHUB_SLUG_CONFLICT,
                safe_message="GitHub Skill slug is already used in this workspace",
            )
        manifest = write.authored.manifest
        return await self._packages.create_package(
            values={
                "workspace_id": write.workspace_id,
                "stable_key": _stable_key(write),
                "scope": SkillPackageScope.WORKSPACE,
                "source_kind": SkillSourceKind.GITHUB,
                "slug": write.slug,
                "normalized_slug": write.slug,
                "display_name": write.display_name,
                "description": write.description,
                "publisher_id": manifest.publisher.id,
                "publisher_name": manifest.publisher.name,
                "trust_level": SkillTrustLevel.IMPORTED_UNVERIFIED,
                "publisher_verification": {"verified": False, "source": "github_public"},
                "status": SkillPackageStatus.ACTIVE,
                "metadata_revision": 1,
                "source_descriptor": descriptor.model_dump(mode="json", by_alias=True),
                "created_by_user_id": write.actor_user_id,
                "updated_by_user_id": write.actor_user_id,
                "request_idempotency_key": f"github-import:{write.import_id}",
                "request_fingerprint": _version_fingerprint(write),
            },
            conn=conn,
        )

    async def _resolve_version(
        self,
        *,
        write: SkillGitHubImportWrite,
        package: SkillPackageRecord,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord:
        latest = await self._packages.get_latest_version(
            workspace_id=write.workspace_id,
            package_id=package.id,
            conn=conn,
        )
        provenance = latest.source_provenance if latest is not None else {}
        if (
            latest is not None
            and provenance.get("resolvedCommit") == write.snapshot.resolved_commit
            and latest.package_checksum == write.authored.manifest.checksum
        ):
            return latest
        manifest = write.authored.manifest
        version = await self._packages.create_version(
            values={
                "package_id": package.id,
                "workspace_id": write.workspace_id,
                "version_number": await self._packages.next_version_number(package_id=package.id, conn=conn),
                "semantic_version": None,
                "manifest_version": manifest.manifest_version,
                "manifest": manifest.model_dump(mode="json", by_alias=True),
                "package_checksum": manifest.checksum,
                "source_provenance": {
                    "kind": "github",
                    "repositoryUrl": write.snapshot.repository_url,
                    "requestedRef": write.snapshot.requested_ref,
                    "resolvedCommit": write.snapshot.resolved_commit,
                    "resolvedTree": write.snapshot.resolved_tree,
                    "subpath": write.snapshot.subpath,
                    "importId": str(write.import_id),
                },
                "compatibility": manifest.compatibility.model_dump(mode="json", by_alias=True),
                "required_tools": [],
                "permissions": [],
                "data_egress": [],
                "capability_tags": [],
                "validation_policy_version": VALIDATION_POLICY_VERSION,
                "status": SkillVersionStatus.CANDIDATE,
                "provenance_actor_user_id": write.actor_user_id,
                "provenance_job_id": write.job_id,
                "request_idempotency_key": f"github:{write.import_id}:{write.snapshot.resolved_commit}",
                "request_fingerprint": _version_fingerprint(write),
            },
            conn=conn,
        )
        await self._packages.create_resources(
            values=tuple(
                {
                    "skill_version_id": version.id,
                    "workspace_id": write.workspace_id,
                    "normalized_path": resource.path,
                    "role": resource.role,
                    "mime_type": resource.mime_type,
                    "byte_size": resource.byte_size,
                    "content_digest": resource.digest,
                    "inline_content": resource.content,
                    "storage_reference": {},
                }
                for resource in write.authored.resources
            ),
            conn=conn,
        )
        return version

    async def _complete_record(
        self,
        *,
        record: SkillGitHubImportRecord,
        write: SkillGitHubImportWrite,
        package: SkillPackageRecord,
        version: SkillVersionRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        record.package_id = package.id
        record.version_id = version.id
        record.resolved_commit = write.snapshot.resolved_commit
        record.resolved_tree = write.snapshot.resolved_tree
        record.status = SkillGitHubImportStatus.SUCCEEDED
        record.safe_error_code = None
        record.safe_error_message = None
        await self._imports.save_import(
            record=record,
            update_fields=(
                "package_id",
                "version_id",
                "resolved_commit",
                "resolved_tree",
                "status",
                "safe_error_code",
                "safe_error_message",
            ),
            conn=conn,
        )

    async def _require_record(
        self,
        *,
        target: SkillGitHubImportJobTarget,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillGitHubImportRecord:
        record = await self._imports.get_import_for_update(
            workspace_id=target.workspace_id,
            import_id=target.import_id,
            conn=conn,
        )
        if record is None:
            _raise_target_not_found()
        if record.job_id != job_id or record.package_id != target.package_id:
            _raise_source_conflict("GitHub Skill Job target differs from its domain import record")
        return record

    async def _marker(
        self,
        *,
        record: SkillGitHubImportRecord,
        job_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillGitHubImportOutcomeMarker:
        if record.job_id != job_id or record.package_id is None or record.version_id is None:
            _raise_source_conflict("GitHub Skill import outcome is incomplete")
        version = await self._packages.get_version(
            workspace_id=record.workspace_id,
            package_id=record.package_id,
            version_id=record.version_id,
            conn=conn,
        )
        if version is None:
            _raise_source_conflict("GitHub Skill import version is missing")
        return _marker_from(record=record, version=version, job_id=job_id)

    async def _write_activity(
        self,
        *,
        record: SkillGitHubImportRecord,
        write: SkillGitHubImportWrite,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="workspace.skill.github.import.succeeded",
                organization_id=self._tenant_context.organization_id,
                workspace_id=write.workspace_id,
                actor_user_id=write.actor_user_id,
                entity_type="skill_github_import",
                entity_id=record.id,
                properties={
                    "operation": write.operation,
                    "packageId": str(record.package_id),
                    "versionId": str(record.version_id),
                    "resolvedCommit": write.snapshot.resolved_commit,
                },
            ),
            conn=conn,
        )


def _source_descriptor(write: SkillGitHubImportWrite) -> GitHubPackageSourceDescriptor:
    return GitHubPackageSourceDescriptor(
        repository_url=write.snapshot.repository_url,
        requested_ref=write.snapshot.requested_ref,
        subpath=write.snapshot.subpath,
        latest_resolved_commit=write.snapshot.resolved_commit,
        latest_resolved_tree=write.snapshot.resolved_tree,
    )


def _stable_key(write: SkillGitHubImportWrite) -> str:
    identity = f"{write.snapshot.repository_url}:{write.snapshot.subpath}".encode()
    return f"workspace:{write.workspace_id}:github:{hashlib.sha256(identity).hexdigest()}"


def _version_fingerprint(write: SkillGitHubImportWrite) -> str:
    return hashlib.sha256(
        orjson.dumps(
            {
                "importId": str(write.import_id),
                "resolvedCommit": write.snapshot.resolved_commit,
                "resolvedTree": write.snapshot.resolved_tree,
                "packageChecksum": write.authored.manifest.checksum,
            },
            option=orjson.OPT_SORT_KEYS,
        )
    ).hexdigest()


def _marker_from(
    *,
    record: SkillGitHubImportRecord,
    version: SkillVersionRecord,
    job_id: UUID,
) -> SkillGitHubImportOutcomeMarker:
    if record.package_id is None or record.version_id is None or not record.resolved_commit or not record.resolved_tree:
        _raise_source_conflict("GitHub Skill import outcome is incomplete")
    return SkillGitHubImportOutcomeMarker(
        job_id=job_id,
        import_id=record.id,
        package_id=record.package_id,
        version_id=record.version_id,
        resolved_commit=record.resolved_commit,
        resolved_tree=record.resolved_tree,
        package_checksum=version.package_checksum,
    )


def _raise_target_not_found() -> NoReturn:
    raise PermanentJobExecutionError(
        code=SKILL_GITHUB_TARGET_NOT_FOUND,
        safe_message="GitHub Skill import target no longer exists",
    )


def _raise_source_conflict(message: str) -> NoReturn:
    raise PermanentJobExecutionError(code=SKILL_GITHUB_SOURCE_CONFLICT, safe_message=message)
