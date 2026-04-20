from __future__ import annotations

from src.modules.projects.publish.preview_service import ProjectPublishPreviewService
from src.modules.projects.publish.service import ProjectPublishService


def get_project_publish_service() -> ProjectPublishService:
    return ProjectPublishService()


def get_project_publish_preview_service() -> ProjectPublishPreviewService:
    return ProjectPublishPreviewService()
