from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.projects.builder.change_set_operation_schema import BuilderOperationBaseV1
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.workspaces.design_systems.manifest import validate_stable_key, validate_token_path


class BuilderDesignTargetOperationV1(BuilderOperationBaseV1):
    item_id: PublicUUID
    expected_draft_version: int = Field(ge=1)
    source_wireframe_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class BuilderDesignInitializeOperationV1(BuilderDesignTargetOperationV1):
    type: Literal["design.initialize"]


class BuilderDesignStyleSetOperationV1(BuilderDesignTargetOperationV1):
    type: Literal["design.style.set"]
    section_id: str = Field(min_length=1, max_length=128)
    state_key: str = Field(min_length=1, max_length=64)
    style_slot_key: str = Field(min_length=1, max_length=128)
    token_path: str = Field(min_length=1, max_length=256)

    def model_post_init(self, __context: object) -> None:
        validate_stable_key(self.state_key)
        validate_stable_key(self.style_slot_key)
        validate_token_path(self.token_path)


class BuilderDesignStyleClearOperationV1(BuilderDesignTargetOperationV1):
    type: Literal["design.style.clear"]
    section_id: str = Field(min_length=1, max_length=128)
    state_key: str = Field(min_length=1, max_length=64)
    style_slot_key: str = Field(min_length=1, max_length=128)

    def model_post_init(self, __context: object) -> None:
        validate_stable_key(self.state_key)
        validate_stable_key(self.style_slot_key)


class BuilderDesignResponsiveStyleSetOperationV1(BuilderDesignStyleSetOperationV1):
    type: Literal["design.responsive_style.set"]
    breakpoint: str = Field(min_length=1, max_length=64)

    def model_post_init(self, __context: object) -> None:
        super().model_post_init(__context)
        validate_stable_key(self.breakpoint)


class BuilderDesignResponsiveStyleClearOperationV1(BuilderDesignStyleClearOperationV1):
    type: Literal["design.responsive_style.clear"]
    breakpoint: str = Field(min_length=1, max_length=64)

    def model_post_init(self, __context: object) -> None:
        super().model_post_init(__context)
        validate_stable_key(self.breakpoint)


BuilderDesignOperationV1 = Annotated[
    BuilderDesignInitializeOperationV1
    | BuilderDesignStyleSetOperationV1
    | BuilderDesignStyleClearOperationV1
    | BuilderDesignResponsiveStyleSetOperationV1
    | BuilderDesignResponsiveStyleClearOperationV1,
    Field(discriminator="type"),
]


class BuilderDesignCandidateV1(BaseSchema):
    item_id: PublicUUID
    host_kind: Literal["page", "global_section"]
    base_content_version_id: PublicUUID
    base_version_number: int = Field(ge=1)
    visual_blueprint: VisualBlueprintDocumentV1


__all__ = [
    "BuilderDesignInitializeOperationV1",
    "BuilderDesignCandidateV1",
    "BuilderDesignOperationV1",
    "BuilderDesignResponsiveStyleClearOperationV1",
    "BuilderDesignResponsiveStyleSetOperationV1",
    "BuilderDesignStyleClearOperationV1",
    "BuilderDesignStyleSetOperationV1",
    "BuilderDesignTargetOperationV1",
]
