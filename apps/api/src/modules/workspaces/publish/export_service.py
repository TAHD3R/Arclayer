from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from apps.api.src.core.exceptions import NotFound
from apps.api.src.modules.workspaces.publish.preview_service import WorkspacePublishPreviewService
from apps.api.src.modules.workspaces.publish.schema import (
    PublishExportBundleFileOut,
    PublishExportBundleOut,
    PublishExportContractOut,
    PublishExportTarget,
)

_REPO_ROOT_DEPTH = 6
_TEMPLATE_ROOT = Path("packages/export-targets")


def _resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[_REPO_ROOT_DEPTH]


def _resolve_template_dir(target: PublishExportTarget) -> Path:
    return _resolve_repo_root() / _TEMPLATE_ROOT / target.value / "template"


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
    def __init__(self, preview_service: WorkspacePublishPreviewService | None = None) -> None:
        self._preview_service = preview_service or WorkspacePublishPreviewService()

    async def build_export_bundle(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        target: PublishExportTarget,
    ) -> PublishExportBundleOut:
        contract = await self._preview_service.build_preview_contract(workspace_id=workspace_id, site_id=site_id)
        files = _read_template_files(target)
        files.extend(_build_generated_files(target, contract))
        return PublishExportBundleOut(
            target=target,
            publish_contract=contract,
            files=files,
            requires_hosted_runtime=False,
        )
