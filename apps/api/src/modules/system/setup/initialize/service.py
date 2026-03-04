from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID

from apps.api.src.common.protocols.logging import LoggerLike
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from apps.api.src.models.organization.organization import Organization
from apps.api.src.models.organization.user import User
from apps.api.src.modules.auth.tokens.service import hash_password
from apps.api.src.modules.provision.service import TenantProvisioningService
from apps.api.src.modules.system.schema import SystemSetupJobStage
from apps.api.src.modules.system.settings.service import SettingsService
from apps.api.src.modules.system.setup.shared.service import _raise_if_fatal, _ts
from apps.api.src.plugin.event_bus import Event, EventBus
from apps.api.src.plugin.events import SYSTEM_SETUP_COMPLETED
from apps.api.src.settings.crypto import ensure_master_key
from apps.api.src.settings.signing import ensure_signing_keypair


class _SystemSetupProgressEmitter(Protocol):
    async def _emit_stage_progress(
        self,
        on_stage_change: Callable[[SystemSetupJobStage], Awaitable[None]] | None,
        stage: SystemSetupJobStage,
    ) -> None: ...


class _SystemSetupAccess(Protocol):
    async def is_initialized(self) -> bool: ...


class _UserRepoForSetup(Protocol):
    async def exists_username(self, username: str) -> bool: ...

    async def exists_email(self, email: str) -> bool: ...

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
    ) -> User: ...


class SystemSetupInitializeMixin:
    settings: Settings
    event_bus: EventBus
    user_repo: object
    logger: LoggerLike

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
        core_patch: dict[str, object] | None,
        on_stage_change: Callable[[SystemSetupJobStage], Awaitable[None]] | None = None,
        warnings: list[str] | None = None,
    ) -> tuple[datetime, str, User, bool, Organization | None]:
        warning_bucket = warnings if warnings is not None else []

        if not self.settings.database.enabled:
            raise ServiceUnavailable(message=_ts("DB_REQUIRED", "系统初始化需要启用数据库"), error="DATABASE_DISABLED")
        if await cast(_SystemSetupAccess, self).is_initialized():
            raise Conflict(message=_ts("SETUP_DONE", "系统已初始化"), error="SETUP_ALREADY_DONE")

        await cast(_SystemSetupProgressEmitter, self)._emit_stage_progress(on_stage_change, "precheck")

        try:
            _key, fingerprint = ensure_master_key(
                self.settings.setup.master_key_path,
                provided_b64=master_key_b64,
            )
            _priv, _pub, signing_fp = ensure_signing_keypair(
                private_path=self.settings.setup.signing_private_key_path,
                public_path=self.settings.setup.signing_public_key_path,
            )
        except ValueError as exc:
            raise BadRequest(message=_ts("MASTER_KEY_INVALID", "系统密钥不合法"), error="MASTER_KEY_INVALID") from exc

        await cast(_SystemSetupProgressEmitter, self)._emit_stage_progress(on_stage_change, "admin")

        repo = cast(_UserRepoForSetup, self.user_repo)
        if await repo.exists_username(admin_username):
            raise Conflict(message=_ts("USERNAME_EXISTS", "用户名已存在"), error="USERNAME_EXISTS")
        if admin_email and await repo.exists_email(admin_email):
            raise Conflict(message=_ts("EMAIL_EXISTS", "邮箱已存在"), error="EMAIL_EXISTS")

        password_hash = hash_password(admin_password, self.settings.auth)
        user = await repo.create_user(
            username=admin_username,
            email=admin_email,
            display_name=admin_display_name,
            password_hash=password_hash,
        )

        now = datetime.now(UTC)
        raw_patch: dict[str, object] = dict(core_patch or {})
        system_patch: dict[str, object] = {}
        system_patch.setdefault("system", {})
        if isinstance(system_patch["system"], dict):
            system_patch["system"]["initialized_at"] = now.isoformat()
            system_patch["system"]["master_key_fingerprint"] = fingerprint
            system_patch["system"]["signing_key_fingerprint"] = signing_fp
        if isinstance(raw_patch.get("workspace_localization"), dict):
            system_patch["workspace_localization"] = raw_patch["workspace_localization"]

        await SettingsService(self.settings, event_bus=self.event_bus).patch_namespace(
            "core",
            patch=system_patch,
            updated_by=UUID(str(user.id)),
        )

        await cast(_SystemSetupProgressEmitter, self)._emit_stage_progress(on_stage_change, "provision")

        provisioning = TenantProvisioningService(self.settings)
        provisioned = await provisioning.ensure_user_bootstrap(
            user_id=UUID(str(user.id)),
            source="setup",
            organization_name=organization_name,
            organization_slug=organization_slug,
            organization_logo_url=organization_logo_url,
            workspace_name=organization_name,
        )

        organization = None
        if provisioned.organization_id is not None:
            organization = await Organization.get_or_none(id=provisioned.organization_id)

        await cast(_SystemSetupProgressEmitter, self)._emit_stage_progress(on_stage_change, "workspace")

        workspace_id = provisioned.workspace_id
        if workspace_id is not None:
            from apps.api.src.models.workspaces.workspace import Workspace
            from apps.api.src.modules.workspaces.portal.service import rewrite_workspace_slug_in_portal_url
            from apps.api.src.modules.workspaces.settings.service import WorkspaceSettingsService

            workspace_patch = {k: v for k, v in raw_patch.items() if k != "system"}
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
            try:
                await WorkspaceSettingsService(self.settings).patch_core(
                    workspace_id=workspace_id,
                    patch=workspace_patch,
                    updated_by=UUID(str(user.id)),
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

        await cast(_SystemSetupProgressEmitter, self)._emit_stage_progress(on_stage_change, "finalize")

        rbac_ok = True
        try:
            await self.event_bus.publish(
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
