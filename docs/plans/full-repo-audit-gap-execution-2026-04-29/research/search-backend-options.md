# F04 Search Backend Research

## Decision

Arclayer will integrate Meilisearch as the first content search backend.

## Repo Evidence

- `docker-compose.yml` already declares `meilisearch` on port `7700`.
- `docker/postgres/initdb/001_pgvector.sql` enables the Postgres `vector` extension, but the application has no embedding storage or vector query path.
- `apps/api/pyproject.toml` already includes `httpx`, so the backend can use Meilisearch's HTTP API without adding a Python dependency.
- Published Content API reads are owned by `/content-api/v1` and currently shape delivery-safe entries through `SiteGraphQLService` and `ContentApiEntryOut`.

## Options

| Backend | Fit | Notes |
|---|---|---|
| Meilisearch | Selected | Existing dev service, simple HTTP API, per-index settings for searchable/filterable/sortable fields, and operationally small enough for self-hosted Arclayer deployments. |
| Postgres full-text search | Deferred | Avoids another service, but would add query/index complexity to tenant databases and diverge from the existing Meilisearch service choice. |
| pgvector | Deferred | Useful for future semantic/vector search. Current repo has only the extension bootstrap and no embedding pipeline. |
| Elasticsearch/OpenSearch | Deferred | Strong operational model for large clusters, but materially heavier than the existing infrastructure. |
| Algolia | Deferred | Managed product fit is good, but it makes self-hosted deployments depend on an external SaaS. |
| Typesense | Deferred | Similar role to Meilisearch, but no existing service or repo convention currently points at it. |

## External References

- Meilisearch stores searchable data in indexes and supports adding documents plus search through its API: https://www.meilisearch.com/docs/getting_started/first_project
- Meilisearch index settings expose `searchableAttributes`, `filterableAttributes`, and `sortableAttributes`: https://www.meilisearch.com/docs/reference/api/settings
- Meilisearch search supports POST query parameters and filters: https://www.meilisearch.com/docs/reference/api/search
- Meilisearch documents API covers indexed document operations: https://www.meilisearch.com/docs/reference/api/documents

## Implementation Contract

- Search is explicit: disabled deployments raise `SEARCH_DISABLED` for search/index operations.
- The backend boundary is `ContentSearchBackend`; Meilisearch is the production adapter and the in-memory adapter is a configured test backend.
- Indexes are scoped by site and content model. Locale remains a filterable field so a single model index can remove stale documents by item id.
- Indexed documents are built from delivery-shaped `StructuredContentRecord` payloads, so password fields and `omitFromApiResponse` fields are excluded before indexing.
- Content API search uses `/content-api/v1/runtimes/{runtime_id}/search?q=...&modelKey=...`.
- Release publish/rollback reindexes the active delivery graph. Content publish/unpublish/delete routes call explicit search index operations when search is enabled.
