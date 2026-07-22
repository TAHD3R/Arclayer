from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.modules.workspaces.skills.manifest import (
    SkillManifestResourceV1,
    SkillManifestV1,
    SkillPublisherV1,
    compute_skill_package_checksum,
    normalize_skill_resource_path,
    skill_content_digest,
    validate_skill_package_checksum,
)


def _manifest(*, resources: tuple[SkillManifestResourceV1, ...] | None = None) -> SkillManifestV1:
    instruction_bytes = b"# Editorial voice\n\nUse direct, evidence-backed language.\n"
    manifest = SkillManifestV1(
        skill_id="workspace.editorial-voice",
        name="Editorial Voice",
        description="Applies the approved workspace editorial voice.",
        publisher=SkillPublisherV1(id="workspace:example", name="Example workspace", verified=False),
        instructions_entrypoint="SKILL.md",
        resources=resources
        or (
            SkillManifestResourceV1(
                path="SKILL.md",
                role="instructions",
                mime_type="text/markdown",
                byte_size=len(instruction_bytes),
                digest=skill_content_digest(instruction_bytes),
            ),
        ),
        checksum="sha256:" + "0" * 64,
    )
    return manifest.model_copy(update={"checksum": compute_skill_package_checksum(manifest)})


def test_manifest_checksum_is_canonical_across_resource_order() -> None:
    instructions = _manifest().resources[0]
    reference_bytes = b"Approved terms"
    reference = SkillManifestResourceV1(
        path="references/terms.txt",
        role="reference",
        mime_type="text/plain",
        byte_size=len(reference_bytes),
        digest=skill_content_digest(reference_bytes),
    )

    left = _manifest(resources=(instructions, reference))
    right = _manifest(resources=(reference, instructions))

    assert left.checksum == right.checksum
    validate_skill_package_checksum(left)


def test_manifest_rejects_unknown_or_executable_contract_fields() -> None:
    payload = _manifest().model_dump(mode="json", by_alias=True)
    payload["postInstall"] = "npm install"

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        SkillManifestV1.model_validate(payload)


@pytest.mark.parametrize(
    "path",
    (
        "/etc/passwd",
        "../SKILL.md",
        "references/../../secret",
        "references\\secret.txt",
        "./SKILL.md",
    ),
)
def test_resource_path_rejects_escape_and_noncanonical_forms(path: str) -> None:
    with pytest.raises(ValueError):
        normalize_skill_resource_path(path)


def test_manifest_rejects_case_collisions_and_missing_instruction_entrypoint() -> None:
    instructions = _manifest().resources[0]
    collision = instructions.model_copy(update={"path": "skill.md"})

    with pytest.raises(ValidationError, match="case collisions"):
        _manifest(resources=(instructions, collision))

    with pytest.raises(ValidationError, match="entrypoint"):
        _manifest(resources=(instructions.model_copy(update={"role": "reference"}),))


def test_checksum_validation_rejects_mutated_manifest() -> None:
    manifest = _manifest()
    mutated = manifest.model_copy(update={"description": "Changed after signing"})

    with pytest.raises(ValueError, match="checksum"):
        validate_skill_package_checksum(mutated)
