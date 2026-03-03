from __future__ import annotations

from pathlib import Path

import tomllib
from pydantic import ValidationError

from apps.api.src.config import Settings
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger
from apps.api.src.modules.system.models.plugin import PluginRecord
from apps.api.src.modules.system.plugins_manager.localization.service import PluginLocalizationMixin
from apps.api.src.modules.system.plugins_manager.schema import PluginDependencyItem, PluginDetail, PluginSummary
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import PluginManifest, load_plugin_manifest
from apps.api.src.plugin.types import PluginStatus

logger = get_logger(__name__)


def _tp(key: str, default: str) -> str:
    return t("plugin", key, default=default)


class PluginPresentersMixin(PluginLocalizationMixin):
    settings: Settings
    manager: PluginManager | None

    def to_detail(self, record: PluginRecord) -> PluginDetail:
        detail = PluginDetail.model_validate(record)
        manifest = self._load_manifest(record)
        if manifest is None:
            return detail
        update = self._localized_fields(manifest)
        update["management_scope"] = manifest.plugin.management_scope
        update["slug"] = manifest.plugin.slug
        update["dependencies"] = self._build_dependency_report(manifest)
        return detail.model_copy(update=update)

    def to_summary(self, record: PluginRecord) -> PluginSummary:
        summary = PluginSummary.model_validate(record)
        manifest = self._load_manifest(record)
        if manifest is None:
            return summary
        update = self._localized_fields(manifest, include_schema=False)
        update["management_scope"] = manifest.plugin.management_scope
        update["slug"] = manifest.plugin.slug
        return summary.model_copy(update=update)

    def _build_dependency_report(self, manifest: PluginManifest) -> list[PluginDependencyItem] | None:
        deps = getattr(manifest, "dependencies", None) or []
        if not deps:
            return None
        if self.manager is None:
            return None

        from packaging.specifiers import InvalidSpecifier, SpecifierSet
        from packaging.version import InvalidVersion, Version

        items: list[PluginDependencyItem] = []
        for dep in deps:
            installed_version: str | None = None
            status = "ok"
            detail: str | None = None

            dep_record = self.manager.records.get(dep.id)
            dep_desc = self.manager.descriptors.get(dep.id)
            if dep_record is not None:
                installed_version = dep_record.version
                if dep_record.status == PluginStatus.DISABLED:
                    status = "disabled"
                elif dep_record.status == PluginStatus.FAILED:
                    status = "failed"
            elif dep_desc is not None:
                installed_version = dep_desc.manifest.plugin.version
            else:
                if dep.optional:
                    detail = "Optional dependency not installed"
                    status = "ok"
                else:
                    status = "missing"

            if status == "ok" and dep.version and installed_version:
                try:
                    if Version(installed_version) not in SpecifierSet(dep.version):
                        status = "version_mismatch"
                        detail = f"Installed {installed_version} does not satisfy {dep.version}"
                except (InvalidVersion, InvalidSpecifier, TypeError, ValueError) as exc:
                    status = "version_mismatch"
                    detail = (
                        f"Invalid version comparison (installed={installed_version}, spec={dep.version}, error={exc})"
                    )

            items.append(
                PluginDependencyItem(
                    plugin_id=dep.id,
                    version=dep.version,
                    optional=bool(dep.optional),
                    status=status,
                    installed_version=installed_version,
                    detail=detail,
                )
            )
        return items

    def _require_manager(self) -> PluginManager:
        if self.manager is None:
            raise ServiceUnavailable(
                message=_tp("PLUGIN_MANAGER_UNAVAILABLE", "插件管理器不可用"),
                error="PLUGIN_MANAGER_UNAVAILABLE",
            )
        return self.manager

    def _load_manifest(self, record: PluginRecord) -> PluginManifest | None:
        if self.manager is not None:
            descriptor = self.manager.descriptors.get(record.plugin_id)
            if descriptor is not None:
                return descriptor.manifest
        manifest_path = Path(record.storage_path) / "plugin.toml"
        if not manifest_path.is_file():
            return None
        try:
            return load_plugin_manifest(manifest_path)
        except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError, ValidationError, ValueError) as exc:
            logger.warning(
                "Plugin manifest load failed",
                plugin_id=record.plugin_id,
                action="load_plugin_manifest",
                manifest_path=str(manifest_path),
                error=str(exc),
            )
            return None
