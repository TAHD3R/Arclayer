from __future__ import annotations

import asyncio
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from math import ceil
from uuid import UUID

from tortoise import connections

from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import SubscriptionStatus, WorkspaceSubscription
from src.models.feedback.feedback import FeedbackStatus, FeedbackTicket
from src.models.organization.user import User, UserStatus
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.analytics.schema import ActivityUserSummaryOut
from src.modules.observability.schema import (
    AIObservabilitySummaryOut,
    AIUsageGroupOut,
    HTTPObservabilitySummaryOut,
    HTTPRequestGroupOrdering,
    HTTPRequestGroupOut,
    HTTPRequestRecordOrdering,
    HTTPRequestRecordOut,
    ObservabilityAttributionCoverageOut,
    ObservabilityDataAvailabilityOut,
    ObservabilityOperationsOut,
    ObservabilityOverviewOut,
    ObservabilityPeriodOut,
    ObservabilityResourcesOut,
    ObservabilityTrendMetric,
    ObservabilityTrendOut,
    ObservabilityTrendPointOut,
)


def _number(value: object | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(str(value))


def _int(value: object | None) -> int:
    return int(_number(value))


def _period(days: int) -> tuple[datetime, datetime, ObservabilityPeriodOut]:
    today = datetime.now(UTC).date()
    start_date = today - timedelta(days=days - 1)
    start = datetime.combine(start_date, time.min, tzinfo=UTC)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end, ObservabilityPeriodOut(start_date=start_date, end_date=today, days=days)


def _scope_where(
    *,
    alias: str,
    start: datetime,
    end: datetime,
    time_column: str,
    workspace_id: UUID | None,
    project_id: UUID | None,
) -> tuple[str, list[object]]:
    values: list[object] = [start, end]
    clauses = [f"{alias}.{time_column} >= $1", f"{alias}.{time_column} < $2"]
    if workspace_id is not None:
        values.append(workspace_id)
        clauses.append(f"{alias}.workspace_id = ${len(values)}")
    if project_id is not None:
        values.append(project_id)
        clauses.append(f"{alias}.project_id = ${len(values)}")
    return " AND ".join(clauses), values


class ObservabilityService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _validate_days(self, days: int) -> None:
        if days > self._settings.observability.max_query_days:
            raise BadRequest(
                message=t(
                    "errors",
                    "OBSERVABILITY_RANGE_EXCEEDED",
                    maxDays=self._settings.observability.max_query_days,
                ),
                error="OBSERVABILITY_RANGE_EXCEEDED",
            )

    async def resolve_scope(
        self,
        *,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> tuple[UUID | None, UUID | None]:
        if project_id is not None:
            project = await ProjectRecord.get_or_none(id=project_id, is_active=True)
            if project is None:
                raise NotFound(
                    message=t("errors", "OBSERVABILITY_PROJECT_NOT_FOUND"),
                    error="OBSERVABILITY_PROJECT_NOT_FOUND",
                )
            project_workspace_id = UUID(str(project.workspace_id))
            if workspace_id is not None and workspace_id != project_workspace_id:
                raise BadRequest(
                    message=t("errors", "OBSERVABILITY_SCOPE_MISMATCH"),
                    error="OBSERVABILITY_SCOPE_MISMATCH",
                )
            workspace_id = project_workspace_id
        if workspace_id is not None:
            workspace = await Workspace.get_or_none(
                id=workspace_id,
                is_active=True,
                deleted_at__isnull=True,
            )
            if workspace is None:
                raise NotFound(
                    message=t("errors", "OBSERVABILITY_WORKSPACE_NOT_FOUND"),
                    error="OBSERVABILITY_WORKSPACE_NOT_FOUND",
                )
        return workspace_id, project_id

    async def _http_summary(
        self,
        *,
        start: datetime,
        end: datetime,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> HTTPObservabilitySummaryOut:
        where, values = _scope_where(
            alias="m",
            start=start,
            end=end,
            time_column="bucket_start",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        raw_where, _ = _scope_where(
            alias="r",
            start=start,
            end=end,
            time_column="occurred_at",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        rows = await connections.get("default").execute_query_dict(
            f"""
            WITH totals AS (
                SELECT
                    COALESCE(SUM(m.request_count), 0) AS requests,
                    COALESCE(SUM(m.error_count), 0) AS error_requests,
                    COALESCE(SUM(m.duration_total_ms), 0) AS duration_total_ms,
                    COALESCE(MAX(m.duration_max_ms), 0) AS duration_max_ms
                FROM observability_http_request_metrics_hourly m
                WHERE {where}
            ), percentiles AS (
                SELECT
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY r.duration_ms) AS p95_latency_ms,
                    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY r.duration_ms) AS p99_latency_ms
                FROM observability_http_request_records r
                WHERE {raw_where}
            )
            SELECT totals.*, percentiles.p95_latency_ms, percentiles.p99_latency_ms
            FROM totals CROSS JOIN percentiles
            """,
            values,
        )
        row = rows[0] if rows else {}
        requests = _int(row.get("requests"))
        errors = _int(row.get("error_requests"))
        return HTTPObservabilitySummaryOut(
            requests=requests,
            error_requests=errors,
            error_rate=round(errors / requests, 6) if requests else 0,
            avg_latency_ms=round(_number(row.get("duration_total_ms")) / requests, 2) if requests else 0,
            p95_latency_ms=(
                round(_number(row.get("p95_latency_ms")), 2) if row.get("p95_latency_ms") is not None else None
            ),
            p99_latency_ms=(
                round(_number(row.get("p99_latency_ms")), 2) if row.get("p99_latency_ms") is not None else None
            ),
            max_latency_ms=_int(row.get("duration_max_ms")),
        )

    async def list_http_request_groups(
        self,
        *,
        days: int,
        params: PageParams,
        route_query: str | None,
        method: str | None,
        status_class: int | None,
        workspace_id: UUID | None,
        project_id: UUID | None,
        ordering: HTTPRequestGroupOrdering,
    ) -> PageData[HTTPRequestGroupOut]:
        self._validate_days(days)
        workspace_id, project_id = await self.resolve_scope(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        start, end, _ = _period(days)
        where, values = _scope_where(
            alias="m",
            start=start,
            end=end,
            time_column="bucket_start",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        clauses = [where]
        normalized_query = route_query.strip() if route_query else ""
        if normalized_query:
            values.append(f"%{normalized_query}%")
            clauses.append(f"m.route_template ILIKE ${len(values)}")
        if method:
            values.append(method.upper())
            clauses.append(f"m.method = ${len(values)}")
        if status_class is not None:
            values.append(status_class)
            clauses.append(f"m.status_class = ${len(values)}")
        filter_sql = " AND ".join(clauses)
        raw_where, _ = _scope_where(
            alias="r",
            start=start,
            end=end,
            time_column="occurred_at",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        connection = connections.get("default")
        count_rows = await connection.execute_query_dict(
            "SELECT COUNT(*) AS total FROM ("
            "SELECT m.route_template, m.method, m.status_class "
            f"FROM observability_http_request_metrics_hourly m WHERE {filter_sql} "
            "GROUP BY m.route_template, m.method, m.status_class"
            ") grouped",
            values,
        )
        total = _int(count_rows[0].get("total")) if count_rows else 0
        pages = ceil(total / params.size) if total else 0
        items: list[HTTPRequestGroupOut] = []
        if total and params.page <= pages:
            ordering_sql = {
                HTTPRequestGroupOrdering.REQUESTS_DESC: "requests DESC",
                HTTPRequestGroupOrdering.ERROR_RATE_DESC: (
                    "(error_requests::numeric / NULLIF(requests, 0)) DESC NULLS LAST"
                ),
                HTTPRequestGroupOrdering.P95_DESC: "p95_latency_ms DESC NULLS LAST",
                HTTPRequestGroupOrdering.P99_DESC: "p99_latency_ms DESC NULLS LAST",
                HTTPRequestGroupOrdering.AVG_LATENCY_DESC: (
                    "(duration_total_ms::numeric / NULLIF(requests, 0)) DESC NULLS LAST"
                ),
                HTTPRequestGroupOrdering.LAST_SEEN_DESC: "last_seen_at DESC",
            }[ordering]
            page_values = [*values, params.limit, params.offset]
            limit_placeholder = len(page_values) - 1
            offset_placeholder = len(page_values)
            rows = await connection.execute_query_dict(
                "WITH grouped AS ("
                "SELECT m.route_template, m.method, m.status_class, "
                "SUM(m.request_count) AS requests, SUM(m.error_count) AS error_requests, "
                "SUM(m.duration_total_ms) AS duration_total_ms, "
                "MAX(m.duration_max_ms) AS max_latency_ms, "
                "MAX(m.bucket_start) + INTERVAL '1 hour' AS aggregate_last_seen_at "
                f"FROM observability_http_request_metrics_hourly m WHERE {filter_sql} "
                "GROUP BY m.route_template, m.method, m.status_class"
                "), latency AS ("
                "SELECT r.route_template, r.method, "
                "CASE WHEN r.status_code > 0 THEN r.status_code / 100 ELSE 0 END AS status_class, "
                "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY r.duration_ms) AS p95_latency_ms, "
                "PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY r.duration_ms) AS p99_latency_ms, "
                "MAX(r.occurred_at) AS record_last_seen_at "
                "FROM observability_http_request_records r INNER JOIN grouped g "
                "ON g.route_template = r.route_template AND g.method = r.method "
                "AND g.status_class = CASE WHEN r.status_code > 0 THEN r.status_code / 100 ELSE 0 END "
                f"WHERE {raw_where} "
                "GROUP BY r.route_template, r.method, "
                "CASE WHEN r.status_code > 0 THEN r.status_code / 100 ELSE 0 END"
                "), combined AS (SELECT g.*, l.p95_latency_ms, l.p99_latency_ms, "
                "COALESCE(l.record_last_seen_at, g.aggregate_last_seen_at) AS last_seen_at "
                "FROM grouped g LEFT JOIN latency l USING (route_template, method, status_class) "
                ") SELECT * FROM combined "
                f"ORDER BY {ordering_sql}, route_template, method, status_class "
                f"LIMIT ${limit_placeholder} OFFSET ${offset_placeholder}",
                page_values,
            )
            for row in rows:
                requests = _int(row.get("requests"))
                errors = _int(row.get("error_requests"))
                items.append(
                    HTTPRequestGroupOut(
                        route_template=str(row["route_template"]),
                        method=str(row["method"]),
                        status_class=_int(row.get("status_class")),
                        requests=requests,
                        error_requests=errors,
                        error_rate=round(errors / requests, 6) if requests else 0,
                        avg_latency_ms=(round(_number(row.get("duration_total_ms")) / requests, 2) if requests else 0),
                        p95_latency_ms=(
                            round(_number(row.get("p95_latency_ms")), 2)
                            if row.get("p95_latency_ms") is not None
                            else None
                        ),
                        p99_latency_ms=(
                            round(_number(row.get("p99_latency_ms")), 2)
                            if row.get("p99_latency_ms") is not None
                            else None
                        ),
                        max_latency_ms=_int(row.get("max_latency_ms")),
                        last_seen_at=row["last_seen_at"],
                    )
                )
        return PageData[HTTPRequestGroupOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
        )

    async def list_http_request_records(
        self,
        *,
        days: int,
        params: PageParams,
        query: str | None,
        method: str | None,
        status_class: int | None,
        workspace_id: UUID | None,
        project_id: UUID | None,
        actor_user_id: UUID | None,
        min_duration_ms: int | None,
        max_duration_ms: int | None,
        has_error: bool | None,
        ordering: HTTPRequestRecordOrdering,
    ) -> PageData[HTTPRequestRecordOut]:
        self._validate_days(days)
        workspace_id, project_id = await self.resolve_scope(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        start, end, _ = _period(days)
        where, values = _scope_where(
            alias="r",
            start=start,
            end=end,
            time_column="occurred_at",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        clauses = [where]
        normalized_query = query.strip() if query else ""
        if normalized_query:
            values.append(f"%{normalized_query}%")
            clauses.append(f"(r.route_template ILIKE ${len(values)} OR r.trace_id ILIKE ${len(values)})")
        if method:
            values.append(method.upper())
            clauses.append(f"r.method = ${len(values)}")
        if status_class is not None:
            values.append(status_class)
            clauses.append(f"CASE WHEN r.status_code > 0 THEN r.status_code / 100 ELSE 0 END = ${len(values)}")
        if actor_user_id is not None:
            values.append(actor_user_id)
            clauses.append(f"r.actor_user_id = ${len(values)}")
        if min_duration_ms is not None:
            values.append(min_duration_ms)
            clauses.append(f"r.duration_ms >= ${len(values)}")
        if max_duration_ms is not None:
            values.append(max_duration_ms)
            clauses.append(f"r.duration_ms <= ${len(values)}")
        if has_error is not None:
            clauses.append(
                "(r.status_code >= 500 OR r.status_code = 0)" if has_error else "r.status_code BETWEEN 1 AND 499"
            )
        filter_sql = " AND ".join(clauses)
        connection = connections.get("default")
        count_rows = await connection.execute_query_dict(
            f"SELECT COUNT(*) AS total FROM observability_http_request_records r WHERE {filter_sql}",
            values,
        )
        total = _int(count_rows[0].get("total")) if count_rows else 0
        pages = ceil(total / params.size) if total else 0
        items: list[HTTPRequestRecordOut] = []
        if total and params.page <= pages:
            ordering_sql = {
                HTTPRequestRecordOrdering.OCCURRED_DESC: "r.occurred_at DESC, r.id DESC",
                HTTPRequestRecordOrdering.OCCURRED_ASC: "r.occurred_at ASC, r.id ASC",
                HTTPRequestRecordOrdering.DURATION_DESC: "r.duration_ms DESC, r.occurred_at DESC, r.id DESC",
                HTTPRequestRecordOrdering.DURATION_ASC: "r.duration_ms ASC, r.occurred_at DESC, r.id DESC",
                HTTPRequestRecordOrdering.STATUS_DESC: "r.status_code DESC, r.occurred_at DESC, r.id DESC",
            }[ordering]
            page_values = [*values, params.limit, params.offset]
            rows = await connection.execute_query_dict(
                "SELECT r.id, r.occurred_at, r.trace_id, r.actor_user_id, r.workspace_id, "
                "r.project_id, r.route_template, r.method, r.status_code, r.duration_ms, "
                "u.username AS actor_username, u.display_name AS actor_display_name, "
                "u.avatar_url AS actor_avatar_url "
                "FROM observability_http_request_records r "
                "LEFT JOIN users u ON u.id = r.actor_user_id "
                f"WHERE {filter_sql} ORDER BY {ordering_sql} "
                f"LIMIT ${len(page_values) - 1} OFFSET ${len(page_values)}",
                page_values,
            )
            items = [
                HTTPRequestRecordOut(
                    id=row["id"],
                    occurred_at=row["occurred_at"],
                    trace_id=row.get("trace_id"),
                    actor_user_id=row.get("actor_user_id"),
                    actor=(
                        ActivityUserSummaryOut(
                            id=row["actor_user_id"],
                            username=row.get("actor_username"),
                            display_name=row.get("actor_display_name"),
                            avatar_url=row.get("actor_avatar_url"),
                        )
                        if row.get("actor_user_id") is not None and row.get("actor_username") is not None
                        else None
                    ),
                    workspace_id=row.get("workspace_id"),
                    project_id=row.get("project_id"),
                    route_template=str(row["route_template"]),
                    method=str(row["method"]),
                    status_code=_int(row.get("status_code")),
                    duration_ms=_int(row.get("duration_ms")),
                )
                for row in rows
            ]
        return PageData[HTTPRequestRecordOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
        )

    async def _ai_summary(
        self,
        *,
        start: datetime,
        end: datetime,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> AIObservabilitySummaryOut:
        where, values = _scope_where(
            alias="a",
            start=start,
            end=end,
            time_column="created_at",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        rows = await connections.get("default").execute_query_dict(
            f"""
            SELECT
                COUNT(*) AS requests,
                COUNT(*) FILTER (WHERE a.status <> 'success') AS error_requests,
                COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY a.duration_ms)
                    FILTER (WHERE a.duration_ms IS NOT NULL), 0) AS p50_latency_ms,
                COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY a.duration_ms)
                    FILTER (WHERE a.duration_ms IS NOT NULL), 0) AS p95_latency_ms,
                COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY a.duration_ms)
                    FILTER (WHERE a.duration_ms IS NOT NULL), 0) AS p99_latency_ms,
                COALESCE(SUM(a.prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(a.completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(a.cost_micros), 0) AS cost_micros
            FROM ai_audit_log a
            WHERE {where}
            """,
            values,
        )
        row = rows[0] if rows else {}
        requests = _int(row.get("requests"))
        errors = _int(row.get("error_requests"))
        prompt_tokens = _int(row.get("prompt_tokens"))
        completion_tokens = _int(row.get("completion_tokens"))
        return AIObservabilitySummaryOut(
            requests=requests,
            error_requests=errors,
            error_rate=round(errors / requests, 6) if requests else 0,
            p50_latency_ms=round(_number(row.get("p50_latency_ms")), 2),
            p95_latency_ms=round(_number(row.get("p95_latency_ms")), 2),
            p99_latency_ms=round(_number(row.get("p99_latency_ms")), 2),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            cost_micros=_int(row.get("cost_micros")),
        )

    async def list_ai_usage_groups(
        self,
        *,
        days: int,
        params: PageParams,
        query: str | None,
        provider: str | None,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> PageData[AIUsageGroupOut]:
        self._validate_days(days)
        workspace_id, project_id = await self.resolve_scope(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        start, end, _ = _period(days)
        where, values = _scope_where(
            alias="a",
            start=start,
            end=end,
            time_column="created_at",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        clauses = [where]
        normalized_query = query.strip() if query else ""
        if normalized_query:
            values.append(f"%{normalized_query}%")
            clauses.append(f"(a.provider ILIKE ${len(values)} OR a.model ILIKE ${len(values)})")
        normalized_provider = provider.strip() if provider else ""
        if normalized_provider:
            values.append(normalized_provider)
            clauses.append(f"a.provider = ${len(values)}")
        filter_sql = " AND ".join(clauses)
        connection = connections.get("default")
        count_rows = await connection.execute_query_dict(
            "SELECT COUNT(*) AS total FROM ("
            "SELECT a.provider, a.model FROM ai_audit_log a "
            f"WHERE {filter_sql} GROUP BY a.provider, a.model"
            ") grouped",
            values,
        )
        total = _int(count_rows[0].get("total")) if count_rows else 0
        pages = ceil(total / params.size) if total else 0
        items: list[AIUsageGroupOut] = []
        if total and params.page <= pages:
            page_values = [*values, params.limit, params.offset]
            limit_placeholder = len(page_values) - 1
            offset_placeholder = len(page_values)
            rows = await connection.execute_query_dict(
                "SELECT a.provider, a.model, COUNT(*) AS requests, "
                "COUNT(*) FILTER (WHERE a.status <> 'success') AS error_requests, "
                "COALESCE(SUM(a.prompt_tokens), 0) AS prompt_tokens, "
                "COALESCE(SUM(a.completion_tokens), 0) AS completion_tokens, "
                "COALESCE(SUM(a.cost_micros), 0) AS cost_micros, "
                "COALESCE(AVG(a.duration_ms) FILTER (WHERE a.duration_ms IS NOT NULL), 0) AS avg_latency_ms, "
                "MAX(a.created_at) AS last_seen_at FROM ai_audit_log a "
                f"WHERE {filter_sql} GROUP BY a.provider, a.model "
                "ORDER BY cost_micros DESC, requests DESC, a.provider, a.model "
                f"LIMIT ${limit_placeholder} OFFSET ${offset_placeholder}",
                page_values,
            )
            for row in rows:
                requests = _int(row.get("requests"))
                errors = _int(row.get("error_requests"))
                prompt_tokens = _int(row.get("prompt_tokens"))
                completion_tokens = _int(row.get("completion_tokens"))
                items.append(
                    AIUsageGroupOut(
                        provider=str(row["provider"]),
                        model=str(row["model"]),
                        requests=requests,
                        error_requests=errors,
                        error_rate=round(errors / requests, 6) if requests else 0,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens,
                        cost_micros=_int(row.get("cost_micros")),
                        avg_latency_ms=round(_number(row.get("avg_latency_ms")), 2),
                        last_seen_at=row["last_seen_at"],
                    )
                )
        return PageData[AIUsageGroupOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
        )

    async def _resources(
        self,
        *,
        system_scope: bool,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> ObservabilityResourcesOut:
        project_query = ProjectRecord.filter(is_active=True)
        if workspace_id is not None:
            project_query = project_query.filter(workspace_id=workspace_id)
        if project_id is not None:
            project_query = project_query.filter(id=project_id)
        active_projects = int(await project_query.count())
        if not system_scope:
            active_members = int(
                await WorkspaceMembership.filter(
                    workspace_id=workspace_id,
                    status=WorkspaceMembershipStatus.ACTIVE,
                ).count()
            )
            return ObservabilityResourcesOut(active_projects=active_projects, active_members=active_members)

        active_workspaces = int(
            await Workspace.filter(is_active=True, deleted_at__isnull=True).count() if workspace_id is None else 1
        )
        if workspace_id is None:
            active_users = int(await User.filter(status=UserStatus.ACTIVE).count())
        else:
            active_users = int(
                await WorkspaceMembership.filter(
                    workspace_id=workspace_id,
                    status=WorkspaceMembershipStatus.ACTIVE,
                ).count()
            )
        return ObservabilityResourcesOut(
            active_workspaces=active_workspaces,
            active_projects=active_projects,
            active_users=active_users,
        )

    async def _operations(
        self,
        *,
        start: datetime,
        end: datetime,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> ObservabilityOperationsOut:
        audit_query = AuditEvent.filter(occurred_at__gte=start, occurred_at__lt=end)
        if workspace_id is not None:
            audit_query = audit_query.filter(workspace_id=workspace_id)
        if project_id is not None:
            audit_query = audit_query.filter(project_id=project_id)
        feedback_query = FeedbackTicket.exclude(status__in=[FeedbackStatus.RESOLVED, FeedbackStatus.CLOSED])
        if workspace_id is not None:
            feedback_query = feedback_query.filter(workspace_id=workspace_id)
        if project_id is not None:
            feedback_query = feedback_query.filter(project_id=project_id)
        subscription_query = WorkspaceSubscription.filter(status=SubscriptionStatus.ACTIVE)
        if workspace_id is not None:
            subscription_query = subscription_query.filter(workspace_id=workspace_id)
        audit_events, open_feedback, active_subscriptions = await asyncio.gather(
            audit_query.count(),
            feedback_query.count(),
            subscription_query.count(),
        )
        return ObservabilityOperationsOut(
            audit_events=int(audit_events),
            open_feedback=int(open_feedback),
            active_subscriptions=int(active_subscriptions),
        )

    @staticmethod
    def _coverage(*, attributed: int, total: int) -> ObservabilityAttributionCoverageOut:
        return ObservabilityAttributionCoverageOut(
            supported=True,
            attributed_records=attributed,
            total_records=total,
            coverage_rate=round(attributed / total, 6) if total else 0,
        )

    async def _data_availability(
        self,
        *,
        start: datetime,
        end: datetime,
        workspace_id: UUID | None,
    ) -> ObservabilityDataAvailabilityOut:
        values: list[object] = [start, end]
        workspace_clause = ""
        if workspace_id is not None:
            values.append(workspace_id)
            workspace_clause = f" AND workspace_id = ${len(values)}"
        rows = await connections.get("default").execute_query_dict(
            f"""
            WITH http AS (
                SELECT
                    COALESCE(SUM(request_count), 0) AS total,
                    COALESCE(SUM(request_count) FILTER (WHERE project_id IS NOT NULL), 0) AS attributed
                FROM observability_http_request_metrics_hourly
                WHERE bucket_start >= $1 AND bucket_start < $2
                    AND workspace_id IS NOT NULL{workspace_clause}
            ), ai AS (
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS attributed
                FROM ai_audit_log
                WHERE created_at >= $1 AND created_at < $2
                    AND workspace_id IS NOT NULL{workspace_clause}
            ), audit AS (
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS attributed
                FROM analytics_audit_events
                WHERE occurred_at >= $1 AND occurred_at < $2
                    AND workspace_id IS NOT NULL{workspace_clause}
            )
            SELECT
                http.total AS http_total,
                http.attributed AS http_attributed,
                ai.total AS ai_total,
                ai.attributed AS ai_attributed,
                audit.total AS audit_total,
                audit.attributed AS audit_attributed
            FROM http, ai, audit
            """,
            values,
        )
        row = rows[0] if rows else {}
        return ObservabilityDataAvailabilityOut(
            http_project_attribution=self._coverage(
                attributed=_int(row.get("http_attributed")),
                total=_int(row.get("http_total")),
            ),
            ai_project_attribution=self._coverage(
                attributed=_int(row.get("ai_attributed")),
                total=_int(row.get("ai_total")),
            ),
            audit_project_attribution=self._coverage(
                attributed=_int(row.get("audit_attributed")),
                total=_int(row.get("audit_total")),
            ),
        )

    async def overview(
        self,
        *,
        days: int,
        system_scope: bool,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> ObservabilityOverviewOut:
        self._validate_days(days)
        workspace_id, project_id = await self.resolve_scope(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        start, end, period = _period(days)
        resources, http, ai, operations, data_availability = await asyncio.gather(
            self._resources(
                system_scope=system_scope,
                workspace_id=workspace_id,
                project_id=project_id,
            ),
            self._http_summary(
                start=start,
                end=end,
                workspace_id=workspace_id,
                project_id=project_id,
            ),
            self._ai_summary(
                start=start,
                end=end,
                workspace_id=workspace_id,
                project_id=project_id,
            ),
            self._operations(
                start=start,
                end=end,
                workspace_id=workspace_id,
                project_id=project_id,
            ),
            self._data_availability(start=start, end=end, workspace_id=workspace_id),
        )
        return ObservabilityOverviewOut(
            period=period,
            resources=resources,
            http=http,
            ai=ai,
            operations=operations,
            data_availability=data_availability,
        )

    async def _trend_rows(
        self,
        *,
        metric: ObservabilityTrendMetric,
        start: datetime,
        end: datetime,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> list[dict]:
        conn = connections.get("default")
        if metric in {
            ObservabilityTrendMetric.HTTP_REQUESTS,
            ObservabilityTrendMetric.HTTP_ERRORS,
            ObservabilityTrendMetric.HTTP_LATENCY,
        }:
            where, values = _scope_where(
                alias="m",
                start=start,
                end=end,
                time_column="bucket_start",
                workspace_id=workspace_id,
                project_id=project_id,
            )
            expression = {
                ObservabilityTrendMetric.HTTP_REQUESTS: "SUM(m.request_count)",
                ObservabilityTrendMetric.HTTP_ERRORS: "SUM(m.error_count)",
                ObservabilityTrendMetric.HTTP_LATENCY: (
                    "SUM(m.duration_total_ms)::double precision / NULLIF(SUM(m.request_count), 0)"
                ),
            }[metric]
            return await conn.execute_query_dict(
                f"SELECT DATE(m.bucket_start) AS date, COALESCE({expression}, 0) AS value "
                f"FROM observability_http_request_metrics_hourly m WHERE {where} "
                "GROUP BY DATE(m.bucket_start) ORDER BY DATE(m.bucket_start)",
                values,
            )
        if metric == ObservabilityTrendMetric.AUDIT_EVENTS:
            values: list[object] = [start, end]
            clauses = ["a.occurred_at >= $1", "a.occurred_at < $2"]
            if workspace_id is not None:
                values.append(workspace_id)
                clauses.append(f"a.workspace_id = ${len(values)}")
            if project_id is not None:
                values.append(project_id)
                clauses.append(f"a.project_id = ${len(values)}")
            return await conn.execute_query_dict(
                "SELECT DATE(a.occurred_at) AS date, COUNT(*) AS value "
                f"FROM analytics_audit_events a WHERE {' AND '.join(clauses)} "
                "GROUP BY DATE(a.occurred_at) ORDER BY DATE(a.occurred_at)",
                values,
            )

        where, values = _scope_where(
            alias="a",
            start=start,
            end=end,
            time_column="created_at",
            workspace_id=workspace_id,
            project_id=project_id,
        )
        expression = {
            ObservabilityTrendMetric.AI_REQUESTS: "COUNT(*)",
            ObservabilityTrendMetric.AI_ERRORS: "COUNT(*) FILTER (WHERE a.status <> 'success')",
            ObservabilityTrendMetric.AI_LATENCY: (
                "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY a.duration_ms) FILTER (WHERE a.duration_ms IS NOT NULL)"
            ),
            ObservabilityTrendMetric.TOKENS: "SUM(a.prompt_tokens + a.completion_tokens)",
            ObservabilityTrendMetric.COST: "SUM(a.cost_micros)",
        }[metric]
        return await conn.execute_query_dict(
            f"SELECT DATE(a.created_at) AS date, COALESCE({expression}, 0) AS value "
            f"FROM ai_audit_log a WHERE {where} "
            "GROUP BY DATE(a.created_at) ORDER BY DATE(a.created_at)",
            values,
        )

    async def trends(
        self,
        *,
        days: int,
        metric: ObservabilityTrendMetric,
        workspace_id: UUID | None,
        project_id: UUID | None,
    ) -> ObservabilityTrendOut:
        self._validate_days(days)
        workspace_id, project_id = await self.resolve_scope(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        start, end, period = _period(days)
        rows = await self._trend_rows(
            metric=metric,
            start=start,
            end=end,
            workspace_id=workspace_id,
            project_id=project_id,
        )
        points: list[ObservabilityTrendPointOut] = []
        for row in rows:
            value = _number(row.get("value"))
            if metric not in {ObservabilityTrendMetric.HTTP_LATENCY, ObservabilityTrendMetric.AI_LATENCY}:
                value = int(value)
            else:
                value = round(value, 2)
            points.append(ObservabilityTrendPointOut(date=row["date"], value=value))
        if metric == ObservabilityTrendMetric.HTTP_LATENCY:
            total: int | float = (
                await self._http_summary(
                    start=start,
                    end=end,
                    workspace_id=workspace_id,
                    project_id=project_id,
                )
            ).avg_latency_ms
        elif metric == ObservabilityTrendMetric.AI_LATENCY:
            total = (
                await self._ai_summary(
                    start=start,
                    end=end,
                    workspace_id=workspace_id,
                    project_id=project_id,
                )
            ).p95_latency_ms
        else:
            total = int(sum(float(point.value) for point in points))
        return ObservabilityTrendOut(metric=metric, period=period, points=points, total=total)
