from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from apps.api.common.schemas import BaseSchema
from apps.api.routers.v1.sites.schema import DocumentIR

_NPM_NAME_RE = re.compile(
    # Very small subset of npm package name rules:
    # - unscoped: name
    # - scoped: @scope/name
    r"^(?:@[a-z0-9][a-z0-9-._]*/)?[a-z0-9][a-z0-9-._]*$"
)

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")

_VARIANT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")


class ThemeEntrypointsIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    tokens_css: str = Field(..., alias="tokensCss", description="Relative path to theme tokens CSS.")
    base_css: str | None = Field(default=None, alias="baseCss", description="Optional base CSS path.")
    preview_image: str | None = Field(default=None, alias="previewImage", description="Optional preview image path.")


class ThemePresetDeclIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64, description="Preset id (theme-scoped).")
    name: str = Field(..., min_length=1, max_length=128, description="Preset display name.")
    path: str = Field(..., min_length=1, max_length=256, description="Relative path to preset JSON.")


class ThemeVariantDeclIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    variant_id: str = Field(..., alias="variantId", description="Variant id (theme-scoped).")
    name: str = Field(..., min_length=1, max_length=128, description="Variant display name.")
    path: str = Field(..., min_length=1, max_length=256, description="Relative path to variant JSON.")

    @field_validator("variant_id")
    @classmethod
    def _validate_variant_id(cls, v: str) -> str:
        s = (v or "").strip()
        if not _VARIANT_ID_RE.match(s):
            raise ValueError("invalid variantId")
        return s


class ThemeManifestIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    theme_id: str = Field(..., alias="themeId", description="Theme id (npm-like).")
    name: str | None = Field(default=None, description="Theme display name.")
    version: str = Field(..., description="Theme package version (semver).")
    description: str | None = Field(default=None, description="Theme description.")
    author: dict[str, Any] | None = Field(default=None, description="Optional author metadata (JSON).")
    compat: dict[str, Any] | None = Field(default=None, description="Optional compatibility metadata (JSON).")

    entrypoints: ThemeEntrypointsIn = Field(..., description="Theme entrypoint paths.")
    config_schema: dict[str, Any] | None = Field(default=None, alias="configSchema", description="Theme config schema.")
    presets: list[ThemePresetDeclIn] = Field(default_factory=list, description="Theme presets.")
    variants: list[ThemeVariantDeclIn] = Field(default_factory=list, description="Theme variants.")

    @field_validator("theme_id")
    @classmethod
    def _validate_theme_id(cls, v: str) -> str:
        s = (v or "").strip()
        if not s or len(s) > 214:
            raise ValueError("invalid themeId")
        if not _NPM_NAME_RE.match(s):
            raise ValueError("invalid themeId")
        return s

    @field_validator("version")
    @classmethod
    def _validate_version(cls, v: str) -> str:
        s = (v or "").strip()
        if not _SEMVER_RE.match(s):
            raise ValueError("invalid version")
        return s


class ThemeVariantPayloadIn(BaseSchema):
    """
    Theme variant payload: PageRevision subset (v0).

    We reuse the same DocumentIR schema as Sites draft/publish flows to ensure
    consistency and to keep "extra=forbid" protection.
    """

    model_config = ConfigDict(extra="forbid")

    document: DocumentIR = Field(..., description="Document IR (v1).")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, alias="styleOverrides", description="Style overrides.")
    variant_id: str | None = Field(default=None, alias="variantId", description="Optional variant id (for self-check).")
    deps: dict[str, Any] | None = Field(default=None, description="Optional deps snapshot (JSON).")


class WorkspaceThemeImportIn(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    asset_id: UUID = Field(..., alias="assetId", description="Zip asset id to import as a theme package.")


class WorkspaceThemeOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    theme_id: str = Field(..., alias="themeId")
    version: str
    name: str | None = None
    description: str | None = None

    artifact_hash: str | None = Field(default=None, alias="artifactHash")
    artifact_asset_id: UUID | None = Field(default=None, alias="artifactAssetId")

    tokens_css_asset_id: UUID = Field(..., alias="tokensCssAssetId")
    base_css_asset_id: UUID | None = Field(default=None, alias="baseCssAssetId")
    preview_image_asset_id: UUID | None = Field(default=None, alias="previewImageAssetId")

    presets: dict[str, Any] | None = None
    variants: dict[str, Any] | None = None
    manifest: dict[str, Any] = Field(..., description="Raw manifest.json.")


class WorkspaceThemeListOut(BaseSchema):
    model_config = ConfigDict(extra="forbid")

    items: list[WorkspaceThemeOut] = Field(default_factory=list)
