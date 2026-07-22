from __future__ import annotations

from collections.abc import Mapping
from typing import Literal, cast

import orjson
from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.core.i18n import t
from src.models.design_systems._enums import (
    DesignSystemValidationSeverity,
    DesignSystemValidationStatus,
)
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.workspaces.design_systems.component_recipe_validation import validate_design_component_recipes
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestV1,
    DesignThemeOverrideV1,
    DesignThemeV1,
    DesignTokenDefinitionV1,
    TokenValue,
    all_design_tokens,
    compute_design_system_manifest_checksum,
    compute_design_token_index_hash,
    design_system_content_digest,
    validate_typed_token_value,
)

FOUNDATION_VALIDATOR_VERSION = 2
REQUIRED_FOUNDATION_ROLES = (
    "semantic.color.surface.canvas",
    "semantic.color.text.primary",
    "semantic.color.text.secondary",
    "semantic.color.action.primary",
    "semantic.color.action.on-primary",
    "semantic.color.border.default",
    "semantic.color.focus.ring",
)


class DesignSystemValidationFinding(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    code: str
    severity: Literal["warning", "blocker"]
    path: str | None = None
    related_path: str | None = None
    message_key: str
    message: str


class DesignSystemValidationOutcome(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    profile: Literal["foundation"] = "foundation"
    validator_version: Literal[2] = FOUNDATION_VALIDATOR_VERSION
    status: DesignSystemValidationStatus
    findings: tuple[DesignSystemValidationFinding, ...]
    finding_hash: str
    token_index_hash: str
    publish_ready: Literal[False] = False
    compatibility: dict[str, str]


def validate_design_system_foundation(
    manifest: DesignSystemManifestV1,
    *,
    component_catalog_resolver: ComponentCatalogResolver | None = None,
) -> DesignSystemValidationOutcome:
    findings: list[DesignSystemValidationFinding] = []
    tokens = all_design_tokens(manifest)
    _validate_checksum(manifest, findings)
    _validate_token_graph(tokens, findings)
    _validate_themes(manifest, tokens, findings)
    _validate_typography(manifest, tokens, findings)
    _validate_motion(manifest, tokens, findings)
    component_validation = validate_design_component_recipes(
        manifest=manifest,
        resolver=component_catalog_resolver,
    )
    findings.extend(
        _finding(
            finding.code,
            path=finding.path,
            related_path=finding.related_path,
        )
        for finding in component_validation.findings
    )
    _validate_gated_inputs(manifest, findings)
    findings.append(_finding("DESIGN_SYSTEM_RENDERER_NOT_EVALUATED", severity="warning"))
    status = (
        DesignSystemValidationStatus.INVALID
        if any(finding.severity == DesignSystemValidationSeverity.BLOCKER.value for finding in findings)
        else DesignSystemValidationStatus.VALID
    )
    token_index_hash = compute_design_token_index_hash(manifest)
    finding_hash = _finding_hash(
        checksum=manifest.checksum,
        status=status,
        token_index_hash=token_index_hash,
        component_catalog_checksum=component_validation.catalog_checksum,
        findings=tuple(findings),
    )
    return DesignSystemValidationOutcome(
        status=status,
        findings=tuple(findings),
        finding_hash=finding_hash,
        token_index_hash=token_index_hash,
        compatibility={
            "renderer": "not_evaluated",
            "componentCatalog": component_validation.compatibility,
            "componentCatalogChecksum": component_validation.catalog_checksum or "not_evaluated",
            "assetsAndFontRights": "not_evaluated",
            "compile": "not_evaluated",
            "publication": "not_evaluated",
        },
    )


def _validate_checksum(
    manifest: DesignSystemManifestV1,
    findings: list[DesignSystemValidationFinding],
) -> None:
    if compute_design_system_manifest_checksum(manifest) != manifest.checksum:
        findings.append(_finding("DESIGN_SYSTEM_CHECKSUM_MISMATCH"))


def _validate_token_graph(
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    for path, token in sorted(tokens.items()):
        if token.alias is not None:
            target = tokens.get(token.alias)
            if target is None:
                findings.append(_finding("DESIGN_SYSTEM_TOKEN_REFERENCE_MISSING", path=path, related_path=token.alias))
            else:
                if _layer_rank(token.alias) > _layer_rank(path):
                    findings.append(_finding("DESIGN_SYSTEM_TOKEN_LAYER_INVALID", path=path, related_path=token.alias))
                if target.type != token.type:
                    findings.append(_finding("DESIGN_SYSTEM_TOKEN_TYPE_MISMATCH", path=path, related_path=token.alias))
        if token.replacement is not None:
            replacement = tokens.get(token.replacement)
            if replacement is None:
                findings.append(
                    _finding("DESIGN_SYSTEM_TOKEN_REFERENCE_MISSING", path=path, related_path=token.replacement)
                )
            elif replacement.type != token.type:
                findings.append(
                    _finding("DESIGN_SYSTEM_TOKEN_TYPE_MISMATCH", path=path, related_path=token.replacement)
                )
    _detect_alias_cycles(tokens, findings)


def _detect_alias_cycles(
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    visited: set[str] = set()
    active: set[str] = set()

    def visit(path: str) -> None:
        if path in visited:
            return
        if path in active:
            findings.append(_finding("DESIGN_SYSTEM_TOKEN_CYCLE", path=path))
            return
        active.add(path)
        alias = tokens[path].alias
        if alias in tokens:
            visit(alias)
        active.remove(path)
        visited.add(path)

    for path in sorted(tokens):
        visit(path)


def _validate_themes(
    manifest: DesignSystemManifestV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    modes = tuple(theme.mode for theme in manifest.themes)
    if "light" not in modes:
        findings.append(_finding("DESIGN_SYSTEM_LIGHT_THEME_REQUIRED"))
    if len(modes) != len(set(modes)):
        findings.append(_finding("DESIGN_SYSTEM_THEME_MODE_DUPLICATE"))
    for theme in manifest.themes:
        _validate_theme(theme, tokens, findings)


def _validate_theme(
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    for path, override in sorted(theme.overrides.items()):
        target = tokens.get(path)
        if target is None:
            findings.append(_finding("DESIGN_SYSTEM_THEME_OVERRIDE_TARGET_MISSING", path=path))
            continue
        _validate_override(path=path, target=target, override=override, tokens=tokens, findings=findings)
    for role in REQUIRED_FOUNDATION_ROLES:
        if role not in tokens:
            findings.append(_finding("DESIGN_SYSTEM_SEMANTIC_ROLE_MISSING", path=role))
        elif _resolve_token_value(role, theme, tokens) is None:
            findings.append(_finding("DESIGN_SYSTEM_SEMANTIC_ROLE_UNRESOLVED", path=role))
    _validate_contrast(theme, tokens, findings)


def _validate_override(
    *,
    path: str,
    target: DesignTokenDefinitionV1,
    override: DesignThemeOverrideV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    if override.alias is not None:
        alias_target = tokens.get(override.alias)
        if alias_target is None:
            findings.append(_finding("DESIGN_SYSTEM_TOKEN_REFERENCE_MISSING", path=path, related_path=override.alias))
        elif alias_target.type != target.type:
            findings.append(_finding("DESIGN_SYSTEM_TOKEN_TYPE_MISMATCH", path=path, related_path=override.alias))
        return
    try:
        validate_typed_token_value(target.type, cast(TokenValue, override.value))
    except ValueError:
        findings.append(_finding("DESIGN_SYSTEM_THEME_OVERRIDE_VALUE_INVALID", path=path))


def _validate_typography(
    manifest: DesignSystemManifestV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    required_types = {
        "font_family_token": "font-family",
        "font_weight_token": "font-weight",
        "font_size_token": "dimension",
        "line_height_token": "number",
        "letter_spacing_token": "dimension",
    }
    for role in manifest.typography_roles:
        for field, expected_type in required_types.items():
            path = getattr(role, field)
            if path is None:
                continue
            token = tokens.get(path)
            if token is None or token.type != expected_type:
                findings.append(_finding("DESIGN_SYSTEM_TYPOGRAPHY_REFERENCE_INVALID", path=path))


def _validate_motion(
    manifest: DesignSystemManifestV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    for role in manifest.motion_tokens:
        references = (
            (role.duration_token, "duration"),
            (role.easing_token, "cubic-bezier"),
            (role.reduced_motion_duration_token, "duration"),
        )
        for path, expected_type in references:
            token = tokens.get(path)
            if token is None or token.type != expected_type:
                findings.append(_finding("DESIGN_SYSTEM_MOTION_REFERENCE_INVALID", path=path))


def _validate_gated_inputs(
    manifest: DesignSystemManifestV1,
    findings: list[DesignSystemValidationFinding],
) -> None:
    if manifest.asset_references:
        findings.append(_finding("DESIGN_SYSTEM_ASSET_REFERENCE_GATED"))


def _validate_contrast(
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
    findings: list[DesignSystemValidationFinding],
) -> None:
    scenarios = (
        ("semantic.color.text.primary", "semantic.color.surface.canvas", 4.5),
        ("semantic.color.text.secondary", "semantic.color.surface.canvas", 4.5),
        ("semantic.color.action.on-primary", "semantic.color.action.primary", 4.5),
        ("semantic.color.focus.ring", "semantic.color.surface.canvas", 3.0),
    )
    for foreground_path, background_path, minimum in scenarios:
        foreground = _resolve_token_value(foreground_path, theme, tokens)
        background = _resolve_token_value(background_path, theme, tokens)
        if not isinstance(foreground, str) or not isinstance(background, str):
            continue
        if not foreground.startswith("#") or not background.startswith("#"):
            continue
        if _contrast_ratio(foreground, background) < minimum:
            findings.append(
                _finding("DESIGN_SYSTEM_CONTRAST_FAILED", path=foreground_path, related_path=background_path)
            )


def _resolve_token_value(
    path: str,
    theme: DesignThemeV1,
    tokens: Mapping[str, DesignTokenDefinitionV1],
) -> TokenValue | None:
    active: set[str] = set()

    def resolve(current: str) -> TokenValue | None:
        if current in active:
            return None
        active.add(current)
        override = theme.overrides.get(current)
        token = tokens.get(current)
        if token is None:
            return None
        if override is not None:
            value = override.value if override.value is not None else resolve(override.alias or "")
        else:
            value = token.value if token.value is not None else resolve(token.alias or "")
        active.remove(current)
        return value

    return resolve(path)


def _contrast_ratio(first: str, second: str) -> float:
    lighter, darker = sorted((_relative_luminance(first), _relative_luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def _relative_luminance(value: str) -> float:
    channels = tuple(int(value[index : index + 2], 16) / 255 for index in (1, 3, 5))
    linear = tuple(
        channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels
    )
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _layer_rank(path: str) -> int:
    return {"primitive": 0, "semantic": 1, "component": 2}[path.split(".", 1)[0]]


def _finding_hash(
    *,
    checksum: str,
    status: DesignSystemValidationStatus,
    token_index_hash: str,
    component_catalog_checksum: str | None,
    findings: tuple[DesignSystemValidationFinding, ...],
) -> str:
    return design_system_content_digest(
        orjson.dumps(
            {
                "checksum": checksum,
                "profile": "foundation",
                "validatorVersion": FOUNDATION_VALIDATOR_VERSION,
                "status": status.value,
                "tokenIndexHash": token_index_hash,
                "componentCatalogChecksum": component_catalog_checksum,
                "findings": [item.model_dump(mode="json", by_alias=True) for item in findings],
            },
            option=orjson.OPT_SORT_KEYS,
        )
    )


def _finding(
    code: str,
    *,
    severity: Literal["warning", "blocker"] = "blocker",
    path: str | None = None,
    related_path: str | None = None,
) -> DesignSystemValidationFinding:
    return DesignSystemValidationFinding(
        code=code,
        severity=severity,
        path=path,
        related_path=related_path,
        message_key=code,
        message=t("errors", code),
    )
