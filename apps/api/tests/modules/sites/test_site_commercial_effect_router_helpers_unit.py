from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.modules.commerce.dunning.command_policy import RestrictedRecoveryCommandPolicy
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.sites.http.router_helpers import (
    require_preview_site_commercial_effect,
    require_site_commercial_effect,
)
from src.modules.sites.service import SiteService


class _Policy:
    def __init__(self, calls: list[tuple[str, object]]) -> None:
        self.calls = calls

    async def authorize(self, *, workspace_id: UUID, effects: set[RestrictedRecoveryEffect]) -> None:
        self.calls.append(("authorize", (workspace_id, effects)))


class _SiteService:
    def __init__(self, *, workspace_id: UUID, calls: list[tuple[str, object]]) -> None:
        self.workspace_id = workspace_id
        self.calls = calls

    async def get_site_by_id(self, *, site_id: UUID):  # type: ignore[no-untyped-def]
        self.calls.append(("resolve", site_id))
        return SimpleNamespace(workspace_id=self.workspace_id)

    async def assert_preview_access_async(
        self,
        *,
        site_id: UUID,
        mode: str,
        token: str | None,
    ) -> None:
        self.calls.append(("preview", (site_id, mode, token)))


@pytest.mark.asyncio
async def test_site_effect_resolves_workspace_before_authorizing() -> None:
    calls: list[tuple[str, object]] = []
    workspace_id = uuid4()
    site_id = uuid4()
    dependency = cast(Any, require_site_commercial_effect(RestrictedRecoveryEffect.ACCESS_EXPANSION).dependency)

    await dependency(
        site_id=site_id,
        service=cast(SiteService, _SiteService(workspace_id=workspace_id, calls=calls)),
        policy=cast(RestrictedRecoveryCommandPolicy, _Policy(calls)),
    )

    assert calls == [
        ("resolve", site_id),
        ("authorize", (workspace_id, {RestrictedRecoveryEffect.ACCESS_EXPANSION})),
    ]


@pytest.mark.asyncio
async def test_preview_site_effect_validates_token_before_commercial_authorization() -> None:
    calls: list[tuple[str, object]] = []
    workspace_id = uuid4()
    site_id = uuid4()
    service = _SiteService(workspace_id=workspace_id, calls=calls)
    dependency = cast(Any, require_preview_site_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION).dependency)

    await dependency(
        site_id=site_id,
        token="preview-token",
        service=cast(Any, service),
        policy=cast(Any, _Policy(calls)),
    )

    assert calls == [
        ("preview", (site_id, "preview", "preview-token")),
        ("resolve", site_id),
        ("authorize", (workspace_id, {RestrictedRecoveryEffect.CONTENT_MUTATION})),
    ]
