from __future__ import annotations

from typing import Literal, cast

from src.models.design_systems.publication import DesignSystemArtifactRecord, DesignSystemPublicationRecord
from src.modules.workspaces.design_systems.publication_schema import (
    WorkspaceDesignSystemArtifactOut,
    WorkspaceDesignSystemPublicationOut,
)


def project_publication(
    *,
    publication: DesignSystemPublicationRecord,
    artifact: DesignSystemArtifactRecord,
) -> WorkspaceDesignSystemPublicationOut:
    return WorkspaceDesignSystemPublicationOut(
        id=publication.id,
        workspace_id=publication.workspace_id,
        design_system_id=publication.design_system_id,
        version_id=publication.design_system_version_id,
        manifest_checksum=publication.manifest_checksum,
        validation_finding_hash=publication.validation_finding_hash,
        validator_version=publication.validator_version,
        job_id=publication.job_id,
        status=cast(Literal["pending", "building", "published", "failed"], str(publication.status)),
        actor_user_id=publication.actor_user_id,
        artifact=WorkspaceDesignSystemArtifactOut(
            id=artifact.id,
            artifact_input_hash=artifact.artifact_input_hash,
            artifact_hash=artifact.artifact_hash,
            status=cast(Literal["pending", "building", "ready", "failed"], str(artifact.status)),
            compiler_version=artifact.compiler_version,
            renderer_profile=artifact.renderer_profile,
            renderer_version=artifact.renderer_version,
            component_catalog_version=artifact.component_catalog_version,
            asset_pins_hash=publication.asset_pins_hash,
            failure_code=artifact.failure_code,
            created_at=artifact.created_at,
            built_at=artifact.built_at,
        ),
        failure_code=publication.failure_code,
        created_at=publication.created_at,
        published_at=publication.published_at,
    )
