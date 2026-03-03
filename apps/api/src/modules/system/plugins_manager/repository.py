from __future__ import annotations

from typing import cast

from tortoise.queryset import QuerySet

from apps.api.src.common.protocols.tortoise import PluginRecordMutableFields
from apps.api.src.common.repositories import BaseRepository
from apps.api.src.modules.system.models.plugin import PluginRecord
from apps.api.src.plugin.types import PluginStatus


class PluginRepository(BaseRepository):
    async def list_plugins(self) -> list[PluginRecord]:
        return await PluginRecord.all().order_by("plugin_id")

    def query_plugins(self) -> QuerySet[PluginRecord]:
        return PluginRecord.all().order_by("plugin_id")

    async def get_plugin(self, plugin_id: str) -> PluginRecord | None:
        return await PluginRecord.get_or_none(plugin_id=plugin_id)

    async def create_plugin(
        self,
        *,
        plugin_id: str,
        name: str,
        description: str | None,
        author: str,
        version: str,
        requires: str,
        entrypoint: str,
        website: str | None,
        repository: str | None,
        issues: str | None,
        license_name: str | None,
        status: PluginStatus,
        storage_path: str,
        permissions: list[dict] | None,
        config_schema: dict | None,
        config: dict | None,
        package_filename: str | None,
        package_checksum: str | None,
        package_size: int | None,
    ) -> PluginRecord:
        return await PluginRecord.create(
            plugin_id=plugin_id,
            name=name,
            description=description,
            author=author,
            version=version,
            requires=requires,
            entrypoint=entrypoint,
            website=website,
            repository=repository,
            issues=issues,
            license=license_name,
            status=status,
            storage_path=storage_path,
            permissions=permissions,
            config_schema=config_schema,
            config=config,
            package_filename=package_filename,
            package_checksum=package_checksum,
            package_size=package_size,
        )

    async def update_plugin(
        self,
        record: PluginRecord,
        *,
        name: str,
        description: str | None,
        author: str,
        version: str,
        requires: str,
        entrypoint: str,
        website: str | None,
        repository: str | None,
        issues: str | None,
        license_name: str | None,
        status: PluginStatus,
        storage_path: str,
        permissions: list[dict] | None,
        config_schema: dict | None,
        config: dict | None,
        package_filename: str | None,
        package_checksum: str | None,
        package_size: int | None,
    ) -> PluginRecord:
        record_like = cast(PluginRecordMutableFields, record)
        record.name = name
        record_like.description = description
        record.author = author
        record.version = version
        record.requires = requires
        record.entrypoint = entrypoint
        record_like.website = website
        record_like.repository = repository
        record_like.issues = issues
        record_like.license = license_name
        record.status = status
        record.storage_path = storage_path
        record.permissions = permissions
        record.config_schema = config_schema
        record.config = config
        record_like.package_filename = package_filename
        record_like.package_checksum = package_checksum
        record_like.package_size = package_size
        await record.save()
        return record

    async def update_status(self, record: PluginRecord, status: PluginStatus) -> PluginRecord:
        record.status = status
        await record.save(update_fields=["status"])
        return record

    async def update_config(self, record: PluginRecord, config: dict) -> PluginRecord:
        record.config = config
        await record.save(update_fields=["config"])
        return record
