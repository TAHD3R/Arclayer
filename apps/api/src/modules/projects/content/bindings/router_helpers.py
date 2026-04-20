from __future__ import annotations

from src.modules.projects.content.contracts.schema import ContentComponentBindingListOut
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository


def get_project_content_bindings_service() -> ProjectContentCanonicalItemReadService:
    return ProjectContentCanonicalItemReadService(repo=ProjectContentItemsRepository())


__all__ = [
    "ContentComponentBindingListOut",
    "ProjectContentCanonicalItemReadService",
    "get_project_content_bindings_service",
]
