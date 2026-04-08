from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.models.workspaces.workspace import Workspace
from apps.api.src.modules.workspaces.content.contracts.schema import ContentModelDefinitionContract
from apps.api.src.modules.workspaces.content.models.canonical_service import WorkspaceContentCanonicalModelsService
from apps.api.src.modules.workspaces.content.models.repository import WorkspaceContentModelsRepository
from apps.api.src.modules.workspaces.content.views.service import (
    CONTENT_LIBRARY_USER_VIEWS_NAMESPACE_PREFIX,
    CONTENT_LIBRARY_WORKSPACE_VIEWS_NAMESPACE,
)
from apps.api.src.modules.workspaces.site.service import WorkspaceSiteService
from apps.api.src.settings.scopes import SCOPE_TYPE_USER, SCOPE_TYPE_WORKSPACE


@dataclass(frozen=True)
class ContentDevBaselineResetResult:
    workspace_id: UUID
    site_id: UUID
    deleted_items: int
    deleted_model_less_items: int
    deleted_models: int
    deleted_workspace_view_settings: int
    deleted_user_view_settings: int
    seeded_model_keys: tuple[str, ...]


def _default_model_contracts() -> tuple[ContentModelDefinitionContract, ...]:
    return (
        ContentModelDefinitionContract(
            key="article",
            name="Article",
            category="content_library",
            default_editor="rich_text",
            default_role="article",
            default_posture="entry",
            default_surface="writing",
            capabilities=["publishable", "rich_text_editable", "seo_managed"],
        ),
        ContentModelDefinitionContract(
            key="landing-page",
            name="Landing Page",
            category="site_builder",
            default_editor="visual",
            default_role="page",
            default_posture="page",
            default_surface="canvas",
            capabilities=["publishable", "routable", "treeable", "visual_editable", "has_slots", "seo_managed"],
        ),
        ContentModelDefinitionContract(
            key="structured-entry",
            name="Structured Entry",
            category="custom",
            default_editor="form",
            default_role="data",
            default_posture="structured",
            default_surface="structured",
            capabilities=["queryable", "has_relations"],
        ),
    )


def parse_workspace_reference(value: str) -> UUID:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("workspace reference is required")
    try:
        return UUID(raw)
    except ValueError:
        pass
    try:
        return decode_public_id(raw)
    except PublicIdDecodeError as exc:
        raise ValueError(f"invalid workspace reference: {raw}") from exc


async def reset_workspace_content_dev_baseline(
    *,
    settings: Settings,
    workspace_id: UUID,
    actor_user_id: UUID | None,
    seed_default_models: bool = True,
) -> ContentDevBaselineResetResult:
    workspace = await Workspace.get_or_none(id=workspace_id)
    if workspace is None:
        raise RuntimeError(f"Workspace not found: {workspace_id}")

    site = await WorkspaceSiteService(settings).get_or_create_site_for_workspace(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
    )
    site_id = site.id

    deleted_model_less_items = int(
        await ContentItemRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            model_definition_id__isnull=True,
        ).count()
    )
    deleted_items = await ContentItemRecord.filter(workspace_id=workspace_id, site_id=site_id).delete()
    deleted_models = await ContentModelDefinitionRecord.filter(workspace_id=workspace_id, site_id=site_id).delete()

    deleted_workspace_view_settings = await SettingRecord.filter(
        scope_type=SCOPE_TYPE_WORKSPACE,
        scope_id=workspace_id,
        namespace=CONTENT_LIBRARY_WORKSPACE_VIEWS_NAMESPACE,
    ).delete()
    deleted_user_view_settings = await SettingRecord.filter(
        scope_type=SCOPE_TYPE_USER,
        namespace=f"{CONTENT_LIBRARY_USER_VIEWS_NAMESPACE_PREFIX}.{workspace_id}",
    ).delete()

    seeded_model_keys: list[str] = []
    if seed_default_models:
        service = WorkspaceContentCanonicalModelsService(
            repo=WorkspaceContentModelsRepository(),
            settings=settings,
        )
        for payload in _default_model_contracts():
            await service.create_model(
                workspace_id=workspace_id,
                site_id=site_id,
                payload=payload,
            )
            seeded_model_keys.append(payload.key)

    return ContentDevBaselineResetResult(
        workspace_id=workspace_id,
        site_id=site_id,
        deleted_items=int(deleted_items),
        deleted_model_less_items=deleted_model_less_items,
        deleted_models=int(deleted_models),
        deleted_workspace_view_settings=int(deleted_workspace_view_settings),
        deleted_user_view_settings=int(deleted_user_view_settings),
        seeded_model_keys=tuple(seeded_model_keys),
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Destructively reset ContentOS data for one workspace and optionally seed "
            "a clean typed baseline for development verification."
        )
    )
    parser.add_argument(
        "--workspace-id",
        required=True,
        help="Workspace UUID or public id.",
    )
    parser.add_argument(
        "--actor-user-id",
        help="Optional actor UUID recorded on any lazily-created site row.",
    )
    parser.add_argument(
        "--no-seed-default-models",
        action="store_true",
        help="Leave the workspace in an empty but valid state instead of reseeding validation models.",
    )
    return parser


async def _run_cli(args: argparse.Namespace) -> None:
    settings = get_settings()
    await init_orm(settings)
    await verify_db_ready(settings)
    try:
        workspace_id = parse_workspace_reference(args.workspace_id)
        actor_user_id = UUID(args.actor_user_id) if args.actor_user_id else None
        result = await reset_workspace_content_dev_baseline(
            settings=settings,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            seed_default_models=not bool(args.no_seed_default_models),
        )
    finally:
        await close_orm()

    print("Content dev baseline reset complete.")
    print(f"workspace_id={result.workspace_id}")
    print(f"site_id={result.site_id}")
    print(f"deleted_items={result.deleted_items}")
    print(f"deleted_model_less_items={result.deleted_model_less_items}")
    print(f"deleted_models={result.deleted_models}")
    print(f"deleted_workspace_view_settings={result.deleted_workspace_view_settings}")
    print(f"deleted_user_view_settings={result.deleted_user_view_settings}")
    print(f"seeded_model_keys={','.join(result.seeded_model_keys) if result.seeded_model_keys else '(none)'}")


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()
    asyncio.run(_run_cli(args))


if __name__ == "__main__":
    main()
