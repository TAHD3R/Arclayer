from __future__ import annotations

import zipfile
from io import BytesIO
from pathlib import Path

import pytest

from apps.api.src.config import get_settings
from apps.api.src.core.exceptions.types import BadRequest
from apps.api.src.modules.system.plugins.manager.install.service import PluginInstallService
from apps.api.src.modules.system.plugins.manager.repository import PluginRepository


def _merge_config(current: dict[str, object], updates: dict[str, object]) -> dict[str, object]:
    merged = dict(current or {})
    for key, value in updates.items():
        merged[key] = value
    return merged


def _build_install_service(tmp_path: Path) -> PluginInstallService:
    settings = get_settings()
    return PluginInstallService(
        settings,
        repo=PluginRepository(),
        manager=None,
        root_dir=tmp_path,
        merge_config=_merge_config,
    )


def _write_zip(path: Path, files: dict[str, bytes]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)


def _minimal_plugin_toml(*, plugin_id: str, slug: str, entrypoint: str) -> bytes:
    return "\n".join([
        "[plugin]",
        f'id = "{plugin_id}"',
        f'slug = "{slug}"',
        'name = "Demo"',
        'description = "Demo"',
        'author = "Test"',
        'version = "0.1.0"',
        'requires = ">=2026.01.18-dev"',
        f'entrypoint = "{entrypoint}"',
        "",
    ]).encode("utf-8")


def test_plugin_upload_filename_sanitization_accepts_windows_fakepath(tmp_path) -> None:
    install = _build_install_service(tmp_path)
    assert install._sanitize_upload_filename(r"C:\fakepath\demo.zip") == "demo.zip"


def test_plugin_upload_filename_sanitization_rejects_traversal(tmp_path) -> None:
    install = _build_install_service(tmp_path)
    with pytest.raises(BadRequest) as exc:
        install._sanitize_upload_filename("../../evil.zip")
    assert exc.value.error == "PLUGIN_PACKAGE_INVALID"


def test_plugin_manifest_rejects_invalid_id(tmp_path) -> None:
    zip_path = tmp_path / "bad.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="demo/evil",
        slug="demo-evil",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(zip_path, {"plugin.toml": plugin_toml})

    install = _build_install_service(tmp_path)
    with pytest.raises(BadRequest) as exc:
        install._validate_zip(zip_path)
    assert exc.value.error == "PLUGIN_ID_INVALID"


def test_plugin_manifest_rejects_reserved_id(tmp_path) -> None:
    zip_path = tmp_path / "bad.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="core",
        slug="core",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(zip_path, {"plugin.toml": plugin_toml})

    install = _build_install_service(tmp_path)
    with pytest.raises(BadRequest) as exc:
        install._validate_zip(zip_path)
    assert exc.value.error == "PLUGIN_ID_RESERVED"


def test_plugin_zip_rejects_too_many_files(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PLUGIN__PACKAGE_MAX_FILES", "2")
    install = _build_install_service(tmp_path)

    zip_path = tmp_path / "demo.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="demo-too-many-files",
        slug="demo-too-many-files",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(
        zip_path,
        {
            "plugin.toml": plugin_toml,
            "a.txt": b"a",
            "b.txt": b"b",
        },
    )

    extract_dir = tmp_path / "payload"
    with zipfile.ZipFile(zip_path) as zf:
        with pytest.raises(BadRequest) as exc:
            install._safe_extract(zf, extract_dir)
    assert exc.value.error == "PLUGIN_PACKAGE_TOO_MANY_FILES"


def test_plugin_zip_rejects_total_uncompressed_size(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PLUGIN__PACKAGE_MAX_TOTAL_UNCOMPRESSED_BYTES", "500")
    install = _build_install_service(tmp_path)

    zip_path = tmp_path / "demo.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="demo-size-limit",
        slug="demo-size-limit",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(
        zip_path,
        {
            "plugin.toml": plugin_toml,
            "big-a.bin": b"a" * 400,
            "big-b.bin": b"b" * 200,
        },
    )

    extract_dir = tmp_path / "payload"
    with zipfile.ZipFile(zip_path) as zf:
        with pytest.raises(BadRequest) as exc:
            install._safe_extract(zf, extract_dir)
    assert exc.value.error == "PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE"


def test_plugin_zip_rejects_single_file_size(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PLUGIN__PACKAGE_MAX_SINGLE_FILE_BYTES", "100")
    install = _build_install_service(tmp_path)

    zip_path = tmp_path / "demo.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="demo-single-file-limit",
        slug="demo-single-file-limit",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(
        zip_path,
        {
            "plugin.toml": plugin_toml,
            "too-big.bin": b"x" * 200,
        },
    )

    extract_dir = tmp_path / "payload"
    with zipfile.ZipFile(zip_path) as zf:
        with pytest.raises(BadRequest) as exc:
            install._safe_extract(zf, extract_dir)
    assert exc.value.error == "PLUGIN_PACKAGE_FILE_TOO_LARGE"


def test_plugin_zip_rejects_symlink_entries(tmp_path) -> None:
    install = _build_install_service(tmp_path)

    zip_path = tmp_path / "demo.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="demo-symlink",
        slug="demo-symlink",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(zip_path, {"plugin.toml": plugin_toml})

    # Add a unix symlink entry.
    with zipfile.ZipFile(zip_path, "a", compression=zipfile.ZIP_DEFLATED) as zf:
        info = zipfile.ZipInfo("link")
        # Mark as symlink: 0o120777.
        info.external_attr = (0o120777 & 0xFFFF) << 16
        zf.writestr(info, b"target")

    extract_dir = tmp_path / "payload"
    with zipfile.ZipFile(zip_path) as zf:
        with pytest.raises(BadRequest) as exc:
            install._safe_extract(zf, extract_dir)
    assert exc.value.error == "PLUGIN_PACKAGE_HAS_SYMLINK"


def test_plugin_zip_rejects_backslash_traversal_paths(tmp_path) -> None:
    install = _build_install_service(tmp_path)

    zip_path = tmp_path / "demo.zip"
    plugin_toml = _minimal_plugin_toml(
        plugin_id="demo-backslash-traversal",
        slug="demo-backslash-traversal",
        entrypoint="demo.plugin:DemoPlugin",
    )
    _write_zip(
        zip_path,
        {
            "plugin.toml": plugin_toml,
            "a\\..\\evil.txt": b"evil",
        },
    )

    extract_dir = tmp_path / "payload"
    with zipfile.ZipFile(zip_path) as zf:
        with pytest.raises(BadRequest) as exc:
            install._safe_extract(zf, extract_dir)
    assert exc.value.error == "PLUGIN_PACKAGE_INVALID"


@pytest.mark.asyncio
async def test_plugin_upload_rejects_zip_too_large(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PLUGIN__PACKAGE_MAX_ZIP_BYTES", "100")
    install = _build_install_service(tmp_path)

    class _DummyUpload:
        def __init__(self, filename: str, payload: bytes) -> None:
            self.filename: str | None = filename
            self._buffer = BytesIO(payload)

        async def read(self, size: int = -1) -> bytes:
            return self._buffer.read(size)

        async def close(self) -> None:
            self._buffer.close()

    upload = _DummyUpload(filename="demo.zip", payload=b"x" * 200)
    with pytest.raises(BadRequest) as exc:
        settings = get_settings()
        await install._save_upload(upload, tmp_path / "demo.zip", max_bytes=settings.plugin.package_max_zip_bytes)
    assert exc.value.error == "PLUGIN_PACKAGE_TOO_LARGE"
