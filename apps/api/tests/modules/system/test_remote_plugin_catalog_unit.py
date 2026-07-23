from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from src.config import PluginDistributionSettings
from src.modules.system.plugins.remote_catalog import (
    PluginCatalogError,
    RemotePluginArtifact,
    RemotePluginCatalogClient,
    RemotePluginCatalogEnvelope,
    RemotePluginCatalogPayload,
)
from src.settings.signing import ensure_signing_keypair, fingerprint_key_bytes, sign_detached


def _catalog_document(tmp_path: Path, *, artifact_url: str = "http://catalog.test/example.zip") -> bytes:
    private_key, public_key, _ = ensure_signing_keypair(
        private_path=tmp_path / "catalog.key",
        public_path=tmp_path / "catalog.pub",
    )
    fingerprint = fingerprint_key_bytes(public_key.public_bytes(Encoding.Raw, PublicFormat.Raw))
    manifest = {
        "name": "example-plugin",
        "version": "1.2.3",
        "entry": "src/plugin.py",
        "requires": {},
        "provides": {},
        "permissions": [],
        "config_schema": {},
        "admin": None,
    }
    payload = RemotePluginCatalogPayload(
        schema_version=1,
        catalog_revision="2026-07-23.1",
        generated_at=datetime(2026, 7, 23, tzinfo=UTC),
        items=(
            RemotePluginArtifact.model_validate({
                "artifact_url": artifact_url,
                "artifact_checksum": f"sha256:{'1' * 64}",
                "package_checksum": f"sha256:{'2' * 64}",
                "manifest_digest": f"sha256:{'3' * 64}",
                "detached_signature": "package-signature",
                "signer_fingerprint": fingerprint,
                "size_bytes": 512,
                "manifest": manifest,
            }),
        ),
    )
    canonical = json.dumps(
        payload.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return (
        RemotePluginCatalogEnvelope(
            payload=payload,
            detached_signature=sign_detached(canonical, private_key=private_key),
            signer_fingerprint=fingerprint,
        )
        .model_dump_json(by_alias=True)
        .encode()
    )


def _client(
    tmp_path: Path,
    *,
    response_body: bytes,
    allowed_hosts: list[str] | None = None,
) -> RemotePluginCatalogClient:
    settings = PluginDistributionSettings.model_validate({
        "root_dir": tmp_path / "plugins",
        "staging_dir": tmp_path / "plugins" / ".staging",
        "catalog_index_url": "http://catalog.test/index.json",
        "trusted_public_key_paths": [tmp_path / "catalog.pub"],
        "allowed_download_hosts": allowed_hosts or ["catalog.test"],
    })
    return RemotePluginCatalogClient(
        settings,
        allow_insecure_http=True,
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=response_body)),
    )


@pytest.mark.asyncio
async def test_fetch_verifies_signed_catalog_and_selects_exact_item(tmp_path: Path) -> None:
    document = _catalog_document(tmp_path)
    client = _client(tmp_path, response_body=document)

    catalog = await client.fetch()
    selected = client.select_item(catalog, plugin_name="example-plugin", version="1.2.3")

    assert catalog.catalog_revision == "2026-07-23.1"
    assert selected.manifest.name == "example-plugin"


@pytest.mark.asyncio
async def test_fetch_rejects_tampered_signed_catalog(tmp_path: Path) -> None:
    document = _catalog_document(tmp_path).replace(b"2026-07-23.1", b"2026-07-23.2")
    client = _client(tmp_path, response_body=document)

    with pytest.raises(PluginCatalogError) as exc_info:
        await client.fetch()

    assert exc_info.value.code == "PLUGIN_CATALOG_SIGNATURE_INVALID"


@pytest.mark.asyncio
async def test_fetch_rejects_artifact_origin_outside_allow_list(tmp_path: Path) -> None:
    document = _catalog_document(tmp_path, artifact_url="http://packages.test/example.zip")
    client = _client(tmp_path, response_body=document)

    with pytest.raises(PluginCatalogError) as exc_info:
        await client.fetch()

    assert exc_info.value.code == "PLUGIN_CATALOG_ORIGIN_NOT_ALLOWED"
