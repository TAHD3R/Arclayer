from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema


class LegacyImportIssue(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, description="Machine-readable issue code.")
    message: str = Field(..., min_length=1, description="Issue detail.")
    legacy_ref: str | None = Field(default=None, description="Optional legacy object reference.")


class LegacyImportReport(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    models_imported: int = Field(default=0, ge=0, description="Imported legacy types count.")
    fields_imported: int = Field(default=0, ge=0, description="Imported legacy field definitions count.")
    items_imported: int = Field(default=0, ge=0, description="Imported legacy entries count.")
    versions_imported: int = Field(default=0, ge=0, description="Imported legacy revisions count.")
    presentations_imported: int = Field(default=0, ge=0, description="Imported presentation document count.")
    route_bindings_imported: int = Field(default=0, ge=0, description="Imported route binding count.")
    hierarchy_nodes_imported: int = Field(default=0, ge=0, description="Imported hierarchy node count.")
    unsupported_payloads: list[LegacyImportIssue] = Field(
        default_factory=list,
        description="Unsupported payload report (explicit, non-silent).",
    )
