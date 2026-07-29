from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.core.http.pagination import PageData, PageParams
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.auth.http.service import get_current_user_id
from src.modules.jobs.router import get_workspace_job_service
from src.modules.jobs.router import router as workspace_job_router
from src.modules.jobs.workspace_schema import (
    JobPublicStatus,
    WorkspaceJobCancelRequest,
    WorkspaceJobListQuery,
    WorkspaceJobOut,
)
from src.modules.jobs.workspace_service import WorkspaceJobService
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 18, tzinfo=UTC)
RAW_JOB_FIELDS = frozenset({
    "actorUserId",
    "authorityMode",
    "cancelReason",
    "cancelRequestedByUserId",
    "correlationId",
    "errorMessage",
    "errorMetadata",
    "heartbeatSeconds",
    "inputReference",
    "internalStatus",
    "leaseSeconds",
    "maxAttempts",
    "nextAttemptAt",
    "requestFingerprint",
    "resultReference",
    "retryClass",
    "sourceRevision",
    "targetDescriptor",
    "taskName",
    "timeoutSeconds",
    "traceId",
    "workspaceId",
})


@dataclass(frozen=True, slots=True)
class ListCall:
    workspace_id: UUID
    actor_user_id: UUID
    params: PageParams
    filters: WorkspaceJobListQuery


@dataclass(frozen=True, slots=True)
class GetCall:
    workspace_id: UUID
    job_id: UUID
    actor_user_id: UUID


@dataclass(frozen=True, slots=True)
class CancelCall:
    ctx: WorkspaceContext
    job_id: UUID
    actor_user_id: UUID
    payload: WorkspaceJobCancelRequest


class RecordingWorkspaceJobService:
    def __init__(self, *, result: WorkspaceJobOut, page: PageData[WorkspaceJobOut] | None = None) -> None:
        self.result = result
        self.page = page or PageData[WorkspaceJobOut](
            items=[result],
            total=1,
            page=1,
            size=20,
            pages=1,
            next=None,
            prev=None,
        )
        self.list_call: ListCall | None = None
        self.get_call: GetCall | None = None
        self.cancel_call: CancelCall | None = None

    async def list_jobs(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        params: PageParams,
        filters: WorkspaceJobListQuery,
    ) -> PageData[WorkspaceJobOut]:
        self.list_call = ListCall(workspace_id, actor_user_id, params, filters)
        return self.page

    async def get_job(
        self,
        *,
        workspace_id: UUID,
        job_id: UUID,
        actor_user_id: UUID,
    ) -> WorkspaceJobOut:
        self.get_call = GetCall(workspace_id, job_id, actor_user_id)
        return self.result

    async def request_cancellation(
        self,
        *,
        ctx: WorkspaceContext,
        job_id: UUID,
        actor_user_id: UUID,
        payload: WorkspaceJobCancelRequest,
    ) -> WorkspaceJobOut:
        self.cancel_call = CancelCall(ctx, job_id, actor_user_id, payload)
        return self.result


def _job_out(
    *,
    job_id: UUID,
    project_id: UUID,
    site_id: UUID,
    cancel_requested_at: datetime | None = None,
) -> WorkspaceJobOut:
    return WorkspaceJobOut(
        id=job_id,
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload=JobWorkloadClass.ASSET_CPU,
        status=JobPublicStatus.QUEUED,
        project_id=project_id,
        site_id=site_id,
        phase="queued",
        status_key="jobs.assetThumbnail.queued",
        progress_completed=1,
        progress_total=4,
        cancel_requested_at=cancel_requested_at,
        cancellation_acknowledged_at=None,
        started_at=None,
        completed_at=None,
        retry_of_job_id=None,
        error_code=None,
        has_result=False,
        created_at=NOW,
        updated_at=NOW,
    )


def _workspace_context(workspace_id: UUID) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=uuid4(),
    )


def _build_app(
    *,
    service: RecordingWorkspaceJobService,
    ctx: WorkspaceContext,
    user_id: UUID,
) -> FastAPI:
    async def _allow_route_rbac() -> None:
        return None

    async def _workspace_context_override() -> WorkspaceContext:
        return ctx

    async def _current_user_override() -> UUID:
        return user_id

    def _service_override() -> WorkspaceJobService:
        return cast(WorkspaceJobService, service)

    route_rbac_dependency = workspace_job_router.dependencies[0].dependency
    assert route_rbac_dependency is not None

    app = FastAPI()
    app.include_router(workspace_job_router, prefix="/api/v1")
    app.dependency_overrides[route_rbac_dependency] = _allow_route_rbac
    app.dependency_overrides[require_workspace_manage_access] = _workspace_context_override
    app.dependency_overrides[get_current_user_id] = _current_user_override
    app.dependency_overrides[get_workspace_job_service] = _service_override
    return app


def _assert_canonical_envelope(payload: dict[str, object]) -> None:
    assert payload.keys() == {"message", "data", "timestamp"}
    assert payload["message"] == "OK"
    assert isinstance(payload["timestamp"], int)


def _assert_safe_job_projection(payload: dict[str, object]) -> None:
    assert RAW_JOB_FIELDS.isdisjoint(payload)
    assert all("_" not in key for key in payload)


@pytest.mark.asyncio
async def test_list_workspace_jobs_returns_canonical_camel_case_page_and_forwards_filters() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    result = _job_out(job_id=uuid4(), project_id=project_id, site_id=uuid4())
    page = PageData[WorkspaceJobOut](
        items=[result],
        total=5,
        page=2,
        size=2,
        pages=3,
        next=3,
        prev=1,
    )
    service = RecordingWorkspaceJobService(result=result, page=page)
    ctx = _workspace_context(workspace_id)
    app = _build_app(service=service, ctx=ctx, user_id=user_id)

    query = {
        "page": "2",
        "size": "2",
        "status": "queued",
        "jobType": "asset.thumbnail.generate",
        "workload": "asset-cpu",
        "projectId": encode_uuid(project_id),
        "createdFrom": "2026-07-01T00:00:00Z",
        "createdTo": "2026-07-15T23:59:59Z",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/jobs",
            params=query,
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    _assert_canonical_envelope(payload)
    assert payload["data"] == {
        "items": [result.model_dump(mode="json", by_alias=True, exclude_none=True)],
        "total": 5,
        "page": 2,
        "size": 2,
        "pages": 3,
        "next": 3,
        "prev": 1,
    }
    _assert_safe_job_projection(payload["data"]["items"][0])
    assert service.list_call == ListCall(
        workspace_id=workspace_id,
        actor_user_id=user_id,
        params=PageParams(page=2, size=2),
        filters=WorkspaceJobListQuery(
            status=JobPublicStatus.QUEUED,
            job_type="asset.thumbnail.generate",
            workload=JobWorkloadClass.ASSET_CPU,
            project_id=project_id,
            created_from=datetime(2026, 7, 1, tzinfo=UTC),
            created_to=datetime(2026, 7, 15, 23, 59, 59, tzinfo=UTC),
        ),
    )


@pytest.mark.asyncio
async def test_get_workspace_job_decodes_public_uuid_and_forwards_canonical_service_arguments() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    job_id = uuid4()
    result = _job_out(job_id=job_id, project_id=uuid4(), site_id=uuid4())
    service = RecordingWorkspaceJobService(result=result)
    app = _build_app(service=service, ctx=_workspace_context(workspace_id), user_id=user_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/workspaces/{encode_uuid(workspace_id)}/jobs/{encode_uuid(job_id)}")

    assert response.status_code == 200, response.text
    payload = response.json()
    _assert_canonical_envelope(payload)
    assert payload["data"]["id"] == encode_uuid(job_id)
    assert payload["data"]["jobType"] == "asset.thumbnail.generate"
    assert payload["data"]["jobTypeVersion"] == 1
    _assert_safe_job_projection(payload["data"])
    assert service.get_call == GetCall(
        workspace_id=workspace_id,
        job_id=job_id,
        actor_user_id=user_id,
    )


@pytest.mark.asyncio
async def test_cancel_workspace_job_keeps_queued_status_and_exposes_cancellation_request_time() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    job_id = uuid4()
    result = _job_out(
        job_id=job_id,
        project_id=uuid4(),
        site_id=uuid4(),
        cancel_requested_at=NOW,
    )
    service = RecordingWorkspaceJobService(result=result)
    ctx = _workspace_context(workspace_id)
    app = _build_app(service=service, ctx=ctx, user_id=user_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/jobs/{encode_uuid(job_id)}/cancel",
            json={"reason": "No longer needed"},
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    _assert_canonical_envelope(payload)
    assert payload["data"]["status"] == "queued"
    assert payload["data"]["cancelRequestedAt"] == "2026-07-15T18:00:00Z"
    _assert_safe_job_projection(payload["data"])
    assert service.cancel_call == CancelCall(
        ctx=ctx,
        job_id=job_id,
        actor_user_id=user_id,
        payload=WorkspaceJobCancelRequest(reason="No longer needed"),
    )
