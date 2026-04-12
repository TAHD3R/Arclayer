from __future__ import annotations

import json
import zipfile

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.modules.workspaces.themes.service import WorkspaceThemesService


def _write_zip(path, *, files: dict[str, str | bytes]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            data = content.encode("utf-8") if isinstance(content, str) else content
            zf.writestr(name, data)


def test_theme_import_validates_manifest_and_entrypoints(tmp_path) -> None:
    z = tmp_path / "theme.zip"
    manifest = {
        "themeId": "@arclayer/theme-modern",
        "name": "Modern",
        "version": "0.1.0",
        "entrypoints": {"tokensCss": "styles/tokens.css"},
        "variants": [],
        "presets": [],
    }
    _write_zip(
        z,
        files={
            "manifest.json": json.dumps(manifest),
            "styles/tokens.css": ":root{--color-primary:#1677ff;}",
        },
    )

    service = WorkspaceThemesService(get_settings())
    got_manifest, variants, presets, entrypoints = service._read_and_validate_theme_zip(z)  # type: ignore[attr-defined]
    assert got_manifest.theme_id == "@arclayer/theme-modern"
    assert got_manifest.version == "0.1.0"
    assert variants is None
    assert presets is None
    assert entrypoints.tokens_css_bytes.startswith(b":root")


def test_theme_import_rejects_executable_files(tmp_path) -> None:
    z = tmp_path / "theme.zip"
    manifest = {
        "themeId": "arclayer-theme-modern",
        "version": "0.1.0",
        "entrypoints": {"tokensCss": "tokens.css"},
    }
    _write_zip(
        z,
        files={
            "manifest.json": json.dumps(manifest),
            "tokens.css": ":root{}",
            "index.js": "console.log('pwn')",
        },
    )

    service = WorkspaceThemesService(get_settings())
    with pytest.raises(BadRequest) as exc:
        service._read_and_validate_theme_zip(z)  # type: ignore[attr-defined]
    assert exc.value.error == "THEME_IMPORT_FORBIDDEN_FILE"


def test_theme_import_validates_variant_payload_using_page_blueprint(tmp_path) -> None:
    z = tmp_path / "theme.zip"
    manifest = {
        "themeId": "@arclayer/theme-modern",
        "version": "0.1.0",
        "entrypoints": {"tokensCss": "tokens.css"},
        "variants": [{"variantId": "home-a", "name": "Home A", "path": "variants/home.json"}],
    }
    variant = {
        "pageBlueprint": {
            "version": 1,
            "rootId": "page",
            "nodesById": {
                "page": {
                    "id": "page",
                    "type": "page_root",
                    "children": ["h1"],
                    "layout": {"children": {"mode": "absolute"}},
                },
                "h1": {
                    "id": "h1",
                    "type": "text",
                    "text": {"en-US": "Hi"},
                    "tag": "h1",
                },
            },
        }
    }
    _write_zip(
        z,
        files={
            "manifest.json": json.dumps(manifest),
            "tokens.css": ":root{}",
            "variants/home.json": json.dumps(variant),
        },
    )

    service = WorkspaceThemesService(get_settings())
    _m, variants, _p, _e = service._read_and_validate_theme_zip(z)  # type: ignore[attr-defined]
    assert variants is not None
    assert "home-a" in variants
