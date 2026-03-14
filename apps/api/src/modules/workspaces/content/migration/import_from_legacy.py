from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.models.content._enums import (
    ContentPresentationKind,
)
from apps.api.src.models.content.content import ContentEntryRecord, ContentRevisionRecord, ContentTypeRecord
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.hierarchy_node import HierarchyNodeRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.content.model_field import ContentModelFieldRecord
from apps.api.src.models.content.presentation_document import PresentationDocumentRecord
from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.route_binding import RouteBindingRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord
from apps.api.src.modules.workspaces.content.migration.normalization import (
    append_issue,
    capabilities_for_kind,
    extract_legacy_field_rows,
    normalize_field_type,
    normalize_kind,
    normalize_status,
    normalize_visibility,
    resolve_version_state,
    snapshot_field_values,
    snapshot_page_blueprint,
)
from apps.api.src.modules.workspaces.content.migration.reporting import LegacyImportReport


class WorkspaceLegacyContentImportService:
    async def import_workspace_legacy_content(self, *, workspace_id: UUID, site_id: UUID) -> LegacyImportReport:
        report = LegacyImportReport()
        async with in_transaction() as conn:
            type_to_model = await self._import_models(
                workspace_id=workspace_id, site_id=site_id, report=report, conn=conn
            )
            item_map = await self._import_items(
                workspace_id=workspace_id,
                site_id=site_id,
                type_to_model=type_to_model,
                report=report,
                conn=conn,
            )
            await self._import_routes(
                workspace_id=workspace_id, site_id=site_id, item_map=item_map, report=report, conn=conn
            )
            await self._import_hierarchy(
                workspace_id=workspace_id, site_id=site_id, item_map=item_map, report=report, conn=conn
            )
        return report

    async def _import_models(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        report: LegacyImportReport,
        conn,
    ) -> dict[UUID, UUID]:
        rows = await ContentTypeRecord.filter(workspace_id=workspace_id, site_id=site_id).using_db(conn).all()
        output: dict[UUID, UUID] = {}
        for row in rows:
            kind = normalize_kind(row.kind, report, row.code)
            model = await ContentModelDefinitionRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                key=row.code,
                name=row.name,
                kind=kind,
                capabilities=capabilities_for_kind(kind),
                routing_policy=row.render_contract,
                workflow_policy=row.workflow_policy,
                using_db=conn,
            )
            output[row.id] = model.id
            report.models_imported += 1
            await self._import_fields(row=row, model_definition_id=model.id, report=report, conn=conn)
        return output

    async def _import_fields(
        self, *, row: ContentTypeRecord, model_definition_id: UUID, report: LegacyImportReport, conn
    ) -> None:
        fields = extract_legacy_field_rows(row.field_schema, report, row.code)
        for index, field in enumerate(fields):
            key = str(field.get("key") or "").strip()
            label = str(field.get("label") or key or f"field_{index}").strip()
            if not key:
                append_issue(report, "LEGACY_FIELD_KEY_MISSING", "Legacy field is missing key.", legacy_ref=row.code)
                continue
            field_type = normalize_field_type(field.get("scalar"), report, row.code, key)
            await ContentModelFieldRecord.create(
                model_definition_id=model_definition_id,
                key=key,
                label=label,
                field_type=field_type,
                is_required=bool(field.get("required", False)),
                config=field,
                sort_order=index,
                using_db=conn,
            )
            report.fields_imported += 1

    async def _import_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        type_to_model: dict[UUID, UUID],
        report: LegacyImportReport,
        conn,
    ) -> dict[UUID, UUID]:
        entries = await ContentEntryRecord.filter(workspace_id=workspace_id, site_id=site_id).using_db(conn).all()
        revisions = (
            await ContentRevisionRecord
            .filter(entry_id__in=[item.id for item in entries])
            .using_db(conn)
            .order_by("entry_id", "revision")
            .all()
        )
        grouped_revisions: dict[UUID, list[ContentRevisionRecord]] = defaultdict(list)
        for revision in revisions:
            grouped_revisions[revision.entry_id].append(revision)

        item_map: dict[UUID, UUID] = {}
        for entry in entries:
            model_definition_id = type_to_model.get(entry.type_id)
            if model_definition_id is None:
                append_issue(
                    report, "LEGACY_TYPE_NOT_IMPORTED", "Legacy entry type mapping is missing.", legacy_ref=entry.slug
                )
                continue
            item = await ContentItemRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                model_definition_id=model_definition_id,
                slug=entry.slug,
                title=entry.title,
                status=normalize_status(entry.status, report, entry.slug),
                visibility=normalize_visibility(entry.visibility, report, entry.slug),
                locale=entry.locale,
                draft_version=entry.draft_revision,
                published_version=entry.published_revision,
                created_by_user_id=entry.created_by_user_id,
                updated_by_user_id=entry.updated_by_user_id,
                using_db=conn,
            )
            item_map[entry.id] = item.id
            report.items_imported += 1
            await self._import_versions(
                entry=entry, item_id=item.id, revisions=grouped_revisions[entry.id], report=report, conn=conn
            )
        return item_map

    async def _import_versions(
        self,
        *,
        entry: ContentEntryRecord,
        item_id: UUID,
        revisions: list[ContentRevisionRecord],
        report: LegacyImportReport,
        conn,
    ) -> None:
        for revision in revisions:
            snapshot = revision.snapshot if isinstance(revision.snapshot, dict) else {}
            version = await ContentVersionRecord.create(
                item_id=item_id,
                version=revision.revision,
                state=resolve_version_state(entry, revision.revision),
                fields_snapshot=snapshot_field_values(snapshot),
                change_summary=f"Imported from legacy revision {revision.revision}",
                created_by_user_id=revision.created_by_user_id,
                last_transition_by_user_id=revision.created_by_user_id,
                using_db=conn,
            )
            report.versions_imported += 1
            await self._import_presentations(version_id=version.id, snapshot=snapshot, report=report, conn=conn)

    async def _import_presentations(
        self, *, version_id: UUID, snapshot: object, report: LegacyImportReport, conn
    ) -> None:
        field_values = snapshot_field_values(snapshot)
        if field_values is not None:
            await PresentationDocumentRecord.create(
                version_id=version_id,
                kind=ContentPresentationKind.FORM_DATA,
                payload=field_values,
                using_db=conn,
            )
            report.presentations_imported += 1
        page_blueprint = snapshot_page_blueprint(snapshot)
        if page_blueprint is None:
            return
        await PresentationDocumentRecord.create(
            version_id=version_id,
            kind=ContentPresentationKind.VISUAL_BLUEPRINT,
            payload=page_blueprint,
            using_db=conn,
        )
        report.presentations_imported += 1

    async def _import_routes(
        self, *, workspace_id: UUID, site_id: UUID, item_map: dict[UUID, UUID], report: LegacyImportReport, conn
    ) -> None:
        rows = (
            await ContentRouteRecord
            .filter(workspace_id=workspace_id, site_id=site_id, is_active=True)
            .using_db(conn)
            .all()
        )
        for row in rows:
            item_id = item_map.get(row.entry_id)
            if item_id is None:
                append_issue(
                    report, "LEGACY_ROUTE_ENTRY_MISSING", "Legacy route entry mapping is missing.", legacy_ref=row.path
                )
                continue
            await RouteBindingRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                locale=row.locale,
                path=row.path,
                is_active=row.is_active,
                using_db=conn,
            )
            report.route_bindings_imported += 1

    async def _import_hierarchy(
        self, *, workspace_id: UUID, site_id: UUID, item_map: dict[UUID, UUID], report: LegacyImportReport, conn
    ) -> None:
        rows = await ContentTreeNodeRecord.filter(workspace_id=workspace_id, site_id=site_id).using_db(conn).all()
        for row in rows:
            item_id = item_map.get(row.entry_id)
            if item_id is None:
                append_issue(
                    report,
                    "LEGACY_TREE_ENTRY_MISSING",
                    "Legacy tree entry mapping is missing.",
                    legacy_ref=str(row.entry_id),
                )
                continue
            parent_item_id = item_map.get(row.parent_entry_id) if row.parent_entry_id else None
            if row.parent_entry_id and parent_item_id is None:
                append_issue(
                    report,
                    "LEGACY_TREE_PARENT_MISSING",
                    "Legacy tree parent mapping is missing.",
                    legacy_ref=str(row.parent_entry_id),
                )
            await HierarchyNodeRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                parent_item_id=parent_item_id,
                sort_order=row.sort_order,
                using_db=conn,
            )
            report.hierarchy_nodes_imported += 1
