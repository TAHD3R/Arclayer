from __future__ import annotations

from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, ServiceUnavailable
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessReceipt,
    HostingCommercialAccessState,
)


class HostingCommercialAccessConsumer:
    """Consumes Commerce handoffs without mutating releases or claiming delivery success."""

    async def consume(self, *, source_identity: str) -> HostingCommercialAccessState:
        async with in_transaction() as conn:
            receipt = (
                await HostingCommercialAccessReceipt.filter(source_identity=source_identity).using_db(conn).first()
            )
            if receipt is not None:
                return HostingCommercialAccessState(receipt.resulting_state)
            fact = (
                await CommercialAccessFact
                .filter(
                    kind=CommercialAccessFactKind.HOSTING_HANDOFF,
                    source_identity=source_identity,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if fact is None:
                raise ServiceUnavailable(error="COMMERCIAL_HOSTING_FACT_UNAVAILABLE")
            next_state = self._next_state(fact.payload)
            projection = (
                await HostingCommercialAccessProjection
                .filter(workspace_id=fact.workspace_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if projection is None:
                projection = await HostingCommercialAccessProjection.create(
                    workspace_id=fact.workspace_id,
                    state=next_state,
                    source_identity=source_identity,
                    using_db=conn,
                )
            else:
                projection.state = next_state
                projection.source_identity = source_identity
                await projection.save(using_db=conn, update_fields=["state", "source_identity", "updated_at"])
            await HostingCommercialAccessReceipt.create(
                source_identity=source_identity,
                workspace_id=fact.workspace_id,
                resulting_state=next_state,
                using_db=conn,
            )
            return next_state

    @staticmethod
    def _next_state(payload: dict[str, object]) -> HostingCommercialAccessState:
        state = str(payload.get("state", ""))
        if state == "payment_restricted":
            return HostingCommercialAccessState.CONTINUITY_REQUIRED
        if state == "normal":
            return HostingCommercialAccessState.RESTORATION_REQUIRED
        raise Conflict(error="COMMERCIAL_HOSTING_FACT_INVALID")
