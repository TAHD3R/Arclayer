from __future__ import annotations

import io
import json
import time
import zipfile
from typing import Any, cast

import pytest

from apps.api.src.config import get_settings
from apps.api.src.core.exceptions import BadRequest
from apps.api.src.modules.system.plugins.manager.service import PluginService


class _MemoryUpload:
    """
    Minimal async UploadLike for unit tests.

    Why:
    - Starlette/FastAPI UploadFile uses threadpool-based file IO.
    - In this repo's async test runner environment that can hang (no IO-driven loop wakeups).
    - For unit tests we only need `filename`, `read()`, and `close()` semantics.
    """

    filename: str | None

    def __init__(self, data: bytes, *, filename: str) -> None:
        self.filename = filename
        self._buf = io.BytesIO(data)

    async def read(self, size: int = -1) -> bytes:
        return self._buf.read(size)

    async def close(self) -> None:
        self._buf.close()


def _build_minimal_plugin_zip_bytes(*, plugin_id: str, slug: str, entry_root: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "plugin.toml",
            "\n".join([
                "[plugin]",
                f'id = "{plugin_id}"',
                f'slug = "{slug}"',
                'name = "Demo"',
                'author = "Test"',
                'version = "0.0.1"',
                'requires = ">=2026.01.18-dev"',
                f'entrypoint = "{entry_root}.plugin:Plugin"',
                "",
            ]).encode("utf-8"),
        )
        zf.writestr(f"{entry_root}/__init__.py", b"")
        zf.writestr(f"{entry_root}/plugin.py", b"class Plugin: pass\n")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_validate_upload_to_staging_returns_token_and_manifest(plugin_root) -> None:
    settings = get_settings()
    service = PluginService(settings, manager=None)

    raw = _build_minimal_plugin_zip_bytes(plugin_id="plugin-demo", slug="demo", entry_root="demo")
    upload = cast(Any, _MemoryUpload(raw, filename="demo.zip"))

    token, sha256, size_bytes, manifest = await service.validate_upload_to_staging(file=upload, checksum=None)  # type: ignore
    assert token
    assert len(sha256) == 64
    assert size_bytes > 0
    assert manifest.plugin.id == "plugin-demo"

    validate_dir = plugin_root / ".staging" / "validate" / token
    assert validate_dir.is_dir()
    assert any(p.suffix == ".zip" for p in validate_dir.iterdir())


@pytest.mark.asyncio
async def test_install_from_staging_token_rejects_invalid_token(plugin_root) -> None:
    settings = get_settings()
    service = PluginService(settings, manager=None)

    with pytest.raises(BadRequest) as exc:
        await service.install_from_staging_token(token="not-a-hex-token", enable=True)
    assert exc.value.error == "PLUGIN_VALIDATE_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_install_from_staging_token_rejects_expired_token(plugin_root) -> None:
    settings = get_settings()
    service = PluginService(settings, manager=None)

    token = "a" * 32
    validate_dir = plugin_root / ".staging" / "validate" / token
    validate_dir.mkdir(parents=True, exist_ok=True)
    (validate_dir / "validate.json").write_text(
        json.dumps(
            {
                "token": token,
                "filename": "demo.zip",
                "sha256": "x" * 64,
                "size": 1,
                "created_at": int(time.time()) - 1000,
                "ttl_seconds": 1,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (validate_dir / "demo.zip").write_bytes(b"not-a-real-zip")

    with pytest.raises(BadRequest) as exc:
        await service.install_from_staging_token(token=token, enable=True)
    assert exc.value.error == "PLUGIN_VALIDATE_TOKEN_EXPIRED"
    assert not validate_dir.exists()
