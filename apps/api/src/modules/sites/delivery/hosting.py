from __future__ import annotations

from hashlib import sha256
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.hosting.commercial_access import HostingContinuityTarget, HostingContinuityTargetGate
from src.models.sites.site import SiteRecord
from src.modules.hosting.delivery_contracts import (
    HostingDeliveryPort,
    HostingDeliveryTarget,
    HostingDeliveryTargetResult,
    HostingRestorationTarget,
    HostingVisitorDeliveryGate,
)
from src.modules.sites.repository import SitesRepository
from src.platform.cache.valkey import ValkeyClient, build_valkey

_RESOLVE_CACHE_KEY_PREFIX = "site:resolve:host"
_TARGET_RESOLUTION_FAILED = "HOSTING_DELIVERY_TARGET_RESOLUTION_FAILED"
_CACHE_INVALIDATION_FAILED = "HOSTING_DELIVERY_CACHE_INVALIDATION_FAILED"


class HostingDeliverySitesRepository(Protocol):
    async def list_hosting_delivery_sites(self, *, workspace_id: UUID) -> list[SiteRecord]: ...

    async def get_hosting_delivery_site(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        runtime_id: UUID,
    ) -> SiteRecord | None: ...

    async def get_active_release(self, *, site_id: UUID): ...

    async def list_hosting_delivery_hostnames_for_site(self, *, site_id: UUID) -> tuple[str, ...]: ...


class HostingDeliveryCacheInvalidator(Protocol):
    async def invalidate(self, *, hostnames: tuple[str, ...]) -> None: ...


class ValkeyHostingDeliveryCacheInvalidator:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings

    async def invalidate(self, *, hostnames: tuple[str, ...]) -> None:
        if not hostnames or not self._settings.valkey.enabled:
            return
        raw_client = build_valkey(self._settings.valkey)
        client = ValkeyClient(
            raw_client,
            prefix=self._settings.valkey.prefix,
            default_ttl=self._settings.valkey.default_ttl,
        )
        try:
            await client.delete(*(_resolve_cache_key(hostname) for hostname in hostnames))
        finally:
            await raw_client.aclose()


class SitesHostingDeliveryAdapter(HostingDeliveryPort):
    """Binds each Hosting delivery target to its canonical Sites runtime release."""

    def __init__(
        self,
        *,
        settings: Settings,
        sites: HostingDeliverySitesRepository | None = None,
        cache_invalidator: HostingDeliveryCacheInvalidator | None = None,
    ) -> None:
        self._sites = sites or SitesRepository()
        self._cache_invalidator = cache_invalidator or ValkeyHostingDeliveryCacheInvalidator(settings=settings)

    async def list_current_serving_targets(self, *, workspace_id: UUID) -> tuple[HostingDeliveryTarget, ...]:
        sites = await self._sites.list_hosting_delivery_sites(workspace_id=workspace_id)
        targets: list[HostingDeliveryTarget] = []
        for site in sites:
            if site.runtime_id is None:
                raise Conflict(error="HOSTING_DELIVERY_TARGET_IDENTITY_DRIFT")
            release = await self._sites.get_active_release(site_id=site.id)
            targets.append(
                HostingDeliveryTarget(
                    site_id=site.id,
                    runtime_id=UUID(str(site.runtime_id)),
                    preserved_release_id=release.id if release is not None else None,
                )
            )
        result = tuple(targets)
        _require_unique_target_identities(result)
        return result

    async def apply_visitor_delivery_gate(
        self,
        *,
        workspace_id: UUID,
        gate: HostingVisitorDeliveryGate,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _require_unique_target_identities(targets)
        results: list[HostingDeliveryTargetResult] = []
        for target in targets:
            results.append(
                await self._validate_target_for_gate(
                    workspace_id=workspace_id,
                    gate=gate,
                    target=target,
                )
            )
        return tuple(results)

    async def invalidate_delivery_cache(
        self,
        *,
        workspace_id: UUID,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _require_unique_target_identities(targets)
        results: list[HostingDeliveryTargetResult] = []
        for target in targets:
            results.append(await self._invalidate_target_cache(workspace_id=workspace_id, target=target))
        return tuple(results)

    async def start_restoration(
        self,
        *,
        workspace_id: UUID,
        source_identity: str,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        _require_unique_target_identities(targets)
        results: list[HostingDeliveryTargetResult] = []
        for target in targets:
            results.append(
                await self._start_target_restoration(
                    workspace_id=workspace_id,
                    source_identity=source_identity,
                    target=target,
                )
            )
        return tuple(results)

    async def verify_restoration(
        self,
        *,
        workspace_id: UUID,
        targets: tuple[HostingRestorationTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]:
        target_definitions = tuple(target.target for target in targets)
        _require_unique_target_identities(target_definitions)
        results: list[HostingDeliveryTargetResult] = []
        for target in targets:
            results.append(await self._verify_target_restoration(workspace_id=workspace_id, target=target))
        return tuple(results)

    async def _validate_target_for_gate(
        self,
        *,
        workspace_id: UUID,
        gate: HostingVisitorDeliveryGate,
        target: HostingDeliveryTarget,
    ) -> HostingDeliveryTargetResult:
        _ = gate
        return await self._validate_target_release(workspace_id=workspace_id, target=target)

    async def _invalidate_target_cache(
        self,
        *,
        workspace_id: UUID,
        target: HostingDeliveryTarget,
    ) -> HostingDeliveryTargetResult:
        validation = await self._validate_target_release(workspace_id=workspace_id, target=target)
        if not validation.succeeded:
            return validation
        try:
            hostnames = await self._sites.list_hosting_delivery_hostnames_for_site(site_id=target.site_id)
            await self._cache_invalidator.invalidate(hostnames=hostnames)
        except Exception as exc:
            return _failed_result(target=target, code=_CACHE_INVALIDATION_FAILED, exc=exc)
        return HostingDeliveryTargetResult(target=target, succeeded=True)

    async def _start_target_restoration(
        self,
        *,
        workspace_id: UUID,
        source_identity: str,
        target: HostingDeliveryTarget,
    ) -> HostingDeliveryTargetResult:
        validation = await self._validate_target_release(workspace_id=workspace_id, target=target)
        if not validation.succeeded:
            return validation
        return HostingDeliveryTargetResult(
            target=target,
            succeeded=True,
            operation_identity=_restoration_operation_identity(source_identity=source_identity, target=target),
        )

    async def _verify_target_restoration(
        self,
        *,
        workspace_id: UUID,
        target: HostingRestorationTarget,
    ) -> HostingDeliveryTargetResult:
        if not target.operation_identity.strip():
            raise Conflict(error="HOSTING_RESTORATION_OPERATION_IDENTITY_INVALID")
        validation = await self._validate_target_release(workspace_id=workspace_id, target=target.target)
        if not validation.succeeded:
            return validation
        return HostingDeliveryTargetResult(
            target=target.target,
            succeeded=True,
            operation_identity=target.operation_identity,
            verification_evidence=_verification_evidence(target=target.target),
        )

    async def _validate_target_release(
        self,
        *,
        workspace_id: UUID,
        target: HostingDeliveryTarget,
    ) -> HostingDeliveryTargetResult:
        try:
            site = await self._sites.get_hosting_delivery_site(
                workspace_id=workspace_id,
                site_id=target.site_id,
                runtime_id=target.runtime_id,
            )
            if site is None:
                raise Conflict(error="HOSTING_DELIVERY_TARGET_IDENTITY_DRIFT")
            release = await self._sites.get_active_release(site_id=site.id)
        except Conflict:
            raise
        except Exception as exc:
            return _failed_result(target=target, code=_TARGET_RESOLUTION_FAILED, exc=exc)
        actual_release_id = release.id if release is not None else None
        if actual_release_id != target.preserved_release_id:
            raise Conflict(error="HOSTING_DELIVERY_TARGET_RELEASE_DRIFT")
        return HostingDeliveryTargetResult(target=target, succeeded=True)


async def is_target_delivery_suspended(
    *,
    workspace_id: UUID,
    site_id: UUID,
    runtime_id: UUID,
) -> bool:
    target = (
        await HostingContinuityTarget
        .filter(
            projection__workspace_id=workspace_id,
            site_id=site_id,
            runtime_id=runtime_id,
        )
        .order_by("-updated_at", "-id")
        .first()
    )
    return target is not None and target.gate is HostingContinuityTargetGate.SUSPENDED


def _require_unique_target_identities(targets: tuple[HostingDeliveryTarget, ...]) -> None:
    identities = {(target.site_id, target.runtime_id) for target in targets}
    if len(identities) != len(targets):
        raise Conflict(error="HOSTING_DELIVERY_TARGET_DUPLICATE")


def _failed_result(*, target: HostingDeliveryTarget, code: str, exc: Exception) -> HostingDeliveryTargetResult:
    return HostingDeliveryTargetResult(
        target=target,
        succeeded=False,
        failure_code=code,
        failure_message=str(exc),
    )


def _restoration_operation_identity(*, source_identity: str, target: HostingDeliveryTarget) -> str:
    value = ":".join((source_identity, str(target.site_id), str(target.runtime_id), str(target.preserved_release_id)))
    return f"sites-restoration:{sha256(value.encode()).hexdigest()}"


def _verification_evidence(*, target: HostingDeliveryTarget) -> str:
    release_id = str(target.preserved_release_id) if target.preserved_release_id is not None else "prelaunch"
    return f"sites:production-release:{release_id}"


def _resolve_cache_key(hostname: str) -> str:
    return f"{_RESOLVE_CACHE_KEY_PREFIX}:{hostname}"
