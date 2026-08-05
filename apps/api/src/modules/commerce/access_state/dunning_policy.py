from __future__ import annotations

from typing import Protocol, cast

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import ServiceUnavailable
from src.core.i18n import t
from src.models.commerce.billing import BillingProviderMode, CommerceDunningPolicy
from src.modules.commerce.access_state.schema import ResolvedDunningPolicy


class DunningPolicyResolver(Protocol):
    async def resolve(
        self,
        *,
        provider: str,
        provider_mode: str,
        conn: BaseDBAsyncClient,
    ) -> ResolvedDunningPolicy: ...


class TortoiseDunningPolicyResolver:
    """Resolves exactly one active policy for the signed Provider scope."""

    async def resolve(
        self,
        *,
        provider: str,
        provider_mode: str,
        conn: BaseDBAsyncClient,
    ) -> ResolvedDunningPolicy:
        try:
            mode = BillingProviderMode(provider_mode)
        except ValueError as exc:
            raise self._unavailable("COMMERCIAL_DUNNING_POLICY_SCOPE_INVALID") from exc
        policies = await (
            CommerceDunningPolicy
            .filter(
                provider=provider,
                provider_mode=mode,
                is_active=True,
            )
            .using_db(conn)
            .order_by("-revision")
            .limit(2)
        )
        if not policies:
            raise self._unavailable("COMMERCIAL_DUNNING_POLICY_UNAVAILABLE")
        if len(policies) != 1:
            raise self._unavailable("COMMERCIAL_DUNNING_POLICY_INCONSISTENT")
        policy = policies[0]
        self._require_valid_payload(policy.policy)
        return ResolvedDunningPolicy(
            policy_id=policy.id,
            provider=policy.provider,
            provider_mode=str(policy.provider_mode),
            revision=int(policy.revision),
        )

    @classmethod
    def _require_valid_payload(cls, payload: object) -> None:
        if not isinstance(payload, dict):
            raise cls._unavailable("COMMERCIAL_DUNNING_POLICY_INCONSISTENT")
        values = cast(dict[str, object], payload)
        if values.get("recoveryDeadlineSource") != "provider":
            raise cls._unavailable("COMMERCIAL_DUNNING_POLICY_INCONSISTENT")
        grace_effects = values.get("paymentGraceEffects")
        restricted_effects = values.get("paymentRestrictedEffects")
        if not isinstance(grace_effects, dict) or not grace_effects:
            raise cls._unavailable("COMMERCIAL_DUNNING_POLICY_INCONSISTENT")
        if not isinstance(restricted_effects, dict) or not restricted_effects:
            raise cls._unavailable("COMMERCIAL_DUNNING_POLICY_INCONSISTENT")

    @staticmethod
    def _unavailable(error: str) -> ServiceUnavailable:
        return ServiceUnavailable(message=t("errors", "BAD_REQUEST"), error=error)
