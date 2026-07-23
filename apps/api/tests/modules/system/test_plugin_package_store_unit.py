from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.config import PluginDistributionSettings
from src.modules.system.plugins.package_store import PluginPackageStore, PluginPackageValidationError
from src.settings.signing import ensure_signing_keypair, sign_detached


@pytest.fixture
def signing_material(tmp_path: Path):
    private_key, _, _ = ensure_signing_keypair(
        private_path=tmp_path / "keys" / "plugin-signing.key",
        public_path=tmp_path / "keys" / "plugin-signing.pub",
    )
    return private_key, tmp_path / "keys" / "plugin-signing.pub"


def _settings(tmp_path: Path, *, public_key_path: Path | None) -> PluginDistributionSettings:
    return PluginDistributionSettings(
        root_dir=tmp_path / "managed-plugins",
        staging_dir=tmp_path / "managed-plugins" / ".staging",
        trusted_public_key_paths=[] if public_key_path is None else [public_key_path],
        max_package_bytes=2 * 1024 * 1024,
        max_extracted_bytes=4 * 1024 * 1024,
        max_file_count=32,
        max_compression_ratio=200,
    )


def _package_archive(*, extra_entries: dict[str, bytes] | None = None) -> bytes:
    manifest = {
        "name": "example-plugin",
        "version": "1.2.3",
        "entry": "src/plugin.py",
        "requires": {"platform": ">=2026.1", "python": ">=3.12"},
        "provides": {"services": [], "middlewares": [], "providers": [], "connectors": [], "content_types": []},
        "permissions": ["system.example.read"],
        "config_schema": {},
        "admin": {
            "label_key": "settings:PLUGIN_EXAMPLE",
            "description_key": "settings:PLUGIN_EXAMPLE_DESC",
        },
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("extension.json", json.dumps(manifest))
        archive.writestr("src/plugin.py", "def create_plugin():\n    return object()\n")
        for name, payload in (extra_entries or {}).items():
            archive.writestr(name, payload)
    return output.getvalue()


def test_verify_and_stage_commits_signed_package_to_immutable_paths(tmp_path: Path, signing_material) -> None:
    private_key, public_key_path = signing_material
    payload = _package_archive()
    signature = sign_detached(payload, private_key=private_key)
    store = PluginPackageStore(_settings(tmp_path, public_key_path=public_key_path))

    first = store.verify_and_stage(archive=payload, detached_signature=signature)
    second = store.verify_and_stage(
        archive=payload,
        detached_signature=signature,
        expected_artifact_checksum=first.artifact_checksum,
        expected_package_checksum=first.package_checksum,
        expected_manifest_digest=first.manifest_digest,
    )

    assert first == second
    assert first.manifest.name == "example-plugin"
    assert store.resolve_package_path(first.package_relative_path).joinpath("extension.json").is_file()
    assert (store.settings.root_dir / first.archive_relative_path).is_file()
    assert not any(store.settings.staging_dir.iterdir())

    with pytest.raises(ValidationError, match="Instance is frozen"):
        first.package_checksum = "sha256:mutated"


def test_verify_and_stage_rejects_signature_outside_trust_policy(tmp_path: Path, signing_material) -> None:
    private_key, _ = signing_material
    payload = _package_archive()
    store = PluginPackageStore(_settings(tmp_path, public_key_path=None))

    with pytest.raises(PluginPackageValidationError) as exc_info:
        store.verify_and_stage(
            archive=payload,
            detached_signature=sign_detached(payload, private_key=private_key),
        )

    assert exc_info.value.code == "PLUGIN_TRUST_POLICY_UNAVAILABLE"


def test_verify_and_stage_rejects_path_traversal(tmp_path: Path, signing_material) -> None:
    private_key, public_key_path = signing_material
    payload = _package_archive(extra_entries={"../outside.py": b"unsafe"})
    signature = sign_detached(payload, private_key=private_key)
    store = PluginPackageStore(_settings(tmp_path, public_key_path=public_key_path))

    with pytest.raises(PluginPackageValidationError) as exc_info:
        store.verify_and_stage(archive=payload, detached_signature=signature)

    assert exc_info.value.code == "PLUGIN_PACKAGE_PATH_INVALID"
    assert not (tmp_path / "outside.py").exists()


def test_verify_and_stage_rejects_symlink_member(tmp_path: Path, signing_material) -> None:
    private_key, public_key_path = signing_material
    output = io.BytesIO(_package_archive())
    rewritten = io.BytesIO()
    with zipfile.ZipFile(output) as source, zipfile.ZipFile(rewritten, "w") as target:
        for member in source.infolist():
            target.writestr(member, source.read(member))
        symlink = zipfile.ZipInfo("src/link.py")
        symlink.create_system = 3
        symlink.external_attr = 0o120777 << 16
        target.writestr(symlink, "plugin.py")
    payload = rewritten.getvalue()
    signature = sign_detached(payload, private_key=private_key)
    store = PluginPackageStore(_settings(tmp_path, public_key_path=public_key_path))

    with pytest.raises(PluginPackageValidationError) as exc_info:
        store.verify_and_stage(archive=payload, detached_signature=signature)

    assert exc_info.value.code == "PLUGIN_PACKAGE_SPECIAL_FILE_FORBIDDEN"


def test_verify_and_stage_rejects_checksum_mismatch(tmp_path: Path, signing_material) -> None:
    private_key, public_key_path = signing_material
    payload = _package_archive()
    signature = sign_detached(payload, private_key=private_key)
    store = PluginPackageStore(_settings(tmp_path, public_key_path=public_key_path))

    with pytest.raises(PluginPackageValidationError) as exc_info:
        store.verify_and_stage(
            archive=payload,
            detached_signature=signature,
            expected_artifact_checksum=f"sha256:{'0' * 64}",
        )

    assert exc_info.value.code == "PLUGIN_ARTIFACT_CHECKSUM_MISMATCH"
