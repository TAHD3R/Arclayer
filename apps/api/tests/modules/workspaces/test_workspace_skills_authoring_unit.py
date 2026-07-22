from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.workspaces.skills.authoring import (
    build_inline_skill_version,
)
from src.modules.workspaces.skills.manifest import validate_skill_package_checksum
from src.modules.workspaces.skills.schema import (
    SkillInlineReferenceInput,
    SkillVersionCreateRequest,
)


def _payload(
    *,
    instructions: str = "# Editorial planning\n\nUse workspace evidence and cite every claim.",
    references: tuple[SkillInlineReferenceInput, ...] = (),
) -> SkillVersionCreateRequest:
    return SkillVersionCreateRequest(
        instructions=instructions,
        references=references,
        capability_tags=("content.editorial",),
    )


def test_inline_authoring_builds_canonical_manifest_and_resource_digests() -> None:
    authored = build_inline_skill_version(
        workspace_id=uuid4(),
        slug="editorial-planner",
        display_name="Editorial Planner",
        description="Plans reviewable articles from workspace evidence.",
        payload=_payload(
            references=(
                SkillInlineReferenceInput(
                    path="references/voice.md",
                    content="# Voice\n\nBe direct and specific.",
                ),
            ),
        ),
    )

    assert authored.manifest.instructions_entrypoint == "SKILL.md"
    assert [resource.path for resource in authored.resources] == [
        "SKILL.md",
        "references/voice.md",
    ]
    assert authored.manifest.resources[0].digest == authored.resources[0].digest
    assert authored.manifest.checksum.startswith("sha256:")
    validate_skill_package_checksum(authored.manifest)


def test_inline_authoring_rejects_case_colliding_resources() -> None:
    payload = _payload(
        references=(
            SkillInlineReferenceInput(path="references/voice.md", content="Voice A"),
            SkillInlineReferenceInput(path="References/Voice.md", content="Voice B"),
        ),
    )

    with pytest.raises(ValidationError, match="case collisions"):
        build_inline_skill_version(
            workspace_id=uuid4(),
            slug="editorial-planner",
            display_name="Editorial Planner",
            description="Plans reviewable articles from workspace evidence.",
            payload=payload,
        )


def test_inline_authoring_rejects_invalid_json_reference() -> None:
    payload = _payload(
        references=(
            SkillInlineReferenceInput(
                path="references/policy.json",
                content="{not-json}",
                mime_type="application/json",
            ),
        ),
    )

    with pytest.raises(ValueError):
        build_inline_skill_version(
            workspace_id=uuid4(),
            slug="editorial-planner",
            display_name="Editorial Planner",
            description="Plans reviewable articles from workspace evidence.",
            payload=payload,
        )


def test_inline_authoring_enforces_transactional_storage_boundary() -> None:
    payload = _payload(instructions="界" * 400_000)

    with pytest.raises(ValueError, match="one MiB"):
        build_inline_skill_version(
            workspace_id=uuid4(),
            slug="editorial-planner",
            display_name="Editorial Planner",
            description="Plans reviewable articles from workspace evidence.",
            payload=payload,
        )
