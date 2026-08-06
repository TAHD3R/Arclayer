from __future__ import annotations

from uuid import UUID

from src.core.http.pagination import PageParams
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.payments import CommerceInvoice


class WorkspacePaymentReadRepository(TortoiseORMRepository[CommerceInvoice]):
    def __init__(self) -> None:
        super().__init__(CommerceInvoice)

    async def list_invoices(self, *, workspace_id: UUID, params: PageParams) -> tuple[list[CommerceInvoice], int]:
        query = CommerceInvoice.filter(workspace_id=workspace_id).order_by("-issued_at", "-id")
        total = int(await query.count())
        return await query.offset(params.offset).limit(params.limit), total
