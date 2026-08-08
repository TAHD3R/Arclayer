from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from src.config import get_settings
from src.core.database.orm import close_orm, init_orm
from src.models.organization.organization import Organization
from src.models.organization.user import User, UserCredential
from src.models.platform_identity.identity import (
    PlatformInstanceOwnership,
    PlatformOperator,
    PlatformOperatorStatus,
)
from src.models.platform_identity.roles import (
    PlatformOperatorRoleAssignment,
    PlatformPermission,
    PlatformRole,
    PlatformRoleKind,
    PlatformRoleRevision,
    PlatformRoleRevisionPermission,
)
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership
from src.modules.auth.tokens.service import hash_password
from src.modules.auth.two_factor.totp import generate_totp_code
from src.modules.platform_identity.mfa import PlatformMfaService
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.system.setup.service import InstanceSetupService
from src.settings.crypto import ensure_master_key

_PRODUCT_PASSWORD = "BrowserPass123!"
_PRODUCT_EMAIL = "browser.acceptance@example.com"
_PLATFORM_EMAIL = "browser.platform@example.com"
_OPERATOR_ROLE_CODE = "browser-acceptance-operator"


def _require_test_environment() -> Path:
    settings = get_settings()
    if settings.app_env != "test":
        raise RuntimeError("browser fixtures require APP_ENV=test")
    if settings.testing.database_name != os.environ.get("BROWSER_ACCEPTANCE_DATABASE_NAME"):
        raise RuntimeError("browser fixtures require the isolated browser acceptance database")
    fixture_path = os.environ.get("BROWSER_ACCEPTANCE_FIXTURE_PATH")
    if not fixture_path:
        raise RuntimeError("BROWSER_ACCEPTANCE_FIXTURE_PATH is required")
    return Path(fixture_path)


async def _create_product_principal() -> tuple[User, Workspace, ProjectRecord]:
    user = await User.create(
        username="browser-acceptance-user",
        email=_PRODUCT_EMAIL,
        display_name="Browser Acceptance User",
        email_verified_at=datetime.now(UTC),
    )
    await UserCredential.create(user_id=user.id, password_hash=hash_password(_PRODUCT_PASSWORD, get_settings().auth))
    organization = await Organization.create(
        slug="browser-acceptance-org",
        name="Browser Acceptance Organization",
        owner_user_id=user.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Browser Acceptance Workspace",
        owner_user_id=user.id,
        created_by_user_id=user.id,
    )
    await WorkspaceMembership.create(workspace_id=workspace.id, user_id=user.id)
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="browser-acceptance-project",
        name="Browser Acceptance Project",
        authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
        authoring_state=ProjectAuthoringState.READY,
        created_by_user_id=user.id,
    )
    return user, workspace, project


async def _create_platform_operator(*, assigned_by_user: User) -> tuple[str, str]:
    operator_user = await User.create(
        username="browser-acceptance-platform-operator",
        email=_PLATFORM_EMAIL,
        display_name="Browser Acceptance Platform Operator",
        email_verified_at=datetime.now(UTC),
    )
    await UserCredential.create(
        user_id=operator_user.id,
        password_hash=hash_password(_PRODUCT_PASSWORD, get_settings().auth),
    )
    owner = await User.create(
        username="browser-acceptance-instance-owner",
        email="browser.instance.owner@example.test",
        display_name="Browser Instance Owner",
        email_verified_at=datetime.now(UTC),
    )
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    setup_service = InstanceSetupService(get_settings())
    setup_service.write_install_lock(setup_service.build_install_lock_metadata(initialized_by_user_id=owner.id))
    permissions: list[PlatformPermission] = []
    for permission in PlatformPermissionCode:
        record, _created = await PlatformPermission.get_or_create(
            code=permission.value,
            defaults={
                "owner_domain": permission.value.split(":", maxsplit=2)[1],
                "name_i18n": permission.value,
                "description_i18n": permission.value,
                "is_delegable": True,
            },
        )
        permissions.append(record)
    role = await PlatformRole.create(
        code=_OPERATOR_ROLE_CODE,
        kind=PlatformRoleKind.CUSTOM,
        name="Browser Acceptance Operator",
        description="Real acceptance principal with explicit Platform role permissions.",
        created_by_user_id=assigned_by_user.id,
    )
    revision = await PlatformRoleRevision.create(
        role_id=role.id, sequence=1, is_current=True, created_by_user_id=assigned_by_user.id
    )
    await PlatformRoleRevisionPermission.bulk_create([
        PlatformRoleRevisionPermission(role_revision_id=revision.id, permission_id=permission.id)
        for permission in permissions
    ])
    operator = await PlatformOperator.create(
        user_id=operator_user.id,
        status=PlatformOperatorStatus.MFA_SETUP_REQUIRED,
        revision=1,
    )
    await PlatformOperatorRoleAssignment.create(
        operator_id=operator.id,
        role_id=role.id,
        assigned_by_user_id=owner.id,
        started_at=datetime.now(UTC),
    )
    settings = get_settings()
    ensure_master_key(settings.security.master_key_path)
    service = PlatformMfaService(settings)
    setup = await service.begin_totp_setup(
        user_id=operator_user.id,
        issuer="Arclayer Browser Acceptance",
        account_label=_PLATFORM_EMAIL,
    )
    # Consume the previous valid counter during fixture enrollment so the UI can use the
    # current counter immediately without triggering the one-time-code replay protection.
    code = generate_totp_code(setup.secret, at=datetime.now(UTC) - timedelta(seconds=30))
    await service.confirm_totp_setup(
        user_id=operator_user.id,
        method_id=setup.method_id,
        code=code,
        operator_id=operator.id,
    )
    return _PLATFORM_EMAIL, setup.secret


async def seed() -> None:
    fixture_path = _require_test_environment()
    settings = get_settings()
    await init_orm(settings)
    try:
        user, workspace, project = await _create_product_principal()
        platform_identifier, totp_secret = await _create_platform_operator(assigned_by_user=user)
        fixture_path.parent.mkdir(parents=True, exist_ok=True)
        fixture_path.write_text(
            json.dumps(
                {
                    "product": {
                        "email": _PRODUCT_EMAIL,
                        "password": _PRODUCT_PASSWORD,
                        "workspaceId": str(workspace.id),
                        "projectId": str(project.id),
                    },
                    "platform": {
                        "identifier": platform_identifier,
                        "password": _PRODUCT_PASSWORD,
                        "totpSecret": totp_secret,
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    finally:
        await close_orm()


if __name__ == "__main__":
    asyncio.run(seed())
