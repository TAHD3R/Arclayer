from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from apps.api.src.core.exceptions import NotFound
from apps.api.src.models.content.published_graph import PublishedGraphRecord
from apps.api.src.modules.workspaces.publish.schema import (
    PublishExportArtifactOut,
    PublishExportBundleFileOut,
    PublishExportBundleOut,
    PublishExportContractOut,
    PublishExportRoutePointerOut,
    PublishExportTarget,
)
from apps.api.src.modules.workspaces.publish.service import WorkspacePublishService

_REPO_ROOT_DEPTH = 6
_TEMPLATE_ROOT = Path("packages/export-targets")


def _resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[_REPO_ROOT_DEPTH]


def _resolve_template_dir(target: PublishExportTarget) -> Path:
    return _resolve_repo_root() / _TEMPLATE_ROOT / target.value / "template"


def _build_tenant_id(workspace_id: UUID, site_id: UUID) -> str:
    return f"{workspace_id}:{site_id}"


def _build_artifact_key(row: PublishedGraphRecord) -> str:
    return f"{row.item_id}:{row.version_id}"


def _build_artifact_payload(row: PublishedGraphRecord) -> dict[str, object]:
    return {
        "itemId": str(row.item_id),
        "versionId": str(row.version_id),
        "locale": row.locale,
        "routePath": row.route_path,
        "hierarchyParentItemId": str(row.hierarchy_parent_item_id) if row.hierarchy_parent_item_id else None,
        "hierarchySortOrder": row.hierarchy_sort_order,
    }


def _build_publish_contract(
    rows: list[PublishedGraphRecord],
    tenant_id: str,
) -> PublishExportContractOut:
    route_pointers: list[PublishExportRoutePointerOut] = []
    artifacts: list[PublishExportArtifactOut] = []
    for row in rows:
        artifact_key = _build_artifact_key(row)
        route_pointers.append(
            PublishExportRoutePointerOut(
                tenant_id=tenant_id,
                locale=row.locale,
                path=row.route_path,
                artifact_key=artifact_key,
            )
        )
        artifacts.append(
            PublishExportArtifactOut(
                tenant_id=tenant_id,
                artifact_key=artifact_key,
                kind="json",
                payload=_build_artifact_payload(row),
            )
        )
    return PublishExportContractOut(route_pointers=route_pointers, artifacts=artifacts)


def _read_template_files(target: PublishExportTarget) -> list[PublishExportBundleFileOut]:
    template_dir = _resolve_template_dir(target)
    if not template_dir.exists():
        raise NotFound(
            "Export target template not found",
            error="PUBLISH_EXPORT_TEMPLATE_MISSING",
            meta={"target": target.value},
        )
    files: list[PublishExportBundleFileOut] = []
    for path in sorted(template_dir.rglob("*")):
        if not path.is_file():
            continue
        relative_path = path.relative_to(template_dir).as_posix()
        content = path.read_text(encoding="utf-8")
        files.append(PublishExportBundleFileOut(path=relative_path, content=content))
    return files


def _build_generated_files(
    target: PublishExportTarget,
    contract: PublishExportContractOut,
) -> list[PublishExportBundleFileOut]:
    contract_content = json.dumps(contract.model_dump(mode="json", by_alias=True), ensure_ascii=False, indent=2)
    metadata_content = json.dumps(
        {
            "target": target.value,
            "generatedAt": datetime.now(UTC).isoformat(),
            "routePointers": len(contract.route_pointers),
            "artifacts": len(contract.artifacts),
            "contractVersion": "v1",
        },
        ensure_ascii=False,
        indent=2,
    )
    return [
        PublishExportBundleFileOut(path="data/publish-contract.json", content=contract_content),
        PublishExportBundleFileOut(path="export-meta.json", content=metadata_content),
    ]


class WorkspacePublishExportService:
    def __init__(self, publish_service: WorkspacePublishService | None = None) -> None:
        self._publish_service = publish_service or WorkspacePublishService()

    async def _load_published_graph_rows(self, workspace_id: UUID, site_id: UUID) -> list[PublishedGraphRecord]:
        rows = (
            await PublishedGraphRecord
            .filter(
                workspace_id=workspace_id,
                site_id=site_id,
            )
            .order_by("route_path", "locale")
            .all()
        )
        if rows:
            return rows
        raise NotFound(
            "Published graph artifacts are required before export",
            error="PUBLISH_EXPORT_ARTIFACTS_MISSING",
            meta={"workspaceId": str(workspace_id), "siteId": str(site_id)},
        )

    async def build_export_bundle(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        target: PublishExportTarget,
    ) -> PublishExportBundleOut:
        await self._publish_service.build_artifacts(workspace_id=workspace_id, site_id=site_id)
        graph_rows = await self._load_published_graph_rows(workspace_id, site_id)
        tenant_id = _build_tenant_id(workspace_id, site_id)
        contract = _build_publish_contract(graph_rows, tenant_id)
        files = _read_template_files(target)
        files.extend(_build_generated_files(target, contract))
        return PublishExportBundleOut(
            target=target,
            publish_contract=contract,
            files=files,
            requires_hosted_runtime=False,
        )
