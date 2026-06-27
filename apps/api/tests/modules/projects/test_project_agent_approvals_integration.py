from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.agents.approval import AgentApprovalRecord, AgentApprovalStatus
from src.models.analytics.audit_event import AuditEvent
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.organization.repository import OrganizationRepository
from src.modules.projects.agents.approval_service import AGENT_APPROVAL_APPLIED_EVENT
from src.modules.tenancy.database import set_tenant_search_path
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from tests.utils.project_context import project_id_for_workspace

pytestmark = pytest.mark.integration


@asynccontextmanager
async def _tenant_conn(workspace_id: str) -> AsyncIterator[BaseDBAsyncClient]:
    workspace_uuid = decode_public_id(workspace_id)
    record = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_uuid)
    assert record is not None
    async with in_transaction() as conn:
        await set_tenant_search_path(conn, record.schema_name)
        yield conn


@asynccontextmanager
async def _workspace_client(prepared_db, integration_valkey_settings) -> AsyncIterator[tuple[AsyncClient, str, str]]:
    _ = prepared_db
    _ = integration_valkey_settings

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(get_settings())

        org_repo = OrganizationRepository()
        user_repo = UserRepository()
        org = await org_repo.create_organization(slug=f"agent-approval-{uuid4().hex}", name="Agent Approval Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email=f"owner_{uuid4().hex[:10]}@example.com",
            display_name="Owner",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        workspace = await Workspace.create(
            organization_id=org.id,
            name="Agent Approval Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        workspace_id = encode_uuid(workspace.id)

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            project_id = await project_id_for_workspace(client, workspace_id)
            site_res = await client.get(f"/api/v1/projects/{project_id}/site")
            assert site_res.status_code == 200, site_res.text
            yield client, workspace_id, project_id

        app.dependency_overrides.clear()


async def _create_article_model(client: AsyncClient, project_id: str) -> None:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/models",
        json={
            "singularKey": "article",
            "pluralKey": "articles",
            "name": "Article",
            "category": "content_library",
            "defaultEditor": "rich_text",
            "defaultRole": "article",
            "defaultPosture": "structured",
            "defaultSurface": "writing",
            "fields": [],
            "relations": [],
            "capabilities": ["publishable", "rich_text_editable"],
            "routing": {"mode": "none"},
            "workflow": {"states": []},
            "views": [],
        },
    )
    assert response.status_code == 201, response.text


async def _create_article_with_draft(client: AsyncClient, project_id: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json={"title": "Launch note", "locale": "en-US", "modelKey": "article"},
    )
    assert item_res.status_code == 201, item_res.text
    item = item_res.json()["data"]
    item_id = item["id"]

    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json={
            "presetKey": "post",
            "presetState": "selected",
            "capabilityPackIds": ["publishable", "rich_text_editable"],
        },
    )
    assert shape_res.status_code == 200, shape_res.text
    assert shape_res.json()["data"]["id"] == item_id

    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json={
            "expectedVersion": item["draftVersion"],
            "changeSummary": "Initial draft",
            "fieldsSnapshot": {
                "title": "Launch note",
                "summary": "Original summary",
                "body": "Original body",
            },
            "presentations": [
                {
                    "kind": "form_data",
                    "payload": {
                        "title": "Launch note",
                        "summary": "Original summary",
                        "body": "Original body",
                    },
                },
                {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
            ],
        },
    )
    assert draft_res.status_code == 201, draft_res.text
    assert draft_res.json()["data"]["versionNumber"] == 2
    return item_id


@pytest.mark.asyncio
async def test_agent_approval_apply_persists_canonical_draft_from_public_item_id(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    async def _core_settings(_settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:  # type: ignore[no-untyped-def]
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.writer"],
                "write_tools_enabled": True,
            }
        }

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, project_id)
        item_id = await _create_article_with_draft(client, project_id)

        dry_run_res = await client.post(
            f"/api/v1/projects/{project_id}/agents/approvals/dry-run",
            json={
                "targetId": item_id,
                "changeSummary": "AI rewrite",
                "fieldsSnapshot": {
                    "title": "Launch note",
                    "summary": "AI generated summary",
                    "body": "AI generated body",
                },
                "presentations": [
                    {
                        "kind": "form_data",
                        "payload": {
                            "title": "Launch note",
                            "summary": "AI generated summary",
                            "body": "AI generated body",
                        },
                    },
                    {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
                ],
            },
        )
        assert dry_run_res.status_code == 200, dry_run_res.text
        approval = dry_run_res.json()["data"]
        assert approval["targetId"] == item_id
        assert approval["targetSnapshot"]["contentItemId"] == item_id
        assert approval["expectedDraftVersion"] == 2
        assert approval["dryRun"]["willApply"] is False
        assert approval["dryRun"]["fieldChanges"] == [
            {"field": "body", "before": "Original body", "after": "AI generated body"},
            {"field": "summary", "before": "Original summary", "after": "AI generated summary"},
        ]

        approve_res = await client.post(
            f"/api/v1/projects/{project_id}/agents/approvals/{approval['id']}/approve",
            json={"reason": "Ready to apply"},
        )
        assert approve_res.status_code == 200, approve_res.text
        assert approve_res.json()["data"]["status"] == "approved"

        apply_res = await client.post(f"/api/v1/projects/{project_id}/agents/approvals/{approval['id']}/apply")
        assert apply_res.status_code == 200, apply_res.text
        applied = apply_res.json()["data"]
        assert applied["approval"]["status"] == "applied"
        assert applied["version"]["itemId"] == item_id
        assert applied["version"]["versionNumber"] == 3
        assert applied["version"]["fieldsSnapshot"]["summary"] == "AI generated summary"

        approval_row = await AgentApprovalRecord.get(id=decode_public_id(approval["id"]))
        assert approval_row.status == AgentApprovalStatus.APPLIED
        assert approval_row.applied_at is not None
        audit_event = await AuditEvent.filter(
            event_name=AGENT_APPROVAL_APPLIED_EVENT,
            entity_id=approval_row.id,
        ).first()
        assert audit_event is not None
        assert audit_event.workspace_id == decode_public_id(workspace_id)
        assert audit_event.actor_user_id is not None
        assert audit_event.entity_type == "agent_approval_content_item"
        assert audit_event.source == "agent"
        assert audit_event.trace_id is not None
        assert audit_event.properties["approval_id"] == approval["id"]
        assert audit_event.properties["project_id"] == str(decode_public_id(project_id))
        assert audit_event.properties["target_id"] == item_id
        assert audit_event.properties["action"] == "content_item.update_draft"
        assert audit_event.properties["correlation_id"] == audit_event.trace_id

        async with _tenant_conn(workspace_id) as conn:
            item_row = await ContentItemRecord.get(id=decode_public_id(item_id), using_db=conn)
            version_three = await ContentVersionRecord.get(item_id=item_row.id, version=3, using_db=conn)
        assert item_row.draft_version == 3
        assert version_three.fields_snapshot["summary"] == "AI generated summary"

        replay_res = await client.post(f"/api/v1/projects/{project_id}/agents/approvals/{approval['id']}/apply")
        assert replay_res.status_code == 409, replay_res.text
        assert "AGENT_APPROVAL_REPLAY" in replay_res.text


@pytest.mark.asyncio
async def test_agent_approval_list_pending_filter_expires_and_omits_stale_checkpoints(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    async def _core_settings(_settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:  # type: ignore[no-untyped-def]
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.writer"],
                "write_tools_enabled": True,
            }
        }

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_article_model(client, project_id)
        item_id = await _create_article_with_draft(client, project_id)

        dry_run_res = await client.post(
            f"/api/v1/projects/{project_id}/agents/approvals/dry-run",
            json={
                "targetId": item_id,
                "changeSummary": "Expired AI rewrite",
                "fieldsSnapshot": {
                    "title": "Launch note",
                    "summary": "Expired generated summary",
                    "body": "Expired generated body",
                },
                "presentations": [
                    {
                        "kind": "form_data",
                        "payload": {
                            "title": "Launch note",
                            "summary": "Expired generated summary",
                            "body": "Expired generated body",
                        },
                    }
                ],
            },
        )
        assert dry_run_res.status_code == 200, dry_run_res.text
        approval = dry_run_res.json()["data"]
        approval_id = approval["id"]

        approval_row = await AgentApprovalRecord.get(id=decode_public_id(approval_id))
        approval_row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        approval_row.status = AgentApprovalStatus.PENDING
        approval_row.expired_at = None
        await approval_row.save(update_fields=["expires_at", "status", "expired_at", "updated_at"])

        pending_res = await client.get(f"/api/v1/projects/{project_id}/agents/approvals?status=pending")
        assert pending_res.status_code == 200, pending_res.text
        assert [item["id"] for item in pending_res.json()["data"]["approvals"]] == []

        expired_row = await AgentApprovalRecord.get(id=decode_public_id(approval_id))
        assert expired_row.status == AgentApprovalStatus.EXPIRED
        assert expired_row.expired_at is not None

        expired_res = await client.get(f"/api/v1/projects/{project_id}/agents/approvals?status=expired")
        assert expired_res.status_code == 200, expired_res.text
        expired_approvals = expired_res.json()["data"]["approvals"]
        assert [item["id"] for item in expired_approvals] == [approval_id]
        assert expired_approvals[0]["status"] == "expired"
