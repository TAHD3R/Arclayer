# Search Integration

Status: Active implementation contract
Applies to: `apps/api/src/modules/sites/search`, Content API search, and index lifecycle subscribers

Arclayer content search is owned by the API backend under `apps/api/src/modules/sites/search`.

## Runtime Contract

- Content search is disabled by default. Enable it with `SEARCH__ENABLED=1`.
- The first production backend is Meilisearch: `SEARCH__BACKEND=meilisearch`.
- Test code may select the explicit in-memory backend with `SEARCH__BACKEND=memory`.
- Disabled search raises `SEARCH_DISABLED` for Content API search calls.
- Backend request failures raise `SEARCH_BACKEND_UNAVAILABLE`.

## Meilisearch Settings

Required runtime settings:

- `SEARCH__ENABLED=1`
- `SEARCH__BACKEND=meilisearch`
- `SEARCH__MEILISEARCH_URL=http://127.0.0.1:7700`
- `SEARCH__MEILISEARCH_API_KEY=<key>` when the Meilisearch deployment uses a master or API key

Optional settings:

- `SEARCH__INDEX_PREFIX=arclayer_content`
- `SEARCH__REQUEST_TIMEOUT_SECONDS=5`

## Index Shape

Search indexes are scoped by site and content model:

```text
{SEARCH__INDEX_PREFIX}_{site_id_hex}_{model_key}
```

Each document stores:

- runtime id
- site id
- content model key
- locale
- item id
- published revision metadata
- delivery-safe fields and custom fields
- route path and route contract when available

The indexed payload must come from delivery-shaped `StructuredContentRecord` values so password fields and fields marked `omitFromApiResponse` stay outside search.

## Content API Query

Published content search is exposed at:

```text
GET /content-api/v1/runtimes/{runtime_id}/search?modelKey=article&q=hello&locale=en-US
```

The route uses the same published Content API read authorization as generated entry routes. Public published reads may work without a delivery key; supplied delivery keys must pass the published read policy.

## Index Lifecycle

- Project release publish and rollback events reindex the active delivery graph.
- Content publish routes reindex the runtime when search is enabled.
- Content unpublish and delete routes remove the affected item ids when search is enabled.
- Lifecycle `after_delete` removes stale documents for deletes that flow through `EntityManager`.

Search indexing is explicit. Do not add query-time database fallback paths that make a missing or unhealthy search backend look successful.
