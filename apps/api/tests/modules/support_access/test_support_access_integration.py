from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from src.config import get_settings
from src.core.exceptions import Conflict
from src.core.exceptions.handlers import init_exception_handlers
from src.models.analytics.audit_event import AuditEvent
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.platform_identity.identity import PlatformOperator, PlatformOperatorStatus
from src.models.platform_identity.roles import (
    PlatformOperatorRoleAssignment,
    PlatformPermission,
    PlatformRole,
    PlatformRoleKind,
    PlatformRoleRevision,
    PlatformRoleRevisionPermission,
)
from src.models.projects.project import ProjectRecord
from src.models.sites.site import SiteRecord
from src.models.support_access import SupportAccessGrant, SupportAccessGrantState
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user_id
from src.modules.platform_identity.http import get_current_platform_session
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.support_access.platform_router import router as platform_router
from src.modules.support_access.router import router as workspace_router
from src.modules.support_access.schema import SupportAccessGrantCreate, SupportAccessScopeIn
from src.modules.support_access.service import SupportAccessService
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from src.modules.workspaces.http.service import get_workspace_context

pytestmark = pytest.mark.integration


async def _user(*, label: str) -> User:
    suffix = uuid4().hex[:12]
    return await User.create(username=f"support-{label}-{suffix}", email=f"{label}-{suffix}@example.com")


async def _workspace(*, owner: User) -> Workspace:
    suffix = uuid4().hex[:12]
    organization = await Organization.create(slug=f"support-{suffix}", name="Support")
    return await Workspace.create(
        organization_id=organization.id,
        name="Support",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )


async def _project(*, workspace: Workspace, label: str) -> ProjectRecord:
    return await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"support-{label}-{uuid4().hex[:8]}",
        name=f"Support {label}",
    )


async def _support_operator(*, user: User) -> tuple[PlatformOperator, PlatformOperatorRoleAssignment]:
    permission = await PlatformPermission.create(
        code=PlatformPermissionCode.TENANT_SUPPORT_READ,
        owner_domain="tenant-governance",
        name_i18n="platform.permission.tenant_support_read.name",
        description_i18n="platform.permission.tenant_support_read.description",
        is_delegable=True,
        is_active=True,
    )
    role = await PlatformRole.create(
        code="tenant-governance-operator",
        kind=PlatformRoleKind.BUILT_IN,
        name="Tenant Governance Operator",
        is_active=True,
    )
    revision = await PlatformRoleRevision.create(role_id=role.id, sequence=1, is_current=True)
    await PlatformRoleRevisionPermission.create(role_revision_id=revision.id, permission_id=permission.id)
    operator = await PlatformOperator.create(
        user_id=user.id,
        status=PlatformOperatorStatus.ACTIVE,
        activated_at=datetime.now(UTC),
    )
    assignment = await PlatformOperatorRoleAssignment.create(
        operator_id=operator.id,
        role_id=role.id,
        assigned_by_user_id=user.id,
        started_at=datetime.now(UTC),
    )
    return operator, assignment


def _grant_command(*, operator_user_id: UUID, project_id: UUID | None, case_id: str) -> SupportAccessGrantCreate:
    return SupportAccessGrantCreate(
        case_id=case_id,
        reason="Customer requested support investigation",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        operator_user_ids=(operator_user_id,),
        scopes=(SupportAccessScopeIn(project_id=project_id, content_category="content_items"),),
    )


def _platform_principal(*, operator: PlatformOperator) -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=operator.user_id,
        session_id=uuid4(),
        operator_id=operator.id,
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
    )


def _platform_app(*, principal: PlatformSessionPrincipal) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(platform_router)

    async def _current_platform_session() -> PlatformSessionPrincipal:
        return principal

    app.dependency_overrides[get_current_platform_session] = _current_platform_session
    return app


def _workspace_app(*, context: WorkspaceContext, user_id: UUID) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(workspace_router)

    async def _workspace_context() -> WorkspaceContext:
        return context

    async def _current_user_id() -> UUID:
        return user_id

    app.dependency_overrides[get_workspace_context] = _workspace_context
    app.dependency_overrides[get_current_user_id] = _current_user_id
    return app


async def _content(*, workspace: Workspace, project: ProjectRecord, title: str, body: dict[str, object]) -> None:
    site = await SiteRecord.create(
        workspace_id=workspace.id,
        project_id=project.id,
        slug=f"support-{uuid4().hex[:12]}",
        name="Support content",
    )
    item = await ContentItemRecord.create(
        workspace_id=workspace.id,
        site_id=site.id,
        slug=f"support-{uuid4().hex[:12]}",
        title=title,
        locale="en-US",
        draft_version=1,
    )
    await ContentVersionRecord.create(item_id=item.id, version=1, fields_snapshot=body)


async def _projection(
    client: AsyncClient,
    *,
    workspace_id: UUID,
    project_id: UUID | None,
    case_id: str,
    page: int,
    grant_revision: int | None = None,
    continuation: str | None = None,
) -> Response:
    params: dict[str, str | int] = {
        "workspace_id": str(workspace_id),
        "category": "content_items",
        "case_id": case_id,
        "page": page,
        "size": 1,
    }
    if project_id is not None:
        params["project_id"] = str(project_id)
    if grant_revision is not None:
        params["grant_revision"] = grant_revision
    if continuation is not None:
        params["continuation"] = continuation
    return await client.get(
        "/projection",
        params=params,
    )


async def test_0084_support_permission_role_edge_and_project_scope_are_real_postgres_constraints(db_schema) -> None:
    _ = db_schema
    owner = await _user(label="owner")
    operator_user = await _user(label="operator")
    _operator, _assignment = await _support_operator(user=operator_user)
    workspace = await _workspace(owner=owner)
    in_scope_project = await _project(workspace=workspace, label="in-scope")
    other_workspace = await _workspace(owner=owner)
    foreign_project = await _project(workspace=other_workspace, label="foreign")

    permission = await PlatformPermission.get(code=PlatformPermissionCode.TENANT_SUPPORT_READ)
    role_edge = await PlatformRoleRevisionPermission.filter(
        permission_id=permission.id,
        role_revision__role__code="tenant-governance-operator",
        role_revision__is_current=True,
    ).exists()
    assert role_edge is True

    created = await SupportAccessService().create(
        workspace_id=workspace.id,
        owner_user_id=owner.id,
        command=_grant_command(operator_user_id=operator_user.id, project_id=in_scope_project.id, case_id="CASE-0084"),
    )
    assert created.workspace_id == workspace.id
    assert created.revision == 1

    with pytest.raises(Conflict, match="SUPPORT_ACCESS_PROJECT_SCOPE_INVALID"):
        await SupportAccessService().create(
            workspace_id=workspace.id,
            owner_user_id=owner.id,
            command=_grant_command(
                operator_user_id=operator_user.id, project_id=foreign_project.id, case_id="CASE-FOREIGN"
            ),
        )


async def test_workspace_owner_only_creates_revokes_and_reads_grant_history(db_schema) -> None:
    _ = db_schema
    owner = await _user(label="owner")
    non_owner = await _user(label="non-owner")
    operator_user = await _user(label="operator")
    await _support_operator(user=operator_user)
    workspace = await _workspace(owner=owner)
    project = await _project(workspace=workspace, label="owned")
    owner_context = WorkspaceContext(
        workspace_id=workspace.id,
        organization_id=workspace.organization_id,
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=uuid4(),
        is_workspace_owner=True,
    )
    app = _workspace_app(context=owner_context, user_id=owner.id)
    command = _grant_command(operator_user_id=operator_user.id, project_id=project.id, case_id="CASE-HISTORY")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            f"/workspaces/{workspace.id}/support-access/grants", json=command.model_dump(mode="json")
        )
        assert created.status_code == 200, created.text
        grant_id = UUID(created.json()["data"]["id"])
        revoked = await client.post(f"/workspaces/{workspace.id}/support-access/grants/{grant_id}/revoke")
        assert revoked.status_code == 200, revoked.text
        history = await client.get(f"/workspaces/{workspace.id}/support-access/grants")
        assert history.status_code == 200, history.text
        assert len(history.json()["data"]) == 1
        assert history.json()["data"][0]["state"] == SupportAccessGrantState.REVOKED

    non_owner_context = owner_context.model_copy(update={"is_workspace_owner": False})
    denied_app = _workspace_app(context=non_owner_context, user_id=non_owner.id)
    transport = ASGITransport(app=denied_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        denied = await client.post(
            f"/workspaces/{workspace.id}/support-access/grants",
            json=_grant_command(
                operator_user_id=operator_user.id,
                project_id=project.id,
                case_id="CASE-NOT-OWNER",
            ).model_dump(mode="json"),
        )
    assert denied.status_code == 403
    assert await SupportAccessGrant.filter(workspace_id=workspace.id).count() == 1


async def test_projection_requires_exact_permission_active_named_operator_and_exact_grant_scope(db_schema) -> None:
    _ = db_schema
    owner = await _user(label="owner")
    operator_user = await _user(label="operator")
    operator, _assignment = await _support_operator(user=operator_user)
    workspace = await _workspace(owner=owner)
    project = await _project(workspace=workspace, label="scoped")
    other_project = await _project(workspace=workspace, label="other")
    grant = await SupportAccessService().create(
        workspace_id=workspace.id,
        owner_user_id=owner.id,
        command=_grant_command(operator_user_id=operator_user.id, project_id=project.id, case_id="CASE-SCOPE"),
    )
    app = _platform_app(principal=_platform_principal(operator=operator))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        allowed = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=1,
        )
        wrong_case = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id="CASE-WRONG",
            page=1,
        )
        wrong_project = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=other_project.id,
            case_id=grant.case_id,
            page=1,
        )
        stale_grant_revision = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=1,
            grant_revision=grant.revision + 1,
        )
        wrong_category = await client.get(
            "/projection",
            params={
                "workspace_id": str(workspace.id),
                "project_id": str(project.id),
                "category": "other",
                "case_id": grant.case_id,
            },
        )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["data"]["grantRevision"] == grant.revision
    assert "continuation" not in allowed.json()["data"]
    assert wrong_case.status_code == wrong_project.status_code == 403
    assert wrong_category.status_code == 422
    assert stale_grant_revision.status_code == 403

    operator.status = PlatformOperatorStatus.DEACTIVATED
    await operator.save(update_fields=["status"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        offboarded = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=1,
        )
    assert offboarded.status_code == 403

    operator.status = PlatformOperatorStatus.ACTIVE
    operator.revision += 1
    await operator.save(update_fields=["status", "revision"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        revision_changed = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=1,
        )
    assert revision_changed.status_code == 403


async def test_every_projection_page_rechecks_grant_expiry_revoke_permission_and_sanitizes_audit(db_schema) -> None:
    _ = db_schema
    owner = await _user(label="owner")
    operator_user = await _user(label="operator")
    operator, assignment = await _support_operator(user=operator_user)
    workspace = await _workspace(owner=owner)
    project = await _project(workspace=workspace, label="content")
    other_project = await _project(workspace=workspace, label="other-content")
    await _content(
        workspace=workspace,
        project=project,
        title="Scoped one",
        body={"summary": "safe", "secret": "must-not-leak", "token": "must-not-leak"},
    )
    await _content(
        workspace=workspace,
        project=project,
        title="Scoped two",
        body={"summary": "safe-two", "password": "must-not-leak"},
    )
    await _content(
        workspace=workspace,
        project=other_project,
        title="Foreign project",
        body={"summary": "foreign"},
    )
    grant = await SupportAccessService().create(
        workspace_id=workspace.id,
        owner_user_id=owner.id,
        command=_grant_command(operator_user_id=operator_user.id, project_id=project.id, case_id="CASE-PAGES"),
    )
    app = _platform_app(principal=_platform_principal(operator=operator))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first_page = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=1,
        )
        missing_preconditions = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=2,
        )
        first_data = first_page.json()["data"]
        second_page = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=2,
            grant_revision=first_data["grantRevision"],
            continuation=first_data["continuation"],
        )
    assert first_page.status_code == second_page.status_code == 200
    assert missing_preconditions.status_code == 403
    assert "continuation" in first_data
    assert "continuation" not in second_page.json()["data"]
    page_titles = {
        first_page.json()["data"]["items"][0]["title"],
        second_page.json()["data"]["items"][0]["title"],
    }
    assert page_titles == {"Scoped one", "Scoped two"}
    assert all("Foreign project" not in response.text for response in (first_page, second_page))
    assert "must-not-leak" not in first_page.text

    audit = await AuditEvent.filter(event_name="support_access.content.read").order_by("-occurred_at").first()
    assert audit is not None
    assert audit.properties is not None
    assert "body" not in audit.properties
    assert "secret" not in audit.properties

    await SupportAccessService().revoke(workspace_id=workspace.id, grant_id=grant.id, owner_user_id=owner.id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        revoked = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=2,
            grant_revision=first_data["grantRevision"],
            continuation=first_data["continuation"],
        )
    assert revoked.status_code == 403

    await SupportAccessGrant.filter(id=grant.id).update(
        state=SupportAccessGrantState.ACTIVE,
        expires_at=datetime.now(UTC) - timedelta(seconds=1),
        revision=grant.revision + 2,
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        expired = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=2,
            grant_revision=first_data["grantRevision"],
            continuation=first_data["continuation"],
        )
    assert expired.status_code == 403

    await SupportAccessGrant.filter(id=grant.id).update(expires_at=datetime.now(UTC) + timedelta(hours=1))
    await PlatformOperatorRoleAssignment.filter(id=assignment.id).update(ended_at=datetime.now(UTC))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        permission_lost = await _projection(
            client,
            workspace_id=workspace.id,
            project_id=project.id,
            case_id=grant.case_id,
            page=2,
            grant_revision=first_data["grantRevision"],
            continuation=first_data["continuation"],
        )
    assert permission_lost.status_code == 403
