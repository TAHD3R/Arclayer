from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class PublishImpactOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    missing_routes: list[PublicUUID] = Field(default_factory=list, description="Published items missing active routes.")
    unresolved_relations: list[PublicUUID] = Field(default_factory=list, description="Items with unresolved relations.")
    unpublished_dependencies: list[PublicUUID] = Field(
        default_factory=list, description="Items depending on unpublished parents."
    )


class PublishArtifactsOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    graph_nodes: int = Field(default=0, ge=0, description="Number of generated graph nodes.")
    impact: PublishImpactOut = Field(..., description="Publish impact summary.")
