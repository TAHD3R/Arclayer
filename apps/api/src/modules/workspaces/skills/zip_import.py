from __future__ import annotations

import hashlib
import io
import json
import stat
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Literal

from pydantic import ConfigDict, Field, ValidationError

from src.common.schemas import BaseSchema
from src.modules.workspaces.skills.authoring import MAX_INLINE_PACKAGE_BYTES
from src.modules.workspaces.skills.manifest import (
    SkillDataEgressDeclarationV1,
    SkillPermissionDeclarationV1,
    SkillToolRequirementV1,
)
from src.modules.workspaces.skills.schema import (
    SkillInlineReferenceInput,
    SkillPackageCreateRequest,
)

MAX_SKILL_ZIP_ARCHIVE_BYTES = 2_097_152
MAX_SKILL_ZIP_FILE_COUNT = 130
MAX_SKILL_ZIP_EXPANDED_BYTES = MAX_INLINE_PACKAGE_BYTES + 65_536
MAX_SKILL_ZIP_COMPRESSION_RATIO = 100
METADATA_PATH = "skill.json"
INSTRUCTIONS_PATH = "SKILL.md"

_REFERENCE_MIME_BY_SUFFIX: dict[str, Literal["text/markdown", "text/plain", "application/json"]] = {
    ".json": "application/json",
    ".md": "text/markdown",
    ".txt": "text/plain",
}


class SkillZipImportError(ValueError):
    def __init__(self, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message


class SkillZipMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    slug: str = Field(min_length=1, max_length=96)
    display_name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)
    semantic_version: str | None = Field(default=None, min_length=1, max_length=64)
    required_tools: tuple[SkillToolRequirementV1, ...] = Field(default_factory=tuple, max_length=128)
    permissions: tuple[SkillPermissionDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    data_egress: tuple[SkillDataEgressDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    capability_tags: tuple[str, ...] = Field(default_factory=tuple, max_length=128)


@dataclass(frozen=True, slots=True)
class ParsedSkillZip:
    payload: SkillPackageCreateRequest
    archive_checksum: str


def parse_workspace_skill_zip(archive_bytes: bytes) -> ParsedSkillZip:
    _validate_archive_bytes(archive_bytes)
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            files = _resolve_package_root(_read_archive_files(archive))
    except zipfile.BadZipFile as exc:
        raise SkillZipImportError("SKILL_ZIP_INVALID", "The uploaded file is not a valid ZIP archive") from exc
    metadata_bytes = files.pop(METADATA_PATH, None)
    instructions_bytes = files.pop(INSTRUCTIONS_PATH, None)
    if metadata_bytes is None or instructions_bytes is None:
        raise SkillZipImportError(
            "SKILL_ZIP_REQUIRED_FILES_MISSING",
            "The ZIP must contain skill.json and SKILL.md at the root or inside one wrapping folder",
        )
    metadata = _parse_metadata(metadata_bytes)
    references = tuple(_reference(path, content) for path, content in sorted(files.items()))
    try:
        payload = SkillPackageCreateRequest(
            slug=metadata.slug,
            display_name=metadata.display_name,
            description=metadata.description,
            semantic_version=metadata.semantic_version,
            instructions=_decode_text(INSTRUCTIONS_PATH, instructions_bytes),
            references=references,
            required_tools=metadata.required_tools,
            permissions=metadata.permissions,
            data_egress=metadata.data_egress,
            capability_tags=metadata.capability_tags,
        )
    except ValidationError as exc:
        raise SkillZipImportError(
            "SKILL_ZIP_PACKAGE_INVALID",
            "The ZIP package content does not satisfy the Skill package contract",
        ) from exc
    return ParsedSkillZip(
        payload=payload,
        archive_checksum=f"sha256:{hashlib.sha256(archive_bytes).hexdigest()}",
    )


def _validate_archive_bytes(archive_bytes: bytes) -> None:
    if not archive_bytes:
        raise SkillZipImportError("SKILL_ZIP_EMPTY", "The uploaded ZIP archive is empty")
    if len(archive_bytes) > MAX_SKILL_ZIP_ARCHIVE_BYTES:
        raise SkillZipImportError(
            "SKILL_ZIP_TOO_LARGE",
            "The uploaded ZIP archive exceeds the two MiB compressed-size limit",
        )


def _read_archive_files(archive: zipfile.ZipFile) -> dict[str, bytes]:
    members = archive.infolist()
    if len(members) > MAX_SKILL_ZIP_FILE_COUNT:
        raise SkillZipImportError("SKILL_ZIP_FILE_LIMIT", "The ZIP archive contains too many entries")
    files: dict[str, bytes] = {}
    seen: set[str] = set()
    expanded_bytes = 0
    for member in members:
        path = _validated_member_path(member)
        collision_key = path.casefold()
        if collision_key in seen:
            raise SkillZipImportError(
                "SKILL_ZIP_DUPLICATE_PATH",
                "The ZIP archive contains duplicate or case-colliding paths",
            )
        seen.add(collision_key)
        expanded_bytes += member.file_size
        if expanded_bytes > MAX_SKILL_ZIP_EXPANDED_BYTES:
            raise SkillZipImportError(
                "SKILL_ZIP_EXPANDED_SIZE_EXCEEDED",
                "The ZIP archive exceeds the expanded-size limit",
            )
        if member.file_size and (
            member.compress_size == 0 or member.file_size / member.compress_size > MAX_SKILL_ZIP_COMPRESSION_RATIO
        ):
            raise SkillZipImportError(
                "SKILL_ZIP_COMPRESSION_RATIO_EXCEEDED",
                "The ZIP archive contains an unsafe compression ratio",
            )
        if member.is_dir():
            continue
        files[path] = archive.read(member)
    return files


def _resolve_package_root(files: dict[str, bytes]) -> dict[str, bytes]:
    if METADATA_PATH in files and INSTRUCTIONS_PATH in files:
        return files
    top_level_folders = {
        PurePosixPath(path).parts[0]
        for path in files
        if len(PurePosixPath(path).parts) > 1
    }
    if len(top_level_folders) != 1 or any(len(PurePosixPath(path).parts) < 2 for path in files):
        return files
    wrapping_folder = next(iter(top_level_folders))
    prefix = f"{wrapping_folder}/"
    return {path.removeprefix(prefix): content for path, content in files.items()}


def _validated_member_path(member: zipfile.ZipInfo) -> str:
    raw = member.filename
    path = PurePosixPath(raw)
    mode = member.external_attr >> 16
    file_type = stat.S_IFMT(mode)
    if not raw or "\\" in raw or "\x00" in raw or path.is_absolute() or ".." in path.parts or member.flag_bits & 0x1:
        raise SkillZipImportError("SKILL_ZIP_PATH_INVALID", "The ZIP archive contains an unsafe path")
    if stat.S_ISLNK(mode) or file_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
        raise SkillZipImportError(
            "SKILL_ZIP_SPECIAL_FILE_FORBIDDEN",
            "The ZIP archive contains a symbolic link or special file",
        )
    return path.as_posix().rstrip("/")


def _parse_metadata(content: bytes) -> SkillZipMetadata:
    try:
        return SkillZipMetadata.model_validate_json(content)
    except ValidationError as exc:
        raise SkillZipImportError(
            "SKILL_ZIP_METADATA_INVALID",
            "skill.json does not satisfy the Skill ZIP metadata contract",
        ) from exc


def _reference(path: str, content: bytes) -> SkillInlineReferenceInput:
    mime_type = _REFERENCE_MIME_BY_SUFFIX.get(PurePosixPath(path).suffix.lower())
    if mime_type is None:
        raise SkillZipImportError(
            "SKILL_ZIP_REFERENCE_TYPE_UNSUPPORTED",
            "ZIP references must use .md, .txt, or .json files",
        )
    text = _decode_text(path, content)
    if mime_type == "application/json":
        try:
            json.loads(text)
        except json.JSONDecodeError as exc:
            raise SkillZipImportError(
                "SKILL_ZIP_REFERENCE_JSON_INVALID",
                f"Reference {path} is not valid JSON",
            ) from exc
    return SkillInlineReferenceInput(path=path, content=text, mime_type=mime_type)


def _decode_text(path: str, content: bytes) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SkillZipImportError(
            "SKILL_ZIP_TEXT_ENCODING_INVALID",
            f"Skill ZIP file {path} must be UTF-8 text",
        ) from exc
