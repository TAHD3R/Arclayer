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
