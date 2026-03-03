from __future__ import annotations

from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.modules.sites.publishing.deps.repository import DepsValidationRepositoryMixin
from apps.api.src.modules.sites.publishing.entries.repository import PublishingEntriesRepositoryMixin
from apps.api.src.modules.sites.publishing.pages.repository import PublishingPagesRepositoryMixin
from apps.api.src.modules.sites.publishing.revisions.repository import RevisionPointersRepositoryMixin
from apps.api.src.modules.sites.publishing.templates.repository import PublishingTemplatesRepositoryMixin
from apps.api.src.modules.sites.routing.repository import SiteRoutingRepository


class SitePublishingRepository(
    DepsValidationRepositoryMixin,
    RevisionPointersRepositoryMixin,
    PublishingEntriesRepositoryMixin,
    PublishingPagesRepositoryMixin,
    PublishingTemplatesRepositoryMixin,
    BaseRepository,
):
    def __init__(self) -> None:
        super().__init__()
        self._routing_repo = SiteRoutingRepository()
