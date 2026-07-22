from __future__ import annotations

from uuid import uuid4

from src.models.skills._enums import SkillPackageScope, SkillUpdateRisk
from src.modules.workspaces.skills.manifest import (
    SkillCompatibilityV1,
    SkillDataEgressDeclarationV1,
    SkillManifestResourceV1,
    SkillManifestV1,
    SkillPermissionDeclarationV1,
    SkillPublisherV1,
    SkillToolRequirementV1,
    compute_skill_package_checksum,
)
from src.modules.workspaces.skills.schema import SkillResourceOut, SkillValidationFindingOut
from src.modules.workspaces.skills.update_review import (
    SkillUpdateTarget,
    build_skill_update_preview,
)


def _manifest(
    *,
    instruction_digest: str,
    reference_digest: str | None = None,
    tool_version: str = ">=1",
    permission: bool = False,
    data_egress: bool = False,
    arclayer_range: str = ">=1",
) -> SkillManifestV1:
    resources = [
        SkillManifestResourceV1(
            path="SKILL.md",
            role="instructions",
            mime_type="text/markdown",
            byte_size=20,
            digest=instruction_digest,
        )
    ]
    if reference_digest is not None:
        resources.append(
            SkillManifestResourceV1(
                path="references/checklist.md",
                role="reference",
                mime_type="text/markdown",
                byte_size=12,
                digest=reference_digest,
            )
        )
    manifest = SkillManifestV1(
        manifest_version=1,
        skill_id="workspace.update-review",
        name="Update review",
        description="Review one exact Skill update.",
        publisher=SkillPublisherV1(id="workspace:test", name="Workspace", verified=False),
        compatibility=SkillCompatibilityV1(agent_protocol=1, arclayer_range=arclayer_range),
        instructions_entrypoint="SKILL.md",
        resources=tuple(resources),
        required_tools=(
            SkillToolRequirementV1(
                tool_id="content.read",
                version_range=tool_version,
                intended_use="Read workspace content.",
            ),
        ),
        permissions=(
            SkillPermissionDeclarationV1(
                action="content:manage",
                purpose="Update approved content.",
            ),
        )
        if permission
        else (),
        data_egress=(
            SkillDataEgressDeclarationV1(
                destination="analytics.example.com",
                purpose="Send aggregate metrics.",
                data_classes=("aggregate.metrics",),
            ),
        )
        if data_egress
        else (),
        capability_tags=("content.editorial",),
        checksum="sha256:" + ("0" * 64),
    )
    return manifest.model_copy(update={"checksum": compute_skill_package_checksum(manifest)})


def _target(
    *,
    package_id,
    version_id,
    version_number: int,
    manifest: SkillManifestV1,
    source_revision: str,
    finding_code: str,
) -> SkillUpdateTarget:
    resources = tuple(
        SkillResourceOut(
            path=resource.path,
            role=resource.role,
            mime_type=resource.mime_type,
            byte_size=resource.byte_size,
            digest=resource.digest,
            content=None,
        )
        for resource in manifest.resources
    )
    findings = (
        SkillValidationFindingOut(
            code=finding_code,
            severity="warning",
            resource_path="SKILL.md",
            message_key="SKILL_VALIDATION_SUSPICIOUS_INSTRUCTION",
            message="Review this instruction.",
        ),
    )
    return SkillUpdateTarget(
        package_scope=SkillPackageScope.WORKSPACE,
        package_id=package_id,
        version_id=version_id,
        version_number=version_number,
        semantic_version=f"1.{version_number - 1}.0",
        package_checksum=manifest.checksum,
        manifest=manifest,
        resources=resources,
        validation_policy_version=1,
        validation_status="warning",
        validation_finding_hash="sha256:" + (str(version_number) * 64),
        validation_findings=findings,
        source_provenance={"kind": "github", "resolvedCommit": source_revision * 40},
    )


def test_update_preview_classifies_exact_diffs_and_hashes_all_review_evidence() -> None:
    installation_id = uuid4()
    package_id = uuid4()
    current = _target(
        package_id=package_id,
        version_id=uuid4(),
        version_number=1,
        manifest=_manifest(instruction_digest="sha256:" + ("1" * 64)),
        source_revision="a",
        finding_code="CURRENT_WARNING",
    )
    candidate = _target(
        package_id=package_id,
        version_id=uuid4(),
        version_number=2,
        manifest=_manifest(
            instruction_digest="sha256:" + ("2" * 64),
            reference_digest="sha256:" + ("3" * 64),
            tool_version=">=2",
            permission=True,
            data_egress=True,
            arclayer_range=">=2",
        ),
        source_revision="b",
        finding_code="CANDIDATE_WARNING",
    )

    preview = build_skill_update_preview(
        installation_id=installation_id,
        expected_revision=4,
        current=current,
        candidate=candidate,
    )
    replay = build_skill_update_preview(
        installation_id=installation_id,
        expected_revision=4,
        current=current,
        candidate=candidate,
    )
    changed_revision = build_skill_update_preview(
        installation_id=installation_id,
        expected_revision=5,
        current=current,
        candidate=candidate,
    )

    assert preview.risk == SkillUpdateRisk.DATA_EGRESS
    assert preview.risk_categories == (
        SkillUpdateRisk.CONTENT,
        SkillUpdateRisk.CAPABILITY,
        SkillUpdateRisk.PERMISSION,
        SkillUpdateRisk.DATA_EGRESS,
    )
    assert preview.diff.instructions_changed is True
    assert preview.diff.compatibility_changed is True
    assert preview.diff.source_provenance_changed is True
    assert preview.diff.validation_findings_changed is True
    assert [(item.path, item.change_type) for item in preview.diff.resource_changes] == [
        ("SKILL.md", "modified"),
        ("references/checklist.md", "added"),
    ]
    assert [(item.tool_id, item.change_type) for item in preview.diff.required_tool_changes] == [
        ("content.read", "modified")
    ]
    assert [(item.action, item.change_type) for item in preview.diff.permission_changes] == [
        ("content:manage", "added")
    ]
    assert [(item.destination, item.change_type) for item in preview.diff.data_egress_changes] == [
        ("analytics.example.com", "added")
    ]
    assert preview.preview_hash == replay.preview_hash
    assert preview.preview_hash != changed_revision.preview_hash
