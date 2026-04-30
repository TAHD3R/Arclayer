# API Generator

`src.core.api_generator` owns reusable primitives for model-driven HTTP route generation.

## Content API Extension Points

- `ContentApiRouteDefinition`: content type route metadata, including list/detail paths and allowed query fields.
- `ContentApiRoutePolicy`: route class, auth policy, and read action metadata for policy adapters.
- `ContentApiVisibilityPolicy`: response visibility metadata. Delivery routes must use response shapers that honor `omitFromApiResponse` and password-field hiding before data reaches the generated controller.
- `ContentApiServiceBinding`: service adapter for auth, tenant-bound content queries, and response shaping.
- `ContentApiGeneratedController`: shared list/detail controller flow for auth, service binding, locale filtering, pagination, cache headers, and envelope shaping.
- `create_generated_content_api_router`: FastAPI router factory that registers concrete per-content-type list/detail routes from metadata.

Generated routes must keep auth, visibility, query validation, and response shaping explicit through these extension points.
