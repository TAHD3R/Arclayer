# Images API

The Images API adds URL-driven transforms to existing asset delivery routes.

## Supported Routes

- Public assets: `GET /assets/{asset_id}/{filename}?w=800&h=600&fit=fill&fm=webp&q=80`
- Project assets: `GET /api/v1/projects/{project_id}/assets/{asset_id}/content?w=800&h=600&fit=fill&fm=webp&q=80`

Project asset transforms use the same `project:assets:read` permission as the original content stream. Public asset
transforms use the existing public asset lookup and only serve assets with public visibility.

## Query Parameters

| Parameter | Values | Notes |
|---|---|---|
| `w` | `1..4096` | Target width in pixels. At least one of `w` or `h` is required when a transform is requested. |
| `h` | `1..4096` | Target height in pixels. |
| `fit` | `scale`, `fill`, `pad` | `scale` preserves aspect ratio, `fill` crops to the requested box, `pad` preserves aspect ratio on a transparent canvas. |
| `fm` | `jpg`, `jpeg`, `png`, `webp` | `jpeg` is normalized to `jpg`. When omitted, output format follows the source image where possible. |
| `q` | `1..100` | Output quality for JPEG and WebP. Default is `85`. |

Requested `w * h` must stay at or below `16,777,216` pixels.

## Cache Behavior

Transformed files are written under local storage using a deterministic key derived from:

- source object key
- source version (`checksum_sha256`, or file mtime when checksum is unavailable)
- normalized transform parameters

Repeated requests for the same source version and transform parameters reuse the cached output. Responses include
`X-Image-Transform-Cache: miss` on first generation and `hit` on reuse.

## Delivery Behavior

Server-side transforms currently require local storage because the processor needs local file access and writes its cache
back to the same storage root. Remote object storage continues to serve the original asset through the existing direct or
presigned delivery paths.

Invalid transform requests fail with `ASSET_IMAGE_TRANSFORM_INVALID` or `ASSET_IMAGE_TRANSFORM_UNSUPPORTED`.
