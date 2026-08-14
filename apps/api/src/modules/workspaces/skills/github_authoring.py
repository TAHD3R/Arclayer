from __future__ import annotations

from uuid import UUID

from src.modules.workspaces.skills.authoring import InlineSkillResource, InlineSkillVersion
from src.modules.workspaces.skills.github_source import GitHubSkillSnapshot, normalize_github_repository_url
from src.modules.workspaces.skills.manifest import (
    SkillCompatibilityV1,
    SkillManifestResourceV1,
    SkillManifestV1,
    SkillPublisherV1,
    compute_skill_package_checksum,
    skill_content_digest,
    validate_skill_package_checksum,
)


def build_github_skill_version(
    *,
    workspace_id: UUID,
    snapshot: GitHubSkillSnapshot,
) -> InlineSkillVersion:
    metadata = snapshot.metadata
    if metadata is None:
        raise ValueError("GitHub Skill snapshot is missing parsed package metadata")
    repository = normalize_github_repository_url(snapshot.repository_url)
    resources = tuple(
        InlineSkillResource(
            path=resource.path,
            role="instructions" if resource.path == "SKILL.md" else "reference",
            mime_type=resource.mime_type,
            content=resource.content,
            encoded_content=resource.content.encode("utf-8"),
            digest=skill_content_digest(resource.content.encode("utf-8")),
        )
        for resource in snapshot.resources
    )
    publisher_id = f"github:{repository.owner}/{repository.repository}"
    manifest = SkillManifestV1(
        skill_id=f"workspace:{workspace_id}:github:{metadata.slug}",
        name=metadata.display_name,
        description=metadata.description,
        publisher=SkillPublisherV1(
            id=publisher_id,
            name=f"{repository.owner}/{repository.repository}",
            verified=False,
        ),
        compatibility=SkillCompatibilityV1(),
        instructions_entrypoint="SKILL.md",
        resources=tuple(
            SkillManifestResourceV1(
                path=resource.path,
                role=resource.role,
                mime_type=resource.mime_type,
                byte_size=resource.byte_size,
                digest=resource.digest,
            )
            for resource in resources
        ),
        required_tools=metadata.required_tools,
        permissions=metadata.permissions,
        data_egress=metadata.data_egress,
        capability_tags=metadata.capability_tags,
        checksum="sha256:" + ("0" * 64),
    )
    manifest = manifest.model_copy(update={"checksum": compute_skill_package_checksum(manifest)})
    validate_skill_package_checksum(manifest)
    return InlineSkillVersion(manifest=manifest, resources=resources)
