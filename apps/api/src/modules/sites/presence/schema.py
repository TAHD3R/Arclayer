from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class SitePresenceHeartbeatIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    doc_key: str = Field(
        ...,
        description="Document key (e.g. 'route:/about' or 'page:<uuid>').",
        examples=["route:/about"],
    )
    client_id: str = Field(
        ...,
        min_length=6,
        max_length=128,
        description="Client instance id (random, stable within a browser tab).",
        examples=["c_123456"],
    )
    actor: dict[str, str] | None = Field(
        default=None,
        description="Optional actor metadata (e.g. displayName).",
        examples=[{"displayName": "Alice"}],
    )


class SitePresenceHeartbeatOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expires_at_ms: int = Field(..., description="Presence TTL expiration timestamp in milliseconds (UTC).")


class SitePresenceRecordOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    client_id: str = Field(..., description="Client instance id.")
    updated_at_ms: int = Field(..., description="Last heartbeat timestamp in milliseconds (UTC).")
    actor: dict[str, str] | None = Field(default=None, description="Actor metadata (optional).")


class SitePresenceListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    doc_key: str = Field(..., description="Document key.")
    items: list[SitePresenceRecordOut] = Field(default_factory=list, description="Presence records.")
