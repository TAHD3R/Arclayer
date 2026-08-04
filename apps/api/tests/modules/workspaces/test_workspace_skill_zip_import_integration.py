from __future__ import annotations

import hashlib
import io
import json
import zipfile
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.tenancy.router_helpers import bind_workspace_tenant_context
from src.modules.workspaces.rbac.service import build_workspace_rbac_service
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository

pytestmark = pytest.mark.integration

_CSRF_ORIGIN = "http://testserver"


class _AllowCommercialPolicy:
    async def authorize(self, **_kwargs: object) -> None:
        return None


def _mutation_headers(client: AsyncClient, idempotency_key: str) -> dict[str, str]:
    csrf_token = client.cookies.get("csrf_token")
    assert csrf_token is not None
    return {
        "Idempotency-Key": idempotency_key,
        "Origin": _CSRF_ORIGIN,
        "X-CSRF-Token": csrf_token,
    }


def _skill_zip(*, comment: bytes = b"") -> bytes:
    metadata = {
        "slug": "zip-editorial-review",
        "displayName": "ZIP editorial review",
        "description": "Reviews content imported from a ZIP package.",
        "semanticVersion": "1.0.0",
        "capabilityTags": ["content.editorial"],
        "requiredTools": [],
        "permissions": [],
        "dataEgress": [],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("skill.json", json.dumps(metadata))
        archive.writestr("SKILL.md", "# Editorial review\n\nUse approved evidence only.")
        archive.writestr("references/checklist.md", "# Checklist\n\n- Cite claims")
        archive.comment = comment
    return buffer.getvalue()


async def _user() -> User:
    settings = get_settings()
    suffix = uuid4().hex[:8]
    return await UserRepository().create_user(
        username=f"zip_skills_owner_{suffix}",
        email=f"zip_skills_owner_{suffix}@example.com",
        display_name="ZIP Skills Owner",
        password_hash=hash_password("workspace_skills_password_123", settings.auth),
    )


async def _workspace(*, owner: User) -> Workspace:
    suffix = uuid4().hex[:10]
    organization = await Organization.create(
        slug=f"workspace-zip-skills-{suffix}",
        name="Workspace ZIP Skills Organization",
        owner_user_id=owner.id,
        is_active=True,
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    settings = get_settings()
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Workspace ZIP Skills",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    await build_workspace_rbac_service(settings).ensure_workspace_rbac_ready(workspace_id=workspace.id)
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    return workspace


async def test_workspace_skill_zip_import_persists_archive_authority_and_is_idempotent(
    prepared_db,
    monkeypatch,
) -> None:
    _ = prepared_db
    settings = get_settings()
    monkeypatch.setattr(
        "src.modules.workspaces.authz.http.service.build_restricted_recovery_command_policy",
        _AllowCommercialPolicy,
    )
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user()
        workspace = await _workspace(owner=owner)

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        base_url = f"/api/v1/workspaces/{encode_uuid(workspace.id)}/skills"
        archive = _skill_zip()
        files = {"package": ("editorial.zip", archive, "application/zip")}

        try:
            async with AsyncClient(transport=transport, base_url=_CSRF_ORIGIN) as client:
                await client.get("/api/v1/runtime")
                response = await client.post(
                    f"{base_url}/imports/zip",
                    headers=_mutation_headers(client, "workspace-skill-zip-editorial"),
                    files=files,
                )
                assert response.status_code == 201, response.text
                created = response.json()["data"]
                package = created["package"]
                version = created["version"]
                checksum = f"sha256:{hashlib.sha256(archive).hexdigest()}"

                assert package["sourceKind"] == "archive"
                assert package["trustLevel"] == "imported_unverified"
                assert version["sourceProvenance"] == {
                    "kind": "archive",
                    "filename": "editorial.zip",
                    "archiveChecksum": checksum,
                    "actorUserId": str(owner.id),
                }
                assert {resource["path"] for resource in version["resources"]} == {
                    "SKILL.md",
                    "references/checklist.md",
                }

                tenant_context = await bind_workspace_tenant_context(
                    workspace_id=workspace.id,
                    organization_id=workspace.organization_id,
                )
                package_record = await WorkspaceSkillsRepository(tenant_context).get_package(
                    workspace_id=workspace.id,
                    package_id=decode_public_id(package["id"]),
                )
                assert package_record is not None
                assert package_record.source_descriptor == {
                    "kind": "archive",
                    "filename": "editorial.zip",
                    "archiveChecksum": checksum,
                }

                replay = await client.post(
                    f"{base_url}/imports/zip",
                    headers=_mutation_headers(client, "workspace-skill-zip-editorial"),
                    files=files,
                )
                assert replay.status_code == 201, replay.text
                assert replay.json()["data"]["package"]["id"] == package["id"]
                assert replay.json()["data"]["version"]["id"] == version["id"]

                changed_archive = _skill_zip(comment=b"same logical package, different archive")
                conflict = await client.post(
                    f"{base_url}/imports/zip",
                    headers=_mutation_headers(client, "workspace-skill-zip-editorial"),
                    files={"package": ("editorial.zip", changed_archive, "application/zip")},
                )
                assert conflict.status_code == 409, conflict.text
                assert conflict.json()["error"] == "SKILL_IDEMPOTENCY_CONFLICT"

                wrong_format = await client.post(
                    f"{base_url}/imports/zip",
                    headers=_mutation_headers(client, "workspace-skill-zip-wrong-format"),
                    files={"package": ("editorial.txt", archive, "text/plain")},
                )
                assert wrong_format.status_code == 400, wrong_format.text
                assert wrong_format.json()["error"] == "SKILL_ZIP_FORMAT_UNSUPPORTED"

                assert (
                    await AuditEvent.filter(
                        workspace_id=workspace.id,
                        event_name="workspace.skill.package.created",
                        entity_id=decode_public_id(package["id"]),
                    ).count()
                    == 1
                )
        finally:
            app.dependency_overrides.clear()
