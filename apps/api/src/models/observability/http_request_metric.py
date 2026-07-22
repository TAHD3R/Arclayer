from __future__ import annotations

from tortoise import fields

from src.common.models.base import BaseModel


class HTTPRequestMetricHourly(BaseModel):
    """Hourly persisted HTTP request metrics aggregated by stable request dimensions."""

    bucket_start = fields.DatetimeField(db_index=True)
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    scope_key = fields.CharField(max_length=80)
    route_template = fields.CharField(max_length=512)
    method = fields.CharField(max_length=8)
    status_class = fields.SmallIntField()
    request_count = fields.BigIntField(default=0)
    error_count = fields.BigIntField(default=0)
    duration_total_ms = fields.BigIntField(default=0)
    duration_max_ms = fields.BigIntField(default=0)

    class Meta(BaseModel.Meta):
        table = "observability_http_request_metrics_hourly"
        table_description = "Hourly request count, error, and latency rollups."
        abstract = False
        unique_together = (
            (
                "bucket_start",
                "scope_key",
                "route_template",
                "method",
                "status_class",
            ),
        )
        indexes = (("workspace_id", "bucket_start"), ("project_id", "bucket_start"))


class HTTPRequestRecord(BaseModel):
    """One completed HTTP request used for incident tracing and exact latency percentiles."""

    occurred_at = fields.DatetimeField(db_index=True)
    trace_id = fields.CharField(max_length=128, null=True, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    route_template = fields.CharField(max_length=512)
    method = fields.CharField(max_length=8)
    status_code = fields.SmallIntField()
    duration_ms = fields.IntField()

    class Meta(BaseModel.Meta):
        table = "observability_http_request_records"
        table_description = "Completed HTTP requests retained for tracing and latency percentiles."
        abstract = False
        indexes = (
            ("workspace_id", "occurred_at"),
            ("project_id", "occurred_at"),
            ("route_template", "method", "occurred_at"),
            ("status_code", "occurred_at"),
        )
