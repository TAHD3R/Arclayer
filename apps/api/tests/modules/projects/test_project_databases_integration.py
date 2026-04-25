from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.projects.database import ProjectDatabaseCredentialRecord, ProjectDatabaseCredentialRole
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.organization.repository import OrganizationRepository
from src.modules.projects.databases.provisioning import (
    ProjectDatabaseCredentialRole as ProvisionerRole,
)
from src.modules.projects.databases.provisioning import (
    ProjectDatabaseProvisioner,
    ProvisionedDatabaseCredential,
    ProvisionedDatabaseInstance,
)
from src.modules.projects.databases.router import get_project_databases_service
from src.modules.projects.databases.service import ProjectDatabasesService
from tests.utils.project_context import project_context_ids

pytestmark = pytest.mark.integration


class FakeProvisioner(ProjectDatabaseProvisioner):
    def __init__(self) -> None:
        self.rotations: dict[str, str] = {}

    async def create_instance(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        engine,
        isolation_mode,
    ) -> ProvisionedDatabaseInstance:
        return ProvisionedDatabaseInstance(
            host="db.internal",
            port=5432,
            database_name=f"proj_{project_id.hex[:8]}",
            schema_name=f"env_{environment_id.hex[:8]}",
        )

    async def create_role(
        self, *, instance: ProvisionedDatabaseInstance, role: ProvisionerRole
    ) -> ProvisionedDatabaseCredential:
        return ProvisionedDatabaseCredential(
            role=role,
            username=f"{instance.database_name}_{role.value}",
            secret_ref=f"secret/{role.value}/initial",
            expires_at=datetime.now(tz=UTC) + timedelta(days=30),
        )

    async def rotate_credential(
        self,
        *,
        instance: ProvisionedDatabaseInstance,
        role: ProvisionerRole,
        username: str,
    ) -> ProvisionedDatabaseCredential:
        rotated_ref = f"secret/{role.value}/{uuid4().hex[:8]}"
        self.rotations[role.value] = rotated_ref
        return ProvisionedDatabaseCredential(
            role=role,
            username=username,
            secret_ref=rotated_ref,
            expires_at=datetime.now(tz=UTC) + timedelta(days=30),
        )

    async def create_backup(self, *, instance: ProvisionedDatabaseInstance) -> str:
        return f"{instance.database_name}/backup.dump"

    async def restore_backup(self, *, instance: ProvisionedDatabaseInstance, backup_key: str) -> None:
        return None


@asynccontextmanager
async def _database_client(prepared_db, integration_valkey_settings):
    _ = prepared_db
    _ = integration_valkey_settings

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(get_settings())
        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        workspace = await Workspace.create(
            organization_id=org.id,
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            workspace_id = encode_uuid(workspace.id)
            project_id, _runtime_id = await project_context_ids(client, workspace_id)
            yield app, client, workspace_id, project_id

        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_project_databases_require_explicit_provisioning_boundary_and_mask_secrets(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _database_client(prepared_db, integration_valkey_settings) as (app, client, _workspace_id, project_id):
        environments_res = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert environments_res.status_code == 200, environments_res.text
        development_id = next(
            item["id"] for item in environments_res.json()["data"]["items"] if item["key"] == "development"
        )

        unavailable_res = await client.post(
            f"/api/v1/projects/{project_id}/databases",
            json={"environmentId": development_id, "engine": "postgres", "isolationMode": "database"},
        )
        assert unavailable_res.status_code == 503, unavailable_res.text
        assert unavailable_res.json()["error"] == "PROJECT_DATABASE_PROVISIONING_UNAVAILABLE"

        fake = FakeProvisioner()
        app.dependency_overrides[get_project_databases_service] = lambda: ProjectDatabasesService(fake)

        create_res = await client.post(
            f"/api/v1/projects/{project_id}/databases",
            json={"environmentId": development_id, "engine": "postgres", "isolationMode": "database"},
        )
        assert create_res.status_code == 200, create_res.text
        database = create_res.json()["data"]["database"]
        assert database["environmentKey"] == "development"
        assert database["engine"] == "postgres"
        assert all(credential["secretRef"] == "********" for credential in database["credentials"])
        assert all(credential["secretSet"] is True for credential in database["credentials"])

        list_res = await client.get(f"/api/v1/projects/{project_id}/databases")
        assert list_res.status_code == 200, list_res.text
        assert len(list_res.json()["data"]["items"]) == 1

        database_id = database["id"]
        detail_res = await client.get(f"/api/v1/projects/{project_id}/databases/{database_id}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["migrations"] == []
        assert detail_res.json()["data"]["backups"] == []

        instance_id = decode_public_id(database_id)
        app_credential_before = await ProjectDatabaseCredentialRecord.get(
            instance_id=instance_id, role=ProjectDatabaseCredentialRole.APP
        )
        rotate_res = await client.post(
            f"/api/v1/projects/{project_id}/databases/{database_id}/credentials/rotate",
            json={"role": "app"},
        )
        assert rotate_res.status_code == 200, rotate_res.text

        app_credential_after = await ProjectDatabaseCredentialRecord.get(
            instance_id=instance_id, role=ProjectDatabaseCredentialRole.APP
        )
        assert app_credential_after.secret_ref != app_credential_before.secret_ref
        assert app_credential_after.rotated_at is not None
        rotated_app = next(
            credential
            for credential in rotate_res.json()["data"]["database"]["credentials"]
            if credential["role"] == "app"
        )
        assert rotated_app["secretRef"] == "********"
