from __future__ import annotations

from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from src.modules.jobs.execution_errors import (
    JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.workspaces.skills.github_authoring import build_github_skill_version
from src.modules.workspaces.skills.github_import_contract import (
    SkillGitHubImportJobInput,
    SkillGitHubImportJobResult,
    SkillGitHubImportJobTarget,
)
from src.modules.workspaces.skills.github_importing import (
    SkillGitHubImportOutcomeMarker,
    SkillGitHubImportWrite,
)
from src.modules.workspaces.skills.github_source import GitHubSkillSnapshot, GitHubSourceError

_PROGRESS_TOTAL = 4


class GitHubSkillSnapshotFetcher(Protocol):
    async def fetch(
        self,
        *,
        repository_url: str,
        requested_ref: str,
        subpath: str,
    ) -> GitHubSkillSnapshot: ...


class SkillGitHubImportStore(Protocol):
    async def get_outcome_marker(
        self,
        *,
        target: SkillGitHubImportJobTarget,
        job_id: UUID,
    ) -> SkillGitHubImportOutcomeMarker | None: ...

    async def mark_fetching(self, *, target: SkillGitHubImportJobTarget, job_id: UUID) -> None: ...

    async def commit_import(self, *, write: SkillGitHubImportWrite) -> SkillGitHubImportOutcomeMarker: ...

    async def cancel(self, *, target: SkillGitHubImportJobTarget, job_id: UUID) -> None: ...

    async def project_failure(
        self,
        *,
        target: SkillGitHubImportJobTarget,
        job_id: UUID,
        error_code: str,
        safe_message: str,
    ) -> None: ...


class SkillGitHubImportJobHandler:
    def __init__(
        self,
        *,
        store_factory: Callable[[], SkillGitHubImportStore],
        fetcher: GitHubSkillSnapshotFetcher,
    ) -> None:
        self._store_factory = store_factory
        self._fetcher = fetcher

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[SkillGitHubImportJobTarget, SkillGitHubImportJobInput],
    ) -> SkillGitHubImportJobResult | None:
        marker = await self._store_factory().get_outcome_marker(
            target=context.target,
            job_id=context.lease.job_id,
        )
        return None if marker is None else _result(marker=marker)

    async def execute(
        self,
        *,
        context: JobExecutionContext[SkillGitHubImportJobTarget, SkillGitHubImportJobInput],
    ) -> SkillGitHubImportJobResult:
        store = self._store_factory()
        await context.report_progress(_progress(phase="resolving", completed=0))
        await context.run_fenced_domain_commit(
            lambda: store.mark_fetching(target=context.target, job_id=context.lease.job_id)
        )
        await context.report_progress(_progress(phase="fetching", completed=1))
        try:
            snapshot = await self._fetcher.fetch(
                repository_url=context.input_reference.repository_url,
                requested_ref=context.input_reference.requested_ref,
                subpath=context.input_reference.subpath,
            )
        except GitHubSourceError as exc:
            if exc.transient:
                raise TransientJobExecutionError(
                    code=exc.code,
                    safe_message=exc.safe_message,
                    provider_retry_after_seconds=exc.retry_after_seconds,
                ) from exc
            raise PermanentJobExecutionError(
                code=exc.code,
                safe_message=exc.safe_message,
            ) from exc
        await context.checkpoint()
        await context.report_progress(_progress(phase="verifying", completed=2))
        authored = build_github_skill_version(
            workspace_id=context.target.workspace_id,
            slug=context.input_reference.slug,
            display_name=context.input_reference.display_name,
            description=context.input_reference.description,
            snapshot=snapshot,
        )
        await context.report_progress(_progress(phase="persisting", completed=3))
        marker = await context.run_fenced_domain_commit(
            lambda: store.commit_import(
                write=SkillGitHubImportWrite(
                    job_id=context.lease.job_id,
                    actor_user_id=_require_actor(context.actor_user_id),
                    workspace_id=context.target.workspace_id,
                    import_id=context.target.import_id,
                    package_id=context.target.package_id,
                    operation=context.input_reference.operation,
                    slug=context.input_reference.slug,
                    display_name=context.input_reference.display_name,
                    description=context.input_reference.description,
                    snapshot=snapshot,
                    authored=authored,
                )
            )
        )
        await context.report_progress(_progress(phase="persisting", completed=_PROGRESS_TOTAL))
        return _result(marker=marker)

    async def cancel(
        self,
        *,
        context: JobExecutionContext[SkillGitHubImportJobTarget, SkillGitHubImportJobInput],
    ) -> None:
        store = self._store_factory()
        await context.run_fenced_domain_commit(lambda: store.cancel(target=context.target, job_id=context.lease.job_id))

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[SkillGitHubImportJobTarget, SkillGitHubImportJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        store = self._store_factory()
        await context.run_fenced_domain_commit(
            lambda: store.project_failure(
                target=context.target,
                job_id=context.lease.job_id,
                error_code=error.code,
                safe_message=error.safe_message,
            )
        )


def _result(*, marker: SkillGitHubImportOutcomeMarker) -> SkillGitHubImportJobResult:
    return SkillGitHubImportJobResult(
        import_id=marker.import_id,
        package_id=marker.package_id,
        version_id=marker.version_id,
        resolved_commit=marker.resolved_commit,
        resolved_tree=marker.resolved_tree,
        package_checksum=marker.package_checksum,
        outcome_job_id=marker.job_id,
    )


def _progress(*, phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"WORKSPACE_SKILLS_GITHUB_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=_PROGRESS_TOTAL,
    )


def _require_actor(value: UUID | None) -> UUID:
    if value is None:
        raise PermanentJobExecutionError(
            code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
            safe_message="GitHub Skill import requires its initiating workspace actor",
        )
    return value
