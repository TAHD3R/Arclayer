from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import ServiceUnavailable
from src.core.i18n import t
from src.modules.commerce.access_state.fact_outbox import TortoiseCommercialAccessFactOutbox
from src.modules.commerce.access_state.repository import (
    CommercialAccessFactOutbox,
    TortoiseCommercialAccessStateRepository,
)
from src.modules.commerce.access_state.schema import (
    CommercialAccessMemberView,
    CommercialAccessProjection,
    CommercialAccessRecoveryView,
    CommercialAccessStateApplyOutcome,
    CommercialAccessStateApplyResult,
    ProviderDunningTransitionRequest,
    ResolvedDunningPolicy,
    VerifiedProviderDunningFact,
)
from src.modules.commerce.access_state.service import CommercialAccessStateService
from src.modules.jobs.service import BackgroundJobService


class VerifiedProviderDunningFactVerifier:
    """Admits only the exact signed fact injected by the webhook application boundary."""

    def __init__(self, *, verified_source: VerifiedProviderDunningFact) -> None:
        self._verified_source = verified_source

    async def verify(self, *, source) -> VerifiedProviderDunningFact:
        if source.model_dump(mode="json", exclude={"signature_reference"}) != self._verified_source.model_dump(
            mode="json", exclude={"signature_reference"}
        ):
            raise TypeError("Provider dunning source does not match the injected VerifiedProviderDunningFact")
        return self._verified_source


class CommercialAccessStateComposition:
    """Application boundary that receives verified Provider facts, never raw lifecycle statuses."""

    def __init__(
        self,
        *,
        persistence,
        settings: Settings | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._persistence = persistence
        self._settings = settings
        self._now = now or (lambda: datetime.now(UTC))

    async def apply_verified_provider_fact(
        self,
        *,
        source: VerifiedProviderDunningFact,
        policy: ResolvedDunningPolicy,
        expected_access_revision: int,
        idempotency_key: str,
    ) -> CommercialAccessStateApplyResult:
        outcome = await self.apply_verified_provider_fact_outcome(
            source=source,
            policy=policy,
            expected_access_revision=expected_access_revision,
            idempotency_key=idempotency_key,
        )
        return outcome.result

    async def apply_verified_provider_fact_outcome(
        self,
        *,
        source: VerifiedProviderDunningFact,
        policy: ResolvedDunningPolicy,
        expected_access_revision: int,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyOutcome:
        if not isinstance(source, VerifiedProviderDunningFact):
            raise TypeError("source must be a VerifiedProviderDunningFact")
        service = CommercialAccessStateService(
            persistence=self._persistence,
            verifier=VerifiedProviderDunningFactVerifier(verified_source=source),
            settings=self._settings,
            now=self._now,
        )
        return await service.apply_provider_fact(
            request=ProviderDunningTransitionRequest(
                source=source,
                policy=policy,
                expected_access_revision=expected_access_revision,
                idempotency_key=idempotency_key,
            ),
            conn=conn,
        )

    async def current_projection(
        self,
        *,
        workspace_id,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> CommercialAccessProjection | None:
        """Expose the current revision required by a verified provider transition."""

        return await self._persistence.get_projection(
            workspace_id=workspace_id,
            conn=conn,
            for_update=for_update,
        )


class CommercialAccessStateReader:
    """Read boundary that keeps member responses sanitized before they reach Product routes."""

    def __init__(self, *, persistence: TortoiseCommercialAccessStateRepository) -> None:
        self._persistence = persistence

    async def member_view(self, *, workspace_id) -> CommercialAccessMemberView:
        view = await self._persistence.get_member_view(workspace_id=workspace_id)
        if view is None:
            raise ServiceUnavailable(
                message=t("errors", "BAD_REQUEST"),
                error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE",
            )
        return view

    async def recovery_view(self, *, workspace_id) -> CommercialAccessRecoveryView:
        view = await self._persistence.get_recovery_view(workspace_id=workspace_id)
        if view is None:
            raise ServiceUnavailable(
                message=t("errors", "BAD_REQUEST"),
                error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE",
            )
        return view


def build_commercial_access_state_composition(
    *,
    settings: Settings | None = None,
    outbox: CommercialAccessFactOutbox | None = None,
) -> CommercialAccessStateComposition:
    return CommercialAccessStateComposition(
        persistence=TortoiseCommercialAccessStateRepository(
            outbox=outbox or TortoiseCommercialAccessFactOutbox(jobs=BackgroundJobService(settings))
        ),
        settings=settings,
    )


def build_commercial_access_state_reader() -> CommercialAccessStateReader:
    return CommercialAccessStateReader(persistence=TortoiseCommercialAccessStateRepository())
