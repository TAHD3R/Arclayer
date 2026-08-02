from __future__ import annotations

import hashlib
import platform
from collections.abc import Mapping
from pathlib import Path

from packaging.specifiers import InvalidSpecifier, SpecifierSet
from packaging.version import InvalidVersion, Version

from src.config import Settings
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.manifest import ExtensionManifest, parse_manifest
from src.models.system.plugin_installation import (
    PluginArtifactRecord,
    PluginInstallationRecord,
    PluginLifecycleState,
    PluginRuntimeActivationState,
    PluginTrustState,
)
from src.modules.system.plugins.remote_catalog import RemotePluginArtifact, RemotePluginCatalogPayload
from src.modules.system.plugins.schema import (
    ExtensionConsumerEvidenceOut,
    ExtensionConsumerEvidenceState,
    ExtensionConsumerOut,
    ExtensionDependencyOut,
    SystemConnectorDefinitionOut,
    SystemPluginAdminOut,
    SystemPluginCatalogItemOut,
    SystemPluginCompatibilityOut,
    SystemPluginProvenanceStatus,
    SystemPluginProvidesOut,
    SystemPluginSourceType,
)

_CHECKSUM_PREFIX = "sha256:"
_IGNORED_PACKAGE_PARTS = frozenset({"__pycache__", ".git"})


class PluginCatalogIntegrityError(RuntimeError):
    """Raised when a bundled plugin cannot be hashed as an immutable package."""


def build_plugin_catalog(
    manager: ExtensionManager,
    settings: Settings,
    *,
    installations: Mapping[str, PluginInstallationRecord] | None = None,
) -> list[SystemPluginCatalogItemOut]:
    return [
        _build_catalog_item(
            extension_dir,
            manager=manager,
            settings=settings,
            installations=installations or {},
        )
        for extension_dir in manager.discover_extension_dirs()
    ]


def build_remote_plugin_catalog(
    catalog: RemotePluginCatalogPayload,
    manager: ExtensionManager,
    settings: Settings,
    *,
    installations: Mapping[str, PluginInstallationRecord] | None = None,
) -> list[SystemPluginCatalogItemOut]:
    latest_by_name = {}
    for artifact in catalog.items:
        current = latest_by_name.get(artifact.manifest.name)
        if current is None or _version_key(artifact.manifest.version) > _version_key(current.manifest.version):
            latest_by_name[artifact.manifest.name] = artifact
    installation_map = installations or {}
    return [
        _build_remote_catalog_item(
            artifact,
            manager=manager,
            settings=settings,
            installation=installation_map.get(artifact.manifest.name),
        )
        for artifact in latest_by_name.values()
    ]


def merge_plugin_catalogs(
    bundled: list[SystemPluginCatalogItemOut],
    remote: list[SystemPluginCatalogItemOut],
) -> list[SystemPluginCatalogItemOut]:
    merged = {item.name: item for item in bundled}
    for item in remote:
        current = merged.get(item.name)
        if current is None or _version_key(item.available_version) > _version_key(current.available_version):
            merged[item.name] = item
    return list(merged.values())


def build_active_artifact_catalog_item(
    installation: PluginInstallationRecord,
    manager: ExtensionManager,
    settings: Settings,
) -> SystemPluginCatalogItemOut | None:
    artifact = installation.active_artifact
    if artifact is None:
        return None
    return build_artifact_catalog_item(
        artifact,
        manager=manager,
        settings=settings,
        installation=installation,
    )


def build_artifact_catalog_item(
    artifact: PluginArtifactRecord,
    *,
    manager: ExtensionManager,
    settings: Settings,
    installation: PluginInstallationRecord | None,
) -> SystemPluginCatalogItemOut:
    projection = dict(artifact.review_projection)
    manifest = ExtensionManifest.model_validate(projection.get("manifest"))
    instance = manager.get_instance(manifest.name)
    return SystemPluginCatalogItemOut(
        name=manifest.name,
        artifact_id=artifact.id,
        installation_id=installation.id if installation is not None else None,
        available_version=artifact.version,
        installed_version=installation.installed_version if installation is not None else None,
        has_update=_has_update(installation.installed_version if installation is not None else None, artifact.version),
        lifecycle_state=installation.lifecycle_state if installation is not None else None,
        desired_enabled=installation.desired_enabled if installation is not None else None,
        runtime_activation_state=installation.runtime_activation_state if installation is not None else None,
        current_operation_id=installation.current_operation_id if installation is not None else None,
        current_job_id=installation.current_job_id if installation is not None else None,
        source_type=SystemPluginSourceType(artifact.source_type),
        source_locator=artifact.source_locator,
        artifact_checksum=artifact.artifact_checksum,
        package_checksum=artifact.package_checksum,
        manifest_digest=artifact.manifest_digest,
        signer_fingerprint=artifact.signer_fingerprint,
        provenance_status=_provenance_status(artifact.trust_state),
        trust_state=artifact.trust_state,
        trust_evidence=_trust_evidence(artifact.trust_evidence),
        compatibility=build_plugin_compatibility(manifest, settings=settings),
        package_state=instance.package.state if instance is not None else None,
        process_state=instance.process.state if instance is not None else None,
        provides=SystemPluginProvidesOut(**manifest.provides.model_dump()),
        permissions=list(manifest.permissions),
        approved_permissions=(list(installation.approved_permissions) if installation is not None else []),
        dependencies=_dependencies(installation) or _manifest_dependencies(manifest),
        consumers=_consumer_evidence(installation),
        config_schema=dict(manifest.config_schema),
        admin=SystemPluginAdminOut(**manifest.admin.model_dump()) if manifest.admin is not None else None,
        connector_definitions=_connector_definitions(manifest, manager=manager),
    )


def _build_remote_catalog_item(
    artifact: RemotePluginArtifact,
    *,
    manager: ExtensionManager,
    settings: Settings,
    installation: PluginInstallationRecord | None,
) -> SystemPluginCatalogItemOut:
    manifest = artifact.manifest
    instance = manager.get_instance(manifest.name)
    installed_version = installation.installed_version if installation is not None else None
    return SystemPluginCatalogItemOut(
        name=manifest.name,
        artifact_id=None,
        installation_id=installation.id if installation is not None else None,
        available_version=manifest.version,
        installed_version=installed_version,
        has_update=_has_update(installed_version, manifest.version),
        lifecycle_state=installation.lifecycle_state if installation is not None else None,
        desired_enabled=installation.desired_enabled if installation is not None else None,
        runtime_activation_state=installation.runtime_activation_state if installation is not None else None,
        current_operation_id=installation.current_operation_id if installation is not None else None,
        current_job_id=installation.current_job_id if installation is not None else None,
        source_type=SystemPluginSourceType.CATALOG,
        source_locator=str(artifact.artifact_url),
        artifact_checksum=artifact.artifact_checksum,
        package_checksum=artifact.package_checksum,
        manifest_digest=artifact.manifest_digest,
        signer_fingerprint=artifact.signer_fingerprint,
        provenance_status=SystemPluginProvenanceStatus.VERIFIED,
        trust_state=PluginTrustState.VERIFIED,
        trust_evidence=["approved_catalog_signature", "artifact_signature", "package_checksum", "manifest_digest"],
        compatibility=build_plugin_compatibility(manifest, settings=settings),
        package_state=instance.package.state if instance is not None else None,
        process_state=instance.process.state if instance is not None else None,
        provides=SystemPluginProvidesOut(**manifest.provides.model_dump()),
        permissions=list(manifest.permissions),
        approved_permissions=(list(installation.approved_permissions) if installation is not None else []),
        dependencies=_dependencies(installation) or _manifest_dependencies(manifest),
        consumers=_consumer_evidence(installation),
        config_schema=dict(manifest.config_schema),
        admin=SystemPluginAdminOut(**manifest.admin.model_dump()) if manifest.admin is not None else None,
        connector_definitions=_connector_definitions(manifest, manager=manager),
    )


def filter_plugin_catalog(
    items: list[SystemPluginCatalogItemOut],
    *,
    search: str | None,
    installed_only: bool,
    updates_only: bool,
    ordering: str,
) -> list[SystemPluginCatalogItemOut]:
    normalized_search = (search or "").strip().casefold()
    filtered = [
        item
        for item in items
        if (not installed_only or item.installed_version is not None)
        and (not updates_only or item.has_update)
        and (not normalized_search or _matches_search(item, normalized_search))
    ]
    reverse = ordering.startswith("-")
    field = ordering.removeprefix("-")
    if field == "version":
        return sorted(filtered, key=lambda item: _version_key(item.available_version), reverse=reverse)
    return sorted(filtered, key=lambda item: item.name.casefold(), reverse=reverse)


def _build_catalog_item(
    extension_dir: Path,
    *,
    manager: ExtensionManager,
    settings: Settings,
    installations: Mapping[str, PluginInstallationRecord],
) -> SystemPluginCatalogItemOut:
    manifest_path = extension_dir / "extension.json"
    manifest = parse_manifest(manifest_path)
    installation = installations.get(manifest.name)
    instance = manager.get_instance(manifest.name)
    compatibility = build_plugin_compatibility(manifest, settings=settings)
    package_checksum = _package_checksum(extension_dir)
    installed_version = (
        installation.installed_version
        if installation is not None
        else instance.manifest.version
        if instance is not None
        else None
    )
    return SystemPluginCatalogItemOut(
        name=manifest.name,
        artifact_id=None,
        installation_id=installation.id if installation is not None else None,
        available_version=manifest.version,
        installed_version=installed_version,
        has_update=_has_update(installed_version, manifest.version),
        lifecycle_state=(
            installation.lifecycle_state
            if installation is not None
            else PluginLifecycleState.INSTALLED
            if instance is not None
            else None
        ),
        desired_enabled=(installation.desired_enabled if installation is not None else instance is not None),
        runtime_activation_state=(
            installation.runtime_activation_state
            if installation is not None
            else PluginRuntimeActivationState.VERIFIED
            if instance is not None
            else None
        ),
        current_operation_id=installation.current_operation_id if installation is not None else None,
        current_job_id=installation.current_job_id if installation is not None else None,
        source_type=SystemPluginSourceType.BUNDLED,
        source_locator=str(extension_dir.relative_to(extension_dir.parents[1])),
        artifact_checksum=package_checksum,
        package_checksum=package_checksum,
        manifest_digest=f"{_CHECKSUM_PREFIX}{hashlib.sha256(manifest_path.read_bytes()).hexdigest()}",
        signer_fingerprint=None,
        provenance_status=SystemPluginProvenanceStatus.VERIFIED,
        trust_state=PluginTrustState.VERIFIED,
        trust_evidence=["bundled_source_policy", "package_checksum", "manifest_digest"],
        compatibility=compatibility,
        package_state=instance.package.state if instance is not None else None,
        process_state=instance.process.state if instance is not None else None,
        provides=SystemPluginProvidesOut(**manifest.provides.model_dump()),
        permissions=list(manifest.permissions),
        approved_permissions=(list(installation.approved_permissions) if installation is not None else []),
        dependencies=_dependencies(installation) or _manifest_dependencies(manifest),
        consumers=_consumer_evidence(installation),
        config_schema=dict(manifest.config_schema),
        admin=SystemPluginAdminOut(**manifest.admin.model_dump()) if manifest.admin is not None else None,
        connector_definitions=_connector_definitions(manifest, manager=manager),
    )


def _connector_definitions(
    manifest: ExtensionManifest,
    *,
    manager: ExtensionManager,
) -> list[SystemConnectorDefinitionOut]:
    definitions: list[SystemConnectorDefinitionOut] = []
    for connector_key in manifest.provides.connectors:
        registration = manager.registry.connectors.resolve(connector_key)
        if registration is None or registration.extension != manifest.name:
            continue
        definitions.append(SystemConnectorDefinitionOut.model_validate(registration.definition.model_dump()))
    return definitions


def _provenance_status(trust_state: PluginTrustState) -> SystemPluginProvenanceStatus:
    return SystemPluginProvenanceStatus(str(trust_state))


def _trust_evidence(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    evidence: list[str] = []
    for item in value:
        if not isinstance(item, str):
            return []
        evidence.append(item)
    return evidence


def _dependencies(installation: PluginInstallationRecord | None) -> list[ExtensionDependencyOut]:
    if installation is None or not isinstance(installation.declared_dependencies, list):
        return []
    dependencies: list[ExtensionDependencyOut] = []
    for raw in installation.declared_dependencies:
        if not isinstance(raw, dict):
            continue
        name = raw.get("extension_name")
        version = raw.get("version_requirement")
        if not isinstance(name, str) or not name:
            continue
        dependencies.append(
            ExtensionDependencyOut(
                extension_name=name,
                version_requirement=version if isinstance(version, str) else None,
            )
        )
    return dependencies


def _manifest_dependencies(manifest: ExtensionManifest) -> list[ExtensionDependencyOut]:
    return [
        ExtensionDependencyOut(
            extension_name=dependency.name,
            version_requirement=dependency.version_requirement,
        )
        for dependency in manifest.dependencies
    ]


def _consumer_evidence(installation: PluginInstallationRecord | None) -> ExtensionConsumerEvidenceOut:
    if installation is None or not isinstance(installation.consumer_evidence, dict):
        return ExtensionConsumerEvidenceOut(state=ExtensionConsumerEvidenceState.UNKNOWN)
    raw_state = installation.consumer_evidence.get("state")
    try:
        state = ExtensionConsumerEvidenceState(raw_state)
    except (TypeError, ValueError):
        state = ExtensionConsumerEvidenceState.UNKNOWN
    consumers: list[ExtensionConsumerOut] = []
    raw_consumers = installation.consumer_evidence.get("consumers")
    if isinstance(raw_consumers, list):
        for raw in raw_consumers:
            if not isinstance(raw, dict):
                continue
            domain = raw.get("domain")
            label = raw.get("label")
            deep_link = raw.get("deep_link")
            if all(isinstance(value, str) and value for value in (domain, label, deep_link)):
                consumers.append(ExtensionConsumerOut(domain=domain, label=label, deep_link=deep_link))
    return ExtensionConsumerEvidenceOut(state=state, consumers=consumers)


def build_plugin_compatibility(
    manifest: ExtensionManifest,
    *,
    settings: Settings,
) -> SystemPluginCompatibilityOut:
    issues: list[str] = []
    _check_requirement(
        manifest.requires.platform,
        current=settings.application.app_version,
        invalid_code="invalid_platform_requirement",
        incompatible_code="platform_version_incompatible",
        issues=issues,
    )
    _check_requirement(
        manifest.requires.python,
        current=platform.python_version(),
        invalid_code="invalid_python_requirement",
        incompatible_code="python_version_incompatible",
        issues=issues,
    )
    return SystemPluginCompatibilityOut(
        compatible=not issues,
        platform_requirement=manifest.requires.platform,
        python_requirement=manifest.requires.python,
        issues=issues,
    )


def _check_requirement(
    requirement: str | None,
    *,
    current: str,
    invalid_code: str,
    incompatible_code: str,
    issues: list[str],
) -> None:
    if requirement is None:
        return
    try:
        matches = SpecifierSet(requirement).contains(Version(current), prereleases=True)
    except (InvalidSpecifier, InvalidVersion):
        issues.append(invalid_code)
        return
    if not matches:
        issues.append(incompatible_code)


def _package_checksum(extension_dir: Path) -> str:
    digest = hashlib.sha256()
    root = extension_dir.resolve()
    for path in sorted(extension_dir.rglob("*")):
        if path.is_symlink():
            raise PluginCatalogIntegrityError(f"Bundled plugin contains a symbolic link: {path}")
        if any(part in _IGNORED_PACKAGE_PARTS for part in path.parts) or path.suffix == ".pyc":
            continue
        if not path.is_file():
            continue
        resolved = path.resolve()
        if not resolved.is_relative_to(root):
            raise PluginCatalogIntegrityError(f"Bundled plugin file resolves outside its package: {path}")
        relative_path = path.relative_to(extension_dir).as_posix().encode()
        digest.update(relative_path)
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"{_CHECKSUM_PREFIX}{digest.hexdigest()}"


def _matches_search(item: SystemPluginCatalogItemOut, search: str) -> bool:
    values = [
        item.name,
        item.admin.label_key if item.admin is not None else "",
        item.admin.description_key if item.admin is not None else "",
        *item.provides.services,
        *item.provides.providers,
        *item.provides.connectors,
        *item.provides.middlewares,
        *item.provides.content_types,
    ]
    return any(search in value.casefold() for value in values)


def _has_update(installed_version: str | None, available_version: str) -> bool:
    if installed_version is None:
        return False
    return _version_key(available_version) > _version_key(installed_version)


def _version_key(value: str) -> Version:
    return Version(value)
