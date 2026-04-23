from __future__ import annotations

import json
import math
import time
from collections.abc import Awaitable, Callable

import pytest

from src.config import get_settings
from src.settings.crypto import ensure_master_key
from tests.modules.sites.test_sites_canonical_content_runtime_integration import (
    _create_page_item,
    _publish_article_version,
    _upsert_route_binding,
    _workspace_client,
)
from tests.modules.sites.test_sites_delivery_integration import _publish_release
from tests.modules.sites.test_sites_graphql_integration import (
    _article_draft_payload,
    _create_article_item,
    _graphql,
    _publish_page_template,
)
from tests.modules.workspaces.content.test_content_items_integration import (
    _create_content_model,
    _create_page_model,
)

pytestmark = pytest.mark.integration

_WARMUP_REQUESTS = 5
_MEASURED_REQUESTS = 20


def _p95(samples: list[float]) -> float:
    ordered = sorted(samples)
    index = max(0, math.ceil(len(ordered) * 0.95) - 1)
    return ordered[index]


def _metrics(samples: list[float]) -> dict[str, float]:
    return {
        "count": float(len(samples)),
        "mean_ms": round(sum(samples) / len(samples), 2),
        "min_ms": round(min(samples), 2),
        "p95_ms": round(_p95(samples), 2),
        "max_ms": round(max(samples), 2),
    }


async def _measure_latency_ms(
    request_factory: Callable[[], Awaitable],
    *,
    expected_status: int = 200,
    warmup_requests: int = _WARMUP_REQUESTS,
    measured_requests: int = _MEASURED_REQUESTS,
) -> list[float]:
    for _ in range(warmup_requests):
        response = await request_factory()
        assert response.status_code == expected_status, response.text

    samples: list[float] = []
    for _ in range(measured_requests):
        started = time.perf_counter()
        response = await request_factory()
        elapsed_ms = (time.perf_counter() - started) * 1000
        assert response.status_code == expected_status, response.text
        samples.append(elapsed_ms)
    return samples


async def _site_id(client, project_id: str) -> str:
    site_res = await client.get(f"/api/v1/projects/{project_id}/site")
    assert site_res.status_code == 200, site_res.text
    return site_res.json()["data"]["siteId"]


async def _runtime_id(client, project_id: str) -> str:
    project_res = await client.get(f"/api/v1/projects/{project_id}")
    assert project_res.status_code == 200, project_res.text
    return project_res.json()["data"]["primaryRuntime"]["id"]


async def _graphql_benchmark_request(
    client,
    site_id: str,
    *,
    query: str,
    variables: dict,
    headers: dict | None = None,
):
    response = await _graphql(client, site_id, query=query, variables=variables, headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "errors" not in payload, payload
    assert payload["data"]["resolvePage"]["context"]["primary"]["title"] == "Benchmark Article"
    return response


@pytest.mark.asyncio
async def test_headless_cms_benchmark_baselines(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_content_model(
            client,
            project_id,
            key="article",
            name="Article",
            category="content_library",
            fields=[{"key": "rating", "label": "Rating", "scalar": "number", "required": False}],
            capabilities=["publishable", "rich_text_editable"],
            defaultRole="article",
            defaultPosture="structured",
            defaultSurface="writing",
        )

        page_item_id = await _create_page_item(client, project_id, title="Benchmark Template")
        article_item_id = await _create_article_item(client, project_id, title="Benchmark Article")

        await _publish_page_template(
            client,
            project_id,
            item_id=page_item_id,
            title="Benchmark Template",
            path="/benchmark/:slug",
        )
        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_item_id}/versions/draft",
            json=_article_draft_payload(expected_version=0, title="Benchmark Article", slug="world", rating=8),
        )
        assert draft_res.status_code == 201, draft_res.text
        await _publish_article_version(client, project_id, item_id=article_item_id, version=1)

        await _upsert_route_binding(
            client,
            project_id,
            item_id=page_item_id,
            path="/benchmark/:slug",
            route_mode="dynamic",
            primary_source={"modelKey": "article", "fieldKey": "slug", "paramName": "slug"},
        )
        await _publish_release(client, project_id)

        site_id = await _site_id(client, project_id)
        runtime_id = await _runtime_id(client, project_id)
        delivery_key_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Published GraphQL Benchmark",
                "scopes": ["graphql.read"],
                "deliveryPerspective": "published",
            },
        )
        assert delivery_key_res.status_code == 200, delivery_key_res.text
        delivery_key = delivery_key_res.json()["data"]["secretToken"]

        graphql_query = """
        query BenchmarkPage($path: String!, $perspective: DeliveryPerspective!) {
          resolvePage(path: $path, perspective: $perspective) {
            context {
              primary {
                title
                slug
              }
            }
            document {
              sections {
                componentKey
                props
              }
            }
          }
        }
        """
        graphql_variables = {
            "path": "/benchmark/world",
            "perspective": "PUBLISHED",
        }

        page_samples = await _measure_latency_ms(
            lambda: client.get(
                f"/api/v1/runtimes/{runtime_id}/delivery/pages/resolve",
                params={"path": "/benchmark/world", "perspective": "published"},
            )
        )
        graphql_public_samples = await _measure_latency_ms(
            lambda: _graphql_benchmark_request(
                client,
                site_id,
                query=graphql_query,
                variables=graphql_variables,
            )
        )
        graphql_key_samples = await _measure_latency_ms(
            lambda: _graphql_benchmark_request(
                client,
                site_id,
                query=graphql_query,
                variables=graphql_variables,
                headers={"x-api-key": delivery_key},
            )
        )

        page_metrics = _metrics(page_samples)
        graphql_public_metrics = _metrics(graphql_public_samples)
        graphql_key_metrics = _metrics(graphql_key_samples)
        auth_overhead_p95_ms = round(
            graphql_key_metrics["p95_ms"] - graphql_public_metrics["p95_ms"],
            2,
        )
        results = {
            "auth_overhead_p95_ms": auth_overhead_p95_ms,
            "graphql_public": graphql_public_metrics,
            "graphql_with_key": graphql_key_metrics,
            "pages_resolve": page_metrics,
            "requests_per_case": _MEASURED_REQUESTS,
            "warmup_requests": _WARMUP_REQUESTS,
        }
        print(f"HEADLESS_CMS_BENCHMARKS={json.dumps(results, sort_keys=True)}")

        assert page_metrics["p95_ms"] < 200
        assert graphql_public_metrics["p95_ms"] < 300
        assert auth_overhead_p95_ms < 20

    get_settings.cache_clear()
