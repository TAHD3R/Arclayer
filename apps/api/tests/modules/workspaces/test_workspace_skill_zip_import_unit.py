from __future__ import annotations

import hashlib
import io
import json
import stat
import zipfile

import pytest

from src.modules.workspaces.skills.zip_import import (
    SkillZipImportError,
    parse_workspace_skill_zip,
)


def _archive(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return buffer.getvalue()


def _metadata() -> str:
    return json.dumps({
        "slug": "editorial-review",
        "displayName": "Editorial review",
        "description": "Reviews content against workspace editorial standards.",
        "semanticVersion": "1.0.0",
        "capabilityTags": ["content.editorial"],
        "requiredTools": [],
        "permissions": [],
        "dataEgress": [],
    })


def test_parse_workspace_skill_zip_builds_strict_immutable_payload() -> None:
    archive = _archive({
        "skill.json": _metadata(),
        "SKILL.md": "# Editorial review\n\nUse approved evidence only.",
        "references/checklist.md": "# Checklist\n\n- Cite claims",
        "references/rules.json": '{"claims":"cited"}',
    })
    parsed = parse_workspace_skill_zip(archive)

    assert parsed.payload.slug == "editorial-review"
    assert parsed.payload.display_name == "Editorial review"
    assert parsed.payload.instructions.startswith("# Editorial review")
    assert [reference.path for reference in parsed.payload.references] == [
        "references/checklist.md",
        "references/rules.json",
    ]
    assert parsed.payload.references[1].mime_type == "application/json"
    assert parsed.archive_checksum == f"sha256:{hashlib.sha256(archive).hexdigest()}"


def test_parse_workspace_skill_zip_accepts_one_wrapping_folder() -> None:
    parsed = parse_workspace_skill_zip(_archive({
        "editorial-review/skill.json": _metadata(),
        "editorial-review/SKILL.md": "# Editorial review\n\nUse approved evidence only.",
        "editorial-review/references/checklist.md": "# Checklist",
    }))

    assert parsed.payload.slug == "editorial-review"
    assert [reference.path for reference in parsed.payload.references] == [
        "references/checklist.md",
    ]


@pytest.mark.parametrize(
    ("archive", "code"),
    [
        (b"", "SKILL_ZIP_EMPTY"),
        (b"not-a-zip", "SKILL_ZIP_INVALID"),
    ],
)
def test_parse_workspace_skill_zip_rejects_invalid_archives(archive: bytes, code: str) -> None:
    with pytest.raises(SkillZipImportError) as exc_info:
        parse_workspace_skill_zip(archive)

    assert exc_info.value.code == code


@pytest.mark.parametrize(
    ("files", "code"),
    [
        ({"SKILL.md": "instructions"}, "SKILL_ZIP_REQUIRED_FILES_MISSING"),
        (
            {"skill.json": _metadata(), "SKILL.md": "instructions", "assets/logo.png": "png"},
            "SKILL_ZIP_REFERENCE_TYPE_UNSUPPORTED",
        ),
        (
            {"skill.json": _metadata(), "SKILL.md": "instructions", "references/data.json": "{"},
            "SKILL_ZIP_REFERENCE_JSON_INVALID",
        ),
        (
            {"skill.json": "{}", "SKILL.md": "instructions"},
            "SKILL_ZIP_METADATA_INVALID",
        ),
    ],
)
def test_parse_workspace_skill_zip_rejects_invalid_package_content(
    files: dict[str, str],
    code: str,
) -> None:
    with pytest.raises(SkillZipImportError) as exc_info:
        parse_workspace_skill_zip(_archive(files))

    assert exc_info.value.code == code


def test_parse_workspace_skill_zip_rejects_symbolic_links() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("skill.json", _metadata())
        archive.writestr("SKILL.md", "instructions")
        link = zipfile.ZipInfo("references/link.md")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(link, "../../secret")

    with pytest.raises(SkillZipImportError) as exc_info:
        parse_workspace_skill_zip(buffer.getvalue())

    assert exc_info.value.code == "SKILL_ZIP_SPECIAL_FILE_FORBIDDEN"


def test_parse_workspace_skill_zip_rejects_path_traversal() -> None:
    with pytest.raises(SkillZipImportError) as exc_info:
        parse_workspace_skill_zip(
            _archive({
                "skill.json": _metadata(),
                "SKILL.md": "instructions",
                "../outside.md": "unsafe",
            })
        )

    assert exc_info.value.code == "SKILL_ZIP_PATH_INVALID"


def test_parse_workspace_skill_zip_rejects_case_colliding_paths() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("skill.json", _metadata())
        archive.writestr("SKILL.md", "instructions")
        archive.writestr("references/Guide.md", "first")
        archive.writestr("references/guide.md", "second")

    with pytest.raises(SkillZipImportError) as exc_info:
        parse_workspace_skill_zip(buffer.getvalue())

    assert exc_info.value.code == "SKILL_ZIP_DUPLICATE_PATH"


def test_parse_workspace_skill_zip_rejects_non_utf8_text() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("skill.json", _metadata())
        archive.writestr("SKILL.md", b"\xff\xfe")

    with pytest.raises(SkillZipImportError) as exc_info:
        parse_workspace_skill_zip(buffer.getvalue())

    assert exc_info.value.code == "SKILL_ZIP_TEXT_ENCODING_INVALID"
