from __future__ import annotations

from uuid import UUID

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.email_template import EmailTemplateRecord


class EmailTemplateRepository(TortoiseORMRepository[EmailTemplateRecord]):
    def __init__(self) -> None:
        super().__init__(EmailTemplateRecord)

    async def list_records(self) -> list[EmailTemplateRecord]:
        return await EmailTemplateRecord.all().order_by("key", "locale")

    async def get(self, template_id: UUID) -> EmailTemplateRecord | None:
        return await EmailTemplateRecord.filter(id=template_id).first()

    async def get_by_identity(self, *, key: str, locale: str) -> EmailTemplateRecord | None:
        return await EmailTemplateRecord.filter(key=key, locale=locale).first()
