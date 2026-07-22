from __future__ import annotations

from uuid import uuid4

from src.models.skills._enums import SkillValidationStatus, SkillVersionStatus
from src.models.skills.skill_version import SkillResourceRecord, SkillVersionRecord
from src.modules.workspaces.skills.authoring import build_inline_skill_version
from src.modules.workspaces.skills.schema import SkillVersionCreateRequest
from src.modules.workspaces.skills.validation import validate_persisted_skill_version


def _persisted_version(*, instructions: str) -> tuple[SkillVersionRecord, tuple[SkillResourceRecord, ...]]:
    workspace_id = uuid4()
    package_id = uuid4()
    authored = build_inline_skill_version(
        workspace_id=workspace_id,
        slug="validation-test",
        display_name="Validation Test",
        description="Exercises deterministic Skill validation.",
        payload=SkillVersionCreateRequest(instructions=instructions),
    )
    version = SkillVersionRecord(
        package_id=package_id,
        workspace_id=workspace_id,
        version_number=1,
        manifest_version=1,
        manifest=authored.manifest.model_dump(mode="json", by_alias=True),
        package_checksum=authored.manifest.checksum,
        source_provenance={"kind": "inline"},
        compatibility=authored.manifest.compatibility.model_dump(mode="json", by_alias=True),
        required_tools=[],
        permissions=[],
        data_egress=[],
        capability_tags=[],
        validation_policy_version=1,
        status=SkillVersionStatus.CANDIDATE,
        request_idempotency_key="validation-test-version",
        request_fingerprint="a" * 64,
    )
    resources = tuple(
        SkillResourceRecord(
            skill_version_id=version.id,
            workspace_id=workspace_id,
            normalized_path=resource.path,
            role=resource.role,
            mime_type=resource.mime_type,
            byte_size=resource.byte_size,
            content_digest=resource.digest,
            inline_content=resource.content,
            storage_reference={},
        )
        for resource in authored.resources
    )
    return version, resources


def test_validation_marks_consistent_inert_resources_valid() -> None:
    version, resources = _persisted_version(instructions="Use approved evidence and cite every claim.")

    outcome = validate_persisted_skill_version(
        version=version,
        resources=resources,
        policy_version=1,
    )

    assert outcome.status == SkillValidationStatus.VALID
    assert outcome.findings == ()
    assert outcome.finding_hash.startswith("sha256:")


def test_validation_marks_resource_digest_mutation_invalid() -> None:
    version, resources = _persisted_version(instructions="Use approved evidence.")
    resources[0].inline_content = "Mutated after the immutable digest."

    outcome = validate_persisted_skill_version(
        version=version,
        resources=resources,
        policy_version=1,
    )

    assert outcome.status == SkillValidationStatus.INVALID
    assert [finding.code for finding in outcome.findings] == ["SKILL_RESOURCE_DIGEST_MISMATCH"]


def test_validation_quarantines_secret_looking_content_without_echoing_it() -> None:
    secret = "sk-abcdefghijklmnopqrstuvwxyz123456"
    version, resources = _persisted_version(instructions=f"Provider token: {secret}")

    outcome = validate_persisted_skill_version(
        version=version,
        resources=resources,
        policy_version=1,
    )

    assert outcome.status == SkillValidationStatus.QUARANTINED
    assert [finding.code for finding in outcome.findings] == ["SKILL_SECRET_DETECTED"]
    assert secret not in outcome.findings[0].message
