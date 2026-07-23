from __future__ import annotations

import hashlib
import os
import shutil
import stat
import zipfile
from pathlib import Path, PurePosixPath
from uuid import uuid4

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic import BaseModel, ConfigDict

from src.config import PluginDistributionSettings
from src.core.extensions.manifest import ExtensionManifest, parse_manifest
from src.settings.signing import fingerprint_key_bytes, load_public_key, verify_detached

_CHECKSUM_PREFIX = "sha256:"
_REJECTED_PACKAGE_PARTS = frozenset({".git", "__pycache__"})


class PluginPackageValidationError(ValueError):
    def __init__(self, *, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class VerifiedPluginPackage(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    manifest: ExtensionManifest
    archive_relative_path: str
    package_relative_path: str
    artifact_checksum: str
    package_checksum: str
    manifest_digest: str
    detached_signature: str
    signer_fingerprint: str
    size_bytes: int


class PluginPackageStore:
    def __init__(self, settings: PluginDistributionSettings) -> None:
        self.settings = settings

    def verify_and_stage(
        self,
        *,
        archive: bytes,
        detached_signature: str,
        expected_artifact_checksum: str | None = None,
        expected_package_checksum: str | None = None,
        expected_manifest_digest: str | None = None,
    ) -> VerifiedPluginPackage:
        self._validate_archive_size(archive)
        artifact_checksum = _sha256_bytes(archive)
        _require_expected_checksum(
            actual=artifact_checksum,
            expected=expected_artifact_checksum,
            code="PLUGIN_ARTIFACT_CHECKSUM_MISMATCH",
        )
        signer_fingerprint = self._verify_signature(archive, detached_signature)

        staging_root = self.settings.staging_dir / str(uuid4())
        staging_package = staging_root / "package"
        staging_archive = staging_root / "package.zip"
        staging_package.mkdir(parents=True, exist_ok=False)
        try:
            staging_archive.write_bytes(archive)
            self._extract_archive(staging_archive, staging_package)
            manifest = parse_manifest(staging_package / "extension.json")
            self._validate_entry_module(manifest, package_dir=staging_package)
            manifest_digest = _sha256_bytes((staging_package / "extension.json").read_bytes())
            package_checksum = calculate_directory_checksum(staging_package)
            _require_expected_checksum(
                actual=package_checksum,
                expected=expected_package_checksum,
                code="PLUGIN_PACKAGE_CHECKSUM_MISMATCH",
            )
            _require_expected_checksum(
                actual=manifest_digest,
                expected=expected_manifest_digest,
                code="PLUGIN_MANIFEST_DIGEST_MISMATCH",
            )
            archive_path, package_path = self._commit_immutable_package(
                staging_archive=staging_archive,
                staging_package=staging_package,
                manifest=manifest,
                artifact_checksum=artifact_checksum,
                package_checksum=package_checksum,
            )
        except Exception:
            shutil.rmtree(staging_root, ignore_errors=True)
            raise
        shutil.rmtree(staging_root, ignore_errors=True)
        return VerifiedPluginPackage(
            manifest=manifest,
            archive_relative_path=self._relative_path(archive_path),
            package_relative_path=self._relative_path(package_path),
            artifact_checksum=artifact_checksum,
            package_checksum=package_checksum,
            manifest_digest=manifest_digest,
            detached_signature=detached_signature,
            signer_fingerprint=signer_fingerprint,
            size_bytes=len(archive),
        )

    def resolve_package_path(self, relative_path: str) -> Path:
        candidate = (self.settings.root_dir / relative_path).resolve()
        root = self.settings.root_dir.resolve()
        if not candidate.is_relative_to(root):
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_PATH_INVALID",
                safe_message="Plugin package path resolves outside the managed plugin store",
            )
        if not candidate.is_dir():
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_NOT_FOUND",
                safe_message="Managed plugin package directory was not found",
            )
        return candidate

    def _verify_signature(self, archive: bytes, detached_signature: str) -> str:
        if not detached_signature.strip():
            raise PluginPackageValidationError(
                code="PLUGIN_SIGNATURE_REQUIRED",
                safe_message="A detached Ed25519 package signature is required",
            )
        if not self.settings.trusted_public_key_paths:
            raise PluginPackageValidationError(
                code="PLUGIN_TRUST_POLICY_UNAVAILABLE",
                safe_message="No trusted plugin signing keys are configured",
            )
        for key_path in self.settings.trusted_public_key_paths:
            public_key = load_public_key(key_path)
            if not verify_detached(archive, signature_b64=detached_signature, public_key=public_key):
                continue
            key_bytes = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
            return fingerprint_key_bytes(key_bytes)
        raise PluginPackageValidationError(
            code="PLUGIN_SIGNATURE_INVALID",
            safe_message="Plugin package signature is not valid for an approved signing key",
        )

    def _validate_archive_size(self, archive: bytes) -> None:
        if not archive:
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_EMPTY",
                safe_message="Plugin package is empty",
            )
        if len(archive) > self.settings.max_package_bytes:
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_TOO_LARGE",
                safe_message="Plugin package exceeds the configured upload limit",
            )

    def _extract_archive(self, archive_path: Path, destination: Path) -> None:
        try:
            with zipfile.ZipFile(archive_path) as archive:
                members = archive.infolist()
                self._validate_members(members)
                for member in members:
                    self._extract_member(archive, member, destination=destination)
        except zipfile.BadZipFile as exc:
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_ARCHIVE_INVALID",
                safe_message="Plugin package is not a valid ZIP archive",
            ) from exc

    def _validate_members(self, members: list[zipfile.ZipInfo]) -> None:
        if len(members) > self.settings.max_file_count:
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_FILE_LIMIT_EXCEEDED",
                safe_message="Plugin package contains too many archive entries",
            )
        seen: set[str] = set()
        total_size = 0
        for member in members:
            normalized = _validated_member_path(member)
            collision_key = normalized.casefold()
            if collision_key in seen:
                raise PluginPackageValidationError(
                    code="PLUGIN_PACKAGE_DUPLICATE_PATH",
                    safe_message="Plugin package contains duplicate or case-colliding paths",
                )
            seen.add(collision_key)
            total_size += member.file_size
            if total_size > self.settings.max_extracted_bytes:
                raise PluginPackageValidationError(
                    code="PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED",
                    safe_message="Plugin package exceeds the configured extracted-size limit",
                )
            if member.file_size and (
                member.compress_size == 0
                or member.file_size / member.compress_size > self.settings.max_compression_ratio
            ):
                raise PluginPackageValidationError(
                    code="PLUGIN_PACKAGE_COMPRESSION_RATIO_EXCEEDED",
                    safe_message="Plugin package contains an unsafe compression ratio",
                )

    @staticmethod
    def _extract_member(archive: zipfile.ZipFile, member: zipfile.ZipInfo, *, destination: Path) -> None:
        relative = PurePosixPath(member.filename)
        target = destination.joinpath(*relative.parts)
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member, "r") as source, target.open("xb") as output:
            shutil.copyfileobj(source, output)

    @staticmethod
    def _validate_entry_module(manifest: ExtensionManifest, *, package_dir: Path) -> None:
        entry_path = (package_dir / manifest.entry).resolve()
        if not entry_path.is_relative_to(package_dir.resolve()) or not entry_path.is_file():
            raise PluginPackageValidationError(
                code="PLUGIN_ENTRY_MODULE_NOT_FOUND",
                safe_message="Plugin entry module declared by extension.json was not found",
            )

    def _commit_immutable_package(
        self,
        *,
        staging_archive: Path,
        staging_package: Path,
        manifest: ExtensionManifest,
        artifact_checksum: str,
        package_checksum: str,
    ) -> tuple[Path, Path]:
        artifact_key = artifact_checksum.removeprefix(_CHECKSUM_PREFIX)
        package_key = package_checksum.removeprefix(_CHECKSUM_PREFIX)
        archive_path = self.settings.root_dir / "artifacts" / f"{artifact_key}.zip"
        package_path = self.settings.root_dir / "packages" / manifest.name / manifest.version / package_key
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        package_path.parent.mkdir(parents=True, exist_ok=True)
        if archive_path.exists():
            _require_expected_checksum(
                actual=_sha256_bytes(archive_path.read_bytes()),
                expected=artifact_checksum,
                code="PLUGIN_ARTIFACT_STORE_CONFLICT",
            )
        else:
            os.replace(staging_archive, archive_path)
        if package_path.exists():
            _require_expected_checksum(
                actual=calculate_directory_checksum(package_path),
                expected=package_checksum,
                code="PLUGIN_PACKAGE_STORE_CONFLICT",
            )
        else:
            os.replace(staging_package, package_path)
        return archive_path, package_path

    def _relative_path(self, path: Path) -> str:
        return path.resolve().relative_to(self.settings.root_dir.resolve()).as_posix()


def calculate_directory_checksum(package_dir: Path) -> str:
    digest = hashlib.sha256()
    root = package_dir.resolve()
    for path in sorted(package_dir.rglob("*")):
        if path.is_symlink():
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_SYMLINK_FORBIDDEN",
                safe_message="Plugin package contains a symbolic link",
            )
        if not path.is_file():
            continue
        resolved = path.resolve()
        if not resolved.is_relative_to(root):
            raise PluginPackageValidationError(
                code="PLUGIN_PACKAGE_PATH_INVALID",
                safe_message="Plugin package file resolves outside its package directory",
            )
        relative_path = path.relative_to(package_dir).as_posix().encode()
        digest.update(relative_path)
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"{_CHECKSUM_PREFIX}{digest.hexdigest()}"


def _validated_member_path(member: zipfile.ZipInfo) -> str:
    raw = member.filename
    path = PurePosixPath(raw)
    mode = member.external_attr >> 16
    file_type = stat.S_IFMT(mode)
    if not raw or "\\" in raw or "\x00" in raw or path.is_absolute() or ".." in path.parts:
        raise PluginPackageValidationError(
            code="PLUGIN_PACKAGE_PATH_INVALID",
            safe_message="Plugin package contains an unsafe archive path",
        )
    if any(part in _REJECTED_PACKAGE_PARTS for part in path.parts) or path.suffix == ".pyc":
        raise PluginPackageValidationError(
            code="PLUGIN_PACKAGE_CONTENT_FORBIDDEN",
            safe_message="Plugin package contains development or bytecode artifacts",
        )
    if stat.S_ISLNK(mode) or file_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
        raise PluginPackageValidationError(
            code="PLUGIN_PACKAGE_SPECIAL_FILE_FORBIDDEN",
            safe_message="Plugin package contains a symbolic link or special file",
        )
    return path.as_posix().rstrip("/")


def _sha256_bytes(payload: bytes) -> str:
    return f"{_CHECKSUM_PREFIX}{hashlib.sha256(payload).hexdigest()}"


def _require_expected_checksum(*, actual: str, expected: str | None, code: str) -> None:
    if expected is not None and actual != expected:
        raise PluginPackageValidationError(code=code, safe_message="Plugin package integrity verification failed")
