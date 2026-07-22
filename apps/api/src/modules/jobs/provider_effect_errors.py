from __future__ import annotations

from uuid import UUID


class ProviderEffectRegistrationError(RuntimeError):
    """A caller-actionable conflict prevented a new Provider Effect registration."""

    __slots__ = ("_profile_id",)

    def __init__(self, message: str, *, profile_id: UUID) -> None:
        super().__init__(message)
        self._profile_id = profile_id

    @property
    def profile_id(self) -> UUID:
        return self._profile_id


class ProviderEffectRegistrationProfileUnavailableError(ProviderEffectRegistrationError):
    """The exact Profile identity cannot authorize a new Provider Effect."""

    __slots__ = ()

    def __init__(self, *, profile_id: UUID) -> None:
        super().__init__(
            f"Storage profile {profile_id} is unavailable for new provider effects",
            profile_id=profile_id,
        )


class ProviderEffectRegistrationRouteStaleError(ProviderEffectRegistrationError):
    """The pre-resolved route changed before a new Provider Effect was registered."""

    __slots__ = ("_expected_route_hash", "_observed_route_hash")

    def __init__(
        self,
        *,
        profile_id: UUID,
        expected_route_hash: str,
        observed_route_hash: str,
    ) -> None:
        super().__init__(
            f"Storage profile {profile_id} route changed before provider effect registration",
            profile_id=profile_id,
        )
        self._expected_route_hash = expected_route_hash
        self._observed_route_hash = observed_route_hash

    @property
    def expected_route_hash(self) -> str:
        return self._expected_route_hash

    @property
    def observed_route_hash(self) -> str:
        return self._observed_route_hash
