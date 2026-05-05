from __future__ import annotations

from typing import Any

import pytest

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.models.analytics.audit_event import AuditEvent
from src.models.projects.membership import ProjectMembership
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_content_model,
    _create_page_model,
    _workspace_client,
)
from tests.modules.workspaces.publish.test_publish_integration import _draft_payload, _item_payload

pytestmark = pytest.mark.integration


async def _create_publish_candidate(client, project_id: str, workspace_id: str) -> str:
    await _create_page_model(client, workspace_id)
    return await _create_publish_candidate_for_existing_model(client, project_id)


async def _create_publish_candidate_for_existing_model(client, project_id: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_item_payload("home", "Home"),
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]

    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert shape_res.status_code == 200, shape_res.text

    item_detail_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}")
    assert item_detail_res.status_code == 200, item_detail_res.text
    draft_payload = _draft_payload("Home", path="/")
    draft_payload["expectedVersion"] = item_detail_res.json()["data"]["draftVersion"]

    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=draft_payload,
    )
    assert draft_res.status_code == 201, draft_res.text
    return item_id


async def _latest_draft_version(client, project_id: str, item_id: str) -> int:
    item_detail_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}")
    assert item_detail_res.status_code == 200, item_detail_res.text
    return int(item_detail_res.json()["data"]["draftVersion"])


async def _project_owner_user_id(project_id: str) -> str:
    membership = await ProjectMembership.get(project_id=decode_public_id(project_id))
    return encode_uuid(membership.user_id)


async def _create_review_model_with_workflow(client, project_id: str, workflow: dict[str, Any]) -> dict[str, Any]:
    return await _create_content_model(
        client,
        project_id,
        singularKey="reviewEntry",
        pluralKey="reviewEntries",
        name="Review Entry",
        category="content_library",
        capabilities=["publishable"],
        defaultRole="data",
        defaultPosture="structured",
        defaultSurface="structured",
        workflow=workflow,
    )


async def _create_review_publish_candidate_for_existing_model(client, project_id: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json={"title": "Review entry", "locale": "en-US", "modelKey": "reviewEntry"},
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]

    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json={
            "expectedVersion": await _latest_draft_version(client, project_id, item_id),
            "changeSummary": "initial draft",
            "fieldsSnapshot": {"title": "Review entry"},
            "presentations": [{"kind": "form_data", "payload": {"title": "Review entry"}}],
        },
    )
    assert draft_res.status_code == 201, draft_res.text
    return item_id


@pytest.mark.asyncio
async def test_content_item_publish_requires_approved_workflow_stage(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        item_id = await _create_publish_candidate(client, project_id, workspace_id)

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{await _latest_draft_version(client, project_id, item_id)}/publish",
            json={},
        )
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "CONTENT_WORKFLOW_GATE_FAILED"


@pytest.mark.asyncio
async def test_content_item_workflow_patch_enables_publish_after_approval(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        item_id = await _create_publish_candidate(client, project_id, workspace_id)

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={
                "stage": "approved",
                "summary": "Editorial review approved",
                "note": {"body": "Ready for release"},
            },
        )
        assert workflow_res.status_code == 200, workflow_res.text
        workflow_data = workflow_res.json()["data"]
        assert workflow_data["workflowStage"] == "approved"
        assert workflow_data["publishReadiness"]["ready"] is True

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{await _latest_draft_version(client, project_id, item_id)}/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_content_item_workflow_rejects_unconfigured_stage_transition(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_review_model_with_workflow(
            client,
            project_id,
            workflow={
                "stages": ["drafting", "in_review", "approved"],
                "transitions": [{"fromStage": "drafting", "toStage": "in_review"}],
                "publishStage": "approved",
            },
        )
        item_id = await _create_review_publish_candidate_for_existing_model(client, project_id)

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={"stage": "approved"},
        )

        assert workflow_res.status_code == 409, workflow_res.text
        assert workflow_res.json()["error"] == "CONTENT_WORKFLOW_TRANSITION_INVALID"


@pytest.mark.asyncio
async def test_content_item_workflow_enforces_role_stage_assignment(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_review_model_with_workflow(
            client,
            project_id,
            workflow={
                "stages": ["drafting", "in_review", "approved"],
                "transitions": [{"fromStage": "drafting", "toStage": "in_review"}],
                "stageAssignments": [{"stage": "in_review", "roleCodes": ["editor"]}],
                "publishStage": "approved",
            },
        )
        item_id = await _create_review_publish_candidate_for_existing_model(client, project_id)

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={"stage": "in_review"},
        )

        assert workflow_res.status_code == 403, workflow_res.text
        assert workflow_res.json()["error"] == "CONTENT_WORKFLOW_STAGE_ASSIGNEE_REQUIRED"


@pytest.mark.asyncio
async def test_content_item_workflow_allows_user_stage_assignment_without_activity_ingest(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        owner_user_id = await _project_owner_user_id(project_id)
        await _create_review_model_with_workflow(
            client,
            project_id,
            workflow={
                "stages": ["drafting", "in_review", "approved"],
                "transitions": [{"fromStage": "drafting", "toStage": "in_review"}],
                "stageAssignments": [{"stage": "in_review", "userIds": [owner_user_id]}],
                "publishStage": "approved",
            },
        )
        item_id = await _create_review_publish_candidate_for_existing_model(client, project_id)

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={"stage": "in_review", "assigneeUserId": owner_user_id},
        )

        assert workflow_res.status_code == 200, workflow_res.text
        workflow_data = workflow_res.json()["data"]
        assert workflow_data["workflowStage"] == "in_review"
        assert workflow_data["workflowAssigneeUserId"] == owner_user_id

        assert (
            await AuditEvent.filter(
                event_name="project.content.item.workflow.updated",
                workspace_id=decode_public_id(workspace_id),
                entity_id=decode_public_id(item_id),
            ).count()
            == 0
        )


@pytest.mark.asyncio
async def test_content_item_workflow_enforces_stage_transition_permission(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_review_model_with_workflow(
            client,
            project_id,
            workflow={
                "stages": ["drafting", "in_review", "approved"],
                "transitions": [{"fromStage": "drafting", "toStage": "in_review"}],
                "stagePermissions": [{"stage": "drafting", "roleCodes": ["editor"]}],
                "publishStage": "approved",
            },
        )
        item_id = await _create_review_publish_candidate_for_existing_model(client, project_id)

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={"stage": "in_review"},
        )

        assert workflow_res.status_code == 403, workflow_res.text
        assert workflow_res.json()["error"] == "CONTENT_WORKFLOW_STAGE_PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_content_item_publish_uses_configured_publish_stage(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        await _create_review_model_with_workflow(
            client,
            project_id,
            workflow={
                "stages": ["drafting", "in_review", "approved"],
                "transitions": [
                    {"fromStage": "drafting", "toStage": "in_review"},
                    {"fromStage": "in_review", "toStage": "approved"},
                ],
                "publishStage": "in_review",
            },
        )
        item_id = await _create_review_publish_candidate_for_existing_model(client, project_id)

        blocked_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{await _latest_draft_version(client, project_id, item_id)}/publish",
            json={},
        )
        assert blocked_res.status_code == 409, blocked_res.text
        assert blocked_res.json()["error"] == "CONTENT_WORKFLOW_GATE_FAILED"
        assert blocked_res.json()["meta"]["workflowStage"] == "drafting"
        assert blocked_res.json()["meta"]["publishStage"] == "in_review"

        workflow_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
            json={"stage": "in_review"},
        )
        assert workflow_res.status_code == 200, workflow_res.text

        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{await _latest_draft_version(client, project_id, item_id)}/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
