from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.sites.content_api import entries_router
from src.modules.sites.content_api.entries_router import ContentDeliveryServiceBinding
from src.modules.sites.graphql.service import SiteGraphQLService


class _TestContentDeliveryServiceBinding(ContentDeliveryServiceBinding):
    def __init__(self, environment_id: UUID) -> None:
        self.environment_id = environment_id

    async def _resolve_environment_id(self, **kwargs) -> UUID:
        return self.environment_id


@pytest.mark.asyncio
async def test_content_delivery_binding_uses_locale_fallback_chain(monkeypatch) -> None:
    runtime_id = uuid4()
    environment_id = uuid4()
    runtime_context = SimpleNamespace(
        runtime_id=runtime_id,
        project_id=uuid4(),
        site_id=uuid4(),
        tenant_context=SimpleNamespace(),
    )
    query_service = SimpleNamespace(
        get_locale_fallback_chain=AsyncMock(return_value=["fr-FR", "en-US", None]),
    )
    calls: list[str | None] = []
    expected_record = SimpleNamespace(locale="en-US")

    async def fake_list_records_in_tenant(**kwargs):
        calls.append(kwargs["locale"])
        return [expected_record] if kwargs["locale"] == "en-US" else []

    binding = _TestContentDeliveryServiceBinding(environment_id=environment_id)
    monkeypatch.setattr(entries_router, "_list_records_in_tenant", fake_list_records_in_tenant)

    records = await binding.list_records(
        runtime_context=cast(ProjectRuntimeContext, runtime_context),
        query_service=cast(SiteGraphQLService, query_service),
        model_key="article",
        perspective="published",
        environment=None,
        environment_id=None,
        locale="fr-FR",
        exact_filters={},
        contains_filters={},
        sort_field=None,
        sort_direction="asc",
    )

    query_service.get_locale_fallback_chain.assert_awaited_once_with(
        runtime_id=runtime_id,
        requested_locale="fr-FR",
    )
    assert calls == ["fr-FR", "en-US"]
    assert records == [expected_record]
