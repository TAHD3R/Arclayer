from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.config import Settings


def _settings() -> Settings:
    return Settings()


def test_canonical_asset_filename() -> None:
    from src.modules.assets.service import canonical_asset_filename

    assert canonical_asset_filename(slug="avatar", ext="png") == "avatar.png"
    assert canonical_asset_filename(slug="avatar", ext=".png") == "avatar.png"
    assert canonical_asset_filename(slug="", ext="") == "asset.bin"


def test_build_asset_headers_sets_noindex_by_default() -> None:
    from src.modules.assets.service import AssetPublicView, build_asset_headers

    view = AssetPublicView(
        id=uuid4(),
        slug="x",
        ext="png",
        mime="image/png",
        checksum_sha256=None,
        original_filename="x.png",
        object_key="org/x/assets/y.png",
        storage_bucket=None,
        indexable=False,
        variants=None,
        storage_provider="local",
    )
    headers = build_asset_headers(view)
    assert headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert headers["X-Robots-Tag"] == "noindex"


def test_build_asset_headers_omits_noindex_when_indexable() -> None:
    from src.modules.assets.service import AssetPublicView, build_asset_headers

    view = AssetPublicView(
        id=uuid4(),
        slug="x",
        ext="png",
        mime="image/png",
        checksum_sha256=None,
        original_filename="x.png",
        object_key="org/x/assets/y.png",
        storage_bucket=None,
        indexable=True,
        variants=None,
        storage_provider="local",
    )
    headers = build_asset_headers(view)
    assert "X-Robots-Tag" not in headers


def test_build_asset_redirect_headers_disables_redirect_caching() -> None:
    from src.modules.assets.service import AssetPublicView, build_asset_redirect_headers

    view = AssetPublicView(
        id=uuid4(),
        slug="x",
        ext="png",
        mime="image/png",
        checksum_sha256=None,
        original_filename="x.png",
        object_key="org/x/assets/y.png",
        storage_bucket=None,
        indexable=False,
        variants=None,
        storage_provider="s3",
    )

    headers = build_asset_redirect_headers(view)

    assert headers["Cache-Control"] == "no-store"
    assert headers["X-Robots-Tag"] == "noindex"


@pytest.mark.asyncio
async def test_public_asset_serve_applies_local_image_transform(tmp_path) -> None:
    from PIL import Image

    from src.modules.assets.service import AssetsService
    from src.platform.assets.images import ImageTransformParams

    root = tmp_path / "uploads"
    source = root / "assets" / "demo.png"
    source.parent.mkdir(parents=True)
    Image.new("RGB", (400, 200), color=(120, 20, 220)).save(source, format="PNG")

    service = AssetsService(_settings())
    service.settings.storage.local_root_dir = root
    asset_id = uuid4()

    async def fake_get_public_asset(**_kwargs):
        return SimpleNamespace(
            id=asset_id,
            slug="demo",
            ext="png",
            mime="image/png",
            checksum_sha256="sha",
            original_filename="demo.png",
            object_key="assets/demo.png",
            storage_bucket=None,
            storage_profile_key=None,
            indexable=False,
            variants=None,
            storage_provider="local",
        )

    service.repo = SimpleNamespace(get_public_asset=fake_get_public_asset)
    transform = ImageTransformParams(width=100, format="jpg", quality=80).ensure_requested()

    first = await service.serve(asset_id=asset_id, filename="demo.png", range_header=None, transform=transform)
    second = await service.serve(asset_id=asset_id, filename="demo.png", range_header=None, transform=transform)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["content-type"].startswith("image/jpeg")
    assert first.headers["x-image-transform-cache"] == "miss"
    assert second.headers["x-image-transform-cache"] == "hit"


@pytest.mark.asyncio
async def test_public_asset_lookup_searches_ready_tenant_schemas(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.modules.assets import repository as repository_module
    from src.modules.assets.repository import AssetsRepository

    asset_id = uuid4()
    expected = SimpleNamespace(id=asset_id)
    calls: list[tuple[str, object | None]] = []

    async def fake_get_or_none(**kwargs):
        using_db = kwargs.get("using_db")
        schema_name = getattr(using_db, "schema_name", None)
        calls.append(("asset", schema_name))
        if schema_name == "workspace_ready":
            return expected
        return None

    class FakeTenantQuery:
        async def values_list(self, *_args, **_kwargs):
            return ["workspace_ready"]

    class FakeTenantRecord:
        @staticmethod
        def filter(**_kwargs):
            return FakeTenantQuery()

    class FakeConn:
        schema_name: str | None = None

    @asynccontextmanager
    async def fake_transaction():
        yield FakeConn()

    async def fake_set_tenant_search_path(conn, schema_name: str):
        conn.schema_name = schema_name

    monkeypatch.setattr(repository_module.AssetRecord, "get_or_none", fake_get_or_none)
    monkeypatch.setattr(repository_module, "WorkspaceTenantRecord", FakeTenantRecord)
    monkeypatch.setattr(repository_module, "in_transaction", fake_transaction)
    monkeypatch.setattr(repository_module, "set_tenant_search_path", fake_set_tenant_search_path)

    found = await AssetsRepository().get_public_asset(asset_id=asset_id)

    assert found is expected
    assert calls == [("asset", None), ("asset", "workspace_ready")]


@pytest.mark.asyncio
async def test_public_thumbnail_redirects_to_remote_thumbnail_variant(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.modules.assets.service import AssetsService

    asset_id = uuid4()
    object_key = f"assets/{asset_id}/thumb-512.jpg"
    service = AssetsService(_settings())

    async def fake_get_public_asset(**_kwargs):
        return SimpleNamespace(
            id=asset_id,
            slug="demo",
            ext="pdf",
            mime="application/pdf",
            checksum_sha256="abc123",
            original_filename="demo.pdf",
            object_key=f"assets/{asset_id}/demo.pdf",
            storage_bucket="arclayer-public",
            storage_profile_key="cloud-main",
            indexable=False,
            variants={
                "thumbnails": [
                    {"name": "thumb_256", "width": 256, "object_key": f"assets/{asset_id}/thumb-256.jpg"},
                    {"name": "thumb_512", "width": 512, "object_key": object_key, "mime": "image/jpeg"},
                ]
            },
            storage_provider="aws_s3",
        )

    service.repo = SimpleNamespace(
        get_public_asset=fake_get_public_asset,
    )

    async def fake_get_profile_for_key(_profile_key: str | None):
        return SimpleNamespace(
            public_delivery_mode="direct",
            public_base_url="http://localhost:9000/arclayer-public",
            public_bucket="arclayer-public",
            capabilities=SimpleNamespace(supports_custom_public_base_url=True),
            presign_expires_seconds=900,
        )

    monkeypatch.setattr(service, "_get_profile_for_key", fake_get_profile_for_key)

    response = await service.thumbnail(asset_id=asset_id, width=400, range_header=None)

    assert response.status_code == 302
    assert response.headers["location"] == f"http://localhost:9000/arclayer-public/{object_key}"
