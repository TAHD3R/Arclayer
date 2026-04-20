from __future__ import annotations

from src.modules.projects.releases.service import ProjectReleasesService


def get_project_releases_service() -> ProjectReleasesService:
    return ProjectReleasesService()
