from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class BuilderGlobalSectionReferenceOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    host_kind: Literal["page", "global_section"]
    host_item_id: PublicUUID
    host_section_id: str = Field(min_length=1, max_length=128)
    target_item_id: PublicUUID


class BuilderGlobalSectionCycleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    item_path: tuple[PublicUUID, ...] = Field(min_length=2)


class BuilderGlobalSectionDependencyGraphOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    references: tuple[BuilderGlobalSectionReferenceOut, ...] = ()
    unknown_references: tuple[BuilderGlobalSectionReferenceOut, ...] = ()
    missing_wireframe_references: tuple[BuilderGlobalSectionReferenceOut, ...] = ()
    cycles: tuple[BuilderGlobalSectionCycleOut, ...] = ()


__all__ = [
    "BuilderGlobalSectionCycleOut",
    "BuilderGlobalSectionDependencyGraphOut",
    "BuilderGlobalSectionReferenceOut",
]
