from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.exceptions import NotFound, init_exception_handlers
from src.core.http.pagination import PageData, PageParams
from src.models.jobs.background_job import (
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.jobs.platform_router import get_platform_job_service
from src.modules.jobs.platform_router import router as platform_jobs_router
from src.modules.jobs.platform_schema import (
    PlatformJobDetailOut,
    PlatformJobListQuery,
    PlatformJobOut,
    PlatformJobQueueOut,
    PlatformJobQueuesOut,
)
from src.modules.jobs.platform_service import PlatformJobService
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
)
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

pytestmark = pytest.mark.unit

NOW = datetime(2026, 8, 27, 12, tzinfo=UTC)
RAW_JOB_LIST_FIELDS = frozenset({
    "actorUserId",
    "authorityMode",
    "cancelReason",
    "cancelRequestedByUserId",
    "continuationReference",
    "errorMessage",
    "errorMetadata",
    "fencingToken",
    "heartbeatSeconds",
    "idempotencyKeyHash",
    "idempotencyScopeKey",
    "inputReference",
    "internalStatus",
    "leaseSeconds",
    "leaseUntil",
    "requestFingerprint",
    "resultReference",
    "retryClass",
    "retryPolicy",
    "sourceRevision",
    "targetDescriptor",
    "taskName",
    "timeoutSeconds",
    "traceId",
})


class RecordingPlatformJobService:
    def __init__(
        self,
        *,
        detail: PlatformJobDetailOut | None = None,
        raise_not_found: bool = False,
    ) -> None:
        self.detail = detail
        self.raise_not_found = raise_not_found
        self.queue_call: int | None = None
        self.list_call: tuple[PageParams, PlatformJobListQuery] | None = None
        self.get_call: object | None = None

    async def queue_overview(self, *, window_hours: int) -> PlatformJobQueuesOut:
        self.queue_call = window_hours
        return PlatformJobQueuesOut(
            window_hours=window_hours,
            queues=[
                PlatformJobQueueOut(
                    workload=JobWorkloadClass.ASSET_CPU,
                    stream_name="arclayer:jobs:asset-cpu",
                    pending_dispatch_jobs=1,
                    queued_jobs=0,
                    running_jobs=2,
                    retry_scheduled_jobs=1,
                    waiting_for_user_jobs=0,
                    failed_jobs_in_window=3,
                    dead_lettered_jobs_in_window=1,
                    outbox_in_flight_dispatches=2,
                    outbox_dead_lettered_dispatches=0,
                    oldest_backlog_created_at=NOW - timedelta(hours=1),
                    oldest_backlog_next_attempt_at=NOW + timedelta(minutes=5),
                ),
            ],
        )

    async def list_jobs(
        self,
        *,
        params: PageParams,
        filters: PlatformJobListQuery,
    ) -> PageData[PlatformJobOut]:
        self.list_call = (params, filters)
        item = PlatformJobOut(
            id=uuid4(),
            job_type="asset.thumbnail.generate",
            job_type_version=1,
            workload=JobWorkloadClass.ASSET_CPU,
            status=JobInternalStatus.RETRY_SCHEDULED,
            workspace_id=uuid4(),
            project_id=None,
            site_id=None,
            phase="queued",
            status_key=None,
            progress_completed=0,
            progress_total=None,
            attempt_count=2,
            next_attempt_at=NOW + timedelta(minutes=5),
            cancel_requested_at=None,
            started_at=NOW - timedelta(hours=1),
            completed_at=None,
            retry_of_job_id=None,
            error_code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
            correlation_id="platform-job-test",
            created_at=NOW - timedelta(hours=2),
            updated_at=NOW,
        )
        return PageData[PlatformJobOut](
            items=[item],
            total=1,
            page=params.page,
            size=params.size,
            pages=1,
            next=None,
            prev=None,
        )

    async def get_job(self, *, job_id) -> PlatformJobDetailOut:
        self.get_call = job_id
        if self.raise_not_found or self.detail is None:
            raise NotFound(
                message="Background job not found",
                error="BACKGROUND_JOB_NOT_FOUND",
            )
        return self.detail


def _build_app(service: RecordingPlatformJobService) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(platform_jobs_router, prefix="/platform-api/v1/jobs")

    async def _owner_session() -> PlatformSessionPrincipal:
        return PlatformSessionPrincipal(
            actor_id=uuid4(),
            session_id=uuid4(),
            operator_id=None,
            is_instance_owner=True,
            policy_revision=1,
            absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
        )

    class _OwnerBypassRepository:
        async def operator_has_permission(self, **kwargs) -> bool:
            return True

    app.dependency_overrides[get_current_platform_session] = _owner_session
    app.dependency_overrides[get_platform_identity_repository] = _OwnerBypassRepository
    app.dependency_overrides[get_platform_job_service] = lambda: cast(PlatformJobService, service)
    return app


def _assert_canonical_envelope(payload: dict[str, object]) -> None:
    assert payload.keys() == {"message", "data", "timestamp"}
    assert payload["message"] == "OK"
    assert isinstance(payload["timestamp"], int)


def _assert_safe_job_projection(payload: dict[str, object]) -> None:
    assert RAW_JOB_LIST_FIELDS.isdisjoint(payload)
    assert all("_" not in key for key in payload)


@pytest.mark.asyncio
async def test_queue_overview_returns_workload_snapshot_and_forwards_window() -> None:
    service = RecordingPlatformJobService()
    app = _build_app(service)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/platform-api/v1/jobs/queues", params={"hours": "48"})

    assert response.status_code == 200, response.text
    payload = response.json()
    _assert_canonical_envelope(payload)
    data = payload["data"]
    assert data["windowHours"] == 48
    assert data["queues"][0]["workload"] == "asset-cpu"
    assert data["queues"][0]["streamName"] == "arclayer:jobs:asset-cpu"
    assert data["queues"][0]["pendingDispatchJobs"] == 1
    assert data["queues"][0]["failedJobsInWindow"] == 3
    assert data["queues"][0]["outboxInFlightDispatches"] == 2
    assert service.queue_call == 48


@pytest.mark.asyncio
async def test_list_platform_jobs_returns_canonical_page_and_forwards_filters() -> None:
    service = RecordingPlatformJobService()
    app = _build_app(service)

    query = {
        "page": "1",
        "size": "20",
        "status": "retry_scheduled",
        "workload": "asset-cpu",
        "jobType": "asset.thumbnail.generate",
        "errorCode": "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/platform-api/v1/jobs", params=query)

    assert response.status_code == 200, response.text
    payload = response.json()
    _assert_canonical_envelope(payload)
    data = payload["data"]
    assert data["total"] == 1
    _assert_safe_job_projection(data["items"][0])
    assert data["items"][0]["status"] == "retry_scheduled"
    assert data["items"][0]["errorCode"] == "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"
    assert service.list_call is not None
    params, filters = service.list_call
    assert params == PageParams(page=1, size=20)
    assert filters.status == JobInternalStatus.RETRY_SCHEDULED
    assert filters.workload == JobWorkloadClass.ASSET_CPU
    assert filters.job_type == "asset.thumbnail.generate"
    assert filters.error_code == "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"


@pytest.mark.asyncio
async def test_get_platform_job_returns_attempts_and_maps_not_found() -> None:
    job_id = uuid4()
    detail = PlatformJobDetailOut(
        id=job_id,
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload=JobWorkloadClass.ASSET_CPU,
        status=JobInternalStatus.FAILED,
        workspace_id=None,
        project_id=None,
        site_id=None,
        phase=None,
        status_key=None,
        progress_completed=0,
        progress_total=None,
        attempt_count=1,
        next_attempt_at=None,
        cancel_requested_at=None,
        started_at=NOW - timedelta(minutes=30),
        completed_at=NOW - timedelta(minutes=21),
        retry_of_job_id=None,
        error_code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
        correlation_id="platform-job-test",
        created_at=NOW - timedelta(hours=1),
        updated_at=NOW,
        error_message="storage temporarily unavailable",
        attempts=[],
    )
    app = _build_app(RecordingPlatformJobService(detail=detail))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/platform-api/v1/jobs/{encode_uuid(job_id)}")

    assert response.status_code == 200, response.text
    payload = response.json()
    _assert_canonical_envelope(payload)
    assert payload["data"]["id"] == encode_uuid(job_id)
    assert payload["data"]["attempts"] == []
    assert payload["data"]["errorMessage"] == "storage temporarily unavailable"

    not_found_app = _build_app(RecordingPlatformJobService(raise_not_found=True))
    async with AsyncClient(transport=ASGITransport(app=not_found_app), base_url="http://test") as client:
        response = await client.get(f"/platform-api/v1/jobs/{encode_uuid(uuid4())}")

    assert response.status_code == 404
    assert response.json()["error"] == "BACKGROUND_JOB_NOT_FOUND"
