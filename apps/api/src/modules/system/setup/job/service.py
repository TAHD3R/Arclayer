from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

from pydantic import ValidationError

from apps.api.src.config import Settings
from apps.api.src.core.exceptions import APIError, Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.src.modules.system.models.setup_job import SetupJobRecord
from apps.api.src.modules.system.schema import (
    SystemSetupJobOut,
    SystemSetupJobStage,
    SystemSetupJobStatus,
    SystemSetupJobStatusOut,
    SystemSetupRequest,
    SystemSetupResult,
)
from apps.api.src.modules.system.setup.shared.service import _raise_if_fatal, _ts

_SETUP_RUNNING_STATUSES: tuple[SystemSetupJobStatus, ...] = ("pending", "running")
_SETUP_STAGE_PROGRESS: dict[SystemSetupJobStage, int] = {
    "precheck": 10,
    "admin": 35,
    "provision": 60,
    "workspace": 82,
    "finalize": 95,
}
_DRY_RUN_STAGE_DELAY_SECONDS = 0.28


class SystemSetupJobMixin:
    settings: Settings
    logger: object
    _background_tasks: set[asyncio.Task[None]]

    async def start_setup_job(self, *, payload: SystemSetupRequest, dry_run: bool = False) -> SystemSetupJobOut:
        if dry_run and self.settings.app_env == "production":
            raise Forbidden(
                message=_ts("DEV_SETUP_ONLY", "仅开发或测试环境支持 dry-run 初始化"),
                error="DEV_SETUP_ONLY",
            )

        if not dry_run and not self.settings.database.enabled:
            raise ServiceUnavailable(
                message=_ts("DB_REQUIRED", "系统初始化需要启用数据库"),
                error="DATABASE_DISABLED",
            )
        if not dry_run and await self.is_initialized():
            raise Conflict(message=_ts("SETUP_DONE", "系统已初始化"), error="SETUP_ALREADY_DONE")
        if await SetupJobRecord.filter(status__in=list(_SETUP_RUNNING_STATUSES)).exists():
            raise Conflict(message=_ts("SETUP_JOB_RUNNING", "系统初始化任务正在执行中"), error="SETUP_JOB_RUNNING")

        warnings = ["DRY_RUN_NO_PERSIST"] if dry_run else []
        job = await SetupJobRecord.create(status="pending", stage="precheck", percent=0, warnings=warnings)
        self._spawn_setup_job_task(job_id=job.id, payload=payload, dry_run=dry_run)
        return self._to_setup_job_out(job)

    async def get_setup_job_status(self, *, job_id: UUID) -> SystemSetupJobStatusOut:
        job = await SetupJobRecord.get_or_none(id=job_id)
        if job is None:
            raise NotFound(message=_ts("SETUP_JOB_NOT_FOUND", "初始化任务不存在"), error="SETUP_JOB_NOT_FOUND")
        return self._to_setup_job_status_out(job)

    def _spawn_setup_job_task(self, *, job_id: UUID, payload: SystemSetupRequest, dry_run: bool) -> None:
        task = asyncio.create_task(
            self._run_setup_job(job_id=job_id, payload=payload, dry_run=dry_run),
            name=f"system-setup-job-{job_id}",
        )
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def _build_stage_reporter(self, *, job_id: UUID) -> Callable[[SystemSetupJobStage], Awaitable[None]]:
        async def _report(stage: SystemSetupJobStage) -> None:
            await SetupJobRecord.filter(id=job_id).update(
                status="running",
                stage=stage,
                percent=_SETUP_STAGE_PROGRESS[stage],
            )

        return _report

    async def _run_setup_job(self, *, job_id: UUID, payload: SystemSetupRequest, dry_run: bool) -> None:
        warnings: list[str] = ["DRY_RUN_NO_PERSIST"] if dry_run else []
        await SetupJobRecord.filter(id=job_id).update(
            status="running",
            stage="precheck",
            percent=_SETUP_STAGE_PROGRESS["precheck"],
            started_at=datetime.now(UTC),
            finished_at=None,
            warnings=warnings,
            result=None,
            error_code=None,
            error_message=None,
        )

        try:
            if dry_run:
                result = await self._run_setup_dry_run(
                    payload=payload,
                    on_stage_change=self._build_stage_reporter(job_id=job_id),
                    warnings=warnings,
                )
            else:
                result = await self.run_setup(
                    payload=payload,
                    on_stage_change=self._build_stage_reporter(job_id=job_id),
                    warnings=warnings,
                )
            await SetupJobRecord.filter(id=job_id).update(
                status="succeeded",
                stage="finalize",
                percent=100,
                result=result.model_dump(by_alias=True, mode="json"),
                warnings=warnings,
                error_code=None,
                error_message=None,
                finished_at=datetime.now(UTC),
            )
        except APIError as exc:
            await SetupJobRecord.filter(id=job_id).update(
                status="failed",
                warnings=warnings,
                error_code=(exc.error or "SETUP_FAILED"),
                error_message=exc.message,
                finished_at=datetime.now(UTC),
            )
            self.logger.warning(
                "System setup job failed with APIError",
                action="system_setup_job_failed",
                job_id=str(job_id),
                error_code=exc.error,
                error_message=exc.message,
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            await SetupJobRecord.filter(id=job_id).update(
                status="failed",
                warnings=warnings,
                error_code="SETUP_JOB_FAILED",
                error_message=str(exc),
                finished_at=datetime.now(UTC),
            )
            self.logger.error(
                "System setup job failed",
                action="system_setup_job_failed",
                job_id=str(job_id),
                error=str(exc),
            )

    def _to_setup_job_out(self, job: SetupJobRecord) -> SystemSetupJobOut:
        return SystemSetupJobOut(
            job_id=job.id,
            status=cast(SystemSetupJobStatus, job.status),
            stage=cast(SystemSetupJobStage, job.stage),
            percent=job.percent,
            created_at=job.created_at,
        )

    def _to_setup_job_status_out(self, job: SetupJobRecord) -> SystemSetupJobStatusOut:
        return SystemSetupJobStatusOut(
            job_id=job.id,
            status=cast(SystemSetupJobStatus, job.status),
            stage=cast(SystemSetupJobStage, job.stage),
            percent=job.percent,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
            warnings=self._normalize_warnings(job.warnings),
            error_code=job.error_code,
            error_message=job.error_message,
            result=self._parse_setup_result(job),
        )

    @staticmethod
    def _normalize_warnings(raw: Any) -> list[str]:
        if not isinstance(raw, list):
            return []
        return [item for item in raw if isinstance(item, str) and item]

    def _parse_setup_result(self, job: SetupJobRecord) -> SystemSetupResult | None:
        if not isinstance(job.result, dict):
            return None
        try:
            return SystemSetupResult.model_validate(job.result)
        except ValidationError as exc:
            self.logger.warning(
                "System setup job result payload invalid",
                action="parse_system_setup_job_result",
                job_id=str(job.id),
                error=str(exc),
            )
            return None

    async def _emit_stage_progress(
        self,
        on_stage_change: Callable[[SystemSetupJobStage], Awaitable[None]] | None,
        stage: SystemSetupJobStage,
    ) -> None:
        if on_stage_change is None:
            return
        await on_stage_change(stage)

    async def _run_setup_dry_run(
        self,
        *,
        payload: SystemSetupRequest,
        on_stage_change: Callable[[SystemSetupJobStage], Awaitable[None]] | None,
        warnings: list[str],
    ) -> SystemSetupResult:
        for stage in ("precheck", "admin", "provision", "workspace", "finalize"):
            await self._emit_stage_progress(on_stage_change, cast(SystemSetupJobStage, stage))
            await asyncio.sleep(_DRY_RUN_STAGE_DELAY_SECONDS)

        admin = payload.admin
        organization = payload.organization
        now = datetime.now(UTC)

        if "DRY_RUN_NO_PERSIST" not in warnings:
            warnings.append("DRY_RUN_NO_PERSIST")

        organization_slug = None
        if organization is not None and organization.slug is not None:
            candidate_slug = organization.slug.strip()
            organization_slug = candidate_slug or None

        return SystemSetupResult(
            initialized_at=now,
            master_key_fingerprint="dry-run",
            admin_user_id=uuid4(),
            admin_username=admin.username,
            rbac_bootstrapped=True,
            organization_id=(uuid4() if organization is not None else None),
            organization_slug=organization_slug,
            organization_name=(organization.name if organization is not None else None),
        )

    async def run_setup(
        self,
        *,
        payload: SystemSetupRequest,
        on_stage_change: Callable[[SystemSetupJobStage], Awaitable[None]] | None = None,
        warnings: list[str] | None = None,
    ) -> SystemSetupResult:
        admin = payload.admin
        org = payload.organization
        master_key_b64 = payload.master_key.get_secret_value() if payload.master_key is not None else None
        warning_bucket = warnings if warnings is not None else []

        now, fp, user, rbac_ok, organization = await self.setup(
            admin_username=admin.username,
            admin_password=admin.password.get_secret_value(),
            admin_email=admin.email,
            admin_display_name=admin.display_name,
            organization_name=(org.name if org is not None else None),
            organization_slug=(org.slug if org is not None else None),
            organization_logo_url=(org.logo_url if org is not None else None),
            master_key_b64=master_key_b64,
            core_patch=payload.core_patch,
            on_stage_change=on_stage_change,
            warnings=warning_bucket,
        )
        return SystemSetupResult(
            initialized_at=now,
            master_key_fingerprint=fp,
            admin_user_id=user.id,
            admin_username=user.username,
            rbac_bootstrapped=rbac_ok,
            organization_id=(organization.id if organization is not None else None),
            organization_slug=(organization.slug if organization is not None else None),
            organization_name=(organization.name if organization is not None else None),
        )
