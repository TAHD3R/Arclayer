from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

from pydantic import ValidationError

from apps.api.common.protocols.tortoise import HasOrganizationId, OrganizationLogoUrlMutableFields
from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import APIError, BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.modules.auth.repository import UserRepository
from apps.api.modules.auth.security import hash_password
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.organization.models.user import User
from apps.api.modules.provision.service import TenantProvisioningService
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.modules.system.models.setup_job import SetupJobRecord
from apps.api.modules.system.schema import (
    SystemMasterKeyRepairResult,
    SystemReinitializeResult,
    SystemSetupJobOut,
    SystemSetupJobStage,
    SystemSetupJobStatus,
    SystemSetupJobStatusOut,
    SystemSetupRequest,
    SystemSetupResult,
    SystemSetupStatus,
)
from apps.api.modules.system.settings.service import SettingsService
from apps.api.plugin.event_bus import Event
from apps.api.plugin.events import SYSTEM_SETUP_COMPLETED
from apps.api.plugin.manager import PluginManager
from apps.api.settings.crypto import ensure_master_key, master_key_exists


def _ts(key: str, default: str) -> str:
    return t("setup", key, default=default)


_FATAL_SYSTEM_SETUP_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)

_SETUP_RUNNING_STATUSES: tuple[SystemSetupJobStatus, ...] = ("pending", "running")
_SETUP_STAGE_PROGRESS: dict[SystemSetupJobStage, int] = {
    "precheck": 10,
    "admin": 35,
    "provision": 60,
    "workspace": 82,
    "finalize": 95,
}
_DRY_RUN_STAGE_DELAY_SECONDS = 0.28


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SYSTEM_SETUP_ERRORS):
        raise exc


class SystemSetupService(BaseService):
    _background_tasks: set[asyncio.Task[None]] = set()

    def __init__(self, settings: Settings, *, manager: PluginManager) -> None:
        super().__init__(settings)
        self.manager = manager
        self.user_repo = UserRepository()

    @staticmethod
    def _is_local_host(host: str | None) -> bool:
        return host in {"127.0.0.1", "::1", "localhost"}

    async def get_setup_status(self) -> SystemSetupStatus:
        initialized = await self.is_initialized()
        master_key_ready = master_key_exists(self.settings.setup.master_key_path)
        repair_required = bool(initialized and not master_key_ready)
        expected = self.settings.setup.token.get_secret_value() if self.settings.setup.token is not None else ""
        access = "token" if expected else "local_only"
        return SystemSetupStatus(
            initialized=initialized,
            master_key_ready=master_key_ready,
            repair_required=repair_required,
            repair_hint=("MASTER_KEY_REPAIR_REQUIRED" if repair_required else None),
            setup_enabled=self.settings.setup.enabled,
            access=access,
        )

    def validate_setup_access(self, *, client_host: str | None, setup_token: str | None) -> None:
        if not self.settings.setup.enabled:
            raise ServiceUnavailable(
                message=_ts("SETUP_DISABLED", "系统初始化接口已关闭"),
                error="SETUP_DISABLED",
            )

        expected = self.settings.setup.token.get_secret_value() if self.settings.setup.token is not None else ""
        if expected:
            if not setup_token or setup_token != expected:
                raise Forbidden(
                    message=_ts("SETUP_TOKEN_INVALID", "初始化令牌无效"),
                    error="SETUP_TOKEN_INVALID",
                )
        else:
            if not self._is_local_host(client_host):
                raise Forbidden(
                    message=_ts("SETUP_LOCAL_ONLY", "初始化接口仅允许本机访问"),
                    error="SETUP_LOCAL_ONLY",
                )

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
            raise Conflict(
                message=_ts("SETUP_JOB_RUNNING", "系统初始化任务正在执行中"),
                error="SETUP_JOB_RUNNING",
            )

        warnings = ["DRY_RUN_NO_PERSIST"] if dry_run else []
        job = await SetupJobRecord.create(status="pending", stage="precheck", percent=0, warnings=warnings)
        self._spawn_setup_job_task(job_id=job.id, payload=payload, dry_run=dry_run)
        return self._to_setup_job_out(job)

    async def get_setup_job_status(self, *, job_id: UUID) -> SystemSetupJobStatusOut:
        job = await SetupJobRecord.get_or_none(id=job_id)
        if job is None:
            raise NotFound(
                message=_ts("SETUP_JOB_NOT_FOUND", "初始化任务不存在"),
                error="SETUP_JOB_NOT_FOUND",
            )
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
            warnings=warnings,
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

    async def is_initialized(self) -> bool:
        return await User.all().exists()

    async def repair_master_key(self, *, confirm_text: str) -> SystemMasterKeyRepairResult:
        if str(confirm_text or "").strip() != "REPAIR":
            raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="MASTER_KEY_REPAIR_CONFIRM_MISMATCH")

        if not await self.is_initialized():
            raise Conflict(message=_ts("SETUP_NOT_DONE", "系统尚未初始化"), error="SETUP_NOT_DONE")

        key_path = Path(self.settings.setup.master_key_path)
        created = not master_key_exists(key_path)
        key, fingerprint = ensure_master_key(key_path)

        try:
            await SettingsService(self.settings, manager=self.manager).patch_namespace(
                "core",
                patch={"system": {"master_key_fingerprint": fingerprint}},
                updated_by=None,
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Persist master key fingerprint failed",
                action="system_master_key_repair_persist_fingerprint",
                error=str(exc),
            )

        self.logger.info(
            "System master key repaired",
            action="system_master_key_repair",
            created=created,
            master_key_fingerprint=fingerprint,
            key_len=len(key),
        )

        return SystemMasterKeyRepairResult(
            master_key_ready=True,
            created=created,
            master_key_fingerprint=fingerprint,
        )

    async def reinitialize_self_host(
        self,
        *,
        organization_id: UUID,
        confirm_name: str,
    ) -> SystemReinitializeResult:
        if self.settings.application.deployment_mode != "self_host":
            raise Forbidden(
                message=_ts("SELF_HOST_ONLY", "仅自托管环境允许执行该操作"),
                error="SELF_HOST_ONLY",
            )

        organization = await Organization.get_or_none(id=organization_id)
        if organization is None:
            raise NotFound(message=_ts("NOT_FOUND", "资源不存在"), error="NOT_FOUND")

        if str(confirm_name or "").strip() != str(organization.name):
            raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="SYSTEM_REINITIALIZE_CONFIRM_NAME_MISMATCH")

        await SetupJobRecord.all().delete()
        await SettingRecord.all().delete()
        await Organization.all().delete()
        await User.all().delete()

        key_path = Path(self.settings.setup.master_key_path)
        if key_path.exists():
            key_path.unlink()

        self.logger.warning(
            "System reinitialized for self-host setup replay",
            action="system_reinitialize_self_host",
            organization_id=str(organization_id),
        )

        return SystemReinitializeResult(reinitialized=True, setup_required=True)

    async def setup(
        self,
        *,
        admin_username: str,
        admin_password: str,
        admin_email: str | None,
        admin_display_name: str | None,
        organization_name: str | None,
        organization_slug: str | None,
        organization_logo_url: str | None,
        master_key_b64: str | None,
        core_patch: dict[str, Any] | None,
        on_stage_change: Callable[[SystemSetupJobStage], Awaitable[None]] | None = None,
        warnings: list[str] | None = None,
    ) -> tuple[datetime, str, User, bool, Organization | None]:
        warning_bucket = warnings if warnings is not None else []

        if not self.settings.database.enabled:
            raise ServiceUnavailable(
                message=_ts("DB_REQUIRED", "系统初始化需要启用数据库"),
                error="DATABASE_DISABLED",
            )
        if await self.is_initialized():
            raise Conflict(message=_ts("SETUP_DONE", "系统已初始化"), error="SETUP_ALREADY_DONE")

        await self._emit_stage_progress(on_stage_change, "precheck")

        try:
            _key, fingerprint = ensure_master_key(
                self.settings.setup.master_key_path,
                provided_b64=master_key_b64,
            )
        except ValueError as exc:
            raise BadRequest(message=_ts("MASTER_KEY_INVALID", "系统密钥不合法"), error="MASTER_KEY_INVALID") from exc

        await self._emit_stage_progress(on_stage_change, "admin")

        if await self.user_repo.exists_username(admin_username):
            raise Conflict(message=_ts("USERNAME_EXISTS", "用户名已存在"), error="USERNAME_EXISTS")
        if admin_email and await self.user_repo.exists_email(admin_email):
            raise Conflict(message=_ts("EMAIL_EXISTS", "邮箱已存在"), error="EMAIL_EXISTS")

        password_hash = hash_password(admin_password, self.settings.auth)
        user = await self.user_repo.create_user(
            username=admin_username,
            email=admin_email,
            display_name=admin_display_name,
            password_hash=password_hash,
        )

        # Persist initial core settings (including secrets) using the same validation path as admin settings.
        now = datetime.now(UTC)
        raw_patch: dict[str, Any] = dict(core_patch or {})
        # System-scoped core settings should only contain instance metadata and safe defaults.
        # Workspace-scoped core settings should contain site identity, localization, seo, etc.
        system_patch: dict[str, Any] = {}
        system_patch.setdefault("system", {})
        if isinstance(system_patch["system"], dict):
            system_patch["system"]["initialized_at"] = now.isoformat()
            system_patch["system"]["master_key_fingerprint"] = fingerprint
        # Keep a global default workspace locale as a best-effort fallback for requests without workspace context.
        # This is used by LocaleMiddleware for API i18n when the URL doesn't include a workspace id.
        if isinstance(raw_patch.get("workspace_localization"), dict):
            system_patch["workspace_localization"] = raw_patch["workspace_localization"]

        await SettingsService(self.settings, manager=self.manager).patch_namespace(
            "core",
            patch=system_patch,
            updated_by=user.id,
        )

        await self._emit_stage_progress(on_stage_change, "provision")

        provisioning = TenantProvisioningService(self.settings)
        provisioned = await provisioning.ensure_user_bootstrap(
            user_id=user.id,
            source="setup",
            organization_name=organization_name,
            organization_slug=organization_slug,
            organization_logo_url=organization_logo_url,
            workspace_name=organization_name,
        )

        organization = None
        if provisioned.organization_id is not None:
            organization = await Organization.get_or_none(id=provisioned.organization_id)

        await self._emit_stage_progress(on_stage_change, "workspace")

        workspace_id = provisioned.workspace_id
        if workspace_id is not None:
            from apps.api.modules.workspaces.models.workspace import Workspace
            from apps.api.modules.workspaces.portal_url_policy import rewrite_workspace_slug_in_portal_url
            from apps.api.modules.workspaces.settings.service import WorkspaceSettingsService

            workspace_patch = {k: v for k, v in raw_patch.items() if k != "system"}
            # Best-effort: keep site.url aligned with the actual workspaceSlug.
            # This prevents mismatches when slug is auto-adjusted (reserved word / collision).
            ws = await Workspace.get_or_none(id=workspace_id)
            if ws is not None:
                site_section = workspace_patch.get("site")
                if isinstance(site_section, dict):
                    url_raw = site_section.get("url")
                    if isinstance(url_raw, str) and url_raw.strip():
                        site_section["url"] = rewrite_workspace_slug_in_portal_url(
                            url_raw,
                            workspace_slug=str(ws.slug),
                        )
            # Best-effort: if patch fails validation, setup should still succeed.
            try:
                await WorkspaceSettingsService(self.settings).patch_core(
                    workspace_id=workspace_id,
                    patch=workspace_patch,
                    updated_by=user.id,
                )
            except BaseException as exc:
                _raise_if_fatal(exc)
                warning_bucket.append("WORKSPACE_SETTINGS_PATCH_FAILED")
                self.logger.warning(
                    "Persist workspace core settings during setup failed",
                    action="setup_patch_workspace_core_settings",
                    error=str(exc),
                    workspace_id=str(workspace_id),
                    user_id=str(user.id),
                )

        await self._emit_stage_progress(on_stage_change, "finalize")

        # v2: RBAC is workspace-scoped for the admin console.
        # `TenantProvisioningService` ensures membership and baseline role binding.
        # Roles/permissions are synced on app startup (`ensure_rbac_ready`), so we treat this as ok.
        rbac_ok = True
        # Emit a best-effort event so plugins can react without hard coupling to setup flow.
        try:
            await self.manager.host.event_bus.publish(
                Event(
                    name=SYSTEM_SETUP_COMPLETED,
                    payload={"admin_user_id": str(user.id), "admin_username": user.username},
                    source="core",
                    actor_user_id=str(user.id),
                )
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            warning_bucket.append("SETUP_COMPLETED_EVENT_PUBLISH_FAILED")
            self.logger.warning(
                "System setup completion event publish failed",
                action="publish_system_setup_completed_event",
                event_name=SYSTEM_SETUP_COMPLETED,
                user_id=str(user.id),
                error=str(exc),
            )
        return now, fingerprint, user, rbac_ok, organization

    async def _ensure_default_workspace(self, *, org_id, owner_user_id, workspace_name: str) -> UUID | None:
        """
        v2 boundary model bootstrap:
        - Ensure OrgMembership exists and marks the setup user as owner.
        - Ensure there is at least one default Workspace under the organization.
        - Ensure the owner has an ACTIVE workspace membership for the created workspace.

        Note: This method is idempotent and best-effort; it should not break setup if it fails.
        """

        try:
            from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
            from apps.api.modules.system.rbac.service import RBACService
            from apps.api.modules.workspaces.models.workspace import (
                Workspace,
                WorkspaceMembership,
                WorkspaceMembershipRole,
                WorkspaceMembershipStatus,
            )

            await OrgMembership.get_or_create(
                user_id=owner_user_id,
                defaults={
                    "organization_id": org_id,
                    "role": OrgRole.OWNER,
                    "role_code": OrgRole.OWNER.value,
                    "status": "active",
                },
            )
            # If already exists, ensure owner + org_id match.
            orgm = await OrgMembership.get_or_none(user_id=owner_user_id)
            if orgm is not None:
                orgm_like = cast(HasOrganizationId, orgm)
                changed = False
                if str(orgm_like.organization_id) != str(org_id):
                    orgm_like.organization_id = org_id
                    changed = True
                if orgm.role != OrgRole.OWNER:
                    orgm.role = OrgRole.OWNER
                    changed = True
                if str(getattr(orgm, "role_code", "") or "").strip().lower() != OrgRole.OWNER.value:
                    orgm.role_code = OrgRole.OWNER.value
                    changed = True
                if orgm.status != "active":
                    orgm.status = "active"
                    changed = True
                if changed:
                    await orgm.save(update_fields=["organization_id", "role", "role_code", "status", "updated_at"])

            ws = await Workspace.filter(organization_id=org_id).order_by("created_at").first()
            if ws is None:
                name = (workspace_name or "Default").strip() or "Default"
                # Workspace.slug is globally unique (public portal identifier), so we must avoid
                # collisions across organizations even for bootstrap defaults.
                from apps.api.modules.workspaces.slug_policy import next_available_workspace_slug

                slug = await next_available_workspace_slug(
                    base_slug=name,
                    exists_fn=lambda candidate: Workspace.filter(slug=candidate).exists(),
                )
                ws = await Workspace.create(
                    organization_id=org_id,
                    slug=slug,
                    name=name,
                    is_active=True,
                    created_by_user_id=owner_user_id,
                )

            wsm, _ = await WorkspaceMembership.get_or_create(
                user_id=owner_user_id,
                workspace_id=ws.id,
                defaults={"status": WorkspaceMembershipStatus.ACTIVE},
            )
            if wsm.status != WorkspaceMembershipStatus.ACTIVE:
                wsm.status = WorkspaceMembershipStatus.ACTIVE
                await wsm.save(update_fields=["status", "updated_at"])

            # Ensure workspace Owner role binding for setup user.
            rbac = RBACService(self.settings)
            await rbac.ensure_workspace_system_roles(workspace_id=ws.id)
            role_owner = await rbac.repo.get_role_by_code(workspace_id=ws.id, code="owner")
            if role_owner is not None:
                await WorkspaceMembershipRole.get_or_create(membership_id=wsm.id, role_id=role_owner.id)
            return ws.id
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Ensure default workspace failed",
                action="ensure_default_workspace",
                error=str(exc),
                org_id=str(org_id),
                user_id=str(owner_user_id),
            )
            return None

    async def _create_default_organization(
        self,
        *,
        name: str | None,
        slug: str | None,
        logo_url: str | None,
        created_by_user_id,
    ) -> Organization:
        from apps.api.modules.organization.models.organization import Organization
        from apps.api.modules.organization.repository import OrganizationRepository

        repo = OrganizationRepository()
        # Defaults are intentionally conservative to keep setup friction low.
        org_name = (name or "Default").strip() or "Default"
        org_slug = (slug or "default").strip() or "default"

        # If an organization already exists (e.g. created by early-stage bootstrap),
        # try to reuse it to keep setup idempotent.
        org = await Organization.get_or_none(slug=org_slug)
        if org is None:
            existing = await Organization.all().order_by("created_at").all()
            if len(existing) == 1 and existing[0].slug == "default":
                # Safe path: a bootstrap-created default org on a fresh system.
                org = existing[0]
                org.slug = org_slug
                org.name = org_name
                cast(OrganizationLogoUrlMutableFields, org).logo_url = logo_url
                await org.save(update_fields=["slug", "name", "logo_url"])
            else:
                org = await repo.create_organization(slug=org_slug, name=org_name, logo_url=logo_url)
        else:
            # Update basic fields so setup acts as the first source of truth.
            changed = False
            if org.name != org_name:
                org.name = org_name
                changed = True
            if org.logo_url != logo_url:
                cast(OrganizationLogoUrlMutableFields, org).logo_url = logo_url
                changed = True
            if changed:
                await org.save(update_fields=["name", "logo_url"])

        return org

    # NOTE: v2 intentionally removes org-scoped RBAC bootstrap. Workspace-scoped membership roles
    # are handled by `_ensure_default_workspace`.
