# Content Delivery API

## Scenario: Runtime Content Delivery Routes

### 1. Scope / Trigger

- Trigger: adding or changing runtime content-facing routes under `/content-api/v1`.
- Applies to REST entries, GraphQL delivery, site resolution, sitemap delivery, and future generated delivery routes.
- Product Application routes remain under `/api/v1`; delivery routes use Content API credentials and runtime tenant context.

### 2. Signatures

- REST list entries: `GET /content-api/v1/runtimes/{runtime_id}/content/{model_key}`
- REST read entry: `GET /content-api/v1/runtimes/{runtime_id}/content/{model_key}/{entry_id}`
- GraphQL delivery: `POST /content-api/v1/runtimes/{runtime_id}/graphql`
- Runtime lookup dependency: `get_runtime_context(runtime_id) -> ProjectRuntimeContext`
- Tenant DB binding: `TenantDatabaseRouter(runtime_context.tenant_context).connection()`

### 3. Contracts

- Runtime selection uses the public `runtime_id` path parameter.
- Model selection uses a stable content model `model_key`.
- Published reads may be public when the route contract allows public delivery.
- Supplied Content API credentials must be validated by Content API auth, even for published reads.
- Preview reads require a preview delivery key with the required action or a valid preview token.
- Content API credentials are accepted from `x-api-key` or `Authorization: Bearer <delivery-key>`.
- Product Application session tokens do not grant Content API access.
- Delivery reads that access runtime content records must execute inside the runtime tenant DB connection.
- REST and GraphQL delivery routes must share the Content API read limiter.

### 4. Validation & Error Matrix

- Missing preview credential on preview read -> `PREVIEW_TOKEN_REQUIRED`.
- Invalid Content API credential -> `API_KEY_INVALID`.
- Delivery key missing the required delivery scope -> `DELIVERY_SCOPE_REQUIRED`.
- Invalid filter pair on REST entries -> `CONTENT_API_FILTER_PAIR_REQUIRED`.
- Read limiter exceeded -> HTTP 429 with `CONTENT_API_RATE_LIMITED`.
- Missing entry -> `CONTENT_ENTRY_NOT_FOUND`.

### 5. Good/Base/Bad Cases

- Good: published REST entry read with a published delivery key returns the published revision.
- Good: preview REST entry read with a preview delivery key returns the draft revision.
- Good: GraphQL delivery reads published graph data through runtime tenant DB routing.
- Base: published REST entry list without a credential returns public published content.
- Bad: Product Application bearer token sent to Content API returns `API_KEY_INVALID`.
- Bad: GraphQL delivery route skips the shared Content API limiter.
- Bad: delivery service reads runtime content through the default connection and misses tenant records.

### 6. Tests Required

- Integration test for published REST entry list and single-entry read.
- Integration test for preview read through preview token and preview delivery key.
- Integration test for Product Application bearer rejection and scope failure.
- Integration test for REST entry read limiter returning `CONTENT_API_RATE_LIMITED`.
- Integration test for GraphQL delivery limiter returning `CONTENT_API_RATE_LIMITED`.
- Regression coverage for tenant DB routing through GraphQL delivery published reads.

### 7. Wrong vs Correct

#### Wrong

```python
return SiteGraphQLContext(
    runtime_id=runtime_id,
    request=request,
    settings=settings,
    valkey=valkey,
)
```

This builds delivery services on the default database connection, so published graph records stored in the runtime tenant schema can be missed.

#### Correct

```python
service = SiteGraphQLService(settings, valkey=valkey)
async with TenantDatabaseRouter(runtime_context.tenant_context).connection() as conn:
    yield SiteGraphQLContext(
        runtime_id=runtime_id,
        request=request,
        settings=settings,
        valkey=valkey,
        graphql=service.with_database_connection(conn),
    )
```

This keeps the resolver execution inside the runtime tenant connection and preserves the Content API boundary.
