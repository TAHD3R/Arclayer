from __future__ import annotations

from typing import Annotated, Literal

from pydantic import ConfigDict, Field

from src.common.types.public_uuid import PublicUUID
from src.modules.projects.builder.change_set_operation_schema import BuilderOperationBaseV1


class BuilderDesignSystemRefreshOperationV1(BuilderOperationBaseV1):
    model_config = BuilderOperationBaseV1.model_config | ConfigDict(extra="forbid", frozen=True)

    type: Literal["design-system.refresh"]
    expected_assignment_revision: int = Field(ge=1)
    design_system_id: PublicUUID
    version_id: PublicUUID
    expected_manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


BuilderDesignSystemOperationV1 = Annotated[
    BuilderDesignSystemRefreshOperationV1,
    Field(discriminator="type"),
]


__all__ = [
    "BuilderDesignSystemOperationV1",
    "BuilderDesignSystemRefreshOperationV1",
]
