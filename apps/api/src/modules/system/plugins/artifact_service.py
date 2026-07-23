from __future__ import annotations

import asyncio
from uuid import UUID

from asgi_correlation_id import correlation_id

from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.extensions.manifest import ExtensionManifest
from src.core.services import BaseService
from src.models.system.plugin_installation import PluginArtifactRecord, PluginSourceType
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.system.plugins.catalog import build_plugin_compatibility
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.package_store import (
    PluginPackageStore,
    PluginPackageValidationError,
    VerifiedPluginPackage,
)
from src.modules.system.plugins.remote_catalog import RemotePluginArtifact, RemotePluginCatalogPayload
from src.modules.system.plugins.schema import (
    SystemPluginAdminOut,
    SystemPluginArtifactReviewOut,
    SystemPluginCompatibilityOut,
    SystemPluginProvidesOut,
    SystemPluginSourceType,
)


class PluginArtifactService(BaseService):
    def __init__(
        self,
        *,
        repository: PluginLifecycleRepository | None = None,
        package_store: PluginPackageStore | None = None,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository or PluginLifecycleRepository()
        self.package_store = package_store or PluginPackageStore(self.settings.plugin_distribution)

    async def review_manual_upload(
        self,
        *,
        archive: bytes,
        detached_signature: str,
        actor_user_id: UUID,
    ) -> SystemPluginArtifactReviewOut:
        try:
            verified = await asyncio.to_thread(
                self.package_store.verify_and_stage,
                archive=archive,
                detached_signature=detached_signature,
            )
        except PluginPackageValidationError as exc:
            raise BadRequest(error=exc.code, message=exc.safe_message) from exc
        compatibility = build_plugin_compatibility(verified.manifest, settings=self.settings)
        record = await self._persist_verified_manual_artifact(
            verified=verified,
            compatibility=compatibility,
            actor_user_id=actor_user_id,
        )
        return _artifact_review_out(record)

    async def ensure_catalog_artifact(
        self,
        *,
        item: RemotePluginArtifact,
        catalog: RemotePluginCatalogPayload,
        actor_user_id: UUID,
    ) -> PluginArtifactRecord:
        compatibility = build_plugin_compatibility(item.manifest, settings=self.settings)
        data = {
            "plugin_name": item.manifest.name,
            "version": item.manifest.version,
            "source_type": PluginSourceType.CATALOG,
            "source_locator": str(item.artifact_url),
            "artifact_checksum": item.artifact_checksum,
            "package_checksum": item.package_checksum,
            "manifest_digest": item.manifest_digest,
            "detached_signature": item.detached_signature,
            "signer_fingerprint": item.signer_fingerprint,
            "provenance_status": "signed_catalog",
            "size_bytes": item.size_bytes,
            "compatibility": compatibility.model_dump(mode="json", by_alias=True),
            "review_projection": {
                "catalogRevision": catalog.catalog_revision,
                "manifest": item.manifest.model_dump(mode="json"),
            },
            "uploaded_by_user_id": actor_user_id,
        }
        async with self.tx() as conn:
            record = await self._get_or_create(data=data, conn=conn)
            await self._audit_review(record=record, actor_user_id=actor_user_id, conn=conn)
        return record

    async def get_review(self, artifact_id: UUID) -> SystemPluginArtifactReviewOut:
        record = await self.repository.get_artifact(artifact_id)
        if record is None:
            raise NotFound(error="PLUGIN_ARTIFACT_NOT_FOUND")
        return _artifact_review_out(record)

    async def _persist_verified_manual_artifact(
        self,
        *,
        verified: VerifiedPluginPackage,
        compatibility: SystemPluginCompatibilityOut,
        actor_user_id: UUID,
    ) -> PluginArtifactRecord:
        data = {
            "plugin_name": verified.manifest.name,
            "version": verified.manifest.version,
            "source_type": PluginSourceType.MANUAL_UPLOAD,
            "source_locator": f"manual-upload:{verified.artifact_checksum}",
            "archive_path": verified.archive_relative_path,
            "package_path": verified.package_relative_path,
            "artifact_checksum": verified.artifact_checksum,
            "package_checksum": verified.package_checksum,
            "manifest_digest": verified.manifest_digest,
            "detached_signature": verified.detached_signature,
            "signer_fingerprint": verified.signer_fingerprint,
            "provenance_status": "signed_manual",
            "size_bytes": verified.size_bytes,
            "compatibility": compatibility.model_dump(mode="json", by_alias=True),
            "review_projection": {"manifest": verified.manifest.model_dump(mode="json")},
            "uploaded_by_user_id": actor_user_id,
        }
        async with self.tx() as conn:
            record = await self._get_or_create(data=data, conn=conn)
            await self._audit_review(record=record, actor_user_id=actor_user_id, conn=conn)
        return record

    async def _get_or_create(self, *, data: dict[str, object], conn) -> PluginArtifactRecord:
        existing = await self.repository.get_artifact_by_identity(
            artifact_checksum=str(data["artifact_checksum"]),
            signer_fingerprint=str(data["signer_fingerprint"]),
            conn=conn,
        )
        if existing is not None:
            _validate_same_artifact(existing, data=data)
            return existing
        return await self.repository.create_artifact(data=data, conn=conn)

    async def _audit_review(self, *, record: PluginArtifactRecord, actor_user_id: UUID, conn) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="system.plugin.artifact.reviewed",
                actor_user_id=actor_user_id,
                entity_type="system_plugin_artifact",
                entity_id=record.id,
                source="api",
                trace_id=correlation_id.get(None),
                properties={
                    "plugin_name": record.plugin_name,
                    "version": record.version,
                    "source_type": str(record.source_type),
                    "artifact_checksum": record.artifact_checksum,
                    "manifest_digest": record.manifest_digest,
                    "signer_fingerprint": record.signer_fingerprint,
                },
            ),
            conn=conn,
        )


def _artifact_review_out(record: PluginArtifactRecord) -> SystemPluginArtifactReviewOut:
    projection = dict(record.review_projection)
    manifest = ExtensionManifest.model_validate(projection.get("manifest"))
    return SystemPluginArtifactReviewOut(
        id=record.id,
        created_at=record.created_at,
        updated_at=record.updated_at,
        plugin_name=record.plugin_name,
        version=record.version,
        source_type=SystemPluginSourceType(record.source_type),
        source_locator=record.source_locator,
        artifact_checksum=record.artifact_checksum,
        package_checksum=record.package_checksum,
        manifest_digest=record.manifest_digest,
        signer_fingerprint=record.signer_fingerprint,
        provenance_status=record.provenance_status,
        size_bytes=record.size_bytes,
        compatibility=SystemPluginCompatibilityOut.model_validate(record.compatibility),
        provides=SystemPluginProvidesOut(**manifest.provides.model_dump()),
        permissions=list(manifest.permissions),
        config_schema=dict(manifest.config_schema),
        admin=SystemPluginAdminOut(**manifest.admin.model_dump()) if manifest.admin is not None else None,
    )


def _validate_same_artifact(record: PluginArtifactRecord, *, data: dict[str, object]) -> None:
    immutable_fields = (
        "plugin_name",
        "version",
        "source_locator",
        "package_checksum",
        "manifest_digest",
        "detached_signature",
    )
    if any(getattr(record, field) != data[field] for field in immutable_fields):
        raise BadRequest(
            error="PLUGIN_ARTIFACT_IDENTITY_CONFLICT",
            message="Plugin artifact identity conflicts with an existing verified package",
        )
