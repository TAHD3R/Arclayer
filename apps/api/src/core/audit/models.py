"""Pydantic v2 output models for the monorepo consistency audit engine.

All models follow the project's strict Pydantic v2 contract:
no dataclass, no Any, no dict fields in API boundary types.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class Severity(StrEnum):
    BLOCKER = "BLOCKER"  # Architecture violation
    MAJOR = "MAJOR"  # Structural inconsistency
    MINOR = "MINOR"  # Style deviation


class Violation(BaseModel):
    """Single rule violation with location and evidence."""

    file: str = Field(..., description="Relative file path from repo root.")
    line: int = Field(..., description="Line number (1-indexed).")
    rule: str = Field(..., description="Rule identifier, e.g. 'service.no-orm-leak'.")
    message: str = Field(..., description="Human-readable violation description.")
    severity: Severity = Field(..., description="Violation severity.")
    evidence: str = Field(..., description="Offending code snippet.")


class SymbolIndex(BaseModel):
    """Indexed symbol from a source file."""

    name: str = Field(..., description="Symbol name (class, function, variable).")
    kind: str = Field(..., description="Symbol kind: service, repository, schema, entity_manager, route, model, util.")
    file: str = Field(..., description="Relative file path.")
    line: int = Field(..., description="Line number.")
    parent_class: str | None = Field(default=None, description="Parent class name if applicable.")
    decorators: list[str] = Field(default_factory=list, description="Decorator names.")
    imports: list[str] = Field(default_factory=list, description="Imported module/package names.")
    type_annotations: dict[str, str] = Field(default_factory=dict, description="Field/param name → type annotation.")
    calls: list[str] = Field(default_factory=list, description="Function/method call names found in body.")


class LayerCluster(BaseModel):
    """Group of symbols in the same architectural layer within a module."""

    layer: str = Field(..., description="Layer: service, repository, schema, entity_manager.")
    module: str = Field(..., description="Module name, e.g. 'analytics'.")
    symbols: list[str] = Field(default_factory=list, description="Symbol names in this cluster.")
    similarity_score: float = Field(default=1.0, description="Intra-cluster similarity (0-1).")


class AutoFix(BaseModel):
    """Codemod patch for a detected violation."""

    type: str = Field(default="codemod", description="Fix type (always 'codemod' for now).")
    severity: Severity = Field(..., description="Matched to the violation severity.")
    description: str = Field(default="", description="What this fix changes.")
    patch: str = Field(..., description="Unified diff content.")
    files: list[str] = Field(default_factory=list, description="Files this patch applies to.")


class BackendReport(BaseModel):
    service: list[Violation] = Field(default_factory=list)
    repository: list[Violation] = Field(default_factory=list)
    schema_: list[Violation] = Field(default_factory=list, serialization_alias="schema")
    entity_manager: list[Violation] = Field(default_factory=list)


class I18nReport(BaseModel):
    violations: list[Violation] = Field(default_factory=list)


class ArchitectureReport(BaseModel):
    orm_leak: list[Violation] = Field(default_factory=list)
    write_path_violation: list[Violation] = Field(default_factory=list)


class FrontendReport(BaseModel):
    shared_candidates: list[str] = Field(
        default_factory=list, description="Identifiers that could be extracted to shared/."
    )
    duplicates: list[Violation] = Field(default_factory=list, description="Duplicated logic violations.")
    structure_diff: list[Violation] = Field(default_factory=list, description="Page structure inconsistencies.")


class FilesystemReport(BaseModel):
    structure_diff: list[Violation] = Field(default_factory=list, description="Directory/naming inconsistencies.")


class AuditReport(BaseModel):
    """Top-level audit output — matches the user-specified JSON schema."""

    backend: BackendReport = Field(default_factory=BackendReport)
    i18n: I18nReport = Field(default_factory=I18nReport)
    architecture: ArchitectureReport = Field(default_factory=ArchitectureReport)
    frontend: FrontendReport = Field(default_factory=FrontendReport)
    filesystem: FilesystemReport = Field(default_factory=FilesystemReport)
    canonical_rules: list[str] = Field(default_factory=list)
    auto_fix: list[AutoFix] = Field(default_factory=list)
    summary: str = Field(default="", description="One-line summary of findings.")
