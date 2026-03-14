from __future__ import annotations

from enum import StrEnum
from typing import Any

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


class PublishExportTarget(StrEnum):
    NEXTJS = "nextjs"
    SVELTEKIT = "sveltekit"


class PublishExportRoutePointerOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    tenant_id: str = Field(..., min_length=1, description="Tenant identity used by delivery adapters.")
    locale: str = Field(..., min_length=1, description="Route locale.")
    path: str = Field(..., min_length=1, description="Route path.")
    artifact_key: str = Field(..., min_length=1, description="Artifact pointer key.")


class PublishExportArtifactOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    tenant_id: str = Field(..., min_length=1, description="Tenant identity used by delivery adapters.")
    artifact_key: str = Field(..., min_length=1, description="Artifact pointer key.")
    kind: str = Field(..., min_length=1, description="Artifact payload type.")
    payload: dict[str, Any] | None = Field(default=None, description="Artifact payload for runtime rendering.")
    html: str | None = Field(default=None, description="Optional pre-rendered HTML artifact.")


class PublishExportContractOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    route_pointers: list[PublishExportRoutePointerOut] = Field(
        default_factory=list,
        description="Framework-neutral route pointer contract.",
    )
    artifacts: list[PublishExportArtifactOut] = Field(
        default_factory=list,
        description="Framework-neutral artifact payload contract.",
    )


class PublishExportBundleFileOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path: str = Field(..., min_length=1, description="Relative file path inside exported target bundle.")
    content: str = Field(..., description="Generated file content.")


class PublishExportBundleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target: PublishExportTarget = Field(..., description="Export target framework.")
    publish_contract: PublishExportContractOut = Field(
        ..., description="Contract shared with hosted delivery adapters."
    )
    files: list[PublishExportBundleFileOut] = Field(default_factory=list, description="Generated bundle files.")
    requires_hosted_runtime: bool = Field(
        default=False,
        description="Whether the exported project depends on hosted runtime code.",
    )
