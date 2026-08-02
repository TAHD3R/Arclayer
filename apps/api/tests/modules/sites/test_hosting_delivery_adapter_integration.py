from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.hosting.commercial_access import (
    HostingCommercialAccessProjection,
    HostingCommercialAccessState,
    HostingContinuityTarget,
    HostingContinuityTargetGate,
)
from src.models.organization.organization import Organization
from src.models.workspaces.workspace import Workspace
from src.modules.hosting.delivery_contracts import (
    HostingRestorationTarget,
    HostingVisitorDeliveryGate,
)
from src.modules.sites.delivery.hosting import SitesHostingDeliveryAdapter, is_target_delivery_suspended


class _Sites:
    def __init__(
        self,
        *,
        targets: tuple[tuple[UUID, UUID, UUID | None], ...],
        hostnames: dict[UUID, tuple[str, ...]],
    ) -> None:
        self._sites = [SimpleNamespace(id=site_id, runtime_id=runtime_id) for site_id, runtime_id, _ in targets]
        self._releases = {site_id: release_id for site_id, _, release_id in targets}
        self._hostnames = hostnames

    async def list_hosting_delivery_sites(self, *, workspace_id: UUID):  # type: ignore[no-untyped-def]
        _ = workspace_id
        return self._sites

    async def get_hosting_delivery_site(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        runtime_id: UUID,
    ):  # type: ignore[no-untyped-def]
        _ = workspace_id
        return next(
            (site for site in self._sites if site.id == site_id and site.runtime_id == runtime_id),
            None,
        )

    async def get_active_release(self, *, site_id: UUID):  # type: ignore[no-untyped-def]
        release_id = self._releases[site_id]
        return SimpleNamespace(id=release_id) if release_id is not None else None

    async def list_hosting_delivery_hostnames_for_site(self, *, site_id: UUID) -> tuple[str, ...]:
        return self._hostnames[site_id]


class _Cache:
    def __init__(self, *, failing_hostnames: tuple[str, ...] | None = None) -> None:
        self.failing_hostnames = failing_hostnames
        self.invalidated: list[tuple[str, ...]] = []

    async def invalidate(self, *, hostnames: tuple[str, ...]) -> None:
        self.invalidated.append(hostnames)
        if hostnames == self.failing_hostnames:
            raise RuntimeError("cache target unavailable")


def _adapter(*, sites: _Sites, cache: _Cache) -> SitesHostingDeliveryAdapter:
    return SitesHostingDeliveryAdapter(
        settings=Settings(database={"enabled": False}, valkey={"enabled": False}),
        sites=sites,
        cache_invalidator=cache,
    )


def _sites() -> _Sites:
    return _Sites(
        targets=(
            (UUID("11111111-1111-4111-8111-111111111111"), UUID("22222222-2222-4222-8222-222222222222"), uuid4()),
            (UUID("33333333-3333-4333-8333-333333333333"), UUID("44444444-4444-4444-8444-444444444444"), None),
        ),
        hostnames={
            UUID("11111111-1111-4111-8111-111111111111"): ("one.example.test",),
            UUID("33333333-3333-4333-8333-333333333333"): ("two.example.test",),
        },
    )


async def test_adapter_enumerates_multiple_serving_targets_and_reports_per_target_cache_failure() -> None:
    sites = _sites()
    cache = _Cache(failing_hostnames=("two.example.test",))
    adapter = _adapter(sites=sites, cache=cache)

    targets = await adapter.list_current_serving_targets(workspace_id=uuid4())
    gate_results = await adapter.apply_visitor_delivery_gate(
        workspace_id=uuid4(),
        gate=HostingVisitorDeliveryGate.CONTINUITY,
        targets=targets,
    )
    cache_results = await adapter.invalidate_delivery_cache(workspace_id=uuid4(), targets=targets)

    assert [result.target for result in gate_results] == list(targets)
    assert all(result.succeeded for result in gate_results)
    assert [result.succeeded for result in cache_results] == [True, False]
    assert cache_results[1].failure_code == "HOSTING_DELIVERY_CACHE_INVALIDATION_FAILED"
    assert cache.invalidated == [("one.example.test",), ("two.example.test",)]


async def test_adapter_starts_and_verifies_restoration_per_target_without_republishing() -> None:
    sites = _sites()
    adapter = _adapter(sites=sites, cache=_Cache())
    workspace_id = uuid4()
    targets = await adapter.list_current_serving_targets(workspace_id=workspace_id)

    started = await adapter.start_restoration(
        workspace_id=workspace_id,
        source_identity="commerce:payment-recovered",
        targets=targets,
    )
    verified = await adapter.verify_restoration(
        workspace_id=workspace_id,
        targets=tuple(
            HostingRestorationTarget(target=result.target, operation_identity=str(result.operation_identity))
            for result in started
        ),
    )

    assert all(result.succeeded for result in started)
    assert len({result.operation_identity for result in started}) == 2
    assert all(result.succeeded for result in verified)
    assert verified[0].verification_evidence == f"sites:production-release:{targets[0].preserved_release_id}"
    assert verified[1].verification_evidence == "sites:production-release:prelaunch"


async def test_adapter_rejects_duplicate_target_identity_and_release_drift() -> None:
    sites = _sites()
    adapter = _adapter(sites=sites, cache=_Cache())
    workspace_id = uuid4()
    targets = await adapter.list_current_serving_targets(workspace_id=workspace_id)

    with pytest.raises(Conflict, match="HOSTING_DELIVERY_TARGET_DUPLICATE"):
        await adapter.apply_visitor_delivery_gate(
            workspace_id=workspace_id,
            gate=HostingVisitorDeliveryGate.SUSPENDED,
            targets=(targets[0], targets[0]),
        )

    sites._releases[targets[0].site_id] = uuid4()
    with pytest.raises(Conflict, match="HOSTING_DELIVERY_TARGET_RELEASE_DRIFT"):
        await adapter.apply_visitor_delivery_gate(
            workspace_id=workspace_id,
            gate=HostingVisitorDeliveryGate.SUSPENDED,
            targets=targets,
        )


async def _workspace() -> Workspace:
    organization = await Organization.create(
        slug=f"hosting-sites-{uuid4().hex}",
        name="Hosting Sites",
        owner_user_id=None,
        is_active=True,
    )
    return await Workspace.create(
        organization_id=organization.id,
        name="Hosting Sites",
        owner_user_id=uuid4(),
        created_by_user_id=uuid4(),
        is_active=True,
    )


@pytest.mark.usefixtures("db")
async def test_public_gate_uses_the_workspace_target_gate_not_the_workspace_wide_projection() -> None:
    workspace = await _workspace()
    projection = await HostingCommercialAccessProjection.create(
        workspace_id=workspace.id,
        state=HostingCommercialAccessState.PARTIAL,
        source_identity="hosting:partial",
    )
    suspended_site_id = uuid4()
    suspended_runtime_id = uuid4()
    await HostingContinuityTarget.create(
        projection_id=projection.id,
        site_id=suspended_site_id,
        runtime_id=suspended_runtime_id,
        gate=HostingContinuityTargetGate.SUSPENDED,
    )
    await HostingContinuityTarget.create(
        projection_id=projection.id,
        site_id=uuid4(),
        runtime_id=uuid4(),
        gate=HostingContinuityTargetGate.CONTINUITY,
    )

    assert await is_target_delivery_suspended(
        workspace_id=workspace.id,
        site_id=suspended_site_id,
        runtime_id=suspended_runtime_id,
    )
    assert not await is_target_delivery_suspended(
        workspace_id=workspace.id,
        site_id=uuid4(),
        runtime_id=uuid4(),
    )
