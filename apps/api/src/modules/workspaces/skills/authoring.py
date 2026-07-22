from __future__ import annotations

import json
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.modules.workspaces.skills.manifest import (
    SkillCompatibilityV1,
    SkillManifestResourceV1,
    SkillManifestV1,
    SkillPublisherV1,
    compute_skill_package_checksum,
    skill_content_digest,
    validate_skill_package_checksum,
)
from src.modules.workspaces.skills.schema import SkillInlineVersionInput

# Inline content is transactionally stored in PostgreSQL. This bound prevents a
# single authoring request from monopolizing API memory or an oversized tenant
# transaction; larger resources must use the authorized Asset path.
MAX_INLINE_PACKAGE_BYTES = 1_048_576
INSTRUCTIONS_PATH = "SKILL.md"
VALIDATION_POLICY_VERSION = 1


class InlineSkillResource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    path: str
    role: Literal["instructions", "reference", "asset"]
    mime_type: str
    content: str
    encoded_content: bytes
    digest: str

    @property
    def byte_size(self) -> int:
        return len(self.encoded_content)


class InlineSkillVersion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    manifest: SkillManifestV1
    resources: tuple[InlineSkillResource, ...]


def build_inline_skill_version(
    *,
    workspace_id: UUID,
    slug: str,
    display_name: str,
    description: str,
    payload: SkillInlineVersionInput,
) -> InlineSkillVersion:
    resources = _build_resources(payload)
    total_bytes = sum(resource.byte_size for resource in resources)
    if total_bytes > MAX_INLINE_PACKAGE_BYTES:
        raise ValueError("Inline Skill package exceeds the one MiB storage boundary")

    publisher_id = f"workspace:{workspace_id}"
    manifest = SkillManifestV1(
        skill_id=f"{publisher_id}:{slug}",
        name=display_name,
        description=description,
        publisher=SkillPublisherV1(id=publisher_id, name="Workspace", verified=False),
        compatibility=SkillCompatibilityV1(),
        instructions_entrypoint=INSTRUCTIONS_PATH,
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
        required_tools=payload.required_tools,
        permissions=payload.permissions,
        data_egress=payload.data_egress,
        capability_tags=payload.capability_tags,
        checksum="sha256:" + ("0" * 64),
    )
    manifest = manifest.model_copy(update={"checksum": compute_skill_package_checksum(manifest)})
    validate_skill_package_checksum(manifest)
    return InlineSkillVersion(manifest=manifest, resources=resources)


def _build_resources(payload: SkillInlineVersionInput) -> tuple[InlineSkillResource, ...]:
    resources = [
        _resource(
            path=INSTRUCTIONS_PATH,
            role="instructions",
            mime_type="text/markdown",
            content=payload.instructions,
        )
    ]
    resources.extend(
        _resource(
            path=reference.path,
            role="reference",
            mime_type=reference.mime_type,
            content=reference.content,
        )
        for reference in payload.references
    )
    return tuple(resources)


def _resource(
    *,
    path: str,
    role: Literal["instructions", "reference", "asset"],
    mime_type: str,
    content: str,
) -> InlineSkillResource:
    encoded = content.encode("utf-8")
    if mime_type == "application/json":
        json.loads(encoded)
    return InlineSkillResource(
        path=path,
        role=role,
        mime_type=mime_type,
        content=content,
        encoded_content=encoded,
        digest=skill_content_digest(encoded),
    )
