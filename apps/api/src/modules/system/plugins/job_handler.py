from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from uuid import UUID

from src.config import Settings
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.manifest import ExtensionManifest, ManifestParseError, parse_manifest
from src.models.system.plugin_installation import (
    PluginArtifactRecord,
    PluginOperationRecord,
    PluginOperationState,
    PluginSourceType,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.jobs.execution_registry import (
    JobExecutionContext,
    JobHandledFailure,
    JobHandledInterruption,
    JobHandlerTerminalError,
)
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.system.plugins.catalog import build_plugin_catalog
from src.modules.system.plugins.job_contract import (
    PLUGIN_CATALOG_UNAVAILABLE_CODE,
    PLUGIN_OPERATION_NOT_FOUND_CODE,
    PLUGIN_OPERATION_STATE_INVALID_CODE,
    PLUGIN_PACKAGE_CHANGED_CODE,
    PLUGIN_PACKAGE_INCOMPATIBLE_CODE,
    PLUGIN_PACKAGE_INVALID_CODE,
    PluginLifecycleJobInput,
    PluginLifecycleJobResult,
    PluginLifecycleJobTarget,
)
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository
from src.modules.system.plugins.package_store import (
    PluginPackageStore,
    PluginPackageValidationError,
    calculate_directory_checksum,
)
from src.modules.system.plugins.remote_catalog import (
    PluginCatalogError,
    RemotePluginArtifact,
    RemotePluginCatalogClient,
)


class PluginLifecycleJobHandler:
    def __init__(
        self,
        *,
        settings: Settings,
        project_root: Path,
        repository: PluginLifecycleRepository | None = None,
        package_store: PluginPackageStore | None = None,
        catalog_client: RemotePluginCatalogClient | None = None,
    ) -> None:
        self.settings = settings
        self.project_root = project_root
        self.repository = repository or PluginLifecycleRepository()
        self.package_store = package_store or PluginPackageStore(settings.plugin_distribution)
        self.catalog_client = catalog_client or RemotePluginCatalogClient(
            settings.plugin_distribution,
            allow_insecure_http=settings.app_env != "production",
        )

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[PluginLifecycleJobTarget, PluginLifecycleJobInput],
    ) -> PluginLifecycleJobResult | JobHandledFailure | JobHandledInterruption | None:
        operation = await self.repository.get_operation(context.target.operation_id)
        if operation is None:
            return JobHandledFailure(
                code=PLUGIN_OPERATION_NOT_FOUND_CODE,
                safe_message="Plugin lifecycle operation was not found",
            )
        if operation.state == PluginOperationState.SUCCEEDED:
            return _result(operation)
        if operation.state == PluginOperationState.FAILED:
            return JobHandledFailure(
                code=operation.failure_code or PLUGIN_OPERATION_STATE_INVALID_CODE,
                safe_message=operation.failure_summary or "Plugin lifecycle operation failed",
            )
        if operation.state == PluginOperationState.WAITING_FOR_RESTART:
            if operation.activation_verified:
                finalized = await context.run_fenced_domain_commit(
                    lambda: self.repository.finalize_verified(operation.id)
                )
                return _result(finalized)
            return _restart_interruption(operation.id)
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[PluginLifecycleJobTarget, PluginLifecycleJobInput],
    ) -> PluginLifecycleJobResult | JobHandledFailure | JobHandledInterruption:
        await context.report_progress(_progress("verifying_package", 1, 5))
        await context.run_fenced_domain_commit(
            lambda: self.repository.mark_operation_progress(
                context.input_reference.operation_id,
                phase="verifying_package",
                completed=1,
                total=5,
            )
        )
        await self._verify_package(context.input_reference)
        await context.report_progress(_progress("staging", 2, 5))
        await context.run_fenced_domain_commit(
            lambda: self.repository.mark_operation_progress(
                context.input_reference.operation_id,
                phase="staging",
                completed=2,
                total=5,
            )
        )
        operation = await context.run_fenced_domain_commit(
            lambda: self.repository.stage_for_restart(context.input_reference)
        )
        return _restart_interruption(operation.id)

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[PluginLifecycleJobTarget, PluginLifecycleJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        await self.repository.project_failure(
            context.target.operation_id,
            code=error.code,
            summary=error.safe_message,
        )

    async def _verify_package(self, job_input: PluginLifecycleJobInput) -> None:
        if job_input.source_type != PluginSourceType.BUNDLED:
            await self._verify_managed_package(job_input)
            return
        manager = ExtensionManager(self.project_root)
        item = next(
            (item for item in build_plugin_catalog(manager, self.settings) if item.name == job_input.plugin_name),
            None,
        )
        if item is None:
            raise PermanentJobExecutionError(
                code=PLUGIN_OPERATION_NOT_FOUND_CODE,
                safe_message="Plugin package is no longer present in the verified catalog",
            )
        if (
            item.artifact_checksum != job_input.artifact_checksum
            or item.package_checksum != job_input.package_checksum
            or item.manifest_digest != job_input.manifest_digest
        ):
            raise PermanentJobExecutionError(
                code=PLUGIN_PACKAGE_CHANGED_CODE,
                safe_message="Plugin package changed after the lifecycle operation was reviewed",
            )
        if not item.compatibility.compatible:
            raise PermanentJobExecutionError(
                code=PLUGIN_PACKAGE_INCOMPATIBLE_CODE,
                safe_message="Plugin package is not compatible with this Arclayer runtime",
            )

    async def _verify_managed_package(self, job_input: PluginLifecycleJobInput) -> None:
        if job_input.artifact_id is None:
            raise _invalid_package("Managed plugin lifecycle input has no artifact binding")
        artifact = await self.repository.get_artifact(job_input.artifact_id)
        if artifact is None or not _artifact_matches_input(artifact, job_input=job_input):
            raise _invalid_package("Plugin artifact identity changed after operator review")
        if artifact.package_path is None:
            if artifact.source_type != PluginSourceType.CATALOG:
                raise _invalid_package("Reviewed plugin artifact has no materialized package")
            artifact = await self._download_catalog_artifact(artifact)
        try:
            package_path = self.package_store.resolve_package_path(artifact.package_path)
            manifest = parse_manifest(package_path / "extension.json")
            package_checksum = await asyncio.to_thread(calculate_directory_checksum, package_path)
            manifest_digest = f"sha256:{hashlib.sha256((package_path / 'extension.json').read_bytes()).hexdigest()}"
        except (ManifestParseError, PluginPackageValidationError, OSError) as exc:
            raise _invalid_package("Materialized plugin package cannot be verified") from exc
        if manifest.name != job_input.plugin_name or (
            job_input.target_version is not None and manifest.version != job_input.target_version
        ):
            raise _invalid_package("Materialized plugin manifest does not match the requested identity")
        if package_checksum != job_input.package_checksum or manifest_digest != job_input.manifest_digest:
            raise _invalid_package("Materialized plugin package failed integrity verification")

    async def _download_catalog_artifact(self, artifact: PluginArtifactRecord) -> PluginArtifactRecord:
        projection = dict(artifact.review_projection)
        manifest = ExtensionManifest.model_validate(projection.get("manifest"))
        item = RemotePluginArtifact(
            artifact_url=artifact.source_locator,
            artifact_checksum=artifact.artifact_checksum,
            package_checksum=artifact.package_checksum,
            manifest_digest=artifact.manifest_digest,
            detached_signature=artifact.detached_signature,
            signer_fingerprint=artifact.signer_fingerprint,
            size_bytes=artifact.size_bytes,
            manifest=manifest,
        )
        try:
            archive = await self.catalog_client.download_artifact(item)
            verified = await asyncio.to_thread(
                self.package_store.verify_and_stage,
                archive=archive,
                detached_signature=artifact.detached_signature,
                expected_artifact_checksum=artifact.artifact_checksum,
                expected_package_checksum=artifact.package_checksum,
                expected_manifest_digest=artifact.manifest_digest,
            )
        except PluginCatalogError as exc:
            if exc.code == "PLUGIN_CATALOG_REQUEST_FAILED":
                raise TransientJobExecutionError(
                    code=PLUGIN_CATALOG_UNAVAILABLE_CODE,
                    safe_message=exc.safe_message,
                ) from exc
            raise _invalid_package(exc.safe_message) from exc
        except PluginPackageValidationError as exc:
            raise _invalid_package(exc.safe_message) from exc
        if verified.signer_fingerprint != artifact.signer_fingerprint:
            raise _invalid_package("Downloaded plugin signer does not match the reviewed artifact identity")
        return await self.repository.mark_artifact_materialized(
            artifact,
            archive_path=verified.archive_relative_path,
            package_path=verified.package_relative_path,
        )


def _restart_interruption(operation_id: UUID) -> JobHandledInterruption:
    return JobHandledInterruption(
        reason="runtime_restart_required",
        phase="waiting_for_restart",
        status_key="PLUGIN_OPERATION_STATUS_WAITING_FOR_RESTART",
        continuation_reference={"operation_id": str(operation_id)},
    )


def _progress(phase: str, completed: int, total: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"PLUGIN_OPERATION_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=total,
    )


def _result(operation: PluginOperationRecord) -> PluginLifecycleJobResult:
    installation = operation.installation
    return PluginLifecycleJobResult(
        operation_id=operation.id,
        plugin_name=operation.plugin_name,
        operation_kind=operation.kind,
        installed_version=installation.installed_version,
        desired_enabled=installation.desired_enabled,
        activation_verified=operation.activation_verified,
    )


def _artifact_matches_input(artifact: PluginArtifactRecord, *, job_input: PluginLifecycleJobInput) -> bool:
    return (
        artifact.plugin_name == job_input.plugin_name
        and (job_input.target_version is None or artifact.version == job_input.target_version)
        and artifact.source_type == job_input.source_type
        and artifact.source_locator == job_input.source_locator
        and artifact.artifact_checksum == job_input.artifact_checksum
        and artifact.package_checksum == job_input.package_checksum
        and artifact.manifest_digest == job_input.manifest_digest
        and artifact.signer_fingerprint == job_input.signer_fingerprint
    )


def _invalid_package(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(code=PLUGIN_PACKAGE_INVALID_CODE, safe_message=message)
